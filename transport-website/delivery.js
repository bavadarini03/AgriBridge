/* ============================================================
   delivery.js — Active Delivery Page
   Shows delivery lifecycle, status timeline, status update buttons
   ============================================================ */

const DELIVERY_STATUSES = [
  { key: 'driver_assigned',     label: 'Assigned',    icon: '✓', desc: 'You have been assigned to this delivery' },
  { key: 'reached_pickup',      label: 'At Pickup',   icon: '📍', desc: 'You have arrived at the pickup location' },
  { key: 'picked_up',           label: 'Picked Up',   icon: '📦', desc: 'Goods have been loaded onto your vehicle' },
  { key: 'in_transit',          label: 'In Transit',  icon: '🚛', desc: 'You are on the way to the destination' },
  { key: 'reached_destination', label: 'Arrived',     icon: '📍', desc: 'You have arrived at the destination' },
  { key: 'delivered',           label: 'Delivered',   icon: '✅', desc: 'Goods successfully handed over' }
];

const NEXT_STATUS = {
  driver_assigned:     { status: 'reached_pickup',      label: '📍 I\'ve Reached Pickup', style: 'btn-warning' },
  reached_pickup:      { status: 'picked_up',           label: '📦 Goods Loaded', style: 'btn-primary' },
  picked_up:           { status: 'in_transit',          label: '🚛 Start Transit', style: 'btn-primary' },
  in_transit:          { status: 'reached_destination', label: '📍 I\'ve Arrived', style: 'btn-warning' },
  reached_destination: { status: 'delivered',           label: '✅ Mark as Delivered', style: 'btn-success' }
};

Pages.active = async function() {
  const el = document.getElementById('page-active');
  if (!el) return;

  el.innerHTML = `
    <div>
      <h1 class="page-title">Active Delivery</h1>
      <div id="active-content"><div class="loading-area">${renderSkeleton(5)}</div></div>
    </div>
  `;

  await loadActiveDelivery();

  // Listen for real-time status changes
  SocketManager.off('active-page');
  SocketManager.on('delivery:status_changed', (data) => {
    if (AppState.currentPage === 'active') loadActiveDelivery();
  }, 'active-page');
  SocketManager.on('delivery:completed', () => {
    if (AppState.currentPage === 'active') loadActiveDelivery();
  }, 'active-page');
};

