/* ============================================================
   AgriBridge Transport — Farmer/Vendor Transport Module
   Integrates with the existing AgriBridge farmer dashboard.
   Allows farmers to create transport requests and track deliveries.
   ============================================================ */

'use strict';

/* ============================================================
   FARMER TRANSPORT MODULE
   ============================================================ */
const TransportFarmerModule = {

  /* ---- Called from app.js renderTransport() ---- */
  async init(containerEl) {
    // If already authenticated as a farmer, show farmer view
    // If not authenticated, show auth + farmer features
    await this.render(containerEl);
  },

  async render(containerEl) {
    containerEl.innerHTML = `
      <div class="t-farmer-section">

        <!-- Hero -->
        <div class="t-farmer-hero">
          <div>
            <h2>🚚 Transport & Logistics</h2>
            <p>Request real-time transport for your produce. Track your delivery live.</p>
          </div>
          <button class="t-btn t-btn-primary" onclick="TransportFarmerModule.openRequestModal()">
            + New Transport Request
          </button>
        </div>

        <!-- Connection Status -->
        <div class="t-connection-bar disconnected" id="t-farmer-conn-bar">
          <span class="t-live-dot"></span>
          <span class="t-conn-label">Connecting...</span>
        </div>

        <!-- My Active Requests -->
        <div class="t-section-header" style="margin-top:1rem;">
          <div>
            <div class="t-section-title">My Transport Requests</div>
            <div class="t-section-sub">Real-time status updates</div>
          </div>
          <button class="t-btn t-btn-secondary t-btn-sm" onclick="TransportFarmerModule.loadRequests()">↻ Refresh</button>
        </div>
        <div id="t-farmer-requests-area">
          <div class="t-loading"><div class="t-spinner"></div> Loading...</div>
        </div>

        <!-- Available Drivers -->
        <div class="t-section-header" style="margin-top:1.5rem;">
          <div class="t-section-title">Available Drivers</div>
        </div>
        <div id="t-farmer-drivers-area">
          <div class="t-loading"><div class="t-spinner"></div> Loading...</div>
        </div>

        <!-- Live Tracking Map (shown when delivery is active) -->
        <div id="t-farmer-tracking-section" style="display:none; margin-top:1.5rem;">
          <div class="t-section-title" style="margin-bottom:1rem;">📍 Live Tracking</div>
          <div class="t-map-container">
            <div class="t-map-header">
              <h3>Driver Location</h3>
              <span style="font-size:0.8rem; color:var(--text-secondary);">Updates live</span>
            </div>
            <div id="transport-map-farmer"></div>
            <div class="t-map-info">
              <div class="t-map-stat">
                <span class="t-map-stat-label">Status</span>
                <span class="t-map-stat-value" id="t-farmer-map-status">—</span>
              </div>
              <div class="t-map-stat">
                <span class="t-map-stat-label">ETA</span>
                <span class="t-map-stat-value" id="t-farmer-map-eta">—</span>
              </div>
              <div class="t-map-stat">
                <span class="t-map-stat-label">Distance</span>
                <span class="t-map-stat-value" id="t-farmer-map-dist">—</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- REQUEST MODAL -->
      <div id="t-request-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:1000; overflow-y:auto; padding:2rem 1rem;">
        <div style="max-width:520px; margin:0 auto; background:var(--bg-card,#1e2235); border-radius:20px; padding:2rem; border:1px solid rgba(255,255,255,0.1);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
            <h3 style="font-size:1.1rem; font-weight:700;">🚚 New Transport Request</h3>
            <button onclick="TransportFarmerModule.closeRequestModal()" style="background:none; border:none; color:var(--text-secondary); font-size:1.4rem; cursor:pointer;">×</button>
          </div>

          <!-- Auth check for farmer -->
          <div id="t-farmer-auth-section">
            <!-- Will be filled based on auth state -->
          </div>

          <form id="t-request-form" onsubmit="TransportFarmerModule.submitRequest(event)" style="display:none;">
            <div class="t-form-group">
              <label>Crop / Produce</label>
              <select id="t-req-crop" required>
                <option value="">Select crop...</option>
                <option value="Tomato">🍅 Tomato</option>
                <option value="Onion">🧅 Onion</option>
                <option value="Potato">🥔 Potato</option>
                <option value="Banana">🍌 Banana</option>
                <option value="Chilli">🌶️ Chilli</option>
                <option value="Spinach">🥬 Spinach</option>
                <option value="Brinjal">🍆 Brinjal</option>
                <option value="Carrot">🥕 Carrot</option>
                <option value="Cabbage">🥬 Cabbage</option>
                <option value="Rice">🌾 Rice</option>
                <option value="Wheat">🌾 Wheat</option>
                <option value="Coconut">🥥 Coconut</option>
                <option value="Mango">🥭 Mango</option>
                <option value="Groundnut">🥜 Groundnut</option>
                <option value="Other">🌿 Other</option>
              </select>
            </div>
            <div class="t-form-group">
              <label>Quantity (kg)</label>
              <input type="number" id="t-req-qty" min="1" max="50000" placeholder="e.g. 500" required>
            </div>
            <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.75rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">📦 Pickup Location</div>
            <div class="t-form-row">
              <div class="t-form-group">
                <label>Latitude</label>
                <input type="number" step="any" id="t-req-pickup-lat" placeholder="e.g. 9.9252" required>
              </div>
              <div class="t-form-group">
                <label>Longitude</label>
                <input type="number" step="any" id="t-req-pickup-lng" placeholder="e.g. 78.1198" required>
              </div>
            </div>
            <div class="t-form-group">
              <label>Pickup Address</label>
              <input type="text" id="t-req-pickup-addr" placeholder="Farm location, village, district" required>
            </div>
            <button type="button" class="t-btn t-btn-secondary t-btn-sm" onclick="TransportFarmerModule.useCurrentLocation()" style="margin-bottom:1rem;">
              📍 Use My Current Location
            </button>
            <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.75rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">🏁 Destination</div>
            <div class="t-form-row">
              <div class="t-form-group">
                <label>Latitude</label>
                <input type="number" step="any" id="t-req-dest-lat" placeholder="e.g. 9.9581" required>
              </div>
              <div class="t-form-group">
                <label>Longitude</label>
                <input type="number" step="any" id="t-req-dest-lng" placeholder="e.g. 78.0895" required>
              </div>
            </div>
            <div class="t-form-group">
              <label>Destination Address</label>
              <input type="text" id="t-req-dest-addr" placeholder="Market / warehouse / buyer address" required>
            </div>
            <div class="t-form-group">
              <label>Notes (optional)</label>
              <textarea id="t-req-notes" rows="2" placeholder="Special instructions, contact, etc."></textarea>
            </div>

            <!-- Cost estimate preview -->
            <div id="t-cost-preview" style="display:none; background:rgba(56,161,105,0.1); border:1px solid rgba(56,161,105,0.3); border-radius:10px; padding:0.75rem; margin-bottom:1rem; font-size:0.85rem;">
              <div style="font-weight:700; color:#68d391; margin-bottom:0.3rem;">💰 Estimated Cost</div>
              <div id="t-cost-details" style="color:var(--text-secondary);"></div>
            </div>

            <div style="display:flex; gap:0.75rem;">
              <button type="submit" class="t-btn t-btn-primary" id="t-req-submit-btn">🚚 Find Drivers</button>
              <button type="button" class="t-btn t-btn-secondary" onclick="TransportFarmerModule.estimateCostPreview()">💡 Estimate Cost</button>
            </div>
          </form>

          <div id="t-req-success" style="display:none; text-align:center; padding:1.5rem;">
            <div style="font-size:2.5rem;">✅</div>
            <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary); margin-top:0.5rem;">Request Submitted!</div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.5rem;" id="t-req-success-msg"></div>
            <button class="t-btn t-btn-secondary" style="margin-top:1rem;" onclick="TransportFarmerModule.closeRequestModal()">Close</button>
          </div>
        </div>
      </div>
    `;

    // Pre-fill farmer profile from existing app data
    this.prefillFarmerData();

    // Init Socket for real-time
    this.initFarmerSocket();

    // Load data
    await Promise.all([
      this.loadRequests(),
      this.loadAvailableDrivers()
    ]);
  },

  /* ---- Pre-fill from existing AgriBridge data ---- */
  prefillFarmerData() {
    // Uses farmerProfile from data.js (existing app)
    if (typeof farmerProfile !== 'undefined') {
      setTimeout(() => {
        const latEl = document.getElementById('t-req-pickup-lat');
        const lngEl = document.getElementById('t-req-pickup-lng');
        const addrEl = document.getElementById('t-req-pickup-addr');
        if (latEl) latEl.value = farmerProfile.lat;
        if (lngEl) lngEl.value = farmerProfile.lng;
        if (addrEl) addrEl.value = `${farmerProfile.village}, ${farmerProfile.district}`;

        // Pre-select first available crop
        if (typeof myCrops !== 'undefined' && myCrops.length > 0) {
          const cropSel = document.getElementById('t-req-crop');
          if (cropSel) {
            const firstCrop = myCrops.find(c => c.status === 'available');
            if (firstCrop) cropSel.value = firstCrop.name;
            // Pre-fill quantity
            const qtyEl = document.getElementById('t-req-qty');
            if (qtyEl && firstCrop) qtyEl.value = firstCrop.quantity;
          }
        }
      }, 100);
    }
  },

  /* ---- Socket.IO for farmer ---- */
  initFarmerSocket() {
    // Reuse existing token if farmer is authenticated, else anonymous
    const token = localStorage.getItem('transport_token');
    const socket = io(TRANSPORT_CONFIG.SOCKET_URL, {
      auth: token ? { token } : {},
      reconnection: true,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      const bar = document.getElementById('t-farmer-conn-bar');
      if (bar) {
        bar.className = 't-connection-bar connected';
        bar.innerHTML = '<span class="t-live-dot"></span><span class="t-conn-label">🟢 Live — Real-time active</span>';
      }
    });

    socket.on('disconnect', () => {
      const bar = document.getElementById('t-farmer-conn-bar');
      if (bar) {
        bar.className = 't-connection-bar disconnected';
        bar.innerHTML = '<span class="t-live-dot"></span><span class="t-conn-label">🔴 Offline</span>';
      }
    });

    socket.io.on('reconnect_attempt', () => {
      const bar = document.getElementById('t-farmer-conn-bar');
      if (bar) {
        bar.className = 't-connection-bar reconnecting';
        bar.innerHTML = '<span class="t-live-dot"></span><span class="t-conn-label">🟠 Reconnecting...</span>';
      }
    });

    // Farmer gets notified when driver accepts
    socket.on('transport:request_accepted', (data) => {
      tToast(`🚚 Driver accepted your request! ETA: ${data.eta ? new Date(data.eta).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}) : 'Soon'}`, 'success', 6000);
      this.loadRequests();
    });

    // Delivery status changes
    socket.on('delivery:status_changed', (data) => {
      const msgs = {
        reached_pickup: '📍 Driver has arrived at pickup location',
        picked_up: '📦 Goods have been picked up!',
        in_transit: '🚛 Your order is in transit',
        reached_destination: '📍 Driver approaching destination',
        delivered: '✅ Delivery completed!'
      };
      const msg = msgs[data.status];
      if (msg) tToast(msg, 'info', 5000);

      // Update status display
      this.loadRequests();

      // Update map status
      const statusEl = document.getElementById('t-farmer-map-status');
      if (statusEl) statusEl.textContent = data.status.replace(/_/g,' ').toUpperCase();
    });

    // Live location update
    socket.on('delivery:location_updated', (data) => {
      if (this._farmerMap && this._farmerDriverMarker) {
        this._farmerDriverMarker.setLatLng([data.lat, data.lng]);
      }
    });

    this._socket = socket;
  },

  /* ---- Load farmer's requests ---- */
  async loadRequests() {
    const area = document.getElementById('t-farmer-requests-area');
    if (!area) return;

    const token = localStorage.getItem('transport_token');
    if (!token) {
      area.innerHTML = `
        <div style="background:rgba(66,153,225,0.1); border:1px solid rgba(66,153,225,0.3); border-radius:12px; padding:1.25rem; font-size:0.85rem; color:var(--text-secondary);">
          ℹ️ <strong style="color:var(--text-primary);">Sign in to create and track transport requests.</strong><br>
          <button class="t-btn t-btn-secondary t-btn-sm" style="margin-top:0.75rem;" onclick="TransportFarmerModule.openRequestModal()">
            🔐 Sign In / Register
          </button>
        </div>
      `;
      return;
    }

    try {
      const data = await tApi('GET', '/api/transport/requests');
      const requests = data.requests || [];

      if (requests.length === 0) {
        area.innerHTML = `
          <div class="t-empty">
            <div class="t-empty-icon">📭</div>
            <div class="t-empty-title">No Transport Requests Yet</div>
            <div class="t-empty-msg">Create a request to get drivers assigned to your delivery.</div>
          </div>
        `;
        return;
      }

      area.innerHTML = requests.map(req => {
        const statusMsgs = {
          requested: 'Waiting for driver...',
          accepted: 'Driver found!',
          driver_assigned: 'Driver on the way',
          reached_pickup: '📍 Driver at your location',
          picked_up: '📦 Goods loaded',
          in_transit: '🚛 In transit to destination',
          reached_destination: '📍 At destination',
          delivered: '✅ Delivered',
          cancelled: '❌ Cancelled'
        };

        return `
          <div class="t-request-card">
            <div class="t-request-header">
              <span class="t-request-id">REQ-${req.id.slice(-8).toUpperCase()}</span>
              <span class="t-badge t-badge-${req.status}">${req.status.replace(/_/g,' ').toUpperCase()}</span>
            </div>
            <div class="t-request-crop">${req.crop} — ${parseFloat(req.quantity_kg)} kg</div>
            <div style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:0.75rem;">
              ${statusMsgs[req.status] || req.status}
            </div>
            <div class="t-request-route">
              <div class="t-route-point">📦 <strong>${sanitize(req.pickup_address)}</strong></div>
              <div class="t-route-line"></div>
              <div class="t-route-point">🏁 <strong>${sanitize(req.destination_address)}</strong></div>
            </div>
            <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
              <span style="font-size:0.82rem; color:var(--text-secondary);">
                💰 Est. ₹${parseFloat(req.estimated_cost || 0).toLocaleString('en-IN')}
                · 📏 ${req.estimated_distance_km || '~'} km
              </span>
              ${['driver_assigned','reached_pickup','picked_up','in_transit','reached_destination'].includes(req.status) ? `
                <button class="t-btn t-btn-secondary t-btn-sm"
                  onclick="TransportFarmerModule.showTrackingMap('${req.id}')">
                  🗺️ Track Live
                </button>
              ` : ''}
              ${req.status === 'requested' ? `
                <button class="t-btn t-btn-danger t-btn-sm"
                  onclick="TransportFarmerModule.cancelRequest('${req.id}')">
                  ❌ Cancel
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      area.innerHTML = `<div class="t-location-error">❌ ${sanitize(err.message)}</div>`;
    }
  },

  /* ---- Load available drivers list ---- */
  async loadAvailableDrivers() {
    const area = document.getElementById('t-farmer-drivers-area');
    if (!area) return;

    try {
      // Need auth token for this endpoint
      const token = localStorage.getItem('transport_token');
      if (!token) {
        area.innerHTML = `<div style="font-size:0.85rem; color:var(--text-secondary);">Sign in to see available drivers.</div>`;
        return;
      }

      const data = await tApi('GET', '/api/transport/drivers/available');
      const drivers = data.drivers || [];

      if (drivers.length === 0) {
        area.innerHTML = `<div style="font-size:0.85rem; color:var(--text-secondary);">No drivers currently available.</div>`;
        return;
      }

      area.innerHTML = `
        <div class="t-cards-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px,1fr));">
          ${drivers.map(d => `
            <div class="t-card">
              <div style="font-size:1.3rem;">🚗</div>
              <div style="font-weight:700; margin-top:0.4rem;">${sanitize(d.name)}</div>
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">
                ${sanitize(d.vehicleType || '—')} · ${d.capacityKg || 0} kg
              </div>
              <div style="font-size:0.8rem; margin-top:0.3rem; color:#68d391;">⭐ ${(d.rating || 5).toFixed(1)}</div>
              <div class="t-badge t-badge-available" style="margin-top:0.4rem;">AVAILABLE</div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      area.innerHTML = `<div style="font-size:0.85rem; color:var(--text-secondary);">Unable to load drivers.</div>`;
    }
  },

  /* ---- Transport Request Modal ---- */
  openRequestModal() {
    document.getElementById('t-request-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';

    const token = localStorage.getItem('transport_token');
    const authSection = document.getElementById('t-farmer-auth-section');
    const form = document.getElementById('t-request-form');

    if (!token) {
      // Show auth form for farmer/vendor
      authSection.innerHTML = `
        <div style="background:rgba(66,153,225,0.1); border:1px solid rgba(66,153,225,0.3); border-radius:12px; padding:1.25rem; margin-bottom:1rem;">
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1rem;">Sign in to your transport account to submit requests:</p>
          <div class="t-form-group">
            <label>Email</label>
            <input type="email" id="t-farmer-email" placeholder="farmer@example.com">
          </div>
          <div class="t-form-group">
            <label>Password</label>
            <input type="password" id="t-farmer-password" placeholder="••••••••">
          </div>
          <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
            <button class="t-btn t-btn-primary t-btn-sm" onclick="TransportFarmerModule.farmerLogin()">Sign In</button>
            <button class="t-btn t-btn-secondary t-btn-sm" onclick="TransportFarmerModule.farmerRegister()">Register as Farmer</button>
          </div>
          <div id="t-farmer-auth-err" style="display:none; color:#fc8181; font-size:0.82rem; margin-top:0.75rem;"></div>
        </div>
      `;
      form.style.display = 'none';
    } else {
      authSection.innerHTML = '';
      form.style.display = 'block';
      document.getElementById('t-req-success').style.display = 'none';
      this.prefillFarmerData();
    }
  },

  closeRequestModal() {
    document.getElementById('t-request-modal').style.display = 'none';
    document.body.style.overflow = '';
  },

  async farmerLogin() {
    const email = document.getElementById('t-farmer-email')?.value;
    const password = document.getElementById('t-farmer-password')?.value;
    const errEl = document.getElementById('t-farmer-auth-err');

    if (!email || !password) return;

    try {
      const data = await tApi('POST', '/api/transport/auth/login', { email, password });
      saveAuth(data.token, data.user, data.driverId);
      tToast(`Welcome, ${data.user.name}!`, 'success');

      // Show the form
      document.getElementById('t-farmer-auth-section').innerHTML = '';
      document.getElementById('t-request-form').style.display = 'block';
      this.prefillFarmerData();
      this.loadRequests();
      this.loadAvailableDrivers();
    } catch (err) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = err.message; }
    }
  },

  async farmerRegister() {
    const email = document.getElementById('t-farmer-email')?.value;
    const password = document.getElementById('t-farmer-password')?.value;
    if (!email || !password) return;

    const name = typeof farmerProfile !== 'undefined' ? farmerProfile.name : 'Farmer';
    const phone = typeof farmerProfile !== 'undefined' ? farmerProfile.contact : '';

    try {
      const data = await tApi('POST', '/api/transport/auth/register', {
        email, password, name, phone, role: 'farmer'
      });
      saveAuth(data.token, data.user, data.driverId);
      tToast('Account created!', 'success');

      document.getElementById('t-farmer-auth-section').innerHTML = '';
      document.getElementById('t-request-form').style.display = 'block';
      this.prefillFarmerData();
    } catch (err) {
      const errEl = document.getElementById('t-farmer-auth-err');
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = err.message; }
    }
  },

  useCurrentLocation() {
    if (!navigator.geolocation) {
      tToast('Geolocation not supported', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        document.getElementById('t-req-pickup-lat').value = lat.toFixed(6);
        document.getElementById('t-req-pickup-lng').value = lng.toFixed(6);
        tToast('Current location set as pickup', 'success');
        this.estimateCostPreview();
      },
      (err) => {
        tToast('Could not get location: ' + err.message, 'error');
      }
    );
  },

  estimateCostPreview() {
    const pickupLat = parseFloat(document.getElementById('t-req-pickup-lat')?.value);
    const pickupLng = parseFloat(document.getElementById('t-req-pickup-lng')?.value);
    const destLat = parseFloat(document.getElementById('t-req-dest-lat')?.value);
    const destLng = parseFloat(document.getElementById('t-req-dest-lng')?.value);
    const qty = parseFloat(document.getElementById('t-req-qty')?.value);

    if (!pickupLat || !destLat || !qty) return;

    // Haversine distance
    const R = 6371;
    const dLat = (destLat - pickupLat) * Math.PI / 180;
    const dLng = (destLng - pickupLng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(pickupLat*Math.PI/180)*Math.cos(destLat*Math.PI/180)*Math.sin(dLng/2)**2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const BASE = 50, PER_KM = 12, PER_100KG = 8;
    const base = BASE;
    const distCharge = Math.round(distKm * PER_KM * 10) / 10;
    const loadCharge = Math.ceil(qty / 100) * PER_100KG;
    const total = Math.max(base + distCharge + loadCharge, 80);

    const preview = document.getElementById('t-cost-preview');
    const details = document.getElementById('t-cost-details');
    if (preview && details) {
      preview.style.display = 'block';
      details.innerHTML = `
        Base fare: ₹${base} + Distance (${distKm.toFixed(1)} km): ₹${distCharge} + Load (${qty} kg): ₹${loadCharge}
        <br><strong style="color:#68d391;">Total: ₹${total.toLocaleString('en-IN')}</strong>
      `;
    }
  },

  async submitRequest(e) {
    e.preventDefault();
    const btn = document.getElementById('t-req-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Finding drivers...';

    try {
      const payload = {
        crop: document.getElementById('t-req-crop').value,
        quantity_kg: parseFloat(document.getElementById('t-req-qty').value),
        pickup_lat: parseFloat(document.getElementById('t-req-pickup-lat').value),
        pickup_lng: parseFloat(document.getElementById('t-req-pickup-lng').value),
        pickup_address: document.getElementById('t-req-pickup-addr').value,
        destination_lat: parseFloat(document.getElementById('t-req-dest-lat').value),
        destination_lng: parseFloat(document.getElementById('t-req-dest-lng').value),
        destination_address: document.getElementById('t-req-dest-addr').value,
        notes: document.getElementById('t-req-notes').value
      };

      const data = await tApi('POST', '/api/transport/requests', payload);

      document.getElementById('t-request-form').style.display = 'none';
      const successEl = document.getElementById('t-req-success');
      successEl.style.display = 'block';
      document.getElementById('t-req-success-msg').innerHTML = `
        ${data.eligibleDriverCount || 0} eligible driver(s) notified in real time.<br>
        Est. cost: ₹${parseFloat(data.request?.estimated_cost || 0).toLocaleString('en-IN')}
      `;

      tToast(`✅ Request submitted! ${data.eligibleDriverCount || 0} drivers notified.`, 'success', 6000);
      this.loadRequests();
    } catch (err) {
      tToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '🚚 Find Drivers';
    }
  },

  async cancelRequest(requestId) {
    if (!confirm('Cancel this transport request?')) return;
    try {
      await tApi('DELETE', `/api/transport/requests/${requestId}`);
      tToast('Request cancelled', 'info');
      this.loadRequests();
    } catch (err) {
      tToast(err.message, 'error');
    }
  },

  /* ---- Show live tracking map for a request ---- */
  async showTrackingMap(requestId) {
    if (!window.L) { tToast('Map not loaded', 'error'); return; }

    const section = document.getElementById('t-farmer-tracking-section');
    if (section) section.style.display = 'block';

    try {
      const reqData = await tApi('GET', `/api/transport/requests/${requestId}`);
      const req = reqData.request;

      // Get delivery details
      const delivData = await tApi('GET', '/api/transport/deliveries/active');
      const delivery = delivData.delivery;

      // Init map
      if (this._farmerMap) {
        this._farmerMap.remove();
        this._farmerMap = null;
      }

      const map = L.map('transport-map-farmer', {
        center: [req.pickup_lat, req.pickup_lng],
        zoom: 12
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      this._farmerMap = map;

      // Pickup marker
      L.marker([req.pickup_lat, req.pickup_lng], {
        icon: L.divIcon({
          html: '<div style="background:#38a169;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;"><span style="transform:rotate(45deg)">📦</span></div>',
          className: '', iconSize: [32,32], iconAnchor: [16,32], popupAnchor: [0,-32]
        })
      }).addTo(map).bindPopup(`<b>📦 Pickup</b><br>${sanitize(req.pickup_address)}`);

      // Destination marker
      L.marker([req.destination_lat, req.destination_lng], {
        icon: L.divIcon({
          html: '<div style="background:#e53e3e;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;"><span style="transform:rotate(45deg)">🏁</span></div>',
          className: '', iconSize: [32,32], iconAnchor: [16,32], popupAnchor: [0,-32]
        })
      }).addTo(map).bindPopup(`<b>🏁 Destination</b><br>${sanitize(req.destination_address)}`);

      // Driver marker (if location available)
      if (delivery?.driver_id) {
        const driverMarker = L.marker([req.pickup_lat - 0.01, req.pickup_lng - 0.01], {
          icon: L.divIcon({
            html: '<div style="background:#4299e1;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;"><span style="transform:rotate(45deg)">🚚</span></div>',
            className: '', iconSize: [32,32], iconAnchor: [16,32], popupAnchor: [0,-32]
          })
        }).addTo(map).bindPopup('<b>🚚 Driver</b>');
        this._farmerDriverMarker = driverMarker;

        // Join delivery room to get location updates
        if (this._socket && delivery?.id) {
          this._socket.emit('delivery:join', { deliveryId: delivery.id });
        }
      }

      // Status
      const statusEl = document.getElementById('t-farmer-map-status');
      if (statusEl) statusEl.textContent = (req.status || 'unknown').replace(/_/g,' ').toUpperCase();

      section.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      tToast('Could not load tracking map: ' + err.message, 'error');
    }
  }
};

/* ============================================================
   MAIN ENTRY POINT
   Called from app.js renderTransport()
   ============================================================ */
async function renderTransportModule() {
  const container = document.getElementById('page-transport');
  if (!container) return;

  const user = JSON.parse(localStorage.getItem('transport_user') || 'null');
  const token = localStorage.getItem('transport_token');

  if (token && user?.role === 'driver') {
    await TransportDriverModule.init(container);
  } else {
    await TransportFarmerModule.init(container);
  }
}

/* ---- Expose globally ---- */
window.TransportFarmerModule = TransportFarmerModule;
window.renderTransportModule = renderTransportModule;
