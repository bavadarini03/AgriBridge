/* ============================================================
   tracking.js — Live Tracking Map Page
   Shows driver location, pickup, destination, route, ETA
   Uses Leaflet + OpenStreetMap + OSRM
   ============================================================ */

let _trackMap = null;
let _trackDriverMarker = null;
let _trackPickupMarker = null;
let _trackDestMarker = null;
let _trackRouteLayer = null;
let _trackDelivery = null;

Pages.tracking = async function() {
  const el = document.getElementById('page-tracking');
  if (!el) return;

  // Cleanup previous map
  if (_trackMap) { _trackMap.remove(); _trackMap = null; }

  el.innerHTML = `
    <div>
      <div >
        <div>
          <h1 class="page-title">Live Tracking</h1>
          <p class="page-subtitle">Your real-time location and delivery route</p>
        </div>
        <div class="conn-status disconnected" id="tracking-conn-status">
          <span class="conn-dot"></span>
          <span class="conn-label">Connecting</span>
        </div>
      </div>

      <div id="location-error-banner" class="error-banner" style="display:none;">
        <div class="error-banner-content">
          <span>⚠️ <strong>Location access required.</strong> Please allow location access in your browser.</span>
          <button class="btn btn-secondary btn-sm ml-2" onclick="retryLocationPermission()">Retry</button>
        </div>
      </div>

      <div class="map-layout">
        <div class="map-card">
          <div id="delivery-map" style="height:420px;"></div>
          <div class="map-overlay" id="map-overlay">
            <div class="map-overlay-item">
              <span class="overlay-label">Distance</span>
              <span class="overlay-value" id="map-distance">—</span>
            </div>
            <div class="map-overlay-item">
              <span class="overlay-label">ETA</span>
              <span class="overlay-value" id="map-eta">—</span>
            </div>
            <div class="map-overlay-item">
              <span class="overlay-label">Last Updated</span>
              <span class="overlay-value" id="map-last-update">—</span>
            </div>
          </div>
        </div>

        <div class="tracking-sidebar" id="tracking-sidebar">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Delivery Info</h3></div>
            <div class="card-body" id="tracking-info">
              <div class="loading-spinner"></div>
            </div>
          </div>
          <div class="card mt-1">
            <div class="card-header"><h3 class="card-title">Location Status</h3></div>
            <div class="card-body">
              <div id="gps-status" class="gps-status">
                <div class="gps-dot inactive"></div>
                <span id="gps-label">Waiting for GPS…</span>
              </div>
              <div class="text-muted text-sm mt-1">Updates every 8 seconds during active delivery</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Init map centered on Tamil Nadu (fallback center)
  _trackMap = L.map('delivery-map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(_trackMap);
  _trackMap.setView([10.0, 78.5], 7);

  // Load delivery and set up map
  await loadTrackingData();

  // Listen for location updates
  SocketManager.off('tracking-page');
  SocketManager.on('delivery:location_updated', (data) => {
    if (!_trackDelivery || data.deliveryId !== _trackDelivery.id) return;
    updateDriverMarker(data.lat, data.lng);
    document.getElementById('map-last-update').textContent = 'Just now';
  }, 'tracking-page');

  // Listen for own GPS updates from app.js
  document.addEventListener('location:update', (e) => {
    const { lat, lng } = e.detail;
    updateDriverMarker(lat, lng);
    setGpsStatus('active', `Sharing live (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    document.getElementById('map-last-update').textContent = 'Just now';
  });

  document.addEventListener('location:error', (e) => {
    handleGpsError(e.detail);
  });

  // Update conn status indicator
  document.querySelector('#tracking-conn-status .conn-label').textContent =
    SocketManager.isConnected() ? 'Live' : 'Offline';
  document.getElementById('tracking-conn-status').className =
    `conn-status ${SocketManager.isConnected() ? 'connected' : 'disconnected'}`;
};

