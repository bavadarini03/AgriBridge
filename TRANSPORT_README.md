# 🚚 AgriBridge Transport Module

Real-time Transport & Logistics module integrated into the AgriBridge AI agricultural marketplace.

---

## Architecture

```
Frontend (existing static SPA)          Backend (new)
┌───────────────────────────────┐       ┌──────────────────────────────────┐
│  index.html                   │       │  Node.js + Express               │
│  app.js        (1 line patch) │◄─────►│  Socket.IO (real-time)           │
│  styles.css    (unchanged)    │       │  JWT Authentication              │
│  data.js       (unchanged)    │       │  Supabase PostgreSQL             │
│  ai-engine.js  (unchanged)    │       └──────────────────────────────────┘
│  i18n.js       (unchanged)    │               │
│                               │       ┌───────▼──────────┐
│  transport/                   │       │  Supabase         │
│    transport-module.js (new)  │       │  (PostgreSQL DB)  │
│    transport-farmer.js (new)  │       │  (Realtime)       │
│    transport.css       (new)  │       └──────────────────┘
└───────────────────────────────┘
```

---

## Features

- 🔐 **Real Backend Auth** — JWT + bcrypt, no passwords in frontend
- 🟢 **Real-time Availability** — Socket.IO broadcasts driver status changes instantly
- 📍 **Live GPS Tracking** — Browser Geolocation → Backend → Map (Leaflet + OpenStreetMap)
- 🔔 **Real-time Notifications** — Socket.IO events for all parties
- ⚡ **Race Condition Protection** — Atomic DB update prevents double-accept
- 🗺️ **Real Route & ETA** — OSRM routing API (free, no key required)
- 💰 **Real Earnings** — Calculated from actual delivery data, stored in DB
- 📜 **Delivery History** — Full audit trail in PostgreSQL
- 🚛 **Driver Matching** — Capacity, distance, rating-based scoring

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier)
- A static file server (VS Code Live Server, `npx serve`, etc.)

---

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → Create a new project
2. Wait for the database to provision (~2 minutes)
3. Go to **Settings → Database** and copy the connection string
4. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Run Database Schema

1. In Supabase, go to **SQL Editor**
2. Open `backend/db/schema.sql`
3. Paste the entire content and click **Run**
4. This creates all tables, indexes, views, and seed data

### 3. Configure Backend

```bash
cd backend

# Copy the template
copy .env.example .env

# Edit .env with your values:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# JWT_SECRET=generate-with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# PORT=3001
# CORS_ORIGIN=http://localhost:5500
```

### 4. Install & Start Backend

```bash
cd backend
npm install
npm run dev    # development (with auto-restart)
# OR
npm start      # production
```

You should see:
```
🚚 AgriBridge Transport Backend
   Server: http://localhost:3001
   Socket.IO ready for real-time connections
```

### 5. Integrate into Existing App

**Step A — Modify `index.html`:**

Add to `<head>` (after `styles.css` link):
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<link rel="stylesheet" href="transport/transport.css">
```

Add before `</body>`:
```html
<script src="transport/transport-module.js"></script>
<script src="transport/transport-farmer.js"></script>
```

Replace the `<section class="page" id="page-transport">` content with an empty section (transport module fills it dynamically).

**Step B — Modify `app.js`:**

Find `renderTransport()` and replace its body with:
```javascript
function renderTransport() {
    if (typeof renderTransportModule === 'function') {
        renderTransportModule();
    }
}
```

### 6. Serve Frontend

```bash
# From the transport root directory
npx serve . -p 5500
# OR use VS Code Live Server on port 5500
```

---

## Seed Accounts (Development)

The schema seeds these test accounts (password for all: `Driver@123`):

| Email | Role | Name |
|-------|------|------|
| `driver.kumar@agribridge.dev` | Driver | Kumar Selvam |
| `driver.ravi@agribridge.dev` | Driver | Ravi Murugan |
| `farmer.demo@agribridge.dev` | Farmer | Demo Farmer |

> ⚠️ Change these passwords after initial setup!

After seeding drivers, you need to add their vehicles:
1. Login as Kumar → Vehicle page → Edit: Mini Truck, TN 01 AB 1234, 1000 kg
2. Login as Ravi → Vehicle page → Edit: Auto, TN 02 CD 5678, 500 kg

---

## Real-Time Testing Workflow

### Full End-to-End Test

1. **Open Browser Tab 1** — Login as `driver.kumar@agribridge.dev` (Driver)
   - Set availability to 🟢 AVAILABLE

2. **Open Browser Tab 2** — Login as `driver.ravi@agribridge.dev` (Driver)
   - Set availability to 🟢 AVAILABLE

3. **Open Browser Tab 3** — Login as `farmer.demo@agribridge.dev` (Farmer)
   - Navigate to 🚚 Transport
   - Create request: 800 kg Tomato, Madurai → Mattuthavani

4. **Expected:**
   - ✅ Kumar (1000 kg capacity) receives the request notification
   - ❌ Ravi (500 kg capacity) does NOT receive it (capacity insufficient)

5. **Accept & Track:**
   - Kumar clicks ACCEPT
   - ✅ Kumar status → BUSY
   - ✅ Request status → ACCEPTED
   - ✅ Farmer (Tab 3) sees real-time notification "Driver Accepted"

6. **Delivery Lifecycle (in Kumar's dashboard):**
   - 📍 Reached Pickup → Farmer sees notification
   - 📦 Picked Up → Farmer sees notification
   - 🚚 In Transit → Live map updates
   - 📍 Reached Destination
   - ✅ Delivered → Earnings calculated + stored

7. **After delivery:**
   - ✅ Kumar status → AVAILABLE again
   - ✅ Earnings updated in Kumar's dashboard
   - ✅ Delivery appears in Kumar's history

### Race Condition Test

1. Open two tabs as Driver A and Driver B (both with sufficient capacity)
2. Both view the same request
3. Both click ACCEPT within milliseconds of each other
4. ✅ Only one driver gets the delivery
5. ✅ Second driver sees: "Request already accepted by another driver"

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transport/auth/register` | Create account |
| POST | `/api/transport/auth/login` | Login → JWT |
| GET | `/api/transport/auth/me` | Verify token |

