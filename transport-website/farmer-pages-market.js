/* farmer-pages-market.js — Market Prices, AI Recommendations, Nearby Buyers */

const MARKET_DATA = {
  Tomato: { price: 35, demand: 'High', trend: '↑', min: 25, max: 48, rec: 'Good time to sell' },
  Onion: { price: 28, demand: 'Medium', trend: '→', min: 18, max: 40, rec: 'Prices stable, hold if possible' },
  Potato: { price: 22, demand: 'High', trend: '↑', min: 15, max: 30, rec: 'Demand rising, sell now' },
  Banana: { price: 30, demand: 'Medium', trend: '→', min: 20, max: 38, rec: 'Moderate demand' },
  Brinjal: { price: 32, demand: 'Low', trend: '↓', min: 22, max: 42, rec: 'Wait for better prices' },
  Chilli: { price: 65, demand: 'High', trend: '↑', min: 45, max: 85, rec: 'Great time to sell!' },
  Carrot: { price: 40, demand: 'Medium', trend: '↑', min: 30, max: 55, rec: 'Prices going up' },
  Spinach: { price: 25, demand: 'Low', trend: '↓', min: 15, max: 35, rec: 'Oversupply in market' },
  Rice: { price: 42, demand: 'High', trend: '→', min: 35, max: 50, rec: 'Stable demand' },
  Coconut: { price: 18, demand: 'Medium', trend: '↑', min: 12, max: 25, rec: 'Prices improving' },
  Mango: { price: 55, demand: 'High', trend: '↑', min: 40, max: 80, rec: 'Season peak — sell now!' },
  Groundnut: { price: 75, demand: 'Medium', trend: '→', min: 60, max: 90, rec: 'Fair price currently' }
};

