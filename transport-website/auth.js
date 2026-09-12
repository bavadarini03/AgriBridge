/* ============================================================
   auth.js — Login & Registration Logic  (Firebase edition)
   Handles the index.html auth page only.
   Uses FirebaseAuth.* instead of Express API calls.
   All form UI, validation, and error display unchanged.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // Show demo-mode banner if Firebase not configured
  if (window.DEMO_MODE) {
    _showDemoBanner();
  }

  // Already logged in? Redirect to dashboard
  if (Auth.isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return;
  }

  initAuthTabs();
  initLoginForm();
  initRegisterForm();
  initPasswordToggles();
});

/* ---- Demo mode banner ---- */
function _showDemoBanner() {
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:9999;',
    'background:#f59e0b;color:#1c1917;padding:10px 20px;',
    'font-size:13px;font-weight:600;text-align:center;',
    'display:flex;align-items:center;justify-content:center;gap:12px;'
  ].join('');
  banner.innerHTML = [
    '<span>⚠️ Demo Mode — Firebase not configured.</span>',
    '<span style="font-weight:400">Fill in <code>firebase-config.js</code> to use real data.',
    'See <a href="FIREBASE_SETUP.md" target="_blank" style="color:#1c1917;text-decoration:underline">FIREBASE_SETUP.md</a>.</span>'
  ].join(' ');
  document.body.prepend(banner);
  // Offset page so banner doesn't cover form
  document.body.style.marginTop = '40px';
}

/* ---- Tab switching ---- */
function initAuthTabs() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${target}`)?.classList.add('active');
      clearErrors();
    });
  });
}

/* ---- Login form ---- */
function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email)               { showFieldError('login-email',    'Email is required');              return; }
    if (!isValidEmail(email)) { showFieldError('login-email',    'Enter a valid email address');    return; }
    if (!password)            { showFieldError('login-password', 'Password is required');           return; }

    const btn = document.getElementById('login-btn');
    setLoading(btn, true, 'Signing in\u2026');

    try {
      // FirebaseAuth.login returns { uid, user: { id, name, email, role } }
      const { uid, user } = await FirebaseAuth.login(email, password);

      if (user.role !== 'driver') {
        showFormError('login-error', 'This portal is for transport drivers only.');
        await FirebaseAuth.logout();
        return;
      }

      Auth.save(uid, user);
      Toast.show(`Welcome back, ${user.name}!`, 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);

    } catch (err) {
      showFormError('login-error', err.message);
    } finally {
      setLoading(btn, false, 'Sign In');
    }
  });
}

/* ---- Register form ---- */
function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const fields = {
      name:           document.getElementById('reg-name').value.trim(),
      email:          document.getElementById('reg-email').value.trim(),
      phone:          document.getElementById('reg-phone').value.trim(),
      password:       document.getElementById('reg-password').value,
      confirmPassword:document.getElementById('reg-confirm-password').value,
      vehicleType:    document.getElementById('reg-vehicle-type').value,
      vehicleNumber:  document.getElementById('reg-vehicle-number').value.trim().toUpperCase(),
      capacityKg:     parseInt(document.getElementById('reg-capacity').value),
    };

    // Validation
    let hasError = false;
    if (!fields.name)            { showFieldError('reg-name',           'Full name is required');            hasError = true; }
    if (!fields.email)           { showFieldError('reg-email',          'Email is required');                hasError = true; }
    else if (!isValidEmail(fields.email)) { showFieldError('reg-email', 'Enter a valid email');             hasError = true; }
    if (!fields.phone)           { showFieldError('reg-phone',          'Phone number is required');         hasError = true; }
    if (!fields.password)        { showFieldError('reg-password',       'Password is required');             hasError = true; }
    else if (fields.password.length < 6) { showFieldError('reg-password', 'Password must be at least 6 characters'); hasError = true; }
    if (fields.password !== fields.confirmPassword) { showFieldError('reg-confirm-password', 'Passwords do not match'); hasError = true; }
    if (!fields.vehicleType)     { showFieldError('reg-vehicle-type',   'Select a vehicle type');            hasError = true; }
    if (!fields.vehicleNumber)   { showFieldError('reg-vehicle-number', 'Vehicle registration number is required'); hasError = true; }
    if (!fields.capacityKg || fields.capacityKg < 1) { showFieldError('reg-capacity', 'Enter a valid capacity (minimum 1 kg)'); hasError = true; }

    if (hasError) return;

    const btn = document.getElementById('register-btn');
    setLoading(btn, true, 'Creating account\u2026');

    try {
      // 1. Create Firebase Auth + Firestore user + driver docs
      const { uid, user } = await FirebaseAuth.register({
        name:     fields.name,
        email:    fields.email,
        phone:    fields.phone,
        password: fields.password
      });

      // 2. Create vehicle document
      await FirebaseAuth.createVehicle(uid, {
        vehicleType:        fields.vehicleType,
        registrationNumber: fields.vehicleNumber,
        capacity:           fields.capacityKg
      });

      // 3. Persist session
      Auth.save(uid, user);

      Toast.show(`Account created! Welcome, ${user.name}!`, 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);

    } catch (err) {
      showFormError('register-error', err.message);
    } finally {
      setLoading(btn, false, 'Register as Driver');
    }
  });
}

/* ---- Password visibility toggles ---- */
function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.getAttribute('data-target');
      const input   = document.getElementById(inputId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>`;
      } else {
        input.type = 'password';
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      }
    });
  });
}

/* ---- Helpers ---- */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.classList.add('input-error');
  const errEl = input.parentElement.querySelector('.field-error') ||
                input.closest('.form-group')?.querySelector('.field-error');
  if (errEl) { errEl.textContent = message; errEl.style.display = 'block'; }
}

function showFormError(errorId, message) {
  const el = document.getElementById(errorId);
  if (el) { el.textContent = message; el.style.display = 'block'; }
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
  document.querySelectorAll('.form-error-box').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
  document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function setLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="btn-spinner"></span> ${escapeHtml(text)}`
    : escapeHtml(text);
}
