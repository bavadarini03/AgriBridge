/* ============================================================
   Toast notification system
   Global utility — loaded before other scripts
   ============================================================ */

const Toast = (() => {
  function ensureContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function show(message, type = 'info', duration = 4000) {
    const container = ensureContainer();
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>
    `;

    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('toast-show'));

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return { show };
})();

/* ---- HTML sanitizer ---- */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}

/* ---- Format helpers ---- */
function fmtCurrency(n) {
  return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtStatus(status) {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ---- Loading skeleton builder ---- */
function renderSkeleton(rows = 3) {
  return Array.from({ length: rows }, () =>
    `<div class="skeleton-row">
      <div class="skeleton" style="width:60%; height:16px; margin-bottom:8px;"></div>
      <div class="skeleton" style="width:40%; height:12px;"></div>
    </div>`
  ).join('');
}

/* ---- Haversine distance ---- */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---- OSRM routing ---- */
async function getRoute(fromLat, fromLng, toLat, toLng) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates.map(c => [c[1], c[0]]),
      distanceKm: Math.round(route.distance / 100) / 10,
      durationMin: Math.round(route.duration / 60)
    };
  } catch {
    return null;
  }
}

/* ---- Leaflet marker icon factory ---- */
function makeIcon(emoji, color) {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><span style="transform:rotate(45deg);font-size:15px;line-height:1">${emoji}</span></div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36]
  });
}

/* ---- Vehicle emoji ---- */
const VEHICLE_EMOJI = { Auto: '🛺', 'Mini Truck': '🚛', 'Pickup Van': '🚐', Lorry: '🚚', Tractor: '🚜', Other: '🚗' };
const CROP_EMOJI = { Tomato: '🍅', Onion: '🧅', Potato: '🥔', Banana: '🍌', Chilli: '🌶️', Spinach: '🥬', Brinjal: '🍆', Carrot: '🥕', Rice: '🌾', Wheat: '🌾', Coconut: '🥥', Mango: '🥭', Groundnut: '🥜' };

window.Toast = Toast;
window.escapeHtml = escapeHtml;
window.fmtCurrency = fmtCurrency;
window.fmtDate = fmtDate;
window.fmtDateTime = fmtDateTime;
window.fmtTime = fmtTime;
window.timeAgo = timeAgo;
window.fmtStatus = fmtStatus;
window.renderSkeleton = renderSkeleton;
window.haversineKm = haversineKm;
window.getRoute = getRoute;
window.makeIcon = makeIcon;
window.VEHICLE_EMOJI = VEHICLE_EMOJI;
window.CROP_EMOJI = CROP_EMOJI;