### Drivers
| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/api/transport/drivers/me` | Driver |
| PUT | `/api/transport/drivers/me/availability` | Driver |
| PUT | `/api/transport/drivers/me/location` | Driver |
| GET | `/api/transport/drivers/me/earnings` | Driver |
| GET | `/api/transport/drivers/available` | Any |

### Vehicles
| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/api/transport/vehicles/me` | Driver |
| PUT | `/api/transport/vehicles/me` | Driver |

### Requests
| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/transport/requests` | Farmer/Vendor |
| GET | `/api/transport/requests` | Any (scoped) |
| GET | `/api/transport/requests/:id` | Any (scoped) |
| POST | `/api/transport/requests/:id/accept` | Driver |
| POST | `/api/transport/requests/:id/reject` | Driver |
| DELETE | `/api/transport/requests/:id` | Farmer/Vendor |

### Deliveries
| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/api/transport/deliveries/active` | Driver |
| PUT | `/api/transport/deliveries/:id/status` | Driver |
| GET | `/api/transport/deliveries/history` | Any (scoped) |
| GET | `/api/transport/deliveries/:id` | Any |

---

## Socket.IO Events

### Client → Server
```javascript
driver:availability   { status: 'available'|'busy'|'offline' }
driver:location       { lat, lng, deliveryId }
delivery:join         { deliveryId }
delivery:leave        { deliveryId }
```

### Server → Client
```javascript
driver:availability_changed   { driverId, driverName, status, timestamp }
transport:new_request         { request, driverDistance }
transport:request_accepted    { requestId, deliveryId, driverName, ... }
transport:request_cancelled   { requestId, crop }
delivery:status_changed       { deliveryId, status, title, message, timestamp }
delivery:location_updated     { driverId, deliveryId, lat, lng, timestamp }
delivery:completed            { deliveryId, earnings, driverName }
notification:new              { type, title, message }
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (backend only) |
| `JWT_SECRET` | ✅ | Long random string for JWT signing |
| `PORT` | ❌ | Server port (default: 3001) |
| `CORS_ORIGIN` | ❌ | Frontend URL (default: http://localhost:5500) |

---

## Files Created

### Backend (`backend/`)
- `server.js` — Express + Socket.IO main server
- `db.js` — Supabase client + atomic helpers
- `package.json` — Dependencies
- `.env.example` — Environment variable template
- `db/schema.sql` — Complete PostgreSQL schema
- `routes/auth.js` — Authentication endpoints
- `routes/drivers.js` — Driver management
- `routes/vehicles.js` — Vehicle management
- `routes/requests.js` — Transport requests (with atomic accept)
- `routes/deliveries.js` — Delivery lifecycle + earnings
- `routes/notifications.js` — Notification management
- `middleware/auth.js` — JWT + role-based access control
- `utils/earnings.js` — Centralized earnings formula
- `utils/matching.js` — Driver matching algorithm + Haversine

### Frontend (`transport/`)
- `transport-module.js` — Complete driver dashboard (all 10 pages)
- `transport-farmer.js` — Farmer transport UI + tracking
- `transport.css` — All transport module styles

### Patches (apply to existing app)
- `transport/INDEX_HTML_PATCH.txt` — Instructions for index.html changes
- `transport/APP_JS_PATCH.js` — Instructions for app.js change
