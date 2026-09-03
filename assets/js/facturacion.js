// ===================== FACTURACION =====================
// Etiquetas de referencia solo para mostrar un nombre legible cuando un ítem
// ya trae un alegra_item_id conocido (p.ej. asignado por el parseo de
// cotización) pero aún no se ha buscado/confirmado su nombre real en Alegra.
// El catálogo completo se trae en vivo desde alegra_items.php (buscarItemFactura).
const ALEGRA_ITEM_LABELS_CONOCIDOS = {
  16: 'IT — Mano de obra',
  12: 'MIT — Mercancía/materiales IT',
  17: 'IF — Mano de obra',
  8:  'MIF — Mercancía/materiales IF',
};
let facturaActual = null; // datos devueltos por alegra_factura_desde_cotizacion.php, editados en el formulario

async function generarFacturaDesdeTarea(id, event) {
  if (event) event.stopPropagation();
  if (!API_BASE) { alert('Esta función requiere conexión al servidor (no disponible en modo local).'); return; }

  setArea('facturacion');
  const statusEl = document.getElementById('fact-status');
  const resEl = document.getElementById('fact-resultado');
  resEl.style.display = 'none';
  resEl.innerHTML = '';
  statusEl.innerHTML = '⏳ Procesando cotización...';

  try {
    const fd = new FormData();
    fd.append('tareaId', id);
    const res = await fetch(`${API_BASE}/alegra_factura_desde_cotizacion.php`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) {
      statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`;
      return;
    }
    statusEl.innerHTML = '✅ Cotización procesada. Revisa los datos antes de crear la factura.';
    facturaActual = data;
    facturaActual.plazoDias = facturaActual.plazoDias || 8;
    renderFacturaForm();
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo conectar con el servidor.</span>';
  }
}

async function procesarCotizacionFile() {
  const input = document.getElementById('fact-file-input');
  const statusEl = document.getElementById('fact-status');
  const resEl = document.getElementById('fact-resultado');
  resEl.style.display = 'none';
  resEl.innerHTML = '';

  if (!input.files || !input.files[0]) {
    statusEl.innerHTML = '<span style="color:#ef4444">Selecciona primero un archivo .docx</span>';
    return;
  }
  if (!API_BASE) {
    statusEl.innerHTML = '<span style="color:#ef4444">Esta función requiere conexión al servidor (no disponible en modo local).</span>';
    return;
  }

  statusEl.innerHTML = '⏳ Procesando cotización...';
  try {
    const fd = new FormData();
    fd.append('file', input.files[0]);
    const res = await fetch(`${API_BASE}/alegra_factura_desde_cotizacion.php`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) {
      statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`;
      return;
    }
    statusEl.innerHTML = '✅ Cotización procesada. Revisa los datos antes de crear la factura.';
    facturaActual = data;
    facturaActual.plazoDias = facturaActual.plazoDias || 8;
    renderFacturaForm();
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo conectar con el servidor.</span>';
  }
}

