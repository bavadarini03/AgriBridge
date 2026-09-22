/* ============================================================
   socket.js — Firebase Realtime Shim (replaces Socket.IO)
   Keeps the same SocketManager.* surface that all page files
   use. Internally attaches Firestore / RTDB listeners instead
   of Socket.IO events.

   Event → Firebase mapping:
     transport:new_request      → Firestore transportRequests (onSnapshot, added)
     transport:request_cancelled→ Firestore transportRequests (onSnapshot, modified)
     delivery:status_changed    → RTDB deliveryStatus/{id}   (on value)
     delivery:location_updated  → RTDB locations/{id}        (on value)
     delivery:completed         → RTDB deliveryStatus/{id} when status=delivered
     driver:availability_changed→ Firestore drivers/{uid}    (onSnapshot)
     driver:availability_ack    → fired alongside above
     notification:new           → Firestore notifications     (onSnapshot, added)
   ============================================================ */

const SocketManager = (() => {

  /* ----------------------------------------------------------------
     Internal state
     ---------------------------------------------------------------- */
  // _registry[event][namespace] = [callback, ...]
  const _registry = {};

  // _nsUnsubs[namespace] = [unsubscribeFn, ...]
  const _nsUnsubs = {};

  // RTDB refs per delivery
  const _deliveryUnsubs = {}; // deliveryId -> { location: fn, status: fn }

  /* ----------------------------------------------------------------
     Public: connect / disconnect
     ---------------------------------------------------------------- */
  function connect() {
    _updateConnStatus(DEMO_MODE ? 'demo' : 'connected');
  }

  function disconnect() {
    Object.keys(_nsUnsubs).forEach(_offNamespace);
    Object.keys(_deliveryUnsubs).forEach(leaveDelivery);
    _updateConnStatus('disconnected');
  }

  /* ----------------------------------------------------------------
     Public: on / off
     ---------------------------------------------------------------- */
  function on(event, callback, namespace = 'default') {
    if (!_registry[event]) _registry[event] = {};
    if (!_registry[event][namespace]) _registry[event][namespace] = [];
    _registry[event][namespace].push(callback);
    _setupFirebaseListener(event, namespace);
  }

  function off(namespace) {
    _offNamespace(namespace);
  }

  /* ----------------------------------------------------------------
     Public: emit (no-op shim — kept for API compat)
     ---------------------------------------------------------------- */
  function emit(event, data) {
    // Direct Firebase calls replace socket emissions.
    // Specific actions (setAvailability, sendLocation) have dedicated methods.
  }

  /* ----------------------------------------------------------------
     Public: driver-specific helpers
     ---------------------------------------------------------------- */
  function setAvailability(status) {
    // No-op: API.drivers.setAvailability() handles the Firebase write.
    // The Firestore listener on the driver doc fires automatically.
  }

  function sendLocation(lat, lng, deliveryId) {
    if (DEMO_MODE || !deliveryId) return;
    const uid = firebase.auth().currentUser?.uid;
    if (!uid) return;
    firebase.database().ref(`locations/${deliveryId}`).set({
      driverId: uid, latitude: lat, longitude: lng, timestamp: Date.now()
    }).catch(e => console.error('[GPS] RTDB write failed:', e));
  }

  function isConnected() {
    return !DEMO_MODE && !!firebase.auth().currentUser;
  }

  /* ----------------------------------------------------------------
     Public: delivery room (RTDB listeners for specific delivery)
     ---------------------------------------------------------------- */
  function joinDelivery(deliveryId) {
    if (DEMO_MODE || !deliveryId || _deliveryUnsubs[deliveryId]) return;

    const rtdb = firebase.database();

    // --- Location updates ---
    const locationRef = rtdb.ref(`locations/${deliveryId}`);
    const locationHandler = snapshot => {
      const d = snapshot.val();
      if (!d) return;
      _fire('delivery:location_updated', {
        deliveryId, lat: d.latitude, lng: d.longitude,
        timestamp: new Date(d.timestamp || Date.now()).toISOString()
      });
    };
    locationRef.on('value', locationHandler);

    // --- Status updates ---
    const statusRef = rtdb.ref(`deliveryStatus/${deliveryId}`);
    let _prevStatus = null;
    const statusHandler = snapshot => {
      const d = snapshot.val();
      if (!d || d.status === _prevStatus) return;
      _prevStatus = d.status;

      _fire('delivery:status_changed', { deliveryId, status: d.status });

      if (d.status === 'delivered') {
        // Fetch final earnings from Firestore before firing completed
        firebase.firestore().collection('deliveries').doc(deliveryId).get()
          .then(doc => {
            const earnings = doc.exists ? { total: doc.data().earnings } : null;
            _fire('delivery:completed', { deliveryId, earnings });
          })
          .catch(() => _fire('delivery:completed', { deliveryId, earnings: null }));
      }
    };
    statusRef.on('value', statusHandler);

    _deliveryUnsubs[deliveryId] = {
      location: () => locationRef.off('value', locationHandler),
      status: () => statusRef.off('value', statusHandler)
    };
  }

  function leaveDelivery(deliveryId) {
    if (_deliveryUnsubs[deliveryId]) {
      try { _deliveryUnsubs[deliveryId].location(); } catch (_) { }
      try { _deliveryUnsubs[deliveryId].status(); } catch (_) { }
      delete _deliveryUnsubs[deliveryId];
    }
  }

  /* ----------------------------------------------------------------
     Internal: fire event to all registered callbacks
     ---------------------------------------------------------------- */
  function _fire(event, data) {
    const nsMap = _registry[event];
    if (!nsMap) return;
    Object.values(nsMap).forEach(callbacks =>
      callbacks.forEach(cb => { try { cb(data); } catch (e) { console.error('[SocketShim]', e); } })
    );
  }

  /* ----------------------------------------------------------------
     Internal: clean up namespace
     ---------------------------------------------------------------- */
  function _offNamespace(namespace) {
    if (_nsUnsubs[namespace]) {
      _nsUnsubs[namespace].forEach(fn => { try { fn && fn(); } catch (_) { } });
      delete _nsUnsubs[namespace];
    }
    Object.keys(_registry).forEach(event => {
      if (_registry[event] && _registry[event][namespace]) {
        delete _registry[event][namespace];
      }
    });
  }

  function _addUnsub(namespace, fn) {
    if (!_nsUnsubs[namespace]) _nsUnsubs[namespace] = [];
    _nsUnsubs[namespace].push(fn);
  }

  /* ----------------------------------------------------------------
     Internal: set up a Firebase listener for a given event
     ---------------------------------------------------------------- */
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        Object.keys(_registry).forEach(event => {
          Object.keys(_registry[event] || {}).forEach(namespace => {
            _setupFirebaseListener(event, namespace);
          });
        });
      }
    });
  }

  function _setupFirebaseListener(event, namespace) {
    if (DEMO_MODE) return;
    const uid = firebase.auth().currentUser?.uid;
    if (!uid) return;
    // Avoid duplicate listeners for the same namespace+event
    if (_nsUnsubs[namespace] && _nsUnsubs[namespace].length > 0 &&
      _listenerExistsFor(namespace, event)) return;

    let unsub = null;

    switch (event) {

      /* ---- New transport requests ---- */
      case 'transport:new_request': {
        // Track docs seen on initial snapshot to avoid false positives
        let _initialIds = null;
        unsub = firebase.firestore().collection('transportRequests')
          .orderBy('createdAt', 'desc')
          .onSnapshot(snapshot => {
            if (_initialIds === null) {
              // First call: record current IDs as "already known"
              _initialIds = new Set(snapshot.docs.map(d => d.id));
              return;
            }
            snapshot.docChanges().forEach(change => {
              if (change.type === 'added') {
                const id = change.doc.id;
                if (_initialIds.has(id)) return; // skip initial load
                _initialIds.add(id);

                const reqData = change.doc.data();
                if (reqData.status !== 'requested') return;
                // Filter by driver vehicle capacity (if loaded)
                const capacity = window.AppState?.vehicle?.capacity_kg;
                if (capacity !== undefined && capacity !== null && (reqData.weight || 0) > capacity) return;

                _fire('transport:new_request', {
                  request: _normalizeRequestForEvent(id, reqData)
                });
              }
            });
          }, err => console.error('[SocketShim/new_request]', err));
        break;
      }

      /* ---- Request cancelled / accepted by someone else ---- */
      case 'transport:request_cancelled': {
        let _initialCancelIds = null;
        unsub = firebase.firestore().collection('transportRequests')
          .onSnapshot(snapshot => {
            if (_initialCancelIds === null) {
              _initialCancelIds = new Set(snapshot.docs.map(d => d.id));
              return;
            }
            snapshot.docChanges().forEach(change => {
              if (change.type === 'modified') {
                const data = change.doc.data();
                if (data.status !== 'requested') {
                  _fire('transport:request_cancelled', {
                    requestId: change.doc.id,
                    crop: data.crop
                  });
                }
              }
            });
          }, err => console.error('[SocketShim/cancelled]', err));
        break;
      }

      /* ---- delivery:status_changed / location_updated / completed ----
             These are driven by joinDelivery() / RTDB listeners.
             Just register the callback — no Firestore listener needed here. */
      case 'delivery:status_changed':
      case 'delivery:location_updated':
      case 'delivery:completed':
        return; // callbacks registered, RTDB listener set up in joinDelivery()

      /* ---- Driver availability changes ---- */
      case 'driver:availability_changed':
      case 'driver:availability_ack': {
        let _firstDriverSnap = true;
        unsub = firebase.firestore().collection('drivers').doc(uid)
          .onSnapshot(doc => {
            if (_firstDriverSnap) { _firstDriverSnap = false; return; }
            if (!doc.exists) return;
            const d = doc.data();
            const payload = {
              driverId: uid, driverName: d.name,
              status: d.availability, timestamp: new Date().toISOString()
            };
            _fire('driver:availability_changed', payload);
            _fire('driver:availability_ack', { status: d.availability });
          }, err => console.error('[SocketShim/availability]', err));
        break;
      }

      /* ---- New notifications ---- */
      case 'notification:new': {
        const since = Date.now() - 3000; // ignore notifications older than 3s on attach
        let _firstNotifSnap = true;
        unsub = firebase.firestore().collection('notifications')
          .where('userId', '==', uid)
          .where('read', '==', false)
          .orderBy('createdAt', 'desc')
          .onSnapshot(snapshot => {
            if (_firstNotifSnap) { _firstNotifSnap = false; return; }
            snapshot.docChanges().forEach(change => {
              if (change.type === 'added') {
                const d = change.doc.data();
                const ms = d.createdAt?.toMillis?.() || 0;
                if (ms < since) return; // skip old
                _fire('notification:new', { type: d.type, title: d.title, message: d.message });
              }
            });
          }, err => console.error('[SocketShim/notification]', err));
        break;
      }

      default:
        return;
    }

    if (unsub) _addUnsub(namespace, unsub);
    _markListenerFor(namespace, event);
  }

  /* ---- Track which events have a listener per namespace ---- */
  const _listenerMap = {}; // `${namespace}:${event}` -> true
  function _listenerExistsFor(ns, ev) { return !!_listenerMap[`${ns}:${ev}`]; }
  function _markListenerFor(ns, ev) { _listenerMap[`${ns}:${ev}`] = true; }

  /* ----------------------------------------------------------------
     Internal: update connection status indicator
     ---------------------------------------------------------------- */
  function _updateConnStatus(status) {
    const labels = {
      connected: DEMO_MODE ? 'Demo Mode' : 'Firebase Live',
      disconnected: 'Offline',
      demo: 'Demo Mode'
    };
    const cls = (status === 'connected') ? 'connected' : 'disconnected';

    document.querySelectorAll('.conn-status').forEach(el => {
      el.className = `conn-status ${cls}`;
      const lbl = el.querySelector('.conn-label');
      if (lbl) lbl.textContent = labels[status] || status;
    });

    document.dispatchEvent(new CustomEvent('socket:status', { detail: { status } }));
  }

  /* ----------------------------------------------------------------
     Public API (same surface as the old socket.js)
     ---------------------------------------------------------------- */
  return {
    connect, disconnect, emit, on, off,
    joinDelivery, leaveDelivery,
    setAvailability, sendLocation,
    isConnected,
    get raw() { return null; } // no Socket.IO socket object
  };

})();

window.SocketManager = SocketManager;
