/* Notifications center page */

let _notifications = [];

Pages.notifications = async function() {
  const el = document.getElementById('page-notifications');
  if (!el) return;

  el.innerHTML = `
    <div >
      <div class="page-header">
        <div>
          <h1 class="page-title">Notifications</h1>
          <p class="page-subtitle">Real-time updates for requests, deliveries, and payments.</p>
        </div>
        <button class="btn btn-secondary" onclick="markAllNotificationsRead()">Mark all as read</button>
      </div>
      <div id="notifications-list">${renderSkeleton(5)}</div>
    </div>
  `;

  await loadNotifications();

  SocketManager.off('notifications-page');
  SocketManager.on('notification:new', () => {
    if (AppState.currentPage === 'notifications') {
      loadNotifications();
    }
  }, 'notifications-page');
};

async function loadNotifications() {
  const list = document.getElementById('notifications-list');
  if (!list) return;

  try {
    const data = await API.notifications.list({ limit: 100 });
    _notifications = data.notifications || [];
    AppState.notifCount = data.unreadCount || 0;
    updateNotifBadge();
    renderNotifications();
  } catch (err) {
    list.innerHTML = `<div class="error-state">Failed to load notifications: ${escapeHtml(err.message)}</div>`;
  }
}

function renderNotifications() {
  const list = document.getElementById('notifications-list');
  if (!list) return;

  if (_notifications.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔔</div>
        <h3 class="empty-title">No Notifications</h3>
        <p class="empty-message">You will see new request and delivery updates here.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = _notifications.map(n => `
    <article class="card notification-item ${n.is_read ? '' : 'is-unread'}">
      <div class="card-body">
        <div class="notification-row">
          <div>
            <h3 class="notification-title">${escapeHtml(n.title || 'Notification')}</h3>
            <p class="notification-msg">${escapeHtml(n.message || '')}</p>
            <p class="text-muted text-sm">${fmtDateTime(n.created_at)}</p>
          </div>
          ${n.is_read ? '<span class="badge badge-offline">Read</span>' : '<span class="badge badge-available">Unread</span>'}
        </div>
        ${n.is_read ? '' : `<button class="btn btn-secondary btn-sm" onclick="markNotificationRead('${n.id}')">Mark as read</button>`}
      </div>
    </article>
  `).join('');
}

window.markNotificationRead = async function(id) {
  try {
    await API.notifications.markRead(id);
    _notifications = _notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
    AppState.notifCount = Math.max(0, AppState.notifCount - 1);
    updateNotifBadge();
    renderNotifications();
  } catch (err) {
    Toast.show(err.message, 'error');
  }
};

window.markAllNotificationsRead = async function() {
  try {
    await API.notifications.markAllRead();
    _notifications = _notifications.map(n => ({ ...n, is_read: true }));
    AppState.notifCount = 0;
    updateNotifBadge();
    renderNotifications();
  } catch (err) {
    Toast.show(err.message, 'error');
  }
};
