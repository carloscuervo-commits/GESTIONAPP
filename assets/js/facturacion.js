// ===================== FACTURACION =====================
const ALEGRA_ITEM_OPCIONES = [
  { id: 16, label: 'IT — Mano de obra (id 16)' },
  { id: 12, label: 'MIT — Mercancía/materiales IT (id 12)' },
  { id: 17, label: 'IF — Mano de obra (id 17)' },
  { id: 8,  label: 'MIF — Mercancía/materiales IF (id 8)' },
];
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

  const opcionesCliente = (f.clientes_candidatos||[]).map(c =>
    `<option value="${c.id}">${esc(c.name)} (id ${c.id})</option>`).join('');

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
       ${opcionesCliente
          ? `<select id="fact-cliente-id" style="width:100%">${opcionesCliente}</select>`
          : `<input type="text" id="fact-cliente-id" placeholder="ID de cliente en Alegra" style="width:100%">`}
       <div style="font-size:11px;color:var(--text-muted);margin-top:2px">En la cotización: "${esc(f.cliente_nombre_cotizacion||'-')}"</div>`;

  const itemsHtml = f.items.map((it, idx) => `
    <div style="border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:160px">
          <label style="font-size:11px;color:var(--text-muted)">Ítem Alegra</label>
          <select id="fact-item-${idx}-id" style="width:100%">
            ${ALEGRA_ITEM_OPCIONES.map(o=>`<option value="${o.id}" ${o.id===it.alegra_item_id?'selected':''}>${o.label}</option>`).join('')}
          </select>
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
      <div style="width:140px">
        <label style="font-size:11px;color:var(--text-muted)">Fecha factura</label>
        <input type="date" id="fact-fecha" value="${f.date}" style="width:100%">
      </div>
      <div style="width:140px">
        <label style="font-size:11px;color:var(--text-muted)">Fecha vencimiento</label>
        <input type="date" id="fact-vencimiento" value="${f.dueDate}" style="width:100%">
      </div>
      <div style="width:140px">
        <label style="font-size:11px;color:var(--text-muted)">Fecha ejecución/entrega</label>
        <input type="date" id="fact-ejecucion" value="${f.date}" style="width:100%">
      </div>
      ${f.modoManual ? '' : `<div style="width:100px">
        <label style="font-size:11px;color:var(--text-muted)">CTINN</label>
        <input type="text" value="${esc(f.ctinn||'-')}" disabled style="width:100%">
      </div>`}
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:12px">
      ℹ️ La fecha de vencimiento se estableció por defecto a 8 días desde hoy. Si deseas cambiarla, edita el campo "Fecha vencimiento".<br>
      ℹ️ La "Fecha ejecución/entrega" se agrega automáticamente a la descripción de cada ítem.
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
  const hoy = new Date();
  const venc = new Date(Date.now() + 8*24*60*60*1000);
  facturaActual = {
    modoManual: true,
    tareaId: null,
    ctinn: null,
    cliente_nombre_cotizacion: '',
    clientes_candidatos: [],
    aviso_cliente: null,
    clienteManualId: null,
    clienteManualNombre: '',
    date: hoy.toISOString().split('T')[0],
    dueDate: venc.toISOString().split('T')[0],
    items: [{ alegra_item_id: ALEGRA_ITEM_OPCIONES[0].id, description: '', quantity: 1, price: 0 }],
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
  const elFecha = document.getElementById('fact-fecha');
  const elVenc = document.getElementById('fact-vencimiento');
  if (elFecha && elFecha.value) f.date = elFecha.value;
  if (elVenc && elVenc.value) f.dueDate = elVenc.value;
  if (Array.isArray(f.items)) {
    f.items.forEach((it, idx) => {
      const elId = document.getElementById(`fact-item-${idx}-id`);
      const elQty = document.getElementById(`fact-item-${idx}-qty`);
      const elPrice = document.getElementById(`fact-item-${idx}-price`);
      const elDesc = document.getElementById(`fact-item-${idx}-desc`);
      if (elId) it.alegra_item_id = Number(elId.value);
      if (elQty) it.quantity = Number(elQty.value) || 1;
      if (elPrice) it.price = Number(elPrice.value) || 0;
      if (elDesc) it.description = elDesc.value;
    });
  }
}

