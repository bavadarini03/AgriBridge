/* ============================================================
   requests.js — Transport Requests Page
   Shows eligible requests, accept/reject, real-time updates
   ============================================================ */

let _reqsCurrentList = [];

Pages.requests = async function() {
  const el = document.getElementById('page-requests');
  if (!el) return;

  el.innerHTML = `
    <div>
      <div class="page-header">
        <div>
          <h1 class="page-title">Transport Requests</h1>
          <p class="page-subtitle" id="req-subtitle">Loading…</p>
        </div>
        <button class="btn btn-secondary" onclick="Pages.requests()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/><path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/></svg>
          Refresh
        </button>
      </div>

      <div id="req-status-banner" style="display:none;" class="info-banner"></div>
      <div id="req-list"></div>
    </div>
  `;

  // Check driver availability
  if (AppState.driver?.status === 'offline') {
    document.getElementById('req-status-banner').style.display = 'block';
    document.getElementById('req-status-banner').innerHTML = `
      <span>⚫ You are currently <strong>Offline</strong>. Go Available to receive requests.</span>
      <button class="btn btn-primary btn-sm ml-2" onclick="setAvailability('available')">Go Available</button>
    `;
  } else if (AppState.driver?.status === 'busy') {
    document.getElementById('req-status-banner').style.display = 'block';
    document.getElementById('req-status-banner').innerHTML = `
      <span>🟡 You have an active delivery. Complete it before accepting new requests.</span>
    `;
  }

  await loadRequests();

  // Listen for new requests via socket
  SocketManager.off('requests-page');
  SocketManager.on('transport:new_request', (data) => {
    if (AppState.currentPage === 'requests') {
      _reqsCurrentList.unshift(data.request);
      renderRequestsList();
      Toast.show('New delivery request received!', 'info');
    }
  }, 'requests-page');

  SocketManager.on('transport:request_cancelled', (data) => {
    if (AppState.currentPage === 'requests') {
      _reqsCurrentList = _reqsCurrentList.filter(r => r.id !== data.requestId);
      renderRequestsList();
    }
  }, 'requests-page');
};

async function loadRequests() {
  const list = document.getElementById('req-list');
  if (!list) return;
  list.innerHTML = `<div class="loading-area">${renderSkeleton(4)}</div>`;

  try {
    const data = await API.requests.list();
    _reqsCurrentList = data.requests || [];
    renderRequestsList();
  } catch (err) {
    list.innerHTML = `<div class="error-state">
      <p>Failed to load requests: ${escapeHtml(err.message)}</p>
      <button class="btn btn-secondary mt-2" onclick="loadRequests()">Retry</button>
    </div>`;
  }
}

