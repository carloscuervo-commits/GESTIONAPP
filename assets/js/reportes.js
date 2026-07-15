// ===================== REPORTES DE VISITA (check-in/out + plantillas) =====================
// Diseño: un reporte se crea al "Iniciar visita" (check_in) y se completa
// al "Finalizar visita" (check_out + formulario). El campo "datos" del
// reporte guarda en JSON los campos propios de cada plantilla, así que
// agregar plantillas nuevas en el futuro no requiere cambios de backend,
// solo agregar una entrada aquí en PLANTILLAS_REPORTE.

const PLANTILLAS_REPORTE = {
  evento: {
    id: 'evento',
    nombre: 'Reporte de evento (mantenimiento / instalación)',
    secciones: [
      { id: 'fotos_inicial',        tipo: 'fotos',       label: '1) Estado inicial del evento (Foto)' },
      { id: 'fotos_final',          tipo: 'fotos',       label: '2) Estado final del evento (Foto)' },
      { id: 'descripcion_acciones', tipo: 'texto_largo', label: '3) Describa de forma detallada las acciones llevadas a cabo durante el evento.' },
      { id: 'materiales',           tipo: 'texto_largo', label: '4) Indique los materiales o equipos utilizados durante el evento.' },
      { id: 'pendientes',           tipo: 'texto_largo', label: '5) Describa cualquier actividad o requerimiento pendiente que deba resolverse post-evento.' },
      { id: 'firma_cliente',        tipo: 'firma',       label: '6) Firma de Conformidad del Cliente' },
    ],
  },
};

let visitasActivas = {};   // tareaId -> reporte en estado 'en_visita'
let borradoresActivos = {}; // tareaId -> [array de reportes en estado 'borrador']
let reportesEnviados = new Set(); // tarea_ids con al menos un reporte enviado (para bloquear "Iniciar visita" en tareas de un solo día)
let reporteActual = null;  // reporte abierto en el formulario

// ----------------- Carga inicial -----------------
async function cargarVisitasActivas() {
  if (!API_BASE) return;
  try {
    const [enVisita, borradores, enviados] = await Promise.all([
      fetch(`${API_BASE}/reportes.php?estado=en_visita`).then(r => r.json()),
      fetch(`${API_BASE}/reportes.php?estado=borrador`).then(r => r.json()),
      fetch(`${API_BASE}/reportes.php?tarea_ids_enviados=1`).then(r => r.json()),
    ]);
    visitasActivas = {};
    (Array.isArray(enVisita) ? enVisita : []).forEach(r => { visitasActivas[r.tarea_id] = r; });
    borradoresActivos = {};
    (Array.isArray(borradores) ? borradores : []).forEach(r => {
      if (!borradoresActivos[r.tarea_id]) borradoresActivos[r.tarea_id] = [];
      borradoresActivos[r.tarea_id].push(r);
    });
    reportesEnviados = new Set(Array.isArray(enviados) ? enviados : []);
    render();
  } catch (e) { console.error('Error cargando visitas activas', e); }
}

// ----------------- Info horas de contrato (async) -----------------
async function _cargarHorasContratoCard(tareaId, elId) {
  if (!API_BASE) return;
  try {
    const res = await fetch(`${API_BASE}/reportes.php?horasContrato=1&tareaId=${tareaId}`);
    const d = await res.json();
    const el = document.getElementById(elId);
    if (!el) return;
    if (d && d.horasContratadas > 0) {
      const disponibles = d.horasDisponibles;
      const color = disponibles > 0 ? '#16a34a' : '#ef4444';
      el.innerHTML = `<span style="color:${color};font-weight:600">📋 Contrato: ${d.horasContratadas}h/mes · Disponibles: ${disponibles}h</span>`;
    }
  } catch {}
}

// ----------------- Botón en la tarjeta (multi-técnico) -----------------
function renderVisitaBoton(t) {
  const visita = visitasActivas[t.id];
  if (visita) {
    const partes = visita.participantes || [];
    let html = '';
    // Horas de contrato disponibles (si aplica)
    if (t.tipoTarea === 'contrato') {
      const infoId = `contrato-info-activa-${t.id}`;
      setTimeout(() => _cargarHorasContratoCard(t.id, infoId), 0);
      html += `<div id="${infoId}" style="font-size:12px;color:var(--text-muted);margin-bottom:4px"></div>`;
    }

    // Mostrar estado de cada participante (con indicador de pausa activa)
    partes.forEach(p => {
      const nombre = getMember(p.tecnico_id)?.name || p.tecnico_id || 'Técnico';
      if (!p.check_out) {
        const pausaActiva = (p.pausas || []).find(x => !x.pausa_fin);
        if (pausaActiva) {
          html += `<div class="task-date" style="color:#f59e0b;font-weight:600">⏸️ ${esc(nombre)} · EN PAUSA desde ${formatHora(pausaActiva.pausa_inicio)}</div>`;
        } else {
          html += `<div class="task-date" style="color:#16a34a;font-weight:600">🟢 ${esc(nombre)} · desde ${formatHora(p.check_in)}</div>`;
        }
      } else {
        const durNeta = calcularDuracionNeta(p.check_in, p.check_out, p.pausas);
        const minPausa = minutosEnPausas(p.pausas);
        const pausaLabel = minPausa > 0 ? ` (−${minPausa}min pausa)` : '';
        html += `<div class="task-date" style="color:#94a3b8;font-size:12px">✅ ${esc(nombre)}: ${formatHora(p.check_in)} – ${formatHora(p.check_out)} · ${durNeta}${pausaLabel}</div>`;
      }
    });

    const esAdmin = currentUser?.perfil === 'admin';

    if (esAdmin) {
      // Admin: pausa/reanuda + finalizar por cada participante activo + agregar técnico
      partes.filter(p => !p.check_out).forEach(p => {
        const nombre = getMember(p.tecnico_id)?.name || 'Técnico';
        const pausaActiva = (p.pausas || []).find(x => !x.pausa_fin);
        if (pausaActiva) {
          html += `<button class="btn-archivar" style="background:#16a34a;color:#fff;margin-top:4px"
            onclick="reanudarVisita('${t.id}','${p.id}',event)">▶️ Reanudar: ${esc(nombre)}</button>`;
        } else {
          html += `<button class="btn-archivar" style="background:#f59e0b;color:#fff;margin-top:4px"
            onclick="abrirPausaModal('${t.id}','${p.id}',event)">⏸️ Pausar: ${esc(nombre)}</button>`;
        }
        html += `<button class="btn-archivar" style="background:#64748b;color:#fff;margin-top:2px"
          onclick="finalizarVisitaParticipante('${t.id}','${p.id}',event)">🏁 Finalizar: ${esc(nombre)}</button>`;
      });
      html += `<button class="btn-archivar" style="background:#16a34a;color:#fff;margin-top:4px"
        onclick="iniciarVisita('${t.id}',event)">➕ Agregar técnico</button>`;
    } else {
      // Técnico: solo su propio participante
      const miPart = currentUser
        ? partes.find(p => p.tecnico_id === currentUser.id && !p.check_out)
        : null;
      if (miPart) {
        const pausaActiva = (miPart.pausas || []).find(x => !x.pausa_fin);
        if (pausaActiva) {
          html += `<div class="task-date" style="color:#92400e;font-size:12px;margin-bottom:2px">📝 ${esc(pausaActiva.justificacion)}</div>`;
          html += `<button class="btn-archivar" style="background:#16a34a;color:#fff"
            onclick="reanudarVisita('${t.id}','${miPart.id}',event)">▶️ Reanudar visita</button>`;
        } else {
          html += `<button class="btn-archivar" style="background:#f59e0b;color:#fff"
            onclick="abrirPausaModal('${t.id}','${miPart.id}',event)">⏸️ Pausar visita</button>`;
        }
        html += `<button class="btn-archivar" style="background:#64748b;color:#fff;margin-top:2px"
          onclick="finalizarVisitaParticipante('${t.id}','${miPart.id}',event)">🏁 Finalizar mi visita</button>`;
      } else if (currentUser && !partes.find(p => p.tecnico_id === currentUser.id)) {
        // No ha registrado llegada todavía
        html += `<button class="btn-archivar" style="background:#16a34a;color:#fff"
          onclick="iniciarVisita('${t.id}',event)">🚀 Iniciar mi visita</button>`;
      }
    }
    return html;
  }

  const borradoresList = borradoresActivos[t.id] || [];
  if (borradoresList.length > 0) {
    const hoyISO = new Date().toLocaleDateString('sv', { timeZone: 'America/Bogota' });
    const deHoy      = borradoresList.filter(b => (b.check_in || b.creado_en || '').substring(0, 10) === hoyISO);
    const anteriores = borradoresList.filter(b => (b.check_in || b.creado_en || '').substring(0, 10) !== hoyISO);
    let html = '';
    // Borradores de días anteriores — uno por día
    anteriores.forEach(b => {
      const fecha = (b.check_in || b.creado_en || '').substring(0, 10);
      html += `<button class="btn-archivar" style="background:#6366f1;color:#fff" onclick="continuarReporte('${b.id}',event)">📝 Reporte pendiente ${fecha}</button>`;
    });
    // Borrador de hoy (si existe)
    deHoy.forEach(b => {
      html += `<button class="btn-archivar" style="background:#6366f1;color:#fff" onclick="continuarReporte('${b.id}',event)">📝 Continuar reporte</button>`;
    });
    // Tarea multi-día sin visita de hoy → permitir nuevo check-in
    if (deHoy.length === 0 && ((t.diasProg || 1) > 1 || t.fechaProg === new Date().toLocaleDateString('sv', { timeZone: 'America/Bogota' }))) {
      html += `<button class="btn-archivar" style="background:#16a34a;color:#fff" onclick="iniciarVisita('${t.id}',event)">🚀 Iniciar visita hoy</button>`;
    }
    // Admin: si hay miembros del equipo que no han llegado hoy, mostrar botón de registro
    if (currentUser?.perfil === 'admin' && deHoy.length > 0) {
      const participantesHoyIds = new Set(
        deHoy.flatMap(b => (b.participantes || [])
          .filter(p => (p.check_in || '').substring(0, 10) === hoyISO)
          .map(p => p.tecnico_id))
      );
      const sinLlegar = (t.team || []).filter(uid => !participantesHoyIds.has(uid));
      if (sinLlegar.length > 0) {
        const nombres = sinLlegar.map(uid => getMember(uid)?.name || uid).join(', ');
        html += `<button class="btn-archivar" style="background:#16a34a;color:#fff;margin-top:4px"
          onclick="iniciarVisita('${t.id}',event)">➕ Registrar llegada: ${esc(nombres)}</button>`;
      }
    }
    return html;
  }
  // Tarea de un solo día cuyo reporte ya fue enviado → no ofrecer nueva visita
  if ((t.diasProg || 1) <= 1 && reportesEnviados.has(t.id)) {
    return `<div class="task-date" style="color:#16a34a;font-weight:600;font-size:12px">✅ Visita completada</div>`;
  }
  // Si es tarea de contrato, mostrar horas disponibles antes del botón
  if (t.tipoTarea === 'contrato') {
    const infoId = `contrato-info-card-${t.id}`;
    setTimeout(() => _cargarHorasContratoCard(t.id, infoId), 0);
    return `<div id="${infoId}" style="font-size:12px;color:var(--text-muted);margin-bottom:4px"></div>`
         + `<button class="btn-archivar" style="background:#16a34a;color:#fff" onclick="iniciarVisita('${t.id}',event)">🚀 Iniciar visita</button>`;
  }
  return `<button class="btn-archivar" style="background:#16a34a;color:#fff" onclick="iniciarVisita('${t.id}',event)">🚀 Iniciar visita</button>`;
}