function agregarItemFacturaManual() {
  _sincronizarFormularioFacturaDesdeDOM();
  facturaActual.items.push({ alegra_item_id: ALEGRA_ITEM_OPCIONES[0].id, description: '', quantity: 1, price: 0 });
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

// Recolecta del formulario el mismo payload que se le manda a Alegra, tanto
// para crear de inmediato como para dejarla guardada como pendiente.
// Devuelve null (y muestra el error en fact-crear-status) si falta algo.
function _recolectarPayloadFactura() {
  const f = facturaActual;
  const statusEl = document.getElementById('fact-crear-status');
  const clienteId = document.getElementById('fact-cliente-id').value.trim();
  const date = document.getElementById('fact-fecha').value;
  const dueDate = document.getElementById('fact-vencimiento').value;
  const ejecucion = document.getElementById('fact-ejecucion').value;

  if (!clienteId) {
    statusEl.innerHTML = f.modoManual
      ? '<span style="color:#ef4444">Busca y selecciona el cliente en la lista de Alegra antes de continuar.</span>'
      : '<span style="color:#ef4444">Falta el ID del cliente en Alegra.</span>';
    return null;
  }

  let ejecucionTexto = '';
  if (ejecucion) {
    const [y, m, d] = ejecucion.split('-');
    ejecucionTexto = ` - Fecha de ejecución/entrega: ${d}/${m}/${y}`;
  }

  const items = f.items.map((it, idx) => ({
    id: Number(document.getElementById(`fact-item-${idx}-id`).value),
    description: document.getElementById(`fact-item-${idx}-desc`).value + ejecucionTexto,
    quantity: Number(document.getElementById(`fact-item-${idx}-qty`).value) || 1,
    price: Number(document.getElementById(`fact-item-${idx}-price`).value) || 0,
    tax: [{ id: 5 }],
  }));

  const clienteNombreSel = document.getElementById('fact-cliente-id').selectedOptions
    ? (document.getElementById('fact-cliente-id').selectedOptions[0]?.textContent || '')
    : '';

  return {
    date, dueDate, client: { id: Number(clienteId) || clienteId }, items,
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
    statusEl.innerHTML = `✅ Factura creada en Alegra (No. ${esc(numeroFactura)}).`;
    _moverTareaAFacturado(payload.tareaId, numeroFactura, statusEl);
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo conectar con el servidor.</span>';
  }
}

// Si la factura se generó/creó desde una tarea de IT/IF, mover la tarjeta a "Facturado"
function _moverTareaAFacturado(tareaId, numeroFactura, statusEl) {
  if (!tareaId) return;
  const idx = tasks.findIndex(t=>t.id===tareaId);
  if (idx>=0) {
    tasks[idx].estado = 'facturado';
    tasks[idx].factura = String(numeroFactura);
    if (!tasks[idx].realizadoAt) tasks[idx].realizadoAt = new Date().toISOString();
    save();
    if (statusEl) statusEl.innerHTML += '<br>✅ La tarea se movió a "Facturado".';
    syncTask(tasks[idx], false).then(() => render());
  }
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
          <span style="font-size:12px;color:var(--text-muted);margin-left:6px">${nItems} ítem${nItems===1?'':'s'} · ${totalTxt} · ${esc(f.payload?.date || '')}</span>
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
    if (statusEl) statusEl.innerHTML = `✅ Factura creada en Alegra (No. ${esc(data.numeroFactura || '')}).`;
    _moverTareaAFacturado(data.tareaId, data.numeroFactura, statusEl);
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
    (data.creadas || []).forEach(c => _moverTareaAFacturado(c.tareaId, c.numeroFactura, null));
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

