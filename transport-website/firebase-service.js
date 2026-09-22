/* ============================================================
   firebase-service.js — Firebase Data Service Layer
   Replaces the Express + Supabase backend.
   All Firebase SDK calls are centralized here.
   Other files call FirebaseAuth.* and FirebaseService.* only.
   ============================================================ */

/* ================================================================
   SECTION 1: UTILITY FUNCTIONS
   ================================================================ */

/** Convert Firestore Timestamp or Date to ISO string */
function _tsToISO(ts) {
  if (!ts) return null;
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === 'string') return ts;
  return new Date(ts).toISOString();
}

/** Haversine distance in km */
function _haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Earnings formula (Base: 50, Distance: 12/km, Load: 8/100kg, Min: 80) */
function _calcEarnings(distanceKm, weightKg) {
  const base = 50;
  const distCharge = Math.round(12 * (distanceKm || 0));
  const loadCharge = Math.round(8 * ((weightKg || 0) / 100) * 100) / 100;
  const total = Math.max(80, Math.round(base + distCharge + loadCharge));
  return { base_fare: base, distance_charge: distCharge, load_charge: loadCharge, total };
}

/* ================================================================
   SECTION 2: DATA NORMALIZATION
   Firestore (camelCase) → UI (snake_case, matching old Supabase shape)
   ================================================================ */

function _normalizeRequest(id, data, driverLat, driverLng) {
  const pickupLat = data.pickupLocation?.latitude;
  const pickupLng = data.pickupLocation?.longitude;
  const destLat = data.dropLocation?.latitude;
  const destLng = data.dropLocation?.longitude;
  const distKm = data.estimatedDistance || 0;
  const weightKg = data.weight || 0;

  let driverDistanceKm = null;
  if (driverLat && driverLng && pickupLat && pickupLng) {
    driverDistanceKm = Math.round(_haversineKm(driverLat, driverLng, pickupLat, pickupLng) * 10) / 10;
  }

  const earnings = _calcEarnings(distKm, weightKg);

  return {
    id,
    crop: data.crop,
    quantity_kg: weightKg,
    pickup_address: data.pickupLocation?.name || '',
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    destination_address: data.dropLocation?.name || '',
    destination_lat: destLat,
    destination_lng: destLng,
    estimated_distance_km: distKm,
    estimated_travel_time_min: data.estimatedTime || Math.max(10, Math.round(distKm * 3)),
    estimated_cost: earnings.total,
    requester_name: data.farmerName || 'Farmer',
    requester_id: data.farmerId,
    notes: data.notes || null,
    created_at: _tsToISO(data.createdAt),
    status: data.status,
    driverDistanceKm
  };
}

function _normalizeDelivery(id, delivData, reqId, reqData, farmerPhone) {
  const req = reqData ? {
    id: reqId,
    crop: reqData.crop,
    quantity_kg: reqData.weight || 0,
    pickup_address: reqData.pickupLocation?.name || '',
    pickup_lat: reqData.pickupLocation?.latitude,
    pickup_lng: reqData.pickupLocation?.longitude,
    destination_address: reqData.dropLocation?.name || '',
    destination_lat: reqData.dropLocation?.latitude,
    destination_lng: reqData.dropLocation?.longitude,
    requester_name: reqData.farmerName || 'Farmer',
    requester_id: reqData.farmerId,
    requester_phone: farmerPhone || null,
    estimated_distance_km: reqData.estimatedDistance || 0
  } : null;

  return {
    id,
    status: delivData.status,
    distance_km: delivData.distance || 0,
    payment: delivData.earnings || 0,
    eta: _tsToISO(delivData.eta),
    created_at: _tsToISO(delivData.startedAt || delivData.updatedAt),
    transport_requests: req
  };
}

function _normalizeDriver(uid, data) {
  return {
    id: uid,
    driver_id: uid,
    user_id: uid,
    name: data.name,
    email: data.email,
    phone: data.phone,
    status: data.availability || 'available',
    rating: data.rating || 5.0,
    total_deliveries: data.totalDeliveries || 0,
    total_earnings: data.totalEarnings || 0,
    current_lat: data.currentLocation?.latitude || null,
    current_lng: data.currentLocation?.longitude || null,
    location_updated_at: _tsToISO(data.updatedAt)
  };
}

function _normalizeVehicle(id, data) {
  return {
    id,
    driver_id: data.driverId,
    type: data.vehicleType || 'Mini Truck',
    number: data.registrationNumber || '',
    capacity_kg: data.capacity || 0,
    status: data.status || 'available'
  };
}

function _normalizeNotification(id, data) {
  return {
    id,
    user_id: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
    is_read: data.read || false,
    created_at: _tsToISO(data.createdAt)
  };
}

/* ================================================================
   SECTION 3: DEMO MODE DATA
   ================================================================ */

