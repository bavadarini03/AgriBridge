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

Pages.tracking = async function () {
  const el = document.getElementById('page-tracking');
  if (!el) return;

  // Cleanup previous map instance safely
  if (_trackMap) {
    try { _trackMap.remove(); } catch (_) { }
    _trackMap = null;
    _trackDriverMarker = null;
    _trackPickupMarker = null;
    _trackDestMarker = null;
    _trackRouteLayer = null;
  }

  el.innerHTML = `
    <div>
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div>
          <h1 class="page-title" style="margin:0;">Live Tracking</h1>
          <p class="page-subtitle" style="margin:4px 0 0 0;color:var(--text-secondary);">Your real-time location and delivery route</p>
        </div>
        <div class="conn-status disconnected" id="tracking-conn-status">
          <span class="conn-dot"></span>
          <span class="conn-label">Connecting</span>
        </div>
      </div>

      <div id="location-error-banner" class="error-banner" style="display:none;background:#fee2e2;border:1px solid #f87171;padding:12px;border-radius:8px;margin-bottom:16px;">
        <div class="error-banner-content" style="display:flex;align-items:center;justify-content:space-between;">
          <span>⚠️ <strong>Location access required.</strong> Please allow location access in your browser.</span>
          <button class="btn btn-secondary btn-sm ml-2" onclick="retryLocationPermission()">Retry</button>
        </div>
      </div>

      <div class="map-layout" style="display:grid;grid-template-columns:1fr 340px;gap:20px;">
        <div class="map-card" style="position:relative;background:#fff;border-radius:12px;padding:8px;box-shadow:var(--shadow-base);border:1px solid var(--border-color);">
          <div id="delivery-map" style="height:450px;width:100%;border-radius:8px;z-index:1;background:#e5e7eb;"></div>
          <div class="map-overlay" id="map-overlay" style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.92);backdrop-filter:blur(4px);padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:1000;display:flex;gap:16px;">
            <div class="map-overlay-item">
              <span class="overlay-label" style="font-size:11px;color:#666;display:block;text-transform:uppercase;">Distance</span>
              <span class="overlay-value" id="map-distance" style="font-weight:700;font-size:14px;color:#1e293b;">—</span>
            </div>
            <div class="map-overlay-item">
              <span class="overlay-label" style="font-size:11px;color:#666;display:block;text-transform:uppercase;">ETA</span>
              <span class="overlay-value" id="map-eta" style="font-weight:700;font-size:14px;color:#16a34a;">—</span>
            </div>
            <div class="map-overlay-item">
              <span class="overlay-label" style="font-size:11px;color:#666;display:block;text-transform:uppercase;">Last Updated</span>
              <span class="overlay-value" id="map-last-update" style="font-weight:700;font-size:14px;color:#2563eb;">—</span>
            </div>
          </div>
        </div>

        <div class="tracking-sidebar" id="tracking-sidebar">
          <div class="card" style="background:#fff;border-radius:12px;padding:20px;box-shadow:var(--shadow-base);border:1px solid var(--border-color);">
            <div class="card-header" style="margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;"><h3 class="card-title" style="margin:0;font-size:16px;">Delivery Info</h3></div>
            <div class="card-body" id="tracking-info">
              <div class="loading-spinner"></div>
            </div>
          </div>
          <div class="card mt-1" style="margin-top:16px;background:#fff;border-radius:12px;padding:20px;box-shadow:var(--shadow-base);border:1px solid var(--border-color);">
            <div class="card-header" style="margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;"><h3 class="card-title" style="margin:0;font-size:16px;">Location Status</h3></div>
            <div class="card-body">
              <div id="gps-status" class="gps-status" style="display:flex;align-items:center;gap:8px;">
                <div class="gps-dot inactive" style="width:10px;height:10px;border-radius:50%;background:#94a3b8;"></div>
                <span id="gps-label" style="font-weight:500;font-size:14px;">Waiting for GPS…</span>
              </div>
              <div class="text-muted text-sm mt-1" style="color:#64748b;font-size:12px;margin-top:8px;">Updates automatically during active delivery</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Init Leaflet map centered on Tamil Nadu (fallback center)
  _trackMap = L.map('delivery-map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(_trackMap);
  _trackMap.setView([10.0, 78.5], 7);

  // Invalidate Leaflet container size after mounting to prevent tile rendering issues
  setTimeout(() => {
    if (_trackMap) {
      _trackMap.invalidateSize();
    }
  }, 250);

  // Load delivery data and populate markers
  await loadTrackingData();

  // Listen for real-time driver location updates
  SocketManager.off('tracking-page');
  SocketManager.on('delivery:location_updated', (data) => {
    if (!_trackDelivery || data.deliveryId !== _trackDelivery.id) return;
    updateDriverMarker(data.lat, data.lng);
    const lastUpdateEl = document.getElementById('map-last-update');
    if (lastUpdateEl) lastUpdateEl.textContent = 'Just now';
  }, 'tracking-page');

  // Listen for driver browser geolocation updates
  document.addEventListener('location:update', (e) => {
    const { lat, lng } = e.detail;
    updateDriverMarker(lat, lng);
    setGpsStatus('active', `Sharing live (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    const lastUpdateEl = document.getElementById('map-last-update');
    if (lastUpdateEl) lastUpdateEl.textContent = 'Just now';
  });

  document.addEventListener('location:error', (e) => {
    handleGpsError(e.detail);
  });

  // Update connection status label
  const connLabel = document.querySelector('#tracking-conn-status .conn-label');
  if (connLabel) {
    connLabel.textContent = SocketManager.isConnected() ? 'Live' : 'Offline';
  }
  const connStatus = document.getElementById('tracking-conn-status');
  if (connStatus) {
    connStatus.className = `conn-status ${SocketManager.isConnected() ? 'connected' : 'disconnected'}`;
  }
};