function formatHora(fechaSQL) {
  if (!fechaSQL) return '';
  const d = new Date(fechaSQL.replace(' ', 'T'));
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatFechaHoraCorta(fechaSQL) {
  if (!fechaSQL) return '-';
  const d = new Date(fechaSQL.replace(' ', 'T'));
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function calcularDuracion(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '-';
  const a = new Date(checkIn.replace(' ', 'T'));
  const b = new Date(checkOut.replace(' ', 'T'));
  const totalMin = Math.max(0, Math.round((b - a) / 60000));
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return `${h}h ${m}min`;
}

// Duración neta descontando pausas completadas.
// Solo descuenta la parte de cada pausa que cae dentro del intervalo [check_in, check_out]
// (clipping), para que pausas fuera del horario no produzcan duraciones negativas.
function calcularDuracionNeta(checkIn, checkOut, pausas) {
  if (!checkIn || !checkOut) return '-';
  const a = new Date(checkIn.replace(' ', 'T'));
  const b = new Date(checkOut.replace(' ', 'T'));
  let totalMin = Math.max(0, Math.round((b - a) / 60000));
  (pausas || []).filter(p => p.pausa_fin).forEach(p => {
    const pi = new Date(p.pausa_inicio.replace(' ', 'T'));
    const pf = new Date(p.pausa_fin.replace(' ', 'T'));
    // Clip al intervalo de trabajo antes de descontar
    const overlapStart = Math.max(pi, a);
    const overlapEnd   = Math.min(pf, b);
    const overlap = Math.max(0, Math.round((overlapEnd - overlapStart) / 60000));
    totalMin -= overlap;
  });
  totalMin = Math.max(0, totalMin);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return `${h}h ${m}min`;
}

function minutosEnPausas(pausas) {
  return (pausas || []).filter(p => p.pausa_fin).reduce((acc, p) => {
    const pi = new Date(p.pausa_inicio.replace(' ', 'T'));
    const pf = new Date(p.pausa_fin.replace(' ', 'T'));
    return acc + Math.max(0, Math.round((pf - pi) / 60000));
  }, 0);
}

// ----------------- Selector rápido de técnico (sin login todavía) -----------------
let _visitaTecnicoCallback = null;

function abrirSelectorTecnico(tareaId, titulo, callback) {
  const t = tasks.find(x => x.id === tareaId);
  const candidatos = (t?.team && t.team.length) ? t.team.map(id => getMember(id)).filter(Boolean) : TEAM;
  document.getElementById('visita-tecnico-titulo').textContent = titulo;
  document.getElementById('visita-tecnico-lista').innerHTML = candidatos.map(m =>
    `<button class="btn-save" style="width:100%" onclick="resolverSelectorTecnico('${m.id}')">${esc(m.name)}</button>`
  ).join('');
  _visitaTecnicoCallback = callback;
  document.getElementById('visita-tecnico-modal').classList.add('open');
}
function resolverSelectorTecnico(tecnicoId) {
  document.getElementById('visita-tecnico-modal').classList.remove('open');
  const cb = _visitaTecnicoCallback; _visitaTecnicoCallback = null;
  if (cb) cb(tecnicoId);
}
function closeVisitaTecnicoModal() {
  document.getElementById('visita-tecnico-modal').classList.remove('open');
  _visitaTecnicoCallback = null;
}

// ----------------- Pausa / Reanuda visita -----------------
let _pausaTareaId = null;
let _pausaParticipanteId = null;

function abrirPausaModal(tareaId, participanteId, event) {
  if (event) event.stopPropagation();
  _pausaTareaId = tareaId;
  _pausaParticipanteId = participanteId;
  document.getElementById('pausa-justificacion').value = '';
  document.getElementById('pausa-modal').classList.add('open');
}

function cerrarPausaModal() {
  document.getElementById('pausa-modal').classList.remove('open');
  _pausaTareaId = null;
  _pausaParticipanteId = null;
}

async function confirmarPausa() {
  const justificacion = document.getElementById('pausa-justificacion').value.trim();
  if (!justificacion) { alert('Escribe el motivo de la pausa.'); return; }
  const tareaId = _pausaTareaId;
  const participanteId = _pausaParticipanteId;
  cerrarPausaModal();
  const visita = visitasActivas[tareaId];
  if (!visita) return;
  try {
    const res = await fetch(`${API_BASE}/reportes.php?id=${visita.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'pausar', participanteId, justificacion }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    visitasActivas[tareaId] = data;
    render();
  } catch (e) { console.error(e); alert('No se pudo pausar la visita. Revisa tu conexión.'); }
}

async function reanudarVisita(tareaId, participanteId, event) {
  if (event) event.stopPropagation();
  const visita = visitasActivas[tareaId];
  if (!visita) return;
  try {
    const res = await fetch(`${API_BASE}/reportes.php?id=${visita.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'reanudar', participanteId }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    visitasActivas[tareaId] = data;
    render();
  } catch (e) { console.error(e); alert('No se pudo reanudar la visita. Revisa tu conexión.'); }
}

// ----------------- Geofencing -----------------
// Obtiene GPS del navegador y verifica si el técnico está dentro del radio del cliente.
// Retorna { lat, lng } si se puede proceder, null si el técnico canceló.
// tipo: 'checkin' | 'checkout'
async function _geofenceCheck(tareaId, tipo) {
  if (!navigator.geolocation || !API_BASE) return { lat: null, lng: null };

  // Paso 1: obtener posición GPS como promesa (sin async dentro del callback — fix iOS Safari)
  const pos = await new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      p  => resolve(p),
      (err) => { alert(`[GEO] Sin GPS: ${err.code} ${err.message}`); resolve(null); },
      { timeout: 12000, maximumAge: 0 }
    );
  });

  if (!pos) return { lat: null, lng: null };

  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;

  // Paso 2: verificar geofence con el servidor
  try {
    const url = `${API_BASE}/reportes.php?geofence=1&tareaId=${encodeURIComponent(tareaId)}&lat=${lat}&lng=${lng}`;
    const geo = await fetch(url).then(r => r.json());

    if (geo.error || geo.sinUbicacion) {
      alert(`[GEO] Sin ubicación del cliente. cliente="${geo.cliente}" sinUbicacion=${geo.sinUbicacion} error=${geo.error}`);
      return { lat, lng };
    }

    if (geo.dentroZona) {
      alert(`[GEO] Dentro de zona: ${geo.distanciaMetros}m (radio ${geo.radioMetros}m)`);
      return { lat, lng };
    }

    // Fuera del radio → confirmar con el técnico
    const tipoLabel = tipo === 'checkin' ? 'check-in' : 'check-out';
    const ok = confirm(
      `📍 Estás a ${geo.distanciaMetros}m del cliente "${geo.clienteNombre}".\n` +
      `Radio permitido: ${geo.radioMetros}m\n\n` +
      `Se registrará que hiciste ${tipoLabel} fuera del sitio.\n` +
      `¿Continuar de todas formas?`
    );
    // Registrar intento (no bloquear si falla)
    fetch(`${API_BASE}/fuera_sitio.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tareaId, tecnicoId: currentUser?.id || null,
        tipo, lat, lng,
        distanciaMetros: geo.distanciaMetros,
        radioMetros:     geo.radioMetros,
        accion: ok ? 'aceptado' : 'cancelado',
      }),
    }).catch(() => {});

    return ok ? { lat, lng } : null;
  } catch {
    return { lat, lng }; // error de red → no bloquear
  }
}

// ----------------- Iniciar / Finalizar visita -----------------
async function iniciarVisita(tareaId, event) {
  if (event) event.stopPropagation();
  if (!API_BASE) { alert('Esta función requiere conexión al servidor (no disponible en modo local).'); return; }

  // Admin: abre modal para elegir técnico y hora manual.
  // Técnico / sin sesión: flujo normal con hora actual del servidor.
  if (currentUser && currentUser.perfil === 'admin') {
    abrirAdminCheckinModal(tareaId);
    return;
  }

  const ejecutarCheckin = async (tecnicoId) => {
    // Geofencing antes de enviar al servidor
    const geo = await _geofenceCheck(tareaId, 'checkin');
    if (geo === null) return; // técnico canceló

    // Generar IDs en el cliente para soporte offline
    const reporteId      = crypto.randomUUID().replace(/-/g, '');
    const participanteId = crypto.randomUUID().replace(/-/g, '');
    const body = { id: reporteId, participanteId, tareaId, tecnicoCheckinId: tecnicoId };
    if (geo.lat !== null) { body.lat = geo.lat; body.lng = geo.lng; }

    if (!navigator.onLine && typeof offlineEnqueue === 'function') {
      // Sin conexión: encolar y actualizar estado local
      await offlineEnqueue(`${API_BASE}/reportes.php`, 'POST', body);
      const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19);
      visitasActivas[tareaId] = {
        id: reporteId,
        tarea_id: tareaId,
        estado: 'en_visita',
        participantes: [{
          id: participanteId,
          tecnico_id: tecnicoId,
          check_in: ahora,
          check_out: null,
          pausas: [],
        }],
        _offline: true,
      };
      render();
      if (typeof closeModal === 'function') closeModal();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/reportes.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      visitasActivas[tareaId] = data;
      render();
      if (typeof closeModal === 'function') closeModal();
    } catch (e) { console.error(e); alert('No se pudo iniciar la visita. Revisa tu conexión.'); }
  };

  if (currentUser && currentUser.id) ejecutarCheckin(currentUser.id);
  else abrirSelectorTecnico(tareaId, '🚀 ¿Quién inicia la visita?', (id) => ejecutarCheckin(id));
}

// ----------------- Check-in manual del admin -----------------
let _adminCheckinTareaId = null;
let _adminCheckinEjecutar = null;

function abrirAdminCheckinModal(tareaId) {
  _adminCheckinTareaId = tareaId;

  const t = tasks.find(x => x.id === tareaId);
  const candidatos = (t?.team && t.team.length) ? t.team.map(id => getMember(id)).filter(Boolean) : TEAM;

  // Participantes ya registrados sin checkout
  const visita = visitasActivas[tareaId];
  const yaEnSitio = visita ? (visita.participantes || []).filter(p => !p.check_out).map(p => p.tecnico_id) : [];
  const disponibles = candidatos.filter(m => !yaEnSitio.includes(m.id));

  // Mostrar quiénes ya están en sitio
  const infoDiv = document.getElementById('admin-checkin-ya-en-sitio');
  if (infoDiv) {
    if (yaEnSitio.length > 0) {
      const nombres = yaEnSitio.map(id => getMember(id)?.name || id).join(', ');
      infoDiv.innerHTML = `<div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:6px;padding:8px 10px;font-size:13px;color:#065f46;margin-bottom:10px">🟢 Ya en sitio: <b>${esc(nombres)}</b></div>`;
      infoDiv.style.display = 'block';
    } else {
      infoDiv.style.display = 'none';
    }
  }

  const sel = document.getElementById('admin-checkin-tecnico');
  if (sel) {
    if (disponibles.length === 0) {
      sel.innerHTML = `<option value="">— Todos los técnicos ya registraron llegada —</option>`;
    } else {
      sel.innerHTML = disponibles.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    }
  }

  const horaInput = document.getElementById('admin-checkin-hora');
  if (horaInput) {
    const { hora } = _horaBogota();
    horaInput.value = hora;
  }

  document.getElementById('admin-checkin-modal').classList.add('open');
}