const DEMO_DATA = {
  driver: {
    id: 'demo-uid', driver_id: 'demo-uid', user_id: 'demo-uid',
    name: 'Demo Driver', email: 'demo@example.com', phone: '9876543210',
    status: 'available', rating: 4.8, total_deliveries: 12, total_earnings: 4200,
    current_lat: 10.0, current_lng: 78.5, location_updated_at: new Date().toISOString()
  },
  vehicle: {
    id: 'v1', driver_id: 'demo-uid', type: 'Mini Truck',
    number: 'TN01AB1234', capacity_kg: 1000, status: 'available'
  },
  requests: [
    {
      id: 'req-demo-1', crop: 'Tomato', quantity_kg: 800,
      pickup_address: 'Madurai Periyar Bus Stand', pickup_lat: 9.919, pickup_lng: 78.119,
      destination_address: 'Mattuthavani Bus Terminal', destination_lat: 9.900, destination_lng: 78.090,
      estimated_distance_km: 8.5, estimated_travel_time_min: 26, estimated_cost: 320,
      requester_name: 'Demo Farmer', requester_id: 'farmer-demo',
      notes: null, created_at: new Date(Date.now() - 300000).toISOString(), status: 'requested',
      driverDistanceKm: 3.2
    },
    {
      id: 'req-demo-2', crop: 'Onion', quantity_kg: 500,
      pickup_address: 'Dindigul Market Yard', pickup_lat: 10.360, pickup_lng: 77.974,
      destination_address: 'Coimbatore Produce Hub', destination_lat: 11.017, destination_lng: 76.955,
      estimated_distance_km: 80, estimated_travel_time_min: 90, estimated_cost: 1110,
      requester_name: 'Rajan Farms', requester_id: 'farmer-2',
      notes: 'Handle with care', created_at: new Date(Date.now() - 600000).toISOString(), status: 'requested',
      driverDistanceKm: 12.5
    }
  ],
  delivery: null,
  earnings: {
    today: { total: 480, count: 2 },
    thisWeek: { total: 1820, count: 7 },
    thisMonth: { total: 4200, count: 16 },
    allTime: { total: 12600, count: 48 },
    recent: [
      { date: new Date(Date.now() - 86400000).toISOString(), base_fare: 50, distance_charge: 156, load_charge: 32, total: 238 },
      { date: new Date(Date.now() - 172800000).toISOString(), base_fare: 50, distance_charge: 120, load_charge: 24, total: 194 }
    ]
  },
  history: [
    {
      id: 'del-demo-1', status: 'delivered', distance_km: 13, payment: 238,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      transport_requests: {
        crop: 'Tomato', quantity_kg: 400,
        pickup_address: 'Madurai', destination_address: 'Mattuthavani',
        estimated_distance_km: 13
      }
    }
  ],
  notifications: []
};

function _demoError(msg) {
  const err = new Error(msg || 'Firebase not configured. See FIREBASE_SETUP.md.');
  err.isDemo = true;
  return err;
}

/* ================================================================
   SECTION 4: FIREBASE AUTH
   ================================================================ */

const FirebaseAuth = {

  /** Sign in a Buyer and load the canonical buyers/{uid} profile. */
  async loginBuyer(email, password) {
    if (DEMO_MODE) throw _demoError('Firebase not configured. Running in Demo Mode.');

    const credential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const uid = credential.user.uid;
    const buyerDoc = await firebase.firestore().collection('buyers').doc(uid).get();

    if (!buyerDoc.exists || buyerDoc.data().role !== 'buyer') {
      await firebase.auth().signOut();
      throw new Error('This account is not registered as a buyer. Please use the correct portal.');
    }

    const profile = buyerDoc.data();
    return {
      uid,
      user: { id: uid, uid, name: profile.name, email: profile.email || credential.user.email, role: 'buyer', phone: profile.phone || '' },
      buyer: { id: uid, ...profile }
    };
  },

  /** Sign in with email + password. Fetches user profile from Firestore. */
  async login(email, password) {
    if (DEMO_MODE) throw _demoError('Firebase not configured. Running in Demo Mode.');

    const credential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const uid = credential.user.uid;

    const userDoc = await firebase.firestore().collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error('User profile not found. Please contact support.');

    const profile = userDoc.data();
    return {
      uid,
      user: { id: uid, uid, name: profile.name, email: profile.email, role: profile.role, phone: profile.phone || '' }
    };
  },

  /** Create a new driver account. Creates Firestore user + driver docs. */
  async register({ name, email, phone, password }) {
    if (DEMO_MODE) throw _demoError('Firebase not configured. Running in Demo Mode.');

    const credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const uid = credential.user.uid;
    const db = firebase.firestore();
    const now = firebase.firestore.FieldValue.serverTimestamp();

    // Create user profile
    await db.collection('users').doc(uid).set({ name, email, phone, role: 'driver', createdAt: now });

    // Create driver profile
    await db.collection('drivers').doc(uid).set({
      name, phone, email,
      availability: 'available',
      rating: 5.0, totalDeliveries: 0, totalEarnings: 0,
      currentLocation: null, createdAt: now, updatedAt: now
    });

    return {
      uid,
      user: { id: uid, uid, name, email, role: 'driver', phone }
    };
  },

  /** Create or update the vehicle for the current driver. */
  async registerBuyer({ name, businessName, email, phone, password, address, city, district, state, pincode, buyerType }) {
    if (DEMO_MODE) throw _demoError('Firebase not configured. Running in Demo Mode.');

    const credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const uid = credential.user.uid;
    const db = firebase.firestore();
    const now = firebase.firestore.FieldValue.serverTimestamp();

    try {
      // Keep the shared role profile and canonical Buyer profile on the same UID.
      await db.collection('users').doc(uid).set({ uid, name, email, phone, role: 'buyer', createdAt: now });
      await db.collection('buyers').doc(uid).set({
        uid, role: 'buyer', name, businessName: businessName || '', email, phone,
        address: address || '', city: city || '', district: district || '',
        state: state || '', pincode: pincode || '', buyerType: buyerType || 'Retailer',
        latitude: null, longitude: null, createdAt: now, updatedAt: now
      });
    } catch (error) {
      await firebase.auth().signOut().catch(() => { });
      throw error;
    }

    return {
      uid,
      user: { id: uid, uid, name, email, role: 'buyer', phone }
    };
  },

  /** Create or update the vehicle for the current driver. */
  async createVehicle(uid, { vehicleType, registrationNumber, capacity }) {
    if (DEMO_MODE) throw _demoError('Firebase not configured.');
    const db = firebase.firestore();
    const now = firebase.firestore.FieldValue.serverTimestamp();

    // Check if vehicle already exists for this driver
    const existing = await db.collection('vehicles').where('driverId', '==', uid).limit(1).get();
    if (!existing.empty) {
      await existing.docs[0].ref.update({ vehicleType, registrationNumber, capacity, updatedAt: now });
    } else {
      await db.collection('vehicles').add({ driverId: uid, vehicleType, registrationNumber, capacity, createdAt: now, updatedAt: now });
    }
  },

  /** Sign out. */
  async logout() {
    if (!DEMO_MODE) await firebase.auth().signOut();
  },

  /** Returns cached user from localStorage (synchronous). */
  getUser() {
    return JSON.parse(localStorage.getItem('transport_user') || 'null');
  },

  /** Returns true if a user is stored in localStorage. */
  isLoggedIn() {
    return !!localStorage.getItem('transport_token') && !!this.getUser();
  }
};

