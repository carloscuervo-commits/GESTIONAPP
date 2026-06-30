// ===================== MÓDULO TRANSPORTES =====================
// Gestión de pagos de transporte a técnicos por visitas en sitio.
// - Popup de aviso al facturar/archivar una tarea operativa en sitio.
// - Vista de administrador con filtros, tabla por técnico y acciones.

// ─── Popup de aviso al cerrar tarjeta ────────────────────────────────────────

// Llamado desde tareas.js después de saveTask() o _ejecutarArchivar()
// cuando la tarea es IT/IF + modalidad en_sitio + facturada/archivada.
async function _transportesCheckTarea(taskId) {
  if (!API_BASE || !taskId) return;
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  if (!['it','if'].includes(t.area)) return;
  if (!['facturado','archivado'].includes(t.estado)) return;

  // Si no fue en sitio → marcar no_aplica y salir
  if (t.modalidad !== 'en_sitio') {
    _transpMarcarNoAplica(taskId);
    return;
  }
  if (!t.cliente) return;

  try {
    const res = await fetch(`${API_BASE}/clientes.php?nombre=${encodeURIComponent(t.cliente)}`);
    if (!res.ok) return;
    const cliente = await res.json();
    // Si el cliente no tiene valor de transporte → marcar no_aplica
    if (!cliente || !cliente.valor_transporte || cliente.valor_transporte <= 0) {
      _transpMarcarNoAplica(taskId);
      return;
    }
    _transportesMostrarPopup(taskId, t.cliente, cliente.valor_transporte);
  } catch (e) {
    console.error('[Transportes] Error verificando cliente:', e);
  }
}

async function _transpMarcarNoAplica(tareaId) {
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}/transportes.php?marcar_no_aplica=1`, {
      method : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ tarea_id: tareaId }),
    });
  } catch (e) {
    console.error('[Transportes] Error marcando no_aplica:', e);
  }
}

function _transportesMostrarPopup(tareaId, clienteNombre, valor) {
  const prev = document.getElementById('transportes-popup');
  if (prev) prev.remove();

  const popup = document.createElement('div');
  popup.id = 'transportes-popup';
  popup.style.cssText = [
    'position:fixed;inset:0;z-index:820',
    'display:flex;align-items:center;justify-content:center',
    'background:rgba(0,0,0,.45)',
  ].join(';');

  popup.innerHTML = `
    <div style="background:var(--card-bg,#fff);border-radius:14px;padding:28px 30px;
                max-width:420px;width:calc(100% - 32px);box-shadow:0 16px 48px rgba(0,0,0,.28)">
      <div style="font-size:36px;text-align:center;margin-bottom:10px">🚗</div>
      <div style="font-weight:700;font-size:17px;text-align:center;margin-bottom:8px;
                  color:var(--text)">Transporte por registrar</div>
      <div style="font-size:14px;color:var(--text-muted);text-align:center;
                  margin-bottom:22px;line-height:1.6">
        El cliente <strong>${esc(clienteNombre)}</strong> tiene un valor de transporte de
        <strong>$${valor.toLocaleString('es-CO')}</strong> por trayecto.<br>
        Se crearán registros en el reporte de transportes por pagar
        para cada visita realizada.
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button
          onclick="_transportesRegistrar('${tareaId}', document.getElementById('transportes-popup'))"
          style="padding:10px 24px;border-radius:8px;border:none;cursor:pointer;
                 background:#169BBC;color:#fff;font-weight:700;font-size:14px">
          ✅ Registrar
        </button>
        <button onclick="document.getElementById('transportes-popup').remove()"
          style="padding:10px 18px;border-radius:8px;border:1px solid var(--border);
                 cursor:pointer;background:none;color:var(--text-muted);font-size:14px">
          Ahora no
        </button>
      </div>
    </div>`;

  document.body.appendChild(popup);
}

async function _transportesRegistrar(tareaId, popup) {
  if (popup) popup.remove();
  if (!API_BASE) return;
  try {
    const res  = await fetch(`${API_BASE}/transportes.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tarea_id: tareaId }),
    });
    const data = await res.json();
    if (data.error) { alert('Error al registrar transportes: ' + data.error); return; }
    if (data.created > 0) {
      _transportesToast(`🚗 ${data.created} registro${data.created > 1 ? 's' : ''} de transporte creado${data.created > 1 ? 's' : ''}`);
    }
  } catch (e) {
    console.error('[Transportes] Error al registrar:', e);
  }
}

