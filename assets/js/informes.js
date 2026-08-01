// ===================== INFORMES (solo admin) =====================
// 4 informes puntuales, pensados para uso diario:
//  1) Actividades de un técnico por rango de fechas (sus visitas: check-in/check-out)
//  2) Todas las tarjetas de un cliente (cualquier área)
//  3) Facturas generadas en Alegra desde el módulo de Facturación
//  4) Reportes de tarjetas operativas: buscar por fecha/cliente, editar y descargar PDF
// Acceso restringido a perfil 'admin' (aplicarPermisosUI en auth.js oculta
// la pestaña "Informes" para técnicos; setArea también la bloquea).

let informesReportesVisita = []; // cache de reportes.php?todos=1
let informesFacturas = [];       // cache de facturas_generadas.php
let _informeActual = 'actividades_tecnico';
let _informeColumnas = [];
let _informeFilas = [];

async function cargarInformesReportes() {
  if (!API_BASE) return;
  try {
    const res = await fetch(`${API_BASE}/reportes.php?todos=1`);
    informesReportesVisita = await res.json();
    if (!Array.isArray(informesReportesVisita)) informesReportesVisita = [];
  } catch (e) { console.error(e); informesReportesVisita = []; }
}

async function cargarInformesFacturas() {
  if (!API_BASE) return;
  try {
    const res = await fetch(`${API_BASE}/facturas_generadas.php`);
    informesFacturas = await res.json();
    if (!Array.isArray(informesFacturas)) informesFacturas = [];
  } catch (e) { console.error(e); informesFacturas = []; }
}