/** Helper to wait for Firebase Auth initialization if currentUser is initially null */
async function _getUid() {
  if (DEMO_MODE) return 'demo-uid';
  let user = firebase.auth().currentUser;
  if (!user) {
    user = await new Promise(resolve => {
      let resolved = false;
      const unsubscribe = firebase.auth().onAuthStateChanged(u => {
        if (!resolved) {
          resolved = true;
          try { unsubscribe(); } catch (_) { }
          resolve(u);
        }
      });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { unsubscribe(); } catch (_) { }
          resolve(firebase.auth().currentUser);
        }
      }, 1500);
    });
  }
  const uid = user?.uid || (typeof Auth !== 'undefined' && Auth.getToken ? Auth.getToken() : null) || localStorage.getItem('transport_token');
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

/* ================================================================
   SECTION 5: FIREBASE SERVICE — Application Data
   ================================================================ */

const FirebaseService = {

  /* ---- BUYERS ---- */
  buyers: {
    async me() {
      if (DEMO_MODE) return { buyer: { id: 'demo-uid', name: 'Demo Buyer', businessName: 'Fresh Mart' } };
      const uid = await _getUid();
      const doc = await firebase.firestore().collection('buyers').doc(uid).get();
      if (!doc.exists) throw new Error('Buyer profile not found');
      return { buyer: { id: uid, ...doc.data() } };
    },
    async update(data) {
      if (DEMO_MODE) return { buyer: { ...data } };
      const uid = await _getUid();
      await firebase.firestore().collection('buyers').doc(uid).update({
        ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return this.me();
    }
  },

  /* ---- CROPS ---- */
  crops: {
    async search({ query = '', maxDistance = 50, lat, lng } = {}) {
      // In demo mode or if no real data, we can mock it here if we want, but better to query Firestore.
      if (DEMO_MODE) return { crops: [] };
      const snap = await firebase.firestore().collection('crops').get();
      let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (query) {
        const q = query.toLowerCase();
        results = results.filter(c => c.cropName.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q));
      }
      if (lat && lng) {
        results.forEach(c => {
          if (c.location?.latitude && c.location?.longitude) {
            c.distanceKm = _haversineKm(lat, lng, c.location.latitude, c.location.longitude);
          } else {
            c.distanceKm = 999;
          }
        });
        results = results.filter(c => c.distanceKm <= maxDistance);
        results.sort((a, b) => a.distanceKm - b.distanceKm);
      }
      return { crops: results };
    },
    async get(id) {
      if (DEMO_MODE) return { crop: null };
      const doc = await firebase.firestore().collection('crops').doc(id).get();
      return { crop: doc.exists ? { id: doc.id, ...doc.data() } : null };
    }
  },

  /* ---- ORDERS ---- */
  orders: {
    async create(orderData) {
      if (DEMO_MODE) return { orderId: 'demo-order-1' };
      const uid = await _getUid();

      const db = firebase.firestore();
      const now = firebase.firestore.FieldValue.serverTimestamp();

      const newOrder = {
        ...orderData,
        buyerId: uid,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now
      };

      const ref = await db.collection('orders').add(newOrder);

      // Notification is helpful but must not turn a successful order into a UI error.
      if (orderData.farmerId) {
        await db.collection('notifications').add({
          userId: orderData.farmerId,
          type: 'new_order',
          title: '📦 New Order Received',
          message: `You received an order for ${orderData.quantity}kg of ${orderData.cropName}.`,
          orderId: ref.id,
          read: false,
          createdAt: now
        }).catch(error => console.warn('Farmer notification skipped:', error.code || error.message));
      }

      return { orderId: ref.id };
    },

    async listBuyerOrders() {
      if (DEMO_MODE) return { orders: [] };
      const uid = await _getUid();
      const snap = await firebase.firestore().collection('orders')
        .where('buyerId', '==', uid)
        .orderBy('createdAt', 'desc')
        .get();
      return { orders: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
    },

    async get(id) {
      if (DEMO_MODE) return { order: null };
      const doc = await firebase.firestore().collection('orders').doc(id).get();
      return { order: doc.exists ? { id: doc.id, ...doc.data() } : null };
    },

    // Simulates Farmer accepting an order (and automatically creating transport request)
    async simulateFarmerAccept(orderId) {
      if (DEMO_MODE) return { success: true };
      const db = firebase.firestore();
      const now = firebase.firestore.FieldValue.serverTimestamp();

      const orderDoc = await db.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) throw new Error('Order not found');
      const orderData = orderDoc.data();

      // Update order status
      await orderDoc.ref.update({ status: 'FARMER_CONFIRMED', updatedAt: now });

      // Automatically create Transport Request
      const transportReq = {
        orderId,
        buyerId: orderData.buyerId,
        farmerId: orderData.farmerId,
        farmerName: orderData.farmerName || 'Farmer',
        crop: orderData.cropName,
        weight: orderData.quantity,
        pickupLocation: orderData.pickupLocation,
        dropLocation: orderData.deliveryLocation,
        estimatedDistance: orderData.distanceKm || 10,
        estimatedTime: Math.round((orderData.distanceKm || 10) * 3),
        status: 'requested',
        createdAt: now,
        updatedAt: now
      };

      const tReqRef = await db.collection('transportRequests').add(transportReq);

      // Update order with transport request ID
      await orderDoc.ref.update({ transportRequestId: tReqRef.id, status: 'TRANSPORT_REQUESTED' });

      // Notify buyer
      await db.collection('notifications').add({
        userId: orderData.buyerId,
        type: 'order_confirmed',
        title: '✅ Order Confirmed',
        message: `Farmer accepted your order for ${orderData.cropName}. Transport requested.`,
        orderId: orderId,
        read: false,
        createdAt: now
      });

      return { success: true, transportRequestId: tReqRef.id };
    }
  },

  /* ---- DRIVERS ---- */
  drivers: {

    /** Get current driver profile + vehicle info. */
    async me() {
      if (DEMO_MODE) return { driver: DEMO_DATA.driver };
      const uid = await _getUid();
      const db = firebase.firestore();

      let driverDoc = await db.collection('drivers').doc(uid).get();
      if (!driverDoc.exists) {
        // Auto-create driver profile from Auth + users collection
        const authUser = firebase.auth().currentUser;
        let name = authUser?.displayName || 'Driver';
        let email = authUser?.email || '';
        let phone = '';

        const userDoc = await db.collection('users').doc(uid).get().catch(() => null);
        if (userDoc && userDoc.exists) {
          const ud = userDoc.data();
          name = ud.name || name;
          email = ud.email || email;
          phone = ud.phone || phone;
        }

        const now = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('drivers').doc(uid).set({
          name, email, phone,
          availability: 'available',
          rating: 5.0, totalDeliveries: 0, totalEarnings: 0,
          currentLocation: null, createdAt: now, updatedAt: now
        }).catch(() => {});

        driverDoc = await db.collection('drivers').doc(uid).get();
        if (!driverDoc.exists) {
          // Fallback: return in-memory driver from localStorage
          const cached = Auth.getUser?.() || {};
          return { driver: _normalizeDriver(uid, { name: cached.name || name, email: cached.email || email, phone: cached.phone || phone }) };
        }
      }

      return { driver: _normalizeDriver(uid, driverDoc.data()) };
    },

    /** Update driver availability (available | busy | offline). */
    async setAvailability(status) {
      if (DEMO_MODE) {
        Toast.show('Demo Mode: availability not saved', 'warning');
        return;
      }
      const uid = await _getUid();
      await firebase.firestore().collection('drivers').doc(uid).update({
        availability: status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    },

    /** Update driver GPS location. Writes to Realtime Database. */
    async updateLocation(lat, lng, deliveryId) {
      if (DEMO_MODE) return;
      const uid = await _getUid().catch(() => null);
      if (!uid) return;

      // Update driver doc current location
      firebase.firestore().collection('drivers').doc(uid).update({
        currentLocation: { latitude: lat, longitude: lng },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => { });

      // Write to Realtime Database for live tracking
      if (deliveryId) {
        firebase.database().ref(`locations/${deliveryId}`).set({
          driverId: uid, latitude: lat, longitude: lng, timestamp: Date.now()
        }).catch(() => { });
      }
    },

    /** Get earnings summary for the current driver. */
    async earnings() {
      if (DEMO_MODE) return DEMO_DATA.earnings;
      const uid = await _getUid();

      const snapshot = await firebase.firestore().collection('deliveries')
        .where('driverId', '==', uid)
        .where('status', '==', 'delivered')
        .get();

      const deliveries = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.status === 'delivered')
        .sort((a, b) => {
          const aTime = a.completedAt?.toDate?.()?.getTime?.() || new Date(a.completedAt || 0).getTime();
          const bTime = b.completedAt?.toDate?.()?.getTime?.() || new Date(b.completedAt || 0).getTime();
          return bTime - aTime;
        });

      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
      const monthStart = new Date(now); monthStart.setDate(now.getDate() - 30);

      function sumPeriod(pred) {
        const f = deliveries.filter(d => {
          const ts = d.completedAt?.toDate?.() || new Date(d.completedAt || 0);
          return pred(ts);
        });
        return { total: f.reduce((s, d) => s + (d.earnings || 0), 0), count: f.length };
      }

      const recent = deliveries.slice(0, 20).map(d => {
        const eb = d.earningsBreakdown || _calcEarnings(d.distance || 0, d.weight || 0);
        return {
          date: _tsToISO(d.completedAt),
          base_fare: eb.base_fare,
          distance_charge: eb.distance_charge,
          load_charge: eb.load_charge,
          total: d.earnings || eb.total
        };
      });

      return {
        today: sumPeriod(d => d >= todayStart),
        thisWeek: sumPeriod(d => d >= weekStart),
        thisMonth: sumPeriod(d => d >= monthStart),
        allTime: sumPeriod(() => true),
        recent
      };
    }
  },

  /* ---- VEHICLES ---- */
  vehicles: {

    /** Get the vehicle for the current driver. */
    async me() {
      if (DEMO_MODE) return { vehicle: DEMO_DATA.vehicle };
      const uid = await _getUid();

      const snap = await firebase.firestore().collection('vehicles')
        .where('driverId', '==', uid).limit(1).get();

      if (snap.empty) {
        // Auto-create placeholder vehicle
        return { vehicle: { id: null, driver_id: uid, type: 'Mini Truck', number: '', capacity_kg: 0, status: 'available' } };
      }

      const doc = snap.docs[0];
      return { vehicle: _normalizeVehicle(doc.id, doc.data()) };
    },

    /** Create or update the current driver's vehicle. */
    async update({ type, number, capacity_kg, status }) {
      if (DEMO_MODE) {
        Toast.show('Demo Mode: vehicle not saved', 'warning');
        return { vehicle: DEMO_DATA.vehicle };
      }
      const uid = await _getUid();

      const db = firebase.firestore();
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const data = {
        driverId: uid,
        vehicleType: type || 'Mini Truck',
        registrationNumber: (number || '').toUpperCase(),
        capacity: parseInt(capacity_kg) || 0,
        status: status || 'available',
        updatedAt: now
      };

      const existing = await db.collection('vehicles').where('driverId', '==', uid).limit(1).get();
      let vehicleId;
      if (!existing.empty) {
        vehicleId = existing.docs[0].id;
        await existing.docs[0].ref.update(data);
      } else {
        data.createdAt = now;
        const ref = await db.collection('vehicles').add(data);
        vehicleId = ref.id;
      }

      return { vehicle: _normalizeVehicle(vehicleId, { ...data, driverId: uid }) };
    }
  },

  /* ---- TRANSPORT REQUESTS ---- */
  requests: {

    /** List transport requests.
     *  Drivers: see open "requested" requests eligible for their vehicle capacity.
     *  Returns the same shape as the old Express API. */
    async list() {
      if (DEMO_MODE) return { requests: DEMO_DATA.requests };
      const uid = await _getUid();
      const db = firebase.firestore();
      const now = firebase.firestore.FieldValue.serverTimestamp();

      // Get driver profile — auto-create if missing using best available data
      let driverDoc = await db.collection('drivers').doc(uid).get();
      if (!driverDoc.exists) {
        // Gather name/email/phone from any available source
        const authUser = firebase.auth().currentUser;
        let name = authUser?.displayName || 'Driver';
        let email = authUser?.email || '';
        let phone = '';

        // Try users collection first (most complete)
        const userDoc = await db.collection('users').doc(uid).get().catch(() => null);
        if (userDoc && userDoc.exists) {
          const ud = userDoc.data();
          name = ud.name || name;
          email = ud.email || email;
          phone = ud.phone || phone;
        }

        // Auto-create the missing driver profile
        console.info('[Requests] Auto-creating driver profile for uid:', uid);
        await db.collection('drivers').doc(uid).set({
          name, email, phone,
          availability: 'available',
          rating: 5.0, totalDeliveries: 0, totalEarnings: 0,
          currentLocation: null, createdAt: now, updatedAt: now
        }).catch(err => console.warn('[Requests] Driver auto-create failed:', err.message));

        driverDoc = await db.collection('drivers').doc(uid).get();
        if (!driverDoc.exists) {
          // Rules blocked creation — proceed with in-memory placeholder
          console.warn('[Requests] Could not create driver doc, using placeholder');
          driverDoc = { exists: true, data: () => ({ name, email, phone, currentLocation: null }) };
        }
      }
      const driver = driverDoc.data();

      // Get vehicle capacity
      const vehicleSnap = await db.collection('vehicles')
        .where('driverId', '==', uid).limit(1).get();
      if (vehicleSnap.empty) return { requests: [], reason: 'no_vehicle' };
      const vehicleData = vehicleSnap.docs[0].data();
      const capacity = vehicleData.capacity || 0;
      if (capacity === 0) return { requests: [], reason: 'zero_capacity' };

      // Fetch all "requested" transport requests
      const snap = await firebase.firestore().collection('transportRequests')
        .where('status', '==', 'requested')
        .orderBy('createdAt', 'desc')
        .get();

      const driverLat = driver.currentLocation?.latitude;
      const driverLng = driver.currentLocation?.longitude;

      const eligible = snap.docs
        .filter(d => (d.data().weight || 0) <= capacity)
        .map(d => _normalizeRequest(d.id, d.data(), driverLat, driverLng))
        .sort((a, b) => (a.driverDistanceKm || 999) - (b.driverDistanceKm || 999));

      return { requests: eligible, reason: null };
    },

    /** Accept a request — Firestore transaction (race-condition safe). */
    async accept(requestId) {
      if (DEMO_MODE) {
        Toast.show('Demo Mode: request not accepted', 'warning');
        return { delivery: { id: 'demo-del-1', status: 'driver_assigned' } };
      }
      const uid = await _getUid();

      const db = firebase.firestore();
      const rtdb = firebase.database();

      // Read driver + vehicle BEFORE transaction
      const driverDoc = await db.collection('drivers').doc(uid).get();
      if (!driverDoc.exists) throw new Error('Driver profile not found');
      const driverData = driverDoc.data();

      const vehicleSnap = await db.collection('vehicles').where('driverId', '==', uid).limit(1).get();
      if (vehicleSnap.empty) throw new Error('No vehicle found. Please add a vehicle first.');
      const vehicleData = vehicleSnap.docs[0].data();

      let deliveryId;

      // ATOMIC TRANSACTION — prevents double-accept
      await db.runTransaction(async (txn) => {
        const requestRef = db.collection('transportRequests').doc(requestId);
        const requestDoc = await txn.get(requestRef);

        if (!requestDoc.exists) throw new Error('Request not found.');
        const reqData = requestDoc.data();

        let orderRef = null;
        let orderDoc = null;
        if (reqData.orderId) {
          orderRef = db.collection('orders').doc(reqData.orderId);
          orderDoc = await txn.get(orderRef);
        }

        if (reqData.status !== 'requested') {
          throw new Error('This request has already been accepted by another driver. Please check other requests.');
        }
        if ((reqData.weight || 0) > (vehicleData.capacity || 0)) {
          throw new Error(`Your vehicle capacity (${vehicleData.capacity} kg) is too low for this request (${reqData.weight} kg).`);
        }

        const distKm = reqData.estimatedDistance || 10;
        const weightKg = reqData.weight || 0;
        const earnings = _calcEarnings(distKm, weightKg);
        const now = firebase.firestore.FieldValue.serverTimestamp();

        // 1. Update request → accepted
        txn.update(requestRef, {
          status: 'driver_assigned',
          driverId: uid,
          driverName: driverData.name,
          updatedAt: now
        });

        // 2. Create delivery document
        const deliveryRef = db.collection('deliveries').doc();
        deliveryId = deliveryRef.id;
        txn.set(deliveryRef, {
          requestId,
          orderId: reqData.orderId || null,
          buyerId: reqData.buyerId || null,
          farmerId: reqData.farmerId,
          driverId: uid,
          driverName: driverData.name,
          status: 'driver_assigned',
          distance: distKm,
          weight: weightKg,
          earnings: earnings.total,
          earningsBreakdown: earnings,
          startedAt: now,
          updatedAt: now
        });

        // 3. Update order document status & driver info
        if (orderRef && orderDoc?.exists) {
          txn.update(orderRef, {
            status: 'DRIVER_ASSIGNED',
            driverId: uid,
            driverName: driverData.name,
            driverPhone: driverData.phone || '',
            vehicleType: vehicleData.vehicleType || '',
            registrationNumber: vehicleData.registrationNumber || '',
            updatedAt: now
          });
        }

        // 5. Notify farmer
        txn.set(db.collection('notifications').doc(), {
          userId: reqData.farmerId,
          type: 'request_accepted',
          title: '🚚 Driver Accepted Your Request',
          message: `${driverData.name} (${vehicleData.vehicleType || 'Vehicle'}) accepted your ${reqData.crop || 'produce'} transport request.`,
          requestId,
          deliveryId,
          read: false,
          createdAt: now
        });
      });

      // Write initial delivery status to RTDB
      await rtdb.ref(`deliveryStatus/${deliveryId}`).set({
        status: 'driver_assigned', timestamp: Date.now()
      });

      return {
        message: 'Request accepted successfully',
        delivery: { id: deliveryId, status: 'driver_assigned' }
      };
    },

    /** Reject a request (local only — no status change; let other drivers accept it). */
    async reject(requestId) {
      if (DEMO_MODE) return { message: 'Request rejected' };
      // Just return success — no DB change needed; other drivers can still accept
      return { message: 'Request rejected' };
    },

    /** Get a single transport request by ID. */
    async get(requestId) {
      if (DEMO_MODE) return { request: DEMO_DATA.requests.find(r => r.id === requestId) || null };
      const doc = await firebase.firestore().collection('transportRequests').doc(requestId).get();
      if (!doc.exists) throw new Error('Request not found');
      const uid = await _getUid();
      const driverDoc = await firebase.firestore().collection('drivers').doc(uid).get();
      const driver = driverDoc.exists ? driverDoc.data() : {};
      return { request: _normalizeRequest(doc.id, doc.data(), driver.currentLocation?.latitude, driver.currentLocation?.longitude) };
    }
  },

  /* ---- DELIVERIES ---- */
  deliveries: {

    /** Get the driver's current active delivery (not delivered/cancelled). */
    async active() {
      if (DEMO_MODE) {
        if (!DEMO_DATA.delivery) return { delivery: null };
        return { delivery: DEMO_DATA.delivery };
      }
      const uid = await _getUid();

      // Fetch recent deliveries without orderBy to avoid composite index requirement
      // Sort in JS so we don't need a Firestore composite index
      const snap = await firebase.firestore().collection('deliveries')
        .where('driverId', '==', uid)
        .limit(20)
        .get();

      const activeDoc = snap.docs
        .map(doc => ({ doc, data: doc.data() }))
        .filter(({ data }) => data.status !== 'delivered' && data.status !== 'cancelled')
        .sort((a, b) => (b.data.startedAt?.toMillis?.() || 0) - (a.data.startedAt?.toMillis?.() || 0))[0];

      if (!activeDoc) return { delivery: null };

      const delivDoc = activeDoc.doc;
      const delivData = activeDoc.data;

      // Fetch the related transport request
      const reqDoc = await firebase.firestore().collection('transportRequests').doc(delivData.requestId).get();
      const reqData = reqDoc.exists ? reqDoc.data() : null;

      // Fetch farmer's phone from users collection
      let farmerPhone = null;
      if (delivData.farmerId) {
        const farmerDoc = await firebase.firestore().collection('users').doc(delivData.farmerId).get().catch(() => null);
        if (farmerDoc && farmerDoc.exists) farmerPhone = farmerDoc.data().phone || null;
      }

      return { delivery: _normalizeDelivery(delivDoc.id, delivData, delivData.requestId, reqData, farmerPhone) };
    },

    /** Update delivery status — validates transitions, saves to Firestore + RTDB. */
    async updateStatus(deliveryId, newStatus) {
      if (DEMO_MODE) {
        Toast.show('Demo Mode: status not updated', 'warning');
        return { status: newStatus };
      }
      const uid = await _getUid();

      const VALID = {
        driver_assigned: ['reached_pickup', 'cancelled'],
        reached_pickup: ['picked_up', 'cancelled'],
        picked_up: ['in_transit'],
        in_transit: ['reached_destination'],
        reached_destination: ['delivered'],
        delivered: [], cancelled: []
      };

      const STATUS_MSG = {
        reached_pickup: { title: '📍 Driver at Pickup', message: 'Driver has arrived at your pickup location.' },
        picked_up: { title: '📦 Goods Picked Up', message: 'Your produce has been loaded successfully.' },
        in_transit: { title: '🚛 In Transit', message: 'Your order is on the way to destination.' },
        reached_destination: { title: '📍 Approaching Destination', message: 'Driver is at the destination.' },
        delivered: { title: '✅ Delivered!', message: 'Your produce has been delivered successfully.' }
      };

      const db = firebase.firestore();
      const rtdb = firebase.database();

      const delivDoc = await db.collection('deliveries').doc(deliveryId).get();
      if (!delivDoc.exists) throw new Error('Delivery not found');

      const delivery = delivDoc.data();
      if (delivery.driverId !== uid) throw new Error('You are not assigned to this delivery');

      const allowed = VALID[delivery.status] || [];
      if (!allowed.includes(newStatus)) {
        throw new Error(`Cannot change status from "${delivery.status}" to "${newStatus}".`);
      }

      const now = firebase.firestore.FieldValue.serverTimestamp();
      const updates = { status: newStatus, updatedAt: now };
      if (newStatus === 'delivered') updates.completedAt = now;

      await delivDoc.ref.update(updates);

      // Sync request status
      if (delivery.requestId) {
        await db.collection('transportRequests').doc(delivery.requestId).update({ status: newStatus, updatedAt: now })
          .catch(err => console.warn('Request status sync warning:', err.message));
      }

      // Sync order status (if orderId exists)
      if (delivery.orderId) {
        const ORDER_STATUS_MAP = {
          reached_pickup: 'DRIVER_ASSIGNED',
          picked_up: 'PICKED_UP',
          in_transit: 'IN_TRANSIT',
          reached_destination: 'IN_TRANSIT',
          delivered: 'DELIVERED'
        };
        const mappedOrderStatus = ORDER_STATUS_MAP[newStatus];
        if (mappedOrderStatus) {
          await db.collection('orders').doc(delivery.orderId).update({
            status: mappedOrderStatus,
            updatedAt: now
          }).catch(err => console.warn('Order status sync warning:', err.message));
        }
      }

      // Update RTDB for real-time status sync
      await rtdb.ref(`deliveryStatus/${deliveryId}`).set({ status: newStatus, timestamp: Date.now() });

      // If delivered: recalculate final earnings and update driver totals
      if (newStatus === 'delivered') {
        const earnings = _calcEarnings(delivery.distance || 10, delivery.weight || 0);
        await delivDoc.ref.update({ earnings: earnings.total, earningsBreakdown: earnings });
        await db.collection('drivers').doc(uid).update({
          totalDeliveries: firebase.firestore.FieldValue.increment(1),
          totalEarnings: firebase.firestore.FieldValue.increment(earnings.total),
          updatedAt: now
        });
      }

      // Notify farmer
      const msg = STATUS_MSG[newStatus];
      if (msg && delivery.farmerId) {
        await db.collection('notifications').add({
          userId: delivery.farmerId, type: 'delivery_status',
          title: msg.title, message: msg.message,
          requestId: delivery.requestId, deliveryId,
          read: false, createdAt: now
        });
      }

      return { message: `Status updated to "${newStatus}"`, status: newStatus };
    },

    /** Get completed delivery history for the current driver. */
    async history(params = {}) {
      if (DEMO_MODE) return { deliveries: DEMO_DATA.history };
      const uid = await _getUid();

      const snap = await firebase.firestore().collection('deliveries')
        .where('driverId', '==', uid)
        .limit(50)
        .get();

      const deliveries = await Promise.all(snap.docs
        .filter((d) => {
          const status = d.data().status;
          return status === 'delivered' || status === 'cancelled';
        })
        .sort((a, b) => (b.data().startedAt?.toMillis?.() || 0) - (a.data().startedAt?.toMillis?.() || 0))
        .map(async (d) => {
          const data = d.data();
          const reqDoc = await firebase.firestore().collection('transportRequests').doc(data.requestId).get();
          const reqData = reqDoc.exists ? reqDoc.data() : null;
          return _normalizeDelivery(d.id, data, data.requestId, reqData, null);
        }));

      return { deliveries };
    },

    /** Get a single delivery by ID. */
    async get(deliveryId) {
      if (DEMO_MODE) return { delivery: DEMO_DATA.delivery };
      const uid = await _getUid();
      const doc = await firebase.firestore().collection('deliveries').doc(deliveryId).get();
      if (!doc.exists) throw new Error('Delivery not found');
      const data = doc.data();
      const reqDoc = await firebase.firestore().collection('transportRequests').doc(data.requestId).get();
      return { delivery: _normalizeDelivery(doc.id, data, data.requestId, reqDoc.exists ? reqDoc.data() : null, null) };
    }
  },

  /* ---- NOTIFICATIONS ---- */
  notifications: {

    /** List notifications for the current user. */
    async list(params = {}) {
      if (DEMO_MODE) return { notifications: [], unreadCount: 0 };
      const uid = await _getUid();

      const limit = parseInt(params.limit) || 50;
      const snap = await firebase.firestore().collection('notifications')
        .where('userId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const notifications = snap.docs.map(d => _normalizeNotification(d.id, d.data()));
      const unreadCount = notifications.filter(n => !n.is_read).length;

      return { notifications, unreadCount };
    },

    /** Mark a single notification as read. */
    async markRead(id) {
      if (DEMO_MODE) return;
      await firebase.firestore().collection('notifications').doc(id).update({ read: true });
    },

    /** Mark all notifications read for the current user (batch update). */
    async markAllRead() {
      if (DEMO_MODE) return;
      const uid = await _getUid().catch(() => null);
      if (!uid) return;
      const snap = await firebase.firestore().collection('notifications')
        .where('userId', '==', uid).where('read', '==', false).get();
      if (snap.empty) return;
      const batch = firebase.firestore().batch();
      snap.docs.forEach(d => batch.update(d.ref, { read: true }));
      await batch.commit();
    }
  }
};

/** Helper used by socket shim to normalize request for event payload. */
function _normalizeRequestForEvent(id, data) {
  return _normalizeRequest(
    id, data,
    window.AppState?.driver?.current_lat,
    window.AppState?.driver?.current_lng
  );
}

window.FirebaseAuth = FirebaseAuth;
window.FirebaseService = FirebaseService;
window._calcEarnings = _calcEarnings;
window._normalizeRequestForEvent = _normalizeRequestForEvent;