function _transportesToast(msg) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);z-index:900',
    'background:#0D3B40;color:#fff;padding:10px 22px;border-radius:10px',
    'font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,.3);pointer-events:none',
  ].join(';');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Vista de administrador ───────────────────────────────────────────────────

let _transpFiltros = {
  tecnico_id : '',
  desde      : _transpFechaOffset(-30),
  hasta      : _transpFechaOffset(0),
  estado     : 'pendiente',
};
let _transpData = [];

function _transpFechaOffset(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

function iniciarTransportes() {
  renderTransportesView();
}

function renderTransportesView() {
  const el = document.getElementById('transportes-view');
  if (!el) return;

  const tecnicoOpts = (TEAM || [])
    .map(m => `<option value="${m.id}" ${_transpFiltros.tecnico_id == m.id ? 'selected' : ''}>${esc(m.name)}</option>`)
    .join('');

  el.innerHTML = `
    <div style="max-width:960px;margin:0 auto">
      <h2 style="font-size:18px;font-weight:700;margin-bottom:18px;color:var(--text)">
        🚗 Transportes por pagar
      </h2>

      <!-- Filtros -->
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px;align-items:flex-end">
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Técnico</label>
          <select id="tr-f-tecnico" class="form-input" style="min-width:160px" onchange="_transpCargar()">
            <option value="">Todos</option>
            ${tecnicoOpts}
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Desde</label>
          <input type="date" id="tr-f-desde" class="form-input" value="${_transpFiltros.desde}" onchange="_transpCargar()">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Hasta</label>
          <input type="date" id="tr-f-hasta" class="form-input" value="${_transpFiltros.hasta}" onchange="_transpCargar()">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Vista</label>
          <div style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden">
            <button id="tr-btn-pend" onclick="_transpCambiarVista('pendiente')"
              style="padding:7px 16px;border:none;cursor:pointer;font-size:13px;transition:all .15s;
                     ${_transpFiltros.estado==='pendiente' ? 'background:#169BBC;color:#fff;font-weight:600' : 'background:none;color:var(--text-muted)'}">
              Pendientes
            </button>
            <button id="tr-btn-arch" onclick="_transpCambiarVista('archivado')"
              style="padding:7px 16px;border:none;cursor:pointer;font-size:13px;transition:all .15s;
                     ${_transpFiltros.estado==='archivado' ? 'background:#169BBC;color:#fff;font-weight:600' : 'background:none;color:var(--text-muted)'}">
              Archivados
            </button>
          </div>
        </div>
      </div>

      <!-- Contenido dinámico -->
      <div id="tr-contenido">
        <div style="text-align:center;padding:50px;color:var(--text-muted)">Cargando…</div>
      </div>
    </div>`;

  _transpCargar();
}

async function _transpCargar() {
  const el = document.getElementById('tr-contenido');
  if (!el || !API_BASE) return;

  // Leer valores actuales de los filtros
  _transpFiltros.tecnico_id = document.getElementById('tr-f-tecnico')?.value || '';
  _transpFiltros.desde      = document.getElementById('tr-f-desde')?.value  || '';
  _transpFiltros.hasta      = document.getElementById('tr-f-hasta')?.value  || '';

  let url = `${API_BASE}/transportes.php?estado=${_transpFiltros.estado}`;
  if (_transpFiltros.tecnico_id) url += `&tecnico_id=${encodeURIComponent(_transpFiltros.tecnico_id)}`;
  if (_transpFiltros.desde)      url += `&desde=${_transpFiltros.desde}`;
  if (_transpFiltros.hasta)      url += `&hasta=${_transpFiltros.hasta}`;

  el.innerHTML = `<div style="text-align:center;padding:50px;color:var(--text-muted)">Cargando…</div>`;
  try {
    const res  = await fetch(url);
    _transpData = await res.json();
    _transpRender(el);
  } catch (e) {
    el.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center">Error al cargar datos</div>`;
  }
}

function _transpCambiarVista(estado) {
  _transpFiltros.estado = estado;
  const btnP = document.getElementById('tr-btn-pend');
  const btnA = document.getElementById('tr-btn-arch');
  if (btnP) { btnP.style.background = estado === 'pendiente' ? '#169BBC' : 'none'; btnP.style.color = estado === 'pendiente' ? '#fff' : 'var(--text-muted)'; btnP.style.fontWeight = estado === 'pendiente' ? '600' : '400'; }
  if (btnA) { btnA.style.background = estado === 'archivado'  ? '#169BBC' : 'none'; btnA.style.color = estado === 'archivado'  ? '#fff' : 'var(--text-muted)'; btnA.style.fontWeight = estado === 'archivado'  ? '600' : '400'; }
  _transpCargar();
}

function _transpRender(el) {
  if (!_transpData || !_transpData.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);font-size:15px">
      ${_transpFiltros.estado === 'pendiente'
        ? '✅ No hay transportes pendientes en este período'
        : '📭 No hay registros archivados en este período'}
    </div>`;
    return;
  }

  const esPendiente = _transpFiltros.estado === 'pendiente';

  // Agrupar por técnico
  const porTecnico = {};
  for (const r of _transpData) {
    const key = r.tecnico_id;
    if (!porTecnico[key]) {
      porTecnico[key] = {
        nombre   : r.tecnico_nombre || `Técnico #${key}`,
        registros: [],
        total    : 0,
      };
    }
    porTecnico[key].registros.push(r);
    porTecnico[key].total += r.valor;
  }

  const totalGeneral = _transpData.reduce((s, r) => s + r.valor, 0);

  let html = '';

  // Resumen total (solo pendientes)
  if (esPendiente) {
    html += `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;
                  padding:14px 22px;margin-bottom:22px;
                  display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:14px;color:#166534;font-weight:600">Total pendiente por pagar</span>
        <span style="font-size:24px;font-weight:800;color:#15803d">
          $${totalGeneral.toLocaleString('es-CO')}
        </span>
      </div>`;
  }

  // Un bloque por técnico
  for (const grp of Object.values(porTecnico)) {
    html += `
      <div style="background:var(--card-bg,#fff);border:1px solid var(--border);
                  border-radius:12px;margin-bottom:18px;overflow:hidden">

        <!-- Encabezado técnico -->
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:13px 20px;background:var(--bg,#f8fafc);
                    border-bottom:1px solid var(--border)">
          <span style="font-weight:700;font-size:15px;color:var(--text)">
            👤 ${esc(grp.nombre)}
          </span>
          <span style="font-weight:700;font-size:16px;color:#169BBC">
            $${grp.total.toLocaleString('es-CO')}
          </span>
        </div>

        <!-- Tabla de visitas -->
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="color:var(--text-muted);font-size:12px">
                <th style="padding:9px 16px;text-align:left;font-weight:600;white-space:nowrap">Fecha</th>
                <th style="padding:9px 16px;text-align:left;font-weight:600">Cliente · Tarea</th>
                <th style="padding:9px 16px;text-align:left;font-weight:600;white-space:nowrap">Check-in / Check-out</th>
                <th style="padding:9px 16px;text-align:left;font-weight:600;white-space:nowrap">Duración</th>
                <th style="padding:9px 16px;text-align:right;font-weight:600">Valor</th>
                <th style="padding:9px 16px;text-align:${esPendiente ? 'right' : 'center'};font-weight:600">
                  ${esPendiente ? 'Acción' : 'Estado'}
                </th>
              </tr>
            </thead>
            <tbody>`;

    for (const r of grp.registros) {
      const fecha    = (r.fecha || '').slice(0, 10);
      const checkIn  = r.check_in
        ? new Date(r.check_in).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
        : '-';
      const checkOut = r.check_out
        ? new Date(r.check_out).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
        : '<span style="color:#f59e0b">En curso</span>';

      let duracion = '-';
      if (r.check_in && r.check_out) {
        const mins = Math.round((new Date(r.check_out) - new Date(r.check_in)) / 60000);
        const h = Math.floor(mins / 60), m = mins % 60;
        duracion = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
      }

      let accionHtml = '';
      if (esPendiente) {
        accionHtml = `
          <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
            <button onclick="_transpAccion('${r.id}','pagado')"
              style="padding:5px 12px;border-radius:6px;border:1px solid #86efac;cursor:pointer;
                     background:#f0fdf4;color:#166534;font-size:12px;font-weight:600;white-space:nowrap">
              ✅ Pagar
            </button>
            <button onclick="_transpAccion('${r.id}','no_aprobado')"
              style="padding:5px 12px;border-radius:6px;border:1px solid #fca5a5;cursor:pointer;
                     background:#fef2f2;color:#dc2626;font-size:12px;font-weight:600;white-space:nowrap">
              ❌ No autorizar
            </button>
          </div>`;
      } else {
        accionHtml = r.estado === 'pagado'
          ? `<span style="background:#dcfce7;color:#166534;padding:3px 10px;
               border-radius:20px;font-size:12px;font-weight:600">✅ Pagado</span>`
          : `<span style="background:#fee2e2;color:#dc2626;padding:3px 10px;
               border-radius:20px;font-size:12px;font-weight:600">❌ No autorizado</span>`;
      }

      html += `
              <tr style="border-top:1px solid var(--border,#e5e7eb)">
                <td style="padding:12px 16px;color:var(--text-muted);white-space:nowrap">${fecha}</td>
                <td style="padding:12px 16px">
                  <div style="font-weight:600;color:var(--text)">${esc(r.cliente)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${esc(r.tarea_titulo)}</div>
                </td>
                <td style="padding:12px 16px;color:var(--text-muted);white-space:nowrap">
                  ${checkIn} → ${checkOut}
                </td>
                <td style="padding:12px 16px;color:#169BBC;font-weight:500;white-space:nowrap">${duracion}</td>
                <td style="padding:12px 16px;text-align:right;font-weight:700;color:var(--text)">
                  $${r.valor.toLocaleString('es-CO')}
                </td>
                <td style="padding:12px 16px;text-align:${esPendiente ? 'right' : 'center'}">
                  ${accionHtml}
                </td>
              </tr>`;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>`;
  }

  el.innerHTML = html;
}

async function _transpAccion(id, estado) {
  const label = estado === 'pagado' ? 'pagado' : 'no autorizado';
  if (!confirm(`¿Marcar este transporte como ${label}?`)) return;

  try {
    const res = await fetch(`${API_BASE}/transportes.php?id=${id}`, {
      method : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ estado }),
    });
    const data = await res.json();
    if (!data.ok) { alert('Error al actualizar'); return; }

    // Eliminar del array local y re-renderizar sin nuevo fetch
    _transpData = _transpData.filter(r => r.id !== id);
    const el = document.getElementById('tr-contenido');
    if (el) _transpRender(el);
  } catch (e) {
    alert('Error de conexión al actualizar el registro');
  }
}

// ─── Botón en el modal de tarea ──────────────────────────────────────────────

// Llamado desde openModal() para tareas IT/IF facturadas/archivadas.
// Muestra u oculta el botón según si hay participantes pendientes de transporte.
async function _transpActualizarBotonModal(tareaId) {
  const div = document.getElementById('modal-transporte-btn');
  if (!div) return;
  div.style.display = 'none';
  if (!API_BASE || !tareaId) return;

  try {
    const res  = await fetch(`${API_BASE}/transportes.php?pendientes_tarea=${encodeURIComponent(tareaId)}`);
    const data = await res.json();
    const n    = data.pendientes || 0;
    if (n <= 0) return;

    div.style.display = 'block';
    div.innerHTML = `
      <button onclick="_transportesRegistrar('${tareaId}', null)"
        style="width:100%;padding:10px;border-radius:8px;border:1px solid #fed7aa;cursor:pointer;
               background:#fff7ed;color:#c2410c;font-weight:600;font-size:13px;
               display:flex;align-items:center;justify-content:center;gap:8px">
        🚗 Registrar transporte
        <span style="background:#c2410c;color:#fff;border-radius:12px;
                     padding:1px 8px;font-size:12px">${n}</span>
      </button>`;
  } catch (e) {
    console.error('[Transportes] Error verificando pendientes modal:', e);
  }
}
