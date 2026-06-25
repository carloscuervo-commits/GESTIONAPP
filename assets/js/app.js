// Inject task if not already present (solo en modo local; en modo API los datos viven en la BD)
function migrarSeedLocal(){
  if (API_BASE) return;
  // Migrate: infra → if
  tasks = tasks.map(t => t.area==='infra' ? {...t, area:'if'} : t);
  // Migrate: fix client + area on CCTV task; no date → solicitud
  tasks = tasks.map(t => t.id==='init_cctv_suplus' ? {...t, cliente:'Industrias Suplas S.A.S', categoria:'', area:'if', estado:'solicitud'} : t);
  // Migrate: IT/IF tasks with programado but no date → solicitud
  tasks = tasks.map(t => ['it','if'].includes(t.area) && t.estado==='programado' && !t.fechaProg ? {...t, estado:'solicitud'} : t);
  // Migrate: cotizaciones comerciales pendiente → enviada
  tasks = tasks.map(t => t.area==='comercial' && t.estado==='pendiente' ? {...t, estado:'enviada'} : t);

  // Inject cotizaciones comerciales
  const cotizaciones = [
    { id:'cot_mirador_cctv',    titulo:'Cotización CCTV',                       cliente:'Mirador del Rio' },
    { id:'cot_segovia_cctv',    titulo:'Cotización actualización CCTV',          cliente:'Segovia' },
    { id:'cot_segovia_veh',     titulo:'Cotización automatización vehicular',    cliente:'Segovia' },
    { id:'cot_granate_cctv',    titulo:'Cotización actualización CCTV',          cliente:'Granate' },
  ];
  cotizaciones.forEach(c => {
    if (!tasks.find(t=>t.id===c.id)) {
      tasks.push({
        ...c,
        desc:'', team:['CAC'], area:'comercial',
        estado:'enviada',
        fechaProg:'', fecha:'', tiempo:'', tiempoReal:'',
        recursos:'', notas:'', factura:'',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });
  save();
  const tid = 'init_cctv_suplus';
  if (!tasks.find(t=>t.id===tid)) {
    tasks.unshift({
      id: tid,
      titulo: 'Mantenimiento CCTV (Circuito Cerrado de Televisión)',
      desc: '',
      team: ['JG','BN'],
      area: 'if',
      estado: 'solicitud',

      cliente: 'Industrias Suplas S.A.S',
      categoria: '',
      fechaProg: '',
      fecha: '',
      tiempo: '',
      tiempoReal: '',
      recursos: '',
      notas: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    save();
  }
}

async function iniciarApp(){
  // Limpiar filtros que el navegador pudo haber restaurado (bfcache / session restore)
  const searchEl = document.getElementById('search');
  if (searchEl) searchEl.value = '';
  const estadoEl = document.getElementById('f-estado');
  if (estadoEl) estadoEl.value = '';
  const respEl = document.getElementById('f-responsable');
  if (respEl) respEl.value = '';

  await loadTeam(); // carga equipo desde BD antes de renderizar tareas
  await load();
  loadCartera();
  updateCarteraCount();
  migrarSeedLocal();
  await cargarVisitasActivas();
  aplicarPermisosUI();
  iniciarAlarmaChecker();
  iniciarAutoSync();
  setView(currentUser && currentUser.perfil === 'tecnico' ? 'kanban' : 'dashboard');
}

// pageshow dispara tanto en carga normal como al restaurar desde bfcache.
// Chrome rellena los inputs DESPUÉS de DOMContentLoaded, así que hay que
// limpiarlos aquí (no solo en iniciarApp) para evitar que "carcuervo" u
// otro valor guardado en la sesión anterior reaparezca en el filtro.
window.addEventListener('pageshow', () => {
  const ids = ['search', 'f-estado', 'f-responsable'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
});

// ===================== AUTO-SYNC (polling cada 20s) =====================
// Recarga tareas y visitas activas en segundo plano para que todos los
// usuarios vean los cambios de los demás sin necesidad de refrescar.
// Se salta el ciclo si hay un modal de edición abierto (para no
// interrumpir lo que el usuario está escribiendo) o si la pestaña
// no está visible (ahorra tráfico cuando la app está en segundo plano).

const AUTO_SYNC_INTERVALO = 20000; // ms
let _autoSyncActivo = false;

async function autoSync() {
  if (!API_BASE) return;
  if (!currentUser) return;
  if (document.visibilityState === 'hidden') return;
  // No sincronizar si hay un modal de edición abierto
  const modalesEdicion = ['modal', 'reporte-modal'];
  if (modalesEdicion.some(id => document.getElementById(id)?.classList.contains('open'))) return;

  try {
    await load();
    render();
    // cargarVisitasActivas también llama render() internamente
    await cargarVisitasActivas();
  } catch (e) {
    // Error de red silencioso — el usuario sigue trabajando con los datos que tiene
    console.warn('Auto-sync falló (sin conexión?):', e);
  }
}

function iniciarAutoSync() {
  if (_autoSyncActivo) return;
  _autoSyncActivo = true;
  setInterval(autoSync, AUTO_SYNC_INTERVALO);
}
// ===================== FIN AUTO-SYNC =====================

(async function init(){
  // Si no hay sesión válida, cargarSesion() muestra la pantalla de login
  // y devuelve false; iniciarApp() se llama desde auth.js al loguearse.
  const sesionOk = await cargarSesion();
  if (!sesionOk) return;
  await iniciarApp();
})();
