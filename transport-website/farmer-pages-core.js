/* farmer-pages-core.js — Dashboard, My Crops, Add/Edit Crop */

const FarmerPagesCore = {

    /* ──────────────── DASHBOARD ──────────────── */
    dashboard: async (container) => {
        const farmer = window.AppState?.farmer || {};
        container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-title">🌱 Available Crops</div><div class="stat-value" id="dash-crops">—</div></div>
        <div class="stat-card"><div class="stat-title">📦 Total Quantity</div><div class="stat-value" id="dash-qty">—</div></div>
        <div class="stat-card"><div class="stat-title">⏳ Pending Orders</div><div class="stat-value" id="dash-pending">—</div></div>
        <div class="stat-card"><div class="stat-title">✅ Confirmed Orders</div><div class="stat-value" id="dash-confirmed">—</div></div>
        <div class="stat-card" style="background:#E8F5E9;"><div class="stat-title" style="color:#2E7D32;">💰 Today's Earnings</div><div class="stat-value" style="color:#2E7D32;" id="dash-today-earn">—</div></div>
        <div class="stat-card"><div class="stat-title">🌾 Expected Harvest</div><div class="stat-value" id="dash-harvest">—</div></div>
      </div>

      <div style="margin-top:30px;background:#fff;border-radius:12px;padding:24px;">
        <h3 style="margin-top:0;">Quick Actions</h3>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="navigateTo('add-crop')">🌱 Add Crop</button>
          <button class="btn btn-outline" onclick="navigateTo('my-crops')">📋 View My Crops</button>
          <button class="btn btn-outline" onclick="navigateTo('nearby-buyers')">🏪 Find Buyers</button>
          <button class="btn btn-outline" onclick="navigateTo('market-prices')">📈 Market Prices</button>
          <button class="btn btn-outline" onclick="navigateTo('orders')">📦 My Orders</button>
          <button class="btn btn-outline" onclick="navigateTo('transport')">🚚 Transport</button>
          <button class="btn btn-outline" onclick="navigateTo('earnings')">💰 Earnings</button>
        </div>
      </div>

      <div style="margin-top:30px;">
        <h3>Recent Orders</h3>
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th>Order ID</th><th>Buyer</th><th>Crop</th><th>Qty</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="dash-orders-tbody"><tr><td colspan="7" class="text-center">Loading...</td></tr></tbody>
          </table>
        </div>
      </div>
    `;

        try {
            const uid = firebase.auth().currentUser?.uid;
            if (!uid) return;
            const db = firebase.firestore();

            // Load crops
            const cropSnap = await db.collection('crops').where('farmerId', '==', uid).get();
            const crops = cropSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const availableCrops = crops.filter(c => c.availableForSale !== false);
            document.getElementById('dash-crops').textContent = availableCrops.length;
            document.getElementById('dash-qty').textContent = crops.reduce((s, c) => s + (c.availableQuantity || 0), 0) + ' kg';

            const upcoming = crops.filter(c => c.harvestDate && new Date(c.harvestDate) > new Date());
            document.getElementById('dash-harvest').textContent = upcoming.length + ' crops';

            // Load orders
            const orderSnap = await db.collection('orders').where('farmerId', '==', uid).get();
            const orders = orderSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

            const pending = orders.filter(o => o.status === 'PENDING').length;
            const confirmed = orders.filter(o => ['FARMER_CONFIRMED', 'TRANSPORT_REQUESTED', 'DRIVER_ASSIGNED'].includes(o.status)).length;
            document.getElementById('dash-pending').textContent = pending;
            document.getElementById('dash-confirmed').textContent = confirmed;

            // Today's earnings
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const todayEarnings = orders
                .filter(o => ['DELIVERED', 'COMPLETED'].includes(o.status))
                .filter(o => { const d = o.updatedAt?.toDate?.(); return d && d >= today; })
                .reduce((s, o) => s + (o.productCost || 0), 0);
            document.getElementById('dash-today-earn').textContent = fmtCurrency(todayEarnings);

            // Recent orders table
            const tbody = document.getElementById('dash-orders-tbody');
            tbody.innerHTML = '';
            if (orders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;">
          <div style="font-size:40px;margin-bottom:12px;">🌾</div>
          <div style="font-weight:600;">No orders yet</div>
          <div style="color:#888;margin-top:4px;">Add crops and wait for buyers to place orders.</div>
        </td></tr>`;
            } else {
                orders.slice(0, 5).forEach(o => {
                    const sc = (o.status || '').toLowerCase().replace(/_/g, '-');
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
            <td><code>#${o.id.substring(0, 6).toUpperCase()}</code></td>
            <td>${escapeHtml(o.buyerName || '—')}</td>
            <td>${escapeHtml(o.cropName || '—')}</td>
            <td>${o.quantity || 0} kg</td>
            <td>${fmtCurrency(o.productCost || o.totalCost)}</td>
            <td><span class="status-badge status-${sc}">${escapeHtml(o.status || '')}</span></td>
            <td><button class="btn btn-sm btn-outline" onclick="navigateTo('order-details',{orderId:'${o.id}'})">View</button></td>
          `;
                    tbody.appendChild(tr);
                });
            }
        } catch (e) {
            console.error('Dashboard error:', e);
        }
    },

    /* ──────────────── MY CROPS ──────────────── */
    'my-crops': async (container) => {
        container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
        <h3 style="margin:0;">My Crops</h3>
        <button class="btn btn-primary" onclick="navigateTo('add-crop')">+ Add New Crop</button>
      </div>
      <div id="crops-list"><div style="text-align:center;padding:40px;color:#888;">Loading crops...</div></div>
    `;

        try {
            const uid = firebase.auth().currentUser?.uid;
            const snap = await firebase.firestore().collection('crops').where('farmerId', '==', uid).get();
            const crops = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const el = document.getElementById('crops-list');

            if (crops.length === 0) {
                el.innerHTML = `<div style="text-align:center;padding:60px;background:#fff;border-radius:12px;">
          <div style="font-size:48px;margin-bottom:12px;">🌱</div>
          <div style="font-weight:600;font-size:1.1rem;">No crops added yet</div>
          <div style="color:#888;margin-top:4px;margin-bottom:16px;">Start by adding your first crop listing.</div>
          <button class="btn btn-primary" onclick="navigateTo('add-crop')">+ Add Crop</button>
        </div>`;
                return;
            }

            el.innerHTML = '<div class="produce-grid">' + crops.map(c => {
                const emoji = window.CROP_EMOJI?.[c.cropName] || '🌱';
                const avail = c.availableForSale !== false;
                return `<div class="produce-card">
          <div style="height:100px;background:linear-gradient(135deg,${avail ? '#E8F5E9,#C8E6C9' : '#f5f5f5,#e0e0e0'});border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:40px;">${emoji}</div>
          <div class="produce-info">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
              <div class="produce-title">${escapeHtml(c.cropName)}</div>
              <span class="badge" style="background:${avail ? '#E8F5E9;color:#2E7D32' : '#ffebee;color:#c62828'}">${avail ? 'Available' : 'Not Listed'}</span>
            </div>
            ${c.variety ? `<div style="color:#888;font-size:0.8rem;">Variety: ${escapeHtml(c.variety)}</div>` : ''}
            <div class="produce-price">₹${c.pricePerKg}/kg</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
              <span class="badge">📦 ${c.availableQuantity || 0} kg</span>
              <span class="badge">⭐ Grade ${escapeHtml(c.quality || 'A')}</span>
              ${c.freshness ? `<span class="badge">🕐 ${c.freshness} days</span>` : ''}
            </div>
            ${c.harvestDate ? `<div style="font-size:0.8rem;color:#888;">📅 Harvest: ${new Date(c.harvestDate).toLocaleDateString('en-IN')}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-outline" style="flex:1;" onclick="navigateTo('edit-crop',{cropId:'${c.id}'})">✏️ Edit</button>
            <button class="btn btn-sm btn-danger" style="flex:1;" onclick="FarmerPagesCore.deleteCrop('${c.id}')">🗑️ Delete</button>
          </div>
        </div>`;
            }).join('') + '</div>';
        } catch (e) {
            document.getElementById('crops-list').innerHTML = `<div style="color:#e53935;padding:20px;">Error: ${escapeHtml(e.message)}</div>`;
        }
    },

    /* ──────────────── DELETE CROP ──────────────── */
    deleteCrop: async (cropId) => {
        if (!confirm('Are you sure you want to delete this crop?')) return;
        try {
            await firebase.firestore().collection('crops').doc(cropId).delete();
            Toast.show('Crop deleted successfully.', 'success');
            navigateTo('my-crops');
        } catch (e) {
            Toast.show('Failed to delete: ' + e.message, 'error');
        }
    },

    /* ──────────────── ADD CROP ──────────────── */
    'add-crop': async (container) => {
        const farmer = window.AppState?.farmer || {};
        container.innerHTML = `
      <button class="btn btn-sm btn-outline" onclick="navigateTo('my-crops')" style="margin-bottom:20px;">← Back to My Crops</button>
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:700px;">
        <h3 style="margin-top:0;">Add New Crop</h3>
        <form id="add-crop-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Crop Name *</label>
              <input type="text" id="crop-name" class="form-input" placeholder="e.g. Tomato" required />
            </div>
            <div class="form-group">
              <label class="form-label">Variety (optional)</label>
              <input type="text" id="crop-variety" class="form-input" placeholder="e.g. Cherry" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Category</label>
              <select id="crop-category" class="form-input">
                <option value="Vegetable">Vegetable</option>
                <option value="Fruit">Fruit</option>
                <option value="Grain">Grain</option>
                <option value="Spice">Spice</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Quality Grade</label>
              <select id="crop-quality" class="form-input">
                <option value="A">Grade A — Premium</option>
                <option value="B">Grade B — Good</option>
                <option value="C">Grade C — Standard</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Available Quantity (kg) *</label>
              <input type="number" id="crop-qty" class="form-input" min="1" placeholder="500" required />
            </div>
            <div class="form-group">
              <label class="form-label">Expected Price (₹/kg) *</label>
              <input type="number" id="crop-price" class="form-input" min="1" placeholder="35" required />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Expected Harvest Date</label>
              <input type="date" id="crop-harvest" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label">Freshness / Shelf Life (days)</label>
              <input type="number" id="crop-freshness" class="form-input" min="1" placeholder="5" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea id="crop-desc" class="form-input" rows="3" placeholder="Organically grown, pesticide-free..."></textarea>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="crop-available" checked style="width:18px;height:18px;accent-color:#2E7D32;" />
              <span>Available for sale</span>
            </label>
          </div>
          <div id="crop-error" class="form-error-box"></div>
          <button type="submit" class="btn btn-primary btn-full" id="save-crop-btn">🌱 Add Crop</button>
        </form>
      </div>
    `;

        document.getElementById('add-crop-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('save-crop-btn');
            const errBox = document.getElementById('crop-error');
            errBox.style.display = 'none';

            const cropName = document.getElementById('crop-name').value.trim();
            const qty = parseInt(document.getElementById('crop-qty').value);
            const price = parseFloat(document.getElementById('crop-price').value);

            if (!cropName) { errBox.textContent = 'Crop name is required.'; errBox.style.display = 'block'; return; }
            if (!qty || qty < 1) { errBox.textContent = 'Valid quantity is required.'; errBox.style.display = 'block'; return; }
            if (!price || price < 1) { errBox.textContent = 'Valid price is required.'; errBox.style.display = 'block'; return; }

            btn.disabled = true;
            btn.innerHTML = '<span class="btn-spinner"></span> Saving...';

            try {
                const uid = firebase.auth().currentUser?.uid;
                if (!uid) throw new Error('Not authenticated');
                const db = firebase.firestore();
                const now = firebase.firestore.FieldValue.serverTimestamp();

                await db.collection('crops').add({
                    farmerId: uid,
                    farmerName: farmer.name || 'Farmer',
                    cropName,
                    variety: document.getElementById('crop-variety').value.trim(),
                    category: document.getElementById('crop-category').value,
                    quality: document.getElementById('crop-quality').value,
                    availableQuantity: qty,
                    pricePerKg: price,
                    harvestDate: document.getElementById('crop-harvest').value || null,
                    freshness: parseInt(document.getElementById('crop-freshness').value) || null,
                    description: document.getElementById('crop-desc').value.trim(),
                    availableForSale: document.getElementById('crop-available').checked,
                    location: {
                        name: farmer.farmLocation || farmer.village || 'Farm',
                        latitude: farmer.latitude || 10.0,
                        longitude: farmer.longitude || 78.0
                    },
                    createdAt: now,
                    updatedAt: now
                });

                Toast.show('Crop added successfully! Buyers can now see it.', 'success');
                navigateTo('my-crops');
            } catch (err) {
                errBox.textContent = 'Error: ' + err.message;
                errBox.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '🌱 Add Crop';
            }
        });
    },

    /* ──────────────── EDIT CROP ──────────────── */
    'edit-crop': async (container, params) => {
        if (!params?.cropId) { navigateTo('my-crops'); return; }
        container.innerHTML = `<div style="padding:40px;text-align:center;">Loading crop...</div>`;

        try {
            const doc = await firebase.firestore().collection('crops').doc(params.cropId).get();
            if (!doc.exists) throw new Error('Crop not found.');
            const c = doc.data();

            container.innerHTML = `
        <button class="btn btn-sm btn-outline" onclick="navigateTo('my-crops')" style="margin-bottom:20px;">← Back to My Crops</button>
        <div style="background:#fff;border-radius:12px;padding:24px;max-width:700px;">
          <h3 style="margin-top:0;">Edit Crop — ${escapeHtml(c.cropName)}</h3>
          <form id="edit-crop-form">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Crop Name *</label><input type="text" id="ec-name" class="form-input" value="${escapeHtml(c.cropName)}" required /></div>
              <div class="form-group"><label class="form-label">Variety</label><input type="text" id="ec-variety" class="form-input" value="${escapeHtml(c.variety || '')}" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Category</label>
                <select id="ec-category" class="form-input">
                  ${['Vegetable', 'Fruit', 'Grain', 'Spice', 'Other'].map(v => `<option ${c.category === v ? 'selected' : ''}>${v}</option>`).join('')}
                </select></div>
              <div class="form-group"><label class="form-label">Quality</label>
                <select id="ec-quality" class="form-input">
                  <option value="A" ${c.quality === 'A' ? 'selected' : ''}>Grade A</option>
                  <option value="B" ${c.quality === 'B' ? 'selected' : ''}>Grade B</option>
                  <option value="C" ${c.quality === 'C' ? 'selected' : ''}>Grade C</option>
                </select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Quantity (kg) *</label><input type="number" id="ec-qty" class="form-input" value="${c.availableQuantity || 0}" min="1" required /></div>
              <div class="form-group"><label class="form-label">Price (₹/kg) *</label><input type="number" id="ec-price" class="form-input" value="${c.pricePerKg || 0}" min="1" required /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Harvest Date</label><input type="date" id="ec-harvest" class="form-input" value="${c.harvestDate || ''}" /></div>
              <div class="form-group"><label class="form-label">Freshness (days)</label><input type="number" id="ec-freshness" class="form-input" value="${c.freshness || ''}" min="1" /></div>
            </div>
            <div class="form-group"><label class="form-label">Description</label><textarea id="ec-desc" class="form-input" rows="3">${escapeHtml(c.description || '')}</textarea></div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" id="ec-available" ${c.availableForSale !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:#2E7D32;" />
                <span>Available for sale</span>
              </label>
            </div>
            <div id="ec-error" class="form-error-box"></div>
            <button type="submit" class="btn btn-primary btn-full" id="ec-save-btn">💾 Save Changes</button>
          </form>
        </div>
      `;

            document.getElementById('edit-crop-form').addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const btn = document.getElementById('ec-save-btn');
                const errBox = document.getElementById('ec-error');
                errBox.style.display = 'none';
                btn.disabled = true;
                btn.innerHTML = '<span class="btn-spinner"></span> Saving...';

                try {
                    await firebase.firestore().collection('crops').doc(params.cropId).update({
                        cropName: document.getElementById('ec-name').value.trim(),
                        variety: document.getElementById('ec-variety').value.trim(),
                        category: document.getElementById('ec-category').value,
                        quality: document.getElementById('ec-quality').value,
                        availableQuantity: parseInt(document.getElementById('ec-qty').value) || 0,
                        pricePerKg: parseFloat(document.getElementById('ec-price').value) || 0,
                        harvestDate: document.getElementById('ec-harvest').value || null,
                        freshness: parseInt(document.getElementById('ec-freshness').value) || null,
                        description: document.getElementById('ec-desc').value.trim(),
                        availableForSale: document.getElementById('ec-available').checked,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    Toast.show('Crop updated!', 'success');
                    navigateTo('my-crops');
                } catch (err) {
                    errBox.textContent = err.message; errBox.style.display = 'block';
                } finally { btn.disabled = false; btn.textContent = '💾 Save Changes'; }
            });
        } catch (e) {
            container.innerHTML = `<div style="padding:20px;"><button class="btn btn-sm btn-outline" onclick="navigateTo('my-crops')">← Back</button><div class="form-error-box" style="display:block;margin-top:16px;">${escapeHtml(e.message)}</div></div>`;
        }
    }
};

window.FarmerPagesCore = FarmerPagesCore;
