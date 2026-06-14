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

  const itemsHtml = f.items.map((it, idx) => `
    <div style="border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
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
      </div>
      <label style="font-size:11px;color:var(--text-muted)">Descripción</label>
      <textarea id="fact-item-${idx}-desc" rows="3" style="width:100%;font-size:13px">${esc(it.description)}</textarea>
    </div>
  `).join('');

  resEl.innerHTML = `
    ${avisoHtml}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      <div style="flex:1;min-width:220px">
        <label style="font-size:11px;color:var(--text-muted)">Cliente</label>
        ${opcionesCliente
          ? `<select id="fact-cliente-id" style="width:100%">${opcionesCliente}</select>`
          : `<input type="text" id="fact-cliente-id" placeholder="ID de cliente en Alegra" style="width:100%">`}
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">En la cotización: "${esc(f.cliente_nombre_cotizacion||'-')}"</div>
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
      <div style="width:100px">
        <label style="font-size:11px;color:var(--text-muted)">CTINN</label>
        <input type="text" value="${esc(f.ctinn||'-')}" disabled style="width:100%">
      </div>
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:12px">
      ℹ️ La fecha de vencimiento se estableció por defecto a 8 días desde hoy. Si deseas cambiarla, edita el campo "Fecha vencimiento".<br>
      ℹ️ La "Fecha ejecución/entrega" se agrega automáticamente a la descripción de cada ítem.
    </div>
    <div style="font-weight:600;font-size:13px;margin-bottom:6px">Ítems de la factura</div>
    ${itemsHtml}
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
      Total cotización (referencia): ${formatCOP(f.totales_cotizacion?.total||0)}
    </div>
    <button class="btn-save" onclick="crearFacturaAlegra()">Crear factura en Alegra</button>
    <div id="fact-crear-status" style="margin-top:10px;font-size:13px"></div>
  `;
}

async function crearFacturaAlegra() {
  const f = facturaActual;
  const statusEl = document.getElementById('fact-crear-status');
  const clienteId = document.getElementById('fact-cliente-id').value.trim();
  const date = document.getElementById('fact-fecha').value;
  const dueDate = document.getElementById('fact-vencimiento').value;
  const ejecucion = document.getElementById('fact-ejecucion').value;

  if (!clienteId) { statusEl.innerHTML = '<span style="color:#ef4444">Falta el ID del cliente en Alegra.</span>'; return; }

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

  if (!confirm('¿Crear esta factura en Alegra? Esta acción no se puede deshacer desde aquí.')) return;

  statusEl.innerHTML = '⏳ Creando factura en Alegra...';
  try {
    const res = await fetch(`${API_BASE}/alegra_crear_factura.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, dueDate, client: { id: Number(clienteId) || clienteId }, items }),
    });
    const data = await res.json();
    if (data.error) {
      const detalle = typeof data.detalle === 'string' ? data.detalle : JSON.stringify(data.detalle);
      statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}${data.status?` (status ${data.status})`:''}${detalle?`<br><span style="font-size:11px">${esc(detalle)}</span>`:''}</span>`;
      return;
    }
    const numeroFactura = data.numberTemplate?.fullNumber || data.id || '';
    statusEl.innerHTML = `✅ Factura creada en Alegra (No. ${esc(numeroFactura)}).`;

    // Si la factura se generó desde una tarea de IT/IF, mover la tarjeta a "Facturado"
    if (f.tareaId) {
      const idx = tasks.findIndex(t=>t.id===f.tareaId);
      if (idx>=0) {
        tasks[idx].estado = 'facturado';
        tasks[idx].factura = String(numeroFactura);
        if (!tasks[idx].realizadoAt) tasks[idx].realizadoAt = new Date().toISOString();
        save();
        statusEl.innerHTML += '<br>✅ La tarea se movió a "Facturado".';
        await syncTask(tasks[idx], false);
        render();
      }
    }
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo conectar con el servidor.</span>';
  }
}
// ===================== FIN FACTURACION =====================
// ===================== FIN FACTURACION =====================

