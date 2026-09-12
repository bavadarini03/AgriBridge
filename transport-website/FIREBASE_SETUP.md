# Firebase Setup Guide — AgriBridge Transport

Follow these steps to connect the project to your Firebase project.
No npm, no server, no backend needed. Everything runs from VS Code Live Server.

---

## Step 1 — Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project**
3. Enter project name e.g. `agribridge-transport`
4. Disable Google Analytics (optional)
5. Click **Create project** → wait ~30 seconds

---

## Step 2 — Enable Email/Password Authentication

1. In your project: **Build → Authentication**
2. Click **Get started**
3. Click **Email/Password** provider
4. Toggle **Enable** → **Save**

---

## Step 3 — Create Firestore Database

1. **Build → Firestore Database**
2. Click **Create database**
3. Select **Start in test mode** (you'll add rules in Step 8)
4. Choose a region close to you → **Enable**

---

## Step 4 — Create Realtime Database (for live GPS)

1. **Build → Realtime Database**
2. Click **Create Database**
3. Select a region → **Next**
4. Select **Start in test mode** → **Enable**

---

## Step 5 — Add Web App

1. **Project Overview** (home icon) → click **</>** (Web app)
2. Enter app nickname e.g. `Transport Driver Portal`
3. Do NOT check Firebase Hosting
4. Click **Register app**
5. You will see your `firebaseConfig` object — copy it

---

## Step 6 — Configure firebase-config.js

Open `transport-website/firebase-config.js` and replace the placeholder values:

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIza...",
  authDomain:        "agribridge-transport.firebaseapp.com",
  projectId:         "agribridge-transport",
  storageBucket:     "agribridge-transport.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
  databaseURL:       "https://agribridge-transport-default-rtdb.firebaseio.com"
};
```

> **How to find databaseURL:** Realtime Database → copy the URL shown at the top
> (format: `https://YOUR_PROJECT-default-rtdb.firebaseio.com`)

---

## Step 7 — Create Firestore Indexes

Some queries require composite indexes. When you first run the app and see
a "requires an index" error in the browser console, click the link in the
error message — it takes you directly to the Firebase Console to create it.

The queries that need indexes:
- `deliveries` where `driverId == X` and `status not-in [...]` ordered by `startedAt`
- `deliveries` where `driverId == X` and `status == delivered` ordered by `completedAt`
- `notifications` where `userId == X` and `read == false` ordered by `createdAt`

---

## Step 8 — Deploy Firestore Security Rules

1. **Firestore Database → Rules** tab
2. Replace the content with the rules from `transport-website/firestore.rules`
3. Click **Publish**

---

## Step 9 — Deploy Realtime Database Rules

1. **Realtime Database → Rules** tab
2. Replace the content with the JSON from `transport-website/database.rules.json`
3. Click **Publish**

---

## Step 10 — Run with Live Server

```bash
# Option A: VS Code Live Server
# Right-click index.html → Open with Live Server
# (Default port: 5500)

# Option B: npx serve
npx serve transport-website -p 5500
```

Open: http://localhost:5500/index.html

---

## Step 11 — Create Demo Accounts (optional)

To quickly test the app, create accounts in **Firebase Console → Authentication → Users**:

| Email | Password | Notes |
|---|---|---|
| `driver.kumar@agribridge.dev` | `Driver@123` | Driver account |
| `driver.ravi@agribridge.dev` | `Driver@123` | Driver account |

> After creating Auth users, you also need to register them through the app's
> Register form so that Firestore `users/` and `drivers/` documents are created.

---

## Step 12 — Test the App

### Driver workflow:
1. Open `index.html` → Register as a driver with vehicle info
2. Login → Dashboard
3. Set status to **Available**
4. Check **Transport Requests** page

### Farmer workflow (to create test requests):
Add farmer requests directly in **Firestore Console → transportRequests** collection:

```json
{
  "farmerId": "any-string",
  "farmerName": "Test Farmer",
  "crop": "Tomato",
  "weight": 500,
  "pickupLocation": {
    "name": "Madurai Market",
    "latitude": 9.919,
    "longitude": 78.119
  },
  "dropLocation": {
    "name": "Mattuthavani",
    "latitude": 9.900,
    "longitude": 78.090
  },
  "estimatedDistance": 8.5,
  "estimatedTime": 26,
  "status": "requested",
  "driverId": null,
  "driverName": null,
  "createdAt": (use server timestamp),
  "updatedAt": (use server timestamp)
}
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Firebase: Error (auth/configuration-not-found)" | Check `firebase-config.js` credentials |
| "Missing or insufficient permissions" | Deploy Firestore security rules (Step 8) |
| "The query requires an index" | Click the link in console to create the index |
| GPS not updating | Allow location in browser; check HTTPS (Live Server works fine) |
| Demo banner still showing | `apiKey` in firebase-config.js still has placeholder value |
| Blank dashboard after login | Check browser console for Firebase errors |

---

## Project Files Changed

| File | Change |
|---|---|
| `firebase-config.js` | **NEW** — Firebase credentials |
| `firebase-service.js` | **NEW** — All Firebase data operations |
| `api.js` | **REPLACED** — Now wraps FirebaseService |
| `socket.js` | **REPLACED** — Firebase realtime shim (no Socket.IO) |
| `auth.js` | **MODIFIED** — Uses FirebaseAuth |
| `app.js` | **MODIFIED** — Uses FirebaseAuth for logout |
| `index.html` | **MODIFIED** — Firebase SDK CDN added |
| `dashboard.html` | **MODIFIED** — Firebase SDK CDN, Socket.IO removed |
| `dashboard.js` | Unchanged |
| `requests.js` | Unchanged |
| `delivery.js` | Unchanged |
| `tracking.js` | Unchanged |
| `earnings.js` | Unchanged |
| `history.js` | Unchanged |
| `notifications.js` | Unchanged |
| `profile.js` | Unchanged |
| `vehicle.js` | Unchanged |
| `utils.js` | Unchanged |
| `styles.css` | Unchanged |
| `backend/` | No longer needed (can be deleted or archived) |