async function loadActiveDelivery() {
  const content = document.getElementById('active-content');
  if (!content) return;

  try {
    const data = await API.deliveries.active();

    if (!data.delivery) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🚛</div>
          <h3 class="empty-title">No Active Delivery</h3>
          <p class="empty-message">Accept a transport request to start your next delivery.</p>
          <button class="btn btn-primary mt-2" onclick="navigateTo('requests')">Browse Requests</button>
        </div>`;
      stopLocationSharing();
      return;
    }

    const delivery = data.delivery;
    const req = delivery.transport_requests;
    AppState.activeDeliveryId = delivery.id;

    // Build status timeline
    const currentIdx = DELIVERY_STATUSES.findIndex(s => s.key === delivery.status);
    const timelineHTML = DELIVERY_STATUSES.map((step, idx) => {
      const isCompleted = idx < currentIdx;
      const isCurrent = idx === currentIdx;
      return `
        <div class="timeline-step ${isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}">
          <div class="timeline-icon">${isCompleted ? '✓' : step.icon}</div>
          <div class="timeline-content">
            <div class="timeline-label">${step.label}</div>
            <div class="timeline-desc">${isCurrent ? step.desc : ''}</div>
          </div>
        </div>
        ${idx < DELIVERY_STATUSES.length - 1 ? '<div class="timeline-connector ' + (isCompleted ? 'filled' : '') + '"></div>' : ''}
      `;
    }).join('');

    const nextAction = NEXT_STATUS[delivery.status];
    const isComplete = delivery.status === 'delivered' || delivery.status === 'cancelled';

    content.innerHTML = `
      <div class="delivery-grid">
        <!-- Left: Details -->
        <div>
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Delivery Details</h3>
                <span class="text-muted text-sm">ID: DEL-${delivery.id?.slice(-8).toUpperCase()}</span>
              </div>
              <span class="badge badge-${delivery.status}">${fmtStatus(delivery.status)}</span>
            </div>
            <div class="card-body">
              <div class="delivery-info-grid">
                <div class="info-item">
                  <span class="info-label">Crop</span>
                  <span class="info-value">${CROP_EMOJI[req?.crop] || '🌿'} ${escapeHtml(req?.crop || '—')}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Quantity</span>
                  <span class="info-value">⚖️ ${req?.quantity_kg || 0} kg</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Customer</span>
                  <span class="info-value">👤 ${escapeHtml(req?.requester_name || '—')}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Phone</span>
                  <span class="info-value">📞 ${escapeHtml(req?.requester_phone || 'Not provided')}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Distance</span>
                  <span class="info-value">📏 ${delivery.distance_km || req?.estimated_distance_km || '—'} km</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Earnings</span>
                  <span class="info-value earnings-green">💰 ${fmtCurrency(delivery.payment)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">ETA</span>
                  <span class="info-value">${delivery.eta ? fmtTime(delivery.eta) : '—'}</span>
                </div>
              </div>

              <div class="delivery-route-card">
                <div class="route-point">
                  <div class="route-dot route-dot-green"></div>
                  <div class="route-text">
                    <div class="route-label">Pickup Location</div>
                    <div class="route-address">${escapeHtml(req?.pickup_address || '—')}</div>
                  </div>
                </div>
                <div class="route-line"></div>
                <div class="route-point">
                  <div class="route-dot route-dot-red"></div>
                  <div class="route-text">
                    <div class="route-label">Destination</div>
                    <div class="route-address">${escapeHtml(req?.destination_address || '—')}</div>
                  </div>
                </div>
              </div>

              ${!isComplete && nextAction ? `
                <div class="delivery-action-area">
                  <button class="btn ${nextAction.style} btn-lg" onclick="updateDeliveryStatus('${delivery.id}', '${nextAction.status}')">
                    ${nextAction.label}
                  </button>
                  <button class="btn btn-secondary" onclick="navigateTo('tracking')">🗺️ View Map</button>
                </div>
              ` : delivery.status === 'delivered' ? `
                <div class="delivery-complete-banner">
                  <div class="complete-icon">🎉</div>
                  <h3>Delivery Completed!</h3>
                  <p>You earned <strong>${fmtCurrency(delivery.payment)}</strong> for this delivery.</p>
                  <button class="btn btn-primary mt-2" onclick="navigateTo('requests')">Find Next Request</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Right: Timeline -->
        <div>
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Delivery Progress</h3>
            </div>
            <div class="card-body">
              <div class="delivery-timeline">${timelineHTML}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Start location sharing if not already running
    if (['driver_assigned','reached_pickup','picked_up','in_transit','reached_destination'].includes(delivery.status)) {
      startLocationSharing(delivery.id);
      // Join socket room for this delivery
      SocketManager.joinDelivery(delivery.id);
    }

  } catch (err) {
    content.innerHTML = `
      <div class="error-state">
        <p>Failed to load delivery: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary mt-2" onclick="loadActiveDelivery()">Retry</button>
      </div>`;
  }
}

/* ---- Update delivery status ---- */
window.updateDeliveryStatus = async function(deliveryId, newStatus) {
  if (!confirm(`Update status to "${fmtStatus(newStatus)}"?`)) return;

  const btn = event.target.closest('button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Updating…'; }

  try {
    await API.deliveries.updateStatus(deliveryId, newStatus);
    Toast.show(`Status updated: ${fmtStatus(newStatus)}`, 'success');

    if (newStatus === 'delivered') {
      stopLocationSharing();
      AppState.activeDeliveryId = null;
      if (AppState.driver) AppState.driver.status = 'available';
      updateAvailabilityUI('available');
    }

    await loadActiveDelivery();
  } catch (err) {
    Toast.show(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
};
