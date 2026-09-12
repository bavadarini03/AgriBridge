/* ============================================================
   api.js — Firebase-backed API shim
   Keeps the same API.* surface that all page files use,
   but internally calls FirebaseService.* / FirebaseAuth.*
   instead of making fetch() calls to the Express backend.

   Auth / ApiError are kept for backward compatibility.
   ============================================================ */

/* ---- Auth: localStorage helper (kept for backward compat) ---- */
const Auth = {
  getToken:    () => localStorage.getItem('transport_token'),
  getUser:     () => JSON.parse(localStorage.getItem('transport_user') || 'null'),
  getDriverId: () => localStorage.getItem('transport_driver_id'),

  /** Save authenticated session to localStorage.
   *  In Firebase, `token` is the Firebase UID (no JWT needed).
   *  driverId == uid for drivers (same document).
   */
  save(uid, userProfile) {
    localStorage.setItem('transport_token',     uid);
    localStorage.setItem('transport_user',      JSON.stringify(userProfile));
    localStorage.setItem('transport_driver_id', uid);
  },

  clear() {
    localStorage.removeItem('transport_token');
    localStorage.removeItem('transport_user');
    localStorage.removeItem('transport_driver_id');
  },

  isLoggedIn() {
    return !!this.getToken() && !!this.getUser();
  }
};

/* ---- ApiError (kept for backward compat) ---- */
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/* ---- Helpers ---- */
function _wrap(promise) {
  // Normalize Firebase / generic errors into ApiError so existing
  // catch(err) handlers still work as before.
  return promise.catch(err => {
    const msg = err.message || 'An error occurred.';
    throw new ApiError(
      _friendlyError(err.code, msg),
      err.isDemo ? 0 : 500
    );
  });
}

function _friendlyError(code, fallback) {
  const map = {
    'auth/user-not-found':         'No account found with that email address.',
    'auth/wrong-password':         'Incorrect password. Please try again.',
    'auth/invalid-credential':     'Invalid email or password.',
    'auth/email-already-in-use':   'An account with that email already exists.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/too-many-requests':      'Too many attempts. Please wait a moment and try again.',
  };
  return (code && map[code]) || fallback;
}

/* ================================================================
   API — same surface as before, backed by FirebaseService
   ================================================================ */
const API = {

  /* ---- AUTH ---- */
  auth: {
    /** Login driver. Returns { user, token (=uid) }. */
    login: (email, password) => _wrap(
      FirebaseAuth.login(email, password).then(({ uid, user }) => ({
        token:    uid,
        user,
        driverId: uid
      }))
    ),

    /** Register driver. Returns { user, token (=uid) }. */
    register: (data) => _wrap(
      FirebaseAuth.register(data).then(({ uid, user }) => ({
        token:    uid,
        user,
        driverId: uid
      }))
    ),

    /** Verify current session (used on dashboard load). */
    me: () => _wrap(FirebaseService.drivers.me().then(({ driver }) => ({ user: Auth.getUser(), driver })))
  },

  /* ---- DRIVERS ---- */
  drivers: {
    me:              ()           => _wrap(FirebaseService.drivers.me()),
    setAvailability: (status)     => _wrap(FirebaseService.drivers.setAvailability(status)),
    updateLocation:  (lat, lng, deliveryId) => _wrap(FirebaseService.drivers.updateLocation(lat, lng, deliveryId)),
    earnings:        ()           => _wrap(FirebaseService.drivers.earnings()),
  },

  /* ---- VEHICLES ---- */
  vehicles: {
    me:     ()     => _wrap(FirebaseService.vehicles.me()),
    update: (data) => _wrap(FirebaseService.vehicles.update(data))
  },

  /* ---- REQUESTS ---- */
  requests: {
    list:   ()    => _wrap(FirebaseService.requests.list()),
    get:    (id)  => _wrap(FirebaseService.requests.get ? FirebaseService.requests.get(id) : Promise.resolve({})),
    accept: (id)  => _wrap(FirebaseService.requests.accept(id)),
    reject: (id)  => _wrap(FirebaseService.requests.reject(id)),
  },

  /* ---- DELIVERIES ---- */
  deliveries: {
    active:       ()             => _wrap(FirebaseService.deliveries.active()),
    updateStatus: (id, status)   => _wrap(FirebaseService.deliveries.updateStatus(id, status)),
    history:      (params = {})  => _wrap(FirebaseService.deliveries.history(params)),
    get:          (id)           => _wrap(FirebaseService.deliveries.get(id))
  },

  /* ---- NOTIFICATIONS ---- */
  notifications: {
    list:       (params = {}) => _wrap(FirebaseService.notifications.list(params)),
    markRead:   (id)          => _wrap(FirebaseService.notifications.markRead(id)),
    markAllRead: ()           => _wrap(FirebaseService.notifications.markAllRead())
  },

  /* ---- HEALTH (no-op in Firebase) ---- */
  health: () => Promise.resolve({ status: 'ok', backend: 'firebase' })
};

/* ---- Export ---- */
window.API      = API;
window.Auth     = Auth;
window.ApiError = ApiError;
