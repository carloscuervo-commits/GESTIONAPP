// ===================== MÓDULO CLIENTES (admin only) =====================
// Gestión de clientes para geofencing y configuración por cliente.
// Visible y editable solo para perfil admin.

let _clientes = []; // caché local

// ----------------- Autocomplete Alegra en modal -----------------
let _cmSuggestTimer = null;
let _cmSuggestions  = [];

function _cmNombreInput() {
  const q = document.getElementById('cm-nombre').value.trim();
  clearTimeout(_cmSuggestTimer);
  _ocultarCmSuggestions();
  if (q.length < 2) return;
  _cmSuggestTimer = setTimeout(() => _buscarCmAlegra(q), 300);
}

async function _buscarCmAlegra(q) {
  if (!API_BASE) return;
  try {
    const res  = await fetch(`${API_BASE}/alegra_contactos.php?q=${encodeURIComponent(q)}`);
    _cmSuggestions = await res.json();
    if (!Array.isArray(_cmSuggestions) || !_cmSuggestions.length) { _ocultarCmSuggestions(); return; }
    const box = document.getElementById('cm-nombre-suggestions');
    if (!box) return;
    box.innerHTML = _cmSuggestions.map((c, i) =>
      `<div onmousedown="_seleccionarCmIdx(${i})" style="padding:8px 12px;cursor:pointer;font-size:13px;
        border-bottom:1px solid var(--border,#e5e7eb)"
        onmouseover="this.style.background='var(--bg,#f8fafc)'"
        onmouseout="this.style.background=''">${esc(c.name)}</div>`
    ).join('');
    box.style.display = 'block';
  } catch { _ocultarCmSuggestions(); }
}

function _seleccionarCmIdx(i) {
  const c = _cmSuggestions[i];
  if (!c) return;
  document.getElementById('cm-nombre').value    = c.name;
  document.getElementById('cm-alegra-id').value = c.id || '';
  if (c.address) document.getElementById('cm-direccion').value = c.address;
  _actualizarLinkMaps();
  _ocultarCmSuggestions();
}

function _ocultarCmSuggestions() {
  const box = document.getElementById('cm-nombre-suggestions');
  if (box) box.style.display = 'none';
}

function _cmContratoAreaChange() {
  const area = document.getElementById('cm-contrato-area')?.value;
  const grp  = document.getElementById('cm-contrato-horas-grp');
  if (grp) grp.style.display = area ? '' : 'none';
}

// ----------------- Carga y render -----------------
async function cargarClientes() {
  if (!API_BASE) return;
  try {
    const res = await fetch(`${API_BASE}/clientes.php`);
    const data = await res.json();
    _clientes = Array.isArray(data) ? data : [];
    renderClientesView();
  } catch (e) { console.error('Error cargando clientes', e); }
}