function cerrarAdminCheckinModal() {
  document.getElementById('admin-checkin-modal').classList.remove('open');
  _adminCheckinTareaId = null;
}

async function confirmarAdminCheckin() {
  const tareaId = _adminCheckinTareaId;
  if (!tareaId) return;

  const tecnicoId = document.getElementById('admin-checkin-tecnico').value;
  const hora      = document.getElementById('admin-checkin-hora').value; // "HH:MM"

  if (!hora) { alert('Ingresa la hora de llegada.'); return; }

  cerrarAdminCheckinModal();

  try {
    const res = await fetch(`${API_BASE}/reportes.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tareaId, tecnicoCheckinId: tecnicoId, checkIn: hora }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    visitasActivas[tareaId] = data;
    render();
    if (typeof closeModal === 'function') closeModal();
  } catch (e) { console.error(e); alert('No se pudo registrar el check-in. Revisa tu conexión.'); }
}

async function finalizarVisitaParticipante(tareaId, participanteId, event) {
  if (event) event.stopPropagation();
  const visita = visitasActivas[tareaId];
  if (!visita) { alert('No hay una visita en curso para esta tarea.'); return; }

  const ejecutar = async (tecnicoId) => {
    // Geofencing solo para técnicos (no admin: ellos registran manualmente)
    let geoLat = null, geoLng = null;
    if (!currentUser || currentUser.perfil !== 'admin') {
      const geo = await _geofenceCheck(tareaId, 'checkout');
      if (geo === null) return; // técnico canceló
      if (geo.lat !== null) { geoLat = geo.lat; geoLng = geo.lng; }
    }

    if (!navigator.onLine && typeof offlineEnqueue === 'function') {
      // Sin conexión: encolar checkout y actualizar estado local
      const checkoutBody = { accion: 'checkout', participanteId, tecnicoCheckoutId: tecnicoId, lat: geoLat, lng: geoLng };
      await offlineEnqueue(`${API_BASE}/reportes.php?id=${visita.id}`, 'PUT', checkoutBody);
      const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const partOffline = (visita.participantes || []).find(p => p.id === participanteId);
      if (partOffline) partOffline.check_out = ahora;
      const todosTerminaron = (visita.participantes || []).every(p => p.check_out);
      if (todosTerminaron) {
        delete visitasActivas[tareaId];
        if (!borradoresActivos[tareaId]) borradoresActivos[tareaId] = [];
        borradoresActivos[tareaId].push(Object.assign({}, visita, { estado: 'borrador', _offline: true }));
        _reporteSoloEdicion = false;
      }
      render();
      return;
    }

    // ¿Es este el último participante sin checkout?
    const otrosActivos = (visita.participantes || []).filter(p => p.id !== participanteId && !p.check_out);
    const esUltimo = otrosActivos.length === 0;

    if (esUltimo) {
      // Último participante: diferir checkout hasta que el técnico envíe el reporte.
      // Mover visita a borradoresActivos localmente para que el UI refleje fin de visita.
      _pendingCheckout = { tareaId, visita, participanteId, tecnicoId, geoLat, geoLng };
      delete visitasActivas[tareaId];
      if (!borradoresActivos[tareaId]) borradoresActivos[tareaId] = [];
      // Marcar localmente el participante como terminado (sin hora real aún)
      const visitaLocal = Object.assign({}, visita, {
        estado: 'borrador',
        participantes: (visita.participantes || []).map(p =>
          p.id === participanteId ? Object.assign({}, p, { check_out: new Date().toISOString().replace('T',' ').substring(0,19) }) : p
        )
      });
      borradoresActivos[tareaId].push(visitaLocal);
      _reporteSoloEdicion = false;
      render();
      abrirFormularioReporte(visitaLocal);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/reportes.php?id=${visita.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'checkout', participanteId, tecnicoCheckoutId: tecnicoId, lat: geoLat, lng: geoLng }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      // Aún hay otros técnicos en sitio — actualizar estado sin abrir formulario
      visitasActivas[tareaId] = data;
      render();
    } catch (e) { console.error(e); alert('No se pudo finalizar la visita. Revisa tu conexión.'); }
  };

  if (currentUser && currentUser.id) ejecutar(currentUser.id);
  else abrirSelectorTecnico(tareaId, '🏁 ¿Quién finaliza la visita?', ejecutar);
}

// Alias legacy por si queda alguna referencia directa
async function finalizarVisita(tareaId, event) {
  const visita = visitasActivas[tareaId];
  if (!visita) { alert('No hay una visita en curso para esta tarea.'); return; }
  const miPart = currentUser
    ? (visita.participantes || []).find(p => p.tecnico_id === currentUser.id && !p.check_out)
    : null;
  const partId = miPart?.id || (visita.participantes || [])[0]?.id || null;
  finalizarVisitaParticipante(tareaId, partId, event);
}

// soloEdicion=true cuando se abre desde el informe "Reportes de tarjetas
// operativas" para corregir datos: no debe preguntar si la tarea terminó
// ni mover la tarjeta, solo permitir editar la info interna del reporte.
async function continuarReporte(reporteId, event, soloEdicion = false) {
  if (event) event.stopPropagation();
  try {
    const res = await fetch(`${API_BASE}/reportes.php?id=${reporteId}`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    _reporteSoloEdicion = !!soloEdicion;
    abrirFormularioReporte(data);
  } catch (e) { console.error(e); alert('No se pudo abrir el reporte.'); }
}

// ----------------- Formulario de reporte -----------------
let _reporteSoloEdicion = false;
// Checkout diferido: guardado mientras el técnico completa el reporte.
// Se escribe en el servidor solo cuando envía el reporte (o confirma sin reporte).
let _pendingCheckout = null; // { tareaId, visita, participanteId, tecnicoId, geoLat, geoLng }

function abrirFormularioReporte(reporte) {
  reporteActual = reporte;
  if (!reporteActual.plantilla) reporteActual.plantilla = 'evento'; // única disponible por ahora
  renderFormularioReporte();
  document.getElementById('reporte-modal').classList.add('open');
}

function cerrarFormularioReporte() {
  // Advertir si el reporte no ha sido enviado al cliente (y no es edición administrativa)
  const _sinEnviar = reporteActual && !_reporteSoloEdicion && reporteActual.estado !== 'enviado';
  if (_sinEnviar) {
    document.getElementById('popup-sin-reporte').classList.add('open');
    return; // NO cerrar el formulario todavía
  }
  document.getElementById('reporte-modal').classList.remove('open');
  if (!reporteActual || _reporteSoloEdicion) {
    // Edición administrativa de un reporte existente: solo se corrige la
    // info interna, sin tocar el estado/ubicación de la tarjeta.
    _reporteSoloEdicion = false;
    reporteActual = null;
    cargarVisitasActivas();
    return;
  }
  // Al terminar de diligenciar el reporte (flujo normal de visita), preguntamos
  // si la tarea quedó completamente lista (se mueve a "Por facturar") o si
  // falta continuar en otra visita (trabajo de varios días) — en ese caso no
  // se cambia el estado y queda disponible para "Iniciar visita" otra vez.
  // Si la tarea ya está en "Por facturar" o más, no preguntar.
  const _tareaPopup = reporteActual ? tasks.find(t => t.id === reporteActual.tarea_id) : null;
  if (_tareaPopup && ['realizado','facturado','archivado'].includes(_tareaPopup.estado)) {
    reporteActual = null;
    cargarVisitasActivas();
    return;
  }
  const _nombreDiv = document.getElementById('popup-tarea-terminada-nombre');
  if (_nombreDiv && _tareaPopup) {
    const _label = [_tareaPopup.cliente, _tareaPopup.titulo].filter(Boolean).join(' · ');
    _nombreDiv.textContent = _label;
    _nombreDiv.style.display = 'block';
  } else if (_nombreDiv) {
    _nombreDiv.style.display = 'none';
  }
  document.getElementById('popup-tarea-terminada').classList.add('open');
}

// Llamado cuando el técnico envía el reporte: escribe el checkout real en el servidor.
async function _completarCheckout() {
  if (!_pendingCheckout) return;
  const { tareaId, visita, participanteId, tecnicoId, geoLat, geoLng } = _pendingCheckout;
  _pendingCheckout = null;
  try {
    const res = await fetch(`${API_BASE}/reportes.php?id=${visita.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'checkout', participanteId, tecnicoCheckoutId: tecnicoId, lat: geoLat, lng: geoLng }),
    });
    const data = await res.json();
    if (!data.error && borradoresActivos[tareaId]) {
      const idx = borradoresActivos[tareaId].findIndex(b => b.id === visita.id);
      if (idx >= 0) borradoresActivos[tareaId][idx] = data;
    }
  } catch (e) { console.error('_completarCheckout:', e); }
}

