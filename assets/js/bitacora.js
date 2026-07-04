// ===================== MÓDULO BITÁCORA =====================
// Control de horario de técnicos: horas contratadas vs horas reales.
// Los días pasados usan datos precalculados de bitacora_usuario (cron noche).
// El día de hoy se calcula en tiempo real desde visita_participantes.

// Datos del último check de déficit — leídos por renderDashboard() en tareas.js
let _bitDeficitData = [];

let _bitData      = null;   // { tecnicos, dias, visitas }
let _bitDesde     = null;
let _bitHasta     = null;
let _bitTecFiltro = '';

// ─── Entrada principal ───────────────────────────────────────────────────────

async function renderBitacoraView() {
  const cont = document.getElementById('bitacora-view');
  if (!cont) return;

  if (!_bitDesde || !_bitHasta) {
    const hoy   = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    _bitDesde = lunes.toISOString().split('T')[0];
    _bitHasta = hoy.toISOString().split('T')[0];
  }

  cont.innerHTML = `
    <div style="max-width:1080px">
      ${_bitToolbar()}
      <div id="bit-tabla-cont" style="margin-top:16px">
        <div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">Cargando bitácora…</div>
      </div>
    </div>`;

  await _bitCargar();
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function _bitToolbar() {
  return `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="font-weight:700;font-size:16px;flex-shrink:0">📋 Bitácora de técnicos</div>
      <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap">
        <label style="font-size:12px;color:var(--text-muted)">Desde</label>
        <input type="date" id="bit-desde" value="${_bitDesde}"
               style="font-size:13px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card)">
        <label style="font-size:12px;color:var(--text-muted)">Hasta</label>
        <input type="date" id="bit-hasta" value="${_bitHasta}"
               style="font-size:13px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card)">
        <select id="bit-tec-filtro"
                style="font-size:13px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card)">
          <option value="">Todos los técnicos</option>
        </select>
        <button class="btn-save" style="padding:6px 14px;font-size:13px" onclick="_bitCargar()">Filtrar</button>
      </div>
    </div>`;
}

// ─── Carga ───────────────────────────────────────────────────────────────────

async function _bitCargar() {
  const el = id => document.getElementById(id);
  if (el('bit-desde')) _bitDesde = el('bit-desde').value;
  if (el('bit-hasta')) _bitHasta = el('bit-hasta').value;
  if (el('bit-tec-filtro')) _bitTecFiltro = el('bit-tec-filtro').value;

  const cont = el('bit-tabla-cont');
  if (cont) cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">Cargando…</div>';

  try {
    const res  = await fetch(`${API_BASE}/bitacora.php?desde=${_bitDesde}&hasta=${_bitHasta}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    _bitData = data;
  } catch (e) {
    if (cont) cont.innerHTML = `<div style="padding:30px;text-align:center;color:#ef4444;font-size:13px">Error: ${esc(e.message)}</div>`;
    return;
  }

  _bitPoblarFiltro();
  _bitRenderTabla();
}

function _bitPoblarFiltro() {
  const sel = document.getElementById('bit-tec-filtro');
  if (!sel || !_bitData) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los técnicos</option>';
  (_bitData.tecnicos || []).forEach(t => {
    const op = document.createElement('option');
    op.value = t.id;
    op.textContent = t.nombre;
    if (t.id === cur) op.selected = true;
    sel.appendChild(op);
  });
}

// ─── Render tabla ────────────────────────────────────────────────────────────

function _bitRenderTabla() {
  const cont = document.getElementById('bit-tabla-cont');
  if (!cont || !_bitData) return;

  const { tecnicos, dias, visitas, pausas } = _bitData;
  const hoy = new Date().toISOString().split('T')[0];

  // Índice rápido: dias precalculados → tecnico_id → fecha → fila
  const diasIdx = {};
  (dias || []).forEach(d => {
    if (!diasIdx[d.tecnico_id]) diasIdx[d.tecnico_id] = {};
    diasIdx[d.tecnico_id][d.fecha] = d;
  });

  // Índice visitas: tecnico_id → fecha → [visita,...]
  const visIdx = {};
  (visitas || []).forEach(v => {
    const fecha = v.check_in ? v.check_in.split(' ')[0] : null;
    if (!fecha) return;
    if (!visIdx[v.tecnico_id]) visIdx[v.tecnico_id] = {};
    if (!visIdx[v.tecnico_id][fecha]) visIdx[v.tecnico_id][fecha] = [];
    visIdx[v.tecnico_id][fecha].push(v);
  });

  // Mapa dow → columna de horario
  const horCol = [
    'h_dom','h_lun','h_mar','h_mie','h_jue','h_vie','h_sab'
  ];

  // Índice pausas: participante_id → [pausa,...]
  const pausasIdx = {};
  (pausas || []).forEach(p => {
    if (!pausasIdx[p.participante_id]) pausasIdx[p.participante_id] = [];
    pausasIdx[p.participante_id].push(p);
  });

  const diasHabiles = _bitDiasHabiles(_bitDesde, _bitHasta);
  const tecsFiltrados = tecnicos.filter(t => !_bitTecFiltro || t.id === _bitTecFiltro);

  if (!tecsFiltrados.length) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">Sin técnicos para mostrar.</div>';
    return;
  }

  let html = '';

  tecsFiltrados.forEach(tec => {
    // Horario del técnico: dow → horas (null = no trabaja)
    const horario = {};
    horCol.forEach((col, dow) => {
      const v = tec[col];
      horario[dow] = (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
    });

    // Verificar si tiene horario configurado
    const tieneHorario = Object.values(horario).some(h => h !== null);
    if (!tieneHorario) return; // Técnico sin horario → no mostrar en bitácora

    let totalEsp  = 0;
    let totalReal = 0;
    const filas   = [];

    diasHabiles.forEach(fecha => {
      const d        = new Date(fecha + 'T00:00:00');
      const dow      = d.getDay();
      const horasEsp = horario[dow];

      if (horasEsp === null) return; // No trabaja este día de semana

      totalEsp += horasEsp;

      const vsDay    = (visIdx[tec.id] || {})[fecha] || [];
      const esHoy    = fecha === hoy;
      const filaBD   = (diasIdx[tec.id] || {})[fecha] || null;

      // Horas reales:
      // - Si es hoy o no hay fila en BD → calcular desde visitas en tiempo real
      // - Si hay fila en BD (días pasados) → usar horas_real precalculado
      let horasReal   = 0;
      let hayEnCurso  = false;
      let estado      = null;
      let nota        = null;
      let adminNombre = null;

      if (filaBD && !esHoy) {
        // Dato precalculado del cron
        horasReal   = parseFloat(filaBD.horas_real);
        estado      = filaBD.estado;
        nota        = filaBD.nota || null;
        adminNombre = filaBD.admin_nombre || filaBD.admin_id || null;
        totalReal  += horasReal;
      } else {
        // Calcular en tiempo real (hoy o día sin fila en BD aún)
        vsDay.forEach(v => {
          if (!v.check_out) { hayEnCurso = true; return; }
          const grossMins = (new Date(v.check_out) - new Date(v.check_in)) / 60000;
          const pausaMins = v.mins_pausa ? parseInt(v.mins_pausa) : 0;
          horasReal += Math.max(0, grossMins - pausaMins) / 60;
        });
        if (!hayEnCurso) {
          totalReal += horasReal;
          estado = horasReal >= horasEsp - 0.05 ? 'ok' : 'deficit_sin_nota';
        }
      }

      const diaNombre = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][dow];
      const fechaDisp = fecha.split('-').reverse().join('/');

      if (vsDay.length === 0) {
        // Día sin visitas
        filas.push(`
          <tr style="background:${_bitRowBg(estado, nota)}">
            <td style="padding:8px 10px;font-size:12px;color:var(--text-muted);white-space:nowrap">
              ${diaNombre} ${fechaDisp}${esHoy ? ' <span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 5px">hoy</span>' : ''}
            </td>
            <td style="padding:8px 10px;font-size:12px;color:var(--text-muted)">—</td>
            <td style="padding:8px 10px;font-size:12px;color:var(--text-muted)">—</td>
            <td style="padding:8px 10px;font-size:12px;text-align:right;color:var(--text-muted)">0h</td>
            <td style="padding:8px 10px;font-size:12px">${_bitBadge(horasReal, horasEsp, hayEnCurso, estado)}</td>
            <td style="padding:8px 10px;font-size:12px"></td>
            <td style="padding:8px 10px;font-size:12px">${_bitNotaCell(tec.id, fecha, nota, adminNombre, estado)}</td>
          </tr>`);
      } else {
        // Filas de visitas del día
        vsDay.forEach((v, idx) => {
          const esUltima  = idx === vsDay.length - 1;
          const vPausas   = pausasIdx[v.participante_id] || [];
          const grossMins = v.check_out ? (new Date(v.check_out) - new Date(v.check_in)) / 60000 : null;
          const pausaMins = v.mins_pausa ? parseInt(v.mins_pausa) : 0;
          const netMins   = grossMins !== null ? Math.max(0, grossMins - pausaMins) : null;
          const hStr      = netMins !== null ? _fmtH(netMins / 60) : '—';

          filas.push(`
            <tr style="background:${esUltima ? _bitRowBg(estado, nota) : 'transparent'}">
              ${idx === 0 ? `<td rowspan="${vsDay.length}" style="padding:8px 10px;font-size:12px;color:var(--text-muted);white-space:nowrap;vertical-align:top">
                ${diaNombre} ${fechaDisp}${esHoy ? ' <span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 5px">hoy</span>' : ''}
              </td>` : ''}
              <td style="padding:6px 10px;font-size:12px">
                ${esc(v.cliente || v.titulo || '—')}
                <div style="font-size:11px;color:var(--text-muted)">${esc(v.titulo || '')}</div>
              </td>
              <td style="padding:6px 10px;font-size:12px;white-space:nowrap">${_bitHorarioCell(v, vPausas)}</td>
              <td style="padding:6px 10px;font-size:12px;text-align:right">${hStr}</td>
              ${esUltima ? `
                <td style="padding:6px 10px;font-size:12px">${_bitBadge(horasReal, horasEsp, hayEnCurso, estado)}</td>
                <td style="padding:6px 10px;font-size:12px">${_bitObsCell(v, vPausas)}</td>
                <td style="padding:6px 10px;font-size:12px">${_bitNotaCell(tec.id, fecha, nota, adminNombre, estado)}</td>
              ` : `<td></td><td style="padding:6px 10px;font-size:12px">${_bitObsCell(v, vPausas)}</td><td></td>`}
            </tr>`);
        });
      }
    });

    if (!filas.length) return;

    const diff      = totalReal - totalEsp;
    const diffSign  = diff >= 0 ? '+' : '';
    const diffColor = diff >= 0 ? '#059669' : '#dc2626';

    html += `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
                  margin-bottom:24px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;
                    border-bottom:1px solid var(--border);background:var(--bg)">
          <div style="width:36px;height:36px;border-radius:99px;background:${tec.color||'#94a3b8'};
                      color:#fff;display:flex;align-items:center;justify-content:center;
                      font-weight:700;font-size:13px;flex-shrink:0">
            ${esc(tec.iniciales||'?')}
          </div>
          <div style="font-weight:700;font-size:15px">${esc(tec.nombre)}</div>
          <div style="margin-left:auto;font-size:12px;color:var(--text-muted)">
            Período: <strong style="color:var(--text)">${_fmtH(totalReal)}</strong>
            de <strong>${_fmtH(totalEsp)}</strong>
            &nbsp;<span style="font-weight:700;color:${diffColor}">(${diffSign}${_fmtH(diff)})</span>
          </div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:var(--bg);border-bottom:1px solid var(--border)">
                <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:11px;color:var(--text-muted);white-space:nowrap">Fecha</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:11px;color:var(--text-muted)">Cliente / Tarea</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:11px;color:var(--text-muted)">Horario</th>
                <th style="padding:8px 10px;text-align:right;font-weight:600;font-size:11px;color:var(--text-muted)">Horas</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:11px;color:var(--text-muted)">Estado</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:11px;color:var(--text-muted)">Observaciones</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:11px;color:var(--text-muted)">Nota</th>
              </tr>
            </thead>
            <tbody>${filas.join('')}</tbody>
          </table>
        </div>
      </div>`;
  });

  cont.innerHTML = html || '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">Sin datos para el rango seleccionado.</div>';
}


// ─── Horario detallado (inicio, pausa(s), fin) ────────────────────────────────

function _bitHorarioCell(v, pausas) {
  const horaIn  = v.check_in  ? v.check_in.split(' ')[1].slice(0,5) : '—';
  const horaOut = v.check_out ? v.check_out.split(' ')[1].slice(0,5)
                               : '<span style="color:#f59e0b;font-weight:600">en curso</span>';
  if (!pausas || !pausas.length) {
    return `${horaIn} → ${horaOut}`;
  }
  let html = horaIn;
  pausas.forEach(p => {
    const pIn  = p.pausa_inicio ? p.pausa_inicio.split(' ')[1].slice(0,5) : '?';
    const pOut = p.pausa_fin    ? p.pausa_fin.split(' ')[1].slice(0,5)    : '?';
    const tip  = p.justificacion ? ` title="${esc(p.justificacion)}"` : '';
    html += ` <span style="color:#f59e0b"${tip}>⏸${pIn}</span>`;
    html += ` <span style="color:#4ade80">▶${pOut}</span>`;
  });
  html += ` → ${horaOut}`;
  return html;
}

// ─── Celda de observaciones automáticas ──────────────────────────────────────

function _bitObsCell(v, pausas) {
  if (!v.check_out) return '';
  const grossMins = (new Date(v.check_out) - new Date(v.check_in)) / 60000;
  const hasPausa  = pausas && pausas.length > 0;
  if (grossMins > 240 && !hasPausa) {
    return '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;white-space:nowrap">⚠ Sin pausa registrada</span>';
  }
  return '';
}

// ─── Color de fila ────────────────────────────────────────────────────────────

function _bitRowBg(estado, nota) {
  if (!estado || estado === 'ok') return 'transparent';
  if (estado === 'deficit_con_nota') return '#fffbeb';
  return '#fef2f2'; // deficit_sin_nota
}

// ─── Badge de estado ─────────────────────────────────────────────────────────

function _bitBadge(horasReal, horasEsp, hayEnCurso, estado) {
  if (hayEnCurso) {
    return '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">⏳ En curso</span>';
  }
  if (!estado || estado === 'ok') {
    return `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">✓ ${_fmtH(horasReal)}</span>`;
  }
  // Déficit
  return `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">↓ ${_fmtH(horasReal)}/${_fmtH(horasEsp)}</span>`;
}

// ─── Celda de nota ───────────────────────────────────────────────────────────

function _bitNotaCell(tecId, fecha, nota, adminNombre, estado) {
  // Solo mostrar botón de nota si hay déficit
  const hayDeficit = estado && estado !== 'ok';

  if (nota) {
    return `
      <div style="display:flex;align-items:flex-start;gap:6px">
        <div style="flex:1;font-size:11px;color:#92400e;background:#fffbeb;
                    border:1px solid #fde68a;border-radius:6px;padding:4px 8px;
                    line-height:1.4;max-width:240px">
          ${esc(nota)}
          ${adminNombre ? `<div style="font-size:10px;color:#b45309;margin-top:2px">${esc(adminNombre)}</div>` : ''}
        </div>
        <button type="button" title="Editar nota"
          onclick="_bitAbrirNota('${esc(tecId)}','${fecha}','${esc(nota.replace(/'/g,"\\'"))}')"
          style="font-size:13px;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px">✏️</button>
      </div>`;
  }

  if (!hayDeficit) return '';

  return `
    <button type="button" onclick="_bitAbrirNota('${esc(tecId)}','${fecha}','')"
      style="font-size:11px;padding:3px 8px;border:1px dashed var(--border);border-radius:6px;
             background:none;cursor:pointer;color:var(--text-muted)">+ justificar</button>`;
}

// ─── Modal de nota ───────────────────────────────────────────────────────────

function _bitAbrirNota(tecId, fecha, notaActual) {
  document.getElementById('bit-nota-modal')?.remove();

  const tec       = (_bitData?.tecnicos || []).find(t => t.id === tecId);
  const tecNombre = tec ? tec.nombre : tecId;
  const fechaDisp = fecha.split('-').reverse().join('/');

  const overlay = document.createElement('div');
  overlay.id = 'bit-nota-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:var(--radius);padding:24px;width:420px;max-width:94vw;
                box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Nota de justificación</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
        ${esc(tecNombre)} · ${fechaDisp}
      </div>
      <textarea id="bit-nota-texto"
                style="width:100%;min-height:100px;font-size:13px;border:1px solid var(--border);
                       border-radius:8px;padding:10px;font-family:inherit;resize:vertical;box-sizing:border-box"
                placeholder="Ej: capacitación externa, incapacidad, día libre acordado…">${esc(notaActual)}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        ${notaActual ? `<button class="btn-cancel" onclick="_bitBorrarNota('${esc(tecId)}','${fecha}')">Eliminar nota</button>` : ''}
        <button class="btn-cancel" onclick="document.getElementById('bit-nota-modal').remove()">Cancelar</button>
        <button class="btn-save" onclick="_bitGuardarNota('${esc(tecId)}','${fecha}')">Guardar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('bit-nota-texto')?.focus(), 60);
}

async function _bitGuardarNota(tecId, fecha) {
  const texto = document.getElementById('bit-nota-texto')?.value?.trim();
  if (!texto) { alert('La nota no puede estar vacía'); return; }

  const adminId = currentUser?.id || '';

  try {
    const res  = await fetch(`${API_BASE}/bitacora.php`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tecnico_id: tecId, fecha, nota: texto, admin_id: adminId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    document.getElementById('bit-nota-modal')?.remove();
    await _bitCargar();
  } catch (e) {
    alert('Error guardando nota: ' + e.message);
  }
}

async function _bitBorrarNota(tecId, fecha) {
  if (!confirm('¿Eliminar esta nota?')) return;
  try {
    await fetch(`${API_BASE}/bitacora.php?tecnico_id=${encodeURIComponent(tecId)}&fecha=${fecha}`, { method: 'DELETE' });
    document.getElementById('bit-nota-modal')?.remove();
    await _bitCargar();
  } catch (e) {
    alert('Error eliminando nota: ' + e.message);
  }
}

// ─── Alerta dashboard ────────────────────────────────────────────────────────

async function bitacoraCheckDashboard() {
  try {
    const res  = await fetch(`${API_BASE}/bitacora.php?dashboard=1`);
    const data = await res.json();
    _bitDeficitData = Array.isArray(data) ? data : [];
    // Eliminar banner legacy si quedó de versión anterior
    document.getElementById('bit-deficit-banner')?.remove();
    // Refrescar dashboard si está visible
    if (typeof currentView !== 'undefined' && currentView === 'dashboard') {
      renderDashboard();
    }
  } catch (_) {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _bitDiasHabiles(desde, hasta) {
  const dias = [];
  const cur  = new Date(desde + 'T00:00:00');
  const fin  = new Date(hasta + 'T00:00:00');
  while (cur <= fin) {
    const ok = typeof esDiaHabil === 'function'
      ? esDiaHabil(cur)
      : (cur.getDay() !== 0 && cur.getDay() !== 6);
    if (ok) dias.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

function _fmtH(h) {
  if (h === null || h === undefined) return '0h';
  const sign      = h < 0 ? '-' : '';
  const totalMins = Math.round(Math.abs(h) * 60); // evita 6h 60m por float
  const hh        = Math.floor(totalMins / 60);
  const mm        = totalMins % 60;
  return mm === 0 ? `${sign}${hh}h` : `${sign}${hh}h ${mm}m`;
}
// ===================== FIN MÓDULO BITÁCORA =====================