function renderRequestsList() {
  const list = document.getElementById('req-list');
  const subtitle = document.getElementById('req-subtitle');
  if (!list) return;

  if (subtitle) {
    subtitle.textContent = _reqsCurrentList.length > 0
      ? `${_reqsCurrentList.length} request${_reqsCurrentList.length !== 1 ? 's' : ''} eligible for your vehicle`
      : 'No requests available';
  }

  if (_reqsCurrentList.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3 class="empty-title">No Requests Available</h3>
        <p class="empty-message">New transport requests matching your vehicle capacity will appear here in real time.</p>
      </div>`;
    return;
  }

  list.innerHTML = _reqsCurrentList.map(req => renderRequestCard(req)).join('');
}

function renderRequestCard(req) {
  const crop = CROP_EMOJI[req.crop] || '🌿';
  const reqId = (req.id || '').slice(-8).toUpperCase();
  const earnings = fmtCurrency(req.estimated_cost || req.estimatedCost || 0);
  const distKm = req.estimated_distance_km || req.estimatedDistanceKm || '—';
  const travelMin = req.estimated_travel_time_min || req.estimatedTravelTimeMin || null;
  const driverDist = req.driverDistanceKm ? `${parseFloat(req.driverDistanceKm).toFixed(1)} km from you` : '';

  return `
    <div class="request-card" id="req-${req.id}">
      <div class="request-card-header">
        <div class="request-id">REQ-${reqId}</div>
        <div class="request-meta">
          <span class="text-muted text-sm">${timeAgo(req.created_at)}</span>
          ${driverDist ? `<span class="text-muted text-sm ml-2">📍 ${escapeHtml(driverDist)}</span>` : ''}
        </div>
      </div>

      <div class="request-card-body">
        <div class="request-main-info">
          <div class="request-crop-title">${crop} ${escapeHtml(req.crop)}</div>
          <div class="request-earnings-badge">${earnings}</div>
        </div>

        <div class="request-details-grid">
          <div class="request-detail">
            <span class="detail-label">Quantity</span>
            <span class="detail-value">⚖️ ${parseFloat(req.quantity_kg || 0)} kg</span>
          </div>
          <div class="request-detail">
            <span class="detail-label">Distance</span>
            <span class="detail-value">📏 ${distKm} km</span>
          </div>
          <div class="request-detail">
            <span class="detail-label">Est. Travel Time</span>
            <span class="detail-value">⏱️ ${travelMin ? `${travelMin} min` : '—'}</span>
          </div>
          <div class="request-detail">
            <span class="detail-label">Requester</span>
            <span class="detail-value">👤 ${escapeHtml(req.requester_name || req.requesterName || 'Farmer')}</span>
          </div>
          <div class="request-detail">
            <span class="detail-label">Vehicle Needed</span>
            <span class="detail-value">🚛 ≥ ${req.quantity_kg} kg capacity</span>
          </div>
        </div>

        <div class="request-route">
          <div class="route-point route-pickup">
            <div class="route-dot route-dot-green"></div>
            <div class="route-text">
              <div class="route-label">Pickup</div>
              <div class="route-address">${escapeHtml(req.pickup_address || req.pickupAddress || '—')}</div>
            </div>
          </div>
          <div class="route-line"></div>
          <div class="route-point route-destination">
            <div class="route-dot route-dot-red"></div>
            <div class="route-text">
              <div class="route-label">Destination</div>
              <div class="route-address">${escapeHtml(req.destination_address || req.destinationAddress || '—')}</div>
            </div>
          </div>
        </div>

        ${req.notes ? `<div class="request-notes">📝 ${escapeHtml(req.notes)}</div>` : ''}
      </div>

      <div class="request-actions">
        <button class="btn btn-primary" id="accept-btn-${req.id}" onclick="acceptRequest('${req.id}')">
          ✓ Accept
        </button>
        <button class="btn btn-ghost btn-danger" id="reject-btn-${req.id}" onclick="rejectRequest('${req.id}')">
          ✕ Reject
        </button>
      </div>
    </div>
  `;
}

/* ---- Accept request ---- */
window.acceptRequest = async function(requestId) {
  const btn = document.getElementById(`accept-btn-${requestId}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Accepting…'; }

  try {
    const data = await API.requests.accept(requestId);
    Toast.show('✅ Request accepted! Delivery started.', 'success', 5000);

    // Remove from list
    _reqsCurrentList = _reqsCurrentList.filter(r => r.id !== requestId);

    // Update driver status
    if (AppState.driver) AppState.driver.status = 'busy';
    updateAvailabilityUI('busy');

    // Start location sharing
    if (data.delivery?.id) {
      AppState.activeDeliveryId = data.delivery.id;
      startLocationSharing(data.delivery.id);
    }

    // Navigate to active delivery
    setTimeout(() => navigateTo('active'), 800);
  } catch (err) {
    Toast.show(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Accept'; }
  }
};

/* ---- Reject request ---- */
window.rejectRequest = async function(requestId) {
  const btn = document.getElementById(`reject-btn-${requestId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }

  try {
    await API.requests.reject(requestId);
    _reqsCurrentList = _reqsCurrentList.filter(r => r.id !== requestId);
    renderRequestsList();
    Toast.show('Request rejected.', 'info');
  } catch (err) {
    Toast.show(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✕ Reject'; }
  }
};
