/* ============================================================
   dashboard.js — Dashboard Home Page
   Shows stats, availability toggle, active delivery, quick actions
   ============================================================ */

Pages.dashboard = async function () {
  const el = document.getElementById('page-dashboard');
  if (!el) return;

  el.innerHTML = `
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle" id="dash-greeting">Good day, driver</p>
        </div>
      </div>

      <div class="stats-grid" id="dash-stats">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>

      <div class="dash-grid">
        <!-- Active Delivery -->
        <div class="card" id="dash-active-card">
          <div class="card-header">
            <h3 class="card-title">Active Delivery</h3>
            <a href="#" class="card-link" onclick="navigateTo('active')">View details →</a>
          </div>
          <div class="card-body" id="dash-active-body">
            <div class="loading-spinner"></div>
          </div>
        </div>

        <!-- Recent Requests -->
        <div class="card" id="dash-requests-card">
          <div class="card-header">
            <h3 class="card-title">Pending Requests</h3>
            <a href="#" class="card-link" onclick="navigateTo('requests')">View all →</a>
          </div>
          <div class="card-body" id="dash-requests-body">
            <div class="loading-spinner"></div>
          </div>
        </div>
      </div>

      <!-- Recent Earnings -->
      <div class="card" style="margin-top:1rem;">
        <div class="card-header">
          <h3 class="card-title">Recent Earnings</h3>
          <a href="#" class="card-link" onclick="navigateTo('earnings')">Full report →</a>
        </div>
        <div class="card-body" id="dash-earnings-body">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  `;

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting').textContent = `${greeting}, ${AppState.user?.name?.split(' ')[0] || 'Driver'}`;

  // Load all dashboard data in parallel
  try {
    const [earningsData, activeData, requestsData] = await Promise.all([
      API.drivers.earnings().catch(() => null),
      API.deliveries.active().catch(() => null),
      API.requests.list().catch(() => null)
    ]);

    renderDashStats(earningsData, activeData, requestsData);
    renderDashActive(activeData);
    renderDashRequests(requestsData);
    renderDashEarnings(earningsData);
  } catch (err) {
    Toast.show('Failed to load dashboard data', 'error');
  }
};