function renderClientesView() {
  const el = document.getElementById('clientes-view');
  if (!el) return;

  const sinUbicacion = _clientes.filter(c => !c.lat || !c.lng);

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:17px;font-weight:700;color:var(--text)">🏢 Clientes</div>
        ${sinUbicacion.length
          ? `<div style="font-size:12px;color:#f59e0b;margin-top:3px">⚠️ ${sinUbicacion.length} cliente(s) sin ubicación — el geofencing no aplica para ellos</div>`
          : (_clientes.length ? `<div style="font-size:12px;color:#16a34a;margin-top:3px">✅ Todos los clientes tienen ubicación registrada</div>` : '')}
      </div>
      <button class="btn-save" onclick="abrirModalCliente()">+ Nuevo cliente</button>
    </div>
    ${_clientes.length === 0
      ? `<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:48px 0">No hay clientes registrados aún</div>`
      : `<div style="display:grid;gap:10px">${_clientes.map(_clienteCard).join('')}</div>`
    }`;
}

function _clienteCard(c) {
  const tieneUbic = c.lat && c.lng;
  return `
    <div style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:10px;
                padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:5px">${esc(c.nombre)}</div>
        <div style="font-size:12px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:10px">
          ${c.direccion ? `<span>📍 ${esc(c.direccion)}</span>` : '<span style="color:#94a3b8">Sin dirección</span>'}
          ${tieneUbic
            ? `<span style="color:#16a34a">✅ GPS: ${(+c.lat).toFixed(5)}, ${(+c.lng).toFixed(5)}</span>`
            : `<span style="color:#f59e0b;cursor:pointer;text-decoration:underline" onclick="abrirModalCliente('${c.id}')">⚠️ Sin ubicación — agregar</span>`}
          <span>📏 Radio: ${c.radio_metros}m</span>
          <span>📅 Plazo: ${c.plazo_factura_dias} días</span>
        </div>
      </div>
      <button class="btn-archivar" onclick="abrirModalCliente('${c.id}')" style="white-space:nowrap;flex-shrink:0">✏️ Editar</button>
    </div>`;
}

// ----------------- Modal crear / editar -----------------
let _clienteEditId = null;

function abrirModalCliente(id = null) {
  _clienteEditId = id || null;
  const c = id ? _clientes.find(x => x.id === id) : null;

  document.getElementById('cliente-modal-titulo').textContent = c ? `Editar: ${c.nombre}` : 'Nuevo cliente';
  document.getElementById('cm-nombre').value    = c?.nombre    || '';
  document.getElementById('cm-direccion').value = c?.direccion || '';
  document.getElementById('cm-radio').value     = c?.radio_metros        ?? 200;
  document.getElementById('cm-plazo').value     = c?.plazo_factura_dias  ?? 8;
  document.getElementById('cm-alegra-id').value = c?.alegra_id || '';
  // Coordenadas: mostrar en campo combinado si existen
  const hasCoords = c?.lat != null && c?.lng != null;
  document.getElementById('cm-coords').value = hasCoords ? `${c.lat}, ${c.lng}` : '';
  document.getElementById('cm-lat').value    = hasCoords ? c.lat : '';
  document.getElementById('cm-lng').value    = hasCoords ? c.lng : '';
  const preview = document.getElementById('cm-coords-preview');
  if (preview) {
    if (hasCoords) { preview.textContent = `✅ Lat: ${(+c.lat).toFixed(6)}  Lng: ${(+c.lng).toFixed(6)}`; preview.style.display = 'block'; }
    else           { preview.style.display = 'none'; }
  }

  _actualizarLinkMaps();

  // Transporte
  const inpTransporte = document.getElementById('cm-transporte');
  if (inpTransporte) inpTransporte.value = c?.valor_transporte != null ? c.valor_transporte : '';

  // Contrato
  const selArea = document.getElementById('cm-contrato-area');
  const inpHoras = document.getElementById('cm-contrato-horas');
  if (selArea)  selArea.value  = c?.contrato_area  || '';
  if (inpHoras) inpHoras.value = c?.contrato_horas_mes != null ? c.contrato_horas_mes : '';
  _cmContratoAreaChange();

  const btnEliminar = document.getElementById('cm-btn-eliminar');
  if (btnEliminar) btnEliminar.style.display = id ? 'inline-flex' : 'none';

  document.getElementById('cliente-modal').classList.add('open');
}

function cerrarModalCliente() {
  document.getElementById('cliente-modal').classList.remove('open');
  _clienteEditId = null;
}

function _parsearCoords(raw) {
  // Acepta "lat, lng" o "lat lng" con cualquier separador de espacios
  const parts = raw.trim().split(/[\s,]+/);
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  const latEl     = document.getElementById('cm-lat');
  const lngEl     = document.getElementById('cm-lng');
  const preview   = document.getElementById('cm-coords-preview');
  if (!isNaN(lat) && !isNaN(lng) && parts.length >= 2) {
    latEl.value = lat;
    lngEl.value = lng;
    if (preview) { preview.textContent = `✅ Lat: ${lat.toFixed(6)}  Lng: ${lng.toFixed(6)}`; preview.style.display = 'block'; }
  } else {
    latEl.value = '';
    lngEl.value = '';
    if (preview) preview.style.display = 'none';
  }
  _actualizarLinkMaps();
}

function _actualizarLinkMaps() {
  const dir  = document.getElementById('cm-direccion').value.trim();
  const lat  = document.getElementById('cm-lat').value.trim();
  const lng  = document.getElementById('cm-lng').value.trim();
  const link = document.getElementById('cm-maps-link');
  if (!link) return;

  // Si hay coordenadas, abrir directamente en esa posición; si no, buscar por dirección
  if (lat && lng) {
    link.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    link.textContent = '🗺️ Ver ubicación en Google Maps';
    link.style.display = 'inline';
  } else if (dir) {
    link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`;
    link.textContent = '🗺️ Buscar dirección en Google Maps';
    link.style.display = 'inline';
  } else {
    link.style.display = 'none';
  }
}

