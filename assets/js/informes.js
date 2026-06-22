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

const ETIQUETAS_ESTADO_REPORTE = { en_visita: '🟢 En visita', borrador: '📝 Borrador (sin enviar)', enviado: '✅ Enviado' };

// --------------------------------------------------------------
// 1) Actividades de un técnico por rango de fechas
// --------------------------------------------------------------
function calcActividadesTecnico(filtros) {
  if (!filtros.tecnico) {
    return { columnas: [{ key: 'msg', label: 'Mensaje' }], filas: [{ msg: 'Selecciona un técnico arriba para ver sus actividades.' }] };
  }
  const filas = informesReportesVisita
    .filter(r => (r.tecnico_checkin_id === filtros.tecnico || r.tecnico_checkout_id === filtros.tecnico)
      && dentroDeRango(r.check_in, filtros.desde, filtros.hasta))
    .map(r => ({
      fecha: (r.check_in || '').slice(0, 10),
      cliente: r.cliente || '-',
      tarea: r.titulo || '-',
      checkIn: r.check_in ? r.check_in.slice(11, 16) : '-',
      checkOut: r.check_out ? r.check_out.slice(11, 16) : '-',
      duracion: formatDuracionMin(r.check_in, r.check_out),
      estado: ETIQUETAS_ESTADO_REPORTE[r.estado] || r.estado,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  return {
    columnas: [
      { key: 'fecha', label: 'Fecha' }, { key: 'cliente', label: 'Cliente' }, { key: 'tarea', label: 'Tarea' },
      { key: 'checkIn', label: 'Check-in' }, { key: 'checkOut', label: 'Check-out' },
      { key: 'duracion', label: 'Duración' }, { key: 'estado', label: 'Estado del reporte' },
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
    .filter(t => (t.cliente || '').trim() === filtros.cliente)
    .map(t => ({
      area: (AREAS[t.area] || {}).label || t.area,
      tarea: t.titulo || '-',
      estado: (AREA_FLOWS[t.area] || []).find(e => e.id === t.estado)?.label || t.estado,
      tecnicos: (t.team || []).map(nombreCorto).join(', ') || '-',
      fechaCreacion: (t.createdAt || '').slice(0, 10) || '-',
      fechaProgramacion: t.fechaProg || '-',
      factura: t.factura || '-',
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
    .filter(f => !filtros.cliente || (f.cliente_nombre || '').trim() === filtros.cliente)
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
function calcReportesBusqueda(filtros) {
  // Versión plana (sin botones) usada para exportar a Excel.
  const filas = informesReportesVisita
    .filter(r => dentroDeRango(r.check_in, filtros.desde, filtros.hasta))
    .filter(r => !filtros.cliente || (r.cliente || '').trim() === filtros.cliente)
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
    .filter(r => !filtros.cliente || (r.cliente || '').trim() === filtros.cliente)
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
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc((r.check_in || '').slice(0, 10))}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(r.cliente || '-')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(r.titulo || '-')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${esc(getMember(r.tecnico_checkin_id)?.name || r.tecnico_checkin_id || '-')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border)">${ETIQUETAS_ESTADO_REPORTE[r.estado] || esc(r.estado)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap">
        <button class="btn-cancel" style="padding:4px 8px;font-size:12px" onclick="continuarReporte('${r.id}')">✏️ Editar</button>
        ${r.pdf_archivo ? `<a href="${API_BASE}/reporte_pdf.php?id=${r.id}" target="_blank" class="btn-save" style="padding:4px 8px;font-size:12px;text-decoration:none;display:inline-block;margin-left:6px">⬇️ PDF</a>` : ''}
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// --------------------------------------------------------------
// Registro de informes
// --------------------------------------------------------------
const INFORMES = {
  actividades_tecnico: { nombre: '👷 Actividades de un técnico', campos: ['tecnico', 'desde', 'hasta'], calcular: calcActividadesTecnico },
  tarjetas_cliente: { nombre: '📋 Tarjetas de un cliente', campos: ['cliente'], calcular: calcTarjetasCliente },
  facturas_modulo: { nombre: '🧾 Facturas generadas (módulo Facturación)', campos: ['desde', 'hasta', 'cliente'], calcular: calcFacturasModulo },
  reportes_busqueda: { nombre: '🔍 Reportes de tarjetas operativas', campos: ['desde', 'hasta', 'cliente'], calcular: calcReportesBusqueda, custom: renderReportesBusquedaHTML },
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
        <label id="informe-campo-desde" style="font-size:12px;color:var(--text-muted);display:none;align-items:center;gap:4px">Desde <input type="date" id="informe-desde" onchange="recalcularInforme()"></label>
        <label id="informe-campo-hasta" style="font-size:12px;color:var(--text-muted);display:none;align-items:center;gap:4px">Hasta <input type="date" id="informe-hasta" onchange="recalcularInforme()"></label>
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
    if (!wrapCli.dataset.built) {
      const clientes = obtenerClientesUnicos();
      wrapCli.innerHTML = `<select id="informe-cliente" onchange="recalcularInforme()" style="min-width:220px;padding:8px">
        <option value="">Selecciona un cliente...</option>
        ${clientes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>`;
      wrapCli.dataset.built = '1';
    }
    wrapCli.style.display = '';
  } else if (wrapCli) wrapCli.style.display = 'none';

  const wrapDesde = document.getElementById('informe-campo-desde');
  const wrapHasta = document.getElementById('informe-campo-hasta');
  if (wrapDesde) wrapDesde.style.display = campos.includes('desde') ? 'flex' : 'none';
  if (wrapHasta) wrapHasta.style.display = campos.includes('hasta') ? 'flex' : 'none';

  recalcularInforme();
}

function seleccionarInforme(id) {
  _informeActual = id;
  actualizarCamposInforme();
}

function recalcularInforme() {
  const def = INFORMES[_informeActual];
  if (!def) return;
  const filtros = {
    tecnico: document.getElementById('informe-tecnico')?.value || '',
    cliente: document.getElementById('informe-cliente')?.value || '',
    desde: document.getElementById('informe-desde')?.value || '',
    hasta: document.getElementById('informe-hasta')?.value || '',
  };
  const resultado = def.calcular ? (def.calcular(filtros) || { columnas: [], filas: [] }) : { columnas: [], filas: [] };
  _informeColumnas = resultado.columnas;
  _informeFilas = resultado.filas;
  const tablaEl = document.getElementById('informe-tabla');
  if (!tablaEl) return;
  tablaEl.innerHTML = def.custom ? def.custom(filtros) : renderTablaInformeHTML(_informeColumnas, _informeFilas);
}

function renderTablaInformeHTML(columnas, filas) {
  if (!filas || !filas.length) {
    return '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Sin datos para los filtros seleccionados.</div>';
  }
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>${columnas.map(c => `<th style="text-align:left;padding:9px 10px;border-bottom:2px solid var(--border);background:var(--bg)">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(fila => `<tr>${columnas.map(c => `<td style="padding:7px 10px;border-bottom:1px solid var(--border)">${formatCeldaInforme(fila[c.key], c.tipo)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function formatCeldaInforme(v, tipo) {
  if (v === null || v === undefined || v === '') return '-';
  if (tipo === 'moneda') return esc(formatCOP(Number(v) || 0));
  return esc(String(v));
}

function exportarInformeExcel() {
  if (!_informeFilas.length) { alert('No hay datos para exportar.'); return; }
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