function renderDashStats(earningsData, activeData, requestsData) {
  const stats = document.getElementById('dash-stats');
  if (!stats) return;

  const today = earningsData?.today?.total || 0;
  const completed = earningsData?.allTime?.count || 0;
  const pending = requestsData?.requests?.length || 0;
  const rating = AppState.driver?.rating || 5.0;
  const status = AppState.driver?.status || 'offline';

  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-body">
        <div class="stat-info">
          <div class="stat-label">Today's Earnings</div>
          <div class="stat-value">${fmtCurrency(today)}</div>
          <div class="stat-change">Today</div>
        </div>
        <div class="stat-icon stat-icon-green">💰</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card-body">
        <div class="stat-info">
          <div class="stat-label">Completed Deliveries</div>
          <div class="stat-value">${completed}</div>
          <div class="stat-change">All time</div>
        </div>
        <div class="stat-icon stat-icon-blue">✅</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card-body">
        <div class="stat-info">
          <div class="stat-label">Pending Requests</div>
          <div class="stat-value">${pending}</div>
          <div class="stat-change">Eligible for you</div>
        </div>
        <div class="stat-icon stat-icon-amber">📦</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card-body">
        <div class="stat-info">
          <div class="stat-label">Driver Rating</div>
          <div class="stat-value">${parseFloat(rating).toFixed(1)} ⭐</div>
          <div class="stat-change">Driver</div>
        </div>
        <div class="stat-icon stat-icon-purple">🏆</div>
      </div>
    </div>
  `;
}

function renderDashActive(data) {
  const el = document.getElementById('dash-active-body');
  if (!el) return;

  if (!data?.delivery) {
    el.innerHTML = `
      <div class="empty-state-sm">
        <p>No active delivery</p>
        <p class="text-muted">Accept a request to start a delivery</p>
      </div>`;
    return;
  }

  const d = data.delivery;
  const req = d.transport_requests;
  el.innerHTML = `
    <div class="mini-delivery">
      <div class="mini-delivery-header">
        <span class="badge badge-${d.status}">${fmtStatus(d.status)}</span>
        <span class="text-muted text-sm">ID: ${d.id?.slice(-8).toUpperCase()}</span>
      </div>
      <div class="mini-delivery-info">
        <div><strong>${CROP_EMOJI[req?.crop] || '🌿'} ${escapeHtml(req?.crop || '—')}</strong> — ${req?.quantity_kg || 0} kg</div>
        <div class="text-muted text-sm mt-1">📍 ${escapeHtml(req?.pickup_address || '—')}</div>
        <div class="text-muted text-sm">🏁 ${escapeHtml(req?.destination_address || '—')}</div>
      </div>
      <div style="margin-top:0.75rem; display:flex; gap:0.5rem;">
        <button class="btn btn-primary btn-sm" onclick="navigateTo('active')">Manage Delivery</button>
        <button class="btn btn-secondary btn-sm" onclick="navigateTo('tracking')">🗺️ Track</button>
      </div>
    </div>
  `;

  // Start location sharing if active
  if (!AppState.locationInterval && d.id) {
    AppState.activeDeliveryId = d.id;
    if (['driver_assigned', 'reached_pickup', 'picked_up', 'in_transit', 'reached_destination'].includes(d.status)) {
      startLocationSharing(d.id);
    }
  }
}

function renderDashRequests(data) {
  const el = document.getElementById('dash-requests-body');
  if (!el) return;
  const reqs = (data?.requests || []).slice(0, 3);

  if (reqs.length === 0) {
    if (data?.reason === 'no_vehicle') {
      el.innerHTML = `<div class="empty-state-sm"><p class="text-muted">Please register a vehicle to receive transport requests.</p><button class="btn btn-sm btn-primary mt-1" onclick="navigateTo('vehicle')">Register Vehicle</button></div>`;
      return;
    }
    el.innerHTML = `<div class="empty-state-sm"><p class="text-muted">No pending requests</p></div>`;
    return;
  }

  el.innerHTML = reqs.map(r => `
    <div class="mini-request-row" onclick="navigateTo('requests')">
      <div>
        <strong>${CROP_EMOJI[r.crop] || '🌿'} ${escapeHtml(r.crop)}</strong> — ${r.quantity_kg} kg
        <span class="text-muted text-sm ml-1">${timeAgo(r.created_at)}</span>
      </div>
      <div class="text-muted text-sm">${escapeHtml(r.pickup_address?.substring(0, 40) || '—')}…</div>
      <div class="mini-request-earnings">${fmtCurrency(r.estimated_cost)}</div>
    </div>
  `).join('') + (data?.requests?.length > 3 ? `<div class="text-center mt-1"><a href="#" onclick="navigateTo('requests')">View all ${data.requests.length} requests</a></div>` : '');
}

function renderDashEarnings(data) {
  const el = document.getElementById('dash-earnings-body');
  if (!el) return;

  el.innerHTML = `
    <div class="earnings-row-grid">
      <div class="earnings-mini-card">
        <div class="earnings-mini-label">Today</div>
        <div class="earnings-mini-value">${fmtCurrency(data?.today?.total)}</div>
        <div class="earnings-mini-sub">${data?.today?.count || 0} deliveries</div>
      </div>
      <div class="earnings-mini-card">
        <div class="earnings-mini-label">This Week</div>
        <div class="earnings-mini-value">${fmtCurrency(data?.thisWeek?.total)}</div>
        <div class="earnings-mini-sub">${data?.thisWeek?.count || 0} deliveries</div>
      </div>
      <div class="earnings-mini-card">
        <div class="earnings-mini-label">This Month</div>
        <div class="earnings-mini-value">${fmtCurrency(data?.thisMonth?.total)}</div>
        <div class="earnings-mini-sub">${data?.thisMonth?.count || 0} deliveries</div>
      </div>
      <div class="earnings-mini-card earnings-total">
        <div class="earnings-mini-label">All Time</div>
        <div class="earnings-mini-value">${fmtCurrency(data?.allTime?.total)}</div>
        <div class="earnings-mini-sub">${data?.allTime?.count || 0} total</div>
      </div>
    </div>
  `;
}
