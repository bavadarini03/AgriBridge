/* buyer-app.js - Main Dashboard Application for Buyers */

const AppState = {
  user: null,
  buyer: null,
  currentPage: null,
  activeOrderTrackerInterval: null,
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
    await FirebaseAuth.logout();
    localStorage.removeItem('transport_token');
    localStorage.removeItem('transport_user');
    window.location.href = 'buyer.html';
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

  // Ensure BuyerPages is globally available
  if (typeof BuyerPages !== 'undefined') {
    window.BuyerPages = BuyerPages;
  }

  // Proper Auth Flow using onAuthStateChanged
  firebase.auth().onAuthStateChanged(async (firebaseUser) => {
    if (!firebaseUser) {
      window._hideAuthLoading?.();
      window.location.href = 'buyer.html';
      return;
    }

    try {
      const db = firebase.firestore();
      // Buyer access is anchored to the private buyers/{uid} profile.
      const buyerDoc = await db.collection('buyers').doc(firebaseUser.uid).get();

      if (!buyerDoc.exists || buyerDoc.data().role !== 'buyer') {
        window._hideAuthLoading?.();
        renderInitializationError(new Error('Buyer profile not found. Please register again or contact support.'));
        await firebase.auth().signOut();
        return;
      }

      AppState.buyer = { id: firebaseUser.uid, ...buyerDoc.data() };
      AppState.user = { id: firebaseUser.uid, uid: firebaseUser.uid, ...buyerDoc.data(), role: 'buyer' };

      // Update UI with user info
      document.getElementById('topbar-name').textContent = AppState.user.name || 'Buyer';
      document.getElementById('topbar-avatar-initial').textContent = (AppState.user.name || 'B')[0].toUpperCase();

      // Firebase auth is ready; realtime transport is optional and must not be
      // reported as connected unless a listener actually succeeds.
      setConnectionStatus('offline', 'Offline');

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
  status.classList.toggle('connecting', state === 'connecting');
  if (labelEl) labelEl.textContent = label;
}

function renderInitializationError(error) {
  const message = error.code === 'permission-denied'
    ? 'Firestore denied access to your buyer profile. Confirm you are signed in with the Buyer portal.'
    : error.message || 'The buyer dashboard could not be initialized.';
  const content = document.querySelector('.page-content');
  if (!content) return;
  content.innerHTML = `<div class="state-panel state-error">
    <div class="state-icon">!</div>
    <h3>Unable to load your dashboard</h3>
    <p>${message}</p>
    <button class="btn btn-primary" type="button" onclick="window.location.reload()">Retry</button>
    <button class="btn btn-secondary" type="button" onclick="window.location.href='buyer.html'">Back to Login</button>
  </div>`;
  setConnectionStatus('offline', 'Offline');
}

function navigateTo(page, params = {}) {
  const aliases = { produce: 'find-produce', farmers: 'nearby' };
  page = aliases[page] || page;
  const validPages = new Set(['dashboard', 'find-produce', 'nearby', 'orders', 'analytics', 'profile', 'produce-details', 'delivery']);
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
    dashboard: 'Overview',
    'find-produce': 'Find Produce',
    nearby: 'Nearby Farmers',
    orders: 'My Orders',
    analytics: 'Purchase Analytics',
    profile: 'Profile',
    'produce-details': 'Produce Details',
    'delivery': 'Track Delivery'
  };
  document.getElementById('page-title').textContent = titles[page] || 'AgriBridge';

  const renderFn = window.BuyerPages?.[page];
  if (renderFn) {
    renderFn(section, params).catch(err => {
      console.error(`Error rendering page ${page}:`, err);
      section.innerHTML = `<div class="form-error-box" style="display:block">Failed to load: ${err.message}</div>`;
    });
  } else {
    console.error(`Render function for ${page} not found.`);
  }
}

window.AppState = AppState;
window.navigateTo = navigateTo;
