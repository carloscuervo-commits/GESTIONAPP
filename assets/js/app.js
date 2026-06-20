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
  await load();
  loadCartera();
  updateCarteraCount();
  migrarSeedLocal();
  await cargarVisitasActivas();
  aplicarPermisosUI();
  setView(currentUser && currentUser.perfil === 'tecnico' ? 'kanban' : 'dashboard');
}

(async function init(){
  // Si no hay sesión válida, cargarSesion() muestra la pantalla de login
  // y devuelve false; iniciarApp() se llama desde auth.js al loguearse.
  const sesionOk = await cargarSesion();
  if (!sesionOk) return;
  await iniciarApp();
})();
