/* farmer-pages-orders.js — Orders, Order Details, Transport */

const FarmerPagesOrders = {

  /* ──────────────── MY ORDERS ──────────────── */
  orders: async (container) => {
    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;">
        <h3 style="margin-top:0;">My Orders</h3>
        <div id="f-orders-tabs" style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" data-filter="">All</button>
          <button class="btn btn-sm btn-outline" data-filter="PENDING">Pending</button>
          <button class="btn btn-sm btn-outline" data-filter="FARMER_CONFIRMED">Accepted</button>
          <button class="btn btn-sm btn-outline" data-filter="TRANSPORT_REQUESTED">Transport</button>
          <button class="btn btn-sm btn-outline" data-filter="DELIVERED">Delivered</button>
          <button class="btn btn-sm btn-outline" data-filter="CANCELLED">Cancelled</button>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead><tr>
              <th>Order ID</th><th>Date</th><th>Buyer</th><th>Crop</th><th>Qty</th><th>Price/kg</th><th>Total</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="f-orders-tbody"><tr><td colspan="9" style="text-align:center;padding:30px;">Loading orders...</td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    let allOrders = [];

    const renderTable = (filter) => {
      const tbody = document.getElementById('f-orders-tbody');
      if (!tbody) return;
      const orders = filter ? allOrders.filter(o => o.status === filter) : allOrders;
      tbody.innerHTML = '';
      if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#888;">
          <div style="font-size:32px;margin-bottom:8px;">📦</div>
          <div>${filter ? 'No orders with status: ' + filter : 'No orders yet.'}</div>
        </td></tr>`;
        return;
      }
      orders.forEach(o => {
        const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-IN') : '—';
        const sc = (o.status || '').toLowerCase().replace(/_/g, '-');
        const tr = document.createElement('tr');
        let actions = `<button class="btn btn-sm btn-outline" onclick="navigateTo('order-details',{orderId:'${o.id}'})">View</button>`;
        if (o.status === 'PENDING') {
          actions = `
            <button class="btn btn-sm btn-primary" onclick="FarmerPagesOrders.acceptOrder('${o.id}')">Accept</button>
            <button class="btn btn-sm btn-danger" onclick="FarmerPagesOrders.rejectOrder('${o.id}')" style="margin-left:4px;">Reject</button>
          `;
        }
        tr.innerHTML = `
          <td><code>#${o.id.substring(0, 6).toUpperCase()}</code></td>
          <td style="white-space:nowrap;">${date}</td>
          <td>${escapeHtml(o.buyerName || '—')}</td>
          <td>${escapeHtml(o.cropName || '—')}</td>
          <td>${o.quantity || 0} kg</td>
          <td>₹${o.pricePerKg || 0}</td>
          <td style="font-weight:700;">${fmtCurrency(o.productCost || o.totalCost)}</td>
          <td><span class="status-badge status-${sc}">${escapeHtml(o.status || '')}</span></td>
          <td>${actions}</td>
        `;
        tbody.appendChild(tr);
      });
    };

    document.getElementById('f-orders-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      document.querySelectorAll('#f-orders-tabs .btn').forEach(b => b.className = 'btn btn-sm btn-outline');
      btn.className = 'btn btn-sm btn-primary';
      renderTable(btn.getAttribute('data-filter'));
    });

    try {
      const uid = firebase.auth().currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');
      const snap = await firebase.firestore().collection('orders').where('farmerId', '==', uid).get();
      allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderTable('');
    } catch (err) {
      document.getElementById('f-orders-tbody').innerHTML = `<tr><td colspan="9" style="color:#e53935;text-align:center;">${escapeHtml(err.message)}</td></tr>`;
    }
  },

  /* ──────────────── ACCEPT ORDER ──────────────── */
  acceptOrder: async (orderId) => {
    if (!confirm('Accept this order?')) return;
    try {
      const db = firebase.firestore();
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const uid = firebase.auth().currentUser?.uid;
      const farmer = window.AppState?.farmer || {};
      const orderDoc = await db.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) throw new Error('Order not found');
      const order = orderDoc.data();

      await db.collection('orders').doc(orderId).update({
        status: 'FARMER_CONFIRMED', updatedAt: now
      });

      // Notify buyer
      await db.collection('notifications').add({
        userId: order.buyerId, type: 'order_confirmed',
        title: '✅ Order Confirmed by Farmer',
        message: `${farmer.name || 'Farmer'} accepted your order for ${order.cropName}.`,
        orderId, read: false, createdAt: now
      }).catch(() => { });

      Toast.show('Order accepted! You can now request transport.', 'success');
      navigateTo('order-details', { orderId });
    } catch (e) {
      Toast.show('Error: ' + e.message, 'error');
    }
  },

  /* ──────────────── REJECT ORDER ──────────────── */
  rejectOrder: async (orderId) => {
    if (!confirm('Reject this order? This cannot be undone.')) return;
    try {
      const db = firebase.firestore();
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const orderDoc = await db.collection('orders').doc(orderId).get();
      const order = orderDoc.data();

      await db.collection('orders').doc(orderId).update({ status: 'CANCELLED', updatedAt: now });

      await db.collection('notifications').add({
        userId: order.buyerId, type: 'order_rejected',
        title: '❌ Order Rejected',
        message: `Farmer could not fulfill your order for ${order.cropName}.`,
        orderId, read: false, createdAt: now
      }).catch(() => { });

      Toast.show('Order rejected.', 'warning');
      navigateTo('orders');
    } catch (e) {
      Toast.show('Error: ' + e.message, 'error');
    }
  },

  /* ──────────────── ORDER DETAILS ──────────────── */
  'order-details': async (container, params) => {
    if (!params?.orderId) { navigateTo('orders'); return; }
    container.innerHTML = `<div style="padding:40px;text-align:center;">Loading order details...</div>`;
    try {
      const db = firebase.firestore();
      const doc = await db.collection('orders').doc(params.orderId).get();
      if (!doc.exists) throw new Error('Order not found');
      const o = { id: doc.id, ...doc.data() };
      const sc = (o.status || '').toLowerCase().replace(/_/g, '-');

      // Check for transport request
      let transportInfo = '';
      let tDoc = null;
      if (o.transportRequestId) {
        tDoc = await db.collection('transportRequests').doc(o.transportRequestId).get();
      } else if (o.id) {
        const tSnap = await db.collection('transportRequests').where('orderId', '==', o.id).limit(1).get();
        if (!tSnap.empty) tDoc = tSnap.docs[0];
      }
      if (tDoc && tDoc.exists) {
        const t = tDoc.data();
        transportInfo = `
            <div style="margin-top:20px;background:#E3F2FD;padding:16px;border-radius:10px;">
              <h4 style="margin:0 0 8px;color:#0D47A1;">🚚 Transport Status</h4>
              <table style="width:100%;font-size:0.9rem;border-collapse:collapse;">
                <tr><td style="color:#555;padding:4px 0;">Status</td><td style="font-weight:600;">${escapeHtml(fmtStatus(t.status))}</td></tr>
                ${t.driverName ? `<tr><td style="color:#555;padding:4px 0;">Driver</td><td>${escapeHtml(t.driverName)}</td></tr>` : ''}
              </table>
            </div>
          `;
      }

      // Check for delivery
      let deliveryInfo = '';
      let delSnap = null;
      if (o.transportRequestId) {
        delSnap = await db.collection('deliveries').where('requestId', '==', o.transportRequestId).limit(1).get();
      }
      if ((!delSnap || delSnap.empty) && o.id) {
        delSnap = await db.collection('deliveries').where('orderId', '==', o.id).limit(1).get();
      }
      if (delSnap && !delSnap.empty) {
        const del = delSnap.docs[0].data();
        deliveryInfo = `
            <div style="margin-top:16px;background:#F1F8E9;padding:16px;border-radius:10px;">
              <h4 style="margin:0 0 8px;color:#33691E;">📍 Delivery Tracking</h4>
              <table style="width:100%;font-size:0.9rem;border-collapse:collapse;">
                <tr><td style="color:#555;padding:4px 0;">Delivery Status</td><td style="font-weight:600;">${escapeHtml(fmtStatus(del.status))}</td></tr>
                <tr><td style="color:#555;padding:4px 0;">Driver</td><td>${escapeHtml(del.driverName || '—')}</td></tr>
                <tr><td style="color:#555;padding:4px 0;">Distance</td><td>${del.distance || 0} km</td></tr>
                <tr><td style="color:#555;padding:4px 0;">Transport Cost</td><td>${fmtCurrency(del.earnings || 0)}</td></tr>
              </table>
            </div>
          `;
      }

      let actionButtons = '';
      if (o.status === 'PENDING') {
        actionButtons = `
          <button class="btn btn-primary" onclick="FarmerPagesOrders.acceptOrder('${o.id}')">✅ Accept Order</button>
          <button class="btn btn-danger" onclick="FarmerPagesOrders.rejectOrder('${o.id}')" style="margin-left:8px;">❌ Reject</button>
        `;
      } else if (o.status === 'FARMER_CONFIRMED') {
        actionButtons = `<button class="btn btn-primary" onclick="navigateTo('request-transport',{orderId:'${o.id}'})">🚚 Request Transport</button>`;
      } else if (o.status === 'TRANSPORT_REQUESTED') {
        actionButtons = `<button class="btn btn-outline" onclick="FarmerPagesOrders.markReady('${o.id}')">📦 Mark Ready for Pickup</button>`;
      }

      const delStatus = (delSnap && !delSnap.empty) ? delSnap.docs[0].data().status : '';
      const isDriverAssigned = ['DRIVER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(o.status) || ['driver_assigned', 'reached_pickup', 'picked_up', 'in_transit', 'reached_destination', 'delivered'].includes(delStatus);
      const isPickedUp = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(o.status) || ['picked_up', 'in_transit', 'reached_destination', 'delivered'].includes(delStatus);
      const isInTransit = ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(o.status) || ['in_transit', 'reached_destination', 'delivered'].includes(delStatus);
      const isDelivered = ['DELIVERED', 'COMPLETED'].includes(o.status) || delStatus === 'delivered';

      container.innerHTML = `
        <button class="btn btn-sm btn-outline" onclick="navigateTo('orders')" style="margin-bottom:20px;">← Back to Orders</button>
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:300px;background:#fff;padding:20px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
            <h3 style="margin-top:0;">Order #${o.id.substring(0, 6).toUpperCase()}</h3>
            <span class="status-badge status-${sc}" style="margin-bottom:16px;display:inline-block;">${escapeHtml(o.status || '')}</span>
            <table style="width:100%;font-size:0.9rem;border-collapse:collapse;">
              <tr><td style="color:#888;padding:6px 0;">Buyer</td><td style="font-weight:600;">${escapeHtml(o.buyerName || '—')}</td></tr>
              <tr><td style="color:#888;padding:6px 0;">Crop</td><td>${escapeHtml(o.cropName || '')} (${o.quantity} kg)</td></tr>
              <tr><td style="color:#888;padding:6px 0;">Price/kg</td><td>₹${o.pricePerKg || 0}</td></tr>
              <tr><td style="color:#888;padding:6px 0;">Product Cost</td><td style="font-weight:600;">${fmtCurrency(o.productCost)}</td></tr>
              <tr><td style="color:#888;padding:6px 0;">Transport Cost</td><td>${fmtCurrency(o.transportCost || 0)}</td></tr>
              <tr style="border-top:1px solid #eee;"><td style="color:#333;font-weight:700;padding:8px 0 4px;">Total</td><td style="font-weight:700;font-size:1.1rem;color:#1B5E20;">${fmtCurrency(o.totalCost)}</td></tr>
              <tr><td style="color:#888;padding:6px 0;">Pickup</td><td>${escapeHtml(o.pickupLocation?.name || '—')}</td></tr>
              <tr><td style="color:#888;padding:6px 0;">Delivery</td><td>${escapeHtml(o.deliveryLocation?.name || '—')}</td></tr>
            </table>
            <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap;">${actionButtons}</div>
            ${transportInfo}
            ${deliveryInfo}
          </div>

          <div style="flex:1;min-width:280px;background:#fff;padding:20px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
            <h4 style="margin-top:0;">Delivery Timeline</h4>
            <ul class="timeline" id="order-timeline">
              <li class="timeline-item active"><div class="timeline-marker">✓</div><div><strong>Order Placed</strong></div></li>
              <li class="timeline-item active"><div class="timeline-marker">✓</div><div><strong>Farmer Accepted</strong></div></li>
              <li class="timeline-item active"><div class="timeline-marker">✓</div><div><strong>Transport Requested</strong></div></li>
              <li class="timeline-item ${isDriverAssigned ? 'active' : ''}"><div class="timeline-marker">${isDriverAssigned ? '✓' : '4'}</div><div><strong>Driver Assigned</strong></div></li>
              <li class="timeline-item ${isPickedUp ? 'active' : ''}"><div class="timeline-marker">${isPickedUp ? '✓' : '5'}</div><div><strong>Picked Up</strong></div></li>
              <li class="timeline-item ${isInTransit ? 'active' : ''}"><div class="timeline-marker">${isInTransit ? '✓' : '6'}</div><div><strong>In Transit</strong></div></li>
              <li class="timeline-item ${isDelivered ? 'active' : ''}"><div class="timeline-marker">${isDelivered ? '✓' : '7'}</div><div><strong>Delivered</strong></div></li>
            </ul>
          </div>
        </div>
      `;

      // Clean up previous listeners to prevent memory leaks and infinite loops
      if (window._farmerOrderUnsubs) {
        window._farmerOrderUnsubs.forEach(u => u && u());
      }
      window._farmerOrderUnsubs = [];

      let lastOrderStatus = o.status;
      const unsubOrder = db.collection('orders').doc(o.id).onSnapshot(snap => {
        if (!snap.exists) return;
        const fresh = snap.data();
        if (fresh.status && fresh.status !== lastOrderStatus) {
          lastOrderStatus = fresh.status;
          FarmerPagesOrders['order-details'](container, params);
        }
      });
      window._farmerOrderUnsubs.push(unsubOrder);

      if (o.transportRequestId) {
        let lastTStatus = tDoc?.data()?.status || '';
        const unsubT = db.collection('transportRequests').doc(o.transportRequestId).onSnapshot(snap => {
          if (!snap.exists) return;
          const fresh = snap.data();
          if (fresh.status && fresh.status !== lastTStatus) {
            lastTStatus = fresh.status;
            FarmerPagesOrders['order-details'](container, params);
          }
        });
        window._farmerOrderUnsubs.push(unsubT);
      }
    } catch (e) {
      container.innerHTML = `<div style="padding:20px;"><button class="btn btn-sm btn-outline" onclick="navigateTo('orders')">← Back</button><div class="form-error-box" style="display:block;margin-top:16px;">${escapeHtml(e.message)}</div></div>`;
    }
  },

  markReady: async (orderId) => {
    try {
      await firebase.firestore().collection('orders').doc(orderId).update({
        readyForPickup: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      Toast.show('Marked as ready for pickup!', 'success');
    } catch (e) { Toast.show('Error: ' + e.message, 'error'); }
  },

  /* ──────────────── TRANSPORT ──────────────── */
  transport: async (container) => {
    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;">
        <h3 style="margin-top:0;">🚚 Transport Requests</h3>
        <div id="transport-list"><div style="text-align:center;padding:40px;color:#888;">Loading transport requests...</div></div>
      </div>
    `;
    try {
      const uid = firebase.auth().currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');
      const snap = await firebase.firestore().collection('transportRequests').where('farmerId', '==', uid).get();
      const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

      const el = document.getElementById('transport-list');
      if (requests.length === 0) {
        el.innerHTML = `
          <div style="text-align:center;padding:40px;color:#888;">
            <div style="font-size:40px;margin-bottom:8px;">🚚</div>
            <div>No transport requests yet.</div>
            <div style="font-size:0.85rem;margin-top:4px;">Accept an order first, then request transport.</div>
          </div>`;
        return;
      }

      el.innerHTML = requests.map(r => {
        const sc = (r.status || '').replace(/_/g, '-');
        return `<div style="border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <span style="font-weight:700;">${escapeHtml(r.crop || '—')}</span> · ${r.weight || 0} kg
              <span class="status-badge status-${sc}" style="margin-left:8px;">${escapeHtml(fmtStatus(r.status))}</span>
            </div>
          </div>
          <div style="margin-top:8px;font-size:0.85rem;color:#666;">
            📍 ${escapeHtml(r.pickupLocation?.name || '—')} → ${escapeHtml(r.dropLocation?.name || '—')}
            ${r.driverName ? `<br>🚗 Driver: <strong>${escapeHtml(r.driverName)}</strong>` : ''}
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      document.getElementById('transport-list').innerHTML = `<div style="color:#e53935;padding:16px;">Error: ${escapeHtml(e.message)}</div>`;
    }
  },

  /* ──────────────── REQUEST TRANSPORT ──────────────── */
  'request-transport': async (container, params) => {
    if (!params?.orderId) { navigateTo('orders'); return; }
    container.innerHTML = `<div style="padding:40px;text-align:center;">Loading...</div>`;

    try {
      const db = firebase.firestore();
      const doc = await db.collection('orders').doc(params.orderId).get();
      if (!doc.exists) throw new Error('Order not found');
      const o = doc.data();
      const farmer = window.AppState?.farmer || {};

      container.innerHTML = `
  <button class="btn btn-sm btn-outline" onclick="navigateTo('order-details',{orderId:'${params.orderId}'})" style="margin-bottom:20px;">← Back to Order</button>
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:700px;">
      <h3 style="margin-top:0;">🚚 Request Transport</h3>
      <p style="color:#888;font-size:0.9rem;">For: ${escapeHtml(o.cropName)} (${o.quantity} kg) → ${escapeHtml(o.deliveryLocation?.name || 'Buyer')}</p>
      <form id="transport-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Vehicle Type</label>
            <select id="tr-vehicle" class="form-input">
              <option value="Auto">Auto</option>
              <option value="Mini Truck" selected>Mini Truck</option>
              <option value="Pickup Van">Pickup Van</option>
              <option value="Lorry">Lorry</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Required Capacity (kg)</label>
            <input type="number" id="tr-capacity" class="form-input" value="${o.quantity || 100}" min="1" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Pickup Location</label>
            <input type="text" id="tr-pickup" class="form-input" value="${escapeHtml(o.pickupLocation?.name || farmer.farmLocation || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Drop Location</label>
            <input type="text" id="tr-drop" class="form-input" value="${escapeHtml(o.deliveryLocation?.name || '')}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea id="tr-notes" class="form-input" rows="2" placeholder="Handle with care, preferred pickup time..."></textarea>
        </div>
        <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;">
            <span>Estimated Transport Cost:</span>
            <span style="font-weight:700;color:#1B5E20;" id="tr-est-cost">₹${Math.max(80, 50 + Math.round(12 * (o.distanceKm || 10)) + Math.round(8 * ((o.quantity || 100) / 100)))}</span>
          </div>
        </div>
        <div id="tr-error" class="form-error-box"></div>
        <button type="submit" class="btn btn-primary btn-full" id="tr-submit-btn">🚚 Create Transport Request</button>
      </form>
    </div>
`;

      document.getElementById('transport-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('tr-submit-btn');
        const errBox = document.getElementById('tr-error');
        errBox.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span> Creating...';

        try {
          const uid = firebase.auth().currentUser?.uid;
          const now = firebase.firestore.FieldValue.serverTimestamp();
          const distKm = o.distanceKm || 10;
          const weight = o.quantity || 100;
          const estCost = Math.max(80, 50 + Math.round(12 * distKm) + Math.round(8 * (weight / 100)));

          const transportReq = {
            orderId: params.orderId,
            buyerId: o.buyerId,
            farmerId: uid,
            farmerName: farmer.name || 'Farmer',
            crop: o.cropName,
            weight: weight,
            pickupLocation: o.pickupLocation || { name: document.getElementById('tr-pickup').value },
            dropLocation: o.deliveryLocation || { name: document.getElementById('tr-drop').value },
            vehicleType: document.getElementById('tr-vehicle').value,
            requiredCapacity: parseInt(document.getElementById('tr-capacity').value) || weight,
            estimatedDistance: distKm,
            estimatedTime: Math.round(distKm * 3),
            estimatedCost: estCost,
            notes: document.getElementById('tr-notes').value.trim(),
            status: 'requested',
            createdAt: now,
            updatedAt: now
          };

          const ref = await db.collection('transportRequests').add(transportReq);
          await db.collection('orders').doc(params.orderId).update({
            transportRequestId: ref.id,
            status: 'TRANSPORT_REQUESTED',
            updatedAt: now
          });

          // Notify buyer
          await db.collection('notifications').add({
            userId: o.buyerId, type: 'transport_requested',
            title: '🚚 Transport Requested',
            message: `Transport has been requested for your ${o.cropName} order.`,
            orderId: params.orderId, read: false, createdAt: now
          }).catch(() => { });

          Toast.show('Transport request created! Drivers will see it now.', 'success');
          navigateTo('order-details', { orderId: params.orderId });
        } catch (err) {
          errBox.textContent = err.message;
          errBox.style.display = 'block';
        } finally {
          btn.disabled = false;
          btn.textContent = '🚚 Create Transport Request';
        }
      });
    } catch (e) {
      container.innerHTML = `<div class="form-error-box" style="display:block;">${escapeHtml(e.message)}</div>`;
    }
  }
};

window.FarmerPagesOrders = FarmerPagesOrders;