// Llamado cuando el técnico confirma que no completará el reporte.
async function confirmarSinReporte() {
  document.getElementById('popup-sin-reporte').classList.remove('open');
  if (!_pendingCheckout) {
    // Checkout ya registrado (borrador reabierto): solo cerrar el formulario sin marcar sin_reporte
    document.getElementById('reporte-modal').classList.remove('open');
    reporteActual = null;
    cargarVisitasActivas();
    return;
  }
  const { tareaId, visita, participanteId, tecnicoId, geoLat, geoLng } = _pendingCheckout;
  _pendingCheckout = null;
  try {
    const res = await fetch(`${API_BASE}/reportes.php?id=${visita.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'sin_reporte', participanteId, tecnicoCheckoutId: tecnicoId, lat: geoLat, lng: geoLng }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    if (borradoresActivos[tareaId]) {
      const idx = borradoresActivos[tareaId].findIndex(b => b.id === visita.id);
      if (idx >= 0) borradoresActivos[tareaId][idx] = data;
    }
  } catch (e) { console.error(e); alert('Error al registrar visita sin reporte.'); return; }
  // Cerrar formulario y mostrar popup tarea-terminada (si aplica)
  document.getElementById('reporte-modal').classList.remove('open');
  const _tareaPopup = reporteActual ? tasks.find(t => t.id === reporteActual.tarea_id) : null;
  if (_tareaPopup && !['realizado','facturado','archivado'].includes(_tareaPopup.estado)) {
    const _nombreDiv = document.getElementById('popup-tarea-terminada-nombre');
    if (_nombreDiv && _tareaPopup) {
      _nombreDiv.textContent = [_tareaPopup.cliente, _tareaPopup.titulo].filter(Boolean).join(' · ');
      _nombreDiv.style.display = 'block';
    }
    document.getElementById('popup-tarea-terminada').classList.add('open');
  } else {
    reporteActual = null;
    cargarVisitasActivas();
  }
}

async function resolverTareaTerminada(terminada) {
  document.getElementById('popup-tarea-terminada').classList.remove('open');
  // Si el modal de edición de tarea estaba abierto (visita iniciada desde el modal),
  // cerrarlo para evitar que el usuario guarde datos viejos y revierta el estado.
  document.getElementById('modal')?.classList.remove('open');
  const tareaId = reporteActual ? reporteActual.tarea_id : null;
  reporteActual = null;

  if (terminada && tareaId) {
    const idx = tasks.findIndex(t => t.id === tareaId);
    if (idx >= 0) {
      tasks[idx].estado = 'realizado';
      tasks[idx].updatedAt = new Date().toISOString();
      save();
      // await garantiza que el servidor actualiza antes de cualquier re-carga
      await syncTask(tasks[idx], false);
      // Recargar desde el servidor para que la UI refleje el estado real guardado
      await load();
      render();
    }
  }
  cargarVisitasActivas();
}

function fotoUrl(archivo) { return `${API_BASE}/reporte_foto.php?archivo=${encodeURIComponent(archivo)}`; }

function fotoThumbHtml(f) {
  return `<div style="position:relative;width:84px;height:84px;overflow:visible">
    <img src="${fotoUrl(f.archivo)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
    <button type="button" onclick="eliminarFoto(${f.id})" style="position:absolute;top:-10px;right:-10px;background:#ef4444;color:#fff;border:none;border-radius:99px;width:28px;height:28px;font-size:14px;cursor:pointer;line-height:1;touch-action:manipulation;z-index:10">✕</button>
  </div>`;
}

function renderSeccion(sec, r) {
  const datos = r.datos || {};
  if (sec.tipo === 'fotos') {
    const fotos = (r.fotos || []).filter(f => f.seccion_id === sec.id);
    return `<div class="form-group full" style="margin-bottom:16px">
      <label>${esc(sec.label)}</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">
        ${fotos.map(fotoThumbHtml).join('')}
      </div>
      <input type="file" id="foto-input-${sec.id}" accept="image/*" multiple style="display:none" onchange="subirFotos('${sec.id}', this.files)">
      <button type="button" class="btn-cancel" onclick="document.getElementById('foto-input-${sec.id}').click()">📷 Agregar fotos</button>
    </div>`;
  }
  if (sec.tipo === 'texto_largo') {
    return `<div class="form-group full" style="margin-bottom:16px">
      <label>${esc(sec.label)}</label>
      <textarea id="campo-${sec.id}" style="min-height:80px" onblur="guardarCamposReporte()">${esc(datos[sec.id] || '')}</textarea>
    </div>`;
  }
  if (sec.tipo === 'firma') {
    const firmaFoto = (r.fotos || []).find(f => f.seccion_id === sec.id);
    return `<div class="form-group full" style="margin-bottom:16px">
      <label>${esc(sec.label)}</label>
      ${firmaFoto
        ? `<div style="margin:8px 0"><img src="${fotoUrl(firmaFoto.archivo)}" style="max-width:260px;border:1px solid var(--border);border-radius:8px;background:#fff"></div>
           <button type="button" class="btn-cancel" onclick="rehacerFirma('${sec.id}')">✏️ Volver a firmar</button>`
        : `<canvas id="firma-canvas-${sec.id}" width="320" height="150" style="border:1px solid var(--border);border-radius:8px;background:#fff;touch-action:none;max-width:100%"></canvas>
           <div style="display:flex;gap:8px;margin-top:6px">
             <button type="button" class="btn-cancel" onclick="limpiarFirma('${sec.id}')">Limpiar</button>
             <button type="button" class="btn-save" onclick="guardarFirma('${sec.id}')">Guardar firma</button>
           </div>`}
    </div>`;
  }
  return '';
}

function sqlToDatetimeLocal(sql) {
  if (!sql) return '';
  return sql.replace(' ', 'T').slice(0, 16);
}
function datetimeLocalToSql(val) {
  if (!val) return null;
  return val.replace('T', ' ') + ':00';
}

function renderCabeceraEditableAdmin(r) {
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;border-top:1px dashed var(--border);padding-top:10px">
    <div style="flex:1;min-width:160px">
      <label style="font-size:11px;color:var(--text-muted)">Técnico que inició</label>
      <select id="edit-tecnico-checkin" style="width:100%">
        ${TEAM.map(m => `<option value="${m.id}" ${m.id === r.tecnico_checkin_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
    </div>
    <div style="flex:1;min-width:160px">
      <label style="font-size:11px;color:var(--text-muted)">Técnico que finalizó</label>
      <select id="edit-tecnico-checkout" style="width:100%">
        <option value="">(sin definir)</option>
        ${TEAM.map(m => `<option value="${m.id}" ${m.id === r.tecnico_checkout_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
    </div>
    <div style="flex:1;min-width:170px">
      <label style="font-size:11px;color:var(--text-muted)">Check-in</label>
      <input type="datetime-local" id="edit-check-in" value="${sqlToDatetimeLocal(r.check_in)}" style="width:100%">
    </div>
    <div style="flex:1;min-width:170px">
      <label style="font-size:11px;color:var(--text-muted)">Check-out</label>
      <input type="datetime-local" id="edit-check-out" value="${sqlToDatetimeLocal(r.check_out)}" style="width:100%">
    </div>
    <div style="width:100%;display:flex;align-items:center;gap:10px">
      <button class="btn-save" style="padding:6px 12px;font-size:12px" onclick="guardarCabeceraReporte()">💾 Guardar técnico/horarios</button>
      <span id="cabecera-reporte-status" style="font-size:12px"></span>
    </div>
  </div>`;
}

async function guardarCabeceraReporte() {
  const statusEl = document.getElementById('cabecera-reporte-status');
  const tecnicoCheckinId = document.getElementById('edit-tecnico-checkin').value || null;
  const tecnicoCheckoutId = document.getElementById('edit-tecnico-checkout').value || null;
  const checkIn = datetimeLocalToSql(document.getElementById('edit-check-in').value);
  const checkOut = datetimeLocalToSql(document.getElementById('edit-check-out').value);
  statusEl.textContent = '⏳ Guardando...';
  try {
    const res = await fetch(`${API_BASE}/reportes.php?id=${reporteActual.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tecnicoCheckinId, tecnicoCheckoutId, checkIn, checkOut }),
    });
    const data = await res.json();
    if (data.error) { statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`; return; }
    reporteActual = data;
    statusEl.innerHTML = '✅ Guardado.';
    renderFormularioReporte();
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo guardar.</span>';
  }
}

function renderFormularioReporte() {
  const r = reporteActual;
  const t = tasks.find(x => x.id === r.tarea_id) || {};
  const plantilla = PLANTILLAS_REPORTE[r.plantilla] || PLANTILLAS_REPORTE.evento;
  const tecnicoIn = getMember(r.tecnico_checkin_id)?.name || '-';
  const tecnicoOut = getMember(r.tecnico_checkout_id)?.name || '-';
  const esAdmin = currentUser && currentUser.perfil === 'admin';

  const seccionesHtml = plantilla.secciones.map(sec => renderSeccion(sec, r)).join('');
  const yaGenerado = !!r.pdf_archivo;

  document.getElementById('reporte-body').innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:16px">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px">${esc(t.cliente || 'Sin cliente')}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">${esc(t.titulo || '')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--text-muted)">
        <span>👷 Inició: ${esc(tecnicoIn)}</span>
        <span>🏁 Finalizó: ${esc(tecnicoOut)}</span>
        <span>🕐 ${formatHora(r.check_in)} – ${formatHora(r.check_out)}</span>
        <span>⏱ ${calcularDuracionNeta(r.check_in, r.check_out, (r.participantes||[]).flatMap(p=>p.pausas||[]))}</span>
      </div>
      ${esAdmin ? renderCabeceraEditableAdmin(r) : ''}
    </div>
    ${seccionesHtml}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
      <button class="btn-save" id="btn-generar-pdf" onclick="generarPDFReporte(this)">📄 ${yaGenerado ? 'Regenerar PDF' : 'Generar PDF'}</button>
      ${yaGenerado ? `<button class="btn-cancel" id="btn-whatsapp-pdf" onclick="compartirPDFWhatsApp(this)" style="background:#25D366;color:#fff;border-color:#25D366">📲 Enviar por WhatsApp</button>` : ''}
      <div id="reporte-pdf-status" style="font-size:13px">${yaGenerado ? `✅ PDF generado. <a href="${API_BASE}/reporte_pdf.php?id=${r.id}" target="_blank">Ver PDF</a>` : ''}</div>
      <div id="reporte-envio" style="${yaGenerado ? '' : 'display:none;'}border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
        <label style="font-size:12px;color:var(--text-muted)">Correo adicional del cliente (siempre se envía copia a administrativo@innovate.com.co)</label>
        <input type="email" id="reporte-correo-cliente" placeholder="cliente@correo.com" style="width:100%;margin:6px 0 10px">
        <button class="btn-save" id="btn-enviar-correo" onclick="enviarCorreoReporte(this)">📧 Enviar por correo</button>
        <div id="reporte-envio-status" style="font-size:13px;margin-top:6px">${r.estado === 'enviado' ? `✅ Enviado a: ${esc(r.enviado_a || '')}` : ''}</div>
      </div>
    </div>
  `;

  plantilla.secciones.filter(s => s.tipo === 'firma').forEach(s => initFirmaCanvas(s.id));
  precargarCorreoCliente();
}

// ----------------- Fotos -----------------
// Comprime una imagen antes de subirla: máx 1920px, JPEG calidad 80%.
// Devuelve un Blob JPEG. Si el archivo no es imagen, lo devuelve sin cambios.
function _comprimirImagen(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1920;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.80);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function subirFotos(seccionId, files) {
  if (!files || !files.length) return;
  for (const file of files) {
    const comprimida = await _comprimirImagen(file);
    const fd = new FormData();
    fd.append('reporteId', reporteActual.id);
    fd.append('seccionId', seccionId);
    fd.append('file', comprimida, file.name.replace(/\.[^.]+$/, '.jpg'));
    try {
      const res = await fetch(`${API_BASE}/reporte_foto.php`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) { alert(data.error); continue; }
      if (!reporteActual.fotos) reporteActual.fotos = [];
      reporteActual.fotos.push({ id: data.id, seccion_id: seccionId, archivo: data.archivo, orden: 0 });
    } catch (e) { console.error(e); alert('No se pudo subir una foto.'); }
  }
  renderFormularioReporte();
}

async function eliminarFoto(fotoId) {
  if (!confirm('¿Eliminar esta foto?')) return;
  try {
    await fetch(`${API_BASE}/reporte_foto.php?id=${fotoId}`, { method: 'DELETE' });
    reporteActual.fotos = (reporteActual.fotos || []).filter(f => f.id !== fotoId);
    renderFormularioReporte();
  } catch (e) { console.error(e); alert('No se pudo eliminar la foto.'); }
}

// ----------------- Campos de texto -----------------
function guardarCamposReporte() {
  const plantilla = PLANTILLAS_REPORTE[reporteActual.plantilla] || PLANTILLAS_REPORTE.evento;
  const datos = {};
  plantilla.secciones.filter(s => s.tipo === 'texto_largo').forEach(s => {
    const el = document.getElementById(`campo-${s.id}`);
    if (el) datos[s.id] = el.value;
  });
  reporteActual.datos = { ...(reporteActual.datos || {}), ...datos };
  fetch(`${API_BASE}/reportes.php?id=${reporteActual.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plantilla: reporteActual.plantilla, datos }),
  }).catch(e => console.error('No se pudo guardar el reporte', e));
}

// ----------------- Firma (canvas táctil) -----------------
const _firmaCtx = {};
function initFirmaCanvas(seccionId) {
  const canvas = document.getElementById(`firma-canvas-${seccionId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e293b';
  _firmaCtx[seccionId] = ctx;
  let dibujando = false;
  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) * (canvas.width / rect.width), y: (p.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function start(e) { dibujando = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e) { if (!dibujando) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function end() { dibujando = false; }
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
}
function limpiarFirma(seccionId) {
  const canvas = document.getElementById(`firma-canvas-${seccionId}`);
  const ctx = _firmaCtx[seccionId];
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
function guardarFirma(seccionId) {
  const canvas = document.getElementById(`firma-canvas-${seccionId}`);
  if (!canvas) return;
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const fd = new FormData();
    fd.append('reporteId', reporteActual.id);
    fd.append('seccionId', seccionId);
    fd.append('file', blob, 'firma.png');
    try {
      const res = await fetch(`${API_BASE}/reporte_foto.php`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      if (!reporteActual.fotos) reporteActual.fotos = [];
      reporteActual.fotos.push({ id: data.id, seccion_id: seccionId, archivo: data.archivo, orden: 0 });
      renderFormularioReporte();
    } catch (e) { console.error(e); alert('No se pudo guardar la firma.'); }
  }, 'image/png');
}
function rehacerFirma(seccionId) {
  const firmaFoto = (reporteActual.fotos || []).find(f => f.seccion_id === seccionId);
  if (firmaFoto) eliminarFoto(firmaFoto.id);
}

// ----------------- Generación de PDF (jsPDF, sin dependencias en el servidor) -----------------
async function cargarImagenDataURL(url, maxPx = 0) {
  const res = await fetch(url);
  const blob = await res.blob();
  if (!maxPx || !blob.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx2d = canvas.getContext('2d');
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fillRect(0, 0, w, h);
      ctx2d.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('img load failed')); };
    img.src = objUrl;
  });
}

let _generandoPDF = false;

async function _cargarJsPDF() {
  if (window.jspdf) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function generarPDFReporte(btn) {
  if (_generandoPDF) return; // evita doble clic mientras se genera
  _generandoPDF = true;

  const statusEl = document.getElementById('reporte-pdf-status');
  const botonEl = btn || document.getElementById('btn-generar-pdf');
  const textoOriginalBoton = botonEl ? botonEl.innerHTML : '';
  if (botonEl) {
    botonEl.disabled = true;
    botonEl.style.opacity = '0.7';
    botonEl.style.cursor = 'wait';
    botonEl.innerHTML = '⏳ Generando PDF... espera un momento';
  }
  statusEl.innerHTML = '⏳ Generando PDF, esto puede tardar unos segundos...';
  try {
    await _cargarJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210, marginX = 15;
    let y = 18;

    try {
      const logoData = await cargarImagenDataURL('assets/img/logo-innovate.png', 800);
      doc.addImage(logoData, 'PNG', pageW - 15 - 42, 12, 42, 42 * (250 / 775));
    } catch (e) { /* continúa sin logo si falla */ }

    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    doc.text('Reporte de visita técnica', marginX, y); y += 8;
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(90);
    doc.text('Grupo Innovate · Tel: 3176452811 · NIT: 900460263 · info@innovate.com.co', marginX, y); y += 4;
    doc.text('Cra. 30 # 6-06 Ofic 501, Cali Valle del Cauca, Colombia', marginX, y); y += 8;
    doc.setDrawColor(220); doc.line(marginX, y, pageW - marginX, y); y += 6;
    doc.setTextColor(20);

    const r = reporteActual;
    const t = tasks.find(x => x.id === r.tarea_id) || {};
    const tecnicoIn = getMember(r.tecnico_checkin_id)?.name || '-';
    const tecnicoOut = getMember(r.tecnico_checkout_id)?.name || '-';

    const partes = r.participantes || [];
    const fechaVisita = (() => {
      const src = r.check_in || (partes[0] && partes[0].check_in) || null;
      if (!src) return t.fechaProg || '-';
      return new Date(src.replace(' ', 'T')).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
    })();
    const filas = [
      ['Cliente', t.cliente || '-'],
      ['Tarea',   t.titulo  || '-'],
      ['Fecha',   fechaVisita],
    ];
    if (partes.length > 0) {
      partes.forEach((p, i) => {
        const nombre   = getMember(p.tecnico_id)?.name || p.tecnico_id || '-';
        const horaIn   = formatHora(p.check_in);
        const horaOut  = p.check_out ? formatHora(p.check_out) : '-';
        const durNeta  = p.check_out ? calcularDuracionNeta(p.check_in, p.check_out, p.pausas) : 'En curso';
        const minPausa = minutosEnPausas(p.pausas);
        const pausaLabel = minPausa > 0 ? ` · Pausa: ${minPausa}min` : '';
        const etiqueta = partes.length > 1 ? `Técnico ${i + 1}` : 'Técnico';
        filas.push([etiqueta, nombre]);
        if (p.check_in) {
          const horario = p.check_out
            ? `${horaIn} – ${horaOut}  (${durNeta}${pausaLabel})`
            : `${horaIn}  (En curso)`;
          filas.push(['', horario]);
        }
        // Detalle de pausas en el PDF
        (p.pausas || []).forEach(pz => {
          const pIn  = pz.pausa_inicio ? pz.pausa_inicio.substring(11,16) : '-';
          const pOut = pz.pausa_fin    ? pz.pausa_fin.substring(11,16)    : 'activa';
          const pDur = pz.pausa_fin
            ? Math.round((new Date(pz.pausa_fin.replace(' ','T')) - new Date(pz.pausa_inicio.replace(' ','T')))/60000) + 'min'
            : '';
          filas.push(['  Pausa', `${pIn} – ${pOut}${pDur?' ('+pDur+')':''} · ${pz.justificacion}`]);
        });
      });
    } else {
      // Fallback para reportes creados antes de la migración multi-técnico
      filas.push(['Técnico',   tecnicoIn === tecnicoOut ? tecnicoIn : `${tecnicoIn} / ${tecnicoOut}`]);
      filas.push(['Check-in',  formatFechaHoraCorta(r.check_in)]);
      filas.push(['Check-out', formatFechaHoraCorta(r.check_out)]);
      filas.push(['Duración',  calcularDuracion(r.check_in, r.check_out)]);
    }
    const labelColW = 32; // mm que ocupa la columna de etiquetas
    const valMaxW = pageW - marginX - labelColW - marginX; // ancho disponible para el valor (~148mm)
    doc.setFontSize(10);
    filas.forEach(([label, val]) => {
      const lineas = doc.splitTextToSize(String(val), valMaxW);
      doc.setFont(undefined, 'bold'); doc.text(label + ':', marginX, y);
      doc.setFont(undefined, 'normal'); doc.text(lineas, marginX + labelColW, y);
      y += lineas.length * 6;
    });
    y += 4;

    const plantilla = PLANTILLAS_REPORTE[r.plantilla] || PLANTILLAS_REPORTE.evento;
    function asegurarEspacio(necesario) { if (y + necesario > 280) { doc.addPage(); y = 18; } }

    for (const sec of plantilla.secciones) {
      asegurarEspacio(12);
      doc.setFontSize(11); doc.setFont(undefined, 'bold');
      doc.text(sec.label, marginX, y); y += 6;
      doc.setFont(undefined, 'normal'); doc.setFontSize(10);

      if (sec.tipo === 'fotos') {
        const fotos = (r.fotos || []).filter(f => f.seccion_id === sec.id);
        if (!fotos.length) {
          doc.setTextColor(150); doc.text('(sin fotos)', marginX, y); doc.setTextColor(20); y += 8; continue;
        }
        const colW = 55, colH = 40, gap = 5;
        let col = 0;
        for (const f of fotos) {
          asegurarEspacio(colH + 5);
          try {
            const dataUrl = await cargarImagenDataURL(fotoUrl(f.archivo), 1000);
            const x = marginX + col * (colW + gap);
            doc.addImage(dataUrl, x, y, colW, colH);
          } catch (e) { /* se omite si la foto no carga */ }
          col++;
          if (col >= 3) { col = 0; y += colH + gap; }
        }
        if (col !== 0) y += colH + gap;
        y += 4;
      } else if (sec.tipo === 'texto_largo') {
        const texto = (r.datos && r.datos[sec.id]) || '(sin información)';
        const lineas = doc.splitTextToSize(texto, pageW - marginX * 2);
        asegurarEspacio(lineas.length * 5 + 4);
        doc.text(lineas, marginX, y);
        y += lineas.length * 5 + 6;
      } else if (sec.tipo === 'firma') {
        const firmaFoto = (r.fotos || []).find(f => f.seccion_id === sec.id);
        if (firmaFoto) {
          asegurarEspacio(35);
          try {
            const dataUrl = await cargarImagenDataURL(fotoUrl(firmaFoto.archivo), 400);
            doc.addImage(dataUrl, marginX, y, 60, 30);
            y += 32;
          } catch (e) { y += 4; }
          doc.setDrawColor(180); doc.line(marginX, y, marginX + 70, y); y += 5;
          doc.setFontSize(9); doc.text(`Firmado por: ${t.cliente || 'Cliente'}`, marginX, y); y += 8;
        } else {
          doc.setTextColor(150); doc.text('(sin firma)', marginX, y); doc.setTextColor(20); y += 8;
        }
      }
    }

    const totalPaginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Página ${p} de ${totalPaginas}`, pageW - marginX - 25, 292);
    }

    // Nombre de archivo: Innovate-YYYYMMDD-PrimerasPalabrasCliente.pdf
    const _fechaSrc = r.check_in ? r.check_in.substring(0, 10) : new Date().toISOString().substring(0, 10);
    const [_yy, _mm, _dd] = _fechaSrc.split('-');
    const _fechaPDF = `${_dd}${_mm}${_yy.slice(2)}`; // "DDMMAA"
    const _clienteInic = (t.cliente || '')
      .trim().split(/\s+/).slice(0, 5)
      .map(w => w.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, '')[0] || '')
      .filter(Boolean).join('').toUpperCase() || 'XX';
    const _tareaShort = (r.tarea_id || t.id || '').slice(0, 4).toUpperCase();
    const nombreArchivo = `${_clienteInic}-${_fechaPDF}-${_tareaShort}.pdf`;

    const blobPdf = doc.output('blob');
    const fd = new FormData();
    fd.append('reporteId', r.id);
    fd.append('nombre', nombreArchivo);
    fd.append('file', blobPdf, nombreArchivo);
    const res = await fetch(`${API_BASE}/reporte_pdf.php`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) {
      statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`;
      if (botonEl) botonEl.innerHTML = textoOriginalBoton;
      return;
    }

    reporteActual.pdf_archivo = data.archivo;
    statusEl.innerHTML = `✅ PDF generado. <a href="${API_BASE}/reporte_pdf.php?id=${r.id}" target="_blank">Ver PDF</a>`;
    document.getElementById('reporte-envio').style.display = 'block';
    if (botonEl) botonEl.innerHTML = '📄 Regenerar PDF';
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo generar el PDF. Verifica tu conexión e intenta de nuevo.</span>';
    if (botonEl) botonEl.innerHTML = textoOriginalBoton;
  } finally {
    _generandoPDF = false;
    if (botonEl) {
      botonEl.disabled = false;
      botonEl.style.opacity = '';
      botonEl.style.cursor = '';
    }
  }
}

// ----------------- Envío de correo -----------------
async function precargarCorreoCliente() {
  try {
    const res = await fetch(`${API_BASE}/reporte_enviar_correo.php?reporteId=${reporteActual.id}`);
    const data = await res.json();
    const input = document.getElementById('reporte-correo-cliente');
    if (input && data.cliente_email_alegra) input.value = data.cliente_email_alegra;
  } catch (e) { /* silencioso: si Alegra no responde, el técnico escribe el correo a mano */ }
}

let _enviandoCorreo = false;

async function enviarCorreoReporte(btn) {
  if (_enviandoCorreo) return; // evita doble clic mientras se envía
  _enviandoCorreo = true;

  const statusEl = document.getElementById('reporte-envio-status');
  const correoCliente = document.getElementById('reporte-correo-cliente').value.trim();
  const botonEl = btn || document.getElementById('btn-enviar-correo');
  const textoOriginalBoton = botonEl ? botonEl.innerHTML : '';
  if (botonEl) {
    botonEl.disabled = true;
    botonEl.style.opacity = '0.7';
    botonEl.style.cursor = 'wait';
    botonEl.innerHTML = '⏳ Enviando...';
  }
  statusEl.innerHTML = '⏳ Enviando correo, espera un momento...';
  try {
    const res = await fetch(`${API_BASE}/reporte_enviar_correo.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporteId: reporteActual.id, correos: correoCliente ? [correoCliente] : [] }),
    });
    const data = await res.json();
    if (data.error) { statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`; return; }
    statusEl.innerHTML = `✅ Enviado a: ${esc(data.enviado_a.join(', '))}`;
    // Checkout diferido: escribir la hora real de checkout ahora que el reporte fue enviado
    if (_pendingCheckout) await _completarCheckout();
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo enviar el correo. Verifica tu conexión e intenta de nuevo.</span>';
  } finally {
    _enviandoCorreo = false;
    if (botonEl) {
      botonEl.disabled = false;
      botonEl.style.opacity = '';
      botonEl.style.cursor = '';
      botonEl.innerHTML = textoOriginalBoton;
    }
  }
}
// ===================== HISTORIAL DE VISITAS EN MODAL =====================

async function renderHistorialVisitasModal(tareaId) {
  const div = document.getElementById('modal-historial-visitas');
  if (!div || !API_BASE) return;
  div.innerHTML = '<div style="padding:12px 0;color:var(--text-muted);font-size:13px">⏳ Cargando visitas...</div>';
  try {
    const res = await fetch(`${API_BASE}/reportes.php?tareaId=${tareaId}`);
    const reportes = await res.json();
    const visitas = reportes.filter(r => r.estado !== 'en_visita' || (r.participantes||[]).length > 0);
    if (!visitas.length) { div.innerHTML = ''; div.style.display = 'none'; return; }

    // Inyectar botones "Ver reporte" en acciones rápidas para cualquier estado de reporte
    const accionesDiv = document.getElementById('modal-acciones-rapidas');
    if (accionesDiv) {
      const reportesAbribles = reportes.filter(r => ['borrador','completado','enviado'].includes(r.estado));
      // Quitar botones "Ver reporte" previos para reemplazarlos con datos reales
      accionesDiv.querySelectorAll('.btn-ver-reporte').forEach(b => b.remove());
      if (reportesAbribles.length > 0) {
        const ref = accionesDiv.querySelector('div'); // contenedor interior
        reportesAbribles.forEach(r => {
          const fecha = (r.check_in || r.creado_en || '').substring(0, 10);
          const label = reportesAbribles.length > 1 ? `📄 Ver reporte ${fecha}` : '📄 Ver reporte';
          const btn = document.createElement('button');
          btn.className = 'btn-archivar btn-ver-reporte';
          btn.style.cssText = 'background:#6366f1;color:#fff';
          btn.textContent = label;
          btn.onclick = (e) => continuarReporte(r.id, e);
          if (ref) ref.appendChild(btn);
          else accionesDiv.appendChild(btn);
        });
        accionesDiv.style.display = 'block';
      }
    }
    const esAdmin = currentUser?.perfil === 'admin';

    // Para badge Tardía: obtener horaProg y fechaProg de la tarea
    const tarea = tasks.find(t => t.id === tareaId);
    const esContrato = tarea?.tipoTarea === 'contrato';
    const horaProg  = tarea?.horaProg  || null; // "HH:MM"
    const fechaProg = tarea?.fechaProg || null; // "YYYY-MM-DD"

    let html = `<div style="border-top:1px solid var(--border);padding:14px 0 6px">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">📋 Historial de visitas</div>`;
    visitas.forEach((r, ri) => {
      const partes = r.participantes || [];
      const fecha = r.check_in ? r.check_in.substring(0,10) : (r.creado_en||'').substring(0,10);
      const estadoBadge = r.estado === 'enviado' ? '<span style="color:#059669;font-size:11px">✅ Enviado</span>'
        : r.estado === 'completado' || r.pdf_archivo ? '<span style="color:#169BBC;font-size:11px">📄 PDF listo</span>'
        : r.estado === 'borrador' ? '<span style="color:#f59e0b;font-size:11px">📝 Borrador</span>'
        : '<span style="color:#16a34a;font-size:11px">🟢 En curso</span>';
      const puedeEliminarReporte = esAdmin && ['en_visita','borrador'].includes(r.estado);
      html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px">
          <span style="font-size:12px;font-weight:600;color:#0D3B40">📅 ${fecha}</span>
          <div style="display:flex;align-items:center;gap:6px">
            ${estadoBadge}
            ${puedeEliminarReporte ? `<button onclick="eliminarReporteVisita('${r.id}','${tareaId}',this)" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer" title="Eliminar visita completa">🗑️ Borrar visita</button>` : ''}
          </div>
        </div>`;
      if (partes.length) {
        partes.forEach(p => {
          const nombre = getMember(p.tecnico_id)?.name || p.tecnico_id || '-';
          const checkIn  = p.check_in  ? p.check_in.substring(11,16)  : '';
          const checkOut = p.check_out ? p.check_out.substring(11,16) : '';
          // Badge Tardía: solo si la fecha del check_in coincide con la fecha programada
          const fechaCheckIn = p.check_in ? p.check_in.substring(0,10) : null;
          // Usar snapshot por participante si existe; fallback a valores de la tarea
          const horaSnap  = p.hora_prog_snap  || horaProg;
          const fechaSnap = p.fecha_prog_snap || fechaProg;
          const esTardia = horaSnap && fechaSnap && fechaCheckIn === fechaSnap && checkIn && checkIn > horaSnap.slice(0,5);
          const tardiBadge = esTardia
            ? ' <span style="background:#fef2f2;color:#dc2626;border-radius:99px;padding:1px 7px;font-size:11px;font-weight:700">🕐 Tardía</span>'
            : '';
          if (esAdmin) {
            const opciones = TEAM.map(m => `<option value="${m.id}"${m.id===p.tecnico_id?' selected':''}>${esc(m.name)}</option>`).join('');
            const colsTemplate = esContrato ? '1fr auto auto auto auto auto' : '1fr auto auto auto auto';
            const horasContratoCol = esContrato
              ? `<input type="number" value="${p.horas_contrato ?? ''}" class="hvp-horas-contrato"
                   min="0.5" step="0.5" placeholder="h"
                   title="Horas de contrato descontadas"
                   style="border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;width:60px;background:var(--card);color:var(--text)">`
              : '';
            html += `<div style="display:grid;grid-template-columns:${colsTemplate};gap:6px;align-items:center;margin-bottom:6px;font-size:12px" data-part-id="${p.id}" data-rep-id="${r.id}">
              <select style="border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;background:var(--card);color:var(--text)" class="hvp-tecnico">${opciones}</select>
              <input type="time" value="${checkIn}"  class="hvp-in"  style="border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;width:110px;background:var(--card);color:var(--text)">
              <input type="time" value="${checkOut}" class="hvp-out" style="border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;width:110px;background:var(--card);color:var(--text)">
              ${horasContratoCol}
              <button onclick="guardarParticipanteVisita(this)" style="background:#169BBC;color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer">💾</button>
              <button onclick="eliminarParticipanteVisita('${p.id}','${tareaId}',this)" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer" title="Eliminar este check-in">🗑️</button>
            </div>${tardiBadge ? `<div style="margin-bottom:4px">${tardiBadge}</div>` : ''}`;
          } else {
            const dur = p.check_out ? calcularDuracionNeta(p.check_in, p.check_out, p.pausas) : 'En curso';
            html += `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">
              👤 ${esc(nombre)} &nbsp;·&nbsp; ${checkIn}${checkOut?' → '+checkOut:' (en curso)'} &nbsp;·&nbsp; ${dur}${tardiBadge}
            </div>`;
          }
          // Pausas de este participante
          const pausas = p.pausas || [];
          if (pausas.length > 0) {
            html += `<div style="margin:0 0 6px 12px;border-left:2px solid #fde68a;padding-left:8px">`;
            pausas.forEach(pz => {
              const pIn  = pz.pausa_inicio ? pz.pausa_inicio.substring(11,16) : '-';
              const pOut = pz.pausa_fin    ? pz.pausa_fin.substring(11,16)    : '(activa)';
              const pDur = pz.pausa_fin
                ? (() => { const d = Math.round((new Date(pz.pausa_fin.replace(' ','T')) - new Date(pz.pausa_inicio.replace(' ','T')))/60000); return `${d}min`; })()
                : '';
              html += `<div style="font-size:11px;color:#92400e;margin-bottom:2px">⏸️ ${pIn} – ${pOut}${pDur ? ' ('+pDur+')' : ''} · ${esc(pz.justificacion)}</div>`;
            });
            html += `</div>`;
          }
        });
      } else {
        const tecIn  = getMember(r.tecnico_checkin_id)?.name  || r.tecnico_checkin_id  || '-';
        const tecOut = getMember(r.tecnico_checkout_id)?.name || r.tecnico_checkout_id || '-';
        const hIn  = r.check_in  ? r.check_in.substring(11,16)  : '-';
        const hOut = r.check_out ? r.check_out.substring(11,16) : '-';
        html += `<div style="font-size:12px;color:var(--text-muted)">👤 ${esc(tecIn)} · ${hIn} → ${hOut}</div>`;
        if (tecIn !== tecOut) html += `<div style="font-size:12px;color:var(--text-muted)">🏁 ${esc(tecOut)}</div>`;
      }
      html += '</div>';
    });
    html += '</div>';
    div.innerHTML = html;
    div.style.display = 'block';
  } catch(e) {
    div.innerHTML = '';
    div.style.display = 'none';
  }
}

async function eliminarParticipanteVisita(participanteId, tareaId, btn) {
  if (!confirm('¿Eliminar este check-in? Esta acción no se puede deshacer.')) return;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const res  = await fetch(`${API_BASE}/reportes.php?participanteId=${participanteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) { alert('No se pudo eliminar.'); btn.disabled = false; btn.textContent = '🗑️'; return; }
    // Sincronizar estado local
    if (data.reporteEliminado) {
      delete visitasActivas[tareaId];
      delete borradoresActivos[tareaId];
    } else {
      // Refrescar visitas
      await cargarVisitasActivas();
    }
    await renderHistorialVisitasModal(tareaId);
    render();
  } catch(e) { alert('Error de conexión.'); btn.disabled = false; btn.textContent = '🗑️'; }
}

async function eliminarReporteVisita(reporteId, tareaId, btn) {
  if (!confirm('¿Eliminar esta visita completa? Se borrarán todos los check-ins registrados en ella.')) return;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const res  = await fetch(`${API_BASE}/reportes.php?id=${reporteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) { alert('No se pudo eliminar.'); btn.disabled = false; btn.textContent = '🗑️ Borrar visita'; return; }
    delete visitasActivas[tareaId];
    if (borradoresActivos[tareaId]) {
      borradoresActivos[tareaId] = borradoresActivos[tareaId].filter(b => b.id !== reporteId);
      if (!borradoresActivos[tareaId].length) delete borradoresActivos[tareaId];
    }
    await renderHistorialVisitasModal(tareaId);
    render();
  } catch(e) { alert('Error de conexión.'); btn.disabled = false; btn.textContent = '🗑️ Borrar visita'; }
}

async function guardarParticipanteVisita(btn) {
  const row    = btn.closest('[data-part-id]');
  const partId = row.dataset.partId;
  const repId  = row.dataset.repId;
  const tecId  = row.querySelector('.hvp-tecnico').value;
  const hIn    = row.querySelector('.hvp-in').value;
  const hOut   = row.querySelector('.hvp-out').value;
  const horasContratoEl = row.querySelector('.hvp-horas-contrato');
  const horasContrato = horasContratoEl ? (horasContratoEl.value !== '' ? parseFloat(horasContratoEl.value) : null) : undefined;
  if (!hIn) { alert('La hora de entrada es obligatoria.'); return; }

  // Contar pausas del participante antes de guardar para detectar eliminaciones
  let pausasAntes = 0;
  try {
    const repAntes = await fetch(`${API_BASE}/reportes.php?id=${repId}`).then(r => r.json());
    const partAntes = (repAntes.participantes || []).find(p => p.id === partId);
    pausasAntes = (partAntes?.pausas || []).filter(p => p.pausa_fin).length;
  } catch(e) { /* no crítico */ }

  btn.disabled = true; btn.textContent = '⏳';
  try {
    const res = await fetch(`${API_BASE}/reportes.php?id=${repId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'editParticipante', participanteId: partId, tecnicoId: tecId, checkIn: hIn, checkOut: hOut || null, ...(horasContrato !== undefined ? { horasContrato } : {}) }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }

    // Detectar si el backend eliminó pausas que quedaron fuera del nuevo horario
    const partDespues = (data.participantes || []).find(p => p.id === partId);
    const pausasDespues = (partDespues?.pausas || []).filter(p => p.pausa_fin).length;
    const eliminadas = pausasAntes - pausasDespues;

    btn.textContent = eliminadas > 0 ? `✅ (${eliminadas} pausa${eliminadas>1?'s':''} eliminada${eliminadas>1?'s':''})` : '✅';
    setTimeout(() => { btn.disabled = false; btn.textContent = '💾'; }, 2500);

    // Actualizar estado local y re-renderizar historial
    if (data.estado === 'en_visita') visitasActivas[data.tarea_id] = data;
    else {
      // Puede que haya pasado de en_visita a borrador tras editar
      if (visitasActivas[data.tarea_id]?.id === repId) delete visitasActivas[data.tarea_id];
      if (!borradoresActivos[data.tarea_id]) borradoresActivos[data.tarea_id] = [];
      const idx = borradoresActivos[data.tarea_id].findIndex(b => b.id === repId);
      if (idx >= 0) borradoresActivos[data.tarea_id][idx] = data;
      else borradoresActivos[data.tarea_id].push(data);
    }
    render();
    await renderHistorialVisitasModal(data.tarea_id);
  } catch(e) {
    alert('Error al guardar. Intenta de nuevo.');
    btn.disabled = false; btn.textContent = '💾';
  }
}
async function compartirPDFWhatsApp(btn) {
  if (!reporteActual?.pdf_archivo) { alert('Primero genera el PDF.'); return; }
  if (!navigator.canShare) { alert('Tu dispositivo no soporta compartir archivos. Descarga el PDF y compártelo manualmente.'); return; }
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '⏳ Preparando...';
  try {
    const res = await fetch(`${API_BASE}/reporte_pdf.php?id=${reporteActual.id}`);
    if (!res.ok) throw new Error('No se pudo obtener el PDF');
    const blob = await res.blob();
    const fileName = reporteActual.pdf_archivo.split('/').pop() || 'reporte-innovate.pdf';
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (!navigator.canShare({ files: [file] })) { alert('Tu dispositivo no soporta compartir PDF. Descárgalo y compártelo desde WhatsApp.'); return; }
    const tarea = tasks.find(t => t.id === reporteActual.tarea_id);
    const fechaVisita = reporteActual.check_in ? new Date(reporteActual.check_in.replace(' ','T')).toLocaleDateString('es-CO', { day:'numeric', month:'long', year:'numeric' }) : '';
    const texto = `Buen día. Adjunto el reporte de visita técnica para *${tarea?.titulo || 'servicio técnico'}*${tarea?.cliente ? ` – ${tarea.cliente}` : ''}${fechaVisita ? `, realizada el ${fechaVisita}` : ''}.

Agradecemos su confianza en Grupo Innovate. Estamos siempre disponibles para apoyarle en sus próximas necesidades de soporte técnico. ¡Será un gusto servirle de nuevo! 🔧

_Grupo Innovate · 📞 317 645 2811 · info@innovate.com.co_`;
    await navigator.share({ files: [file], title: 'Reporte de visita técnica – Grupo Innovate', text: texto });
  } catch(e) {
    if (e.name !== 'AbortError') alert('No se pudo compartir. Intenta descargar el PDF y enviarlo manualmente.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}
// ===================== FIN REPORTES DE VISITA =====================
