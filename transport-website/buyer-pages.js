/* buyer-pages.js - Buyer views rendering */

const BuyerPages = {

  dashboard: async (container) => {
    container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-title">Active Orders</div>
          <div class="stat-value" id="dash-active-orders">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">Total Purchases</div>
          <div class="stat-value" id="dash-total-purchases">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">Amount Spent</div>
          <div class="stat-value" id="dash-spent">—</div>
        </div>
        <div class="stat-card" style="background:#E8F5E9;">
          <div class="stat-title" style="color:#2E7D32;">💰 Estimated Savings</div>
          <div class="stat-value" style="color:#2E7D32;" id="dash-saved">—</div>
        </div>
      </div>
      
      <div style="margin-top:30px;">
        <h3>Recent Orders</h3>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Crop</th>
                <th>Qty</th>
                <th>Farmer</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="dash-recent-orders-tbody">
              <tr><td colspan="6" class="text-center">Loading orders...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="margin-top:30px; background:#fff; border-radius:12px; padding:24px;">
        <h3 style="margin-top:0;">Quick Actions</h3>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="navigateTo('find-produce')">🌾 Find Produce</button>
          <button class="btn btn-outline" onclick="navigateTo('nearby')">📍 Nearby Farmers</button>
          <button class="btn btn-outline" onclick="navigateTo('orders')">📦 All Orders</button>
          <button class="btn btn-outline" onclick="navigateTo('analytics')">📊 Analytics</button>
        </div>
      </div>
    `;

    try {
      const uid = firebase.auth().currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');
      const snap = await firebase.firestore().collection('orders')
        .where('buyerId', '==', uid)
        .get();
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const at = a.createdAt?.toMillis?.() || 0;
          const bt = b.createdAt?.toMillis?.() || 0;
          return bt - at;
        });

      const active = orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
      document.getElementById('dash-active-orders').textContent = active;
      document.getElementById('dash-total-purchases').textContent = orders.length;

      let spent = 0, saved = 0;
      orders.forEach(o => {
        spent += (o.totalCost || 0);
        if (o.referencePricePerKg && o.quantity) {
          saved += Math.max(0, (o.referencePricePerKg - (o.pricePerKg || 0)) * o.quantity);
        }
      });

      document.getElementById('dash-spent').textContent = fmtCurrency(spent);
      document.getElementById('dash-saved').textContent = saved ? fmtCurrency(saved) : 'Unavailable';

      const tbody = document.getElementById('dash-recent-orders-tbody');
      tbody.innerHTML = '';
      if (orders.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:40px;">
              <div style="font-size:40px; margin-bottom:12px;">🌱</div>
              <div style="font-weight:600; color:#333;">No orders yet</div>
              <div style="color:#888; margin-top:4px; margin-bottom:16px;">Find fresh produce directly from farmers.</div>
              <button class="btn btn-primary" onclick="navigateTo('find-produce')">Find Produce</button>
            </td>
          </tr>`;
      } else {
        orders.slice(0, 5).forEach(o => {
          const tr = document.createElement('tr');
          const statusClass = o.status ? o.status.toLowerCase().replace(/_/g, '-') : '';
          tr.innerHTML = `
            <td><code>#${o.id.substring(0, 6).toUpperCase()}</code></td>
            <td>${escapeHtml(o.cropName || '—')}</td>
            <td>${o.quantity || 0} kg</td>
            <td>${escapeHtml(o.farmerName || '—')}</td>
            <td><span class="status-badge status-${statusClass}">${escapeHtml(o.status || '')}</span></td>
            <td><button class="btn btn-sm btn-outline" onclick="navigateTo('delivery', {orderId: '${o.id}'})">Track</button></td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
      const tbody = document.getElementById('dash-recent-orders-tbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#e53935;">Error loading orders: ${escapeHtml(e.message)}</td></tr>`;
    }
  },

  'find-produce': async (container) => {
    container.innerHTML = `
      <div style="background:#fff; border-radius:12px; padding:20px; margin-bottom:20px;">
        <h3 style="margin-top:0;">Search Produce</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input type="text" id="search-crop-input" class="form-input" placeholder="Tomato, onion, potato..." style="flex:1; min-width:200px;" />
          <select id="search-category" class="form-input" style="width:160px;">
            <option value="">All Categories</option>
            <option>Vegetable</option>
            <option>Fruit</option>
            <option>Grain</option>
            <option>Spice</option>
          </select>
          <button class="btn btn-primary" id="search-crop-btn">Search</button>
        </div>
      </div>
      <div id="produce-results" class="produce-grid">
        <div style="text-align:center; padding:40px; color:#888; width:100%;">
          <div style="font-size:32px; margin-bottom:8px;">🔍</div>
          <div>Loading available produce...</div>
        </div>
      </div>
    `;

    const renderCrops = async (query = '', category = '') => {
      const grid = document.getElementById('produce-results');
      if (!grid) return;
      grid.innerHTML = `<div style="text-align:center;padding:40px;color:#888;width:100%;">Loading...</div>`;

      try {
        let { crops: results } = await FirebaseService.crops.search({ query });

        if (query) {
          const q = query.toLowerCase();
          results = results.filter(c =>
            (c.cropName || '').toLowerCase().includes(q) ||
            (c.category || '').toLowerCase().includes(q)
          );
        }
        if (category) {
          results = results.filter(c => c.category === category);
        }

        const buyerLat = window.AppState?.buyer?.latitude || 9.92;
        const buyerLng = window.AppState?.buyer?.longitude || 78.11;
        results.forEach(c => {
          c.distanceKm = (c.location?.latitude && c.location?.longitude)
            ? haversineKm(buyerLat, buyerLng, c.location.latitude, c.location.longitude)
            : null;
        });
        results.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));

        grid.innerHTML = '';
        if (results.length === 0) {
          grid.innerHTML = `
            <div style="text-align:center; padding:60px; color:#888; width:100%;">
              <div style="font-size:40px; margin-bottom:12px;">🌾</div>
              <div style="font-weight:600;">No produce found</div>
              <div style="margin-top:4px; font-size:0.9rem;">Try a different search or clear filters.</div>
            </div>`;
          return;
        }

        results.forEach(crop => {
          const emoji = window.CROP_EMOJI?.[crop.cropName] || '🌱';
          const distStr = crop.distanceKm != null ? `${Math.round(crop.distanceKm)} km away` : '';
          const aiScore = window.BuyerAI ? BuyerAI.calculateScore(crop, 100).matchScore : '—';
          const div = document.createElement('div');
          div.className = 'produce-card';
          div.innerHTML = `
            <div style="height:120px;background:linear-gradient(135deg,#E8F5E9,#C8E6C9);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:48px;">
              ${emoji}
            </div>
            <div class="produce-info">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:10px;">
                <div class="produce-title">${escapeHtml(crop.cropName)}</div>
                <span style="background:#1B5E20;color:#fff;font-size:0.7rem;font-weight:700;padding:3px 7px;border-radius:12px;">${aiScore}%</span>
              </div>
              <div style="font-size:0.8rem;color:#888;margin:4px 0;">${escapeHtml(crop.farmerName || 'Farmer')}${distStr ? ' · ' + distStr : ''}</div>
              <div class="produce-price">₹${crop.pricePerKg}/kg</div>
              <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;">
                <span class="badge">📦 ${crop.availableQuantity} kg</span>
                <span class="badge">⭐ Grade ${escapeHtml(crop.quality || 'A')}</span>
                ${crop.category ? `<span class="badge">${escapeHtml(crop.category)}</span>` : ''}
              </div>
            </div>
            <button class="btn btn-primary btn-full" onclick="navigateTo('produce-details', {cropId: '${crop.id}'})">View Details & Order</button>
          `;
          grid.appendChild(div);
        });
      } catch (err) {
        if (grid) grid.innerHTML = `<div style="color:#e53935;padding:20px;width:100%;">Error: ${escapeHtml(err.message)}</div>`;
      }
    };

    document.getElementById('search-crop-btn').addEventListener('click', () => {
      renderCrops(
        document.getElementById('search-crop-input').value.trim(),
        document.getElementById('search-category').value
      );
    });
    document.getElementById('search-crop-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('search-crop-btn').click();
    });

    renderCrops();
  },

  'produce-details': async (container, params) => {
    container.innerHTML = `<div style="padding:40px;text-align:center;">Loading produce details...</div>`;
    if (!params?.cropId) { navigateTo('find-produce'); return; }

    try {
      const { crop } = await FirebaseService.crops.get(params.cropId);
      if (!crop) throw new Error('Produce not found.');

      const defaultQty = Math.min(500, crop.availableQuantity || 100);
      const aiResult = BuyerAI.calculateScore(crop, defaultQty);

      container.innerHTML = `
        <button class="btn btn-sm btn-outline" style="margin-bottom:20px;" onclick="navigateTo('find-produce')">← Back to Search</button>
        
        <div class="ai-recommendation-card" style="margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:20px;">
            <div>
              <h3 style="margin:0 0 8px;color:#1B5E20;">🤖 AI Best Match Score</h3>
              <ul style="margin:0 0 0 16px;padding:0;font-size:0.9rem;color:#2E7D32;">
                ${aiResult.reasons.length ? aiResult.reasons.map(r => `<li>✓ ${escapeHtml(r)}</li>`).join('') : '<li>Competitive price and quality.</li>'}
              </ul>
              <div style="margin-top:8px;font-size:0.75rem;color:#555;">
                Weights: Price 30% · Distance 20% · Freshness 15% · Quality 15% · Quantity 10% · Transport 10%
              </div>
            </div>
            <div style="text-align:center;flex-shrink:0;">
              <div class="ai-score">${aiResult.matchScore}%</div>
              <div style="font-size:0.75rem;color:#555;">Match</div>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:280px;background:#fff;padding:20px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
            <div style="font-size:48px;text-align:center;margin-bottom:12px;">${window.CROP_EMOJI?.[crop.cropName] || '🌱'}</div>
            <h2 style="margin:0 0 4px;">${escapeHtml(crop.cropName)}</h2>
            <p style="color:#888;margin:0 0 16px;font-size:0.9rem;">by ${escapeHtml(crop.farmerName || 'Farmer')} · ${escapeHtml(crop.location?.name || '')}</p>
            <div class="produce-price" style="margin-bottom:16px;">₹${crop.pricePerKg} / kg</div>
            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
              <tr><td style="padding:6px 0;color:#888;">Available</td><td style="padding:6px 0;font-weight:600;">${crop.availableQuantity} kg</td></tr>
              <tr><td style="padding:6px 0;color:#888;">Quality Grade</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(crop.quality || 'A')}</td></tr>
              <tr><td style="padding:6px 0;color:#888;">Category</td><td style="padding:6px 0;">${escapeHtml(crop.category || '—')}</td></tr>
              <tr><td style="padding:6px 0;color:#888;">Harvest Date</td><td style="padding:6px 0;">${crop.harvestDate ? new Date(crop.harvestDate).toLocaleDateString('en-IN') : '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#888;">Location</td><td style="padding:6px 0;">${escapeHtml(crop.location?.name || '—')}</td></tr>
            </table>
          </div>
          
          <div style="flex:1;min-width:280px;background:#fff;padding:20px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
            <h3 style="margin-top:0;">📋 Place Order</h3>
            <div class="form-group">
              <label class="form-label">Quantity Required (kg)</label>
              <input type="number" id="purchase-qty" class="form-input" value="${defaultQty}" min="1" max="${crop.availableQuantity}" />
              <span style="font-size:0.8rem;color:#888;">Max available: ${crop.availableQuantity} kg</span>
            </div>
            <div id="order-error-msg" class="form-error-box"></div>
            <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                <span>Product Cost:</span>
                <span id="calc-product-cost" style="font-weight:600;">₹${(crop.pricePerKg * defaultQty).toLocaleString('en-IN')}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                <span>Estimated Transport:</span>
                <span id="calc-transport-cost" style="font-weight:600;">₹${aiResult.transportCost}</span>
              </div>
              <div style="border-top:1px solid #ddd;margin:10px 0;"></div>
              <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.1rem;">
                <span>Total Cost:</span>
                <span id="calc-total-cost" style="color:#1B5E20;">₹${(crop.pricePerKg * defaultQty + aiResult.transportCost).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <button class="btn btn-primary btn-full" id="place-order-btn">✅ Place Order</button>
          </div>
        </div>
      `;

      document.getElementById('purchase-qty').addEventListener('input', (e) => {
        const qty = parseInt(e.target.value) || 0;
        const pCost = crop.pricePerKg * qty;
        const tResult = BuyerAI.calculateScore(crop, qty);
        document.getElementById('calc-product-cost').textContent = `₹${pCost.toLocaleString('en-IN')}`;
        document.getElementById('calc-transport-cost').textContent = `₹${tResult.transportCost}`;
        document.getElementById('calc-total-cost').textContent = `₹${(pCost + tResult.transportCost).toLocaleString('en-IN')}`;
      });

      document.getElementById('place-order-btn').addEventListener('click', async () => {
        const btn = document.getElementById('place-order-btn');
        const errBox = document.getElementById('order-error-msg');
        errBox.style.display = 'none';

        const qty = parseInt(document.getElementById('purchase-qty').value);
        if (!qty || qty < 1) { errBox.textContent = 'Please enter a valid quantity.'; errBox.style.display = 'block'; return; }
        if (qty > crop.availableQuantity) { errBox.textContent = `Only ${crop.availableQuantity} kg available.`; errBox.style.display = 'block'; return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span> Placing order...';

        try {
          const uid = firebase.auth().currentUser?.uid;
          if (!uid) throw new Error('Not authenticated. Please login again.');
          const pCost = crop.pricePerKg * qty;
          const aiRes = BuyerAI.calculateScore(crop, qty);
          const tCost = aiRes.transportCost;

          const newOrder = {
            buyerId: uid,
            farmerId: crop.farmerId,
            farmerName: crop.farmerName || 'Farmer',
            cropId: crop.id,
            cropName: crop.cropName,
            quantity: qty,
            pricePerKg: crop.pricePerKg,
            productCost: pCost,
            transportCost: tCost,
            totalCost: pCost + tCost,
            pickupLocation: crop.location || { name: 'Farm', latitude: 0, longitude: 0 },
            deliveryLocation: {
              name: window.AppState?.buyer?.address || 'Buyer Location',
              latitude: window.AppState?.buyer?.latitude || 9.92,
              longitude: window.AppState?.buyer?.longitude || 78.11
            },
            distanceKm: crop.distanceKm || 10
          };

          const { orderId } = await FirebaseService.orders.create(newOrder);

          Toast.show('Order placed! Farmer confirmation in progress...', 'success');

          navigateTo('delivery', { orderId });

        } catch (e) {
          console.error('Place order error:', e);
          errBox.textContent = 'Error placing order: ' + e.message;
          errBox.style.display = 'block';
          btn.disabled = false;
          btn.textContent = '✅ Place Order';
        }
      });

    } catch (err) {
      container.innerHTML = `<div style="padding:20px;"><button class="btn btn-sm btn-outline" onclick="navigateTo('find-produce')">← Back</button><div class="form-error-box" style="display:block;margin-top:16px;">${escapeHtml(err.message)}</div></div>`;
    }
  },

  orders: async (container) => {
    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;">
        <h3 style="margin-top:0;">My Orders</h3>
        <div id="orders-filter-tabs" style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" data-filter="">All</button>
          <button class="btn btn-sm btn-outline" data-filter="PENDING">Pending</button>
          <button class="btn btn-sm btn-outline" data-filter="FARMER_CONFIRMED">Confirmed</button>
          <button class="btn btn-sm btn-outline" data-filter="TRANSPORT_REQUESTED">Transport</button>
          <button class="btn btn-sm btn-outline" data-filter="DELIVERED">Delivered</button>
          <button class="btn btn-sm btn-outline" data-filter="COMPLETED">Completed</button>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Date</th>
                <th>Crop</th>
                <th>Farmer</th>
                <th>Product</th>
                <th>Transport</th>
                <th>Total</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="orders-tbody">
              <tr><td colspan="9" style="text-align:center;padding:30px;">Loading orders...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    let allOrders = [];

    const renderOrderTable = (filter) => {
      const tbody = document.getElementById('orders-tbody');
      if (!tbody) return;
      const orders = filter ? allOrders.filter(o => o.status === filter) : allOrders;
      tbody.innerHTML = '';
      if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#888;">
          <div style="font-size:32px;margin-bottom:8px;">📦</div>
          <div>${filter ? 'No orders with status: ' + filter : 'No orders yet.'}</div>
          <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="navigateTo('find-produce')">Find Produce</button>
        </td></tr>`;
        return;
      }
      orders.forEach(o => {
        const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-IN') : '—';
        const statusClass = (o.status || '').toLowerCase().replace(/_/g, '-');
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><code>#${o.id.substring(0, 6).toUpperCase()}</code></td>
          <td style="white-space:nowrap;">${date}</td>
          <td>${escapeHtml(o.cropName || '—')} (${o.quantity || 0}kg)</td>
          <td>${escapeHtml(o.farmerName || '—')}</td>
          <td>${fmtCurrency(o.productCost)}</td>
          <td>${fmtCurrency(o.transportCost)}</td>
          <td style="font-weight:700;">${fmtCurrency(o.totalCost)}</td>
          <td><span class="status-badge status-${statusClass}">${escapeHtml(o.status || '')}</span></td>
          <td><button class="btn btn-sm btn-outline" onclick="navigateTo('delivery',{orderId:'${o.id}'})">Track</button></td>
        `;
        tbody.appendChild(tr);
      });
    };

    document.getElementById('orders-filter-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      document.querySelectorAll('#orders-filter-tabs .btn').forEach(b => { b.className = 'btn btn-sm btn-outline'; });
      btn.className = 'btn btn-sm btn-primary';
      renderOrderTable(btn.getAttribute('data-filter'));
    });

    try {
      const uid = firebase.auth().currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');
      const snap = await firebase.firestore().collection('orders')
        .where('buyerId', '==', uid)
        .get();
      allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderOrderTable('');
    } catch (err) {
      const tbody = document.getElementById('orders-tbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="color:#e53935;text-align:center;padding:20px;">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  },

  delivery: async (container, params) => {
    if (!params?.orderId) { navigateTo('orders'); return; }
    container.innerHTML = `<div style="padding:40px;text-align:center;">Loading delivery status...</div>`;

    try {
      const db = firebase.firestore();
      const orderDoc = await db.collection('orders').doc(params.orderId).get();
      if (!orderDoc.exists) throw new Error('Order not found');
      const order = { id: orderDoc.id, ...orderDoc.data() };
      const transportReqId = order.transportRequestId;

      container.innerHTML = `
        <button class="btn btn-sm btn-outline" onclick="navigateTo('orders')" style="margin-bottom:20px;">← Back to Orders</button>
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:280px;background:#fff;padding:20px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
            <h3 style="margin-top:0;">Order #${order.id.substring(0, 6).toUpperCase()}</h3>
            <table style="width:100%;font-size:0.9rem;border-collapse:collapse;">
              <tr><td style="color:#888;padding:4px 0;">Crop</td><td style="font-weight:600;">${escapeHtml(order.cropName || '')} (${order.quantity} kg)</td></tr>
              <tr><td style="color:#888;padding:4px 0;">Farmer</td><td>${escapeHtml(order.farmerName || '')}</td></tr>
              <tr><td style="color:#888;padding:4px 0;">Product Cost</td><td>${fmtCurrency(order.productCost)}</td></tr>
              <tr><td style="color:#888;padding:4px 0;">Transport Cost</td><td>${fmtCurrency(order.transportCost)}</td></tr>
              <tr style="border-top:1px solid #eee;"><td style="color:#333;font-weight:700;padding:8px 0 4px;">Total</td><td style="font-weight:700;font-size:1.1rem;color:#1B5E20;">${fmtCurrency(order.totalCost)}</td></tr>
            </table>
            <hr style="margin:16px 0;">
            <h4 style="margin-bottom:12px;">Delivery Timeline</h4>
            <ul class="timeline" id="delivery-timeline">
              <li class="timeline-item active" id="tl-placed"><div class="timeline-marker">✓</div><div><strong>Order Placed</strong></div></li>
              <li class="timeline-item" id="tl-confirmed"><div class="timeline-marker">2</div><div><strong>Farmer Confirmed</strong></div></li>
              <li class="timeline-item" id="tl-transport"><div class="timeline-marker">3</div><div><strong>Transport Requested</strong></div></li>
              <li class="timeline-item" id="tl-assigned"><div class="timeline-marker">4</div><div><strong>Driver Assigned</strong><div id="driver-detail" style="font-size:0.8rem;color:#555;"></div></div></li>
              <li class="timeline-item" id="tl-picked"><div class="timeline-marker">5</div><div><strong>Picked Up</strong></div></li>
              <li class="timeline-item" id="tl-transit"><div class="timeline-marker">6</div><div><strong>In Transit</strong></div></li>
              <li class="timeline-item" id="tl-delivered"><div class="timeline-marker">7</div><div><strong>Delivered</strong></div></li>
            </ul>
            
            <div id="impact-card" style="display:none;margin-top:20px;background:#E8F5E9;border:2px solid #81C784;padding:16px;border-radius:10px;">
              <h4 style="color:#1B5E20;margin:0 0 8px;">💰 Purchase Impact</h4>
              <p style="margin:0;">Savings are shown only when a reference market price is available.</p>
            </div>
          </div>
        </div>
      `;

      // Apply initial status from order
      const activate = (ids) => ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('active'); el.querySelector('.timeline-marker').textContent = '✓'; }
      });
      const statusMap = {
        'FARMER_CONFIRMED': ['tl-confirmed'],
        'TRANSPORT_REQUESTED': ['tl-confirmed', 'tl-transport'],
        'DRIVER_ASSIGNED': ['tl-confirmed', 'tl-transport', 'tl-assigned'],
        'PICKED_UP': ['tl-confirmed', 'tl-transport', 'tl-assigned', 'tl-picked'],
        'IN_TRANSIT': ['tl-confirmed', 'tl-transport', 'tl-assigned', 'tl-picked', 'tl-transit'],
        'DELIVERED': ['tl-confirmed', 'tl-transport', 'tl-assigned', 'tl-picked', 'tl-transit', 'tl-delivered'],
        'COMPLETED': ['tl-confirmed', 'tl-transport', 'tl-assigned', 'tl-picked', 'tl-transit', 'tl-delivered'],
      };
      activate(statusMap[order.status] || []);
      if (['DELIVERED', 'COMPLETED'].includes(order.status)) {
        const ic = document.getElementById('impact-card');
        if (ic) ic.style.display = 'block';
      }

      // Realtime listener on order document
      db.collection('orders').doc(order.id).onSnapshot(snap => {
        if (!snap.exists) return;
        const oData = snap.data();
        if (oData.status) {
          activate(statusMap[oData.status] || []);
        }
        if (oData.driverName) {
          const dd = document.getElementById('driver-detail');
          if (dd) dd.textContent = `Driver: ${oData.driverName} (${oData.vehicleType || ''})`;
        }
        if (['DELIVERED', 'COMPLETED'].includes(oData.status)) {
          const ic = document.getElementById('impact-card');
          if (ic) ic.style.display = 'block';
        }
      });

      // Realtime listener on transport request
      const reqIdToListen = transportReqId || order.transportRequestId;
      if (reqIdToListen) {
        db.collection('transportRequests').doc(reqIdToListen)
          .onSnapshot(snap => {
            if (!snap.exists) return;
            const tStatus = snap.data().status;
            const driverName = snap.data().driverName || '';

            if (tStatus === 'accepted' || tStatus === 'driver_assigned') {
              activate(['tl-confirmed', 'tl-transport', 'tl-assigned']);
              if (driverName) { const dd = document.getElementById('driver-detail'); if (dd) dd.textContent = `Driver: ${driverName}`; }
            }
            if (tStatus === 'picked_up' || tStatus === 'reached_pickup') activate(['tl-confirmed', 'tl-transport', 'tl-assigned', 'tl-picked']);
            if (tStatus === 'in_transit') activate(['tl-confirmed', 'tl-transport', 'tl-assigned', 'tl-picked', 'tl-transit']);
            if (tStatus === 'delivered' || tStatus === 'reached_destination') {
              activate(['tl-confirmed', 'tl-transport', 'tl-assigned', 'tl-picked', 'tl-transit', 'tl-delivered']);
              const ic = document.getElementById('impact-card');
              if (ic) ic.style.display = 'block';
              db.collection('orders').doc(order.id).update({ status: 'DELIVERED', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => { });
            }
          });
      }

    } catch (e) {
      container.innerHTML = `<div style="padding:20px;"><button class="btn btn-sm btn-outline" onclick="navigateTo('orders')">← Back</button><div class="form-error-box" style="display:block;margin-top:16px;">${escapeHtml(e.message)}</div></div>`;
    }
  },

  nearby: async (container) => {
    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;">
        <h3 style="margin-top:0;">Nearby Farmers</h3>
        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">
          <label class="form-label" style="margin:0;">Radius:</label>
          <select id="nearby-radius" class="form-input" style="width:150px;">
            <option value="10">Within 10 km</option>
            <option value="25">Within 25 km</option>
            <option value="50" selected>Within 50 km</option>
            <option value="100">Within 100 km</option>
          </select>
          <button class="btn btn-primary" id="nearby-refresh-btn">Refresh</button>
        </div>
        <div id="nearby-results">
          <div style="text-align:center;padding:20px;">Loading nearby farmers...</div>
        </div>
      </div>
    `;

    const loadNearby = async () => {
      const radius = parseInt(document.getElementById('nearby-radius').value);
      const resultsEl = document.getElementById('nearby-results');
      if (!resultsEl) return;
      resultsEl.innerHTML = `<div style="text-align:center;padding:20px;">Finding farmers within ${radius} km...</div>`;

      try {
        const buyerLat = window.AppState?.buyer?.latitude || 9.92;
        const buyerLng = window.AppState?.buyer?.longitude || 78.11;

        let { crops: results } = await FirebaseService.crops.search();
        results.forEach(c => {
          c.distanceKm = (c.location?.latitude && c.location?.longitude)
            ? haversineKm(buyerLat, buyerLng, c.location.latitude, c.location.longitude)
            : 999;
        });
        results = results.filter(c => c.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm);

        if (results.length === 0) {
          resultsEl.innerHTML = `<div style="text-align:center;padding:40px;color:#888;">
            <div style="font-size:32px;margin-bottom:8px;">📍</div>
            <div>No farmers found within ${radius} km.</div>
          </div>`;
          return;
        }

        // Group by farmer
        const farmerMap = {};
        results.forEach(c => {
          const fid = c.farmerId || 'unknown';
          if (!farmerMap[fid]) farmerMap[fid] = { name: c.farmerName || 'Farmer', location: c.location, distanceKm: c.distanceKm, crops: [] };
          farmerMap[fid].crops.push(c);
        });

        resultsEl.innerHTML = Object.values(farmerMap).map(f => `
          <div style="border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-weight:700;font-size:1rem;">👨‍🌾 ${escapeHtml(f.name)}</div>
                <div style="color:#888;font-size:0.85rem;">📍 ${escapeHtml(f.location?.name || 'Unknown location')} · ${Math.round(f.distanceKm)} km away</div>
              </div>
              <span class="badge" style="background:#E8F5E9;color:#1B5E20;">${f.crops.length} crop${f.crops.length > 1 ? 's' : ''}</span>
            </div>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
              ${f.crops.map(c => `
                <div style="background:#f5f5f5;border-radius:8px;padding:8px 12px;font-size:0.85rem;cursor:pointer;" onclick="navigateTo('produce-details',{cropId:'${c.id}'})">
                  ${window.CROP_EMOJI?.[c.cropName] || '🌱'} <strong>${escapeHtml(c.cropName)}</strong>
                  <span style="color:#1B5E20;margin-left:4px;">₹${c.pricePerKg}/kg</span>
                  <span style="color:#888;margin-left:4px;">${c.availableQuantity}kg</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');
      } catch (err) {
        resultsEl.innerHTML = `<div style="color:#e53935;padding:16px;">Error: ${escapeHtml(err.message)}</div>`;
      }
    };

    document.getElementById('nearby-refresh-btn').addEventListener('click', loadNearby);
    document.getElementById('nearby-radius').addEventListener('change', loadNearby);
    loadNearby();
  },

  analytics: async (container) => {
    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;">
        <h3 style="margin-top:0;">📊 Purchase Analytics</h3>
        <div id="analytics-content"><div style="text-align:center;padding:30px;">Loading analytics...</div></div>
      </div>
    `;

    try {
      const uid = firebase.auth().currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');
      const snap = await firebase.firestore().collection('orders').where('buyerId', '==', uid).get();
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (orders.length === 0) {
        document.getElementById('analytics-content').innerHTML = `
          <div style="text-align:center;padding:60px;color:#888;">
            <div style="font-size:40px;margin-bottom:12px;">📊</div>
            <div style="font-weight:600;">No data yet</div>
            <div style="margin-top:4px;">Place your first order to see analytics.</div>
            <button class="btn btn-primary btn-sm" style="margin-top:16px;" onclick="navigateTo('find-produce')">Find Produce</button>
          </div>`;
        return;
      }

      let totalSpent = 0, totalTransport = 0, totalQty = 0, saved = 0;
      const cropCount = {}, farmerSet = new Set();
      orders.forEach(o => {
        totalSpent += o.totalCost || 0;
        totalTransport += o.transportCost || 0;
        totalQty += o.quantity || 0;
        if (o.referencePricePerKg && o.quantity) {
          saved += Math.max(0, (o.referencePricePerKg - (o.pricePerKg || 0)) * o.quantity);
        }
        if (o.cropName) cropCount[o.cropName] = (cropCount[o.cropName] || 0) + (o.quantity || 0);
        if (o.farmerId) farmerSet.add(o.farmerId);
      });

      const topCrop = Object.entries(cropCount).sort((a, b) => b[1] - a[1])[0];
      const avgPrice = totalQty > 0 ? (totalSpent / totalQty).toFixed(0) : '—';

      document.getElementById('analytics-content').innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-title">Total Orders</div><div class="stat-value">${orders.length}</div></div>
          <div class="stat-card"><div class="stat-title">Total Quantity</div><div class="stat-value">${totalQty.toLocaleString()} kg</div></div>
          <div class="stat-card"><div class="stat-title">Total Spent</div><div class="stat-value">${fmtCurrency(totalSpent)}</div></div>
          <div class="stat-card"><div class="stat-title">Transport Spending</div><div class="stat-value">${fmtCurrency(totalTransport)}</div></div>
          <div class="stat-card" style="background:#E8F5E9;"><div class="stat-title" style="color:#1B5E20;">💰 Estimated Savings</div><div class="stat-value" style="color:#1B5E20;">${saved ? fmtCurrency(saved) : 'Unavailable'}</div></div>
          <div class="stat-card"><div class="stat-title">Farmers Connected</div><div class="stat-value">${farmerSet.size}</div></div>
          <div class="stat-card"><div class="stat-title">Avg Price/kg</div><div class="stat-value">₹${avgPrice}</div></div>
          <div class="stat-card"><div class="stat-title">Top Crop</div><div class="stat-value" style="font-size:1.2rem;">${topCrop ? topCrop[0] : '—'}</div></div>
        </div>
        ${Object.keys(cropCount).length > 0 ? `
        <div style="margin-top:24px;padding:16px;background:#f9f9f9;border-radius:10px;">
          <h4 style="margin-top:0;">Crop Breakdown</h4>
          ${Object.entries(cropCount).map(([name, qty]) => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              <span style="width:100px;font-size:0.9rem;">${escapeHtml(name)}</span>
              <div style="flex:1;background:#e0e0e0;border-radius:4px;height:14px;overflow:hidden;">
                <div style="width:${Math.min(100, Math.round(qty / totalQty * 100))}%;height:100%;background:#2E7D32;border-radius:4px;transition:width 0.6s;"></div>
              </div>
              <span style="font-size:0.85rem;color:#555;width:70px;text-align:right;">${qty} kg</span>
            </div>
          `).join('')}
        </div>` : ''}
      `;
    } catch (err) {
      document.getElementById('analytics-content').innerHTML = `<div style="color:#e53935;padding:16px;">Error: ${escapeHtml(err.message)}</div>`;
    }
  },

  profile: async (container) => {
    const buyer = window.AppState?.buyer || {};
    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:620px;">
        <h3 style="margin-top:0;">My Profile</h3>
        <form id="profile-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Full Name *</label>
              <input type="text" id="pf-name" class="form-input" value="${escapeHtml(buyer.name || '')}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Business / Company</label>
              <input type="text" id="pf-business" class="form-input" value="${escapeHtml(buyer.businessName || '')}" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="pf-email" class="form-input" value="${escapeHtml(buyer.email || firebase.auth().currentUser?.email || '')}" readonly style="opacity:0.7;" />
            </div>
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input type="tel" id="pf-phone" class="form-input" value="${escapeHtml(buyer.phone || '')}" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Address</label>
            <input type="text" id="pf-address" class="form-input" value="${escapeHtml(buyer.address || '')}" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">City</label>
              <input type="text" id="pf-city" class="form-input" value="${escapeHtml(buyer.city || '')}" />
            </div>
            <div class="form-group">
              <label class="form-label">District</label>
              <input type="text" id="pf-district" class="form-input" value="${escapeHtml(buyer.district || '')}" />
            </div>
            <div class="form-group">
              <label class="form-label">Pincode</label>
              <input type="text" id="pf-pincode" class="form-input" value="${escapeHtml(buyer.pincode || '')}" maxlength="6" />
            </div>
          </div>
          <div id="profile-error" class="form-error-box"></div>
          <button type="submit" class="btn btn-primary" id="save-profile-btn">💾 Save Changes</button>
        </form>
      </div>
    `;

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('save-profile-btn');
      const errBox = document.getElementById('profile-error');
      errBox.style.display = 'none';
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner"></span> Saving...';

      try {
        const uid = firebase.auth().currentUser?.uid;
        if (!uid) throw new Error('Not authenticated');
        const update = {
          name: document.getElementById('pf-name').value.trim(),
          businessName: document.getElementById('pf-business').value.trim(),
          phone: document.getElementById('pf-phone').value.trim(),
          address: document.getElementById('pf-address').value.trim(),
          city: document.getElementById('pf-city').value.trim(),
          district: document.getElementById('pf-district').value.trim(),
          pincode: document.getElementById('pf-pincode').value.trim(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await firebase.firestore().collection('buyers').doc(uid).update(update);
        if (window.AppState) window.AppState.buyer = { ...window.AppState.buyer, ...update };
        Toast.show('Profile updated successfully!', 'success');
      } catch (err) {
        errBox.textContent = 'Failed to save: ' + err.message;
        errBox.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = '💾 Save Changes';
      }
    });
  }
};

// Make globally accessible for dashboard navigation.
window.BuyerPages = BuyerPages;
