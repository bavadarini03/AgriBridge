/* ============================================================
   app.js — Main Dashboard Application  (Firebase edition)
   SPA router, sidebar navigation, topbar, initialization.

   Changes from Supabase version:
   - SocketManager.connect() still called (shim handles Firebase init)
   - handleLogout() uses FirebaseAuth.logout()
   - startLocationSharing() writes to RTDB via SocketManager.sendLocation()
   - No JWT/Express references
   ============================================================ */

/* ---- App State ---- */
const AppState = {
  user: null,
  driver: null,
  vehicle: null,
  notifCount: 0,
  currentPage: null,
  locationInterval: null,
  activeDeliveryId: null,
};

/* ---- Page modules registry ---- */
const Pages = {};

/* ---- Initialize on DOM ready ---- */
document.addEventListener('DOMContentLoaded', async () => {

  // Show demo banner on dashboard too
  if (window.DEMO_MODE) {
    _showDashDemoBanner();
  }

  // Auth guard
  if (!Auth.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  AppState.user = Auth.getUser();
  if (AppState.user?.role !== 'driver') {
    await FirebaseAuth.logout();
    Auth.clear();
    window.location.href = 'index.html';
    return;
  }

  // Populate topbar
  document.getElementById('topbar-name').textContent = AppState.user?.name || 'Driver';
  document.getElementById('topbar-avatar-initial').textContent = (AppState.user?.name || 'D')[0].toUpperCase();

  // Connect Firebase realtime shim
  SocketManager.connect();
  bindGlobalSocketEvents();

  // Mobile sidebar toggle
  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  // Profile dropdown
  document.getElementById('profile-menu-btn')?.addEventListener('click', toggleProfileMenu);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#profile-menu-btn') && !e.target.closest('#profile-dropdown')) {
      document.getElementById('profile-dropdown')?.classList.remove('open');
    }
  });

  // Logout handler
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('sidebar-logout-btn')?.addEventListener('click', handleLogout);

  // Navigation
  document.querySelectorAll('[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.getAttribute('data-page');
      navigateTo(page);
      closeSidebar();
    });
  });

  // Load initial driver + vehicle data
  try {
    await loadDriverProfile();
  } catch (err) {
    console.error('[App] Profile load failed:', err.message);
  }

  // Route based on hash or default
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);

  // Load notification count
  loadNotifCount();
});

/* ---- Demo mode banner on dashboard ---- */
function _showDashDemoBanner() {
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:9999;',
    'background:#f59e0b;color:#1c1917;padding:8px 20px;',
    'font-size:12px;font-weight:600;text-align:center;'
  ].join('');
  banner.textContent = '\u26A0\uFE0F Demo Mode — Firebase not configured. Data shown is placeholder only. See FIREBASE_SETUP.md.';
  document.body.prepend(banner);
  const shell = document.querySelector('.app-shell');
  if (shell) shell.style.marginTop = '36px';
}

/* ---- Navigation ---- */
function navigateTo(page) {
  AppState.currentPage = page;
  window.location.hash = page;

  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const section = document.getElementById(`page-${page}`);
  if (section) section.classList.add('active');

  document.querySelectorAll('[data-page]').forEach(link => {
    link.closest('.nav-item')?.classList.toggle('active', link.getAttribute('data-page') === page);
  });

  const pageTitles = {
    dashboard: 'Dashboard', requests: 'Transport Requests',
    active: 'Active Delivery', tracking: 'Live Tracking',
    history: 'Delivery History', earnings: 'Earnings',
    vehicle: 'My Vehicle', notifications: 'Notifications', profile: 'Profile'
  };
  document.getElementById('page-title').textContent = pageTitles[page] || 'Dashboard';

  const loader = Pages[page];
  if (loader) loader();
}

/* ---- Load driver profile and store in state ---- */
async function loadDriverProfile() {
  const [driverData, vehicleData] = await Promise.all([
    API.drivers.me().catch(() => null),
    API.vehicles.me().catch(() => null)
  ]);

  if (driverData?.driver) {
    AppState.driver = {
      ...driverData.driver,
      id: driverData.driver.id || driverData.driver.driver_id
    };
  }

  if (vehicleData?.vehicle) {
    AppState.vehicle = vehicleData.vehicle;
    updateVehicleDisplay();
  }
}

/* ---- Availability UI sync (no-op stub) ---- */
function updateAvailabilityUI(status) {
  if (AppState.driver) AppState.driver.status = 'available';
}

