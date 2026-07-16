const STORAGE_KEY = 'cowork_tareas_v4';

// ===================== CONEXIÓN A BACKEND (cPanel) =====================
// Si está vacío, la app funciona en modo local (localStorage), igual que hoy.
// Cuando se publique en cPanel, poner la URL del backend, ej:
//   const API_BASE = 'https://tudominio.com/backend/api';
const API_BASE = 'https://grupoinnovate.com/ginno/backend/api';

function taskToApi(t) {
  return {
    id: t.id, titulo: t.titulo, desc: t.desc, area: t.area, estado: t.estado,
    cliente: t.cliente, fechaProg: t.fechaProg, horaProg: t.horaProg || '08:00', diasProg: t.diasProg || 1, fecha: t.fecha, tiempo: t.tiempo,
    tiempoReal: t.tiempoReal, recursos: t.recursos, notas: t.notas,
    reporte: t.reporte, modalidad: t.modalidad || null, factura: t.factura, motivoNoFactura: t.motivoNoFactura || null, team: t.team || [],
    seguimientoFecha: t.seguimientoFecha || null, seguimientoHistorial: t.seguimientoHistorial || [],
    laborAdmin: t.laborAdmin || '', solicitudComercial: t.solicitudComercial || '',
    adminTaskId: t.adminTaskId || null, comercialTaskId: t.comercialTaskId || null,
    cotizacionDocx: t.cotizacionDocx || null,
    programadoAt: t.programadoAt || null,
    reporteArchivo: t.reporteArchivo || null,
    incluyeProg: t.incluyeProg ? 1 : 0,
    tipoTarea: t.tipoTarea || 'evento',
    avisarCliente: t.avisarCliente !== false ? 1 : 0,
    reporteInterno: t.reporteInterno ? 1 : 0,
  };
}

function apiToTask(r) {
  let seguimientoHistorial = [];
  try { seguimientoHistorial = r.seguimiento_historial ? JSON.parse(r.seguimiento_historial) : []; } catch { seguimientoHistorial = []; }
  return {
    id: r.id, titulo: r.titulo, desc: r.descripcion, area: r.area, estado: r.estado,
    cliente: r.cliente, fechaProg: (r.fecha_programacion && r.fecha_programacion !== '0000-00-00') ? r.fecha_programacion : '', fecha: (r.fecha_limite && r.fecha_limite !== '0000-00-00') ? r.fecha_limite : '',
    tiempo: r.tiempo_estimado, tiempoReal: r.tiempo_real, recursos: r.recursos,
    notas: r.notas, reporte: r.reporte, modalidad: r.modalidad || null, factura: r.factura, motivoNoFactura: r.motivo_no_factura || null, team: r.team || [],
    diasProg: parseInt(r.dias_programacion) || 1,
    horaProg: r.hora_programacion || '08:00',
    createdAt: r.creado_en, updatedAt: r.actualizado_en,
    realizadoAt: r.realizado_en, enviadaAt: r.enviada_en, programadoAt: r.programado_en,
    seguimientoFecha: r.seguimiento_fecha, seguimientoHistorial,
    laborAdmin: r.solicitud_admin || '', solicitudComercial: r.solicitud_comercial || '',
    adminTaskId: r.admin_tarea_id || null, comercialTaskId: r.comercial_tarea_id || null,
    cotizacionDocx: r.cotizacion_docx || null,
    reporteArchivo: r.reporte_archivo || null,
    incluyeProg: r.incluye_prog == 1,
    tipoTarea: r.tipo_tarea || 'evento',
    avisarCliente: r.avisar_cliente == null ? true : r.avisar_cliente == 1,
    reporteInterno: r.reporte_interno == 1,
  };
}

