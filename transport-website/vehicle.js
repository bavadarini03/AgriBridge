/* Vehicle management page */

Pages.vehicle = async function() {
  const el = document.getElementById('page-vehicle');
  if (!el) return;

  el.innerHTML = `
    <div >
      <div class="page-header">
        <div>
          <h1 class="page-title">Vehicle Management</h1>
          <p class="page-subtitle">Keep your vehicle details up to date to receive matching requests.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-body" id="vehicle-form-wrap">${renderSkeleton(4)}</div>
      </div>
    </div>
  `;

  await loadVehiclePage();
};

async function loadVehiclePage() {
  const wrap = document.getElementById('vehicle-form-wrap');
  if (!wrap) return;

  try {
    const data = await API.vehicles.me();
    const v = data.vehicle;
    AppState.vehicle = v;
    updateVehicleDisplay();

    wrap.innerHTML = `
      <form id="vehicle-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="vehicle-type">Vehicle Type</label>
            <select class="form-select" id="vehicle-type" required>
              ${['Auto','Mini Truck','Pickup Van','Lorry'].map(t => `<option value="${t}" ${v.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="vehicle-status">Vehicle Status</label>
            <select class="form-select" id="vehicle-status" required>
              <option value="available" ${v.status === 'available' ? 'selected' : ''}>Available</option>
              <option value="maintenance" ${v.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
              <option value="inactive" ${v.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="vehicle-number">Registration Number</label>
            <input class="form-input" id="vehicle-number" value="${escapeHtml(v.number || '')}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="vehicle-capacity">Capacity (KG)</label>
            <input class="form-input" id="vehicle-capacity" type="number" min="1" value="${parseInt(v.capacity_kg || 0, 10)}" required />
          </div>
        </div>
        <button class="btn btn-primary" id="vehicle-save-btn" type="submit">Save Vehicle</button>
      </form>
    `;

    document.getElementById('vehicle-form')?.addEventListener('submit', saveVehicle);
  } catch (err) {
    wrap.innerHTML = `<div class="error-state">Failed to load vehicle: ${escapeHtml(err.message)}</div>`;
  }
}

async function saveVehicle(e) {
  e.preventDefault();
  const btn = document.getElementById('vehicle-save-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Saving...';
  }

  try {
    const payload = {
      type: document.getElementById('vehicle-type').value,
      status: document.getElementById('vehicle-status').value,
      number: document.getElementById('vehicle-number').value.trim().toUpperCase(),
      capacity_kg: parseInt(document.getElementById('vehicle-capacity').value, 10)
    };

    if (!payload.number || !payload.capacity_kg || payload.capacity_kg < 1) {
      throw new Error('Please enter valid vehicle details.');
    }

    const data = await API.vehicles.update(payload);
    AppState.vehicle = data.vehicle;
    updateVehicleDisplay();
    Toast.show('Vehicle updated successfully', 'success');
  } catch (err) {
    Toast.show(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Save Vehicle';
    }
  }
}
