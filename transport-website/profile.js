/* Driver profile page */

Pages.profile = async function() {
  const el = document.getElementById('page-profile');
  if (!el) return;

  el.innerHTML = `
    <div>
      <div>
        <div>
          <h1 class="page-title">Profile</h1>
          <p class="page-subtitle">Your driver account details.</p>
        </div>
      </div>
      <div class="loading-area">${renderSkeleton(3)}</div>
    </div>
  `;

  const [driverData, vehicleData] = await Promise.all([
    AppState.driver ? Promise.resolve({ driver: AppState.driver }) : API.drivers.me().catch(() => null),
    AppState.vehicle ? Promise.resolve({ vehicle: AppState.vehicle }) : API.vehicles.me().catch(() => null)
  ]);

  const driver = driverData?.driver || AppState.driver;
  const user = AppState.user || Auth.getUser();

  if (!driver || !user) {
    el.innerHTML = '<div class="page-section"><div class="error-state">Profile unavailable. Please refresh.</div></div>';
    return;
  }

  if (driverData?.driver) AppState.driver = driverData.driver;
  if (vehicleData?.vehicle) AppState.vehicle = vehicleData.vehicle;

  el.innerHTML = `
    <div >
      <div >
        <div>
          <h1 class="page-title">Profile</h1>
          <p class="page-subtitle">Your driver account details.</p>
        </div>
      </div>
      <div class="stats-grid">
        <div class="card"><div class="card-body"><div class="stat-label">Name</div><div class="stat-value profile-value">${escapeHtml(user.name || '—')}</div></div></div>
        <div class="card"><div class="card-body"><div class="stat-label">Email</div><div class="stat-value profile-value">${escapeHtml(user.email || '—')}</div></div></div>
        <div class="card"><div class="card-body"><div class="stat-label">Rating</div><div class="stat-value profile-value">${parseFloat(driver.rating || 5).toFixed(1)} ⭐</div></div></div>
        <div class="card"><div class="card-body"><div class="stat-label">Status</div><div class="stat-value profile-value"><span class="badge badge-${driver.status || 'offline'}">${fmtStatus(driver.status || 'offline')}</span></div></div></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Performance</h3></div>
        <div class="card-body">
          <div class="history-summary" style="display:flex;">
            <div class="summary-item"><span class="summary-label">Completed Deliveries</span><span class="summary-value">${driver.total_deliveries || 0}</span></div>
            <div class="summary-item"><span class="summary-label">Total Earnings</span><span class="summary-value">${fmtCurrency(driver.total_earnings || 0)}</span></div>
            <div class="summary-item"><span class="summary-label">Location Updated</span><span class="summary-value">${driver.location_updated_at ? fmtDateTime(driver.location_updated_at) : 'Not yet'}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
};
