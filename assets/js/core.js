const STORAGE_KEY = 'cowork_tareas_v4';

// ===================== CONEXIÓN A BACKEND (cPanel) =====================
// Si está vacío, la app funciona en modo local (localStorage), igual que hoy.
// Cuando se publique en cPanel, poner la URL del backend, ej:
//   const API_BASE = 'https://tudominio.com/backend/api';
const API_BASE = 'https://grupoinnovate.com/gestion/backend/api';

function taskToApi(t) {
  return {
    id: t.id, titulo: t.titulo, desc: t.desc, area: t.area, estado: t.estado,
    cliente: t.cliente, fechaProg: t.fechaProg, fecha: t.fecha, tiempo: t.tiempo,
    tiempoReal: t.tiempoReal, recursos: t.recursos, notas: t.notas,
    reporte: t.reporte, factura: t.factura, team: t.team || [],
    seguimientoFecha: t.seguimientoFecha || null, seguimientoHistorial: t.seguimientoHistorial || [],
    laborAdmin: t.laborAdmin || '', solicitudComercial: t.solicitudComercial || '',
    adminTaskId: t.adminTaskId || null, comercialTaskId: t.comercialTaskId || null,
    cotizacionDocx: t.cotizacionDocx || null,
    programadoAt: t.programadoAt || null,
    reporteArchivo: t.reporteArchivo || null,
  };
}

function apiToTask(r) {
  let seguimientoHistorial = [];
  try { seguimientoHistorial = r.seguimiento_historial ? JSON.parse(r.seguimiento_historial) : []; } catch { seguimientoHistorial = []; }
  return {
    id: r.id, titulo: r.titulo, desc: r.descripcion, area: r.area, estado: r.estado,
    cliente: r.cliente, fechaProg: (r.fecha_programacion && r.fecha_programacion !== '0000-00-00') ? r.fecha_programacion : '', fecha: (r.fecha_limite && r.fecha_limite !== '0000-00-00') ? r.fecha_limite : '',
    tiempo: r.tiempo_estimado, tiempoReal: r.tiempo_real, recursos: r.recursos,
    notas: r.notas, reporte: r.reporte, factura: r.factura, team: r.team || [],
    createdAt: r.creado_en, updatedAt: r.actualizado_en,
    realizadoAt: r.realizado_en, enviadaAt: r.enviada_en, programadoAt: r.programado_en,
    seguimientoFecha: r.seguimiento_fecha, seguimientoHistorial,
    laborAdmin: r.solicitud_admin || '', solicitudComercial: r.solicitud_comercial || '',
    adminTaskId: r.admin_tarea_id || null, comercialTaskId: r.comercial_tarea_id || null,
    cotizacionDocx: r.cotizacion_docx || null,
    reporteArchivo: r.reporte_archivo || null,
  };
}