async function loadTrackingData() {
  const infoEl = document.getElementById('tracking-info');

  try {
    const data = await API.deliveries.active();

    if (!data || !data.delivery) {
      if (infoEl) {
        infoEl.innerHTML = `
          <div class="text-muted" style="text-align:center;padding:20px 0;">
            <div style="font-size:32px;margin-bottom:8px;">🚚</div>
            <div>No active delivery.</div>
            <div style="margin-top:8px;"><button class="btn btn-sm btn-primary" onclick="navigateTo('requests')">Browse Requests</button></div>
          </div>`;
      }
      setGpsStatus('idle', 'No active delivery');
      getCurrentLocationAndCenter();
      return;
    }

    _trackDelivery = data.delivery;
    const req = data.delivery.transport_requests || {};

    // Render info panel
    if (infoEl) {
      infoEl.innerHTML = `
        <div class="tracking-delivery-info" style="line-height:1.6;">
          <div style="font-size:16px;font-weight:700;color:#1e293b;">${CROP_EMOJI[req.crop] || '🌿'} ${escapeHtml(req.crop || 'Delivery')}</div>
          <div style="color:#64748b;font-size:13px;margin-bottom:8px;">⚖️ ${req.quantity_kg || 0} kg</div>
          <div style="margin-bottom:12px;">
            <span class="badge badge-${data.delivery.status}" style="font-size:12px;padding:4px 8px;">${fmtStatus(data.delivery.status)}</span>
          </div>
          <div style="border-top:1px solid #f1f5f9;padding-top:10px;margin-top:10px;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Pickup Location</div>
            <div style="font-size:13px;font-weight:600;color:#334155;">📍 ${escapeHtml(req.pickup_address || '—')}</div>
          </div>
          <div style="margin-top:10px;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Destination</div>
            <div style="font-size:13px;font-weight:600;color:#334155;">🏁 ${escapeHtml(req.destination_address || '—')}</div>
          </div>
          <div style="border-top:1px solid #f1f5f9;padding-top:10px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Customer</div>
              <div style="font-size:13px;font-weight:600;">👤 ${escapeHtml(req.requester_name || '—')}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Est. Earnings</div>
              <div style="font-size:15px;font-weight:700;color:#16a34a;">${fmtCurrency(data.delivery.payment)}</div>
            </div>
          </div>
        </div>
      `;
    }

    // Extract valid lat/lng coordinates
    const pLat = parseFloat(req.pickup_lat);
    const pLng = parseFloat(req.pickup_lng);
    const dLat = parseFloat(req.destination_lat);
    const dLng = parseFloat(req.destination_lng);

    const hasPickup = !isNaN(pLat) && !isNaN(pLng);
    const hasDest = !isNaN(dLat) && !isNaN(dLng);

    const pickup = hasPickup ? [pLat, pLng] : null;
    const dest = hasDest ? [dLat, dLng] : null;

    if (pickup && _trackMap) {
      _trackPickupMarker = L.marker(pickup, { icon: makeIcon('📦', '#16a34a') })
        .addTo(_trackMap)
        .bindPopup(`<b>📦 Pickup Location</b><br>${escapeHtml(req.pickup_address || '')}`);
    }

    if (dest && _trackMap) {
      _trackDestMarker = L.marker(dest, { icon: makeIcon('🏁', '#dc2626') })
        .addTo(_trackMap)
        .bindPopup(`<b>🏁 Destination</b><br>${escapeHtml(req.destination_address || '')}`);
    }

    // Draw route if both pickup & destination are available
    if (pickup && dest) {
      drawRoute(pickup, dest);
    } else if (pickup && _trackMap) {
      _trackMap.setView(pickup, 12);
    }

    // Join room for real-time location streaming
    SocketManager.joinDelivery(data.delivery.id);

    // Request browser geolocation for live driver marker
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          updateDriverMarker(lat, lng);
          setGpsStatus('active', 'Live tracking enabled');
          if (dest) updateETA(lat, lng, dest[0], dest[1]);
        },
        (err) => handleGpsError(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

  } catch (err) {
    console.error('[Tracking] loadTrackingData error:', err);
    if (infoEl) infoEl.innerHTML = `<div class="text-muted" style="color:#ef4444;padding:12px;">Failed to load delivery details.</div>`;
  }
}

