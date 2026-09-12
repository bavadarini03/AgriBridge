const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAiGjBHx-h9beVLmLZibKvloiyKI7v2j4k",
  authDomain: "agribridge-transport.firebaseapp.com",
  projectId: "agribridge-transport",
  storageBucket: "agribridge-transport.firebasestorage.app",
  messagingSenderId: "503064005893",
  appId: "1:503064005893:web:4170bd8be75b9bd59d7b6c",
  measurementId: "G-8R63363DNY"
};

const DEMO_MODE = FIREBASE_CONFIG.apiKey === "YOUR_API_KEY";

if (DEMO_MODE) {
  console.warn(
    "[AgriBridge Transport] Running in DEMO MODE. Configure firebase-config.js."
  );
} else {
  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
}

window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.DEMO_MODE = DEMO_MODE;