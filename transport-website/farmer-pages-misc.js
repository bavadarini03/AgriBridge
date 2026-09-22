/* farmer-pages-misc.js — Earnings, Voice Assistant, Profile */

const FarmerPagesMisc = {

    /* ──────────────── EARNINGS ──────────────── */
    earnings: async (container) => {
        container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;">
        <h3 style="margin-top:0;">💰 Earnings</h3>
        <div id="earnings-content"><div style="text-align:center;padding:40px;color:#888;">Loading earnings...</div></div>
      </div>
    `;

        try {
            const uid = firebase.auth().currentUser?.uid;
            if (!uid) throw new Error('Not authenticated');
            const db = firebase.firestore();

            const snap = await db.collection('orders').where('farmerId', '==', uid).get();
            const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const completed = orders.filter(o => ['DELIVERED', 'COMPLETED'].includes(o.status));

            const totalSales = completed.reduce((s, o) => s + (o.productCost || 0), 0);
            const totalTransport = completed.reduce((s, o) => s + (o.transportCost || 0), 0);
            const netEarnings = totalSales - totalTransport;
            // Estimated middleman margin ~20% of product cost
            const middlemanSaved = Math.round(totalSales * 0.2);

            const el = document.getElementById('earnings-content');
            if (completed.length === 0 && orders.length === 0) {
                el.innerHTML = `<div style="text-align:center;padding:60px;color:#888;">
          <div style="font-size:40px;margin-bottom:12px;">💰</div>
          <div style="font-weight:600;">No earnings yet</div>
          <div style="margin-top:4px;">Complete your first order to see earnings here.</div>
        </div>`;
                return;
            }

            el.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-title">Total Sales</div><div class="stat-value">${fmtCurrency(totalSales)}</div></div>
          <div class="stat-card"><div class="stat-title">Transport Cost</div><div class="stat-value" style="color:#E65100;">${fmtCurrency(totalTransport)}</div></div>
          <div class="stat-card" style="background:#E8F5E9;"><div class="stat-title" style="color:#2E7D32;">Net Earnings</div><div class="stat-value" style="color:#1B5E20;">${fmtCurrency(netEarnings)}</div></div>
          <div class="stat-card" style="background:#F1F8E9;border:2px solid #81C784;">
            <div class="stat-title" style="color:#2E7D32;">🎉 Money Saved by Direct Selling</div>
            <div class="stat-value" style="color:#1B5E20;">${fmtCurrency(middlemanSaved)}</div>
          </div>
        </div>

        <div class="stat-grid" style="margin-top:20px;">
          <div class="stat-card"><div class="stat-title">Total Orders</div><div class="stat-value">${orders.length}</div></div>
          <div class="stat-card"><div class="stat-title">Completed</div><div class="stat-value">${completed.length}</div></div>
          <div class="stat-card"><div class="stat-title">Active</div><div class="stat-value">${orders.filter(o => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status)).length}</div></div>
        </div>

        ${completed.length > 0 ? `
        <div style="margin-top:24px;">
          <h4>Recent Completed Orders</h4>
          <div class="table-responsive">
            <table class="table">
              <thead><tr><th>Order</th><th>Buyer</th><th>Crop</th><th>Qty</th><th>Earned</th><th>Transport</th><th>Net</th></tr></thead>
              <tbody>
                ${completed.slice(0, 10).map(o => `
                  <tr>
                    <td><code>#${o.id.substring(0, 6).toUpperCase()}</code></td>
                    <td>${escapeHtml(o.buyerName || '—')}</td>
                    <td>${escapeHtml(o.cropName || '—')}</td>
                    <td>${o.quantity || 0} kg</td>
                    <td>${fmtCurrency(o.productCost)}</td>
                    <td style="color:#E65100;">${fmtCurrency(o.transportCost || 0)}</td>
                    <td style="font-weight:700;color:#1B5E20;">${fmtCurrency((o.productCost || 0) - (o.transportCost || 0))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
      `;
        } catch (e) {
            document.getElementById('earnings-content').innerHTML = `<div style="color:#e53935;padding:16px;">Error: ${escapeHtml(e.message)}</div>`;
        }
    },

    /* ──────────────── VOICE ASSISTANT ──────────────── */
    'voice-assistant': async (container) => {
        container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:700px;">
        <h3 style="margin-top:0;">🎤 Voice Assistant</h3>
        <p style="color:#888;font-size:0.9rem;">Ask questions about prices, orders, and recommendations in English or Tamil.</p>

        <div id="va-chat" style="min-height:300px;max-height:500px;overflow-y:auto;border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:16px;background:#fafafa;">
          <div class="va-msg va-bot">
            <div style="background:#E8F5E9;padding:12px;border-radius:10px;border-bottom-left-radius:0;max-width:80%;">
              <strong>🤖 AgriBridge AI</strong><br>
              Vanakkam! 🙏 I can help you with:<br>
              • Crop prices — "Tomato price enna?"<br>
              • Demand info — "Which crop has high demand?"<br>
              • Selling advice — "When should I sell tomato?"<br>
              • Orders — "Show my orders"<br>
              • Delivery — "Where is my delivery?"
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;">
          <input type="text" id="va-input" class="form-input" placeholder="Type your question or click 🎤 to speak..." style="flex:1;" />
          <button class="btn btn-outline" id="va-mic-btn" type="button" title="Speak">🎤</button>
          <button class="btn btn-primary" id="va-send-btn" type="button">Send</button>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline va-quick" data-q="Tomato price enna?">🍅 Tomato price</button>
          <button class="btn btn-sm btn-outline va-quick" data-q="Which crop has high demand?">📊 High demand</button>
          <button class="btn btn-sm btn-outline va-quick" data-q="Show my orders">📦 My orders</button>
          <button class="btn btn-sm btn-outline va-quick" data-q="When should I sell onion?">🧅 When to sell</button>
        </div>
      </div>
    `;

        const chat = document.getElementById('va-chat');
        const addMsg = (text, isBot) => {
            const div = document.createElement('div');
            div.className = `va-msg ${isBot ? 'va-bot' : 'va-user'}`;
            div.style.cssText = `margin-bottom:12px;display:flex;${isBot ? '' : 'justify-content:flex-end;'}`;
            div.innerHTML = `<div style="background:${isBot ? '#E8F5E9' : '#E3F2FD'};padding:12px;border-radius:10px;${isBot ? 'border-bottom-left-radius:0' : 'border-bottom-right-radius:0'};max-width:80%;">${text}</div>`;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        };

        const processQuery = async (query) => {
            const q = query.toLowerCase();
            addMsg(escapeHtml(query), false);

            // Price queries
            const priceMatch = Object.keys(window.MARKET_DATA || {}).find(c => q.includes(c.toLowerCase()));
            if (priceMatch && (q.includes('price') || q.includes('rate') || q.includes('enna') || q.includes('vilai'))) {
                const d = window.MARKET_DATA[priceMatch];
                addMsg(`<strong>${priceMatch}</strong><br>Current Price: <strong>₹${d.price}/kg</strong><br>Demand: ${d.demand}<br>Trend: ${d.trend}<br>💡 ${d.rec}`, true);
                return;
            }

            // Demand queries
            if (q.includes('demand') || q.includes('high demand') || q.includes('popular')) {
                const high = Object.entries(window.MARKET_DATA || {}).filter(([, d]) => d.demand === 'High').map(([n]) => n);
                addMsg(`<strong>High Demand Crops:</strong><br>${high.map(c => `• ${c}`).join('<br>')}<br><br>These crops are selling well right now!`, true);
                return;
            }

            // When to sell
            if (q.includes('when') && q.includes('sell')) {
                const crop = Object.keys(window.MARKET_DATA || {}).find(c => q.includes(c.toLowerCase()));
                if (crop) {
                    const d = window.MARKET_DATA[crop];
                    const advice = d.trend === '↑' ? 'SELL NOW — prices are rising!' : d.trend === '↓' ? 'WAIT — prices may recover.' : 'Fair price currently.';
                    addMsg(`<strong>${crop} Selling Advice:</strong><br>Current: ₹${d.price}/kg<br>Range: ₹${d.min} - ₹${d.max}/kg<br><br>💡 <strong>${advice}</strong>`, true);
                } else {
                    addMsg('Please specify a crop name. Example: "When should I sell tomato?"', true);
                }
                return;
            }

            // Orders
            if (q.includes('order') || q.includes('orders')) {
                try {
                    const uid = firebase.auth().currentUser?.uid;
                    const snap = await firebase.firestore().collection('orders').where('farmerId', '==', uid).get();
                    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    const pending = orders.filter(o => o.status === 'PENDING').length;
                    const active = orders.filter(o => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status)).length;
                    addMsg(`<strong>Your Orders:</strong><br>Total: ${orders.length}<br>Pending: ${pending}<br>Active: ${active}<br>Completed: ${orders.filter(o => ['DELIVERED', 'COMPLETED'].includes(o.status)).length}`, true);
                } catch (e) { addMsg('Sorry, could not load orders. Please try again.', true); }
                return;
            }

            // Delivery
            if (q.includes('delivery') || q.includes('where')) {
                try {
                    const uid = firebase.auth().currentUser?.uid;
                    const snap = await firebase.firestore().collection('transportRequests').where('farmerId', '==', uid).where('status', 'in', ['requested', 'driver_assigned', 'picked_up', 'in_transit']).get();
                    if (snap.empty) { addMsg('No active deliveries found.', true); return; }
                    const reqs = snap.docs.map(d => d.data());
                    addMsg(`<strong>Active Deliveries:</strong><br>${reqs.map(r => `• ${r.crop} — ${fmtStatus(r.status)}${r.driverName ? ' (Driver: ' + r.driverName + ')' : ''}`).join('<br>')}`, true);
                } catch (e) { addMsg('Could not check delivery status.', true); }
                return;
            }

            addMsg('I can help with crop prices, demand info, selling advice, and order status. Try asking "Tomato price enna?" or "Show my orders".', true);
        };

        document.getElementById('va-send-btn').addEventListener('click', () => {
            const input = document.getElementById('va-input');
            const q = input.value.trim();
            if (!q) return;
            input.value = '';
            processQuery(q);
        });

        document.getElementById('va-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('va-send-btn').click();
        });

        document.querySelectorAll('.va-quick').forEach(btn => {
            btn.addEventListener('click', () => processQuery(btn.getAttribute('data-q')));
        });

        // Voice input
        document.getElementById('va-mic-btn').addEventListener('click', () => {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                Toast.show('Speech recognition not supported in this browser.', 'warning');
                return;
            }
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SR();
            recognition.lang = 'en-IN';
            recognition.interimResults = false;
            recognition.start();
            Toast.show('Listening... Speak now.', 'info');
            recognition.onresult = (event) => {
                const text = event.results[0][0].transcript;
                document.getElementById('va-input').value = text;
                processQuery(text);
            };
            recognition.onerror = () => Toast.show('Could not recognize speech. Try again.', 'warning');
        });
    },

    /* ──────────────── PROFILE ──────────────── */
    profile: async (container) => {
        const farmer = window.AppState?.farmer || {};
        container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:700px;">
        <h3 style="margin-top:0;">👤 My Profile</h3>
        <form id="farmer-profile-form">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Full Name *</label><input type="text" id="pf-name" class="form-input" value="${escapeHtml(farmer.name || '')}" required /></div>
            <div class="form-group"><label class="form-label">Phone</label><input type="tel" id="pf-phone" class="form-input" value="${escapeHtml(farmer.phone || '')}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Email</label><input type="email" id="pf-email" class="form-input" value="${escapeHtml(farmer.email || firebase.auth().currentUser?.email || '')}" readonly style="opacity:0.7;" /></div>
            <div class="form-group"><label class="form-label">Farm Location</label><input type="text" id="pf-farm-loc" class="form-input" value="${escapeHtml(farmer.farmLocation || '')}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Village / Town</label><input type="text" id="pf-village" class="form-input" value="${escapeHtml(farmer.village || '')}" /></div>
            <div class="form-group"><label class="form-label">District</label><input type="text" id="pf-district" class="form-input" value="${escapeHtml(farmer.district || '')}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">State</label><input type="text" id="pf-state" class="form-input" value="${escapeHtml(farmer.state || 'Tamil Nadu')}" /></div>
            <div class="form-group"><label class="form-label">Farm Size (acres)</label><input type="number" id="pf-farm-size" class="form-input" value="${farmer.farmSize || ''}" min="0.1" step="0.1" /></div>
          </div>
          <div class="form-group">
            <label class="form-label">Main Crops (comma separated)</label>
            <input type="text" id="pf-main-crops" class="form-input" value="${escapeHtml((farmer.mainCrops || []).join(', '))}" placeholder="Tomato, Onion, Banana" />
          </div>
          <div id="pf-error" class="form-error-box"></div>
          <button type="submit" class="btn btn-primary" id="pf-save-btn">💾 Save Changes</button>
        </form>
      </div>
    `;

        document.getElementById('farmer-profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('pf-save-btn');
            const errBox = document.getElementById('pf-error');
            errBox.style.display = 'none';
            btn.disabled = true;
            btn.innerHTML = '<span class="btn-spinner"></span> Saving...';

            try {
                const uid = firebase.auth().currentUser?.uid;
                if (!uid) throw new Error('Not authenticated');
                const update = {
                    name: document.getElementById('pf-name').value.trim(),
                    phone: document.getElementById('pf-phone').value.trim(),
                    farmLocation: document.getElementById('pf-farm-loc').value.trim(),
                    village: document.getElementById('pf-village').value.trim(),
                    district: document.getElementById('pf-district').value.trim(),
                    state: document.getElementById('pf-state').value.trim(),
                    farmSize: parseFloat(document.getElementById('pf-farm-size').value) || 0,
                    mainCrops: document.getElementById('pf-main-crops').value.split(',').map(c => c.trim()).filter(Boolean),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                await firebase.firestore().collection('farmers').doc(uid).update(update);
                if (window.AppState) window.AppState.farmer = { ...window.AppState.farmer, ...update };
                document.getElementById('topbar-name').textContent = update.name || 'Farmer';
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

window.FarmerPagesMisc = FarmerPagesMisc;