async function drawRoute(pickup, dest) {
  if (!_trackMap || !pickup || !dest) return;
  const route = await getRoute(pickup[0], pickup[1], dest[0], dest[1]);

  if (_trackRouteLayer && _trackMap) {
    try { _trackMap.removeLayer(_trackRouteLayer); } catch (_) { }
    _trackRouteLayer = null;
  }

  if (route && route.coordinates && route.coordinates.length > 0) {
    _trackRouteLayer = L.polyline(route.coordinates, {
      color: '#2563eb', weight: 5, opacity: 0.85
    }).addTo(_trackMap);

    _trackMap.fitBounds(_trackRouteLayer.getBounds(), { padding: [50, 50] });

    const distEl = document.getElementById('map-distance');
    if (distEl) distEl.textContent = `${route.distanceKm} km`;

    const eta = new Date(Date.now() + route.durationMin * 60000);
    const etaEl = document.getElementById('map-eta');
    if (etaEl) etaEl.textContent = fmtTime(eta.toISOString());
  } else {
    // Fallback: dashed line between pickup and destination
    _trackRouteLayer = L.polyline([pickup, dest], { color: '#2563eb', weight: 4, dashArray: '8 6' }).addTo(_trackMap);
    _trackMap.fitBounds([pickup, dest], { padding: [50, 50] });
  }

  // Ensure canvas fits container properly
  setTimeout(() => {
    if (_trackMap) _trackMap.invalidateSize();
  }, 200);
}

function updateDriverMarker(lat, lng) {
  if (!_trackMap || lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
  if (!_trackDriverMarker) {
    _trackDriverMarker = L.marker([lat, lng], { icon: makeIcon('🚛', '#2563eb') })
      .addTo(_trackMap)
      .bindPopup('<b>🚛 Your Location</b>');
  } else {
    _trackDriverMarker.setLatLng([lat, lng]);
  }
}

async function updateETA(driverLat, driverLng, destLat, destLng) {
  if (isNaN(driverLat) || isNaN(driverLng) || isNaN(destLat) || isNaN(destLng)) return;
  const route = await getRoute(driverLat, driverLng, destLat, destLng);
  if (!route) return;
  const eta = new Date(Date.now() + route.durationMin * 60000);
  const distEl = document.getElementById('map-distance');
  if (distEl) distEl.textContent = `${route.distanceKm} km remaining`;
  const etaEl = document.getElementById('map-eta');
  if (etaEl) etaEl.textContent = fmtTime(eta.toISOString());
}

function getCurrentLocationAndCenter() {
  if (!navigator.geolocation || !_trackMap) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      _trackMap.setView([lat, lng], 13);
      updateDriverMarker(lat, lng);
      setGpsStatus('active', 'Showing current location');
      setTimeout(() => {
        if (_trackMap) _trackMap.invalidateSize();
      }, 200);
    },
    () => setGpsStatus('idle', 'GPS unavailable')
  );
}

function handleGpsError(err) {
  const banner = document.getElementById('location-error-banner');
  if (banner) banner.style.display = 'block';
  setGpsStatus('error', err && err.code === 1 ? 'Location permission denied' : 'GPS unavailable');
}

function setGpsStatus(state, label) {
  const dot = document.querySelector('.gps-dot');
  const lblEl = document.getElementById('gps-label');
  if (dot) {
    dot.className = `gps-dot ${state}`;
    if (state === 'active') dot.style.background = '#16a34a';
    else if (state === 'error') dot.style.background = '#ef4444';
    else dot.style.background = '#94a3b8';
  }
  if (lblEl) lblEl.textContent = label;
}

window.retryLocationPermission = function () {
  const banner = document.getElementById('location-error-banner');
  if (banner) banner.style.display = 'none';
  setGpsStatus('idle', 'Requesting location…');
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      updateDriverMarker(lat, lng);
      setGpsStatus('active', 'GPS connected');
      if (typeof startLocationSharing === 'function' && window.AppState?.activeDeliveryId) {
        startLocationSharing(window.AppState.activeDeliveryId);
      }
    },
    (err) => handleGpsError(err),
    { enableHighAccuracy: true }
  );
};