async function syncTask(task, isNew) {
  if (!API_BASE) return;
  try {
    const url = isNew ? `${API_BASE}/tareas.php` : `${API_BASE}/tareas.php?id=${task.id}`;
    await fetch(url, { method: isNew?'POST':'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(taskToApi(task)) });
  } catch (e) { console.error('Error guardando en servidor', e); alert('No se pudo guardar en el servidor. Revisa tu conexión.'); }
}

async function syncDelete(id) {
  if (!API_BASE) return;
  try { await fetch(`${API_BASE}/tareas.php?id=${id}`, { method: 'DELETE' }); }
  catch (e) { console.error('Error eliminando en servidor', e); alert('No se pudo eliminar en el servidor.'); }
}

async function syncEstado(id) {
  const t = tasks.find(x=>x.id===id);
  if (t) await syncTask(t, false);
}
// ===================== FIN CONEXIÓN A BACKEND =====================

const TEAM = [
  { id: 'CAC', name: 'Carlos Andrés Cuervo', initials: 'CAC', color: '#7c3aed', role: 'Gerente' },
  { id: 'AZ',  name: 'Alejandro Zuñiga',     initials: 'AZ',  color: '#0891b2' },
  { id: 'JG',  name: 'Jorge Guerrero',        initials: 'JG',  color: '#059669' },
  { id: 'SG',  name: 'Sebastian Gamboa',      initials: 'SG',  color: '#d97706' },
  { id: 'BN',  name: 'Brandon Naranjo',       initials: 'BN',  color: '#dc2626' },
  { id: 'RB',  name: 'Robert Benitez',        initials: 'RB',  color: '#db2777' },
];

const AREAS = {
  it:       { label: 'IT',            color: '#6366f1' },
  if:       { label: 'IF',            color: '#f97316' },
  admin:    { label: 'Administrativo',color: '#10b981' },
  comercial:{ label: 'Comercial',     color: '#3b82f6' },
};

const AREA_FLOWS = {
  comercial: [
    {id:'por-cotizar',label:'Por cotizar 📝'},
    {id:'enviada',    label:'Enviada 📤'},
    {id:'aprobada',   label:'Aprobada ✅'},
    {id:'rechazada',  label:'Rechazada ❌'},
  ],
  it: [
    {id:'solicitud',  label:'Pendientes 📋'},
    {id:'programado', label:'En ejecución 🔧'},
    {id:'realizado',  label:'Por facturar 🧾'},
    {id:'facturado',  label:'Facturado ✅'},
  ],
  if: [
    {id:'solicitud',  label:'Pendientes 📋'},
    {id:'programado', label:'En ejecución 🔧'},
    {id:'realizado',  label:'Por facturar 🧾'},
    {id:'facturado',  label:'Facturado ✅'},
  ],
  admin: [
    {id:'pendiente',    label:'Pendiente'},
    {id:'en-progreso',  label:'En progreso'},
    {id:'bloqueada',    label:'Bloqueada'},
    {id:'por-facturar', label:'Por facturar 🧾'},
  ],
};

function getColsForArea(area) {
  if (area === 'all') {
    // Union of all flows (deduplicated by id)
    const seen = new Set();
    return Object.values(AREA_FLOWS).flat().filter(c => seen.has(c.id) ? false : seen.add(c.id));
  }
  return AREA_FLOWS[area] || AREA_FLOWS.admin;
}

function getEstadoOptions(area) {
  const flow = AREA_FLOWS[area] || AREA_FLOWS.admin;
  return flow.map(c => `<option value="${c.id}">${c.label}</option>`).join('') +
    `<option value="archivado">Archivado</option>`;
}

function updateEstadoOptions(keepValue) {
  const area = document.getElementById('f-area').value;
  const sel  = document.getElementById('f-est');
  const prev = keepValue || sel.value;
  sel.innerHTML = getEstadoOptions(area);
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  toggleFacturaField(sel.value);
  const t = editingId ? tasks.find(x=>x.id===editingId) : null;
  renderSeguimientoSection(t, sel.value);
  toggleAprobarAreaGroup(area, sel.value);
}

let tasks = [];
let editingId = null;
let currentView = 'dashboard';
let currentArea = 'it';
let selectedTeam = []; // ids

async function load() {
  if (!API_BASE) {
    try { tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { tasks = []; }
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/tareas.php`);
    const rows = await res.json();
    tasks = rows.map(apiToTask);
  } catch (e) { console.error('Error cargando tareas', e); tasks = []; alert('No se pudo conectar con el servidor.'); }
}
function save() { if (!API_BASE) localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isVencida(t) { if (!t.fecha || ['por-facturar','archivado'].includes(t.estado)) return false; return t.fecha < new Date().toISOString().split('T')[0]; }

function diasHabilesDesde(isoDate) {
  if (!isoDate) return 0;
  const inicio = new Date(isoDate);
  const hoy = new Date();
  let dias = 0;
  const cur = new Date(inicio);
  cur.setHours(0,0,0,0);
  hoy.setHours(0,0,0,0);
  while (cur < hoy) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) dias++; // skip sat/sun
  }
  return dias;
}

function alertaFacturacion(t) {
  const enFacturacion = (['it','if'].includes(t.area) && t.estado === 'realizado')
    || (t.area === 'admin' && t.estado === 'por-facturar');
  if (!enFacturacion) return null;
  const dias = diasHabilesDesde(t.realizadoAt);
  return { dias, vencido: dias >= 2 };
}

// Tarjetas operativas (IT/IF) en "Pendientes" sin fecha de programación.
// Devuelve { dias, vencido } (vencido = 2+ días hábiles sin programar) o null si no aplica.
function alertaProgramacion(t) {
  if (!['it','if'].includes(t.area) || t.estado !== 'solicitud' || t.fechaProg) return null;
  const dias = diasHabilesDesde(t.createdAt);
  return { dias, vencido: dias >= 2 };
}

// Tarjetas comerciales en "Por cotizar".
// Devuelve { dias, vencido } (vencido = 3+ días hábiles sin cotizar) o null si no aplica.
function alertaPorCotizar(t) {
  if (t.area !== 'comercial' || t.estado !== 'por-cotizar') return null;
  const dias = diasHabilesDesde(t.createdAt);
  return { dias, vencido: dias >= 3 };
}
function getMember(id) { return TEAM.find(m=>m.id===id); }

// ===================== PROGRAMACIÓN TÉCNICA =====================
function nombreCorto(id) {
  const m = getMember(id);
  return m ? m.name.split(' ')[0] : id;
}

function formatFechaLarga(fechaISO) {
  if (!fechaISO) return '';
  const d = new Date(fechaISO + 'T00:00:00');
  const txt = d.toLocaleDateString('es-CO', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function generarProgramacion(fechaISO) {
  const fechaTxt = formatFechaLarga(fechaISO);
  const items = tasks.filter(t => ['it','if'].includes(t.area) && ['solicitud','programado'].includes(t.estado) && t.fechaProg === fechaISO);
  const adminItems = tasks.filter(t => ['it','if'].includes(t.area) && t.fechaProg === fechaISO && (t.laborAdmin||'').trim());
  if (!items.length && !adminItems.length) return `🗓️ Programación técnica – ${fechaTxt}\n\nNo hay trabajos programados para este día.`;

  // Agrupar por equipo asignado (mismo conjunto de técnicos)
  const grupos = new Map();
  items.forEach(t => {
    const team = (t.team||[]).slice().sort();
    const key = team.join(',');
    if (!grupos.has(key)) grupos.set(key, { team, tasks: [] });
    grupos.get(key).tasks.push(t);
  });

  let out = `🗓️ Programación técnica – ${fechaTxt}\n`;
  grupos.forEach(g => {
    const tecnicos = g.team.map(nombreCorto).join(', ');
    out += `\n👷 ${tecnicos || 'Sin asignar'}\n`;
    g.tasks.forEach(t => {
      out += `📍 ${t.cliente || 'Sin cliente'}\n`;
      if (t.desc) out += `📝 ${t.desc}\n`;
      out += `🔧 ${t.titulo}\n`;
      if (t.recursos) out += `   ${t.recursos}\n`;
    });
  });

  if (adminItems.length) {
    out += `\n👷 Administrativo\n`;
    adminItems.forEach(t => {
      out += `📍 ${t.cliente || 'Sin cliente'}\n`;
      out += `🔧 ${t.titulo}\n`;
      out += `🗂 ${t.laborAdmin}\n`;
    });
  }

  return out.trim();
}

function openProgModal() {
  document.getElementById('prog-fecha').value = tomorrowISO();
  renderProgPreview();
  document.getElementById('prog-modal').classList.add('open');
}

function closeProgModal() {
  document.getElementById('prog-modal').classList.remove('open');
}

function renderProgPreview() {
  const fecha = document.getElementById('prog-fecha').value;
  document.getElementById('prog-preview').value = generarProgramacion(fecha);
}

function copiarProgramacion() {
  const txt = document.getElementById('prog-preview').value;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.getElementById('btn-copiar-prog');
    const orig = btn.textContent;
    btn.textContent = '✅ Copiado';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}
// ===================== FIN PROGRAMACIÓN TÉCNICA =====================