const FarmerPagesMarket = {

  /* ──────────────── MARKET PRICES ──────────────── */
  'market-prices': async (container) => {
    const cropNames = Object.keys(MARKET_DATA);
    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;">
        <h3 style="margin-top:0;">📈 Market Prices</h3>
        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
          <select id="mp-crop" class="form-input" style="width:200px;">
            <option value="">All Crops</option>
            ${cropNames.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="mp-refresh">Refresh</button>
        </div>
        <div id="mp-results" class="produce-grid"></div>
      </div>
    `;

    const renderPrices = (filter) => {
      const el = document.getElementById('mp-results');
      const entries = filter ? [[filter, MARKET_DATA[filter]]] : Object.entries(MARKET_DATA);
      if (!entries.length || (filter && !MARKET_DATA[filter])) {
        el.innerHTML = '<div style="padding:20px;color:#888;">No data for selected crop.</div>';
        return;
      }
      el.innerHTML = entries.map(([name, d]) => {
        const emoji = window.CROP_EMOJI?.[name] || '🌱';
        const demandColor = d.demand === 'High' ? '#2E7D32' : d.demand === 'Medium' ? '#F57F17' : '#c62828';
        const trendColor = d.trend === '↑' ? '#2E7D32' : d.trend === '↓' ? '#c62828' : '#888';
        return `<div class="produce-card">
          <div style="text-align:center;font-size:40px;padding:16px;">${emoji}</div>
          <div class="produce-info">
            <div class="produce-title">${escapeHtml(name)}</div>
            <div class="produce-price">₹${d.price}/kg</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
              <span class="badge" style="color:${demandColor};">Demand: ${d.demand}</span>
              <span class="badge" style="color:${trendColor};">Trend: ${d.trend} ${d.trend === '↑' ? 'Increasing' : d.trend === '↓' ? 'Decreasing' : 'Stable'}</span>
            </div>
            <div style="font-size:0.85rem;color:#666;">Range: ₹${d.min} — ₹${d.max}/kg</div>
            <div style="margin-top:8px;padding:10px;background:#F1F8E9;border-radius:8px;font-size:0.85rem;color:#1B5E20;">
              💡 ${d.rec}
            </div>
          </div>
        </div>`;
      }).join('');
    };

    document.getElementById('mp-crop').addEventListener('change', (e) => renderPrices(e.target.value));
    document.getElementById('mp-refresh').addEventListener('click', () => renderPrices(document.getElementById('mp-crop').value));
    renderPrices('');
  },

  /* ──────────────── AI RECOMMENDATIONS ──────────────── */
  'ai-recommendations': async (container) => {
    const farmer = window.AppState?.farmer || {};
    const mainCrops = farmer.mainCrops || [];

    // Generate AI recommendations based on market data
    const cultivateRecs = Object.entries(MARKET_DATA)
      .filter(([, d]) => d.demand === 'High')
      .map(([name, d]) => ({ name, price: d.price, demand: d.demand }));

    const sellNow = Object.entries(MARKET_DATA)
      .filter(([, d]) => d.trend === '↑' && d.demand !== 'Low')
      .map(([name, d]) => ({ name, price: d.price, rec: d.rec }));

    const waitCrops = Object.entries(MARKET_DATA)
      .filter(([, d]) => d.trend === '↓' || d.demand === 'Low')
      .map(([name, d]) => ({ name, price: d.price, rec: d.rec }));

    container.innerHTML = `
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <div style="flex:1;min-width:300px;background:#fff;border-radius:12px;padding:20px;">
          <h3 style="margin-top:0;color:#1B5E20;">🌱 What to Cultivate</h3>
          <p style="color:#888;font-size:0.9rem;">High-demand crops for maximum returns:</p>
          ${cultivateRecs.map(c => {
      const emoji = window.CROP_EMOJI?.[c.name] || '🌱';
      return `<div style="border:1px solid #E8F5E9;border-radius:10px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;">
              <span style="font-size:28px;">${emoji}</span>
              <div>
                <div style="font-weight:700;">${c.name}</div>
                <div style="font-size:0.85rem;color:#2E7D32;">High Demand · Expected ₹${c.price}/kg</div>
              </div>
            </div>`;
    }).join('')}
        </div>

        <div style="flex:1;min-width:300px;">
          <div style="background:#F1F8E9;border:2px solid #81C784;border-radius:12px;padding:20px;margin-bottom:20px;">
            <h3 style="margin-top:0;color:#2E7D32;">✅ SELL NOW</h3>
            ${sellNow.map(c => `<div style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
              <strong>${c.name}</strong> — ₹${c.price}/kg
              <div style="font-size:0.8rem;color:#33691E;">${c.rec}</div>
            </div>`).join('')}
          </div>

          <div style="background:#FFF3E0;border:2px solid #FFB74D;border-radius:12px;padding:20px;margin-bottom:20px;">
            <h3 style="margin-top:0;color:#E65100;">⏳ WAIT</h3>
            ${waitCrops.map(c => `<div style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
              <strong>${c.name}</strong> — ₹${c.price}/kg
              <div style="font-size:0.8rem;color:#BF360C;">${c.rec}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <div style="background:#fff;border-radius:12px;padding:20px;margin-top:20px;">
        <h3 style="margin-top:0;">📊 Demand Forecast</h3>
        <div class="produce-grid">
          ${Object.entries(MARKET_DATA).map(([name, d]) => {
      const emoji = window.CROP_EMOJI?.[name] || '🌱';
      const barWidth = d.demand === 'High' ? 90 : d.demand === 'Medium' ? 55 : 25;
      const barColor = d.demand === 'High' ? '#2E7D32' : d.demand === 'Medium' ? '#F57F17' : '#c62828';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;">
              <span style="width:28px;font-size:20px;">${emoji}</span>
              <span style="width:80px;font-size:0.9rem;font-weight:600;">${name}</span>
              <div style="flex:1;background:#e0e0e0;border-radius:4px;height:14px;overflow:hidden;">
                <div style="width:${barWidth}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.6s;"></div>
              </div>
              <span style="width:60px;font-size:0.8rem;color:${barColor};font-weight:600;">${d.demand}</span>
            </div>`;
    }).join('')}
        </div>
      </div>
    `;
  },

  /* ──────────────── NEARBY BUYERS ──────────────── */
  'nearby-buyers': async (container) => {
    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;">
        <h3 style="margin-top:0;">🏪 Nearby Buyers</h3>
        <p style="color:#888;font-size:0.9rem;">Buyers actively looking for produce near you.</p>
        <div id="nearby-buyers-list"><div style="text-align:center;padding:30px;color:#888;">Loading buyers...</div></div>
      </div>
    `;

    try {
      const db = firebase.firestore();
      const farmer = window.AppState?.farmer || {};
      const farmerLat = farmer.latitude || 10.0;
      const farmerLng = farmer.longitude || 78.0;

      let buyers = [];
      let orders = [];

      // 1. Try fetching from buyers collection
      try {
        const buyersSnap = await db.collection('buyers').get();
        buyers = buyersSnap.docs.map(d => {
          const data = d.data();
          // Public marketplace fields only
          return {
            id: d.id,
            businessName: data.businessName || data.name || 'Buyer',
            city: data.city || data.district || 'Tamil Nadu',
            district: data.district || '',
            buyerType: data.buyerType || 'Retailer',
            latitude: data.latitude,
            longitude: data.longitude
          };
        });
      } catch (bErr) {
        console.warn('buyers collection read notice:', bErr);
      }

      // 2. If buyers collection is restricted by remote rules, fallback to farmer's authorized orders query
      if (buyers.length === 0 && farmerUid) {
        try {
          const ordersSnap = await db.collection('orders').where('farmerId', '==', farmerUid).get();
          orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const seenBuyers = new Set();
          orders.forEach(o => {
            if (o.buyerId && !seenBuyers.has(o.buyerId)) {
              seenBuyers.add(o.buyerId);
              buyers.push({
                id: o.buyerId,
                businessName: o.buyerName || 'Verified Buyer',
                city: o.deliveryCity || o.deliveryDistrict || 'Tamil Nadu',
                district: o.deliveryDistrict || '',
                buyerType: 'Verified Market Buyer',
                latitude: null,
                longitude: null
              });
            }
          });
        } catch (oErr) {
          console.warn('orders fallback read notice:', oErr);
        }
      }

      const el = document.getElementById('nearby-buyers-list');
      if (buyers.length === 0) {
        el.innerHTML = `<div style="text-align:center;padding:40px;color:#888;">
          <div style="font-size:40px;margin-bottom:8px;">🏪</div>
          <div>No active buyers found in your region yet.</div>
        </div>`;
        return;
      }

      // Map buyer orders
      const buyerOrders = {};
      orders.forEach(o => {
        if (o.buyerId) {
          if (!buyerOrders[o.buyerId]) buyerOrders[o.buyerId] = [];
          buyerOrders[o.buyerId].push(o);
        }
      });

      el.innerHTML = buyers.map(b => {
        const dist = (b.latitude && b.longitude)
          ? Math.round(haversineKm(farmerLat, farmerLng, b.latitude, b.longitude))
          : null;
        const bOrders = buyerOrders[b.id] || [];
        const recentCrops = [...new Set(bOrders.slice(0, 5).map(o => o.cropName).filter(Boolean))];

        return `<div style="border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:12px;background:#fafafa;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-weight:700;font-size:1rem;color:#1B5E20;">🏪 ${escapeHtml(b.businessName)}</div>
              <div style="color:#666;font-size:0.85rem;margin-top:2px;">
                📍 ${escapeHtml(b.city)} ${b.district && b.district !== b.city ? `(${escapeHtml(b.district)})` : ''}
                ${dist != null ? ` · ${dist} km away` : ''}
              </div>
              <div style="color:#555;font-size:0.8rem;margin-top:4px;">🏷️ Type: ${escapeHtml(b.buyerType)}</div>
            </div>
            <span class="badge" style="background:#E8F5E9;color:#1B5E20;">${bOrders.length} active order${bOrders.length !== 1 ? 's' : ''}</span>
          </div>
          ${recentCrops.length > 0 ? `
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e0e0e0;">
              <span style="font-size:0.8rem;color:#666;font-weight:600;">Looking for:</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                ${recentCrops.map(c => `<span class="badge" style="background:#fff;border:1px solid #c8e6c9;color:#2E7D32;">${window.CROP_EMOJI?.[c] || '🌱'} ${escapeHtml(c)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>`;
      }).join('');
    } catch (e) {
      document.getElementById('nearby-buyers-list').innerHTML = `<div style="color:#e53935;padding:16px;">Error: ${escapeHtml(e.message)}</div>`;
    }
  }
};

window.FarmerPagesMarket = FarmerPagesMarket;
window.MARKET_DATA = MARKET_DATA;
