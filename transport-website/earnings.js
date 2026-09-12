/* ============================================================
   earnings.js — Earnings Dashboard Page
   Shows period totals, breakdown, recent payment table
   ============================================================ */

Pages.earnings = async function() {
  const el = document.getElementById('page-earnings');
  if (!el) return;

  el.innerHTML = `
    <div>
      <h1 class="page-title">Earnings</h1>
      <p class="page-subtitle">Your delivery income summary</p>
      <div id="earnings-content"><div class="loading-area">${renderSkeleton(4)}</div></div>
    </div>
  `;

  await loadEarnings();
};

async function loadEarnings() {
  const content = document.getElementById('earnings-content');
  if (!content) return;

  try {
    const data = await API.drivers.earnings();
    renderEarnings(data);
  } catch (err) {
    content.innerHTML = `<div class="error-state">Failed to load: ${escapeHtml(err.message)}
      <button class="btn btn-secondary mt-2" onclick="loadEarnings()">Retry</button></div>`;
  }
}

function renderEarnings(data) {
  const content = document.getElementById('earnings-content');
  if (!content) return;

  content.innerHTML = `
    <!-- Period Cards -->
    <div class="earnings-grid">
      <div class="earnings-card">
        <div class="earnings-period">Today</div>
        <div class="earnings-amount">${fmtCurrency(data.today?.total)}</div>
        <div class="earnings-deliveries">${data.today?.count || 0} deliveries</div>
      </div>
      <div class="earnings-card">
        <div class="earnings-period">This Week</div>
        <div class="earnings-amount">${fmtCurrency(data.thisWeek?.total)}</div>
        <div class="earnings-deliveries">${data.thisWeek?.count || 0} deliveries</div>
      </div>
      <div class="earnings-card">
        <div class="earnings-period">This Month</div>
        <div class="earnings-amount">${fmtCurrency(data.thisMonth?.total)}</div>
        <div class="earnings-deliveries">${data.thisMonth?.count || 0} deliveries</div>
      </div>
      <div class="earnings-card earnings-card-total">
        <div class="earnings-period">All Time</div>
        <div class="earnings-amount">${fmtCurrency(data.allTime?.total)}</div>
        <div class="earnings-deliveries">${data.allTime?.count || 0} deliveries</div>
      </div>
    </div>

    <!-- Earnings Formula Explanation -->
    <div class="card mt-2">
      <div class="card-header"><h3 class="card-title">How Your Earnings Are Calculated</h3></div>
      <div class="card-body">
        <div class="earnings-formula">
          <div class="formula-item">
            <div class="formula-label">Base Fare</div>
            <div class="formula-value">₹50 flat per delivery</div>
          </div>
          <div class="formula-op">+</div>
          <div class="formula-item">
            <div class="formula-label">Distance Charge</div>
            <div class="formula-value">₹12 × km</div>
          </div>
          <div class="formula-op">+</div>
          <div class="formula-item">
            <div class="formula-label">Load Charge</div>
            <div class="formula-value">₹8 per 100 kg</div>
          </div>
        </div>
        <p class="text-muted text-sm mt-1">Minimum fare: ₹80 per delivery. Calculated by backend — not estimated in the app.</p>
      </div>
    </div>

    <!-- Recent Payments -->
    <div class="card mt-1">
      <div class="card-header"><h3 class="card-title">Recent Payments</h3></div>
      <div class="card-body p-0">
        ${renderRecentPayments(data.recent)}
      </div>
    </div>
  `;
}

function renderRecentPayments(recent) {
  if (!recent || recent.length === 0) {
    return `<div class="empty-state p-3">
      <div class="empty-icon">💳</div>
      <h3 class="empty-title">No Payments Yet</h3>
      <p class="empty-message">Complete your first delivery to see payment records.</p>
    </div>`;
  }

  return `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Base Fare</th>
            <th>Distance</th>
            <th>Load</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map(e => `
            <tr>
              <td class="text-sm">${fmtDate(e.date || e.created_at)}</td>
              <td>${fmtCurrency(e.base_fare)}</td>
              <td>${fmtCurrency(e.distance_charge)}</td>
              <td>${fmtCurrency(e.load_charge)}</td>
              <td class="earnings-green font-semibold">${fmtCurrency(e.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
