// ===================== MÓDULO CLIENTES (admin only) =====================
// Gestión de clientes para geofencing y configuración por cliente.
// Visible y editable solo para perfil admin.

let _clientes = []; // caché local

// ── Estado de la tabla de clientes ──
let _cliSearch   = '';
let _cliFiltroT  = false;  // solo con transporte > 0
let _cliFiltroC  = false;  // solo con contrato activo
let _cliPagina   = 1;
const CLI_PER_PAGE = 25;

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
  if (c.email) {
    const e = document.getElementById('cm-email');
    if (e) e.value = c.email;
  } else if (c.id && API_BASE) {
    // La búsqueda no devolvió email → traer el contacto completo de Alegra para capturarlo
    fetch(`${API_BASE}/alegra_contactos.php?id=${encodeURIComponent(c.id)}`)
      .then(r => r.json())
      .then(data => {
        if (data?.email) {
          const e = document.getElementById('cm-email');
          if (e) e.value = data.email;
        }
      })
      .catch(() => {});
  }
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
  const grpCorte = document.getElementById('cm-contrato-corte-grp');
  if (grp) grp.style.display = area ? '' : 'none';
  if (grpCorte) grpCorte.style.display = area ? '' : 'none';
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

  // Resetear estado al entrar a la vista
  _cliSearch  = '';
  _cliFiltroT = false;
  _cliFiltroC = false;
  _cliPagina  = 1;

  const sinUbicacion = _clientes.filter(c => !c.lat || !c.lng);
  const alertaUbic = sinUbicacion.length
    ? `<div style="font-size:12px;color:#f59e0b;margin-top:3px">⚠️ ${sinUbicacion.length} cliente(s) sin ubicación — el geofencing no aplica para ellos</div>`
    : (_clientes.length ? `<div style="font-size:12px;color:#16a34a;margin-top:3px">✅ Todos los clientes tienen ubicación registrada</div>` : '');

  el.innerHTML = `
    <!-- Encabezado -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:17px;font-weight:700;color:var(--text)">🏢 Clientes</div>
        ${alertaUbic}
      </div>
      <button class="btn-save" onclick="abrirModalCliente()">+ Nuevo cliente</button>
    </div>

    <!-- Buscador + filtros -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;align-items:center">
      <input id="cli-search" type="search" placeholder="🔍 Buscar por nombre o dirección…"
        oninput="cliSetSearch(this.value)"
        style="flex:1;min-width:180px;max-width:320px;padding:7px 10px;font-size:13px;
               border:1px solid var(--border);border-radius:7px;background:var(--card-bg);
               color:var(--text);outline:none">
      <button id="cli-btn-t" onclick="cliToggleFiltro('t')"
        style="padding:6px 12px;font-size:12px;font-weight:600;border-radius:20px;cursor:pointer;
               border:1.5px solid var(--teal,#0D3B40);background:transparent;color:var(--teal,#0D3B40);
               transition:all .15s">
        🚗 Con transporte
      </button>
      <button id="cli-btn-c" onclick="cliToggleFiltro('c')"
        style="padding:6px 12px;font-size:12px;font-weight:600;border-radius:20px;cursor:pointer;
               border:1.5px solid var(--teal,#0D3B40);background:transparent;color:var(--teal,#0D3B40);
               transition:all .15s">
        📋 Con contrato
      </button>
    </div>

    <!-- Tabla -->
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
      <table id="cli-tabla" style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid var(--border)">
            <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--text-muted);white-space:nowrap">Nombre</th>
            <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--text-muted)">Dirección</th>
            <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--text-muted);white-space:nowrap">Correo</th>
            <th style="padding:10px 8px;text-align:center;font-weight:700;color:var(--text-muted);white-space:nowrap">GPS</th>
            <th style="padding:10px 14px;text-align:right;font-weight:700;color:var(--text-muted);white-space:nowrap">Transporte</th>
            <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--text-muted);white-space:nowrap">Contrato</th>
            <th style="padding:10px 14px;text-align:center;font-weight:700;color:var(--text-muted);white-space:nowrap">Plazo</th>
            <th style="padding:10px 8px"></th>
          </tr>
        </thead>
        <tbody id="cli-tbody"></tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div id="cli-paginacion" style="display:flex;align-items:center;justify-content:space-between;
         margin-top:12px;font-size:12px;color:var(--text-muted);flex-wrap:wrap;gap:6px"></div>
  `;

  _renderTablaClientes();
}

function _cliClientes() {
  // Aplicar búsqueda y filtros
  let lista = _clientes;
  const q = _cliSearch.trim().toLowerCase();
  if (q) {
    lista = lista.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.direccion || '').toLowerCase().includes(q)
    );
  }
  if (_cliFiltroT) lista = lista.filter(c => c.valor_transporte > 0);
  if (_cliFiltroC) lista = lista.filter(c => c.contrato_area);
  return lista;
}