async function guardarCliente() {
  const nombre = document.getElementById('cm-nombre').value.trim();
  if (!nombre) { alert('El nombre del cliente es obligatorio.'); return; }

  const latRaw = document.getElementById('cm-lat').value.trim();
  const lngRaw = document.getElementById('cm-lng').value.trim();

  const contratoArea  = document.getElementById('cm-contrato-area')?.value  || null;
  const contratoHoras = document.getElementById('cm-contrato-horas')?.value;

  const body = {
    nombre,
    direccion:          document.getElementById('cm-direccion').value.trim() || null,
    lat:                latRaw ? parseFloat(latRaw)  : null,
    lng:                lngRaw ? parseFloat(lngRaw)  : null,
    radio_metros:       parseInt(document.getElementById('cm-radio').value)  || 200,
    plazo_factura_dias: parseInt(document.getElementById('cm-plazo').value)  || 8,
    alegra_id:          document.getElementById('cm-alegra-id').value.trim() || null,
    contrato_area:      contratoArea || null,
    contrato_horas_mes: contratoArea && contratoHoras !== '' ? parseFloat(contratoHoras) || null : null,
    valor_transporte:   (() => { const v = document.getElementById('cm-transporte')?.value; return v !== '' && v != null ? parseInt(v) || null : null; })(),
  };

  if (body.lat !== null && isNaN(body.lat)) { alert('Latitud inválida.'); return; }
  if (body.lng !== null && isNaN(body.lng)) { alert('Longitud inválida.'); return; }

  try {
    const url    = _clienteEditId ? `${API_BASE}/clientes.php?id=${_clienteEditId}` : `${API_BASE}/clientes.php`;
    const method = _clienteEditId ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data   = await res.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    cerrarModalCliente();
    await cargarClientes();
  } catch (e) { alert('No se pudo guardar el cliente. Revisa tu conexión.'); }
}

async function eliminarCliente() {
  if (!_clienteEditId) return;
  const c = _clientes.find(x => x.id === _clienteEditId);
  if (!confirm(`¿Eliminar el cliente "${c?.nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    await fetch(`${API_BASE}/clientes.php?id=${_clienteEditId}`, { method: 'DELETE' });
    cerrarModalCliente();
    await cargarClientes();
  } catch (e) { alert('No se pudo eliminar.'); }
}

// Llamado desde tareas.js cuando se selecciona un cliente de Alegra.
// Crea o actualiza el cliente con alegra_id y direccion.
// Usa POST directo (sin GET previo) para evitar race condition con tareas.php
// que también hace INSERT IGNORE al guardar la tarea.
async function sincronizarClienteAlegra(nombre, alegraId, direccion) {
  if (!API_BASE || !nombre) return;
  try {
    // POST: si el cliente no existe lo crea; si ya existe devuelve el existente
    const res  = await fetch(`${API_BASE}/clientes.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, alegra_id: alegraId, direccion: direccion || null }),
    });
    const data = await res.json();
    if (!data.id) return;

    // Si el registro devuelto (creado o existente via INSERT IGNORE) le faltan datos, actualizar
    const updates = {};
    if (!data.alegra_id && alegraId)   updates.alegra_id = alegraId;
    if (!data.direccion && direccion)  updates.direccion = direccion;
    if (Object.keys(updates).length) {
      await fetch(`${API_BASE}/clientes.php?id=${data.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    }
    // Refrescar caché si la vista de clientes está abierta
    if (document.getElementById('clientes-view')?.offsetParent !== null) await cargarClientes();
  } catch (e) { /* no crítico */ }
}
