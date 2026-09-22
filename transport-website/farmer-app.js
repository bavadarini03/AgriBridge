/* farmer-app.js — Main Dashboard Application for Farmers
   Follows the same pattern as buyer-app.js */

const AppState = {
  user: null,
  farmer: null,
  currentPage: null,
};

document.addEventListener('DOMContentLoaded', () => {
  // Bind UI toggles early
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('mobile-open');
    document.getElementById('sidebar-overlay')?.classList.toggle('active');
  });

  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
  });

  document.getElementById('profile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('profile-dropdown')?.classList.toggle('open');
  });

  const logoutFn = async () => {
    if (!confirm('Are you sure you want to logout?')) return;
    await firebase.auth().signOut();
    localStorage.removeItem('transport_token');
    localStorage.removeItem('transport_user');
    window.location.href = 'farmer.html';
  };

  document.getElementById('logout-btn')?.addEventListener('click', logoutFn);
  document.getElementById('sidebar-logout-btn')?.addEventListener('click', logoutFn);

  document.querySelectorAll('[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.getAttribute('data-page');
      navigateTo(page);
      document.getElementById('sidebar')?.classList.remove('mobile-open');
      document.getElementById('sidebar-overlay')?.classList.remove('active');
    });
  });

  window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#', '') || 'dashboard';
    if (page !== AppState.currentPage) navigateTo(page);
  });

  if (typeof FarmerPages !== 'undefined') {
    window.FarmerPages = FarmerPages;
  }

  // Auth flow using onAuthStateChanged
  firebase.auth().onAuthStateChanged(async (firebaseUser) => {
    if (!firebaseUser) {
      window._hideAuthLoading?.();
      window.location.href = 'farmer.html';
      return;
    }

    try {
      const db = firebase.firestore();
      let farmerData = null;
      try {
        const farmerDoc = await db.collection('farmers').doc(firebaseUser.uid).get();
        if (farmerDoc.exists) farmerData = farmerDoc.data();
      } catch (e) { }

      if (!farmerData) {
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        if (userDoc.exists && userDoc.data().role === 'farmer') {
          farmerData = userDoc.data();
        }
      }

      if (!farmerData || farmerData.role !== 'farmer') {
        window._hideAuthLoading?.();
        renderInitializationError(new Error('Farmer profile not found. Please register again or contact support.'));
        await firebase.auth().signOut();
        return;
      }

      AppState.farmer = { id: firebaseUser.uid, ...farmerData };
      AppState.user = { id: firebaseUser.uid, uid: firebaseUser.uid, ...farmerData, role: 'farmer' };

      // Update UI with user info
      document.getElementById('topbar-name').textContent = AppState.user.name || 'Farmer';
      document.getElementById('topbar-avatar-initial').textContent = (AppState.user.name || 'F')[0].toUpperCase();

      setConnectionStatus('connected', 'Online');

      // Hide loading overlay
      window._hideAuthLoading?.();

      // Load initial page
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      navigateTo(hash);

    } catch (err) {
      console.error('Initialization failed:', err);
      window._hideAuthLoading?.();
      renderInitializationError(err);
    }
  });
});

function setConnectionStatus(state, label) {
  const status = document.getElementById('connection-status');
  const labelEl = status?.querySelector('.conn-label');
  if (!status) return;
  status.classList.toggle('connected', state === 'connected');
  status.classList.toggle('disconnected', state !== 'connected');
  if (labelEl) labelEl.textContent = label;
}

function renderInitializationError(error) {
  const message = error.code === 'permission-denied'
    ? 'Firestore denied access to your farmer profile.'
    : error.message || 'The farmer dashboard could not be initialized.';
  const content = document.querySelector('.page-content');
  if (!content) return;
  content.innerHTML = `<div class="state-panel state-error">
    <div class="state-icon">!</div>
    <h3>Unable to load your dashboard</h3>
    <p>${message}</p>
    <button class="btn btn-primary" type="button" onclick="window.location.reload()">Retry</button>
    <button class="btn btn-secondary" type="button" onclick="window.location.href='farmer.html'">Back to Login</button>
  </div>`;
  setConnectionStatus('offline', 'Offline');
}

function navigateTo(page, params = {}) {
  const validPages = new Set([
    'dashboard', 'my-crops', 'add-crop', 'edit-crop',
    'market-prices', 'ai-recommendations', 'nearby-buyers',
    'orders', 'order-details', 'transport', 'request-transport',
    'earnings', 'voice-assistant', 'profile'
  ]);
  if (!validPages.has(page)) page = 'dashboard';
  AppState.currentPage = page;
  window.location.hash = page;

  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const section = document.getElementById(`page-${page}`);
  if (section) section.classList.add('active');

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-page') === page);
  });

  const titles = {
    dashboard: 'Home',
    'my-crops': 'My Crops',
    'add-crop': 'Add Crop',
    'edit-crop': 'Edit Crop',
    'market-prices': 'Market Prices',
    'ai-recommendations': 'AI Recommendations',
    'nearby-buyers': 'Nearby Buyers',
    orders: 'My Orders',
    'order-details': 'Order Details',
    transport: 'Transport',
    'request-transport': 'Request Transport',
    earnings: 'Earnings',
    'voice-assistant': 'Voice Assistant',
    profile: 'My Profile'
  };
  document.getElementById('page-title').textContent = titles[page] || 'AgriBridge';

  const renderFn = window.FarmerPages?.[page];
  if (renderFn) {
    renderFn(section, params).catch(err => {
      console.error(`Error rendering page ${page}:`, err);
      section.innerHTML = `<div class="form-error-box" style="display:block">Failed to load: ${err.message}</div>`;
    });
  } else {
    console.warn(`Render function for "${page}" not found in FarmerPages.`);
  }
}

window.AppState = AppState;
window.navigateTo = navigateTo;