function _renderTablaClientes() {
  const tbody = document.getElementById('cli-tbody');
  const pag   = document.getElementById('cli-paginacion');
  if (!tbody) return;

  const lista  = _cliClientes();
  const total  = lista.length;
  const paginas = Math.max(1, Math.ceil(total / CLI_PER_PAGE));
  if (_cliPagina > paginas) _cliPagina = paginas;

  const desde = (_cliPagina - 1) * CLI_PER_PAGE;
  const items  = lista.slice(desde, desde + CLI_PER_PAGE);

  // Actualizar estilos de filtros
  ['t','c'].forEach(f => {
    const btn = document.getElementById(`cli-btn-${f}`);
    if (!btn) return;
    const activo = f === 't' ? _cliFiltroT : _cliFiltroC;
    btn.style.background = activo ? 'var(--teal,#0D3B40)' : 'transparent';
    btn.style.color      = activo ? '#fff' : 'var(--teal,#0D3B40)';
  });

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--text-muted)">
      ${_clientes.length ? 'No hay clientes que coincidan con los filtros aplicados.' : 'No hay clientes registrados aún.'}
    </td></tr>`;
    if (pag) pag.innerHTML = '';
    return;
  }

  tbody.innerHTML = items.map((c, i) => {
    const par = (desde + i) % 2 === 1 ? 'background:var(--bg)' : '';
    const gps = (c.lat && c.lng)
      ? `<span title="Lat: ${(+c.lat).toFixed(5)}, Lng: ${(+c.lng).toFixed(5)}" style="color:#16a34a;cursor:default">✅</span>`
      : `<span title="Sin ubicación — el geofencing no aplica" style="color:#f59e0b;cursor:pointer"
           onclick="abrirModalCliente('${c.id}')">⚠️</span>`;
    const transporte = c.valor_transporte > 0
      ? `<span style="color:var(--text);font-weight:600">$${Number(c.valor_transporte).toLocaleString('es-CO')}</span>`
      : `<span style="color:var(--text-muted)">—</span>`;
    const contrato = c.contrato_area
      ? `<span style="background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap"
           title="Corte: día ${c.fecha_corte_contrato ?? 1} de cada mes">
           ${c.contrato_area.toUpperCase()} · ${c.contrato_horas_mes ?? '?'}h/mes
         </span>`
      : `<span style="color:var(--text-muted)">—</span>`;
    const correo = c.email
      ? `<span style="color:var(--text-muted);font-size:12px">${esc(c.email)}</span>`
      : `<span title="Sin correo — no se podrán enviar avisos" style="color:#ef4444;font-size:12px;cursor:pointer"
             onclick="abrirModalCliente('${c.id}')">⚠️ Sin correo</span>`;

    return `<tr style="border-top:1px solid var(--border);${par}">
      <td style="padding:10px 14px;font-weight:600;color:var(--text)">${esc(c.nombre)}</td>
      <td style="padding:10px 14px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${esc(c.direccion || '')}">${c.direccion ? esc(c.direccion) : '<span style="color:#94a3b8">—</span>'}</td>
      <td style="padding:10px 14px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${esc(c.email || '')}">${correo}</td>
      <td style="padding:10px 8px;text-align:center">${gps}</td>
      <td style="padding:10px 14px;text-align:right">${transporte}</td>
      <td style="padding:10px 14px">${contrato}</td>
      <td style="padding:10px 14px;text-align:center;color:var(--text-muted)">${c.plazo_factura_dias}d</td>
      <td style="padding:10px 8px;text-align:right">
        <button class="btn-archivar" onclick="abrirModalCliente('${c.id}')"
          style="padding:4px 10px;font-size:12px;white-space:nowrap">✏️ Editar</button>
      </td>
    </tr>`;
  }).join('');

  // Paginación
  if (pag) {
    const info = `Mostrando <b>${desde + 1}–${Math.min(desde + CLI_PER_PAGE, total)}</b> de <b>${total}</b>`;
    const prev = _cliPagina > 1
      ? `<button onclick="cliSetPagina(${_cliPagina - 1})" class="btn-archivar" style="padding:4px 10px;font-size:12px">← Ant.</button>` : '';
    const next = _cliPagina < paginas
      ? `<button onclick="cliSetPagina(${_cliPagina + 1})" class="btn-archivar" style="padding:4px 10px;font-size:12px">Sig. →</button>` : '';
    const nums = Array.from({length: paginas}, (_, i) => i + 1)
      .filter(p => p === 1 || p === paginas || Math.abs(p - _cliPagina) <= 1)
      .reduce((acc, p, idx, arr) => {
        if (idx > 0 && arr[idx - 1] !== p - 1) acc.push('…');
        acc.push(p);
        return acc;
      }, [])
      .map(p => p === '…'
        ? `<span style="padding:0 4px">…</span>`
        : `<button onclick="cliSetPagina(${p})" class="btn-archivar"
             style="padding:4px 8px;font-size:12px;${p === _cliPagina ? 'background:var(--teal,#0D3B40);color:#fff;border-color:var(--teal)' : ''}">${p}</button>`)
      .join('');
    pag.innerHTML = `<span>${info}</span><div style="display:flex;gap:4px;align-items:center">${prev}${nums}${next}</div>`;
  }
}

// ── Controles públicos de la tabla ───────────────────────────────────
function cliSetSearch(val) {
  _cliSearch = val;
  _cliPagina = 1;
  _renderTablaClientes();
}

function cliToggleFiltro(filtro) {
  if (filtro === 't') _cliFiltroT = !_cliFiltroT;
  if (filtro === 'c') _cliFiltroC = !_cliFiltroC;
  _cliPagina = 1;
  _renderTablaClientes();
}

function cliSetPagina(n) {
  _cliPagina = n;
  _renderTablaClientes();
  // Scroll al inicio de la tabla
  const el = document.getElementById('cli-tabla');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ----------------- Modal crear / editar -----------------
let _clienteEditId = null;

function abrirModalCliente(id = null) {
  _clienteEditId = id || null;
  const c = id ? _clientes.find(x => x.id === id) : null;

  document.getElementById('cliente-modal-titulo').textContent = c ? `Editar: ${c.nombre}` : 'Nuevo cliente';
  document.getElementById('cm-nombre').value    = c?.nombre    || '';
  document.getElementById('cm-email').value     = c?.email     || '';
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
  const inpCorte = document.getElementById('cm-contrato-corte');
  if (selArea)  selArea.value  = c?.contrato_area  || '';
  if (inpHoras) inpHoras.value = c?.contrato_horas_mes != null ? c.contrato_horas_mes : '';
  if (inpCorte) inpCorte.value = c?.fecha_corte_contrato != null ? c.fecha_corte_contrato : '';
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
  const contratoCorte = document.getElementById('cm-contrato-corte')?.value;

  const body = {
    nombre,
    email:              document.getElementById('cm-email')?.value.trim() || null,
    direccion:          document.getElementById('cm-direccion').value.trim() || null,
    lat:                latRaw ? parseFloat(latRaw)  : null,
    lng:                lngRaw ? parseFloat(lngRaw)  : null,
    radio_metros:       parseInt(document.getElementById('cm-radio').value)  || 200,
    plazo_factura_dias: parseInt(document.getElementById('cm-plazo').value)  || 8,
    alegra_id:          document.getElementById('cm-alegra-id').value.trim() || null,
    contrato_area:      contratoArea || null,
    contrato_horas_mes: contratoArea && contratoHoras !== '' ? parseFloat(contratoHoras) || null : null,
    fecha_corte_contrato: contratoArea && contratoCorte !== '' ? (parseInt(contratoCorte, 10) || null) : null,
    valor_transporte:   (() => { const v = document.getElementById('cm-transporte')?.value; return v !== '' && v != null ? parseInt(v) || null : null; })(),
  };

  if (body.lat !== null && isNaN(body.lat)) { alert('Latitud inválida.'); return; }
  if (body.lng !== null && isNaN(body.lng)) { alert('Longitud inválida.'); return; }
  if (body.fecha_corte_contrato !== null && (body.fecha_corte_contrato < 1 || body.fecha_corte_contrato > 31)) {
    alert('El día de corte del contrato debe estar entre 1 y 31.'); return;
  }

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
async function sincronizarClienteAlegra(nombre, alegraId, direccion, email) {
  if (!API_BASE || !nombre) return;
  try {
    // POST: si el cliente no existe lo crea; si ya existe devuelve el existente
    const res  = await fetch(`${API_BASE}/clientes.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, alegra_id: alegraId, direccion: direccion || null, email: email || null }),
    });
    const data = await res.json();
    if (!data.id) return;

    const updates = {};
    if (!data.alegra_id && alegraId)  updates.alegra_id = alegraId;
    if (!data.direccion && direccion) updates.direccion = direccion;

    // Solo buscar email en Alegra si el cliente aún no lo tiene en la BD
    if (!data.email) {
      let emailFinal = email || null;
      if (!emailFinal && alegraId) {
        try {
          const er = await fetch(`${API_BASE}/alegra_contactos.php?id=${encodeURIComponent(alegraId)}`);
          const ed = await er.json();
          if (ed?.email) emailFinal = ed.email;
        } catch (_) {}
      }
      if (emailFinal) updates.email = emailFinal;
    }

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
