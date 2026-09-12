/* ============================================================
   history.js — Delivery History Page
   With date filters, status filters, data table
   ============================================================ */

Pages.history = async function() {
  const el = document.getElementById('page-history');
  if (!el) return;

  el.innerHTML = `
    <div >
      <div class="page-header">
        <h1 class="page-title">Delivery History</h1>
      </div>

      <div class="filter-bar">
        <div class="filter-group">
          <label class="filter-label">From</label>
          <input type="date" id="filter-from" class="form-input filter-input" onchange="applyHistoryFilters()">
        </div>
        <div class="filter-group">
          <label class="filter-label">To</label>
          <input type="date" id="filter-to" class="form-input filter-input" onchange="applyHistoryFilters()">
        </div>
        <div class="filter-group">
          <label class="filter-label">Status</label>
          <select id="filter-status" class="form-select filter-input" onchange="applyHistoryFilters()">
            <option value="">All</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div class="filter-quick">
          <button class="btn btn-secondary btn-sm" onclick="setHistoryPeriod('today')">Today</button>
          <button class="btn btn-secondary btn-sm" onclick="setHistoryPeriod('week')">This Week</button>
          <button class="btn btn-secondary btn-sm" onclick="setHistoryPeriod('month')">This Month</button>
          <button class="btn btn-secondary btn-sm" onclick="setHistoryPeriod('all')">All</button>
        </div>
      </div>

      <div class="card mt-1">
        <div class="card-body p-0" id="history-table-area">
          <div class="loading-area p-2">${renderSkeleton(6)}</div>
        </div>
      </div>

      <div class="history-summary" id="history-summary" style="display:none;">
        <div class="summary-item"><span class="summary-label">Total Deliveries</span><span class="summary-value" id="hist-count">0</span></div>
        <div class="summary-item"><span class="summary-label">Total Earnings</span><span class="summary-value earnings-green" id="hist-earnings">₹0</span></div>
        <div class="summary-item"><span class="summary-label">Total Distance</span><span class="summary-value" id="hist-distance">0 km</span></div>
      </div>
    </div>
  `;

  await loadHistory();
};

let _historyData = [];

async function loadHistory(params = {}) {
  const area = document.getElementById('history-table-area');
  if (!area) return;
  area.innerHTML = `<div class="loading-area p-2">${renderSkeleton(5)}</div>`;

  try {
    const data = await API.deliveries.history(params);
    _historyData = data.deliveries || [];
    renderHistoryTable(_historyData);
  } catch (err) {
    area.innerHTML = `<div class="error-state p-2">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

function renderHistoryTable(deliveries) {
  const area = document.getElementById('history-table-area');
  const summary = document.getElementById('history-summary');
  if (!area) return;

  // Update summary
  if (summary && deliveries.length > 0) {
    summary.style.display = 'flex';
    document.getElementById('hist-count').textContent = deliveries.length;
    const totalEarnings = deliveries.reduce((s, d) => s + parseFloat(d.earnings?.total || d.payment || 0), 0);
    document.getElementById('hist-earnings').textContent = fmtCurrency(totalEarnings);
    const totalDist = deliveries.reduce((s, d) => s + parseFloat(d.distance_km || d.transport_requests?.estimated_distance_km || 0), 0);
    document.getElementById('hist-distance').textContent = `${totalDist.toFixed(1)} km`;
  } else if (summary) {
    summary.style.display = 'none';
  }

  if (deliveries.length === 0) {
    area.innerHTML = `
      <div class="empty-state p-3">
        <div class="empty-icon">📜</div>
        <h3 class="empty-title">No Deliveries Found</h3>
        <p class="empty-message">No delivery history for the selected period.</p>
      </div>`;
    return;
  }

  area.innerHTML = `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Delivery ID</th>
            <th>Crop</th>
            <th>Qty (kg)</th>
            <th>Pickup</th>
            <th>Destination</th>
            <th>Distance</th>
            <th>Status</th>
            <th>Earned</th>
          </tr>
        </thead>
        <tbody>
          ${deliveries.map(d => {
            const req = d.transport_requests;
            const earned = d.earnings?.total || d.payment || 0;
            return `
              <tr>
                <td class="text-sm">${fmtDate(d.created_at || d.createdAt)}</td>
                <td class="text-sm text-muted">DEL-${(d.id || '').slice(-8).toUpperCase()}</td>
                <td><span class="crop-cell">${CROP_EMOJI[req?.crop] || '🌿'} ${escapeHtml(req?.crop || '—')}</span></td>
                <td>${req?.quantity_kg || '—'}</td>
                <td class="text-sm">${escapeHtml((req?.pickup_address || '—').substring(0, 35))}${req?.pickup_address?.length > 35 ? '…' : ''}</td>
                <td class="text-sm">${escapeHtml((req?.destination_address || '—').substring(0, 35))}${req?.destination_address?.length > 35 ? '…' : ''}</td>
                <td>${d.distance_km || req?.estimated_distance_km || '—'} km</td>
                <td><span class="badge badge-${d.status}">${fmtStatus(d.status)}</span></td>
                <td class="earnings-green font-semibold">${earned ? fmtCurrency(earned) : '—'}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.applyHistoryFilters = function() {
  const from = document.getElementById('filter-from')?.value;
  const to = document.getElementById('filter-to')?.value;
  const status = document.getElementById('filter-status')?.value;

  let filtered = [..._historyData];
  if (from) filtered = filtered.filter(d => (d.created_at || '') >= from);
  if (to) filtered = filtered.filter(d => (d.created_at || '') <= to + 'T23:59:59');
  if (status) filtered = filtered.filter(d => d.status === status);

  renderHistoryTable(filtered);
};

window.setHistoryPeriod = function(period) {
  const now = new Date();
  const fromEl = document.getElementById('filter-from');
  const toEl = document.getElementById('filter-to');

  if (!fromEl || !toEl) return;

  const toDate = now.toISOString().split('T')[0];
  let fromDate;

  if (period === 'today') {
    fromDate = toDate;
  } else if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    fromDate = d.toISOString().split('T')[0];
  } else if (period === 'month') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    fromDate = d.toISOString().split('T')[0];
  } else {
    fromEl.value = '';
    toEl.value = '';
    applyHistoryFilters();
    return;
  }

  fromEl.value = fromDate;
  toEl.value = toDate;
  applyHistoryFilters();
};