/* ---- Vehicle display in sidebar ---- */
function updateVehicleDisplay() {
  const v = AppState.vehicle;
  if (!v) return;
  const el = document.getElementById('sidebar-vehicle');
  if (el) {
    el.innerHTML = `<span>${VEHICLE_EMOJI[v.type] || '\uD83D\uDE9B'}</span> ${escapeHtml(v.number || v.type)}`;
  }
}

/* ---- Global availability toggle (no-op stub) ---- */
window.setAvailability = async function (status) {
  // Availability status feature removed — driver is always available
};

/* ---- Global Socket (Firebase) events ---- */
function bindGlobalSocketEvents() {

  SocketManager.on('transport:new_request', (data) => {
    AppState.notifCount++;
    updateNotifBadge();
    const qty = data.request?.quantity_kg || data.request?.quantityKg || 0;
    Toast.show(`\uD83D\uDCE6 New delivery request: ${data.request?.crop} (${qty} kg)`, 'info', 6000);
    if (AppState.currentPage === 'requests' && Pages.requests) Pages.requests();
  }, 'global');

  SocketManager.on('delivery:completed', (data) => {
    Toast.show(`\u2705 Delivery completed! Earnings: ${fmtCurrency(data.earnings?.total)}`, 'success', 6000);
    AppState.activeDeliveryId = null;
    stopLocationSharing();
    if (AppState.currentPage === 'active' && Pages.active) Pages.active();
  }, 'global');

  SocketManager.on('notification:new', (data) => {
    AppState.notifCount++;
    updateNotifBadge();
    Toast.show(`${data.title}: ${data.message}`, 'info');
  }, 'global');
}

/* ---- Notification badge ---- */
function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  badge.textContent = AppState.notifCount > 9 ? '9+' : AppState.notifCount;
  badge.style.display = AppState.notifCount > 0 ? 'flex' : 'none';
}

async function loadNotifCount() {
  try {
    const data = await API.notifications.list({ limit: 50 });
    AppState.notifCount = data.unreadCount || 0;
    updateNotifBadge();
  } catch (_) { }
}

document.getElementById('notif-btn')?.addEventListener('click', () => {
  navigateTo('notifications');
});

/* ---- GPS location sharing ---- */
function startLocationSharing(deliveryId) {
  if (AppState.locationInterval) return;
  if (!navigator.geolocation) {
    Toast.show('GPS not available on this device.', 'warning');
    return;
  }

  const sendPos = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        // Write to RTDB via socket shim
        SocketManager.sendLocation(lat, lng, deliveryId);
        // Also update Firestore driver doc (non-critical)
        API.drivers.updateLocation(lat, lng, deliveryId).catch(() => { });
        // Update tracking page if open
        if (AppState.currentPage === 'tracking') {
          document.dispatchEvent(new CustomEvent('location:update', { detail: { lat, lng } }));
        }
      },
      (err) => {
        document.dispatchEvent(new CustomEvent('location:error', { detail: err }));
        const msg = err.code === 1
          ? 'Location permission denied. Please allow location access.'
          : 'GPS unavailable. Check device settings.';
        document.getElementById('location-error-banner') && (document.getElementById('location-error-banner').style.display = 'block');
        console.warn('[GPS]', msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  sendPos();
  AppState.locationInterval = setInterval(sendPos, 8000);
  console.log('[GPS] Location sharing started for delivery:', deliveryId);
}

function stopLocationSharing() {
  if (AppState.locationInterval) {
    clearInterval(AppState.locationInterval);
    AppState.locationInterval = null;
    console.log('[GPS] Location sharing stopped');
  }
}

/* ---- Sidebar helpers ---- */
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('mobile-open');
  document.getElementById('sidebar-overlay')?.classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
}

/* ---- Profile menu ---- */
function toggleProfileMenu() {
  document.getElementById('profile-dropdown')?.classList.toggle('open');
}

/* ---- Logout ---- */
async function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  stopLocationSharing();
  SocketManager.disconnect();
  await FirebaseAuth.logout();
  Auth.clear();
  window.location.href = 'index.html';
}

/* ---- Expose to window ---- */
window.AppState = AppState;
window.Pages = Pages;
window.navigateTo = navigateTo;
window.loadDriverProfile = loadDriverProfile;
window.updateAvailabilityUI = updateAvailabilityUI;
window.startLocationSharing = startLocationSharing;
window.stopLocationSharing = stopLocationSharing;
window.updateNotifBadge = updateNotifBadge;
window.loadNotifCount = loadNotifCount;