async function syncTask(task, isNew) {
  if (!API_BASE) return;
  try {
    const url = isNew ? `${API_BASE}/tareas.php` : `${API_BASE}/tareas.php?id=${task.id}`;
    const res = await fetch(url, { method: isNew?'POST':'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(taskToApi(task)) });
    if (!res.ok) {
      let msg = `Error del servidor (${res.status})`;
      try { const d = await res.json(); if (d.error) msg = d.error; } catch {}
      throw new Error(msg);
    }
  } catch (e) { console.error('Error guardando en servidor', e); alert('No se pudo guardar en el servidor: ' + e.message); }
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

// TEAM se carga dinámicamente desde la BD vía loadTeam() al iniciar la app.
// Este arreglo estático sirve como fallback cuando API_BASE está vacío (modo local/dev).
let TEAM = [
  { id: 'CAC', name: 'Carlos Andrés Cuervo', initials: 'CAC', color: '#7c3aed' },
  { id: 'AZ',  name: 'Alejandro Zuñiga',     initials: 'AZ',  color: '#0891b2' },
  { id: 'JG',  name: 'Jorge Guerrero',        initials: 'JG',  color: '#059669' },
  { id: 'SG',  name: 'Sebastian Gamboa',      initials: 'SG',  color: '#d97706' },
  { id: 'BN',  name: 'Brandon Naranjo',       initials: 'BN',  color: '#dc2626' },
  { id: 'RB',  name: 'Robert Benitez',        initials: 'RB',  color: '#db2777' },
];

// Carga el equipo desde la API y actualiza el arreglo global TEAM.
// Se llama en iniciarApp() antes de cargar tareas para que los avatares
// y pickers reflejen los usuarios reales de la BD (incluye nuevos/editados).
async function loadTeam() {
  if (!API_BASE) return; // modo local: se usa el fallback estático de arriba
  try {
    const res  = await fetch(`${API_BASE}/usuarios.php`);
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    TEAM = rows
      .filter(u => u.activo == 1)
      .map(u => ({
        id:       u.id,
        name:     u.nombre,
        initials: u.iniciales,
        color:    u.color || '#94a3b8',
        perfil:   u.perfil,
      }));
  } catch (e) {
    console.error('Error cargando equipo desde API, usando fallback estático:', e);
  }
}

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
    {id:'solicitud',       label:'Pendientes 📋'},
    {id:'programado',      label:'En ejecución 🔧'},
    {id:'por_reprogramar', label:'Por reprogramar 🔁', noColumn: true},
    {id:'realizado',       label:'Por facturar 🧾'},
    {id:'facturado',       label:'Facturado ✅'},
  ],
  if: [
    {id:'solicitud',       label:'Pendientes 📋'},
    {id:'programado',      label:'En ejecución 🔧'},
    {id:'por_reprogramar', label:'Por reprogramar 🔁', noColumn: true},
    {id:'realizado',       label:'Por facturar 🧾'},
    {id:'facturado',       label:'Facturado ✅'},
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
  const isAdmin = typeof currentUser !== 'undefined' && currentUser?.perfil === 'admin';
  const flow = AREA_FLOWS[area] || AREA_FLOWS.admin;
  return flow.map(c => {
    if (c.id === 'por_reprogramar' && !isAdmin)
      return `<option value="${c.id}" disabled hidden>${c.label}</option>`;
    return `<option value="${c.id}">${c.label}</option>`;
  }).join('') + `<option value="archivado">Archivado</option>`;
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

// ===================== DÍAS HÁBILES (festivos Colombia) =====================

// Pascua (algoritmo anónimo de Meeus/Jones/Butcher)
function _pascua(anio) {
  const a=anio%19,b=Math.floor(anio/100),c=anio%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const mes=Math.floor((h+l-7*m+114)/31)-1, dia=((h+l-7*m+114)%31)+1;
  return new Date(anio, mes, dia);
}

// Siguiente lunes (o mismo día si ya es lunes) — Ley Emiliani
function _nextLunes(d) {
  const r = new Date(d);
  const dow = r.getDay();
  if (dow !== 1) r.setDate(r.getDate() + ((8 - dow) % 7 || 7));
  return r;
}

const _festivosCache = {};
function _festivosColombia(anio) {
  if (_festivosCache[anio]) return _festivosCache[anio];
  const s = new Set();
  const add = d => s.add(d.toISOString().split('T')[0]);
  const addD = (base, n) => { const r=new Date(base); r.setDate(r.getDate()+n); return r; };
  // Fijos
  add(new Date(anio, 0,  1));  // Año Nuevo
  add(new Date(anio, 4,  1));  // Día del Trabajo
  add(new Date(anio, 6, 20));  // Independencia
  add(new Date(anio, 7,  7));  // Batalla de Boyacá
  add(new Date(anio,11,  8));  // Inmaculada Concepción
  add(new Date(anio,11, 25));  // Navidad
  // Ley Emiliani (siguiente lunes)
  add(_nextLunes(new Date(anio, 0,  6)));  // Reyes Magos
  add(_nextLunes(new Date(anio, 2, 19)));  // San José
  add(_nextLunes(new Date(anio, 5, 29)));  // San Pedro y San Pablo
  add(_nextLunes(new Date(anio, 7, 15)));  // Asunción
  add(_nextLunes(new Date(anio, 9, 12)));  // Día de la Raza
  add(_nextLunes(new Date(anio,10,  1)));  // Todos los Santos
  add(_nextLunes(new Date(anio,10, 11)));  // Independencia de Cartagena
  // Semana Santa y móviles (relativos a Pascua)
  const pascua = _pascua(anio);
  add(addD(pascua, -3));               // Jueves Santo
  add(addD(pascua, -2));               // Viernes Santo
  add(_nextLunes(addD(pascua,  39)));  // Ascensión
  add(_nextLunes(addD(pascua,  60)));  // Corpus Christi
  add(_nextLunes(addD(pascua,  68)));  // Sagrado Corazón de Jesús
  return (_festivosCache[anio] = s);
}

function esDiaHabil(fecha) {
  const dow = fecha.getDay();
  if (dow === 0 || dow === 6) return false;
  return !_festivosColombia(fecha.getFullYear()).has(fecha.toISOString().split('T')[0]);
}

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
    if (esDiaHabil(cur)) dias++;
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

// Tareas visibles para el usuario actual: un técnico solo ve las tarjetas
// donde está asignado en el equipo (t.team incluye su id). Admin ve todas.
function tareasVisibles() {
  if (currentUser && currentUser.perfil === 'tecnico') {
    return tasks.filter(t => (t.team||[]).includes(currentUser.id));
  }
  return tasks;
}

// ===================== PROGRAMACIÓN TÉCNICA =====================

// Calcula la fecha de fin de la programación de una tarea (días hábiles desde fechaProg).
// diasProg=1 → mismo día; diasProg=2 → un día hábil después, etc.
function fechaProgFin(t) {
  if (!t.fechaProg) return null;
  const dias = (t.diasProg || 1) - 1;
  if (dias <= 0) return t.fechaProg;
  const d = new Date(t.fechaProg + 'T00:00:00');
  let agregados = 0;
  while (agregados < dias) {
    d.setDate(d.getDate() + 1);
    if (esDiaHabil(d)) agregados++;
  }
  return d.toISOString().split('T')[0];
}

// Devuelve true si fechaISO cae dentro del rango de programación de t.
function enRangoProg(t, fechaISO) {
  if (!t.fechaProg || t.fechaProg > fechaISO) return false;
  const fin = fechaProgFin(t) || t.fechaProg;
  return fechaISO <= fin;
}

// Para tareas multi-día, devuelve el día actual dentro del rango programado (1-based).
// Retorna null si diasProg <= 1 o si no hay fechaProg.
function diaActualEnProg(t) {
  if (!t.fechaProg || (t.diasProg || 1) <= 1) return null;
  const inicio = new Date(t.fechaProg + 'T00:00:00');
  const hoy    = new Date();
  hoy.setHours(0,0,0,0);
  inicio.setHours(0,0,0,0);
  let dia = 1; // día 1 = fecha de inicio
  const cur = new Date(inicio);
  while (cur < hoy) {
    cur.setDate(cur.getDate() + 1);
    if (esDiaHabil(cur)) dia++;
  }
  return Math.min(dia, t.diasProg); // nunca supera el total
}

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
  const items = tasks.filter(t => ['it','if'].includes(t.area) && ['solicitud','programado'].includes(t.estado) && enRangoProg(t, fechaISO));
  const adminItems = tasks.filter(t => ['it','if'].includes(t.area) && enRangoProg(t, fechaISO) && (t.laborAdmin||'').trim());
  const adminProgItems = tasks.filter(t => t.area === 'admin' && t.incluyeProg && enRangoProg(t, fechaISO));
  if (!items.length && !adminItems.length && !adminProgItems.length) return `🗓️ Programación técnica – ${fechaTxt}\n\nNo hay trabajos programados para este día.`;

  // Agrupar IT/IF por equipo asignado
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
    g.tasks.slice().sort((a,b) => (a.horaProg||'99:99').localeCompare(b.horaProg||'99:99')).forEach(t => {
      out += `📍 ${t.cliente || 'Sin cliente'}${t.horaProg ? `  🕗 ${t.horaProg}` : ''}\n`;
      if (t.desc) out += `📝 ${t.desc}\n`;
      out += `🔧 ${t.titulo}\n`;
      if (t.recursos) out += `   ${t.recursos}\n`;
    });
  });

  // Sección Administrativo: tareas IT/IF con laborAdmin
  if (adminItems.length) {
    out += `\n👷 Administrativo\n`;
    adminItems.forEach(t => {
      out += `📍 ${t.cliente || 'Sin cliente'}\n`;
      out += `🔧 ${t.titulo}\n`;
      out += `🗂 ${t.laborAdmin}\n`;
    });
  }

  // Sección Administrativo: tareas del área Admin marcadas con "Incluir en programación"
  if (adminProgItems.length) {
    if (!adminItems.length) out += `\n👷 Administrativo\n`;
    adminProgItems.forEach(t => {
      out += `📍 ${t.cliente || 'Sin cliente'}\n`;
      if (t.desc) out += `📝 ${t.desc}\n`;
      out += `🗂 ${t.titulo}\n`;
      if (t.recursos) out += `   ${t.recursos}\n`;
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
