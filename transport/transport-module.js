/* ============================================================
   AgriBridge Transport — Driver Dashboard Module
   Real-time transport management for drivers.
   Connects to the Express + Socket.IO backend.
   ============================================================ */

'use strict';

/* ============================================================
   CONFIGURATION
   ============================================================ */
const TRANSPORT_CONFIG = {
  API_URL: 'http://localhost:3001',
  SOCKET_URL: 'http://localhost:3001',
  OSRM_URL: 'https://router.project-osrm.org/route/v1/driving',
  LOCATION_INTERVAL_MS: 8000,   // Send GPS every 8 seconds during delivery
  RECONNECT_ATTEMPTS: 5,
  MAP_TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  MAP_ATTRIBUTION: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
};

/* ============================================================
   STATE
   ============================================================ */
const TransportState = {
  token: localStorage.getItem('transport_token') || null,
  user: JSON.parse(localStorage.getItem('transport_user') || 'null'),
  driverId: localStorage.getItem('transport_driver_id') || null,
  currentPage: 'dashboard',
  socket: null,
  map: null,
  driverMarker: null,
  pickupMarker: null,
  destMarker: null,
  routeLayer: null,
  locationInterval: null,
  connectionStatus: 'disconnected',
  driverStatus: 'offline',
  activeDelivery: null,
  pendingRequests: [],
  earnings: null,
  notifications: []
};

/* ============================================================
   UTILITIES
   ============================================================ */
function tFmt(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function tDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function ensureToastContainer() {
  let c = document.getElementById('t-toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 't-toast-container';
    c.className = 't-toast-container';
    document.body.appendChild(c);
  }
  return c;
}

function tToast(message, type = 'info', duration = 4000) {
  const container = ensureToastContainer();
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `t-toast ${type}`;
  toast.innerHTML = `
    <span>${icons[type] || 'ℹ️'}</span>
    <span class="t-toast-msg">${sanitize(message)}</span>
    <button class="t-toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/* ============================================================
   API HELPER
   ============================================================ */
async function tApi(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TransportState.token ? { Authorization: `Bearer ${TransportState.token}` } : {})
    }
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${TRANSPORT_CONFIG.API_URL}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error('Cannot connect to server. Please check your connection.');
    }
    throw err;
  }
}

/* ============================================================
   AUTHENTICATION
   ============================================================ */
function saveAuth(token, user, driverId) {
  TransportState.token = token;
  TransportState.user = user;
  TransportState.driverId = driverId;
  localStorage.setItem('transport_token', token);
  localStorage.setItem('transport_user', JSON.stringify(user));
  if (driverId) localStorage.setItem('transport_driver_id', driverId);
}

function clearAuth() {
  TransportState.token = null;
  TransportState.user = null;
  TransportState.driverId = null;
  localStorage.removeItem('transport_token');
  localStorage.removeItem('transport_user');
  localStorage.removeItem('transport_driver_id');
  stopLocationSharing();
  if (TransportState.socket) {
    TransportState.socket.disconnect();
    TransportState.socket = null;
  }
}

/* ============================================================
   SOCKET.IO REAL-TIME
   ============================================================ */
function initSocket() {
  if (TransportState.socket) {
    TransportState.socket.disconnect();
  }

  const socket = io(TRANSPORT_CONFIG.SOCKET_URL, {
    auth: { token: TransportState.token },
    reconnection: true,
    reconnectionAttempts: TRANSPORT_CONFIG.RECONNECT_ATTEMPTS,
    reconnectionDelay: 1500,
    timeout: 10000
  });

  TransportState.socket = socket;

  socket.on('connect', () => {
    TransportState.connectionStatus = 'connected';
    updateConnectionUI('connected');
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    TransportState.connectionStatus = 'disconnected';
    updateConnectionUI('disconnected');
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    TransportState.connectionStatus = 'disconnected';
    updateConnectionUI('disconnected');
    console.warn('[Socket] Connection error:', err.message);
  });

  socket.io.on('reconnect_attempt', () => {
    TransportState.connectionStatus = 'reconnecting';
    updateConnectionUI('reconnecting');
  });

  socket.io.on('reconnect', () => {
    TransportState.connectionStatus = 'connected';
    updateConnectionUI('connected');
    tToast('Reconnected to server', 'success');
  });

  socket.io.on('reconnect_failed', () => {
    tToast('Could not reconnect. Please refresh the page.', 'error', 8000);
  });

  /* ---- Real-time events ---- */

  // New delivery request arrives for this driver
  socket.on('transport:new_request', (data) => {
    console.log('[Socket] New request:', data.request.id);
    TransportState.pendingRequests.unshift(data.request);
    tToast(`🔔 New delivery request: ${data.request.crop} (${data.request.quantityKg} kg)`, 'info', 6000);
    if (TransportState.currentPage === 'requests') {
      renderRequestsPage();
    }
    updateDashboardBadge();
  });

  // Driver availability acknowledged
  socket.on('driver:availability_ack', (data) => {
    TransportState.driverStatus = data.status;
    updateAvailabilityUI(data.status);
  });

  // Delivery status changed
  socket.on('delivery:status_changed', (data) => {
    if (TransportState.activeDelivery && TransportState.activeDelivery.id === data.deliveryId) {
      TransportState.activeDelivery.status = data.status;
      if (TransportState.currentPage === 'active') renderActiveDeliveryPage();
    }
  });

  // Delivery completed
  socket.on('delivery:completed', (data) => {
    tToast(`✅ Delivery completed! Earnings: ₹${data.earnings?.total}`, 'success', 6000);
    TransportState.activeDelivery = null;
    TransportState.driverStatus = 'available';
    stopLocationSharing();
    if (TransportState.currentPage === 'active') renderActiveDeliveryPage();
    if (TransportState.currentPage === 'earnings') loadAndRenderEarnings();
  });

  // Request cancelled by farmer
  socket.on('transport:request_cancelled', (data) => {
    tToast(`Request for ${data.crop} was cancelled by the farmer`, 'warning');
    TransportState.pendingRequests = TransportState.pendingRequests.filter(r => r.id !== data.requestId);
    if (TransportState.currentPage === 'requests') renderRequestsPage();
  });

  // Notification received
  socket.on('notification:new', (data) => {
    tToast(`${data.title}: ${data.message}`, 'info');
    TransportState.notifications.unshift({
      ...data,
      is_read: false,
      created_at: new Date().toISOString()
    });
    updateNotificationBadge();
  });

  return socket;
}

function updateConnectionUI(status) {
  const bars = document.querySelectorAll('.t-connection-bar');
  bars.forEach(bar => {
    bar.className = `t-connection-bar ${status}`;
    const dot = bar.querySelector('.t-live-dot');
    const label = bar.querySelector('.t-conn-label');
    if (dot && label) {
      const labels = {
        connected: '🟢 Live — Real-time active',
        disconnected: '🔴 Offline — Not connected',
        reconnecting: '🟠 Reconnecting...'
      };
      label.textContent = labels[status] || status;
    }
  });
}

/* ============================================================
   GPS LOCATION SHARING
   ============================================================ */
function startLocationSharing(deliveryId) {
  if (TransportState.locationInterval) return; // Already running

  if (!navigator.geolocation) {
    tToast('Geolocation is not supported by your browser', 'error');
    return;
  }

  const sendLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;

        // Send via socket (fast, preferred)
        if (TransportState.socket?.connected) {
          TransportState.socket.emit('driver:location', { lat, lng, deliveryId });
        } else {
          // Fallback to REST API
          tApi('PUT', '/api/transport/drivers/me/location', { lat, lng, deliveryId })
            .catch(err => console.warn('[Location] API fallback failed:', err.message));
        }

        // Update map if visible
        if (TransportState.map && TransportState.driverMarker) {
          TransportState.driverMarker.setLatLng([lat, lng]);
          updateMapStats(lat, lng);
        }
      },
      (err) => {
        console.warn('[GPS]', err.message);
        const errEl = document.getElementById('t-location-error');
        if (errEl) {
          errEl.style.display = 'block';
          errEl.textContent = err.code === 1
            ? '⚠️ Location permission required for live tracking. Please allow location access.'
            : '⚠️ Unable to get GPS location. Please check device settings.';
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  sendLocation(); // Immediate first send
  TransportState.locationInterval = setInterval(sendLocation, TRANSPORT_CONFIG.LOCATION_INTERVAL_MS);
  console.log('[GPS] Location sharing started');
}

function stopLocationSharing() {
  if (TransportState.locationInterval) {
    clearInterval(TransportState.locationInterval);
    TransportState.locationInterval = null;
    console.log('[GPS] Location sharing stopped');
  }
}

/* ============================================================
   MAP (Leaflet + OpenStreetMap)
   ============================================================ */
function initMap(containerId, center = [10.0, 78.0], zoom = 12) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  // Destroy existing map instance
  if (TransportState.map) {
    TransportState.map.remove();
    TransportState.map = null;
  }

  const map = L.map(containerId, {
    center,
    zoom,
    zoomControl: true,
    attributionControl: true
  });

  L.tileLayer(TRANSPORT_CONFIG.MAP_TILE_URL, {
    attribution: TRANSPORT_CONFIG.MAP_ATTRIBUTION,
    maxZoom: 19
  }).addTo(map);

  TransportState.map = map;
  return map;
}

function createMarkerIcon(emoji, color = '#4299e1') {
  return L.divIcon({
    html: `<div style="
      background: ${color};
      width: 34px; height: 34px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      border: 2px solid white;
    "><span style="transform: rotate(45deg); font-size: 14px;">${emoji}</span></div>`,
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34]
  });
}