function renderFacturaForm() {
  const f = facturaActual;
  const resEl = document.getElementById('fact-resultado');
  resEl.style.display = 'block';

  const opcionesCliente = (f.clientes_candidatos||[]).map((c, idx) =>
    `<option value="${c.id}"${idx === 0 ? ' selected' : ''}>${c.match_exacto ? '✓' : '≈'} ${esc(c.name)} (id ${c.id})${c.match_exacto ? '' : ` — sugerencia, ${c.score}% similar`}</option>`).join('');

  const sinMatchExactoHtml = (!f.modoManual && opcionesCliente && !f.hay_match_exacto)
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;border-radius:8px;padding:10px;font-size:12px;margin-bottom:6px">⚠️ Ginno no encontró una coincidencia exacta para "${esc(f.cliente_nombre_cotizacion||'')}" — revisa y confirma el cliente antes de facturar.</div>`
    : '';

  const avisoHtml = f.aviso_cliente
    ? `<div style="background:#fff5f5;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:10px;font-size:12px;margin-bottom:10px">⚠️ ${esc(f.aviso_cliente)}</div>`
    : '';

  const clienteFieldHtml = f.modoManual
    ? `<label style="font-size:11px;color:var(--text-muted)">Cliente (buscar en Alegra)</label>
       <input type="text" id="fact-manual-cliente-q" placeholder="Escribe el nombre del cliente..." autocomplete="off"
         value="${esc(f.clienteManualNombre||'')}" oninput="buscarClienteFacturaManual(this.value)" style="width:100%">
       <div id="fact-manual-cliente-suggestions" style="display:none;background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:8px;margin-top:2px;max-height:180px;overflow:auto"></div>
       <input type="hidden" id="fact-cliente-id" value="${f.clienteManualId||''}">
       <div style="font-size:11px;margin-top:2px;color:${f.clienteManualId ? '#059669' : 'var(--text-muted)'}">${f.clienteManualId ? `✓ Cliente seleccionado (id ${f.clienteManualId})` : 'Escribe al menos 2 letras y elige un cliente de la lista.'}</div>`
    : `<label style="font-size:11px;color:var(--text-muted)">Cliente</label>
       ${sinMatchExactoHtml}
       ${opcionesCliente
          ? `<select id="fact-cliente-id" style="width:100%">${opcionesCliente}</select>`
          : `<input type="text" id="fact-cliente-id" placeholder="ID de cliente en Alegra" style="width:100%">`}
       <div style="font-size:11px;color:var(--text-muted);margin-top:2px">En la cotización: "${esc(f.cliente_nombre_cotizacion||'-')}"</div>`;

  const itemsHtml = f.items.map((it, idx) => `
    <div style="border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:200px;position:relative">
          <label style="font-size:11px;color:var(--text-muted)">Ítem Alegra (buscar)</label>
          <input type="text" id="fact-item-${idx}-q" placeholder="Escribe para buscar el ítem en Alegra..." autocomplete="off"
            value="${esc(it.alegra_item_nombre || ALEGRA_ITEM_LABELS_CONOCIDOS[it.alegra_item_id] || '')}"
            oninput="buscarItemFactura(${idx}, this.value)" style="width:100%">
          <div id="fact-item-${idx}-suggestions" style="display:none;position:absolute;left:0;right:0;z-index:5;background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:8px;margin-top:2px;max-height:180px;overflow:auto"></div>
          <input type="hidden" id="fact-item-${idx}-id" value="${it.alegra_item_id||''}">
          <div style="font-size:11px;margin-top:2px;color:${it.alegra_item_id ? '#059669' : 'var(--text-muted)'}">${it.alegra_item_id ? `✓ Ítem seleccionado (id ${it.alegra_item_id})` : 'Escribe al menos 2 letras y elige un ítem de la lista.'}</div>
        </div>
        <div style="width:90px">
          <label style="font-size:11px;color:var(--text-muted)">Cantidad</label>
          <input type="number" id="fact-item-${idx}-qty" value="${it.quantity}" min="1" step="1" style="width:100%">
        </div>
        <div style="width:130px">
          <label style="font-size:11px;color:var(--text-muted)">Precio (sin IVA)</label>
          <input type="number" id="fact-item-${idx}-price" value="${it.price}" min="0" step="1" style="width:100%">
        </div>
        ${f.modoManual && f.items.length > 1 ? `<button type="button" onclick="quitarItemFacturaManual(${idx})" title="Quitar ítem" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;padding:7px 10px;font-size:12px;cursor:pointer">🗑️</button>` : ''}
      </div>
      <label style="font-size:11px;color:var(--text-muted)">Descripción</label>
      <textarea id="fact-item-${idx}-desc" rows="3" style="width:100%;font-size:13px">${esc(it.description)}</textarea>
    </div>
  `).join('');

  const totalManual = f.items.reduce((s,it)=> s + (Number(it.price)||0)*(Number(it.quantity)||0), 0);

  resEl.innerHTML = `
    ${avisoHtml}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      <div style="flex:1;min-width:220px">
        ${clienteFieldHtml}
      </div>
      <div style="width:160px">
        <label style="font-size:11px;color:var(--text-muted)">Días de plazo factura</label>
        <input type="number" id="fact-plazo-dias" value="${f.plazoDias != null ? f.plazoDias : 8}" min="0" step="1" style="width:100%">
      </div>
      ${f.modoManual ? '' : `<div style="width:100px">
        <label style="font-size:11px;color:var(--text-muted)">CTINN</label>
        <input type="text" value="${esc(f.ctinn||'-')}" disabled style="width:100%">
      </div>`}
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:12px">
      ℹ️ La factura queda fechada en Alegra con el día real en que se cree (al presionar "Crear factura en Alegra", o el día en que se procese desde "Facturas pendientes" si se deja lista para después).<br>
      ℹ️ El vencimiento se calcula sumando los "días de plazo" a esa fecha de creación.
    </div>
    <div style="font-weight:600;font-size:13px;margin-bottom:6px">Ítems de la factura</div>
    ${itemsHtml}
    ${f.modoManual ? `<button type="button" class="btn-cancel" onclick="agregarItemFacturaManual()" style="margin-bottom:12px">+ Agregar ítem</button>` : ''}
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
      ${f.modoManual ? 'Total (referencia inicial)' : 'Total cotización (referencia)'}: ${formatCOP(f.modoManual ? totalManual : (f.totales_cotizacion?.total||0))}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-save" onclick="crearFacturaAlegra()">Crear factura en Alegra</button>
      <button class="btn-cancel" onclick="dejarFacturaPendiente()" title="Deja todo listo sin crearla en Alegra todavía — útil cuando se alcanzó el límite mensual de facturación">📥 Dejar lista para después</button>
    </div>
    <div id="fact-crear-status" style="margin-top:10px;font-size:13px"></div>
  `;
}

// ----------------- Factura manual (sin cotización) -----------------

function iniciarFacturaManual() {
  facturaActual = {
    modoManual: true,
    tareaId: null,
    ctinn: null,
    cliente_nombre_cotizacion: '',
    clientes_candidatos: [],
    aviso_cliente: null,
    clienteManualId: null,
    clienteManualNombre: '',
    plazoDias: 8,
    items: [{ alegra_item_id: null, alegra_item_nombre: '', description: '', quantity: 1, price: 0 }],
    totales_cotizacion: null,
  };
  const statusEl = document.getElementById('fact-status');
  if (statusEl) statusEl.innerHTML = '';
  renderFacturaForm();
  document.getElementById('fact-resultado')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Antes de mutar/re-renderizar el formulario (agregar/quitar ítem, elegir
// cliente), captura en facturaActual lo que el usuario ya haya escrito, para
// no perder ediciones en curso al reconstruir el HTML.
function _sincronizarFormularioFacturaDesdeDOM() {
  const f = facturaActual;
  if (!f) return;
  const elPlazo = document.getElementById('fact-plazo-dias');
  if (elPlazo && elPlazo.value !== '') f.plazoDias = Number(elPlazo.value) || 0;
  if (Array.isArray(f.items)) {
    f.items.forEach((it, idx) => {
      const elId = document.getElementById(`fact-item-${idx}-id`);
      const elQ = document.getElementById(`fact-item-${idx}-q`);
      const elQty = document.getElementById(`fact-item-${idx}-qty`);
      const elPrice = document.getElementById(`fact-item-${idx}-price`);
      const elDesc = document.getElementById(`fact-item-${idx}-desc`);
      if (elId && elId.value) it.alegra_item_id = Number(elId.value);
      if (elQ) it.alegra_item_nombre = elQ.value;
      if (elQty) it.quantity = Number(elQty.value) || 1;
      if (elPrice) it.price = Number(elPrice.value) || 0;
      if (elDesc) it.description = elDesc.value;
    });
  }
}

function agregarItemFacturaManual() {
  _sincronizarFormularioFacturaDesdeDOM();
  facturaActual.items.push({ alegra_item_id: null, alegra_item_nombre: '', description: '', quantity: 1, price: 0 });
  renderFacturaForm();
}

function quitarItemFacturaManual(idx) {
  if (facturaActual.items.length <= 1) return;
  _sincronizarFormularioFacturaDesdeDOM();
  facturaActual.items.splice(idx, 1);
  renderFacturaForm();
}

let _clienteManualBusqueda = [];
let _clienteManualTimer = null;
function buscarClienteFacturaManual(q) {
  facturaActual.clienteManualNombre = q;
  facturaActual.clienteManualId = null; // se invalida hasta que elija uno de la lista
  clearTimeout(_clienteManualTimer);
  const box = document.getElementById('fact-manual-cliente-suggestions');
  if (!q || q.trim().length < 2) { if (box) box.style.display = 'none'; return; }
  if (!API_BASE) return;
  _clienteManualTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/alegra_contactos.php?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      _clienteManualBusqueda = Array.isArray(data) ? data : [];
      if (!box) return;
      box.innerHTML = _clienteManualBusqueda.length
        ? _clienteManualBusqueda.map((c,i) => `<div onmousedown="seleccionarClienteFacturaManual(${i})" style="padding:8px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border,#e5e7eb)">${esc(c.name)}</div>`).join('')
        : '<div style="padding:8px;font-size:12px;color:var(--text-muted)">Sin coincidencias en Alegra</div>';
      box.style.display = 'block';
    } catch (e) { console.error(e); }
  }, 300);
}

function seleccionarClienteFacturaManual(idx) {
  const c = _clienteManualBusqueda[idx];
  if (!c) return;
  _sincronizarFormularioFacturaDesdeDOM();
  facturaActual.clienteManualId = c.id;
  facturaActual.clienteManualNombre = c.name;
  facturaActual.cliente_nombre_cotizacion = c.name;
  renderFacturaForm();
}

// ----------------- Búsqueda de ítems en el catálogo real de Alegra -----------------
// Mismo patrón que la búsqueda de cliente, pero un buscador por cada línea de
// ítem (indexado por idx), porque una factura puede tener varias líneas.
let _itemBusqueda = {}; // idx -> resultados de la última búsqueda
let _itemBusquedaTimer = {}; // idx -> timer del debounce

function buscarItemFactura(idx, q) {
  const f = facturaActual;
  if (!f || !f.items[idx]) return;
  f.items[idx].alegra_item_nombre = q;
  f.items[idx].alegra_item_id = null; // se invalida hasta que elija uno de la lista
  const hidden = document.getElementById(`fact-item-${idx}-id`);
  if (hidden) hidden.value = '';
  clearTimeout(_itemBusquedaTimer[idx]);
  const box = document.getElementById(`fact-item-${idx}-suggestions`);
  if (!q || q.trim().length < 2) { if (box) box.style.display = 'none'; return; }
  if (!API_BASE) return;
  _itemBusquedaTimer[idx] = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/alegra_items.php?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      _itemBusqueda[idx] = Array.isArray(data) ? data : [];
      if (!box) return;
      box.innerHTML = _itemBusqueda[idx].length
        ? _itemBusqueda[idx].map((it,i) => `<div onmousedown="seleccionarItemFactura(${idx}, ${i})" style="padding:8px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border,#e5e7eb)">${esc(it.name)}${it.reference?` <span style="color:var(--text-muted)">(${esc(it.reference)})</span>`:''}</div>`).join('')
        : '<div style="padding:8px;font-size:12px;color:var(--text-muted)">Sin coincidencias en Alegra</div>';
      box.style.display = 'block';
    } catch (e) { console.error(e); }
  }, 300);
}

function seleccionarItemFactura(idx, i) {
  const c = (_itemBusqueda[idx]||[])[i];
  if (!c) return;
  _sincronizarFormularioFacturaDesdeDOM();
  const it = facturaActual.items[idx];
  it.alegra_item_id = c.id;
  it.alegra_item_nombre = c.name;
  if ((!it.price || Number(it.price) === 0) && c.price != null) it.price = c.price;
  renderFacturaForm();
}

// Recolecta del formulario el mismo payload que se le manda a Alegra, tanto
// para crear de inmediato como para dejarla guardada como pendiente.
// Devuelve null (y muestra el error en fact-crear-status) si falta algo.
function _recolectarPayloadFactura() {
  const f = facturaActual;
  const statusEl = document.getElementById('fact-crear-status');
  const clienteId = document.getElementById('fact-cliente-id').value.trim();
  const plazoDiasRaw = document.getElementById('fact-plazo-dias').value;
  const plazoDias = plazoDiasRaw === '' ? 8 : Math.max(0, Number(plazoDiasRaw) || 0);

  if (!clienteId) {
    statusEl.innerHTML = f.modoManual
      ? '<span style="color:#ef4444">Busca y selecciona el cliente en la lista de Alegra antes de continuar.</span>'
      : '<span style="color:#ef4444">Falta el ID del cliente en Alegra.</span>';
    return null;
  }

  const items = [];
  for (let idx = 0; idx < f.items.length; idx++) {
    const idVal = document.getElementById(`fact-item-${idx}-id`).value;
    if (!idVal) {
      statusEl.innerHTML = `<span style="color:#ef4444">Busca y selecciona el ítem de Alegra para la línea ${idx+1} antes de continuar.</span>`;
      return null;
    }
    items.push({
      id: Number(idVal),
      description: document.getElementById(`fact-item-${idx}-desc`).value,
      quantity: Number(document.getElementById(`fact-item-${idx}-qty`).value) || 1,
      price: Number(document.getElementById(`fact-item-${idx}-price`).value) || 0,
      tax: [{ id: 5 }],
    });
  }

  const clienteNombreSel = document.getElementById('fact-cliente-id').selectedOptions
    ? (document.getElementById('fact-cliente-id').selectedOptions[0]?.textContent || '')
    : '';

  return {
    plazoDias, client: { id: Number(clienteId) || clienteId }, items,
    clienteNombre: clienteNombreSel || f.cliente_nombre_cotizacion || '',
    tareaId: f.tareaId || null,
  };
}

async function crearFacturaAlegra() {
  const statusEl = document.getElementById('fact-crear-status');
  const payload = _recolectarPayloadFactura();
  if (!payload) return;

  if (!confirm('¿Crear esta factura en Alegra? Esta acción no se puede deshacer desde aquí.')) return;

  statusEl.innerHTML = '⏳ Creando factura en Alegra...';
  try {
    const res = await fetch(`${API_BASE}/alegra_crear_factura.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) {
      const detalle = typeof data.detalle === 'string' ? data.detalle : JSON.stringify(data.detalle);
      statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}${data.status?` (status ${data.status})`:''}${detalle?`<br><span style="font-size:11px">${esc(detalle)}</span>`:''}</span>`;
      return;
    }
    const numeroFactura = data.numberTemplate?.fullNumber || data.id || '';
    let mensaje = `✅ Factura No. ${numeroFactura} creada en Alegra.`;
    if (_moverTareaAFacturado(payload.tareaId, numeroFactura)) {
      mensaje += '\nLa tarea se movió a "Facturado".';
    }
    // Aviso claro e imposible de pasar por alto (antes solo se escribía un
    // texto pequeño al fondo del formulario y todo quedaba igual en
    // pantalla, dando la impresión de que no había pasado nada).
    alert(mensaje);
    // Factura ya creada: limpiar el formulario para seguir trabajando en el
    // módulo — no tiene sentido dejar los mismos datos en pantalla.
    facturaActual = null;
    const resEl = document.getElementById('fact-resultado');
    if (resEl) { resEl.style.display = 'none'; resEl.innerHTML = ''; }
    const statusTop = document.getElementById('fact-status');
    if (statusTop) {
      statusTop.innerHTML = mensaje.replace('\n', '<br>');
      statusTop.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo conectar con el servidor.</span>';
  }
}

// Si la factura se generó/creó desde una tarea de IT/IF, mover la tarjeta a
// "Facturado". Devuelve true si movió una tarea, false si no había tareaId.
function _moverTareaAFacturado(tareaId, numeroFactura) {
  if (!tareaId) return false;
  const idx = tasks.findIndex(t=>t.id===tareaId);
  if (idx>=0) {
    tasks[idx].estado = 'facturado';
    tasks[idx].factura = String(numeroFactura);
    if (!tasks[idx].realizadoAt) tasks[idx].realizadoAt = new Date().toISOString();
    save();
    syncTask(tasks[idx], false).then(() => render());
    return true;
  }
  return false;
}

// ----------------- Facturas pendientes (límite mensual de Alegra agotado) -----------------
let _facturasPendientesData = [];

async function dejarFacturaPendiente() {
  const statusEl = document.getElementById('fact-crear-status');
  const payload = _recolectarPayloadFactura();
  if (!payload) return;

  statusEl.innerHTML = '⏳ Guardando como pendiente...';
  try {
    const res = await fetch(`${API_BASE}/facturas_pendientes.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`; return; }
    statusEl.innerHTML = '✅ Factura guardada como pendiente. Cuando se resetee el límite de Alegra, créala desde "📋 Facturas pendientes" más abajo.';
    facturaActual = null;
    document.getElementById('fact-resultado').style.display = 'none';
    cargarFacturasPendientes();
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo conectar con el servidor.</span>';
  }
}

async function cargarFacturasPendientes() {
  const el = document.getElementById('fact-pendientes-section');
  if (!el || !API_BASE) return;
  try {
    const res = await fetch(`${API_BASE}/facturas_pendientes.php`);
    const data = await res.json();
    _facturasPendientesData = Array.isArray(data) ? data : [];
  } catch (e) { console.error(e); _facturasPendientesData = []; }
  renderFacturasPendientesList();
}

function renderFacturasPendientesList() {
  const el = document.getElementById('fact-pendientes-section');
  if (!el) return;
  const pendientes = _facturasPendientesData.filter(f => f.estado === 'pendiente');
  const creadas = _facturasPendientesData.filter(f => f.estado === 'creada');

  const filaPendiente = f => {
    const totalTxt = f.total_estimado != null ? formatCOP(f.total_estimado) : '-';
    const nItems = (f.items_resumen || []).length;
    const errorHtml = f.error_ultimo
      ? `<div style="font-size:11px;color:#dc2626;margin-top:4px">⚠️ Último intento falló: ${esc(f.error_ultimo)}</div>`
      : '';
    return `<div style="border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <span style="font-weight:600;font-size:13px">${esc(f.cliente_nombre || 'Cliente sin nombre')}</span>
          <span style="font-size:12px;color:var(--text-muted);margin-left:6px">${nItems} ítem${nItems===1?'':'s'} · ${totalTxt} · plazo ${esc(f.payload?.plazoDias ?? 8)} días</span>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="crearFacturaPendienteAhora(${f.id})" style="background:#169BBC;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer">✅ Crear ahora</button>
          <button onclick="cancelarFacturaPendiente(${f.id})" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer">🗑️ Cancelar</button>
        </div>
      </div>
      ${errorHtml}
    </div>`;
  };

  const filaCreada = f => `<div style="padding:6px 12px;font-size:12px;color:var(--text-muted)">
    ✅ ${esc(f.cliente_nombre || '-')} — factura No. ${esc(f.numero_factura || '-')} (creada ${esc((f.creada_en||'').substring(0,16).replace('T',' '))})
  </div>`;

  el.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);margin-top:18px;max-width:760px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px">
      <div style="font-weight:700;font-size:15px;color:var(--teal,#0D3B40)">📋 Facturas pendientes por crear (${pendientes.length})</div>
      ${pendientes.length ? `<button class="btn-save" style="font-size:12px;padding:6px 12px" onclick="crearTodasFacturasPendientes()">✅ Crear todas las pendientes</button>` : ''}
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Facturas dejadas listas mientras el límite mensual de Alegra estaba agotado.</div>
    ${pendientes.map(filaPendiente).join('') || '<div style="font-size:13px;color:var(--text-muted)">No hay ninguna pendiente ahora mismo.</div>'}
    ${creadas.length ? `<div style="font-weight:600;font-size:12px;color:var(--text-muted);margin:14px 0 6px">Creadas recientemente desde esta cola</div>${creadas.map(filaCreada).join('')}` : ''}
    <div id="fact-pendientes-status" style="margin-top:10px;font-size:13px"></div>
  </div>`;
}