function dentroDeRango(fechaISO, desde, hasta) {
  if (!fechaISO) return false;
  const f = fechaISO.slice(0, 10);
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

function obtenerClientesUnicos() {
  const set = new Set();
  tasks.forEach(t => { if (t.cliente && t.cliente.trim()) set.add(t.cliente.trim()); });
  informesReportesVisita.forEach(r => { if (r.cliente && r.cliente.trim()) set.add(r.cliente.trim()); });
  informesFacturas.forEach(f => { if (f.cliente_nombre && f.cliente_nombre.trim()) set.add(f.cliente_nombre.trim()); });
  (_clientes || []).forEach(c => { if (c.nombre && c.nombre.trim()) set.add(c.nombre.trim()); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

function formatDuracionMin(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '-';
  const ms = new Date(checkOut.replace(' ', 'T')) - new Date(checkIn.replace(' ', 'T'));
  if (isNaN(ms) || ms < 0) return '-';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

const ETIQUETAS_ESTADO_REPORTE = { activo: '⏳ En curso', sin_reporte: '🚫 Sin reporte', enviado: '✅ Enviado' };

// --------------------------------------------------------------
// 1) Actividades de un técnico por rango de fechas
// Combina dos fuentes para dar el panorama completo:
//  - Tarjetas IT/IF asignadas a él (por fecha de programación, o de
//    creación si aún no tiene fecha programada), aunque no tengan visita.
//  - Visitas (check-in/check-out) que haya registrado en ese rango.
// --------------------------------------------------------------
function calcActividadesTecnico(filtros) {
  if (!filtros.tecnico) {
    return { columnas: [{ key: 'msg', label: 'Mensaje' }], filas: [{ msg: 'Selecciona un técnico arriba para ver sus actividades.' }] };
  }

  const filasTareas = tasks
    .filter(t => ['it', 'if'].includes(t.area) && (t.team || []).includes(filtros.tecnico))
    .map(t => ({ t, ref: t.fechaProg || (t.createdAt || '').slice(0, 10) || '' }))
    .filter(x => dentroDeRango(x.ref, filtros.desde, filtros.hasta))
    .map(x => ({
      tipo: '📋 Tarjeta asignada',
      fecha: x.ref,
      cliente: x.t.cliente || '-',
      tarea: x.t.titulo || '-',
      area: (AREAS[x.t.area] || {}).label || x.t.area,
      estado: (AREA_FLOWS[x.t.area] || []).find(e => e.id === x.t.estado)?.label || x.t.estado,
      checkIn: '-', checkOut: '-', duracion: '-',
      _tarea_id: x.t.id, _tarea_area: x.t.area,
    }));

  const filasVisitas = informesReportesVisita
    .filter(r => (r.tecnico_checkin_id === filtros.tecnico || r.tecnico_checkout_id === filtros.tecnico)
      && dentroDeRango(r.check_in, filtros.desde, filtros.hasta))
    .map(r => ({
      tipo: '🚐 Visita registrada',
      fecha: (r.check_in || '').slice(0, 10),
      cliente: r.cliente || '-',
      tarea: r.titulo || '-',
      area: '-',
      estado: ETIQUETAS_ESTADO_REPORTE[r.estado] || r.estado,
      checkIn: r.check_in ? r.check_in.slice(11, 16) : '-',
      checkOut: r.check_out ? r.check_out.slice(11, 16) : '-',
      duracion: formatDuracionMin(r.check_in, r.check_out),
      _tarea_id: r.tarea_id, _tarea_area: r.area,
    }));

  const filas = [...filasTareas, ...filasVisitas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  return {
    columnas: [
      { key: 'tipo', label: 'Tipo' }, { key: 'fecha', label: 'Fecha' }, { key: 'cliente', label: 'Cliente' },
      { key: 'tarea', label: 'Tarea' }, { key: 'area', label: 'Área' }, { key: 'estado', label: 'Estado' },
      { key: 'checkIn', label: 'Check-in' }, { key: 'checkOut', label: 'Check-out' }, { key: 'duracion', label: 'Duración' },
    ],
    filas,
  };
}

// --------------------------------------------------------------
// 2) Todas las tarjetas de un cliente
// --------------------------------------------------------------
function calcTarjetasCliente(filtros) {
  if (!filtros.cliente) {
    return { columnas: [{ key: 'msg', label: 'Mensaje' }], filas: [{ msg: 'Selecciona un cliente arriba para ver sus tarjetas.' }] };
  }
  const filas = tasks
    .filter(t => !filtros.cliente || (t.cliente || '').toLowerCase().includes(filtros.cliente.toLowerCase()))
    .map(t => ({
      area: (AREAS[t.area] || {}).label || t.area,
      tarea: t.titulo || '-',
      estado: (AREA_FLOWS[t.area] || []).find(e => e.id === t.estado)?.label || t.estado,
      tecnicos: (t.team || []).map(nombreCorto).join(', ') || '-',
      fechaCreacion: (t.createdAt || '').slice(0, 10) || '-',
      fechaProgramacion: t.fechaProg || '-',
      factura: t.factura || '-',
      _tarea_id: t.id, _tarea_area: t.area,
    }))
    .sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));
  return {
    columnas: [
      { key: 'area', label: 'Área' }, { key: 'tarea', label: 'Tarea' }, { key: 'estado', label: 'Estado' },
      { key: 'tecnicos', label: 'Técnicos' }, { key: 'fechaCreacion', label: 'Fecha creación' },
      { key: 'fechaProgramacion', label: 'Fecha programación' }, { key: 'factura', label: 'Factura' },
    ],
    filas,
  };
}

// --------------------------------------------------------------
// 3) Facturas generadas en Alegra desde el módulo de Facturación
// --------------------------------------------------------------
function calcFacturasModulo(filtros) {
  const filas = informesFacturas
    .filter(f => dentroDeRango(f.fecha_factura, filtros.desde, filtros.hasta))
    .filter(f => !filtros.cliente || (f.cliente_nombre || '').toLowerCase().includes(filtros.cliente.toLowerCase()))
    .map(f => ({
      numeroFactura: f.numero_factura || '-',
      cliente: f.cliente_nombre || '-',
      total: f.total !== null && f.total !== undefined ? Number(f.total) : null,
      fecha: f.fecha_factura || '-',
      origen: f.tarea_id ? 'Desde tarjeta de cotización' : 'Cotización subida manualmente',
      creadoEn: (f.creado_en || '').slice(0, 16).replace('T', ' '),
    }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return {
    columnas: [
      { key: 'numeroFactura', label: 'Factura' }, { key: 'cliente', label: 'Cliente' },
      { key: 'total', label: 'Total', tipo: 'moneda' }, { key: 'fecha', label: 'Fecha factura' },
      { key: 'origen', label: 'Origen' }, { key: 'creadoEn', label: 'Creado en' },
    ],
    filas,
  };
}

// --------------------------------------------------------------
// 4) Reportes de tarjetas operativas: buscar, editar, descargar PDF
// --------------------------------------------------------------
// estadoReporte: '' = todos | 'activo' = en curso (sin checkout) | 'sin_reporte' = checkout
// sin reporte | 'no_enviado' = activo + sin_reporte (aún no llega a "enviado") | 'enviado'
function pasaFiltroEstadoReporte(r, estadoReporte) {
  if (!estadoReporte) return true;
  if (estadoReporte === 'no_enviado') return r.estado !== 'enviado';
  return r.estado === estadoReporte;
}

function calcReportesBusqueda(filtros) {
  // Versión plana (sin botones) usada para exportar a Excel.
  const filas = informesReportesVisita
    .filter(r => dentroDeRango(r.check_in, filtros.desde, filtros.hasta))
    .filter(r => !filtros.cliente || (r.cliente || '').toLowerCase().includes(filtros.cliente.toLowerCase()))
    .filter(r => pasaFiltroEstadoReporte(r, filtros.estadoReporte))
    .map(r => ({
      fecha: (r.check_in || '').slice(0, 10),
      cliente: r.cliente || '-',
      tarea: r.titulo || '-',
      tecnico: getMember(r.tecnico_checkin_id)?.name || r.tecnico_checkin_id || '-',
      estado: ETIQUETAS_ESTADO_REPORTE[r.estado] || r.estado,
      pdf: r.pdf_archivo ? 'Sí' : 'No',
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  return {
    columnas: [
      { key: 'fecha', label: 'Fecha' }, { key: 'cliente', label: 'Cliente' }, { key: 'tarea', label: 'Tarea' },
      { key: 'tecnico', label: 'Técnico' }, { key: 'estado', label: 'Estado' }, { key: 'pdf', label: 'PDF generado' },
    ],
    filas,
  };
}

function renderReportesBusquedaHTML(filtros) {
  const filas = informesReportesVisita
    .filter(r => dentroDeRango(r.check_in, filtros.desde, filtros.hasta))
    .filter(r => !filtros.cliente || (r.cliente || '').toLowerCase().includes(filtros.cliente.toLowerCase()))
    .filter(r => pasaFiltroEstadoReporte(r, filtros.estadoReporte))
    .sort((a, b) => (b.check_in || '').localeCompare(a.check_in || ''));

  if (!filas.length) {
    return '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Sin reportes para los filtros seleccionados.</div>';
  }

  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Fecha</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Cliente</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Tarea</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Técnico</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Estado</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Acciones</th>
    </tr></thead>
    <tbody>${filas.map(r => `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);cursor:pointer;color:var(--primary);font-weight:600" onclick="abrirTarjetaInforme('${esc(r.tarea_id)}','${esc(r.area || '')}')" title="Abrir tarjeta">${esc((r.check_in || '').slice(0, 10))}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(r.cliente || '-')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(r.titulo || '-')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(getMember(r.tecnico_checkin_id)?.name || r.tecnico_checkin_id || '-')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${ETIQUETAS_ESTADO_REPORTE[r.estado] || esc(r.estado)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap">
        <button class="btn-cancel" style="padding:4px 8px;font-size:12px" onclick="continuarReporte('${r.id}', null, true)">✏️ Editar</button>
        ${r.pdf_archivo ? `<a href="${API_BASE}/reporte_pdf.php?id=${r.id}" target="_blank" class="btn-save" style="padding:4px 8px;font-size:12px;text-decoration:none;display:inline-block;margin-left:6px">⬇️ PDF</a>` : ''}
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// --------------------------------------------------------------
// 5) Llegadas tardías: participantes cuyo check_in fue después de la hora programada
// --------------------------------------------------------------
async function renderTardiasHTML(filtros) {
  const tablaEl = document.getElementById('informe-tabla');
  if (tablaEl) tablaEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">⏳ Cargando...</div>';

  const params = new URLSearchParams({ tardias: 1 });
  if (filtros.desde)   params.set('desde',      filtros.desde);
  if (filtros.hasta)   params.set('hasta',      filtros.hasta);
  if (filtros.tecnico) params.set('tecnico_id', filtros.tecnico);

  let filas = [];
  try {
    const res = await fetch(`${API_BASE}/reportes.php?${params}`);
    filas = await res.json();
    if (!Array.isArray(filas)) filas = [];
  } catch(e) {
    return '<div style="padding:24px;text-align:center;color:#dc2626;font-size:13px">Error cargando datos.</div>';
  }

  // Guardar para exportar a Excel
  _informeColumnas = [
    { key: 'fecha',        label: 'Fecha' },
    { key: 'cliente',      label: 'Cliente' },
    { key: 'tarea',        label: 'Tarea' },
    { key: 'tecnico',      label: 'Técnico' },
    { key: 'horaProg',     label: 'Hora programada' },
    { key: 'horaLlegada',  label: 'Llegada real' },
    { key: 'minutosTarde', label: 'Minutos tarde' },
  ];
  _informeFilas = filas.map(f => {
    const minutosTarde = _calcMinutosTarde(f.hora_programacion, f.check_in);
    return {
      fecha:        (f.fecha_programacion || '').slice(0, 10),
      cliente:      f.cliente  || '-',
      tarea:        f.titulo   || '-',
      tecnico:      getMember(f.tecnico_id)?.name || f.tecnico_id || '-',
      horaProg:     f.hora_programacion ? f.hora_programacion.slice(0, 5) : '-',
      horaLlegada:  f.check_in ? f.check_in.slice(11, 16) : '-',
      minutosTarde: minutosTarde !== null ? minutosTarde : '-',
      _tarea_id:    f.tarea_id, _tarea_area: f.area,
    };
  });

  if (!_informeFilas.length) {
    return '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Sin llegadas tardías para los filtros seleccionados.</div>';
  }

  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Fecha</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Cliente</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Tarea</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Técnico</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">H. programada</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Llegada real</th>
      <th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">Min. tarde</th>
    </tr></thead>
    <tbody>${_informeFilas.map(f => `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);cursor:pointer;color:var(--primary);font-weight:600" onclick="abrirTarjetaInforme('${esc(f._tarea_id)}','${esc(f._tarea_area || '')}')" title="Abrir tarjeta">${esc(f.fecha)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(f.cliente)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(f.tarea)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(f.tecnico)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);color:#64748b">${esc(f.horaProg)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);color:#dc2626;font-weight:600">${esc(f.horaLlegada)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">
        <span style="background:#fef2f2;color:#dc2626;border-radius:99px;padding:2px 8px;font-size:12px;font-weight:700">+${esc(String(f.minutosTarde))} min</span>
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function _calcMinutosTarde(horaProg, checkIn) {
  if (!horaProg || !checkIn) return null;
  // horaProg: "HH:MM:SS" o "HH:MM", checkIn: "YYYY-MM-DD HH:MM:SS"
  const [hP, mP] = horaProg.split(':').map(Number);
  const [hC, mC] = checkIn.slice(11, 16).split(':').map(Number);
  return (hC * 60 + mC) - (hP * 60 + mP);
}

// --------------------------------------------------------------
// Registro de informes
// --------------------------------------------------------------
// 6) Checks fuera de sitio
// --------------------------------------------------------------
let _fueraSitioArchivados = false;

async function renderFueraSitioHTML(filtros) {
  const tablaEl = document.getElementById('informe-tabla');
  if (tablaEl) tablaEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">⏳ Cargando...</div>';

  const params = new URLSearchParams();
  if (_fueraSitioArchivados) params.set('archivados', '1');
  if (filtros.desde)   params.set('desde',     filtros.desde);
  if (filtros.hasta)   params.set('hasta',     filtros.hasta);
  if (filtros.tecnico) params.set('tecnicoId', filtros.tecnico);

  let filas = [];
  try {
    const res = await fetch(`${API_BASE}/fuera_sitio.php?${params}`);
    const data = await res.json();
    if (data.error) {
      console.error('[fuera_sitio]', data.error);
      return `<div style="padding:24px;text-align:center;color:#dc2626;font-size:13px">Error: ${data.error}</div>`;
    }
    filas = Array.isArray(data) ? data : [];
  } catch(e) {
    console.error('[fuera_sitio] fetch error:', e);
    return '<div style="padding:24px;text-align:center;color:#dc2626;font-size:13px">Error cargando datos. Revisa la consola del navegador.</div>';
  }

  _informeColumnas = [
    { key: 'fecha',      label: 'Fecha / Hora' },
    { key: 'tecnico',    label: 'Técnico' },
    { key: 'cliente',    label: 'Cliente' },
    { key: 'tarea',      label: 'Tarea' },
    { key: 'tipo',       label: 'Tipo' },
    { key: 'distancia',  label: 'Distancia (m)' },
    { key: 'radio',      label: 'Radio (m)' },
    { key: 'accion',     label: 'Acción' },
    { key: 'ubicacion',  label: 'Ubicación' },
  ];
  _informeFilas = filas.map(f => ({
    fecha:            (f.creado_en || '').slice(0, 16).replace('T', ' '),
    tecnico:          f.tecnico_nombre || f.tecnico_id || '-',
    cliente:          f.tarea_cliente  || '-',
    tarea:            f.tarea_titulo   || '-',
    tipo:             f.tipo           || '-',
    distancia:        f.distancia_metros,
    radio:            f.radio_metros,
    accion:           f.accion         || '-',
    ubicacion:        (f.lat != null && f.lng != null) ? `${f.lat},${f.lng}` : '',
    id:               f.id,
    observacion:      f.observacion    || '',
    revisado_por:     f.revisado_por_nombre || '',
    revisado_en:      (f.revisado_en || '').slice(0, 16).replace('T', ' '),
    _tarea_id:        f.tarea_id, _tarea_area: f.tarea_area,
  }));

  const empty = _fueraSitioArchivados
    ? 'Sin checks archivados para los filtros seleccionados.'
    : 'Sin checks pendientes por gestionar.';
  if (!_informeFilas.length) {
    return `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">${empty}</div>`;
  }

  const accionColor = a => a === 'aceptado' ? '#f59e0b' : '#dc2626';
  const tipoLabel   = t => t === 'checkin' ? '🟢 Check-in' : '🔴 Check-out';
  const mapsLink    = coords => coords
    ? `<a href="https://www.google.com/maps?q=${coords}" target="_blank" style="color:var(--accent);text-decoration:none;font-size:12px">📍 Ver mapa</a>`
    : '<span style="color:var(--text-muted);font-size:12px">—</span>';

  const colsHeader = _fueraSitioArchivados
    ? ['Fecha / Hora','Técnico','Cliente','Tarea','Tipo','Distancia','Radio','Acción','Ubicación','Gestionado por','Observación']
    : ['Fecha / Hora','Técnico','Cliente','Tarea','Tipo','Distancia','Radio','Acción','Ubicación',''];

  const filasTR = _informeFilas.map(r => {
    const extraCol = _fueraSitioArchivados
      ? `<td style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted)">
           ${esc(r.revisado_por)}${r.revisado_en ? `<br><span style="font-size:11px">${esc(r.revisado_en)}</span>` : ''}
         </td>
         <td style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:12px;max-width:200px">${esc(r.observacion || '—')}</td>`
      : `<td style="padding:7px 10px;border-bottom:1px solid var(--border)">
           <button class="btn-save" style="padding:4px 10px;font-size:12px"
             onclick="gestionarFueraSitio('${r.id}', this)">✅ Gestionar</button>
         </td>`;
    return `<tr id="fs-row-${r.id}">
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap;cursor:pointer;color:var(--primary);font-weight:600" onclick="abrirTarjetaInforme('${esc(r._tarea_id)}','${esc(r._tarea_area || '')}')" title="Abrir tarjeta">${esc(r.fecha)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(r.tecnico)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(r.cliente)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(r.tarea)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${tipoLabel(r.tipo)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);font-weight:600;color:#dc2626">${r.distancia}m</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-muted)">${r.radio}m</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">
        <span style="background:${accionColor(r.accion)}20;color:${accionColor(r.accion)};border-radius:99px;padding:2px 9px;font-size:11px;font-weight:600">
          ${r.accion === 'aceptado' ? '⚠️ Aceptó continuar' : '✋ Canceló'}
        </span>
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${mapsLink(r.ubicacion)}</td>
      ${extraCol}
    </tr>`;
  }).join('');

  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>
      ${colsHeader.map(h =>
        `<th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg);white-space:nowrap">${h}</th>`
      ).join('')}
    </tr></thead>
    <tbody>${filasTR}</tbody>
  </table>`;
}

async function gestionarFueraSitio(id, btn) {
  // Si ya hay un form abierto para esta fila, lo cierra
  const existente = document.getElementById(`fs-form-${id}`);
  if (existente) { existente.remove(); return; }

  const row = document.getElementById(`fs-row-${id}`);
  if (!row) return;
  const colCount = row.children.length;

  const formRow = document.createElement('tr');
  formRow.id = `fs-form-${id}`;
  formRow.innerHTML = `
    <td colspan="${colCount}" style="padding:10px 14px;background:var(--bg);border-bottom:1px solid var(--border)">
      <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">
        <textarea id="fs-obs-${id}" placeholder="Observación (opcional)..."
          style="flex:1;min-width:220px;min-height:56px;padding:6px 8px;font-size:13px;border:1px solid var(--border);border-radius:6px;resize:vertical"></textarea>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn-save" style="padding:6px 14px;font-size:13px"
            onclick="confirmarGestionFueraSitio('${id}', this)">✅ Listo</button>
          <button class="btn-cancel" style="padding:6px 14px;font-size:13px"
            onclick="document.getElementById('fs-form-${id}')?.remove()">Cancelar</button>
        </div>
      </div>
    </td>`;
  row.after(formRow);
  document.getElementById(`fs-obs-${id}`)?.focus();
}

async function confirmarGestionFueraSitio(id, btn) {
  if (!currentUser) return;
  const obs = document.getElementById(`fs-obs-${id}`)?.value.trim() || null;
  btn.disabled = true;
  btn.textContent = '⏳';
  try {
    const res = await fetch(`${API_BASE}/fuera_sitio.php?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisadoPor: currentUser.id, observacion: obs }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    // Quitar fila + form del DOM
    document.getElementById(`fs-form-${id}`)?.remove();
    document.getElementById(`fs-row-${id}`)?.remove();
    // Actualizar badge
    actualizarBadgeFueraSitio();
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '✅ Listo';
    alert('Error al gestionar: ' + e.message);
  }
}

function toggleFueraSitioArchivados() {
  _fueraSitioArchivados = !_fueraSitioArchivados;
  const btn = document.getElementById('fs-toggle-archivados');
  if (btn) btn.textContent = _fueraSitioArchivados ? '📋 Ver pendientes' : '📦 Ver archivados';
  recalcularInforme();
}

async function renderSinReporteHTML(filtros) {
  const tablaEl = document.getElementById('informe-tabla');
  if (tablaEl) tablaEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">⏳ Cargando...</div>';

  const params = new URLSearchParams({ sin_reporte: 1 });
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);

  let filas = [];
  try {
    const res  = await fetch(`${API_BASE}/reportes.php?${params}`);
    const data = await res.json();
    if (data.error) return `<div style="padding:24px;text-align:center;color:#dc2626;font-size:13px">Error: ${esc(data.error)}</div>`;
    filas = Array.isArray(data) ? data : [];
  } catch(e) {
    return '<div style="padding:24px;text-align:center;color:#dc2626;font-size:13px">Error cargando datos.</div>';
  }

  _informeColumnas = [
    { key: 'fecha',    label: 'Fecha sin reporte' },
    { key: 'areaLabel', label: 'Área' },
    { key: 'cliente',  label: 'Cliente' },
    { key: 'tarea',    label: 'Tarea' },
    { key: 'tecnicos', label: 'Técnico(s)' },
    { key: 'check_in', label: 'Check-in' },
    { key: 'check_out',label: 'Check-out' },
  ];

  _informeFilas = filas.map(r => ({
    fecha:      (r.sin_reporte_at || '').slice(0, 16).replace('T', ' '),
    areaLabel:  (AREAS[r.area] || {}).label || r.area || '-',
    areaColor:  (AREAS[r.area] || {}).color || '#94a3b8',
    cliente:    r.cliente  || '-',
    tarea:      r.titulo   || '-',
    tecnicos:   r.tecnicos || '-',
    check_in:   (r.check_in  || '').slice(0, 16).replace('T', ' '),
    check_out:  (r.check_out || '').slice(0, 16).replace('T', ' '),
    _tarea_id:  r.tarea_id,
  }));

  if (!_informeFilas.length) {
    return '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Sin visitas marcadas sin reporte para el rango seleccionado. ✅</div>';
  }

  const cols = ['Fecha sin reporte','Área','Cliente','Tarea','Técnico(s)','Check-in','Check-out'];
  const thStyle = 'padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--text-muted);border-bottom:2px solid var(--border);white-space:nowrap';
  const tdStyle = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:13px';

  const filasTR = _informeFilas.map(r => `
    <tr style="cursor:pointer" onclick="openModal('${esc(r._tarea_id)}');setArea('it')">
      <td style="${tdStyle};white-space:nowrap;color:#dc2626;font-weight:600">${esc(r.fecha)}</td>
      <td style="${tdStyle}"><span style="background:${r.areaColor}20;color:${r.areaColor};border-radius:99px;padding:2px 8px;font-size:11px;font-weight:700">${esc(r.areaLabel)}</span></td>
      <td style="${tdStyle}">${esc(r.cliente)}</td>
      <td style="${tdStyle}">${esc(r.tarea)}</td>
      <td style="${tdStyle};color:var(--text-muted)">${esc(r.tecnicos)}</td>
      <td style="${tdStyle};white-space:nowrap">${esc(r.check_in)}</td>
      <td style="${tdStyle};white-space:nowrap">${esc(r.check_out)}</td>
    </tr>`).join('');

  return `
    <div style="padding:10px 14px;font-size:12px;color:#dc2626;background:#fff5f5;border-bottom:1px solid #fecaca">
      🚫 ${_informeFilas.length} visita${_informeFilas.length !== 1 ? 's' : ''} terminada${_informeFilas.length !== 1 ? 's' : ''} sin reporte
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${cols.map(c => `<th style="${thStyle}">${c}</th>`).join('')}</tr></thead>
      <tbody>${filasTR}</tbody>
    </table>`;
}

const INFORMES = {
  actividades_tecnico: { nombre: '👷 Actividades de un técnico', campos: ['tecnico', 'desde', 'hasta'], calcular: calcActividadesTecnico },
  tarjetas_cliente: { nombre: '📋 Tarjetas de un cliente', campos: ['cliente'], calcular: calcTarjetasCliente },
  facturas_modulo: { nombre: '🧾 Facturas generadas (módulo Facturación)', campos: ['desde', 'hasta', 'cliente'], calcular: calcFacturasModulo },
  reportes_busqueda: { nombre: '🔍 Reportes de tarjetas operativas', campos: ['desde', 'hasta', 'cliente', 'estadoReporte'], calcular: calcReportesBusqueda, custom: renderReportesBusquedaHTML },
  tardias_llegada: { nombre: '⏰ Llegadas tardías', campos: ['desde', 'hasta', 'tecnico'], customAsync: renderTardiasHTML },
  fuera_sitio: { nombre: '📍 Checks fuera de sitio', campos: ['desde', 'hasta', 'tecnico'], customAsync: renderFueraSitioHTML },
  sin_reporte: { nombre: '🚫 Visitas sin reporte', campos: ['desde', 'hasta'], customAsync: renderSinReporteHTML },
  informe_cliente_pdf: { nombre: '📄 Informe para cliente', campos: ['cliente', 'desde', 'hasta'], customAsync: renderInformeClientePDF },
};

// --------------------------------------------------------------
// Render de la vista + filtros dinámicos por informe
// --------------------------------------------------------------
async function renderInformesView() {
  if (!informesReportesVisita.length) await cargarInformesReportes();
  if (!informesFacturas.length) await cargarInformesFacturas();

  const cont = document.getElementById('informes-view');
  if (!cont) return;

  const opciones = Object.entries(INFORMES)
    .map(([id, def]) => `<option value="${id}" ${id === _informeActual ? 'selected' : ''}>${esc(def.nombre)}</option>`)
    .join('');

  cont.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select id="informe-select" onchange="seleccionarInforme(this.value)" style="flex:1;min-width:260px;padding:8px">${opciones}</select>
        <div id="informe-campo-tecnico" style="display:none"></div>
        <div id="informe-campo-cliente" style="display:none"></div>
        <div id="informe-campo-estado-reporte" style="display:none"></div>
        <label id="informe-campo-desde" style="font-size:12px;color:var(--text-muted);display:none;align-items:center;gap:4px">Desde <input type="date" id="informe-desde" onchange="recalcularInforme()"></label>
        <label id="informe-campo-hasta" style="font-size:12px;color:var(--text-muted);display:none;align-items:center;gap:4px">Hasta <input type="date" id="informe-hasta" onchange="recalcularInforme()"></label>
        <div id="informe-campo-periodo-rapido" style="display:none;gap:4px;align-items:center">
          <button class="btn-cancel" style="padding:5px 10px;font-size:12px" onclick="setPeriodoRapido('este-mes')">📅 Este mes</button>
          <button class="btn-cancel" style="padding:5px 10px;font-size:12px" onclick="setPeriodoRapido('mes-anterior')">⬅️ Mes anterior</button>
        </div>
        <div id="informe-campo-archivados" style="display:none">
          <button id="fs-toggle-archivados" class="btn-cancel" style="padding:7px 12px;font-size:13px"
            onclick="toggleFueraSitioArchivados()">📦 Ver archivados</button>
        </div>
        <button class="btn-save" onclick="exportarInformeExcel()">⬇️ Exportar a Excel</button>
      </div>
    </div>
    <div id="informe-tabla" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:auto"></div>
  `;
  actualizarCamposInforme();
}

function actualizarCamposInforme() {
  const def = INFORMES[_informeActual];
  if (!def) return;
  const campos = def.campos || [];

  const wrapTec = document.getElementById('informe-campo-tecnico');
  if (campos.includes('tecnico')) {
    if (!wrapTec.dataset.built) {
      wrapTec.innerHTML = `<select id="informe-tecnico" onchange="recalcularInforme()" style="min-width:200px;padding:8px">
        <option value="">Selecciona un técnico...</option>
        ${TEAM.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
      </select>`;
      wrapTec.dataset.built = '1';
    }
    wrapTec.style.display = '';
  } else if (wrapTec) wrapTec.style.display = 'none';

  const wrapCli = document.getElementById('informe-campo-cliente');
  if (campos.includes('cliente')) {
    const clientes = obtenerClientesUnicos();
    wrapCli.innerHTML = `<input type="text" id="informe-cliente" placeholder="🔍 Buscar cliente..."
      oninput="recalcularInforme()"
      list="informe-clientes-list"
      autocomplete="off"
      style="min-width:220px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text)">
      <datalist id="informe-clientes-list">
        ${clientes.map(c => `<option value="${esc(c)}">`).join('')}
      </datalist>`;
    wrapCli.style.display = '';
  } else if (wrapCli) wrapCli.style.display = 'none';

  const wrapEstadoRep = document.getElementById('informe-campo-estado-reporte');
  if (campos.includes('estadoReporte')) {
    if (!wrapEstadoRep.dataset.built) {
      wrapEstadoRep.innerHTML = `<select id="informe-estado-reporte" onchange="recalcularInforme()" style="min-width:190px;padding:8px">
        <option value="">Todos los estados</option>
        <option value="activo">⏳ En curso (sin checkout)</option>
        <option value="sin_reporte">🚫 Sin reporte</option>
        <option value="no_enviado">❌ No enviado (en curso + sin reporte)</option>
        <option value="enviado">✅ Enviado</option>
      </select>`;
      wrapEstadoRep.dataset.built = '1';
    }
    wrapEstadoRep.style.display = '';
  } else if (wrapEstadoRep) wrapEstadoRep.style.display = 'none';

  const wrapDesde = document.getElementById('informe-campo-desde');
  const wrapHasta = document.getElementById('informe-campo-hasta');
  if (wrapDesde) wrapDesde.style.display = campos.includes('desde') ? 'flex' : 'none';
  if (wrapHasta) wrapHasta.style.display = campos.includes('hasta') ? 'flex' : 'none';
  const wrapPeriodo = document.getElementById('informe-campo-periodo-rapido');
  if (wrapPeriodo) wrapPeriodo.style.display = campos.includes('desde') ? 'flex' : 'none';

  // Toggle archivados: solo visible en el informe de checks fuera de sitio
  const wrapArch = document.getElementById('informe-campo-archivados');
  if (wrapArch) {
    if (_informeActual === 'fuera_sitio') {
      wrapArch.style.display = '';
      // Resetear al cambiar de informe
      _fueraSitioArchivados = false;
      const btn = document.getElementById('fs-toggle-archivados');
      if (btn) btn.textContent = '📦 Ver archivados';
    } else {
      wrapArch.style.display = 'none';
    }
  }

  recalcularInforme();
}

function seleccionarInforme(id) {
  _informeActual = id;
  actualizarCamposInforme();
}

let _informeReqId = 0; // secuencia para descartar respuestas async fuera de orden

function recalcularInforme() {
  const def = INFORMES[_informeActual];
  if (!def) return;
  const filtros = {
    tecnico: document.getElementById('informe-tecnico')?.value || '',
    cliente: document.getElementById('informe-cliente')?.value || '',
    desde: document.getElementById('informe-desde')?.value || '',
    hasta: document.getElementById('informe-hasta')?.value || '',
    estadoReporte: document.getElementById('informe-estado-reporte')?.value || '',
  };
  const tablaEl = document.getElementById('informe-tabla');
  if (!tablaEl) return;

  // Informe asíncrono (ej. llegadas tardías): renderTardiasHTML devuelve Promise<HTML>
  // Cada tecla escrita en "cliente" dispara una llamada nueva; si una respuesta
  // vieja (nombre a medio escribir) llega después de la más reciente, se descarta
  // para no pisar el resultado bueno con uno vacío.
  if (def.customAsync) {
    const reqId = ++_informeReqId;
    def.customAsync(filtros).then(html => {
      if (reqId !== _informeReqId) return;
      if (tablaEl) tablaEl.innerHTML = html;
    });
    return;
  }

  const resultado = def.calcular ? (def.calcular(filtros) || { columnas: [], filas: [] }) : { columnas: [], filas: [] };
  _informeColumnas = resultado.columnas;
  _informeFilas = resultado.filas;
  tablaEl.innerHTML = def.custom ? def.custom(filtros) : renderTablaInformeHTML(_informeColumnas, _informeFilas);
}

// Abre la tarjeta de una tarea desde una fila de informe y cambia a su pestaña de área.
function abrirTarjetaInforme(tareaId, area) {
  if (!tareaId) return;
  openModal(tareaId);
  if (area) setArea(area);
}

function renderTablaInformeHTML(columnas, filas) {
  if (!filas || !filas.length) {
    return '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Sin datos para los filtros seleccionados.</div>';
  }
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>${columnas.map(c => `<th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(fila => `<tr>${columnas.map((c, i) => {
      const val = formatCeldaInforme(fila[c.key], c.tipo);
      if (i === 0 && fila._tarea_id) {
        return `<td style="padding:7px 10px;border-bottom:1px solid var(--border);cursor:pointer;color:var(--primary);font-weight:600" onclick="abrirTarjetaInforme('${esc(fila._tarea_id)}','${esc(fila._tarea_area || '')}')" title="Abrir tarjeta">${val}</td>`;
      }
      return `<td style="padding:7px 10px;border-bottom:1px solid var(--border)">${val}</td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function formatCeldaInforme(v, tipo) {
  if (v === null || v === undefined || v === '') return '-';
  if (tipo === 'moneda') return esc(formatCOP(Number(v) || 0));
  return esc(String(v));
}

async function exportarInformeExcel() {
  if (!_informeFilas.length) { alert('No hay datos para exportar.'); return; }
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const aoa = [_informeColumnas.map(c => c.label)];
  _informeFilas.forEach(fila => {
    aoa.push(_informeColumnas.map(c => {
      const v = fila[c.key];
      if (c.tipo === 'moneda') return Number(v) || 0;
      return v === null || v === undefined ? '' : v;
    }));
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Informe');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `informe-${_informeActual}-${fecha}.xlsx`);
}
// ===================== FIN INFORMES =====================

// ===================== INFORME PARA CLIENTE (PDF) =====================
let _icData       = null;        // último resultado del endpoint
let _icOcultos    = new Set();   // reporte_ids excluidos de la vista/PDF
let _icCacheKey   = '';          // detectar cambio de filtros
let _icRedondear  = false;       // checkbox redondear horas al 30min más cercano

async function renderInformeClientePDF(filtros) {
  const cacheKey = filtros.cliente + '|' + filtros.desde + '|' + filtros.hasta;

  if (!filtros.cliente) {
    return '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">Selecciona un cliente para generar el informe.</div>';
  }
  if (!filtros.desde || !filtros.hasta) {
    return '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">Selecciona el rango de fechas.</div>';
  }

  // Reset excluded visits when filters change
  if (_icCacheKey !== cacheKey) {
    _icOcultos  = new Set();
    _icCacheKey = cacheKey;
    _icData     = null;
  }

  if (!_icData) {
    const tablaEl = document.getElementById('informe-tabla');
    if (tablaEl) tablaEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">⏳ Cargando...</div>';
    // Ensure _clientes is populated
    if ((!_clientes || !_clientes.length) && typeof cargarClientes === 'function') {
      await cargarClientes();
    }
    try {
      const params = new URLSearchParams({ cliente: filtros.cliente, fecha_inicio: filtros.desde, fecha_fin: filtros.hasta });
      const res  = await fetch(API_BASE + '/informe_cliente.php?' + params);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      _icData = data;
    } catch(e) {
      return '<div style="padding:24px;text-align:center;color:#dc2626;font-size:13px">Error: ' + esc(e.message) + '</div>';
    }
  }

  const clienteInfo  = (_clientes || []).find(c => c.nombre.toLowerCase() === (filtros.cliente || '').toLowerCase());
  const tieneContrato = !!(clienteInfo && clienteInfo.contrato_horas_mes != null);
  return _renderInformeClienteHTML(_icData, tieneContrato);
}

function _icToggleSoloContrato() {
  if (!_icData) return;
  const ci = (_clientes || []).find(c => c.nombre.toLowerCase() === (_icData.cliente_nombre || '').toLowerCase());
  const el = document.getElementById('informe-tabla');
  if (el) el.innerHTML = _renderInformeClienteHTML(_icData, !!(ci && ci.contrato_horas_mes != null));
}

function _icToggleOculto(reporteId) {
  if (_icOcultos.has(reporteId)) { _icOcultos.delete(reporteId); } else { _icOcultos.add(reporteId); }
  if (!_icData) return;
  const ci = (_clientes || []).find(c => c.nombre.toLowerCase() === (_icData.cliente_nombre || '').toLowerCase());
  const el = document.getElementById('informe-tabla');
  if (el) el.innerHTML = _renderInformeClienteHTML(_icData, !!(ci && ci.contrato_horas_mes != null));
}

function _icToggleRedondear() {
  _icRedondear = !!(document.getElementById('ic-redondear') || {}).checked;
  if (!_icData) return;
  const ci = (_clientes || []).find(c => c.nombre.toLowerCase() === (_icData.cliente_nombre || '').toLowerCase());
  const el = document.getElementById('informe-tabla');
  if (el) el.innerHTML = _renderInformeClienteHTML(_icData, !!(ci && ci.contrato_horas_mes != null));
}

function _renderInformeClienteHTML(data, tieneContrato) {
  const soloContratoChecked = tieneContrato && !!(document.getElementById('ic-solo-contrato') || {}).checked;

  let visitas = data.visitas || [];
  if (soloContratoChecked) visitas = visitas.filter(v => v.es_contrato);

  const visibles = visitas.filter(v => !_icOcultos.has(v.reporte_id));

  function redondearP(min, modalidad) {
    if (!_icRedondear || modalidad !== 'en_sitio') return min || 0;
    return Math.max(60, Math.round((min || 0) / 30) * 30);
  }
  function totalHH(lista) {
    return lista.reduce((s, v) => s + v.participantes.reduce((ps, p) => ps + redondearP(p.duracion_minutos, v.modalidad), 0), 0);
  }
  const totalMin = totalHH(visibles);
  const thV = Math.floor(totalMin / 60), tmV = totalMin % 60;
  const tecUnicos = [...new Set(visibles.flatMap(v => v.participantes.map(p => p.tecnico_nombre || p.tecnico_id)))].filter(Boolean);

  function fmtFecha(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.slice(0, 10).split('-');
    const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const dt = new Date(+y, +m - 1, +d);
    return dias[dt.getDay()] + ' ' + (+d) + ' de ' + meses[+m - 1] + ' de ' + y;
  }
  function fmtHora(dt)  { return dt ? dt.slice(11, 16) : '-'; }
  function fmtMin(min)  {
    if (min === null || min === undefined) return '-';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? h + 'h ' + String(m).padStart(2, '0') + 'm' : m + 'm';
  }
  function periodoLabel(fi, ff) {
    if (!fi || !ff) return fi + ' – ' + ff;
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const [yi, mi] = fi.split('-'), [yf, mf] = ff.split('-');
    if (yi === yf && mi === mf) return meses[+mi - 1] + ' ' + yi;
    if (yi === yf) return meses[+mi - 1] + ' – ' + meses[+mf - 1] + ' ' + yi;
    return meses[+mi - 1] + ' ' + yi + ' – ' + meses[+mf - 1] + ' ' + yf;
  }

  const periodo = periodoLabel(data.fecha_inicio, data.fecha_fin);

  const contratoToggle = tieneContrato
    ? '<label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text-secondary);cursor:pointer">'
    + '<input type="checkbox" id="ic-solo-contrato"' + (soloContratoChecked ? ' checked' : '')
    + ' onchange="_icToggleSoloContrato()"'
    + ' style="width:15px;height:15px;accent-color:#169BBC;cursor:pointer">'
    + 'Solo visitas de contrato</label>'
    : '';
  const redondearToggle = '<label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text-secondary);cursor:pointer">'
    + '<input type="checkbox" id="ic-redondear"' + (_icRedondear ? ' checked' : '')
    + ' onchange="_icToggleRedondear()"'
    + ' style="width:15px;height:15px;accent-color:#169BBC;cursor:pointer">'
    + 'Redondear horas</label>';

  const statCards = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">'
    + '<div style="background:var(--surface-1);border-radius:8px;padding:13px 16px">'
    + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Horas hombre</div>'
    + '<div style="font-size:22px;font-weight:500;color:var(--text-primary)">' + thV + 'h ' + String(tmV).padStart(2,'0') + 'm</div></div>'
    + '<div style="background:var(--surface-1);border-radius:8px;padding:13px 16px">'
    + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Visitas incluidas</div>'
    + '<div style="font-size:22px;font-weight:500;color:var(--text-primary)">' + visibles.length
    + (_icOcultos.size > 0 ? '<span style="font-size:13px;color:var(--text-muted);font-weight:400"> / ' + visitas.length + '</span>' : '')
    + '</div></div>'
    + '<div style="background:var(--surface-1);border-radius:8px;padding:13px 16px">'
    + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Técnicos</div>'
    + '<div style="font-size:22px;font-weight:500;color:var(--text-primary)">' + tecUnicos.length + '</div></div>'
    + '</div>';

  if (!visitas.length) {
    return '<div style="padding:24px">'
      + (contratoToggle ? '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">' + contratoToggle + '</div>' : '')
      + '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:40px 0">Sin visitas completadas para este cliente en el período seleccionado.</div>'
      + '</div>';
  }

  const visitasHTML = visitas.map(function(v) {
    const oculta = _icOcultos.has(v.reporte_id);
    const minHH  = v.participantes.reduce(function(s, p) { return s + redondearP(p.duracion_minutos, v.modalidad); }, 0);

    const contratoBadge = v.es_contrato
      ? '<span style="background:#e0f2fe;color:#0369a1;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:500;margin-left:6px">Contrato</span>'
      : '';
    const modalidadBadge = v.modalidad === 'en_sitio'
      ? '<span style="background:#ecfdf5;color:#065f46;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:500;margin-left:6px">📍 En sitio</span>'
      : v.modalidad === 'remoto'
      ? '<span style="background:#eff6ff;color:#1e40af;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:500;margin-left:6px">💻 Remoto</span>'
      : '';

    const tecsList = v.participantes.map(function(p) {
      return '<span style="display:inline-flex;align-items:center;gap:5px;background:var(--surface-1);border:0.5px solid var(--border);border-radius:99px;padding:3px 10px;font-size:12px;color:var(--text-secondary);margin:2px">'
        + '<span style="width:6px;height:6px;border-radius:50%;background:#169BBC;flex-shrink:0"></span>'
        + esc(p.tecnico_nombre || p.tecnico_id) + ' · ' + esc(fmtHora(p.check_in)) + '–' + esc(fmtHora(p.check_out))
        + ' <span style="color:var(--text-muted)">(' + esc(fmtMin(redondearP(p.duracion_minutos, v.modalidad))) + ')</span>'
        + '</span>';
    }).join('');

    const descHTML = v.descripcion_acciones
      ? '<div style="margin-top:10px"><div style="font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Actividades realizadas</div>'
      + '<div style="font-size:13px;color:var(--text-primary);line-height:1.55">' + esc(v.descripcion_acciones) + '</div></div>' : '';

    const matHTML = v.materiales && v.materiales.trim()
      ? '<div style="margin-top:8px"><div style="font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Materiales utilizados</div>'
      + '<div style="font-size:13px;color:var(--text-primary);line-height:1.55">' + esc(v.materiales.trim()) + '</div></div>' : '';

    const pendHTML = v.pendientes
      ? '<div style="margin-top:8px"><span style="display:inline-block;background:#FFF4E0;color:#A06A00;font-size:12px;padding:3px 10px;border-radius:12px">' + esc(v.pendientes) + '</span></div>' : '';

    return '<div id="ic-visit-' + v.reporte_id + '" style="padding:15px 20px;border-bottom:0.5px solid var(--border);' + (oculta ? 'opacity:0.38;' : '') + '">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:9px">'
      + '<div><div style="font-size:14px;font-weight:500;color:var(--text-primary)">' + esc(fmtFecha(v.fecha_visita)) + contratoBadge + modalidadBadge + '</div>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">' + esc(v.titulo) + '</div></div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px">'
      + '<span style="background:#D6F3F4;color:#0D3B40;font-size:13px;font-weight:500;padding:3px 11px;border-radius:99px">' + esc(fmtMin(minHH)) + '</span>'
      + '<button title="' + (oculta ? 'Incluir en PDF' : 'Excluir del PDF') + '" onclick="_icToggleOculto(\'' + v.reporte_id + '\')"'
      + ' style="background:none;border:0.5px solid var(--border);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:14px;color:var(--text-secondary);line-height:1">'
      + (oculta ? '👁️' : '🙈') + '</button></div></div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:2px">' + tecsList + '</div>'
      + descHTML + matHTML + pendHTML
      + '</div>';
  }).join('');

  return '<div style="padding:16px 20px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">'
    + '<div><div style="font-size:18px;font-weight:500;color:var(--text-primary)">' + esc(data.cliente_nombre) + '</div>'
    + '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px">' + esc(periodo) + ' · ' + visibles.length + ' visita' + (visibles.length !== 1 ? 's' : '') + '</div></div>'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
    + contratoToggle
    + redondearToggle
    + '<button onclick="generarInformeClientePDF()" style="background:#169BBC;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer">🖨️ Guardar PDF</button>'
    + '</div></div>'
    + statCards
    + '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;padding-left:2px">Usa 🙈 para excluir visitas del PDF · 👁️ para volver a incluirlas</div>'
    + '</div>'
    + '<div style="background:var(--surface-2);border-top:0.5px solid var(--border)">' + visitasHTML + '</div>';
}

function generarInformeClientePDF() {
  if (!_icData) return;
  const ci = (_clientes || []).find(c => c.nombre.toLowerCase() === (_icData.cliente_nombre || '').toLowerCase());
  const tieneContrato = !!(ci && ci.contrato_horas_mes != null);
  const soloContrato  = tieneContrato && !!(document.getElementById('ic-solo-contrato') || {}).checked;

  let visitas = _icData.visitas || [];
  if (soloContrato) visitas = visitas.filter(v => v.es_contrato);
  const visibles = visitas.filter(v => !_icOcultos.has(v.reporte_id));

  const _redPDF = !!_icRedondear;
  function redPDF(min, modalidad) {
    if (!_redPDF || modalidad !== 'en_sitio') return min || 0;
    return Math.max(60, Math.round((min || 0) / 30) * 30);
  }
  const totalMin = visibles.reduce((s, v) => s + v.participantes.reduce((ps, p) => ps + redPDF(p.duracion_minutos, v.modalidad), 0), 0);
  const thV = Math.floor(totalMin / 60), tmV = totalMin % 60;
  const tecUnicos = [...new Set(visibles.flatMap(v => v.participantes.map(p => p.tecnico_nombre || p.tecnico_id)))].filter(Boolean);

  function fmtH(dt)  { return dt ? dt.slice(11, 16) : '-'; }
  function fmtM(min) {
    if (min === null || min === undefined) return '-';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? h + 'h ' + String(m).padStart(2, '0') + 'm' : m + 'm';
  }
  function fmtFechaPDF(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.slice(0, 10).split('-');
    const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const dt = new Date(+y, +m - 1, +d);
    return dias[dt.getDay()] + ' ' + (+d) + ' de ' + meses[+m - 1] + ' de ' + y;
  }
  function periodoLabelPDF(fi, ff) {
    if (!fi || !ff) return fi + ' – ' + ff;
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const [yi, mi] = fi.split('-'), [yf, mf] = ff.split('-');
    if (yi === yf && mi === mf) return meses[+mi - 1] + ' ' + yi;
    if (yi === yf) return meses[+mi - 1] + ' – ' + meses[+mf - 1] + ' ' + yi;
    return meses[+mi - 1] + ' ' + yi + ' – ' + meses[+mf - 1] + ' ' + yf;
  }
  function escHTML(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  const periodo  = periodoLabelPDF(_icData.fecha_inicio, _icData.fecha_fin);
  const fechaGen = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric', timeZone:'America/Bogota' });

  const visitasHTML = visibles.map(v => {
    const minHH = v.participantes.reduce((s, p) => s + redPDF(p.duracion_minutos, v.modalidad), 0);
    const badge = v.es_contrato ? '<span class="badge-contrato">Contrato</span>' : '';
    const badgeMod = v.modalidad === 'en_sitio' ? '<span class="badge-sitio">📍 En sitio</span>' : v.modalidad === 'remoto' ? '<span class="badge-remoto">💻 Remoto</span>' : '';
    const tecs  = v.participantes.map(p =>
      '<span class="tech-pill"><span class="tech-dot"></span>'
      + escHTML(p.tecnico_nombre || p.tecnico_id) + ' &middot; ' + escHTML(fmtH(p.check_in)) + '&ndash;' + escHTML(fmtH(p.check_out))
      + ' (' + escHTML(fmtM(redPDF(p.duracion_minutos, v.modalidad))) + ')</span>'
    ).join('');
    const desc = v.descripcion_acciones
      ? '<div class="sb"><div class="sl">Actividades realizadas</div><div class="st">' + escHTML(v.descripcion_acciones) + '</div></div>' : '';
    const mat  = v.materiales
      ? '<div class="sb"><div class="sl">Materiales utilizados</div><div class="st">' + escHTML(v.materiales) + '</div></div>' : '';
    const pend = v.pendientes
      ? '<div class="sb"><div class="sl">Pendientes</div><div class="pend">' + escHTML(v.pendientes) + '</div></div>' : '';
    return '<div class="vc">'
      + '<div class="vh"><div><div class="vd">' + escHTML(fmtFechaPDF(v.fecha_visita)) + badge + badgeMod + '</div>'
      + '<div class="vt">' + escHTML(v.titulo) + '</div></div>'
      + '<div class="vhh">' + escHTML(fmtM(minHH)) + '</div></div>'
      + '<div class="techs">' + tecs + '</div>'
      + desc + mat + pend + '</div>';
  }).join('');

  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
    + '<title>Informe – ' + escHTML(_icData.cliente_nombre) + ' – ' + escHTML(periodo) + '</title>'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;background:#fff;padding:18mm 20mm}'
    + '@page{size:A4;margin:0}'
    + '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    + '.rh{background:#0D3B40;color:#fff;padding:20px 22px 16px;border-radius:6px;margin-bottom:12px}'
    + '.bl{display:flex;align-items:center;gap:8px;margin-bottom:10px}'
    + '.bd{width:20px;height:20px;background:#169BBC;border-radius:4px}'
    + '.bn{font-size:10px;font-weight:600;color:#D6F3F4;letter-spacing:.6px;text-transform:uppercase}'
    + '.rt{font-size:17px;font-weight:600;color:#fff;margin-bottom:2px}'
    + '.rp{font-size:11px;color:#D6F3F4}'
    + '.rm{display:flex;gap:8px;margin-top:10px}'
    + '.mp{background:rgba(255,255,255,.12);border-radius:99px;padding:3px 10px;font-size:10px;color:#D6F3F4}'
    + '.sb2{display:grid;grid-template-columns:repeat(3,1fr);background:#169BBC;border-radius:6px;margin-bottom:12px;overflow:hidden}'
    + '.si{padding:11px 14px;text-align:center;border-right:1px solid rgba(255,255,255,.2)}'
    + '.si:last-child{border-right:none}'
    + '.sn{font-size:17px;font-weight:700;color:#fff}'
    + '.sl2{font-size:9px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.4px;margin-top:2px}'
    + '.stl{font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;padding:0 0 7px;border-bottom:1px solid #e2e8f0;margin-bottom:0}'
    + '.vc{padding:11px 0;border-bottom:.5px solid #e2e8f0;page-break-inside:avoid}'
    + '.vc:last-child{border-bottom:none}'
    + '.vh{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px}'
    + '.vd{font-size:13px;font-weight:600;color:#0f172a}'
    + '.vt{font-size:11px;color:#64748b;margin-top:1px}'
    + '.vhh{background:#D6F3F4;color:#0D3B40;font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px;white-space:nowrap;flex-shrink:0;margin-left:10px}'
    + '.techs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px}'
    + '.tech-pill{display:inline-flex;align-items:center;gap:4px;background:#f8fafc;border:.5px solid #e2e8f0;border-radius:99px;padding:2px 8px;font-size:11px;color:#475569}'
    + '.tech-dot{width:5px;height:5px;border-radius:50%;background:#169BBC;flex-shrink:0}'
    + '.badge-contrato{background:#e0f2fe;color:#0369a1;font-size:9px;padding:1px 7px;border-radius:99px;font-weight:600;margin-left:6px;vertical-align:middle}'
    + '.sb{margin-top:5px}'
    + '.sl{font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}'
    + '.st{font-size:11px;color:#0f172a;line-height:1.5;text-align:justify}'
    + '.badge-sitio{background:#d1fae5;color:#065f46;font-size:9px;padding:1px 7px;border-radius:99px;font-weight:600;margin-left:5px;vertical-align:middle}'
    + '.badge-remoto{background:#dbeafe;color:#1e40af;font-size:9px;padding:1px 7px;border-radius:99px;font-weight:600;margin-left:5px;vertical-align:middle}'
    + '.pend{display:inline-block;background:#FFF4E0;color:#92400e;font-size:10px;padding:2px 8px;border-radius:8px}'
    + '.ft{margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}'
    + '</style></head><body>'
    + '<div class="rh"><div class="bl"><div class="bd"></div><span class="bn">Grupo Innovate — Informe de servicio</span></div>'
    + '<div class="rt">' + escHTML(_icData.cliente_nombre) + '</div>'
    + '<div class="rp">' + escHTML(periodo) + '</div>'
    + '<div class="rm"><span class="mp">Generado: ' + escHTML(fechaGen) + '</span>'
    + '<span class="mp">' + visibles.length + ' visita' + (visibles.length !== 1 ? 's' : '') + ' incluida' + (visibles.length !== 1 ? 's' : '') + '</span></div></div>'
    + '<div class="sb2">'
    + '<div class="si"><div class="sn">' + thV + 'h ' + String(tmV).padStart(2,'0') + 'm</div><div class="sl2">Horas hombre</div></div>'
    + '<div class="si"><div class="sn">' + visibles.length + '</div><div class="sl2">Visitas realizadas</div></div>'
    + '<div class="si"><div class="sn">' + tecUnicos.length + '</div><div class="sl2">Técnicos asignados</div></div>'
    + '</div>'
    + '<div class="stl">Detalle de visitas</div>'
    + visitasHTML
    + '<div class="ft"><span>Grupo Innovate · info@innovate.com.co</span><span>Ginno — Sistema de Gestión</span></div>'
    + '<script>setTimeout(function(){window.print();},400);<\/script>'
    + '</body></html>';

  const win = window.open('', '_blank');
  if (!win) { alert('Permite ventanas emergentes para generar el PDF.'); return; }
  win.document.write(html);
  win.document.close();
}
// ===================== FIN INFORME PARA CLIENTE =====================

function setPeriodoRapido(tipo) {
  const hoy = new Date();
  let d, h;
  if (tipo === 'este-mes') {
    d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    h = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  } else { // mes-anterior
    d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    h = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  }
  const fmt = dt => dt.toISOString().slice(0, 10);
  const elD = document.getElementById('informe-desde');
  const elH = document.getElementById('informe-hasta');
  if (elD) elD.value = fmt(d);
  if (elH) elH.value = fmt(h);
  recalcularInforme();
}