async function loadTrackingData() {
  const infoEl = document.getElementById('tracking-info');

  try {
    const data = await API.deliveries.active();

    if (!data.delivery) {
      infoEl.innerHTML = `<div class="text-muted">No active delivery. <br><a href="#" onclick="navigateTo('requests')">Browse requests</a></div>`;
      setGpsStatus('idle', 'No active delivery');
      // Show current location only
      getCurrentLocationAndCenter();
      return;
    }

    _trackDelivery = data.delivery;
    const req = data.delivery.transport_requests;

    // Render info panel
    infoEl.innerHTML = `
      <div class="tracking-delivery-info">
        <div class="info-row"><strong>${CROP_EMOJI[req?.crop] || '🌿'} ${escapeHtml(req?.crop || '—')}</strong></div>
        <div class="info-row text-muted text-sm">${req?.quantity_kg || 0} kg</div>
        <div class="info-row mt-1">
          <span class="badge badge-${data.delivery.status}">${fmtStatus(data.delivery.status)}</span>
        </div>
        <hr class="divider">
        <div class="info-row">
          <span class="info-label">Pickup</span>
          <div class="info-value text-sm">${escapeHtml(req?.pickup_address || '—')}</div>
        </div>
        <div class="info-row mt-1">
          <span class="info-label">Destination</span>
          <div class="info-value text-sm">${escapeHtml(req?.destination_address || '—')}</div>
        </div>
        <hr class="divider">
        <div class="info-row">
          <span class="info-label">Customer</span>
          <div class="info-value">${escapeHtml(req?.requester_name || '—')}</div>
        </div>
        <div class="info-row mt-1">
          <span class="info-label">Est. Earnings</span>
          <div class="info-value earnings-green">${fmtCurrency(data.delivery.payment)}</div>
        </div>
      </div>
    `;

    // Add map markers
    const pickup = [parseFloat(req.pickup_lat), parseFloat(req.pickup_lng)];
    const dest = [parseFloat(req.destination_lat), parseFloat(req.destination_lng)];

    _trackPickupMarker = L.marker(pickup, { icon: makeIcon('📦', '#16a34a') })
      .addTo(_trackMap)
      .bindPopup(`<b>📦 Pickup</b><br>${escapeHtml(req.pickup_address)}`);

    _trackDestMarker = L.marker(dest, { icon: makeIcon('🏁', '#dc2626') })
      .addTo(_trackMap)
      .bindPopup(`<b>🏁 Destination</b><br>${escapeHtml(req.destination_address)}`);

    // Draw route
    drawRoute(pickup, dest);

    // Join socket delivery room
    SocketManager.joinDelivery(data.delivery.id);

    // Get current GPS location and place driver marker
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        updateDriverMarker(lat, lng);
        setGpsStatus('active', 'Live tracking enabled');
        updateETA(lat, lng, dest[0], dest[1]);
      },
      (err) => handleGpsError(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );

  } catch (err) {
    if (infoEl) infoEl.innerHTML = `<div class="text-muted">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

async function drawRoute(pickup, dest) {
  const route = await getRoute(pickup[0], pickup[1], dest[0], dest[1]);

  if (_trackRouteLayer) { _trackMap.removeLayer(_trackRouteLayer); }

  if (route) {
    _trackRouteLayer = L.polyline(route.coordinates, {
      color: '#2563eb', weight: 4, opacity: 0.8
    }).addTo(_trackMap);

    _trackMap.fitBounds(_trackRouteLayer.getBounds(), { padding: [50, 50] });
    document.getElementById('map-distance').textContent = `${route.distanceKm} km`;
    const eta = new Date(Date.now() + route.durationMin * 60000);
    document.getElementById('map-eta').textContent = fmtTime(eta.toISOString());
  } else {
    // Fallback: straight line
    L.polyline([pickup, dest], { color: '#2563eb', weight: 3, dashArray: '8 4' }).addTo(_trackMap);
    _trackMap.fitBounds([pickup, dest], { padding: [50, 50] });
  }
}

function updateDriverMarker(lat, lng) {
  if (!_trackMap) return;
  if (!_trackDriverMarker) {
    _trackDriverMarker = L.marker([lat, lng], { icon: makeIcon('🚛', '#2563eb') })
      .addTo(_trackMap)
      .bindPopup('<b>🚛 Your Location</b>');
  } else {
    _trackDriverMarker.setLatLng([lat, lng]);
  }
}

async function updateETA(driverLat, driverLng, destLat, destLng) {
  const route = await getRoute(driverLat, driverLng, destLat, destLng);
  if (!route) return;
  const eta = new Date(Date.now() + route.durationMin * 60000);
  document.getElementById('map-distance').textContent = `${route.distanceKm} km remaining`;
  document.getElementById('map-eta').textContent = fmtTime(eta.toISOString());
}

function getCurrentLocationAndCenter() {
  navigator.geolocation?.getCurrentPosition(
    (pos) => {
      _trackMap.setView([pos.coords.latitude, pos.coords.longitude], 13);
      updateDriverMarker(pos.coords.latitude, pos.coords.longitude);
      setGpsStatus('active', 'Showing current location');
    },
    () => setGpsStatus('idle', 'GPS unavailable')
  );
}

function handleGpsError(err) {
  const banner = document.getElementById('location-error-banner');
  if (banner) banner.style.display = 'block';
  setGpsStatus('error', err.code === 1 ? 'Location permission denied' : 'GPS unavailable');
}

function setGpsStatus(state, label) {
  const dot = document.querySelector('.gps-dot');
  const lblEl = document.getElementById('gps-label');
  if (dot) dot.className = `gps-dot ${state}`;
  if (lblEl) lblEl.textContent = label;
}

window.retryLocationPermission = function() {
  document.getElementById('location-error-banner').style.display = 'none';
  setGpsStatus('idle', 'Requesting location…');
  navigator.geolocation?.getCurrentPosition(
    (pos) => {
      updateDriverMarker(pos.coords.latitude, pos.coords.longitude);
      setGpsStatus('active', 'GPS connected');
      startLocationSharing(AppState.activeDeliveryId);
    },
    (err) => handleGpsError(err),
    { enableHighAccuracy: true }
  );
};