async function crearFacturaPendienteAhora(id) {
  const statusEl = document.getElementById('fact-pendientes-status');
  if (!confirm('¿Crear esta factura en Alegra ahora? Esta acción no se puede deshacer desde aquí.')) return;
  if (statusEl) statusEl.innerHTML = '⏳ Creando en Alegra...';
  try {
    const res = await fetch(`${API_BASE}/facturas_pendientes.php?id=${id}&accion=crear`, { method: 'PUT' });
    const data = await res.json();
    if (data.error) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`;
      cargarFacturasPendientes();
      return;
    }
    let msgPend = `✅ Factura creada en Alegra (No. ${esc(data.numeroFactura || '')}).`;
    if (_moverTareaAFacturado(data.tareaId, data.numeroFactura)) msgPend += '<br>✅ La tarea se movió a "Facturado".';
    if (statusEl) statusEl.innerHTML = msgPend;
    cargarFacturasPendientes();
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo conectar con el servidor.</span>';
  }
}

async function crearTodasFacturasPendientes() {
  const statusEl = document.getElementById('fact-pendientes-status');
  const n = _facturasPendientesData.filter(f => f.estado === 'pendiente').length;
  if (!confirm(`¿Crear las ${n} facturas pendientes en Alegra ahora? Esta acción no se puede deshacer desde aquí.`)) return;
  if (statusEl) statusEl.innerHTML = '⏳ Creando facturas en Alegra, esto puede tardar un momento...';
  try {
    const res = await fetch(`${API_BASE}/facturas_pendientes.php?accion=crear_todas`, { method: 'PUT' });
    const data = await res.json();
    if (data.error) { if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`; return; }
    (data.creadas || []).forEach(c => _moverTareaAFacturado(c.tareaId, c.numeroFactura));
    let msg = `✅ ${data.creadas.length} factura${data.creadas.length===1?'':'s'} creada${data.creadas.length===1?'':'s'} en Alegra.`;
    if (data.fallidas && data.fallidas.length) {
      msg += `<br><span style="color:#dc2626">⚠️ ${data.fallidas.length} fallaron — revisa el detalle en cada tarjeta.</span>`;
    }
    if (statusEl) statusEl.innerHTML = msg;
    cargarFacturasPendientes();
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo conectar con el servidor.</span>';
  }
}

async function cancelarFacturaPendiente(id) {
  if (!confirm('¿Cancelar esta factura pendiente? No se creará en Alegra.')) return;
  try {
    const res = await fetch(`${API_BASE}/facturas_pendientes.php?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    cargarFacturasPendientes();
  } catch (e) {
    console.error(e);
    alert('No se pudo cancelar.');
  }
}
// ===================== FIN FACTURACION =====================
// ===================== FIN FACTURACION =====================