async function fetchRoute(fromLat, fromLng, toLat, toLng) {
  try {
    const url = `${TRANSPORT_CONFIG.OSRM_URL}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;

    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates.map(c => [c[1], c[0]]),
      distanceKm: Math.round(route.distance / 100) / 10,
      durationMin: Math.round(route.duration / 60)
    };
  } catch (err) {
    console.warn('[OSRM] Route fetch failed:', err.message);
    return null;
  }
}

async function renderDeliveryMap(delivery, request) {
  if (!window.L) {
    console.warn('[Map] Leaflet not loaded');
    return;
  }

  const map = initMap('transport-map',
    [request.pickup_lat, request.pickup_lng], 12);
  if (!map) return;

  // Driver marker (current position)
  const driverPos = [
    parseFloat(request.pickup_lat) - 0.02,
    parseFloat(request.pickup_lng) - 0.01
  ];

  TransportState.driverMarker = L.marker(driverPos, {
    icon: createMarkerIcon('🚚', '#4299e1')
  }).addTo(map).bindPopup('<b>🚚 Your Location</b>');

  // Pickup marker
  TransportState.pickupMarker = L.marker(
    [request.pickup_lat, request.pickup_lng],
    { icon: createMarkerIcon('📦', '#38a169') }
  ).addTo(map).bindPopup(`<b>📦 Pickup</b><br>${sanitize(request.pickup_address)}`);

  // Destination marker
  TransportState.destMarker = L.marker(
    [request.destination_lat, request.destination_lng],
    { icon: createMarkerIcon('🏁', '#e53e3e') }
  ).addTo(map).bindPopup(`<b>🏁 Destination</b><br>${sanitize(request.destination_address)}`);

  // Draw route
  const route = await fetchRoute(
    request.pickup_lat, request.pickup_lng,
    request.destination_lat, request.destination_lng
  );

  if (route) {
    if (TransportState.routeLayer) {
      TransportState.map.removeLayer(TransportState.routeLayer);
    }
    TransportState.routeLayer = L.polyline(route.coordinates, {
      color: '#63b3ed',
      weight: 4,
      opacity: 0.8,
      dashArray: null
    }).addTo(map);

    map.fitBounds(TransportState.routeLayer.getBounds(), { padding: [40, 40] });

    // Update stats
    const distEl = document.getElementById('t-map-distance');
    const etaEl = document.getElementById('t-map-eta');
    if (distEl) distEl.textContent = `${route.distanceKm} km`;
    if (etaEl) {
      const arrivalTime = new Date(Date.now() + route.durationMin * 60000);
      etaEl.textContent = arrivalTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }
  } else {
    // Fallback: straight line
    L.polyline([
      [request.pickup_lat, request.pickup_lng],
      [request.destination_lat, request.destination_lng]
    ], { color: '#63b3ed', weight: 3, dashArray: '8 4' }).addTo(map);
  }

  // Real-time location updates from socket
  if (TransportState.socket) {
    TransportState.socket.on('delivery:location_updated', (data) => {
      if (data.deliveryId === delivery.id && TransportState.driverMarker) {
        TransportState.driverMarker.setLatLng([data.lat, data.lng]);
        updateMapStats(data.lat, data.lng);
      }
    });
  }
}

async function updateMapStats(lat, lng) {
  if (!TransportState.activeDelivery?.transport_requests) return;
  const req = TransportState.activeDelivery.transport_requests;

  const route = await fetchRoute(lat, lng, req.destination_lat, req.destination_lng);
  if (!route) return;

  const distEl = document.getElementById('t-map-distance');
  const etaEl = document.getElementById('t-map-eta');
  if (distEl) distEl.textContent = `${route.distanceKm} km remaining`;
  if (etaEl) {
    const arrival = new Date(Date.now() + route.durationMin * 60000);
    etaEl.textContent = arrival.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
}

/* ============================================================
   DRIVER DASHBOARD RENDERER
   ============================================================ */

// This is called from app.js when driver navigates to Transport page
const TransportDriverModule = {

  /* ---- Entry point ---- */
  async init(containerEl) {
    // Check if logged in as driver
    if (!TransportState.token || !TransportState.user) {
      this.renderAuthScreen(containerEl);
      return;
    }

    if (TransportState.user.role !== 'driver') {
      // User is farmer/vendor — show farmer view instead
      await TransportFarmerModule.init(containerEl);
      return;
    }

    // Init Socket.IO
    if (!TransportState.socket || !TransportState.socket.connected) {
      initSocket();
    }

    this.renderLayout(containerEl);
    this.navigateTo('dashboard');
  },

  /* ---- Auth Screen ---- */
  renderAuthScreen(containerEl) {
    containerEl.innerHTML = `
      <div class="t-auth-container" id="t-auth-box">
        <div class="t-auth-logo">
          <div class="logo-icon">🚚</div>
          <h2>Transport Driver Login</h2>
          <p>Sign in to access your driver dashboard</p>
        </div>
        <div id="t-auth-error" style="display:none; color:#fc8181; font-size:0.85rem; margin-bottom:1rem; padding:0.75rem; background:rgba(229,62,62,0.1); border-radius:8px;"></div>
        <div id="t-auth-form-area">
          ${this.loginForm()}
        </div>
      </div>
    `;
  },

  loginForm() {
    return `
      <form id="t-login-form" onsubmit="TransportDriverModule.handleLogin(event)">
        <div class="t-form-group">
          <label>Email Address</label>
          <input type="email" id="t-login-email" placeholder="driver@example.com" required autocomplete="email">
        </div>
        <div class="t-form-group">
          <label>Password</label>
          <input type="password" id="t-login-password" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <button type="submit" class="t-btn t-btn-primary" id="t-login-btn">
          🔐 Sign In
        </button>
        <div class="t-auth-switch">
          Don't have an account? <a onclick="TransportDriverModule.showRegister()">Register as Driver</a>
        </div>
      </form>
    `;
  },

  registerForm() {
    return `
      <form id="t-register-form" onsubmit="TransportDriverModule.handleRegister(event)">
        <div class="t-form-row">
          <div class="t-form-group">
            <label>Full Name</label>
            <input type="text" id="t-reg-name" placeholder="Kumar Selvam" required>
          </div>
          <div class="t-form-group">
            <label>Phone</label>
            <input type="tel" id="t-reg-phone" placeholder="+91 98765 00000">
          </div>
        </div>
        <div class="t-form-group">
          <label>Email Address</label>
          <input type="email" id="t-reg-email" placeholder="driver@example.com" required>
        </div>
        <div class="t-form-row">
          <div class="t-form-group">
            <label>Password</label>
            <input type="password" id="t-reg-password" placeholder="Min 6 chars" required>
          </div>
          <div class="t-form-group">
            <label>Role</label>
            <select id="t-reg-role">
              <option value="driver">🚚 Driver</option>
              <option value="farmer">🌾 Farmer</option>
              <option value="vendor">🏪 Vendor</option>
            </select>
          </div>
        </div>
        <button type="submit" class="t-btn t-btn-primary" id="t-reg-btn">
          ✅ Create Account
        </button>
        <div class="t-auth-switch">
          Already have an account? <a onclick="TransportDriverModule.showLogin()">Sign In</a>
        </div>
      </form>
    `;
  },

  showRegister() {
    document.getElementById('t-auth-form-area').innerHTML = this.registerForm();
  },

  showLogin() {
    document.getElementById('t-auth-form-area').innerHTML = this.loginForm();
  },

  async handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('t-login-btn');
    const errEl = document.getElementById('t-auth-error');
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const data = await tApi('POST', '/api/transport/auth/login', {
        email: document.getElementById('t-login-email').value,
        password: document.getElementById('t-login-password').value
      });

      saveAuth(data.token, data.user, data.driverId);
      tToast(`Welcome back, ${data.user.name}!`, 'success');

      // Re-render
      const container = document.getElementById('page-transport');
      await this.init(container);
    } catch (err) {
      errEl.style.display = 'block';
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.textContent = '🔐 Sign In';
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('t-reg-btn');
    const errEl = document.getElementById('t-auth-error');
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const data = await tApi('POST', '/api/transport/auth/register', {
        name: document.getElementById('t-reg-name').value,
        email: document.getElementById('t-reg-email').value,
        password: document.getElementById('t-reg-password').value,
        phone: document.getElementById('t-reg-phone').value,
        role: document.getElementById('t-reg-role').value
      });

      saveAuth(data.token, data.user, data.driverId);
      tToast(`Account created! Welcome, ${data.user.name}!`, 'success');

      const container = document.getElementById('page-transport');
      await this.init(container);
    } catch (err) {
      errEl.style.display = 'block';
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.textContent = '✅ Create Account';
    }
  },

  /* ---- Main Layout ---- */
  renderLayout(containerEl) {
    containerEl.innerHTML = `
      <div class="transport-root" id="transport-root">
        <!-- Transport Sub-Sidebar -->
        <aside class="transport-sidebar" id="t-sidebar">
          <nav class="transport-sidebar-nav">
            <button class="t-nav-item active" data-tpage="dashboard" onclick="TransportDriverModule.navigateTo('dashboard')">
              <span class="t-nav-icon">🏠</span><span>Dashboard</span>
            </button>
            <button class="t-nav-item" data-tpage="availability" onclick="TransportDriverModule.navigateTo('availability')">
              <span class="t-nav-icon">🟢</span><span>Availability</span>
            </button>
            <button class="t-nav-item" data-tpage="requests" onclick="TransportDriverModule.navigateTo('requests')">
              <span class="t-nav-icon">📦</span><span>Requests <span id="t-req-badge" style="display:none; background:#4299e1; color:white; border-radius:99px; padding:1px 7px; font-size:0.72rem; margin-left:0.3rem;"></span></span>
            </button>
            <button class="t-nav-item" data-tpage="active" onclick="TransportDriverModule.navigateTo('active')">
              <span class="t-nav-icon">🚚</span><span>Active Delivery</span>
            </button>
            <button class="t-nav-item" data-tpage="tracking" onclick="TransportDriverModule.navigateTo('tracking')">
              <span class="t-nav-icon">🗺️</span><span>Live Tracking</span>
            </button>
            <button class="t-nav-item" data-tpage="vehicle" onclick="TransportDriverModule.navigateTo('vehicle')">
              <span class="t-nav-icon">🚛</span><span>My Vehicle</span>
            </button>
            <button class="t-nav-item" data-tpage="history" onclick="TransportDriverModule.navigateTo('history')">
              <span class="t-nav-icon">📜</span><span>History</span>
            </button>
            <button class="t-nav-item" data-tpage="earnings" onclick="TransportDriverModule.navigateTo('earnings')">
              <span class="t-nav-icon">💰</span><span>Earnings</span>
            </button>
            <button class="t-nav-item" data-tpage="notifications" onclick="TransportDriverModule.navigateTo('notifications')">
              <span class="t-nav-icon">🔔</span><span>Alerts <span id="t-notif-badge" style="display:none; background:#e53e3e; color:white; border-radius:99px; padding:1px 7px; font-size:0.72rem; margin-left:0.3rem;"></span></span>
            </button>
            <button class="t-nav-item" data-tpage="profile" onclick="TransportDriverModule.navigateTo('profile')">
              <span class="t-nav-icon">👤</span><span>Profile</span>
            </button>
          </nav>
          <div style="padding: 1rem; border-top: 1px solid rgba(255,255,255,0.08); margin-top: auto;">
            <button class="t-btn t-btn-secondary t-btn-sm" style="width:100%;" onclick="TransportDriverModule.logout()">
              🚪 Logout
            </button>
          </div>
        </aside>

        <!-- Content Area -->
        <div class="transport-content">
          <div class="t-connection-bar disconnected" id="t-conn-bar">
            <span class="t-live-dot"></span>
            <span class="t-conn-label">Connecting...</span>
          </div>
          <div id="t-page-content"></div>
        </div>
      </div>
    `;
  },

  navigateTo(page) {
    TransportState.currentPage = page;

    // Update nav active state
    document.querySelectorAll('.t-nav-item[data-tpage]').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tpage') === page);
    });

    const content = document.getElementById('t-page-content');
    if (!content) return;

    switch (page) {
      case 'dashboard':    this.renderDashboard(content); break;
      case 'availability': this.renderAvailabilityPage(content); break;
      case 'requests':     this.renderRequestsPage(content); break;
      case 'active':       this.renderActiveDeliveryPage(content); break;
      case 'tracking':     this.renderTrackingPage(content); break;
      case 'vehicle':      this.renderVehiclePage(content); break;
      case 'history':      this.renderHistoryPage(content); break;
      case 'earnings':     this.renderEarningsPage(content); break;
      case 'notifications':this.renderNotificationsPage(content); break;
      case 'profile':      this.renderProfilePage(content); break;
    }
  },

  /* ============================================================
     DASHBOARD PAGE
  ============================================================ */
  async renderDashboard(content) {
    content.innerHTML = `<div class="t-loading"><div class="t-spinner"></div> Loading dashboard...</div>`;

    try {
      const [profileData, earningsData, activeData, requestsData] = await Promise.all([
        tApi('GET', '/api/transport/drivers/me'),
        tApi('GET', '/api/transport/drivers/me/earnings'),
        tApi('GET', '/api/transport/deliveries/active'),
        tApi('GET', '/api/transport/requests')
      ]);

      const driver = profileData.driver;
      TransportState.driverStatus = driver.status;
      TransportState.activeDelivery = activeData.delivery;

      const statusColors = { available: '#68d391', busy: '#f6e05e', offline: '#a0aec0' };
      const statusEmojis = { available: '🟢', busy: '🟡', offline: '⚫' };

      content.innerHTML = `
        <div class="t-section-header">
          <div>
            <div class="t-section-title">Welcome back, ${sanitize(driver.name)} 👋</div>
            <div class="t-section-sub">
              Status: ${statusEmojis[driver.status] || '⚫'}
              <span class="t-badge t-badge-${driver.status}">${driver.status.toUpperCase()}</span>
            </div>
          </div>
          <div>
            <span style="color:#8892a4; font-size:0.8rem;">⭐ ${driver.rating?.toFixed(1) || '5.0'} · ${driver.total_deliveries || 0} deliveries</span>
          </div>
        </div>

        <div class="t-cards-grid">
          <div class="t-card highlight" onclick="TransportDriverModule.navigateTo('active')" style="cursor:pointer;">
            <div class="t-card-icon">🚚</div>
            <div class="t-card-label">Active Delivery</div>
            <div class="t-card-value">${activeData.delivery ? '1' : '0'}</div>
            <div class="t-card-sub">${activeData.delivery ? `Status: ${activeData.delivery.status}` : 'No active delivery'}</div>
          </div>
          <div class="t-card" onclick="TransportDriverModule.navigateTo('requests')" style="cursor:pointer;">
            <div class="t-card-icon">📦</div>
            <div class="t-card-label">Pending Requests</div>
            <div class="t-card-value">${requestsData.requests?.length || 0}</div>
            <div class="t-card-sub">Eligible for your vehicle</div>
          </div>
          <div class="t-card">
            <div class="t-card-icon">💰</div>
            <div class="t-card-label">Today's Earnings</div>
            <div class="t-card-value">₹${earningsData.today?.total?.toLocaleString('en-IN') || '0'}</div>
            <div class="t-card-sub">${earningsData.today?.count || 0} deliveries today</div>
          </div>
          <div class="t-card">
            <div class="t-card-icon">📊</div>
            <div class="t-card-label">This Week</div>
            <div class="t-card-value">₹${earningsData.thisWeek?.total?.toLocaleString('en-IN') || '0'}</div>
            <div class="t-card-sub">${earningsData.thisWeek?.count || 0} deliveries</div>
          </div>
        </div>

        ${activeData.delivery ? `
          <div class="t-active-delivery">
            <div class="t-active-header">
              <div class="t-active-title">🚚 Active Delivery</div>
              <button class="t-btn t-btn-secondary t-btn-sm" onclick="TransportDriverModule.navigateTo('active')">Details →</button>
            </div>
            <div style="font-size:0.9rem; color:var(--text-secondary);">
              ${sanitize(activeData.delivery.transport_requests?.crop || '')} ·
              ${sanitize(activeData.delivery.transport_requests?.quantity_kg || '')} kg ·
              <span class="t-badge t-badge-${activeData.delivery.status}">${activeData.delivery.status.replace(/_/g, ' ').toUpperCase()}</span>
            </div>
          </div>
        ` : ''}

        <div style="margin-top: 1rem;">
          <div class="t-section-title" style="margin-bottom:0.75rem;">Quick Actions</div>
          <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
            <button class="t-btn t-btn-success" onclick="TransportDriverModule.quickSetAvailability('available')">🟢 Go Available</button>
            <button class="t-btn t-btn-secondary" onclick="TransportDriverModule.quickSetAvailability('offline')">⚫ Go Offline</button>
            <button class="t-btn t-btn-secondary" onclick="TransportDriverModule.navigateTo('requests')">📦 View Requests</button>
            <button class="t-btn t-btn-secondary" onclick="TransportDriverModule.navigateTo('earnings')">💰 Earnings</button>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  /* ============================================================
     AVAILABILITY PAGE
  ============================================================ */
  renderAvailabilityPage(content) {
    const status = TransportState.driverStatus;
    content.innerHTML = `
      <div class="t-section-title" style="margin-bottom:1rem;">Driver Availability</div>
      <div class="t-availability-section">
        <h3>Set Your Status</h3>
        <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:1rem;">
          When you're AVAILABLE, eligible delivery requests will be sent to you in real time.
          Farmers and vendors see your status update immediately.
        </p>
        <div class="t-avail-buttons">
          <button class="t-avail-btn ${status==='available'?'active':''}"
            data-status="available"
            id="avail-btn-available"
            onclick="TransportDriverModule.setAvailability('available')">
            🟢 AVAILABLE
          </button>
          <button class="t-avail-btn ${status==='busy'?'active':''}"
            data-status="busy"
            id="avail-btn-busy"
            onclick="TransportDriverModule.setAvailability('busy')">
            🟡 BUSY
          </button>
          <button class="t-avail-btn ${status==='offline'?'active':''}"
            data-status="offline"
            id="avail-btn-offline"
            onclick="TransportDriverModule.setAvailability('offline')">
            ⚫ OFFLINE
          </button>
        </div>
        <div style="margin-top:1rem; padding: 0.75rem; background:rgba(255,255,255,0.03); border-radius:10px;">
          <div style="font-size:0.82rem; color:var(--text-secondary);">
            Current status: <span class="t-badge t-badge-${status}" id="current-status-badge">${status.toUpperCase()}</span>
          </div>
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.5rem;" id="avail-desc">
            ${this.getAvailabilityDescription(status)}
          </div>
        </div>
      </div>

      <div class="t-availability-section">
        <h3>How It Works</h3>
        <div style="display:flex; flex-direction:column; gap:0.75rem; font-size:0.84rem; color:var(--text-secondary);">
          <div>🟢 <strong style="color:var(--text-primary);">AVAILABLE</strong> — You will receive new delivery request notifications. Farmers can assign deliveries to you.</div>
          <div>🟡 <strong style="color:var(--text-primary);">BUSY</strong> — Set automatically when you accept a delivery. You won't receive new requests.</div>
          <div>⚫ <strong style="color:var(--text-primary);">OFFLINE</strong> — You are not visible to the system. No requests will be sent.</div>
        </div>
      </div>
    `;
  },

  getAvailabilityDescription(status) {
    if (status === 'available') return 'You are visible to farmers. New requests will be sent to you.';
    if (status === 'busy') return 'You have an active delivery. New requests are paused.';
    return 'You are offline. Go AVAILABLE to start receiving requests.';
  },

  async setAvailability(status) {
    try {
      // Optimistic UI update
      document.querySelectorAll('.t-avail-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(`avail-btn-${status}`)?.classList.add('active');

      // Send via socket (instant) and REST (persistent)
      if (TransportState.socket?.connected) {
        TransportState.socket.emit('driver:availability', { status });
      }
      await tApi('PUT', '/api/transport/drivers/me/availability', { status });
      TransportState.driverStatus = status;

      const badge = document.getElementById('current-status-badge');
      const desc = document.getElementById('avail-desc');
      if (badge) { badge.className = `t-badge t-badge-${status}`; badge.textContent = status.toUpperCase(); }
      if (desc) desc.textContent = this.getAvailabilityDescription(status);

      tToast(`Status set to ${status.toUpperCase()}`, 'success');
    } catch (err) {
      tToast(err.message, 'error');
    }
  },

  async quickSetAvailability(status) {
    try {
      if (TransportState.socket?.connected) {
        TransportState.socket.emit('driver:availability', { status });
      }
      await tApi('PUT', '/api/transport/drivers/me/availability', { status });
      TransportState.driverStatus = status;
      tToast(`Status → ${status.toUpperCase()}`, 'success');
      // Refresh dashboard
      this.renderDashboard(document.getElementById('t-page-content'));
    } catch (err) {
      tToast(err.message, 'error');
    }
  },

  /* ============================================================
     DELIVERY REQUESTS PAGE
  ============================================================ */
  async renderRequestsPage(content) {
    if (!content) content = document.getElementById('t-page-content');
    content.innerHTML = `<div class="t-loading"><div class="t-spinner"></div> Loading requests...</div>`;

    try {
      const data = await tApi('GET', '/api/transport/requests');
      TransportState.pendingRequests = data.requests || [];
      this.renderRequestsList(content, TransportState.pendingRequests);
      updateDashboardBadge();
    } catch (err) {
      content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  renderRequestsList(content, requests) {
    if (requests.length === 0) {
      content.innerHTML = `
        <div class="t-section-header">
          <div class="t-section-title">Delivery Requests</div>
          <button class="t-btn t-btn-secondary t-btn-sm" onclick="TransportDriverModule.renderRequestsPage()">↻ Refresh</button>
        </div>
        <div class="t-empty">
          <div class="t-empty-icon">📭</div>
          <div class="t-empty-title">No Requests Available</div>
          <div class="t-empty-msg">New requests for your vehicle capacity will appear here in real time.</div>
        </div>
      `;
      return;
    }

    const cards = requests.map(req => `
      <div class="t-request-card new-request" id="req-card-${req.id}">
        <div class="t-request-header">
          <span class="t-request-id">REQ-${req.id.slice(-8).toUpperCase()}</span>
          <span class="t-request-time">${timeAgo(req.created_at || req.createdAt)}</span>
        </div>
        <div class="t-request-crop">
          ${CROP_EMOJI_MAP[req.crop] || '🌿'} ${sanitize(req.crop)}
          <span class="t-payment-badge" style="margin-left:0.75rem;">
            ₹${parseFloat(req.estimated_cost || req.estimatedCost || 0).toLocaleString('en-IN')}
          </span>
        </div>
        <div class="t-request-details">
          <div class="t-detail-row">
            <span class="t-detail-label">Quantity</span>
            <span class="t-detail-value">⚖️ ${parseFloat(req.quantity_kg || req.quantityKg)} kg</span>
          </div>
          <div class="t-detail-row">
            <span class="t-detail-label">Distance</span>
            <span class="t-detail-value">📏 ${(req.estimated_distance_km || req.estimatedDistanceKm || '~')} km</span>
          </div>
          <div class="t-detail-row">
            <span class="t-detail-label">From You</span>
            <span class="t-detail-value">📍 ${req.driverDistanceKm ? req.driverDistanceKm + ' km' : 'Unknown'}</span>
          </div>
          <div class="t-detail-row">
            <span class="t-detail-label">Customer</span>
            <span class="t-detail-value">👤 ${sanitize(req.requester_name || req.requesterName || 'Farmer')}</span>
          </div>
        </div>
        <div class="t-request-route">
          <div class="t-route-point">📦 Pickup: <strong>${sanitize(req.pickup_address || req.pickupAddress)}</strong></div>
          <div class="t-route-line"></div>
          <div class="t-route-point">🏁 Destination: <strong>${sanitize(req.destination_address || req.destinationAddress)}</strong></div>
        </div>
        ${req.notes ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.75rem;">📝 ${sanitize(req.notes)}</div>` : ''}
        <div class="t-request-actions">
          <button class="t-btn t-btn-success" onclick="TransportDriverModule.acceptRequest('${req.id}')">
            ✅ Accept
          </button>
          <button class="t-btn t-btn-danger" onclick="TransportDriverModule.rejectRequest('${req.id}')">
            ❌ Reject
          </button>
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="t-section-header">
        <div>
          <div class="t-section-title">Delivery Requests</div>
          <div class="t-section-sub">${requests.length} request${requests.length !== 1 ? 's' : ''} eligible for your vehicle</div>
        </div>
        <button class="t-btn t-btn-secondary t-btn-sm" onclick="TransportDriverModule.renderRequestsPage()">↻ Refresh</button>
      </div>
      ${cards}
    `;
  },

  async acceptRequest(requestId) {
    const card = document.getElementById(`req-card-${requestId}`);
    if (card) {
      card.style.opacity = '0.5';
      card.querySelector('button').textContent = 'Accepting...';
    }
    try {
      const data = await tApi('POST', `/api/transport/requests/${requestId}/accept`);
      TransportState.activeDelivery = data.delivery;
      TransportState.driverStatus = 'busy';
      tToast('✅ Request accepted! Delivery is now active.', 'success', 5000);

      // Start location sharing
      if (data.delivery) startLocationSharing(data.delivery.id);

      // Remove from pending list
      TransportState.pendingRequests = TransportState.pendingRequests.filter(r => r.id !== requestId);

      // Navigate to active delivery
      this.navigateTo('active');
    } catch (err) {
      tToast(err.message, 'error');
      if (card) { card.style.opacity = '1'; card.querySelector('button').textContent = '✅ Accept'; }
    }
  },

  async rejectRequest(requestId) {
    try {
      await tApi('POST', `/api/transport/requests/${requestId}/reject`);
      TransportState.pendingRequests = TransportState.pendingRequests.filter(r => r.id !== requestId);
      if (TransportState.currentPage === 'requests') {
        this.renderRequestsList(document.getElementById('t-page-content'), TransportState.pendingRequests);
      }
    } catch (err) {
      tToast(err.message, 'error');
    }
  },

  /* ============================================================
     ACTIVE DELIVERY PAGE
  ============================================================ */
  async renderActiveDeliveryPage(content) {
    if (!content) content = document.getElementById('t-page-content');
    content.innerHTML = `<div class="t-loading"><div class="t-spinner"></div> Loading active delivery...</div>`;

    try {
      const data = await tApi('GET', '/api/transport/deliveries/active');
      TransportState.activeDelivery = data.delivery;

      if (!data.delivery) {
        content.innerHTML = `
          <div class="t-section-title" style="margin-bottom:1rem;">Active Delivery</div>
          <div class="t-empty">
            <div class="t-empty-icon">🚛</div>
            <div class="t-empty-title">No Active Delivery</div>
            <div class="t-empty-msg">Accept a delivery request to start your next delivery.</div>
          </div>
          <div style="margin-top:1rem;">
            <button class="t-btn t-btn-primary" onclick="TransportDriverModule.navigateTo('requests')">📦 View Requests</button>
          </div>
        `;
        return;
      }

      const delivery = data.delivery;
      const request = delivery.transport_requests;

      const STEPS = [
        { key: 'driver_assigned',     label: 'Assigned', icon: '✓' },
        { key: 'reached_pickup',      label: 'At Pickup', icon: '📍' },
        { key: 'picked_up',           label: 'Picked Up', icon: '📦' },
        { key: 'in_transit',          label: 'In Transit', icon: '🚚' },
        { key: 'reached_destination', label: 'Arrived', icon: '📍' },
        { key: 'delivered',           label: 'Delivered', icon: '✅' }
      ];

      const currentStepIdx = STEPS.findIndex(s => s.key === delivery.status);

      const stepperHTML = STEPS.map((step, idx) => {
        const isCompleted = idx < currentStepIdx;
        const isCurrent = idx === currentStepIdx;
        const cls = isCompleted ? 'completed' : (isCurrent ? 'current' : '');
        const lineClass = idx < currentStepIdx ? 'filled' : '';
        return `
          <div class="t-step ${cls}">
            <div class="t-step-circle">${isCompleted ? '✓' : step.icon}</div>
            <div class="t-step-label">${step.label}</div>
          </div>
          ${idx < STEPS.length - 1 ? `<div class="t-step-line ${lineClass}"></div>` : ''}
        `;
      }).join('');

      // Next action button
      const NEXT_STATUS = {
        driver_assigned:     { status: 'reached_pickup',      label: '📍 Reached Pickup', style: 'warning' },
        reached_pickup:      { status: 'picked_up',           label: '📦 Goods Picked Up', style: 'success' },
        picked_up:           { status: 'in_transit',          label: '🚚 Start Transit', style: 'primary' },
        in_transit:          { status: 'reached_destination', label: '📍 Reached Destination', style: 'warning' },
        reached_destination: { status: 'delivered',           label: '✅ Mark Delivered', style: 'success' }
      };

      const nextAction = NEXT_STATUS[delivery.status];

      content.innerHTML = `
        <div class="t-section-title" style="margin-bottom:1rem;">Active Delivery</div>

        <div class="t-active-delivery">
          <div class="t-active-header">
            <div class="t-active-title">
              🚚 ${sanitize(request.crop)} — ${parseFloat(request.quantity_kg)} kg
            </div>
            <span class="t-badge t-badge-${delivery.status}">${delivery.status.replace(/_/g,' ').toUpperCase()}</span>
          </div>

          <!-- Status Stepper -->
          <div class="t-status-stepper">${stepperHTML}</div>

          <!-- Details Grid -->
          <div class="t-request-details" style="margin-top:1rem;">
            <div class="t-detail-row">
              <span class="t-detail-label">Customer</span>
              <span class="t-detail-value">👤 ${sanitize(request.requester_name || 'Farmer')}</span>
            </div>
            <div class="t-detail-row">
              <span class="t-detail-label">Distance</span>
              <span class="t-detail-value">📏 ${delivery.distance_km || request.estimated_distance_km || '~'} km</span>
            </div>
            <div class="t-detail-row">
              <span class="t-detail-label">Payment</span>
              <span class="t-detail-value" style="color:#68d391;">💰 ₹${parseFloat(delivery.payment || 0).toLocaleString('en-IN')}</span>
            </div>
            <div class="t-detail-row">
              <span class="t-detail-label">ETA</span>
              <span class="t-detail-value">🕐 ${delivery.eta ? new Date(delivery.eta).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}) : 'Calculating...'}</span>
            </div>
          </div>

          <div class="t-request-route" style="margin-top:1rem;">
            <div class="t-route-point">📦 <strong>${sanitize(request.pickup_address)}</strong></div>
            <div class="t-route-line"></div>
            <div class="t-route-point">🏁 <strong>${sanitize(request.destination_address)}</strong></div>
          </div>

          <!-- Status Action -->
          ${nextAction ? `
            <div class="t-status-actions">
              <button class="t-btn t-btn-${nextAction.style}" onclick="TransportDriverModule.updateDeliveryStatus('${delivery.id}','${nextAction.status}')">
                ${nextAction.label}
              </button>
              <button class="t-btn t-btn-secondary" onclick="TransportDriverModule.navigateTo('tracking')">
                🗺️ Live Map
              </button>
            </div>
          ` : delivery.status === 'delivered' ? `
            <div style="text-align:center; padding:1rem;">
              <div style="font-size:1.5rem;">🎉</div>
              <div style="font-weight:700; color:#68d391; margin-top:0.5rem;">Delivery Completed!</div>
              <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.3rem;">Payment: ₹${parseFloat(delivery.payment || 0).toLocaleString('en-IN')}</div>
            </div>
          ` : ''}
        </div>

        <div id="t-location-error" class="t-location-error" style="display:none;"></div>
      `;

      // Start location sharing if in active state
      if (['driver_assigned','reached_pickup','picked_up','in_transit','reached_destination'].includes(delivery.status)) {
        startLocationSharing(delivery.id);
      }

      // Join socket room for this delivery
      if (TransportState.socket) {
        TransportState.socket.emit('delivery:join', { deliveryId: delivery.id });
      }

    } catch (err) {
      content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  async updateDeliveryStatus(deliveryId, status) {
    try {
      await tApi('PUT', `/api/transport/deliveries/${deliveryId}/status`, { status });
      tToast(`Status updated: ${status.replace(/_/g,' ').toUpperCase()}`, 'success');

      if (status === 'delivered') {
        stopLocationSharing();
        TransportState.activeDelivery = null;
        TransportState.driverStatus = 'available';
      }

      this.renderActiveDeliveryPage(document.getElementById('t-page-content'));
    } catch (err) {
      tToast(err.message, 'error');
    }
  },

  /* ============================================================
     LIVE TRACKING PAGE
  ============================================================ */
  async renderTrackingPage(content) {
    if (!content) content = document.getElementById('t-page-content');

    content.innerHTML = `
      <div class="t-section-title" style="margin-bottom:1rem;">🗺️ Live Tracking Map</div>
      <div id="t-location-error" class="t-location-error" style="display:none;"></div>
      <div class="t-map-container">
        <div class="t-map-header">
          <h3>Driver Location & Route</h3>
          <div style="font-size:0.8rem; color:var(--text-secondary);">Updates every 8 seconds</div>
        </div>
        <div id="transport-map"></div>
        <div class="t-map-info">
          <div class="t-map-stat">
            <span class="t-map-stat-label">Distance Remaining</span>
            <span class="t-map-stat-value" id="t-map-distance">Calculating...</span>
          </div>
          <div class="t-map-stat">
            <span class="t-map-stat-label">ETA</span>
            <span class="t-map-stat-value" id="t-map-eta">Calculating...</span>
          </div>
          <div class="t-map-stat">
            <span class="t-map-stat-label">Status</span>
            <span class="t-map-stat-value" id="t-map-status">—</span>
          </div>
        </div>
      </div>
    `;

    try {
      const data = await tApi('GET', '/api/transport/deliveries/active');
      if (!data.delivery) {
        document.getElementById('t-map-status').textContent = 'No active delivery';
        // Show blank map centered on India
        if (window.L) initMap('transport-map', [20.5937, 78.9629], 5);
        return;
      }

      const delivery = data.delivery;
      const request = delivery.transport_requests;
      document.getElementById('t-map-status').textContent = delivery.status.replace(/_/g,' ').toUpperCase();

      await renderDeliveryMap(delivery, request);
      startLocationSharing(delivery.id);
    } catch (err) {
      content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  /* ============================================================
     VEHICLE PAGE
  ============================================================ */
  async renderVehiclePage(content) {
    if (!content) content = document.getElementById('t-page-content');
    content.innerHTML = `<div class="t-loading"><div class="t-spinner"></div> Loading vehicle...</div>`;

    try {
      const data = await tApi('GET', '/api/transport/vehicles/me');
      const v = data.vehicle;

      content.innerHTML = `
        <div class="t-section-title" style="margin-bottom:1rem;">🚛 My Vehicle</div>
        <div class="t-vehicle-card" id="t-vehicle-display">
          <div class="t-vehicle-header">
            <div class="t-vehicle-emoji">${VEHICLE_EMOJI_MAP[v.type] || '🚛'}</div>
            <div>
              <div class="t-vehicle-title">${sanitize(v.type)}</div>
              <div class="t-vehicle-number">${sanitize(v.number)}</div>
            </div>
          </div>
          <div class="t-vehicle-stats">
            <div class="t-vehicle-stat">
              <div class="t-vehicle-stat-value">${v.capacity_kg} kg</div>
              <div class="t-vehicle-stat-label">Capacity</div>
            </div>
            <div class="t-vehicle-stat">
              <div class="t-vehicle-stat-value"><span class="t-badge t-badge-${v.status}">${v.status.toUpperCase()}</span></div>
              <div class="t-vehicle-stat-label">Status</div>
            </div>
          </div>
          <button class="t-btn t-btn-secondary" onclick="TransportDriverModule.showVehicleEdit()">✏️ Edit Vehicle</button>
        </div>

        <div id="t-vehicle-edit-area" style="display:none; margin-top:1rem;">
          <div class="t-vehicle-card">
            <div class="t-section-title" style="margin-bottom:1rem;">Edit Vehicle</div>
            <form id="t-vehicle-form" onsubmit="TransportDriverModule.saveVehicle(event)">
              <div class="t-form-row">
                <div class="t-form-group">
                  <label>Vehicle Type</label>
                  <select id="t-v-type">
                    <option value="Auto" ${v.type==='Auto'?'selected':''}>🛺 Auto</option>
                    <option value="Mini Truck" ${v.type==='Mini Truck'?'selected':''}>🚛 Mini Truck</option>
                    <option value="Pickup Van" ${v.type==='Pickup Van'?'selected':''}>🚐 Pickup Van</option>
                    <option value="Lorry" ${v.type==='Lorry'?'selected':''}>🚚 Lorry</option>
                    <option value="Tractor" ${v.type==='Tractor'?'selected':''}>🚜 Tractor</option>
                    <option value="Other" ${v.type==='Other'?'selected':''}>🚗 Other</option>
                  </select>
                </div>
                <div class="t-form-group">
                  <label>Vehicle Number</label>
                  <input type="text" id="t-v-number" value="${sanitize(v.number)}" placeholder="TN XX XX XXXX" required>
                </div>
              </div>
              <div class="t-form-row">
                <div class="t-form-group">
                  <label>Capacity (kg)</label>
                  <input type="number" id="t-v-capacity" value="${v.capacity_kg}" min="1" required>
                </div>
                <div class="t-form-group">
                  <label>Vehicle Status</label>
                  <select id="t-v-status">
                    <option value="available" ${v.status==='available'?'selected':''}>✅ Available</option>
                    <option value="maintenance" ${v.status==='maintenance'?'selected':''}>🔧 Maintenance</option>
                    <option value="inactive" ${v.status==='inactive'?'selected':''}>❌ Inactive</option>
                  </select>
                </div>
              </div>
              <div style="display:flex; gap:0.75rem;">
                <button type="submit" class="t-btn t-btn-primary">💾 Save Changes</button>
                <button type="button" class="t-btn t-btn-secondary" onclick="TransportDriverModule.hideVehicleEdit()">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  showVehicleEdit() {
    document.getElementById('t-vehicle-edit-area').style.display = 'block';
  },

  hideVehicleEdit() {
    document.getElementById('t-vehicle-edit-area').style.display = 'none';
  },

  async saveVehicle(e) {
    e.preventDefault();
    try {
      await tApi('PUT', '/api/transport/vehicles/me', {
        type: document.getElementById('t-v-type').value,
        number: document.getElementById('t-v-number').value,
        capacity_kg: parseInt(document.getElementById('t-v-capacity').value),
        status: document.getElementById('t-v-status').value
      });
      tToast('Vehicle updated successfully', 'success');
      this.renderVehiclePage(document.getElementById('t-page-content'));
    } catch (err) {
      tToast(err.message, 'error');
    }
  },

  /* ============================================================
     HISTORY PAGE
  ============================================================ */
  async renderHistoryPage(content) {
    if (!content) content = document.getElementById('t-page-content');
    content.innerHTML = `<div class="t-loading"><div class="t-spinner"></div> Loading history...</div>`;

    try {
      const data = await tApi('GET', '/api/transport/deliveries/history');
      const deliveries = data.deliveries || [];

      content.innerHTML = `
        <div class="t-section-header">
          <div class="t-section-title">Delivery History</div>
          <span style="color:var(--text-secondary); font-size:0.85rem;">${deliveries.length} records</span>
        </div>
        <div class="t-history-filters">
          <input type="date" id="t-h-from" placeholder="From date" onchange="TransportDriverModule.filterHistory()">
          <input type="date" id="t-h-to" placeholder="To date" onchange="TransportDriverModule.filterHistory()">
          <input type="text" id="t-h-crop" placeholder="Filter by crop..." onkeyup="TransportDriverModule.filterHistory()">
          <select id="t-h-status" onchange="TransportDriverModule.filterHistory()">
            <option value="">All Status</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div id="t-history-table-area">
          ${this.renderHistoryTable(deliveries)}
        </div>
      `;
      // Store for filtering
      content._allDeliveries = deliveries;
    } catch (err) {
      content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  renderHistoryTable(deliveries) {
    if (deliveries.length === 0) {
      return `<div class="t-empty"><div class="t-empty-icon">📜</div><div class="t-empty-title">No delivery history yet</div></div>`;
    }
    return `
      <div class="t-table-wrapper">
        <table class="t-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Crop</th>
              <th>Qty (kg)</th>
              <th>Customer</th>
              <th>Distance</th>
              <th>Status</th>
              <th>Earned</th>
            </tr>
          </thead>
          <tbody>
            ${deliveries.map(d => `
              <tr>
                <td>${tDate(d.created_at)}</td>
                <td>${sanitize(d.transport_requests?.crop || '—')}</td>
                <td>${d.transport_requests?.quantity_kg || '—'}</td>
                <td>${sanitize(d.transport_requests?.requester_name || '—')}</td>
                <td>${d.distance_km ? d.distance_km + ' km' : (d.transport_requests?.estimated_distance_km ? d.transport_requests.estimated_distance_km + ' km' : '—')}</td>
                <td><span class="t-badge t-badge-${d.status}">${d.status}</span></td>
                <td style="color:#68d391; font-weight:700;">${d.earnings?.total ? '₹' + parseFloat(d.earnings.total).toLocaleString('en-IN') : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  filterHistory() {
    const from = document.getElementById('t-h-from')?.value;
    const to = document.getElementById('t-h-to')?.value;
    const crop = document.getElementById('t-h-crop')?.value?.toLowerCase();
    const status = document.getElementById('t-h-status')?.value;
    const content = document.getElementById('t-page-content');
    let results = content._allDeliveries || [];

    if (from) results = results.filter(d => d.created_at >= from);
    if (to) results = results.filter(d => d.created_at <= to + 'T23:59:59');
    if (crop) results = results.filter(d => d.transport_requests?.crop?.toLowerCase().includes(crop));
    if (status) results = results.filter(d => d.status === status);

    document.getElementById('t-history-table-area').innerHTML = this.renderHistoryTable(results);
  },

  /* ============================================================
     EARNINGS PAGE
  ============================================================ */
  async renderEarningsPage(content) {
    if (!content) content = document.getElementById('t-page-content');
    content.innerHTML = `<div class="t-loading"><div class="t-spinner"></div> Loading earnings...</div>`;
    await loadAndRenderEarnings(content);
  },

  /* ============================================================
     NOTIFICATIONS PAGE
  ============================================================ */
  async renderNotificationsPage(content) {
    if (!content) content = document.getElementById('t-page-content');
    content.innerHTML = `<div class="t-loading"><div class="t-spinner"></div> Loading notifications...</div>`;

    try {
      const data = await tApi('GET', '/api/transport/notifications');
      const notifs = data.notifications || [];
      TransportState.notifications = notifs;

      // Mark all as read
      if (data.unreadCount > 0) {
        tApi('PUT', '/api/transport/notifications/read-all').catch(() => {});
        updateNotificationBadge(0);
      }

      content.innerHTML = `
        <div class="t-section-header">
          <div class="t-section-title">🔔 Notifications</div>
          <span style="color:var(--text-secondary); font-size:0.85rem;">${notifs.length} total</span>
        </div>
        ${notifs.length === 0
          ? `<div class="t-empty"><div class="t-empty-icon">🔔</div><div class="t-empty-title">No notifications yet</div></div>`
          : `<div class="t-notif-list">${notifs.map(n => `
            <div class="t-notif-item ${n.is_read ? '' : 'unread'}">
              <div class="t-notif-icon">${getNotifIcon(n.type)}</div>
              <div class="t-notif-content">
                <div class="t-notif-title">${sanitize(n.title)}</div>
                <div class="t-notif-msg">${sanitize(n.message)}</div>
                <div class="t-notif-time">${timeAgo(n.created_at)}</div>
              </div>
            </div>
          `).join('')}</div>`
        }
      `;
    } catch (err) {
      content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  /* ============================================================
     PROFILE PAGE
  ============================================================ */
  async renderProfilePage(content) {
    if (!content) content = document.getElementById('t-page-content');
    content.innerHTML = `<div class="t-loading"><div class="t-spinner"></div> Loading profile...</div>`;

    try {
      const [profileData, vehicleData] = await Promise.all([
        tApi('GET', '/api/transport/drivers/me'),
        tApi('GET', '/api/transport/vehicles/me')
      ]);
      const d = profileData.driver;
      const v = vehicleData.vehicle;

      content.innerHTML = `
        <div class="t-section-title" style="margin-bottom:1rem;">👤 Profile</div>
        <div class="t-vehicle-card">
          <div class="t-profile-avatar">👤</div>
          <div class="t-profile-name">${sanitize(d.name)}</div>
          <div class="t-profile-role">Driver</div>
          <div style="margin-top:1.25rem; display:flex; flex-direction:column; gap:0.5rem; font-size:0.85rem; color:var(--text-secondary);">
            <div>📧 ${sanitize(d.email)}</div>
            <div>📱 ${sanitize(d.phone || 'Not provided')}</div>
            <div>⭐ Rating: ${d.rating?.toFixed(1) || '5.0'}</div>
            <div>🚚 Total Deliveries: ${d.total_deliveries || 0}</div>
            <div>💰 Total Earnings: ₹${parseFloat(d.total_earnings || 0).toLocaleString('en-IN')}</div>
          </div>
          <div style="margin-top:1.25rem; padding-top:1.25rem; border-top:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:0.5rem;">Vehicle</div>
            <div style="font-size:0.9rem; color:var(--text-primary);">
              ${VEHICLE_EMOJI_MAP[v?.type] || '🚛'} ${sanitize(v?.type || '—')} · ${sanitize(v?.number || '—')} · ${v?.capacity_kg || 0} kg
            </div>
          </div>
          <div style="margin-top:1.25rem;">
            <button class="t-btn t-btn-danger t-btn-sm" onclick="TransportDriverModule.logout()">🚪 Logout</button>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  logout() {
    if (confirm('Are you sure you want to logout?')) {
      clearAuth();
      tToast('Logged out successfully', 'info');
      const container = document.getElementById('page-transport');
      if (container) this.renderAuthScreen(container);
    }
  }
};

/* ============================================================
   EARNINGS HELPER (used by multiple pages)
   ============================================================ */
async function loadAndRenderEarnings(content) {
  if (!content) content = document.getElementById('t-page-content');

  try {
    const data = await tApi('GET', '/api/transport/drivers/me/earnings');

    content.innerHTML = `
      <div class="t-section-title" style="margin-bottom:1rem;">💰 Earnings</div>
      <div class="t-earnings-grid">
        <div class="t-earnings-card">
          <div class="t-earnings-period">Today</div>
          <div class="t-earnings-amount">₹${(data.today?.total || 0).toLocaleString('en-IN')}</div>
          <div class="t-earnings-count">${data.today?.count || 0} deliveries</div>
        </div>
        <div class="t-earnings-card">
          <div class="t-earnings-period">This Week</div>
          <div class="t-earnings-amount">₹${(data.thisWeek?.total || 0).toLocaleString('en-IN')}</div>
          <div class="t-earnings-count">${data.thisWeek?.count || 0} deliveries</div>
        </div>
        <div class="t-earnings-card">
          <div class="t-earnings-period">This Month</div>
          <div class="t-earnings-amount">₹${(data.thisMonth?.total || 0).toLocaleString('en-IN')}</div>
          <div class="t-earnings-count">${data.thisMonth?.count || 0} deliveries</div>
        </div>
        <div class="t-earnings-card total">
          <div class="t-earnings-period">All Time</div>
          <div class="t-earnings-amount">₹${(data.allTime?.total || 0).toLocaleString('en-IN')}</div>
          <div class="t-earnings-count">${data.allTime?.count || 0} deliveries</div>
        </div>
      </div>

      <div class="t-section-title" style="margin-bottom:0.75rem; margin-top:0.5rem;">Recent Payments</div>
      ${data.recent?.length > 0 ? `
        <div class="t-table-wrapper">
          <table class="t-table">
            <thead>
              <tr><th>Date</th><th>Base Fare</th><th>Distance</th><th>Load</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${data.recent.map(e => `
                <tr>
                  <td>${tDate(e.date)}</td>
                  <td>₹${parseFloat(e.base_fare || 0).toFixed(0)}</td>
                  <td>₹${parseFloat(e.distance_charge || 0).toFixed(0)}</td>
                  <td>₹${parseFloat(e.load_charge || 0).toFixed(0)}</td>
                  <td style="color:#68d391; font-weight:700;">₹${parseFloat(e.total || 0).toLocaleString('en-IN')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="t-empty"><div class="t-empty-icon">💳</div><div class="t-empty-title">No payments yet</div></div>`}
    `;
  } catch (err) {
    content.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
  }
}

/* ============================================================
   BADGE / UI HELPERS
   ============================================================ */
function updateDashboardBadge() {
  const badge = document.getElementById('t-req-badge');
  if (!badge) return;
  const count = TransportState.pendingRequests.length;
  badge.style.display = count > 0 ? 'inline' : 'none';
  badge.textContent = count;
}

function updateNotificationBadge(count) {
  const badge = document.getElementById('t-notif-badge');
  if (!badge) return;
  if (count === undefined) count = TransportState.notifications.filter(n => !n.is_read).length;
  badge.style.display = count > 0 ? 'inline' : 'none';
  badge.textContent = count;
}

function updateAvailabilityUI(status) {
  document.querySelectorAll('.t-avail-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-status') === status);
  });
  const badge = document.getElementById('current-status-badge');
  if (badge) { badge.className = `t-badge t-badge-${status}`; badge.textContent = status.toUpperCase(); }
}

function getNotifIcon(type) {
  const icons = {
    request_accepted: '🚚', delivered: '✅', request_cancelled: '❌',
    delivery_status: '📍', new_request: '🔔'
  };
  return icons[type] || '🔔';
}

/* ============================================================
   EMOJI MAPS (from existing data.js)
   ============================================================ */
const CROP_EMOJI_MAP = {
  Tomato: '🍅', Onion: '🧅', Potato: '🥔', Banana: '🍌', Chilli: '🌶️',
  Spinach: '🥬', Brinjal: '🍆', Carrot: '🥕', Cabbage: '🥬', Rice: '🌾',
  Wheat: '🌾', Sugarcane: '🎋', Coconut: '🥥', Drumstick: '🥒',
  Cauliflower: '🥦', Mango: '🥭', Groundnut: '🥜'
};

const VEHICLE_EMOJI_MAP = {
  'Auto': '🛺', 'Mini Truck': '🚛', 'Pickup Van': '🚐', 'Lorry': '🚚',
  'Tractor': '🚜', 'Other': '🚗'
};

/* ============================================================
   EXPOSE GLOBALLY
   ============================================================ */
window.TransportDriverModule = TransportDriverModule;
window.renderRequestsPage = () => TransportDriverModule.renderRequestsPage();
