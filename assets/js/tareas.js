// Actualiza la etiqueta de fecha fin en el formulario según fechaProg + diasProg
function borrarProgramacion() {
  const fp = document.getElementById('f-fechaprog');
  const dp = document.getElementById('f-dias-prog');
  const hp = document.getElementById('f-hora-prog');
  const lb = document.getElementById('fechaprog-fin-label');
  if (fp) fp.value = '';
  if (dp) dp.value = 1;
  if (hp) hp.value = '08:00';
  if (lb) lb.textContent = '';
}

function actualizarFechaFinProg() {
  const fecha = document.getElementById('f-fechaprog')?.value;
  const dias  = parseInt(document.getElementById('f-dias-prog')?.value) || 1;
  const label = document.getElementById('fechaprog-fin-label');
  if (!label) return;
  if (!fecha || dias <= 1) { label.textContent = ''; return; }
  const fin = fechaProgFin({ fechaProg: fecha, diasProg: dias });
  label.textContent = fin && fin !== fecha ? `Hasta: ${fin}` : '';
}

function avatarEl(id, size=22) {
  const m = getMember(id);
  if (!m) return '';
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${m.color};font-size:${size<=22?'8px':'10px'}" title="${esc(m.name)}">${m.initials}</div>`;
}

// TEAM PICKER
function buildTeamPicker(selected=[]) {
  selectedTeam = [...selected];
  const el = document.getElementById('team-picker');
  const chips = selectedTeam.map(id => {
    const m = getMember(id);
    if (!m) return '';
    return `
    <div class="team-chip" data-id="${id}">
      <div class="chip-avatar" style="background:${m.color}">${m.initials}</div>
      <span>${m.name.split(' ')[0]} ${m.name.split(' ')[1]||''}</span>
      <span class="chip-remove" onclick="toggleTeamChip('${id}')" title="Quitar">✕</span>
    </div>`;
  }).join('');
  const disponibles = TEAM.filter(m => !selectedTeam.includes(m.id));
  const options = `<option value="">+ Agregar técnico...</option>` +
    disponibles.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  el.innerHTML = `<div class="team-chips">${chips}</div>
    <select id="team-select" onchange="addTeamMember(this.value)">${options}</select>`;
  renderAvisoWhatsAppTarea();
}

// ----------------- Avisar por WhatsApp (equipo asignado) -----------------
// Un botón por cada técnico seleccionado en el equipo de la tarjeta. Si el
// técnico tiene celular registrado, abre wa.me con el mensaje ya escrito
// (funciona antes o después de guardar — usa los valores actuales del
// formulario). Si no tiene celular, cae a copiar el texto al portapapeles.
function renderAvisoWhatsAppTarea() {
  const el = document.getElementById('aviso-wp-tarea');
  if (!el) return;
  if (!selectedTeam.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">📲 Avisar por WhatsApp:</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${selectedTeam.map(id => {
        const m = getMember(id);
        if (!m) return '';
        const tieneCel = !!m.celular;
        return `<button type="button" onclick="avisarTecnicoWhatsApp('${id}')"
          style="background:${tieneCel ? '#25D366' : '#94a3b8'};color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer"
          title="${tieneCel ? 'Abre WhatsApp con el mensaje listo' : 'Sin celular registrado — copia el texto al portapapeles'}">
          ${tieneCel ? '📲' : '📋'} ${esc(m.name.split(' ')[0])}
        </button>`;
      }).join('')}
    </div>`;
}

// Arma el texto del aviso con los valores ACTUALES del formulario (sirve
// tanto antes como después de darle "Guardar").
function _construirTextoAvisoTarea() {
  const cliente   = document.getElementById('f-cliente')?.value.trim()  || '';
  const titulo    = document.getElementById('f-titulo')?.value.trim()   || '';
  const desc      = document.getElementById('f-desc')?.value.trim()     || '';
  const fechaProg = document.getElementById('f-fechaprog')?.value       || '';
  const diasProg  = parseInt(document.getElementById('f-dias-prog')?.value) || 1;
  const horaProg  = document.getElementById('f-hora-prog')?.value       || '';
  const modalidad = document.querySelector('input[name="f-modalidad"]:checked')?.value || null;

  let fechaStr = '';
  if (fechaProg) {
    fechaStr = new Date(fechaProg + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    if (diasProg > 1) fechaStr += ` (${diasProg} días)`;
  }
  const modStr = modalidad === 'en_sitio' ? '🏢 En sitio' : modalidad === 'remoto' ? '💻 Remoto' : '';

  let texto = `📋 *Nueva tarea asignada*\n\n`;
  if (cliente)  texto += `👤 Cliente: ${cliente}\n`;
  texto += `📋 Tarea: ${titulo || '-'}\n`;
  if (fechaStr) texto += `📅 Fecha: ${fechaStr}\n`;
  if (horaProg) texto += `🕗 Hora: ${horaProg}\n`;
  if (modStr)   texto += `📍 Modalidad: ${modStr}\n`;
  if (desc)     texto += `\n📝 ${desc}\n`;
  texto += `\nCualquier duda me escribes. Gracias!`;
  return texto;
}

// Normaliza un celular colombiano a formato internacional sin "+" (lo que
// espera wa.me): si son 10 dígitos que empiezan en 3, antepone el 57.
function _normalizarCelularCO(raw) {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) digits = '57' + digits;
  return digits;
}

function avisarTecnicoWhatsApp(tecnicoId) {
  const m = getMember(tecnicoId);
  const texto = _construirTextoAvisoTarea();
  if (m?.celular) {
    const numero = _normalizarCelularCO(m.celular);
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank');
  } else {
    _copiarAvisoTarea(texto, m?.name);
  }
}

async function _copiarAvisoTarea(texto, nombre) {
  try {
    await navigator.clipboard.writeText(texto);
    alert(`✅ Copiado al portapapeles (${nombre || 'este técnico'} no tiene celular registrado en Ginno). Pégalo en su chat de WhatsApp.`);
  } catch (e) {
    alert('No se pudo copiar automáticamente. Copia el texto manualmente:\n\n' + texto);
  }
}

function addTeamMember(id) {
  if (!id || selectedTeam.includes(id)) return;
  selectedTeam.push(id);
  buildTeamPicker(selectedTeam);
}

function toggleTeamChip(id) {
  selectedTeam = selectedTeam.filter(x=>x!==id);
  buildTeamPicker(selectedTeam);
}

function getFiltered() {
  const q = document.getElementById('search').value.toLowerCase();
  const est = document.getElementById('f-estado').value;
  const resp = document.getElementById('f-responsable').value;
  const incluirArchivados = document.getElementById('incluir-archivados').checked;
  return tareasVisibles().filter(t => {
    if (currentArea !== 'all' && t.area !== currentArea) return false;
    if (t.estado === 'archivado' && !incluirArchivados && est !== 'archivado') return false;
    const teamNames = (t.team||[]).map(id=>getMember(id)?.name||'').join(' ').toLowerCase();
    const teamInitials = (t.team||[]).join(' ').toLowerCase();
    const idTarjeta = ('#' + (t.id||'').slice(0,6)).toLowerCase();
    if (q && !((t.titulo||'').toLowerCase().includes(q)||(t.cliente||'').toLowerCase().includes(q)||teamNames.includes(q)||teamInitials.includes(q)||idTarjeta.includes(q))) return false;
    if (est && t.estado !== est) return false;
    if (resp && !(t.team||[]).includes(resp)) return false;
    return true;
  });
}

function updateFilters() {
  const sel = document.getElementById('f-responsable');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los colaboradores</option>' +
    TEAM.map(m => `<option value="${m.id}">${m.initials} – ${m.name}</option>`).join('');
  sel.value = cur;
}

function updateTabCounts() {
  const active = t => t.estado !== 'archivado';
  Object.keys(AREAS).forEach(a => {
    const el = document.getElementById('cnt-'+a);
    if (el) el.textContent = tareasVisibles().filter(t=>t.area===a&&active(t)).length;
  });
}

function renderStats() {
  const pool = currentArea==='all' ? tareasVisibles() : tareasVisibles().filter(t=>t.area===currentArea);
  const active = pool.filter(t=>t.estado!=='archivado');
  const total  = active.length;
  const prog   = active.filter(t=>t.estado==='en-progreso').length;
  const bloq   = active.filter(t=>t.estado==='bloqueada').length;
  const pfact  = active.filter(t=>t.estado==='por-facturar').length;
  const arch   = tareasVisibles().filter(t=>t.estado==='archivado').length;
  const sinFact= pool.filter(t=>alertaFacturacion(t)!==null).length;
  const today  = new Date().toISOString().split('T')[0];
  const venc   = active.filter(t=>t.fecha&&t.fecha<today&&t.estado==='pendiente').length;
  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Activas</div><div class="stat-value">${total}</div></div>
    <div class="stat-card"><div class="stat-label">En progreso</div><div class="stat-value blue">${prog}</div></div>
    <div class="stat-card"><div class="stat-label">Por facturar</div><div class="stat-value yellow">${pfact}</div></div>
    <div class="stat-card"><div class="stat-label">Bloqueadas</div><div class="stat-value red">${bloq}</div></div>
    <div class="stat-card"><div class="stat-label">🚨 Sin facturar</div><div class="stat-value ${sinFact>0?'red':''}">${sinFact}</div></div>
    <div class="stat-card"><div class="stat-label">Archivadas</div><div class="stat-value">${arch}</div></div>`;
}

function teamAvatars(ids=[]) {
  return `<div class="team-row">${ids.map(id=>avatarEl(id)).join('')}</div>`;
}

function taskCard(t) {
  const venc      = isVencida(t);
  const alerta    = alertaFacturacion(t);
  const alertaSeg = alertaSeguimiento(t);
  const ac        = (AREAS[t.area]||{}).color || '#94a3b8';
  // Incumplida: IT/IF programada cuyo rango de fechas ya pasó sin check-in
  const _hoyCard    = (typeof _horaBogota === 'function') ? _horaBogota().fecha : new Date().toISOString().substring(0,10);
  const _finCard    = t.fechaProg ? ((typeof fechaProgFin === 'function') ? (fechaProgFin(t) || t.fechaProg) : t.fechaProg) : null;
  const _tieneActividadReporte = (typeof visitasActivas !== 'undefined' && visitasActivas[t.id])
    || (typeof reportesTodosEnviados !== 'undefined' && reportesTodosEnviados.has(t.id))
    || (typeof sinReporteHoy    !== 'undefined' && sinReporteHoy.has(t.id));
  const esIncumplida = ['it','if'].includes(t.area) && t.estado === 'programado' && _finCard && _finCard < _hoyCard && !_tieneActividadReporte;
  const team      = t.team||[];
  const segColor = (alertaSeg?.tipo==='sin-seguimiento' && alertaSeg.vencido) ? '#ef4444'
    : { 'sin-seguimiento':'#94a3b8', 'pendiente':'#ef4444', 'al-dia':'#10b981' }[alertaSeg?.tipo] || ac;
  const segBg    = (alertaSeg?.tipo==='sin-seguimiento' && alertaSeg.vencido) ? 'background:#fff5f5;'
    : { 'sin-seguimiento':'background:#f8fafc;', 'pendiente':'background:#fff5f5;', 'al-dia':'' }[alertaSeg?.tipo] || '';
  const sinProgramar = ['it','if'].includes(t.area) && t.estado === 'solicitud' && !t.fechaProg;
  const porCotizar   = alertaPorCotizar(t);
  const esPorReprogramar = t.estado === 'por_reprogramar';
  const borderColor = esPorReprogramar ? '#f97316' : esIncumplida ? '#F54927' : (alerta&&alerta.vencido) ? '#ef4444' : sinProgramar ? '#ef4444' : (porCotizar&&porCotizar.vencido) ? '#ef4444' : alertaSeg ? segColor : ac;
  const bgAlert     = esPorReprogramar ? 'background:#fff7ed;' : esIncumplida ? 'background:#fff3f0;' : (alerta&&alerta.vencido) ? 'background:#fff5f5;' : sinProgramar ? 'background:#fff5f5;' : (porCotizar&&porCotizar.vencido) ? 'background:#fff5f5;' : (alertaSeg ? segBg : '');
  const showArchivar = (['it','if'].includes(t.area) && ['realizado','facturado'].includes(t.estado))
                    || (t.area==='comercial' && ['aprobada','rechazada'].includes(t.estado));
  let segBadge = '';
  if (alertaSeg?.tipo === 'sin-seguimiento') {
    segBadge = `<div style="font-size:11px;font-weight:700;color:${alertaSeg.vencido?'#ef4444':'#64748b'};margin-bottom:4px">📋 ${alertaSeg.dias} día${alertaSeg.dias===1?'':'s'} sin contactar</div>`;
  } else if (alertaSeg?.tipo === 'pendiente') {
    segBadge = `<div style="font-size:11px;font-weight:700;color:#ef4444;margin-bottom:4px">🔔 Seguimiento pendiente (${alertaSeg.fecha})</div>`;
  } else if (alertaSeg?.tipo === 'al-dia') {
    segBadge = `<div style="font-size:11px;font-weight:600;color:#059669;margin-bottom:4px">✓ Próx. seguimiento: ${alertaSeg.fecha}</div>`;
  }
  let diasEstadoBadge = '';
  if (['it','if'].includes(t.area)) {
    if (t.estado === 'solicitud') {
      const dias = diasHabilesDesde(t.createdAt);
      diasEstadoBadge = `<div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px">⏳ ${dias} día${dias===1?'':'s'} en pendientes</div>`;
    } else if (t.estado === 'programado') {
      if ((t.diasProg || 1) > 1) {
        const diaActual  = diaActualEnProg(t);
        const diasExceso = (t.tipoTarea === 'proyecto' && typeof diasExcedidosProyecto === 'function') ? diasExcedidosProyecto(t) : 0;
        const excedido   = diasExceso > 0;
        const restantes  = t.diasProg - diaActual;
        const restTxt    = excedido ? `excedido por ${diasExceso} día${diasExceso===1?'':'s'}` : (restantes > 0 ? `${restantes} día${restantes===1?'':'s'} restante${restantes===1?'':'s'}` : 'último día');
        const colorDias  = excedido ? '#ef4444' : '#6366f1';
        const diaMostrado = excedido ? (t.diasProg + diasExceso) : diaActual;
        diasEstadoBadge  = `<div style="font-size:11px;font-weight:600;color:${colorDias};margin-bottom:4px">${excedido?'⚠️':'🔧'} Día ${diaMostrado} de ${t.diasProg} · ${restTxt}</div>`;
      } else {
        const dias = diasHabilesDesde(t.programadoAt);
        diasEstadoBadge = `<div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px">🔧 ${dias} día${dias===1?'':'s'} en ejecución</div>`;
      }
    }
  } else if (porCotizar) {
    diasEstadoBadge = `<div style="font-size:11px;font-weight:600;color:${porCotizar.vencido?'#ef4444':'#64748b'};margin-bottom:4px">⏳ ${porCotizar.dias} día${porCotizar.dias===1?'':'s'} sin cotizar</div>`;
  }
  const avanceBadge = (t.tipoTarea === 'proyecto' && t.avanceProyectoPct != null)
    ? `<div style="font-size:11px;font-weight:700;color:#0D3B40;margin-bottom:4px">📊 Avance del proyecto: ${t.avanceProyectoPct}%</div>`
    : '';
  const horasProyectoBadge = (t.tipoTarea === 'proyecto' && t.diasTrabajadosProyecto > 0)
    ? `<div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px">⏱ ${t.horasTrabajadasProyecto}h trabajadas · 📆 ${t.diasTrabajadosProyecto} día${t.diasTrabajadosProyecto===1?'':'s'}</div>`
    : '';
  return `<div class="task-card" data-id="${t.id}" draggable="true"
      ondragstart="onDragStart(event,'${t.id}')"
      ondragend="onDragEnd(event)"
      onclick="openModal('${t.id}')"
      style="border-left:3px solid ${borderColor};${bgAlert}">
    ${esPorReprogramar ? `<div style="font-size:11px;font-weight:700;color:#f97316;margin-bottom:4px">🔁 Por reprogramar</div>` : ''}
    ${esIncumplida ? `<div style="font-size:11px;font-weight:700;color:#F54927;margin-bottom:4px">⛔ Incumplida — sin check-in el día programado</div>` : ''}
    ${alerta ? `<div style="font-size:11px;font-weight:700;color:${alerta.vencido?'#ef4444':'#92400e'};margin-bottom:4px">🧾 ${alerta.dias} día${alerta.dias===1?'':'s'} hábil${alerta.dias===1?'':'es'} sin facturar</div>` : ''}
    ${sinProgramar ? `<div style="font-size:11px;font-weight:700;color:#ef4444;margin-bottom:4px">⚠️ Sin fecha de programación</div>` : ''}
    ${diasEstadoBadge}
    ${avanceBadge}
    ${horasProyectoBadge}
    ${segBadge}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px">
      ${t.cliente?`<div style="font-size:11px;font-weight:700;color:#169BBC;margin-bottom:2px;text-transform:uppercase;letter-spacing:0.03em">${esc(t.cliente)}</div>`:'<div></div>'}
      <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.05em;white-space:nowrap;margin-top:1px">#${t.id.slice(0,6).toUpperCase()}</div>
    </div>
    <div class="task-title">${esc(t.titulo)}</div>
    <div class="task-meta">
      ${currentArea==='all'&&t.area?`<span class="badge" style="background:${ac}20;color:${ac}">${esc((AREAS[t.area]||{}).label||t.area)}</span>`:''}
    </div>
    ${team.length ? `<div class="task-assignee">${teamAvatars(team)}<span>${team.map(id=>getMember(id)?.initials||id).join(', ')}</span></div>` : ''}
    ${t.fechaProg ? (() => {
      const fin  = (t.diasProg||1) > 1 ? fechaProgFin(t) : null;
      const hora = (t.horaProg && t.horaProg !== '08:00') ? ` 🕗 ${t.horaProg}` : (t.horaProg ? ` 🕗 ${t.horaProg}` : '');
      return `<div class="task-date">🗓 Prog: ${t.fechaProg}${fin ? ` → ${fin}` : ''}${hora}</div>`;
    })() : ''}
    ${t.fecha?`<div class="task-date${venc?' vencida':''}">${venc?'⚠️ ':'📅 '}Límite: ${t.fecha}${t.tiempo?` · ⏱ ${esc(t.tiempo)}`:''}</div>`:(t.tiempo?`<div class="task-date">⏱ ${esc(t.tiempo)}</div>`:'')}
    ${t.recursos?`<div class="task-date">🔧 ${esc(t.recursos.slice(0,45))}${t.recursos.length>45?'...':''}</div>`:''}
    ${t.reporte?`<div class="task-date" style="color:#059669">📝 Reporte registrado</div>`:''}
    
    ${t.reporteInterno?`<div class="task-date" style="color:#0D3B40;font-weight:600">🔒 Reporte interno</div>`:''}
    ${(typeof tareasFaltaReporte !== 'undefined' && tareasFaltaReporte.has(t.id))?`<div class="task-date" style="color:#dc2626;font-weight:600">⚠️ Falta reporte</div>`:''}
    ${t.factura?`<div class="task-date" style="color:#166534">✅ Factura: ${esc(t.factura)}</div>`:''}
    ${((['it','if'].includes(t.area) && t.estado==='realizado' && reportesTodosEnviados.has(t.id)) || (t.area==='admin' && t.estado==='por-facturar')) && !t.factura ? `<button class="btn-archivar" style="background:#d97706;color:#fff" onclick="_abrirRegistroFacturaRapido('${t.id}',event)">🧾 Registrar factura</button>` : ''}
    ${(!t.factura && t.motivoNoFactura)?`<div class="task-date" style="color:#0D3B40;font-size:12px;font-weight:600">📋 Sin factura: ${esc(t.motivoNoFactura)}</div>`:''}
    ${(['it','if'].includes(t.area) && t.estado==='realizado' && t.cotizacionDocx) ? `<button class="btn-archivar" style="background:#3b82f6;color:#fff" onclick="generarFacturaDesdeTarea('${t.id}',event)">🧾 Generar factura desde cotización</button>` : ''}
    ${(['it','if'].includes(t.area) && (!['realizado','facturado','archivado'].includes(t.estado) || (t.estado === 'realizado' && (t.fechaProg === _hoyCard || (typeof reportesTodosEnviados !== 'undefined' && reportesTodosEnviados.has(t.id)))))) ? renderVisitaBoton(t) : ''}
    ${showArchivar ? `<button class="btn-archivar" onclick="archivarTask('${t.id}',event)">📦 Archivar</button>` : ''}
  </div>`;
}


// ---- Ordenamiento automático de tarjetas operativas (IT/IF) ----
// 1º sin fechaProg, por createdAt ascendente (orden de entrada)
// 2º con fechaProg, por fechaProg descendente (más reciente primero)
function sortTarjetasOperativas(arr) {
  return [...arr].sort((a, b) => {
    const aP = !!a.fechaProg, bP = !!b.fechaProg;
    if (!aP && bP) return -1;
    if (aP && !bP) return  1;
    if (!aP && !bP) {
      // mismo grupo sin programar: orden de entrada (createdAt asc)
      return (a.createdAt||'') < (b.createdAt||'') ? -1
           : (a.createdAt||'') > (b.createdAt||'') ?  1 : 0;
    }
    // mismo grupo con programar: fecha más reciente primero (desc)
    return b.fechaProg < a.fechaProg ? -1
         : b.fechaProg > a.fechaProg ?  1 : 0;
  });
}

function renderKanban() {
  const filtered = getFiltered();
  const cols = getColsForArea(currentArea).filter(c => !c.noColumn);
  const colArea = currentArea==='all' ? null : currentArea;
  const esOpArea = ['it','if'].includes(currentArea);

  let html = cols.map(col => {
    const rawCt = filtered.filter(t=>t.estado===col.id || (col.id==='solicitud' && esOpArea && t.estado==='por_reprogramar'));
    const ct = esOpArea ? sortTarjetasOperativas(rawCt) : rawCt;
    const addArea = colArea || 'it';
    return `<div class="kanban-col col-${col.id}">
      <div class="col-header">${col.label} <span class="count">${ct.length}</span></div>
      <div class="col-body"
        ondragover="onDragOver(event)"
        ondragleave="onDragLeave(event)"
        ondrop="onDrop(event,'${col.id}')">
        ${ct.length ? ct.map(taskCard).join('') : '<div class="empty">Sin tareas</div>'}
        <button class="btn-col-add" onclick="openModal(null,'${addArea}','${col.id}')">+ Agregar</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('kanban-view').innerHTML = html;

  // Archived section below the board
  const archPool = currentArea==='all' ? tareasVisibles() : tareasVisibles().filter(t=>t.area===currentArea);
  const arch = archPool.filter(t=>t.estado==='archivado');

  // Cuando "Incluir archivados" está marcado, las tarjetas archivadas también
  // se filtran por el buscador y el responsable seleccionado.
  const incluirArchivados = document.getElementById('incluir-archivados')?.checked;
  const q = document.getElementById('search').value.toLowerCase();
  const resp = document.getElementById('f-responsable').value;
  const archVisible = incluirArchivados
    ? arch.filter(t => {
        const teamNames = (t.team||[]).map(id=>getMember(id)?.name||'').join(' ').toLowerCase();
        const teamInitials = (t.team||[]).join(' ').toLowerCase();
        const idTarjeta = ('#' + (t.id||'').slice(0,6)).toLowerCase();
        if (q && !((t.titulo||'').toLowerCase().includes(q)||(t.cliente||'').toLowerCase().includes(q)||teamNames.includes(q)||teamInitials.includes(q)||idTarjeta.includes(q))) return false;
        if (resp && !(t.team||[]).includes(resp)) return false;
        return true;
      })
    : arch;

  const archDiv = document.getElementById('arch-section');
  if (archDiv) {
    if (archVisible.length) {
      const areaKey = currentArea || 'all';
      const hayCoincidencias = incluirArchivados && !!q && archVisible.length > 0;
      const expanded = hayCoincidencias || localStorage.getItem(`arch-open-${areaKey}`) === '1';
      archDiv.innerHTML = `
        <button class="arch-toggle" onclick="toggleArchSection('${areaKey}')">
          📦 Archivadas (${archVisible.length}) ${expanded ? '▴' : '▾'}
        </button>
        <div id="arch-cards" style="display:${expanded ? 'flex' : 'none'};flex-direction:column;opacity:0.85">
          ${_renderArchivadasAgrupadas(archVisible, areaKey)}
        </div>`;
    } else {
      archDiv.innerHTML = '';
    }
  }
}

// Tarjetas archivadas agrupadas por cliente (colapsado por defecto, orden
// alfabético; "Sin cliente" al final). Dentro de cada grupo se usan tarjetas
// compactas en vez del diseño completo — con muchas archivadas, el formato
// grande hacía que la sección fuera imposible de recorrer.
function _renderArchivadasAgrupadas(archVisible, areaKey) {
  const grupos = {};
  archVisible.forEach(t => {
    const cliente = (t.cliente || '').trim() || 'Sin cliente';
    (grupos[cliente] = grupos[cliente] || []).push(t);
  });
  const clientes = Object.keys(grupos).sort((a, b) => {
    if (a === 'Sin cliente') return 1;
    if (b === 'Sin cliente') return -1;
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });
  return clientes.map((cliente, i) => {
    const items = [...grupos[cliente]].sort((a, b) =>
      (b.fechaProg || b.fecha || b.createdAt || '').localeCompare(a.fechaProg || a.fecha || a.createdAt || ''));
    const gid = `arch-cli-${areaKey}-${i}`;
    return `<div class="arch-cliente-grupo">
      <button class="arch-cliente-toggle" onclick="toggleArchCliente('${gid}')"
        style="display:flex;align-items:center;gap:6px;width:100%;text-align:left;background:none;border:none;padding:6px 4px;cursor:pointer;font-size:12px;font-weight:600;color:var(--text-secondary)">
        <span class="arch-cliente-caret">▸</span>
        <span>${esc(cliente)}</span>
        <span style="color:var(--text-muted);font-weight:400">(${items.length})</span>
      </button>
      <div id="${gid}" style="display:none;flex-direction:column;margin-left:10px;border-left:2px solid var(--border)">
        ${items.map(taskCardCompacta).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleArchCliente(gid) {
  const el = document.getElementById(gid);
  if (!el) return;
  const btn = el.previousElementSibling;
  const caret = btn ? btn.querySelector('.arch-cliente-caret') : null;
  const opening = el.style.display === 'none';
  el.style.display = opening ? 'flex' : 'none';
  if (caret) caret.textContent = opening ? '▾' : '▸';
}

// Fila compacta para tarjetas dentro de un grupo de archivadas — sin drag,
// sin botones de acción, solo lo necesario para identificar y abrir.
function taskCardCompacta(t) {
  const team  = t.team || [];
  const fecha = t.fechaProg || t.fecha || '';
  return `<div class="task-card-compacta" onclick="openModal('${t.id}')"
      style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid var(--border);cursor:pointer;font-size:12px">
    <span style="font-size:10px;font-weight:700;color:#94a3b8;white-space:nowrap">#${t.id.slice(0,6).toUpperCase()}</span>
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${esc(t.titulo)}</span>
    ${fecha ? `<span style="color:var(--text-muted);white-space:nowrap">📅 ${esc(fecha)}</span>` : ''}
    ${team.length ? `<span style="white-space:nowrap;display:flex;gap:2px">${teamAvatars(team)}</span>` : ''}
    ${t.factura ? `<span title="Facturada" style="color:#166534;white-space:nowrap">✅</span>` : ''}
  </div>`;
}

function toggleArchSection(areaKey) {
  const el = document.getElementById('arch-cards');
  const btn = document.querySelector('.arch-toggle');
  if (!el) return;
  const opening = el.style.display === 'none';
  el.style.display = opening ? 'flex' : 'none';
  localStorage.setItem(`arch-open-${areaKey || currentArea || 'all'}`, opening ? '1' : '0');
  if (btn) btn.innerHTML = `📦 Archivadas (${el.children.length}) ${opening ? '▴' : '▾'}`;
}

function renderLista() {
  const filtered = getFiltered();
  if (!filtered.length) { document.getElementById('lista-view').innerHTML='<div class="empty">No hay tareas</div>'; return; }
  document.getElementById('lista-view').innerHTML = `<table>
    <thead><tr><th>Tarea</th><th>Área</th><th>Equipo</th><th>Estado</th><th>Fecha</th><th>Factura</th></tr></thead>
    <tbody>${filtered.map(t=>{
      const ac=(AREAS[t.area]||{}).color||'#94a3b8';
      const team=t.team||[];
      return `<tr onclick="openModal('${t.id}')">
        <td><strong>${esc(t.titulo)}</strong>${t.recursos?`<br><span style="color:var(--text-muted);font-size:11px">🔧 ${esc(t.recursos.slice(0,40))}${t.recursos.length>40?'...':''}</span>`:''}</td>
        <td><span class="badge" style="background:${ac}20;color:${ac}">${esc((AREAS[t.area]||{}).label||'-')}</span></td>
        <td><div style="display:flex;gap:3px;flex-wrap:wrap">${team.map(id=>avatarEl(id)).join('')}</div></td>
        <td><span class="status-pill status-${t.estado||'pendiente'}">${(t.estado||'pendiente').replace('-',' ')}</span></td>
        <td class="${isVencida(t)?'task-date vencida':''}">${t.fecha||'-'}</td>
        <td>${t.factura?`<span style="color:#166534;font-weight:600">✅ ${esc(t.factura)}</span>`:t.estado==='por-facturar'?'<span style="color:#d97706">🧾 Pendiente</span>':'-'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function render() {
  updateFilters();
  updateTabCounts();
  const isDash = currentView === 'dashboard';
  document.getElementById('stats').style.display = isDash ? 'none' : 'grid';
  document.querySelector('.filters').style.display = isDash ? 'none' : 'flex';
  if (isDash) { renderDashboard(); return; }
  renderStats();
  if (currentView==='kanban') renderKanban(); else renderLista();
}

function setView(v) {
  if (currentUser && currentUser.perfil === 'tecnico' && v === 'dashboard') v = 'kanban'; // técnicos no ven el dashboard global
  currentView=v;
  if (v === 'dashboard') {
    // Salir de las vistas especiales al volver al Dashboard
    document.getElementById('facturacion-view').style.display = 'none';
    document.getElementById('cartera-view').style.display = 'none';
    document.getElementById('clientes-view').style.display = 'none';
    document.getElementById('informes-view').style.display = 'none';
    document.getElementById('agenda-view').style.display = 'none';
    document.getElementById('transportes-view').style.display = 'none';
    document.getElementById('bitacora-view').style.display = 'none';
    document.querySelector('.filters').style.display = 'none';
    document.querySelector('.btn-add').style.display = 'inline-flex';
    document.getElementById('btn-kanban').style.display = '';
    document.getElementById('btn-lista').style.display = '';
  }
  document.getElementById('dashboard-view').style.display=v==='dashboard'?'block':'none';
  document.getElementById('kanban-view').style.display=v==='kanban'?'flex':'none';
  document.getElementById('lista-view').style.display=v==='lista'?'block':'none';
  const archSection = document.getElementById('arch-section');
  if (archSection) archSection.style.display = v==='kanban' ? 'block' : 'none';
  document.getElementById('btn-dashboard').className=v==='dashboard'?'active':'';
  document.getElementById('btn-kanban').className=v==='kanban'?'active':'';
  document.getElementById('btn-lista').className=v==='lista'?'active':'';
  render();
}

function dashMetric(label, value, color, highlight=false, area='', estado='') {
  const bg = highlight ? color+'18' : 'var(--bg)';
  const border = highlight ? color+'55' : 'var(--border)';
  const numColor = value > 0 ? color : 'var(--text-muted)';
  const clickable = area ? `onclick="goToArea('${area}','${estado}')" style="cursor:pointer;` : 'style="';
  return `<div ${clickable}flex:1;min-width:90px;text-align:center;background:${bg};border-radius:10px;padding:14px 10px;border:1px solid ${border};transition:transform .1s,box-shadow .1s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
    <div style="font-size:32px;font-weight:800;color:${numColor};line-height:1">${value}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:.4px;font-weight:600">${label}</div>
  </div>`;
}

function dashAreaCard(icon, title, color, areaKey, solSinProg, solProg, ejec, reprog, real, alertCount) {
  return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)">
    <div onclick="goToArea('${areaKey}','')" style="font-weight:700;font-size:15px;color:${color};margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer">
      <span>${icon} ${title} <span style="font-size:12px;font-weight:400;color:var(--text-muted)">→ ver todo</span></span>
      ${alertCount>0?`<span style="font-size:11px;font-weight:700;color:#ef4444;background:#fee2e2;padding:3px 9px;border-radius:99px">🚨 ${alertCount} sin facturar</span>`:''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${dashMetric('Sin programar', solSinProg, '#94a3b8', false, areaKey, 'solicitud')}
      ${dashMetric('Programadas', solProg, '#0891b2', false, areaKey, 'solicitud')}
      ${dashMetric('En ejecución', ejec, '#6366f1', false, areaKey, 'programado')}
      ${reprog>0 ? dashMetric('Por reprogramar', reprog, '#f97316', true, areaKey, 'por_reprogramar') : ''}
      ${dashMetric('Realizadas', real, '#ef4444', real>0, areaKey, 'realizado')}
    </div>
  </div>`;
}

function goToArea(area, estado) {
  setView('kanban');
  setArea(area);
  if (estado) {
    const sel = document.getElementById('f-estado');
    if (sel) { sel.value = estado; render(); }
  }
}

function renderDashboard() {
  const act = t => t.estado !== 'archivado';
  const itT  = tasks.filter(t=>t.area==='it'&&act(t));
  const ifT  = tasks.filter(t=>t.area==='if'&&act(t));
  const comT = tasks.filter(t=>t.area==='comercial'&&act(t));

  const itAlerts    = tasks.filter(t=>t.area==='it'&&alertaFacturacion(t)!==null);
  const ifAlerts    = tasks.filter(t=>t.area==='if'&&alertaFacturacion(t)!==null);
  const adminAlerts = tasks.filter(t=>t.area==='admin'&&alertaFacturacion(t)!==null);
  const allAlerts   = [...itAlerts, ...ifAlerts, ...adminAlerts]
    .sort((a, b) => alertaFacturacion(b).dias - alertaFacturacion(a).dias); // más vencidas primero
  const sinProgAlerts = tasks.filter(t=>act(t) && alertaProgramacion(t)!==null);
  const sinCotizarAlerts = tasks.filter(t=>act(t) && alertaPorCotizar(t)!==null);

  const comPorCotizar   = comT.filter(t=>t.estado==='por-cotizar').length;
  const comEnviada      = comT.filter(t=>t.estado==='enviada').length;
  const comAprobada     = comT.filter(t=>t.estado==='aprobada').length;
  const comRechazada    = comT.filter(t=>t.estado==='rechazada').length;
  const comSinSeguimiento = comT.filter(t=>alertaSeguimiento(t)?.tipo==='sin-seguimiento').length;
  const comSeguimientoPend = comT.filter(t=>alertaSeguimiento(t)?.tipo==='pendiente').length;
  const archSection = document.getElementById('arch-section');
  if (archSection) archSection.innerHTML = '';

  const today = new Date().toLocaleDateString('es-CO',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  let html = `<div style="max-width:960px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="font-size:12px;color:var(--text-muted);text-transform:capitalize">${today}</div>
      <button class="btn-save" onclick="openProgModal()" style="font-size:12px;padding:7px 14px">📋 Copiar programación</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-bottom:14px">
      ${dashAreaCard('💻','IT','#6366f1','it',
        itT.filter(t=>t.estado==='solicitud'&&!t.fechaProg).length,
        itT.filter(t=>t.estado==='solicitud'&&t.fechaProg).length,
        itT.filter(t=>t.estado==='programado').length,
        itT.filter(t=>t.estado==='por_reprogramar').length,
        itT.filter(t=>t.estado==='realizado').length,
        itAlerts.length)}
      ${dashAreaCard('🏗️','IF','#f97316','if',
        ifT.filter(t=>t.estado==='solicitud'&&!t.fechaProg).length,
        ifT.filter(t=>t.estado==='solicitud'&&t.fechaProg).length,
        ifT.filter(t=>t.estado==='programado').length,
        ifT.filter(t=>t.estado==='por_reprogramar').length,
        ifT.filter(t=>t.estado==='realizado').length,
        ifAlerts.length)}
    </div>
    <div id="contratos-vigentes-section"></div>
    <div id="proyectos-activos-section"></div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);margin-bottom:14px">
      <div onclick="goToArea('comercial','')" style="font-weight:700;font-size:15px;color:#3b82f6;margin-bottom:14px;cursor:pointer">
        💼 Comercial <span style="font-size:12px;font-weight:400;color:var(--text-muted)">→ ver todo</span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${dashMetric('Por cotizar', comPorCotizar, '#8b5cf6', comPorCotizar>0, 'comercial', 'por-cotizar')}
        ${dashMetric('Enviadas', comEnviada, '#6366f1', false, 'comercial', 'enviada')}
        ${dashMetric('📋 Sin seguimiento', comSinSeguimiento, '#94a3b8', comSinSeguimiento>0, 'comercial', 'enviada')}
        ${dashMetric('🔔 Seguimiento hoy', comSeguimientoPend, '#ef4444', comSeguimientoPend>0, 'comercial', 'enviada')}
        ${dashMetric('Aprobadas', comAprobada, '#10b981', false, 'comercial', 'aprobada')}
        ${dashMetric('Rechazadas', comRechazada, '#ef4444', false, 'comercial', 'rechazada')}
      </div>
    </div>`;

  if (allAlerts.length || sinProgAlerts.length || sinCotizarAlerts.length || comT.some(t=>{ const a=alertaSeguimiento(t); return a && (a.tipo==='sin-seguimiento'||a.tipo==='pendiente'); }) || (typeof _bitDeficitData !== 'undefined' && _bitDeficitData.length)) {
    html += `<div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:10px">🔔 Zona de alertas</div>`;
    html += '<div id="alertas-incumplidas"></div>';
  }

  // 1. Pendientes sin programar
  if (sinProgAlerts.length) {
    html += `<div style="background:#8dc63f;border:1px solid #8dc63f;border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="font-weight:700;font-size:13px;color:#ffffff;margin-bottom:10px">⚠️ Pendientes sin programar</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${sinProgAlerts.map(t=>{
          const a = alertaProgramacion(t);
          const vencido = a.vencido;
          return `<div onclick="openModal('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#ffffff;border-radius:8px;border:1px solid rgba(255,255,255,.5);cursor:pointer;font-size:13px">
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${(AREAS[t.area]||{}).color||'#a3a6ab'}25;color:${(AREAS[t.area]||{}).color||'#a3a6ab'}">${(AREAS[t.area]||{}).label||t.area}</span>
            <span style="font-weight:600;flex:1">${esc(t.titulo)}</span>
            ${t.cliente?`<span style="color:var(--text-muted);font-size:11px">👤 ${esc(t.cliente)}</span>`:''}
            <span style="color:${vencido?'#e63946':'var(--text)'};font-weight:700;font-size:12px">📅 ${a.dias} día${a.dias===1?'':'s'} sin programar</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // 2. Pendientes sin facturar
  if (allAlerts.length) {
    html += `<div style="background:#f7941e;border:1px solid #f7941e;border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="font-weight:700;font-size:13px;color:#ffffff;margin-bottom:10px">🚨 Realizados sin facturar</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${allAlerts.map(t=>{
          const a = alertaFacturacion(t);
          const vencido = a && a.vencido;
          return `
          <div onclick="openModal('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#ffffff;border-radius:8px;border:1px solid rgba(255,255,255,.5);cursor:pointer;font-size:13px">
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${(AREAS[t.area]||{}).color||'#a3a6ab'}25;color:${(AREAS[t.area]||{}).color||'#a3a6ab'}">${(AREAS[t.area]||{}).label||t.area}</span>
            <span style="font-weight:600;flex:1">${esc(t.titulo)}</span>
            ${t.cliente?`<span style="color:var(--text-muted);font-size:11px">👤 ${esc(t.cliente)}</span>`:''}
            <span style="color:${vencido?'#e63946':'var(--text)'};font-weight:700;font-size:12px">${a.dias} día${a.dias===1?'':'s'}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // 3. Pendientes por cotizar
  if (sinCotizarAlerts.length) {
    html += `<div style="background:#ec008c;border:1px solid #ec008c;border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="font-weight:700;font-size:13px;color:#ffffff;margin-bottom:10px">⏳ Pendientes por cotizar</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${sinCotizarAlerts.map(t=>{
          const a = alertaPorCotizar(t);
          const vencido = a.vencido;
          return `<div onclick="openModal('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#ffffff;border-radius:8px;border:1px solid rgba(255,255,255,.5);cursor:pointer;font-size:13px">
            <span style="font-weight:600;flex:1">${esc(t.titulo)}</span>
            ${t.cliente?`<span style="color:var(--text-muted);font-size:11px">👤 ${esc(t.cliente)}</span>`:''}
            <span style="color:${vencido?'#e63946':'var(--text)'};font-weight:700;font-size:12px">⏳ ${a.dias} día${a.dias===1?'':'s'} sin cotizar</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // 4. Cotizado por seguimiento
  const comSeguimiento = comT.filter(t=>{ const a=alertaSeguimiento(t); return a && (a.tipo==='sin-seguimiento'||a.tipo==='pendiente'); });
  if (comSeguimiento.length) {
    html += `<div style="background:#14a8bd;border:1px solid #14a8bd;border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="font-weight:700;font-size:13px;color:#ffffff;margin-bottom:10px">📞 Cotizado por seguimiento</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${comSeguimiento.map(t=>{
          const a = alertaSeguimiento(t);
          const vencido = a.tipo==='sin-seguimiento' && a.vencido;
          const tag = a.tipo==='pendiente'
            ? `<span style="color:#e63946;font-weight:700;font-size:12px">🔔 ${a.fecha}</span>`
            : `<span style="color:${vencido?'#e63946':'var(--text)'};font-weight:700;font-size:12px">📋 ${a.dias} día${a.dias===1?'':'s'} sin contactar</span>`;
          return `<div onclick="openModal('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#ffffff;border-radius:8px;border:1px solid rgba(255,255,255,.5);cursor:pointer;font-size:13px">
            <span style="font-weight:600;flex:1">${esc(t.titulo)}</span>
            ${t.cliente?`<span style="color:var(--text-muted);font-size:11px">👤 ${esc(t.cliente)}</span>`:''}
            ${tag}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // 5. Bitácora: horas sin justificar
  if (typeof _bitDeficitData !== 'undefined' && _bitDeficitData.length) {
    const nombres = _bitDeficitData.map(t =>
      `<span style="background:${t.color||'#94a3b8'};color:#fff;border-radius:99px;
             padding:2px 8px;font-size:11px;font-weight:700">${esc(t.iniciales)}</span>
       ${esc(t.nombre.split(' ')[0])} <span style="font-size:11px;color:#D6F3F4">(${t.dias_pendientes} día${t.dias_pendientes>1?'s':''})</span>`
    ).join(' &nbsp;·&nbsp; ');
    html += `<div style="background:#0D3B40;border:1px solid #169BBC;border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;font-size:13px;color:#D6F3F4;margin-bottom:6px">📋 Horas sin justificar en bitácora</div>
          <div style="font-size:13px;color:#fff">${nombres}</div>
        </div>
        <button class="btn-save" onclick="setArea('bitacora')"
          style="font-size:12px;padding:4px 14px;background:#169BBC;border:none;white-space:nowrap">
          Ver bitácora
        </button>
      </div>
    </div>`;
  }

  html += '<div id="contratos-alerta-fin-mes"></div>';
  html += '<div id="alertas-sin-reporte"></div>';
  html += '<div id="alertas-fuera-sitio"></div>';
  html += '</div>';

  // Estas sub-secciones se llenan con datos que vienen de un fetch aparte
  // (contratos, sin-reporte, fuera de sitio). Si el rebuild de abajo las deja
  // vacías mientras ese fetch está en curso, el contenido colapsa y vuelve a
  // aparecer momentos después → eso es lo que se ve como el dashboard
  // "saltando" cada vez que autoSync corre (cada ~20s). Para evitarlo,
  // guardamos su contenido actual y lo reponemos de inmediato (sin esperar
  // al fetch) antes de que el usuario vea el hueco vacío.
  const _idsConDatosAsincronos = [
    'contratos-vigentes-section', 'proyectos-activos-section',
    'alertas-incumplidas', 'contratos-alerta-fin-mes',
    'alertas-sin-reporte', 'alertas-fuera-sitio',
  ];
  const _htmlPrevio = {};
  _idsConDatosAsincronos.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.innerHTML) _htmlPrevio[id] = el.innerHTML;
  });

  const _scrollY = window.scrollY;
  document.getElementById('dashboard-view').innerHTML = html;
  _idsConDatosAsincronos.forEach(id => {
    if (!(id in _htmlPrevio)) return;
    const el = document.getElementById(id);
    if (el) el.innerHTML = _htmlPrevio[id];
  });
  window.scrollTo(0, _scrollY);
  renderAlertasRetraso();
  actualizarBadgeFueraSitio();
  cargarAlertasSinReporte();
  cargarContratosVigentes();
  renderProyectosActivosCard();
}

// Evita que la página salte de scroll cuando alarma.js (cada 20-60s) o
// autoSync reemplazan el contenido de una sub-sección de la zona de
// alertas fuera de la vista del usuario.
function _setHtmlConservandoScroll(el, html) {
  if (!el) return;
  const y = window.scrollY;
  el.innerHTML = html;
  if (window.scrollY !== y) window.scrollTo(0, y);
}

// Banner persistente de técnicos tardíos (actualizado también por alarma.js cada 60s)
function renderAlertasRetraso() {
  const banner = document.getElementById('alertas-retraso-banner');
  if (!banner || !currentUser || currentUser.perfil !== 'admin') return;
  if (typeof _horaBogota !== 'function' || typeof visitasActivas === 'undefined') return;

  const { fecha: hoy, hora: horaActual } = _horaBogota();
  const phoy = (typeof participantesHoy !== 'undefined') ? participantesHoy : {};

  // Recopilar técnicos tardíos: por cada tarea programada, cada técnico del equipo
  // que NO haya hecho check-in hoy (independiente de si otros compañeros ya lo hicieron)
  const tardios = []; // { tarea, tecnicoId }

  // No mostrar tardías en días no hábiles (sábado, domingo, festivos)
  const _hoyDate = new Date(hoy + 'T00:00:00');
  const _esHabil = typeof esDiaHabil === 'function' ? esDiaHabil(_hoyDate) : true;

  if (_esHabil) tasks.forEach(t => {
    if (!['it','if'].includes(t.area)) return;
    if (t.estado !== 'programado') return;
    if (!(typeof enRangoProg === 'function' ? enRangoProg(t, hoy) : t.fechaProg === hoy)) return;
    // Excluir tareas incumplidas (rango completo en el pasado → van a su propia alerta)
    const fin = (typeof fechaProgFin === 'function') ? (fechaProgFin(t) || t.fechaProg) : t.fechaProg;
    if (fin < hoy) return;
    if (!t.horaProg || horaActual < t.horaProg) return;
    // Si ya hay reporte enviado o sin_reporte para esta tarea → no es tardío
    if (typeof reportesEnviados !== 'undefined' && reportesEnviados.has(t.id)) return;
    if (typeof sinReporteHoy    !== 'undefined' && sinReporteHoy.has(t.id))    return;
    // Combinar participantesHoy con los de la visita activa actual (fallback si phoy aún no fue construido)
    const checkinActivo = new Set(
      typeof visitasActivas !== 'undefined' && visitasActivas[t.id]
        ? (visitasActivas[t.id].participantes || []).map(p => p.tecnico_id).filter(Boolean)
        : []
    );
    const checkinHoy = new Set([...(phoy[t.id] || []), ...checkinActivo]);
    (t.team || []).forEach(uid => {
      if (!checkinHoy.has(uid)) tardios.push({ tarea: t, tecnicoId: uid });
    });
  });

  renderAlertasIncumplidas();
  if (!tardios.length) { _setHtmlConservandoScroll(banner, ''); return; }

  _setHtmlConservandoScroll(banner, `
    <div style="background:#dc2626;color:#fff;padding:12px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:15px;font-weight:700">🚨 Técnico${tardios.length>1?'s':''} tardío${tardios.length>1?'s':''} (${tardios.length})</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;flex:1">
        ${tardios.map(({ tarea: t, tecnicoId }) => {
          const nombre = getMember(tecnicoId)?.name || tecnicoId;
          const label  = [t.cliente, t.titulo].filter(Boolean).join(' · ');
          return `<span onclick="openModal('${t.id}')" style="background:rgba(255,255,255,.2);padding:4px 10px;border-radius:99px;cursor:pointer;font-size:13px">
            🕗 ${t.horaProg} · ${esc(label)} (${esc(nombre)})
          </span>`;
        }).join('')}
      </div>
    </div>`);
}

// --------------------------------------------------------------
// Alerta de tareas incumplidas — rango de programación pasó sin check-in
// Aparece primera en la zona de alertas, fondo rojo.
// Se resuelve: llenando check-in+out, cambiando o borrando la programación.
// --------------------------------------------------------------
function renderAlertasIncumplidas() {
  const el = document.getElementById('alertas-incumplidas');
  if (!el || !currentUser || currentUser.perfil !== 'admin') return;
  if (typeof tasks === 'undefined' || typeof fechaProgFin !== 'function') return;

  const { fecha: hoy } = _horaBogota();

  const incumplidas = tasks.filter(t => {
    if (!['it','if'].includes(t.area)) return false;
    if (t.estado !== 'programado') return false;
    if (!t.fechaProg) return false;
    const fin = fechaProgFin(t) || t.fechaProg;
    if (fin >= hoy) return false; // rango completo en el pasado
    // Excluir si ya hubo actividad (check-in activo, reporte enviado, o sin-reporte registrado)
    if (typeof visitasActivas !== 'undefined' && visitasActivas[t.id]) return false;
    if (typeof reportesTodosEnviados !== 'undefined' && reportesTodosEnviados.has(t.id)) return false;
    if (typeof sinReporteHoy    !== 'undefined' && sinReporteHoy.has(t.id))    return false;
    return true;
  });

  if (!incumplidas.length) { _setHtmlConservandoScroll(el, ''); return; }

  const items = incumplidas.map(t => {
    const equipo = (t.team || []).map(id => getMember(id)?.name || id).join(', ') || 'Sin asignar';
    const label  = [t.cliente, t.titulo].filter(Boolean).join(' · ');
    const fin    = fechaProgFin(t) || t.fechaProg;
    return `<div onclick="openModal('${t.id}')"
      style="background:rgba(255,255,255,.15);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid rgba(255,255,255,.3)">
      <div style="font-weight:700">${esc(label)}</div>
      <div style="opacity:.9">👤 ${esc(equipo)} · 📅 ${t.fechaProg}${fin !== t.fechaProg ? ' → ' + fin : ''}</div>
    </div>`;
  }).join('');

  _setHtmlConservandoScroll(el, `
    <div style="background:#F54927;color:#fff;padding:12px 20px;border-radius:var(--radius);margin-bottom:8px">
      <div style="font-size:15px;font-weight:700;margin-bottom:8px">
        ⛔ Tarea${incumplidas.length>1?'s':''} incumplida${incumplidas.length>1?'s':''} (${incumplidas.length})
        <span style="font-size:12px;font-weight:400;opacity:.85;margin-left:8px">Sin check-in el día programado</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${items}</div>
    </div>`);
}

// --------------------------------------------------------------
// Alerta visual de checks fuera de sitio pendientes (solo admin)
// Sin sonido — aparece en la zona de alertas del dashboard
// --------------------------------------------------------------
let _fueraSitioPendientes = 0;

async function actualizarBadgeFueraSitio() {
  if (!currentUser || currentUser.perfil !== 'admin' || !API_BASE) return;
  try {
    const res = await fetch(`${API_BASE}/fuera_sitio.php?count=1`);
    const data = await res.json();
    _fueraSitioPendientes = data.pendientes || 0;
  } catch(e) { /* silencioso */ }
  renderAlertasFueraSitio();
}

function renderAlertasFueraSitio() {
  const el = document.getElementById('alertas-fuera-sitio');
  if (!el || !currentUser || currentUser.perfil !== 'admin') return;
  if (!_fueraSitioPendientes) { _setHtmlConservandoScroll(el, ''); return; }
  const n = _fueraSitioPendientes;
  _setHtmlConservandoScroll(el, `
    <div style="background:#f59e0b;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-radius:var(--radius)">
      <span style="font-size:14px;font-weight:700">📍 ${n} check${n>1?'s':''} fuera de sitio por gestionar</span>
      <button onclick="setArea('informes');seleccionarInforme('fuera_sitio')"
        style="background:rgba(255,255,255,.25);border:none;color:#fff;padding:5px 14px;border-radius:99px;cursor:pointer;font-size:13px;font-weight:600">
        Ver en Informes →
      </button>
    </div>`);
}

async function cargarAlertasSinReporte() {
  if (!currentUser || currentUser.perfil !== 'admin' || !API_BASE) return;
  const el = document.getElementById('alertas-sin-reporte');
  if (!el) return;
  try {
    const res = await fetch(`${API_BASE}/reportes.php?sin_reporte=1`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : [];
    if (!items.length) { _setHtmlConservandoScroll(el, ''); return; }
    const filas = items.map(r => {
      const ts = r.sin_reporte_at ? r.sin_reporte_at.substring(0,16).replace('T',' ') : '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#ffffff;border-radius:8px;border:1px solid rgba(255,255,255,.3);cursor:pointer;font-size:13px"
                onclick="openModal('${esc(r.tarea_id)}')">
        <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${(AREAS[r.area]||{}).color||'#a3a6ab'}25;color:${(AREAS[r.area]||{}).color||'#a3a6ab'}">${(AREAS[r.area]||{}).label||esc(r.area)}</span>
        <span style="font-weight:600;flex:1">${esc(r.titulo||'')}</span>
        ${r.cliente ? `<span style="color:var(--text-muted);font-size:11px">👤 ${esc(r.cliente)}</span>` : ''}
        ${r.tecnicos ? `<span style="color:var(--text-muted);font-size:11px">🔧 ${esc(r.tecnicos)}</span>` : ''}
        ${ts ? `<span style="color:var(--text-muted);font-size:11px">🕐 ${ts}</span>` : ''}
      </div>`;
    }).join('');
    _setHtmlConservandoScroll(el, `
      <div style="background:#dc2626;border:1px solid #dc2626;border-radius:var(--radius);padding:16px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#ffffff;margin-bottom:10px">🚫 Visitas terminadas sin reporte (${items.length})</div>
        <div style="display:flex;flex-direction:column;gap:6px">${filas}</div>
      </div>`);
  } catch(e) { /* silencioso */ }
}

// --------------------------------------------------------------
// Contratos de horas vigentes (IT/IF) — tarjeta del dashboard con el
// consumo del ciclo actual + sección en la zona de alertas cuando algún
// contrato está por cerrar su ciclo sin haberse consumido. Ambas secciones
// se alimentan del mismo fetch a contratos.php?vigentes=1 (que a su vez usa
// contratosVigentesConsumo(), la misma lógica que corre el cron de aviso).
// --------------------------------------------------------------
let _contratosVigentesData = [];

async function cargarContratosVigentes() {
  if (!currentUser || currentUser.perfil !== 'admin' || !API_BASE) return;
  try {
    const res = await fetch(`${API_BASE}/contratos.php?vigentes=1`);
    const data = await res.json();
    _contratosVigentesData = Array.isArray(data) ? data : [];
  } catch (e) { _contratosVigentesData = []; return; }
  // Necesario para poder abrir el modal de edición del cliente al hacer clic
  if ((!_clientes || !_clientes.length) && typeof cargarClientes === 'function') cargarClientes();
  renderContratosVigentesCard();
  renderContratosAlertaFinMes();
}

function renderContratosVigentesCard() {
  const el = document.getElementById('contratos-vigentes-section');
  if (!el) return;
  if (!_contratosVigentesData.length) { _setHtmlConservandoScroll(el, ''); return; }

  const fila = c => {
    const pct = c.horas_contratadas > 0 ? Math.min(100, Math.round((c.horas_consumidas / c.horas_contratadas) * 100)) : 0;
    const barColor = c.horas_disponibles < 0 ? '#dc2626' : (c.alerta_pendiente ? '#f59e0b' : '#169BBC');
    const areaColor = c.area === 'it' ? '#6366f1' : '#f97316';
    return `<div onclick="typeof abrirModalCliente==='function' && abrirModalCliente('${esc(c.cliente_id)}')"
        style="padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${areaColor}25;color:${areaColor};flex-shrink:0">${c.area.toUpperCase()}</span>
          <span style="font-weight:600;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.cliente)}</span>
        </div>
        <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">${c.horas_consumidas}h / ${c.horas_contratadas}h</span>
      </div>
      <div style="background:var(--bg);border-radius:99px;height:6px;overflow:hidden">
        <div style="background:${barColor};height:100%;width:${pct}%"></div>
      </div>
      ${c.alerta_pendiente ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px;font-weight:600">⏳ ${c.dias_restantes} día${c.dias_restantes===1?'':'s'} para el cierre del ciclo · quedan ${c.horas_disponibles}h por consumir</div>` : ''}
    </div>`;
  };

  const itRows = _contratosVigentesData.filter(c => c.area === 'it').map(fila).join('');
  const ifRows = _contratosVigentesData.filter(c => c.area === 'if').map(fila).join('');

  _setHtmlConservandoScroll(el, `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);margin-bottom:14px">
    <div style="font-weight:700;font-size:15px;color:var(--teal,#0D3B40);margin-bottom:4px">📋 Contratos vigentes</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Consumo del ciclo actual de cada contrato — úsalo para saber qué falta programar antes del cierre.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:0 24px">
      ${itRows ? `<div>${itRows}</div>` : ''}
      ${ifRows ? `<div>${ifRows}</div>` : ''}
    </div>
  </div>`);
}

// --------------------------------------------------------------
// Proyectos activos — tarjeta del dashboard con días transcurridos vs.
// estimados y último % de avance reportado, para las tarjetas tipo Proyecto
// que están "en ejecución" (estado programado). No requiere fetch aparte:
// se arma con lo que ya está en `tasks` (avanceProyectoPct viene incluido
// desde apiToTask()).
// --------------------------------------------------------------
function renderProyectosActivosCard() {
  const el = document.getElementById('proyectos-activos-section');
  if (!el) return;
  if (!currentUser || currentUser.perfil !== 'admin') { _setHtmlConservandoScroll(el, ''); return; }

  const proyectos = tasks.filter(t => t.tipoTarea === 'proyecto' && t.estado === 'programado');
  if (!proyectos.length) { _setHtmlConservandoScroll(el, ''); return; }

  const fila = t => {
    const diasProg   = t.diasProg || 1;
    const diaActual  = (typeof diaActualEnProg === 'function' ? diaActualEnProg(t) : null) || 1;
    const diasExceso = (typeof diasExcedidosProyecto === 'function') ? diasExcedidosProyecto(t) : 0;
    const excedido   = diasExceso > 0;
    const diaMostrado = excedido ? (diasProg + diasExceso) : diaActual;
    const pct = t.avanceProyectoPct != null ? t.avanceProyectoPct : null;
    const areaColor = t.area === 'it' ? '#6366f1' : '#f97316';
    const diasColor = excedido ? '#dc2626' : '#0D3B40';
    return `<div onclick="openModal('${t.id}')"
        style="padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${areaColor}25;color:${areaColor};flex-shrink:0">${t.area.toUpperCase()}</span>
          <span style="font-weight:600;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.cliente ? esc(t.cliente) + ' · ' : ''}${esc(t.titulo)}</span>
        </div>
        <span style="font-size:12px;color:${diasColor};font-weight:700;white-space:nowrap">${excedido?'⚠️ ':''}Día ${diaMostrado} de ${diasProg}</span>
      </div>
      ${pct != null ? `<div style="background:var(--bg);border-radius:99px;height:6px;overflow:hidden">
        <div style="background:#169BBC;height:100%;width:${pct}%"></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">📊 Avance: ${pct}%</div>` : `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">📊 Aún sin % de avance reportado</div>`}
      ${(t.diasTrabajadosProyecto || 0) > 0 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">⏱ ${t.horasTrabajadasProyecto}h trabajadas · 📆 ${t.diasTrabajadosProyecto} día${t.diasTrabajadosProyecto===1?'':'s'}</div>` : ''}
    </div>`;
  };

  const itRows = proyectos.filter(t => t.area === 'it').map(fila).join('');
  const ifRows = proyectos.filter(t => t.area === 'if').map(fila).join('');

  _setHtmlConservandoScroll(el, `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);margin-bottom:14px">
    <div style="font-weight:700;font-size:15px;color:var(--teal,#0D3B40);margin-bottom:4px">🏗️ Proyectos activos</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Días transcurridos vs. estimados y último % de avance reportado.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:0 24px">
      ${itRows ? `<div>${itRows}</div>` : ''}
      ${ifRows ? `<div>${ifRows}</div>` : ''}
    </div>
  </div>`);
}

function renderContratosAlertaFinMes() {
  const el = document.getElementById('contratos-alerta-fin-mes');
  if (!el) return;
  const pendientes = _contratosVigentesData.filter(c => c.alerta_pendiente);
  if (!pendientes.length) { _setHtmlConservandoScroll(el, ''); return; }

  const items = pendientes.map(c => `
    <div onclick="typeof abrirModalCliente==='function' && abrirModalCliente('${esc(c.cliente_id)}')"
      style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#ffffff;border-radius:8px;border:1px solid rgba(255,255,255,.5);cursor:pointer;font-size:13px">
      <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${c.area==='it'?'#6366f1':'#f97316'}25;color:${c.area==='it'?'#6366f1':'#f97316'}">${c.area.toUpperCase()}</span>
      <span style="font-weight:600;flex:1">${esc(c.cliente)}</span>
      <span style="color:var(--text-muted);font-size:11px">${c.horas_consumidas}h / ${c.horas_contratadas}h</span>
      <span style="color:#7c2d12;font-weight:700;font-size:12px">⏳ ${c.dias_restantes} día${c.dias_restantes===1?'':'s'} para cerrar ciclo</span>
    </div>`).join('');

  _setHtmlConservandoScroll(el, `<div style="background:#f59e0b;border:1px solid #f59e0b;border-radius:var(--radius);padding:16px;margin-bottom:14px">
    <div style="font-weight:700;font-size:13px;color:#ffffff;margin-bottom:10px">📋 Contratos por consumir antes del cierre (${pendientes.length})</div>
    <div style="display:flex;flex-direction:column;gap:6px">${items}</div>
  </div>`);
}

function setArea(a) {
  if (currentUser && currentUser.perfil === 'tecnico' && !['it','if','agenda'].includes(a)) return; // técnicos solo ven IT/IF/Agenda
  currentArea=a;
  // Limpiar filtros al cambiar de área
  ['search','f-estado','f-responsable'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('.area-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(`.area-tab[data-area="${a}"]`).classList.add('active');
  const isCartera    = a === 'cartera';
  const isFacturacion = a === 'facturacion';
  const isInformes   = a === 'informes';
  const isClientes   = a === 'clientes';
  const isAgenda      = a === 'agenda';
  const isTransportes = a === 'transportes';
  const isBitacora       = a === 'bitacora';
  const isOther = isCartera || isFacturacion || isInformes || isClientes || isAgenda || isTransportes || isBitacora;
  document.getElementById('kanban-view').style.display   = isOther ? 'none' : (currentView==='kanban'?'flex':'none');
  document.getElementById('lista-view').style.display    = isOther ? 'none' : (currentView==='lista'?'block':'none');
  const archSection = document.getElementById('arch-section');
  if (archSection) archSection.style.display = (!isOther && currentView==='kanban') ? 'block' : 'none';
  document.getElementById('cartera-view').style.display     = isCartera    ? 'block' : 'none';
  document.getElementById('facturacion-view').style.display = isFacturacion ? 'block' : 'none';
  document.getElementById('informes-view').style.display    = isInformes   ? 'block' : 'none';
  document.getElementById('clientes-view').style.display    = isClientes   ? 'block' : 'none';
  document.getElementById('agenda-view').style.display      = isAgenda      ? 'block' : 'none';
  document.getElementById('transportes-view').style.display = isTransportes  ? 'block' : 'none';
  document.getElementById('bitacora-view').style.display       = isBitacora       ? 'block' : 'none';
  document.querySelector('.filters').style.display       = isOther ? 'none' : 'flex';
  document.getElementById('stats').style.display         = isOther ? 'none' : 'grid';
  document.querySelector('.view-toggle').style.display   = 'flex';
  document.getElementById('btn-kanban').style.display    = isOther ? 'none' : '';
  document.getElementById('btn-lista').style.display     = isOther ? 'none' : '';
  document.querySelector('.btn-add').style.display       = isOther ? 'none' : 'inline-flex';
  if (isOther) document.getElementById('dashboard-view').style.display = 'none';
  if (isCartera) { renderCartera(); if (!cartera.length) fetchCarteraAlegra(); }
  else if (isFacturacion) { if (typeof cargarFacturasPendientes === 'function') cargarFacturasPendientes(); }
  else if (isInformes)  { renderInformesView(); }
  else if (isClientes)  { cargarClientes(); }
  else if (isAgenda)       { iniciarAgenda(); }
  else if (isTransportes) { iniciarTransportes(); }
  else if (isBitacora)       { if (typeof renderBitacoraView    === 'function') renderBitacoraView(); }
  else {
    // Si estábamos en el Dashboard (vista sin filtro por área), al elegir
    // un área específica mostramos el tablero kanban de esa área.
    if (currentView === 'dashboard') { setView('kanban'); return; }
    render();
  }
}

function estadoLabel(area, estado) {
  const flow = AREA_FLOWS[area];
  if (flow) { const c = flow.find(x=>x.id===estado); if (c) return c.label.replace(/\p{Emoji}/gu,'').trim(); }
  return (estado||'').replace(/-/g,' ');
}

// Estado de seguimiento comercial (cotizaciones en estado "Enviada")
// Devuelve null si no aplica, o un objeto { tipo, dias?, fecha? }:
//   tipo 'sin-seguimiento' -> nunca se ha registrado un seguimiento para esta cotización
//   tipo 'pendiente'       -> ya se hizo al menos un seguimiento, pero la próxima fecha programada ya llegó/pasó
//   tipo 'al-dia'          -> ya se hizo seguimiento y la próxima fecha aún no llega
function alertaSeguimiento(t) {
  if (t.area !== 'comercial' || t.estado !== 'enviada') return null;
  const hist = t.seguimientoHistorial || [];
  const today = new Date().toISOString().split('T')[0];
  if (!hist.length) {
    const dias = t.enviadaAt ? diasHabilesDesde(t.enviadaAt) : 0;
    return { tipo: 'sin-seguimiento', dias, vencido: dias >= 2 };
  }
  if (t.seguimientoFecha && t.seguimientoFecha <= today) {
    return { tipo: 'pendiente', fecha: t.seguimientoFecha };
  }
  return { tipo: 'al-dia', fecha: t.seguimientoFecha };
}
// Mantener compatibilidad con código previo (devuelve días si hay alerta urgente)
function alertaConfirmacion(t) {
  const a = alertaSeguimiento(t);
  if (!a) return null;
  if (a.tipo==='sin-seguimiento' && a.dias>=3) return a.dias;
  if (a.tipo==='pendiente') return 0;
  return null;
}

let _archivarPendienteId = null;

function archivarTask(id, e) {
  if (e) { e.stopPropagation(); }
  const t = tasks.find(x => x.id === id);
  if (!t || t.estado === 'archivado') return; // ya archivada — evita reabrir el flujo (y el aviso de transporte) dos veces
  // IT/IF en estado 'realizado' (= columna "Por facturar") sin factura → pedir motivo
  if (['it','if'].includes(t.area) && t.estado === 'realizado' && !t.factura) {
    _archivarPendienteId = id;
    document.getElementById('modal-motivo-no-factura').classList.add('open');
    return;
  }
  if (!confirm('¿Archivar esta tarea? Ya no aparecerá en el tablero activo.')) return;
  _ejecutarArchivar(id, null);
}

// forzarTipoContrato: cuando el motivo de archivo es "Contrato" pero la
// tarjeta no estaba guardada como tipoTarea='contrato' y el usuario, avisado,
// decidió igual cambiarla — ver _mostrarConfirmArchivarComoContrato().
function _ejecutarArchivar(id, motivo, forzarTipoContrato = false) {
  const actual = tasks.find(x => x.id === id);
  // Idempotente: si ya está archivada no se repite el guardado ni, sobre
  // todo, no se vuelve a disparar el aviso de transporte (esa repetición
  // era justo lo que causaba el loop al reabrir un modal ya cerrado/viejo).
  if (!actual || actual.estado === 'archivado') return;
  tasks = tasks.map(t => t.id===id
    ? {...t, estado:'archivado', motivoNoFactura: motivo || t.motivoNoFactura || null,
       tipoTarea: forzarTipoContrato ? 'contrato' : t.tipoTarea,
       updatedAt:new Date().toISOString()}
    : t);
  save(); closeModal(); render();
  syncEstado(id);
  // Verificar transporte (IT/IF en sitio al archivar)
  const tarch = tasks.find(x => x.id === id);
  if (tarch && ['it','if'].includes(tarch.area) && tarch.modalidad === 'en_sitio') {
    _transportesCheckTarea(id);
  }
}

function confirmarMotivoNoFactura(motivo) {
  const id = _archivarPendienteId; // capturar ANTES de cerrar (cerrar pone null)
  cerrarMotivoNoFactura();
  if (!id) return;
  const t = tasks.find(x => x.id === id);
  // "Contrato" aquí es solo el MOTIVO de archivar sin facturar — un campo
  // distinto de tipoTarea. Si la tarjeta no está realmente guardada como
  // tipo Contrato, avisar antes de archivarla así (si no, quedaría una
  // tarjeta operativa clasificada como si fuera de contrato sin que nadie
  // lo note).
  if (t && motivo === 'Contrato' && t.tipoTarea !== 'contrato') {
    _mostrarConfirmArchivarComoContrato(id, motivo, t.tipoTarea);
    return;
  }
  _ejecutarArchivar(id, motivo);
}

function cerrarMotivoNoFactura() {
  document.getElementById('modal-motivo-no-factura').classList.remove('open');
  _archivarPendienteId = null;
}

// Popup: motivo de archivo = "Contrato" pero tipoTarea de la tarjeta no lo es.
function _mostrarConfirmArchivarComoContrato(id, motivo, tipoActual) {
  const labels = { evento: 'Evento', proyecto: 'Proyecto', contrato: 'Contrato' };
  let popup = document.getElementById('archivar-contrato-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'archivar-contrato-popup';
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45)';
    document.body.appendChild(popup);
  }
  popup.innerHTML = `
    <div style="background:var(--card-bg,#fff);border-radius:16px;padding:28px 24px;max-width:360px;width:92%;
                box-shadow:0 12px 40px rgba(0,0,0,0.22);text-align:center">
      <div style="font-size:32px;margin-bottom:10px">⚠️</div>
      <div style="font-weight:700;font-size:16px;color:var(--text);margin-bottom:6px">
        Esta tarjeta no es tipo Contrato
      </div>
      <div style="font-size:13px;color:var(--text-muted,#6b7280);margin-bottom:18px">
        Está guardada como tipo <strong>${esc(labels[tipoActual] || tipoActual || 'Evento')}</strong>, pero elegiste "Contrato" como motivo para archivarla sin facturar.
      </div>
      <div style="font-size:14px;color:var(--text);margin-bottom:22px">
        ¿Cambiarla a tipo <strong>Contrato</strong> y archivarla así, o cancelar el archivado?
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="_confirmarArchivarComoContrato('${id}', '${motivo}', true)"
          style="padding:10px;border-radius:8px;border:none;cursor:pointer;
                 background:#169BBC;color:#fff;font-weight:600;font-size:14px">
          Cambiar a Contrato y archivar
        </button>
        <button onclick="_confirmarArchivarComoContrato('${id}', '${motivo}', false)"
          style="padding:10px;border-radius:8px;border:1px solid var(--border,#e5e7eb);
                 cursor:pointer;background:transparent;color:var(--text);font-weight:600;font-size:14px">
          Cancelar archivado
        </button>
      </div>
    </div>`;
  popup.style.display = 'flex';
}

function _confirmarArchivarComoContrato(id, motivo, cambiarYArchivar) {
  const popup = document.getElementById('archivar-contrato-popup');
  if (popup) popup.style.display = 'none';
  if (!cambiarYArchivar) return; // cancelar: la tarjeta queda como estaba, sin archivar
  _ejecutarArchivar(id, motivo, true);
}

// ---- Drag & Drop ----
let dragId = null;
function onDragStart(e, id) { dragId=id; e.dataTransfer.effectAllowed='move'; setTimeout(()=>{const el=document.querySelector(`[data-id="${id}"]`); if(el) el.classList.add('dragging');},0); }
function onDragEnd(e) { document.querySelectorAll('.task-card.dragging').forEach(el=>el.classList.remove('dragging')); }
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDrop(e, estado) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragId) return;
  const t = tasks.find(x=>x.id===dragId);
  if (!t || t.estado===estado) { dragId=null; return; }
  const area = t.area;
  const movedId = dragId;
  dragId=null;
  // Validate requirements
  if (['it','if'].includes(area)) {
    if (estado==='programado' && !t.fechaProg) { openModal(movedId, null, estado); return; }
    if (estado==='realizado'  && !t.reporte)   { openModal(movedId, null, estado); return; }
    if (estado==='facturado'  && !t.factura)   { openModal(movedId, null, estado); return; }
  }
  // Cotización aprobada: preguntar a qué área operativa enviarla
  if (area==='comercial' && estado==='aprobada') {
    mostrarPopupAprobarArea().then(destino => {
      if (!destino) { render(); return; } // cancelado: la tarjeta vuelve a su columna
      moverCotizacionAprobada(movedId, destino);
    });
    return;
  }
  const now = new Date().toISOString();
  tasks = tasks.map(x => x.id===movedId ? {
    ...x, estado,
    realizadoAt: estado==='realizado' ? (x.realizadoAt||now) : x.realizadoAt,
    enviadaAt:   estado==='enviada'   ? (x.enviadaAt||now)   : x.enviadaAt,
    programadoAt: estado==='programado' ? (x.programadoAt||now) : x.programadoAt,
    seguimientoFecha: x.area==='comercial'
      ? (estado==='enviada' ? (x.seguimientoFecha || sugerirFechaSeguimiento()) : null)
      : x.seguimientoFecha,
    updatedAt: now,
  } : x);
  save(); render();
  syncEstado(movedId);
}

// Mueve una cotización aprobada (Comercial) a Pendientes IT/IF
function moverCotizacionAprobada(id, destino) {
  const now = new Date().toISOString();
  tasks = tasks.map(x => x.id===id ? {
    ...x, area: destino, estado: 'solicitud', updatedAt: now,
  } : x);
  save(); render();
  syncEstado(id);
}

function updateFormForArea() {
  const area = document.getElementById('f-area').value;
  const hide = ['grp-fechaprog','grp-fecha','grp-tiempo','grp-treal','grp-recursos'];
  hide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = area==='comercial' ? 'none' : '';
  });
  const itIf = ['it','if'].includes(area);
  // En IT/IF se simplifica la tarjeta: solo fecha de programación, sin fecha límite,
  // tiempo estimado/real, recursos ni notas.
  ['grp-fecha','grp-tiempo','grp-treal','grp-recursos','grp-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el && itIf) el.style.display = 'none';
  });
  ['grp-labor-admin','grp-solicitud-comercial'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = itIf ? '' : 'none';
  });
  const elIncProg = document.getElementById('grp-incluye-prog');
  if (elIncProg) elIncProg.style.display = area === 'admin' ? '' : 'none';
  const elCot = document.getElementById('grp-cotizacion-docx');
  if (elCot) elCot.style.display = area==='comercial' ? '' : 'none';
  const elTeam = document.getElementById('grp-team');
  if (elTeam) elTeam.style.display = area==='comercial' ? 'none' : '';
  // Modalidad visita: solo para IT/IF
  const elModalidad = document.getElementById('grp-modalidad');
  if (elModalidad) elModalidad.style.display = itIf ? '' : 'none';
  // Avisar cliente: solo para IT/IF
  const elAvisar = document.getElementById('grp-avisar-cliente');
  if (elAvisar) elAvisar.style.display = itIf ? '' : 'none';
  // Reporte interno: solo para admins en IT/IF
  const elRepInterno = document.getElementById('grp-reporte-interno');
  const esAdmin = currentUser && currentUser.perfil === 'admin';
  if (elRepInterno) elRepInterno.style.display = (itIf && esAdmin) ? '' : 'none';
  // Tipo de tarea: visible en IT/IF (evento/proyecto siempre disponibles;
  // "contrato" solo se habilita si el cliente tiene contrato — ver _aplicarResultadoContrato)
  const elTipoTarea = document.getElementById('grp-tipo-tarea');
  if (elTipoTarea) elTipoTarea.style.display = itIf ? 'block' : 'none';
  if (!itIf) {
    const selTipo = document.getElementById('f-tipo-tarea');
    if (selTipo) selTipo.value = 'evento';
  }
  updateEstadoOptions();
  // Verificar contrato del cliente actual (si hay alguno ingresado)
  if (itIf) {
    const clienteActual = document.getElementById('f-cliente')?.value.trim();
    if (clienteActual) _verificarContratoClientePorNombre(clienteActual, area);
  }
  // _actualizarLabelsProyecto() es la autoridad final sobre avisar-cliente/
  // reporte-interno/equipo (los oculta si tipoTarea sigue siendo 'proyecto'
  // tras cambiar de área, ej. IT → IF) y sobre las etiquetas de hora/días.
  if (typeof _actualizarLabelsProyecto === 'function') _actualizarLabelsProyecto();
}

// Lógica compartida para mostrar/ocultar el selector tipo_tarea dado el objeto cliente.
function _aplicarResultadoContrato(c, area, mostrarConfirm = false) {
  const elGrp  = document.getElementById('grp-tipo-tarea');
  const selTipo = document.getElementById('f-tipo-tarea');
  const optContrato = document.getElementById('opt-tipo-contrato');
  if (!elGrp || !selTipo) return;
  const tieneContrato = c && !c.error && c.contrato_area === area && c.contrato_horas_mes > 0;
  elGrp.style.display = 'block'; // evento/proyecto siempre seleccionables en IT/IF, con o sin contrato
  // La opción "Contrato" del selector solo se muestra si el cliente tiene
  // contrato activo en su ficha — para el resto de clientes ni siquiera
  // aparece en la lista (no solo queda deshabilitada).
  if (optContrato) { optContrato.hidden = !tieneContrato; optContrato.disabled = !tieneContrato; }
  if (tieneContrato) {
    if (!['evento','proyecto','contrato'].includes(selTipo.value)) selTipo.value = 'evento';
    if (mostrarConfirm) {
      _mostrarConfirmContrato(c, area);
    } else {
      actualizarInfoContrato(c);
    }
  } else {
    // Sin contrato: "contrato" no es válido, pero "proyecto" y "evento" sí.
    if (selTipo.value === 'contrato') selTipo.value = 'evento';
    const infoEl = document.getElementById('contrato-horas-info');
    if (infoEl) infoEl.style.display = 'none';
  }
}

// Popup de confirmación: ¿crear como visita de contrato?
function _mostrarConfirmContrato(c, area) {
  let popup = document.getElementById('contrato-confirm-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'contrato-confirm-popup';
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45)';
    document.body.appendChild(popup);
  }
  const areaLabel = area.toUpperCase();
  const horas = c.contrato_horas_mes;
  popup.innerHTML = `
    <div style="background:var(--card-bg,#fff);border-radius:16px;padding:28px 24px;max-width:340px;width:92%;
                box-shadow:0 12px 40px rgba(0,0,0,0.22);text-align:center">
      <div style="font-size:32px;margin-bottom:10px">📋</div>
      <div style="font-weight:700;font-size:16px;color:var(--text);margin-bottom:6px">
        Cliente con contrato ${areaLabel}
      </div>
      <div style="font-size:13px;color:var(--text-muted,#6b7280);margin-bottom:18px">
        ${horas}h contratadas este mes
      </div>
      <div style="font-size:14px;color:var(--text);margin-bottom:22px">
        ¿Crear esta tarea como <strong>visita de contrato</strong>?
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button onclick="_confirmarTipoContrato(true)"
          style="flex:1;padding:10px;border-radius:8px;border:none;cursor:pointer;
                 background:#169BBC;color:#fff;font-weight:600;font-size:14px">
          ✓ Sí, contrato
        </button>
        <button onclick="_confirmarTipoContrato(false)"
          style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border,#e5e7eb);
                 cursor:pointer;background:transparent;color:var(--text);font-weight:600;font-size:14px">
          ✗ No, evento
        </button>
      </div>
    </div>`;
  popup.style.display = 'flex';
}

function _confirmarTipoContrato(esContrato) {
  const popup = document.getElementById('contrato-confirm-popup');
  if (popup) popup.style.display = 'none';
  const selTipo = document.getElementById('f-tipo-tarea');
  if (selTipo) {
    selTipo.value = esContrato ? 'contrato' : 'evento';
    _actualizarLabelsProyecto();
    // Actualizar info de horas si es contrato
    if (esContrato) onTipoTareaChange();
  }
}

// Verificar contrato por alegra_id (al seleccionar del dropdown de Alegra).
// Si el cliente aún no tiene alegra_id en la BD, hace fallback por nombre.
async function _verificarContratoCliente(alegraId, area, nombre = null) {
  const elGrp = document.getElementById('grp-tipo-tarea');
  if (!elGrp || !['it','if'].includes(area)) {
    if (elGrp) elGrp.style.display = 'none';
    const s = document.getElementById('f-tipo-tarea'); if (s) s.value = 'evento';
    return;
  }
  if (!alegraId || !API_BASE) { _aplicarResultadoContrato(null, area); return; }
  try {
    const res = await fetch(`${API_BASE}/clientes.php?alegra_id=${encodeURIComponent(alegraId)}`);
    const c = await res.json();
    if (c.error && nombre) return _verificarContratoClientePorNombre(nombre, area, true);
    _aplicarResultadoContrato(c, area, true);
  } catch {
    _aplicarResultadoContrato(null, area);
  }
}

// Verificar contrato por nombre (al editar tarea existente o cambiar área).
async function _verificarContratoClientePorNombre(nombre, area) {
  const elGrp = document.getElementById('grp-tipo-tarea');
  if (!elGrp || !['it','if'].includes(area)) {
    if (elGrp) elGrp.style.display = 'none';
    const s = document.getElementById('f-tipo-tarea'); if (s) s.value = 'evento';
    return;
  }
  if (!nombre || !API_BASE) { _aplicarResultadoContrato(null, area); return; }
  try {
    const res = await fetch(`${API_BASE}/clientes.php?nombre=${encodeURIComponent(nombre)}`);
    const c = await res.json();
    _aplicarResultadoContrato(c, area);
  } catch {
    _aplicarResultadoContrato(null, area);
  }
}

// Muestra las horas disponibles del contrato en el formulario
async function actualizarInfoContrato(clienteRow) {
  const infoEl  = document.getElementById('contrato-horas-info');
  const selTipo = document.getElementById('f-tipo-tarea');
  if (!infoEl || !selTipo) return;
  if (selTipo.value !== 'contrato') { infoEl.style.display = 'none'; return; }
  if (clienteRow && clienteRow.contrato_horas_mes) {
    const contratadas = parseFloat(clienteRow.contrato_horas_mes);
    if (editingId && API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/reportes.php?horasContrato=1&tareaId=${editingId}`);
        const d = await res.json();
        if (d && d.horasContratadas > 0) {
          const color = d.horasDisponibles > 0 ? '' : 'color:#ef4444';
          infoEl.innerHTML = `<span style="${color}">📋 ${contratadas}h/mes · Consumidas: ${d.horasConsumidas}h · Disponibles: ${d.horasDisponibles}h</span>`;
          infoEl.style.display = 'block'; return;
        }
      } catch {}
    }
    infoEl.textContent = `📋 Contrato: ${contratadas}h/mes`;
    infoEl.style.display = 'block';
    return;
  }
  infoEl.style.display = 'none';
}


// Ajusta el formulario según el tipo de tarea. Las tarjetas tipo Proyecto:
//  - no piden "hora de inicio" sino "hora de alarma" (aviso a admins si no
//    se ha registrado visita ese día);
//  - son SIEMPRE de reporte interno (nunca le llega nada al cliente), así
//    que no tiene sentido mostrar los checkboxes "avisar cliente" ni
//    "reporte interno" — se ocultan y su valor se fuerza al guardar
//    (ver saveTask()) y también en el servidor (tareas.php);
//  - son visibles automáticamente a todos los técnicos del área (no hay que
//    asignar equipo uno a uno), así que se oculta "Equipo asignado" para que
//    la tarjeta quede más compacta.
function _actualizarLabelsProyecto() {
  const esProyecto = document.getElementById('f-tipo-tarea')?.value === 'proyecto';
  const horaLabel = document.getElementById('f-hora-prog-label');
  if (horaLabel) horaLabel.textContent = esProyecto ? '🔔 Hora de alarma:' : '🕗 Hora de inicio:';
  const diasLabel = document.getElementById('f-dias-prog-label');
  if (diasLabel) diasLabel.textContent = esProyecto ? 'día(s) estimados' : 'día(s)';
  const ayuda = document.getElementById('f-hora-prog-ayuda');
  if (ayuda) ayuda.style.display = esProyecto ? 'block' : 'none';

  const area = document.getElementById('f-area')?.value;
  const itIf = ['it','if'].includes(area);
  const elAvisar = document.getElementById('grp-avisar-cliente');
  if (elAvisar) elAvisar.style.display = (itIf && !esProyecto) ? '' : 'none';
  const elRepInterno = document.getElementById('grp-reporte-interno');
  const esAdminLabel = currentUser && currentUser.perfil === 'admin';
  if (elRepInterno) elRepInterno.style.display = (itIf && esAdminLabel && !esProyecto) ? '' : 'none';
  const elTeam = document.getElementById('grp-team');
  if (elTeam) elTeam.style.display = (area === 'comercial' || esProyecto) ? 'none' : '';
}

function onTipoTareaChange() {
  _actualizarLabelsProyecto();
  const area = document.getElementById('f-area')?.value;
  const cliente = document.getElementById('f-cliente')?.value.trim();
  if (['it','if'].includes(area) && cliente) _verificarContratoClientePorNombre(cliente, area);
}

function openModal(id, preArea, preEstado) {
  editingId=id||null;
  const t=id?tasks.find(x=>x.id===id):null;
  document.getElementById('modal-title-text').textContent=t?'Editar Tarea':'Nueva Tarea';
  const shortIdEl = document.getElementById('modal-short-id');
  if (shortIdEl) { shortIdEl.textContent = t ? `#${t.id.slice(0,6).toUpperCase()}` : ''; shortIdEl.style.display = t ? 'inline' : 'none'; }
  document.getElementById('btn-delete').style.display=(t && currentUser?.perfil==='admin')?'inline-block':'none';
  document.getElementById('f-titulo').value=t?.titulo||'';
  document.getElementById('f-desc').value=t?.desc||'';
  const defaultArea = preArea || t?.area || (currentArea!=='all'&&currentArea!=='cartera'?currentArea:'it');
  document.getElementById('f-area').value = defaultArea;
  updateFormForArea();
  const defaultEstado = preEstado || t?.estado || AREA_FLOWS[defaultArea]?.[0]?.id || 'pendiente';
  updateEstadoOptions(defaultEstado);
  document.getElementById('f-cliente').value=t?.cliente||'';
  document.getElementById('cliente-suggestions').style.display='none';
  clienteUltimaBusqueda = [];
  clienteValidadoAlegra = t?.cliente ? true : null;
  document.getElementById('f-fechaprog').value=t?.fechaProg||'';
  const elDiasProg = document.getElementById('f-dias-prog');
  if (elDiasProg) elDiasProg.value = t?.diasProg || 1;
  const elHoraProg = document.getElementById('f-hora-prog');
  if (elHoraProg) elHoraProg.value = t?.horaProg || '08:00';
  actualizarFechaFinProg();
  document.getElementById('f-fecha').value=t?.fecha||'';
  document.getElementById('f-tiempo').value=t?.tiempo||'';
  document.getElementById('f-treal').value=t?.tiempoReal||'';
  document.getElementById('f-recursos').value=t?.recursos||'';
  document.getElementById('f-notas').value=t?.notas||'';
  const _modVal = t?.modalidad||''; ['f-modalidad-sitio','f-modalidad-remoto'].forEach(id=>{const el=document.getElementById(id);if(el)el.checked=(el.value===_modVal);});
  document.getElementById('f-factura').value=t?.factura||'';
  document.getElementById('f-labor-admin').value=t?.laborAdmin||'';
  // Tipo de tarea — pre-cargar valor guardado, luego verificar contrato del cliente
  const selTipo = document.getElementById('f-tipo-tarea');
  if (selTipo) selTipo.value = t?.tipoTarea || 'evento';
  _actualizarLabelsProyecto();
  // _verificarContratoCliente mostrará/ocultará el selector y ajustará el valor si es necesario
  const clienteParaContrato = t?.cliente || '';
  if (['it','if'].includes(defaultArea) && clienteParaContrato) {
    setTimeout(() => _verificarContratoClientePorNombre(clienteParaContrato, defaultArea), 0);
  } else if (['it','if'].includes(defaultArea)) {
    _aplicarResultadoContrato(null, defaultArea);
  } else {
    const elGrp = document.getElementById('grp-tipo-tarea');
    if (elGrp) elGrp.style.display = 'none';
  }
  const elChk = document.getElementById('f-incluye-prog');
  if (elChk) elChk.checked = !!(t?.incluyeProg);
  const chkAvisar = document.getElementById('f-avisar-cliente');
  if (chkAvisar) chkAvisar.checked = t?.avisarCliente !== false;
  const chkInterno = document.getElementById('f-reporte-interno');
  if (chkInterno) chkInterno.checked = !!(t?.reporteInterno);
  document.getElementById('f-solicitud-comercial').value=t?.solicitudComercial||'';
  toggleFacturaField(defaultEstado);
  const faInfo = document.getElementById('facturas-alegra-info');
  const faLista = document.getElementById('facturas-alegra-lista');
  if (faInfo) faInfo.textContent = '';
  if (faLista) faLista.style.display = 'none';
  renderSeguimientoSection(t, defaultEstado);
  toggleAprobarAreaGroup(defaultArea, defaultEstado);
  const fCotFile = document.getElementById('f-cotizacion-file');
  if (fCotFile) fCotFile.value = '';
  const cdInfo = document.getElementById('cotizacion-docx-info');
  if (cdInfo) {
    cdInfo.innerHTML = t?.cotizacionDocx
      ? `📄 Adjunto: ${esc(t.cotizacionDocx)}${API_BASE?` · <a href="${API_BASE}/cotizacion_docx.php?id=${t.id}" target="_blank">Descargar</a>`:''}`
      : 'Sin cotización adjunta';
  }
  const fRepFile = document.getElementById('f-reporte-file');
  if (fRepFile) fRepFile.value = '';
  const raInfo = document.getElementById('reporte-archivo-info');
  if (raInfo) {
    raInfo.innerHTML = t?.reporteArchivo
      ? `📄 Adjunto: ${esc(t.reporteArchivo)}${API_BASE?` · <a href="${API_BASE}/reporte_archivo.php?id=${t.id}" target="_blank">Descargar</a>`:''}`
      : 'Sin archivo adjunto';
  }
  buildTeamPicker(t?.team||[]);

  // ── Acciones rápidas en modal (mismas que en la tarjeta) ──────────
  const accionesDiv = document.getElementById('modal-acciones-rapidas');
  if (accionesDiv) {
    if (t) {
      const showArchivarM = (['it','if'].includes(t.area) && ['realizado','facturado'].includes(t.estado))
                         || (t.area==='comercial' && ['aprobada','rechazada'].includes(t.estado));
      let aHtml = '';
      if (['it','if'].includes(t.area) && t.estado==='realizado' && t.cotizacionDocx) {
        aHtml += `<button class="btn-archivar" style="background:#3b82f6;color:#fff" onclick="generarFacturaDesdeTarea('${t.id}',event)">🧾 Generar factura desde cotización</button>`;
      }
      if (['it','if'].includes(t.area) && !['realizado','facturado','archivado'].includes(t.estado)) {
        if (typeof renderVisitaBoton === 'function') aHtml += renderVisitaBoton(t);
      }
      // Los botones "Ver reporte" los inyecta renderHistorialVisitasModal() de forma asíncrona
      // con datos reales del servidor (cubre estados borrador, completado y enviado).
      if (showArchivarM) {
        aHtml += `<button class="btn-archivar" onclick="archivarTask('${t.id}',event)">📦 Archivar</button>`;
      }
      if (aHtml) {
        accionesDiv.innerHTML = `<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">${aHtml}</div>`;
        accionesDiv.style.display = 'block';
      } else {
        accionesDiv.style.display = 'none';
      }
    } else {
      accionesDiv.style.display = 'none';
    }
  }

  // ── Historial de visitas en modal ─────────────────────────────────
  const histDiv = document.getElementById('modal-historial-visitas');
  if (histDiv) {
    if (t && ['it','if'].includes(t.area) && typeof renderHistorialVisitasModal === 'function') {
      renderHistorialVisitasModal(t.id);
      histDiv.style.display = 'block';
    } else {
      histDiv.style.display = 'none';
    }
  }

  // ── Comentarios (cualquier área, solo tarjetas ya guardadas) ──────
  const comentDiv = document.getElementById('modal-comentarios');
  if (comentDiv) {
    if (t && typeof renderComentariosTarea === 'function') {
      renderComentariosTarea(t.id);
      comentDiv.style.display = 'block';
    } else {
      comentDiv.style.display = 'none';
    }
  }

  // ── Botón de transporte (respaldo manual, cualquier tarea IT/IF existente) ──
  // El registro normal es automático (checkout + reporte enviado); este botón
  // solo aparece si quedó algo pendiente sin registrar (backend lo filtra por
  // modalidad en_sitio y checkout ya hecho vía ?pendientes_tarea=).
  const transpBtn = document.getElementById('modal-transporte-btn');
  if (transpBtn) {
    transpBtn.style.display = 'none';
    transpBtn.innerHTML = '';
    if (t && ['it','if'].includes(t.area) &&
        typeof _transpActualizarBotonModal === 'function') {
      _transpActualizarBotonModal(t.id);
    }
  }

  // ── Imágenes adjuntas ──────────────────────────────────────────────────────
  if (typeof _imagenesCargar === 'function') _imagenesCargar(t?.id || null);

  document.getElementById('modal').classList.add('open');
  setTimeout(()=>document.getElementById('f-titulo').focus(),50);
}

// ===================== AUTOCOMPLETAR CLIENTE (ALEGRA) =====================
let clienteSuggestTimer = null;
let clienteUltimaBusqueda = [];
let clienteValidadoAlegra = null; // true = coincide con un contacto de Alegra, null = sin verificar

function onClienteInput() {
  clienteValidadoAlegra = null;
  const q = document.getElementById('f-cliente').value.trim();
  const box = document.getElementById('cliente-suggestions');
  clearTimeout(clienteSuggestTimer);
  if (q.length < 2) {
    box.style.display = 'none';
    // Sin cliente → tipo_tarea sigue visible (evento/proyecto), pero sin info de contrato
    const area = document.getElementById('f-area')?.value;
    if (['it','if'].includes(area)) {
      _aplicarResultadoContrato(null, area);
    } else {
      const elGrp = document.getElementById('grp-tipo-tarea');
      if (elGrp) elGrp.style.display = 'none';
      const selTipo = document.getElementById('f-tipo-tarea');
      if (selTipo) selTipo.value = 'evento';
    }
    return;
  }
  clienteSuggestTimer = setTimeout(() => buscarClientesAlegra(q), 300);
}

async function buscarClientesAlegra(q) {
  const box = document.getElementById('cliente-suggestions');
  if (!API_BASE) { box.style.display = 'none'; return; }
  try {
    const res = await fetch(`${API_BASE}/alegra_contactos.php?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    clienteUltimaBusqueda = Array.isArray(data) ? data : [];
    if (!clienteUltimaBusqueda.length) {
      box.innerHTML = '<div style="color:var(--text-muted)">Sin coincidencias en Alegra</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = clienteUltimaBusqueda.map((c,i) => `<div onmousedown="seleccionarClienteAlegraIdx(${i})">${esc(c.name)}</div>`).join('');
    box.style.display = 'block';
  } catch (e) { box.style.display = 'none'; }
}

function seleccionarClienteAlegraIdx(i) {
  const c = clienteUltimaBusqueda[i];
  if (!c) return;
  document.getElementById('f-cliente').value = c.name;
  clienteValidadoAlegra = true;
  hideClienteSuggestions();
  // Sincronizar alegra_id y dirección en la tabla clientes (no bloquea el flujo)
  if (typeof sincronizarClienteAlegra === 'function') {
    sincronizarClienteAlegra(c.name, c.id, c.address || null, c.email || null);
  }
  // Verificar contrato para mostrar/ocultar tipo_tarea
  const area = document.getElementById('f-area')?.value;
  if (['it','if'].includes(area)) _verificarContratoCliente(c.id, area, c.name);
}

function hideClienteSuggestions() {
  setTimeout(() => {
    const box = document.getElementById('cliente-suggestions');
    if (box) box.style.display = 'none';
  }, 150);
}
// ===================== FIN AUTOCOMPLETAR CLIENTE =====================

// ===================== BUSCAR FACTURAS EN ALEGRA (por cliente) =====================
async function buscarFacturasAlegraCliente() {
  const cliente = document.getElementById('f-cliente').value.trim();
  const info = document.getElementById('facturas-alegra-info');
  const lista = document.getElementById('facturas-alegra-lista');
  if (!cliente) { info.textContent = 'Primero ingresa el nombre del cliente.'; return; }
  if (!API_BASE) { info.textContent = 'Sin conexión al servidor.'; return; }
  info.textContent = 'Buscando facturas en Alegra...';
  lista.style.display = 'none';
  try {
    const res = await fetch(`${API_BASE}/alegra_facturas_cliente.php?cliente=${encodeURIComponent(cliente)}`);
    const data = await res.json();
    if (data.error) { info.textContent = '⚠️ ' + data.error; return; }
    const facturas = data.facturas || [];
    if (!facturas.length) {
      info.textContent = `No se encontraron facturas en Alegra para "${esc(data.cliente_alegra || cliente)}".`;
      return;
    }
    info.textContent = `Facturas de "${data.cliente_alegra || cliente}" — selecciona la que corresponde:`;
    lista.innerHTML = facturas.map((f,i) => {
      const valor = Number(f.total||0).toLocaleString('es-CO', {minimumFractionDigits:0});
      return `<div onmousedown="seleccionarFacturaAlegra(${i})">📄 ${esc(f.numero)} · ${esc(f.fecha)} · $${valor}</div>`;
    }).join('');
    lista.dataset.facturas = JSON.stringify(facturas);
    lista.style.display = 'block';
  } catch (e) {
    info.textContent = 'No se pudo conectar con Alegra.';
  }
}

function seleccionarFacturaAlegra(i) {
  const lista = document.getElementById('facturas-alegra-lista');
  const facturas = JSON.parse(lista.dataset.facturas || '[]');
  const f = facturas[i];
  if (!f) return;
  document.getElementById('f-factura').value = f.numero;
  lista.style.display = 'none';
  document.getElementById('facturas-alegra-info').textContent = `✅ Factura ${f.numero} seleccionada.`;
  _facturaCampoCambio();
}

// Se dispara al escribir manualmente un número de factura (evento "change" del
// campo) o al seleccionar una desde la búsqueda en Alegra. Si la tarjeta está
// en un estado donde tiene sentido "Marcar como Facturado" (mismo criterio que
// ya usa el botón — ver toggleFacturaField), lo hace automáticamente en vez de
// obligar a un clic aparte.
async function _facturaCampoCambio() {
  const nro = (document.getElementById('f-factura')?.value || '').trim();
  if (!nro) return;
  const btnFact = document.getElementById('btn-marcar-facturado');
  if (!btnFact || btnFact.style.display === 'none') return;
  await _marcarFacturadoDesdeModal();
}
// ===================== FIN BUSCAR FACTURAS EN ALEGRA =====================

function toggleFacturaField(estado) {
  const esPorFacturar = estado === 'realizado' || estado === 'por-facturar';
  const area = document.getElementById('f-area')?.value || '';
  const itIf = ['it','if'].includes(area);
  const showReporte   = itIf; // visible en todos los estados IT/IF
  const showFactura   = ['facturado','archivado','por-facturar','realizado'].includes(estado);
  document.getElementById('grupo-reporte').style.display  = showReporte  ? 'flex'  : 'none';
  document.getElementById('grupo-factura').style.display  = showFactura  ? 'flex'  : 'none';
  // Ocultar campos irrelevantes en "por facturar"
  const grpFecha = document.getElementById('grp-fechaprog');
  if (grpFecha) grpFecha.style.display = esPorFacturar ? 'none' : '';
  // Botón rápido "Marcar como Facturado"
  const btnFact = document.getElementById('btn-marcar-facturado');
  if (btnFact) btnFact.style.display = esPorFacturar ? 'block' : 'none';
}

function onEstadoChange(estado) {
  toggleFacturaField(estado);
  const t = editingId ? tasks.find(x=>x.id===editingId) : null;
  renderSeguimientoSection(t, estado);
  const area = document.getElementById('f-area').value;
  const grp = document.getElementById('grp-aprobar-area');
  const wasShowing = grp && grp.style.display !== 'none';
  toggleAprobarAreaGroup(area, estado);
  if (area==='comercial' && estado==='aprobada' && !wasShowing) {
    mostrarPopupAprobarArea().then(async destino => {
      if (destino) {
        document.getElementById('f-aprobar-area').value = destino;
        await saveTask(); // guarda y cierra el modal automáticamente
      }
    });
  }
}

function toggleAprobarAreaGroup(area, estado) {
  const el = document.getElementById('grp-aprobar-area');
  if (el) el.style.display = (area==='comercial' && estado==='aprobada') ? '' : 'none';
}

// ===================== POPUP: ¿A qué área enviar la cotización aprobada? =====================
let _popupAprobarResolve = null;
function mostrarPopupAprobarArea() {
  return new Promise(resolve => {
    _popupAprobarResolve = resolve;
    document.getElementById('popup-aprobar-area').classList.add('open');
  });
}
function resolverPopupAprobarArea(valor) {
  document.getElementById('popup-aprobar-area').classList.remove('open');
  if (_popupAprobarResolve) { _popupAprobarResolve(valor); _popupAprobarResolve = null; }
}
// ===================== FIN POPUP =====================

// Sugiere la próxima fecha de seguimiento: hoy + 3 días hábiles
function sugerirFechaSeguimiento() {
  const d = new Date();
  let agregados = 0;
  while (agregados < 3) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) agregados++;
  }
  return d.toISOString().split('T')[0];
}

function renderSeguimientoSection(t, estadoOverride) {
  const area = document.getElementById('f-area').value;
  const estado = estadoOverride || document.getElementById('f-est').value;
  const grp = document.getElementById('grp-seguimiento');
  const show = area === 'comercial' && estado !== 'por-cotizar';
  grp.style.display = show ? 'flex' : 'none';
  if (!show) return;
  const hist = t?.seguimientoHistorial || [];
  document.getElementById('seg-historial').innerHTML = hist.length
    ? hist.slice().reverse().map(h=>`<div style="padding:3px 0;border-bottom:1px solid var(--border)"><strong>${esc(h.fecha)}:</strong> ${esc(h.nota)}</div>`).join('')
    : '<div style="color:var(--text-muted)">Sin seguimientos registrados todavía</div>';
  document.getElementById('f-seg-nota').value = '';
  const isEnviada = estado === 'enviada';
  document.getElementById('grp-seg-fecha').style.display = isEnviada ? 'flex' : 'none';
  document.getElementById('f-seg-fecha').value = isEnviada ? (t?.seguimientoFecha || sugerirFechaSeguimiento()) : '';
  document.getElementById('f-seg-nota').placeholder = isEnviada
    ? 'Nota de seguimiento (qué dijo el cliente, próximos pasos...)'
    : 'Nota final (motivo de rechazo / aprobación, opcional)';
}

function closeModal() { document.getElementById('modal').classList.remove('open'); editingId=null; selectedTeam=[]; const cp=document.getElementById('contrato-confirm-popup'); if(cp) cp.style.display='none'; }

async function saveTask() {
  const titulo  = document.getElementById('f-titulo').value.trim();
  let estado    = document.getElementById('f-est').value;
  const area    = document.getElementById('f-area').value;
  const fechaProg = document.getElementById('f-fechaprog').value;
  const diasProg  = parseInt(document.getElementById('f-dias-prog')?.value) || 1;
  const horaProg  = document.getElementById('f-hora-prog')?.value || '08:00';
  const modalidad = document.querySelector('input[name="f-modalidad"]:checked')?.value || null;
  const factura = document.getElementById('f-factura').value.trim();
  if (!titulo) { alert('El título es obligatorio'); return; }

  const prevParaFecha = editingId ? tasks.find(t => t.id === editingId) : null;

  // Si una tarjeta operativa "En ejecución" recibe el reporte del servicio
  // (texto y/o archivo adjunto), preguntar si se quiere mover a "Por facturar"
  if (['it','if'].includes(area) && ['solicitud','programado'].includes(estado)) {
    const fRepFileCheck = document.getElementById('f-reporte-file');
    const tieneArchivo = fRepFileCheck && fRepFileCheck.files && fRepFileCheck.files[0];
    if (tieneArchivo) {
      if (confirm('Adjuntaste un archivo de reporte. ¿Deseas mover esta tarjeta a "Por facturar"?')) {
        estado = 'realizado';
        document.getElementById('f-est').value = estado;
      }
    }
  }

  // Si estaba por_reprogramar y se le ASIGNÓ una fecha NUEVA en este guardado
  // → pasar a programado automáticamente. Si la fecha ya venía de antes (sin
  // cambios) y el admin eligió explícitamente "Por reprogramar", se respeta
  // su elección en vez de revertirla sola.
  if (['it','if'].includes(area) && estado === 'por_reprogramar' && fechaProg && fechaProg !== (prevParaFecha?.fechaProg || '')) {
    estado = 'programado';
    document.getElementById('f-est').value = estado;
  }

  // Validaciones por estado en IT/IF
  if (['it','if'].includes(area)) {
    if (estado==='programado' && !fechaProg) { alert('Para pasar a En ejecución debes ingresar la Fecha de programación'); return; }
    if (estado==='realizado') {
      // Hay reporte si: (1) texto reporte, (2) archivo nuevo adjunto, (3) archivo ya guardado, (4) reporte Ginno creado
      const prevTask = editingId ? tasks.find(t => t.id === editingId) : null;
      const fRepFile = document.getElementById('f-reporte-file');
      const tieneArchivo = (fRepFile?.files?.[0]) || prevTask?.reporteArchivo;
      const tieneReporteGinno = editingId && (
        ((typeof borradoresActivos !== 'undefined') && (borradoresActivos[editingId] || []).length > 0) ||
        ((typeof reportesTodosEnviados !== 'undefined') && reportesTodosEnviados.has(editingId))
      );
      if (!tieneArchivo && !tieneReporteGinno) {
        alert('Para marcar como Por facturar debes adjuntar un archivo o crear un reporte de visita desde Ginno');
        return;
      }
    }
    if (estado==='facturado'  && !factura)   { alert('Para marcar como Facturado debes ingresar el número de factura en Alegra'); return; }
  }
  const now = new Date().toISOString();
  const prev = editingId ? tasks.find(t=>t.id===editingId) : null;

  // Seguimiento comercial
  let seguimientoHistorial = prev?.seguimientoHistorial ? [...prev.seguimientoHistorial] : [];
  let seguimientoFecha = prev?.seguimientoFecha || null;
  if (area === 'comercial' && estado !== 'por-cotizar') {
    const segNota = (document.getElementById('f-seg-nota').value||'').trim();
    if (segNota) seguimientoHistorial.push({ fecha: new Date().toISOString().split('T')[0], nota: segNota });
    if (estado === 'enviada') {
      const segFecha = document.getElementById('f-seg-fecha').value;
      seguimientoFecha = segFecha || seguimientoFecha || sugerirFechaSeguimiento();
    } else {
      seguimientoFecha = null; // ya no está esperando seguimiento
    }
  }

  // Verificar cliente contra Alegra
  const clienteVal = document.getElementById('f-cliente').value.trim();
  if (clienteVal && clienteValidadoAlegra !== true) {
    const match = clienteUltimaBusqueda.find(c => (c.name||'').toLowerCase() === clienteVal.toLowerCase());
    if (!match) alert(`⚠️ El cliente "${clienteVal}" no se encontró en Alegra. La tarea se guardará igual, pero revisa el nombre si vas a facturar.`);
  }

  const laborAdmin = ['it','if'].includes(area) ? document.getElementById('f-labor-admin').value.trim() : '';
  const solicitudComercial = ['it','if'].includes(area) ? document.getElementById('f-solicitud-comercial').value.trim() : '';
  const incluyeProg = area === 'admin' ? !!(document.getElementById('f-incluye-prog')?.checked) : false;
  const tipoTarea = ['it','if'].includes(area) ? (document.getElementById('f-tipo-tarea')?.value || 'evento') : 'evento';
  const esProyectoSave = tipoTarea === 'proyecto';
  // Las tarjetas tipo Proyecto son siempre de reporte interno (nunca le llega
  // nada al cliente) y nunca avisan al cliente el día anterior — los checkboxes
  // ni se muestran para este tipo. El backend también lo fuerza por seguridad.
  const avisarCliente   = esProyectoSave ? false : (['it','if'].includes(area) ? !!(document.getElementById('f-avisar-cliente')?.checked)   : false);
  const reporteInterno  = esProyectoSave ? true  : (['it','if'].includes(area) ? !!(document.getElementById('f-reporte-interno')?.checked)  : false);

  // Si técnico crea una nueva tarea, asignarse automáticamente
  let teamFinal = [...selectedTeam];
  if (!editingId && currentUser && currentUser.perfil === 'tecnico' && !teamFinal.includes(currentUser.id)) {
    teamFinal.push(currentUser.id);
  }

  const task={
    id: editingId||uid(), titulo,
    desc: document.getElementById('f-desc').value.trim(),
    team: teamFinal,
    area: document.getElementById('f-area').value,
    estado,
    cliente: document.getElementById('f-cliente').value.trim(),
    fechaProg, diasProg, horaProg,
    fecha: document.getElementById('f-fecha').value,
    tiempo: document.getElementById('f-tiempo').value.trim(),
    tiempoReal: document.getElementById('f-treal').value.trim(),
    recursos: document.getElementById('f-recursos').value.trim(),
    notas: document.getElementById('f-notas').value.trim(),
    modalidad,
    factura,
    updatedAt: now,
    createdAt: prev?.createdAt || now,
    realizadoAt: estado==='realizado' ? (prev?.realizadoAt || now) : prev?.realizadoAt || null,
    enviadaAt: estado==='enviada' ? (prev?.enviadaAt || now) : prev?.enviadaAt || null,
    programadoAt: estado==='programado' ? (prev?.programadoAt || now) : prev?.programadoAt || null,
    seguimientoFecha, seguimientoHistorial,
    laborAdmin, solicitudComercial, incluyeProg, tipoTarea, avisarCliente, reporteInterno,
    adminTaskId: prev?.adminTaskId || null,
    comercialTaskId: prev?.comercialTaskId || null,
    cotizacionDocx: prev?.cotizacionDocx || null,
    reporteArchivo: prev?.reporteArchivo || null,
  };

  // Si una cotización de Comercial se aprueba, mover la tarjeta al área
  // operativa (IT/IF) elegida, en estado "Pendientes"
  if (area === 'comercial' && estado === 'aprobada') {
    const aprobarArea = document.getElementById('f-aprobar-area');
    if (aprobarArea && aprobarArea.value) {
      task.area = aprobarArea.value;
      task.estado = 'solicitud';
    }
  }

  const extraTasks = [];

  // Auto-crear tarjeta en Administrativo si se llenó "Labor del área administrativa" por primera vez
  if (laborAdmin && !prev?.adminTaskId) {
    const adminTask = {
      id: uid(),
      titulo: `APOYO OPERATIVO: ${task.titulo}`,
      desc: `Solicitud generada desde la tarjeta "${task.titulo}"${task.cliente?` (cliente: ${task.cliente})`:''}.\n\nLabor solicitada:\n${laborAdmin}`,
      team: [],
      area: 'admin',
      estado: 'pendiente',
      cliente: task.cliente,
      fechaProg: task.fechaProg,
      fecha: '',
      tiempo: '',
      tiempoReal: '',
      recursos: '',
      notas: '',
      modalidad: null,
      factura: '',
      updatedAt: now,
      createdAt: now,
      realizadoAt: null,
      enviadaAt: null,
      seguimientoFecha: null,
      seguimientoHistorial: [],
      laborAdmin: '', solicitudComercial: '', incluyeProg: false,
      adminTaskId: null, comercialTaskId: null,
    };
    extraTasks.push(adminTask);
    task.adminTaskId = adminTask.id;
  }

  // Auto-crear tarjeta "Por cotizar" en Comercial si se llenó "Solicitud comercial" por primera vez
  if (solicitudComercial && !prev?.comercialTaskId) {
    const comercialTask = {
      id: uid(),
      titulo: `COTIZACION OPERATIVO: ${task.titulo}`,
      desc: `Solicitud de cotización generada desde la tarjeta "${task.titulo}"${task.cliente?` (cliente: ${task.cliente})`:''}.\n\nDetalle:\n${solicitudComercial}`,
      team: [],
      area: 'comercial',
      estado: 'por-cotizar',
      cliente: task.cliente,
      fechaProg: '',
      fecha: '',
      tiempo: '',
      tiempoReal: '',
      recursos: '',
      notas: '',
      modalidad: null,
      factura: '',
      updatedAt: now,
      createdAt: now,
      realizadoAt: null,
      enviadaAt: null,
      seguimientoFecha: null,
      seguimientoHistorial: [],
      laborAdmin: '', solicitudComercial: '', incluyeProg: false,
      adminTaskId: null, comercialTaskId: null,
    };
    extraTasks.push(comercialTask);
    task.comercialTaskId = comercialTask.id;
  }

  const isNew = !editingId;
  tasks=editingId?tasks.map(t=>t.id===editingId?task:t):[task,...tasks];
  if (extraTasks.length) tasks = [...extraTasks, ...tasks];
  save(); closeModal(); render();
  await syncTask(task, isNew);
  extraTasks.forEach(et => syncTask(et, true));

  // Verificar transporte (IT/IF en sitio al facturar o archivar)
  if (['it','if'].includes(area) && task.modalidad === 'en_sitio' &&
      ['facturado','archivado'].includes(task.estado)) {
    _transportesCheckTarea(task.id);
  }

  // Subir cotización (.docx) si se seleccionó un archivo
  const fCotFile = document.getElementById('f-cotizacion-file');
  if (fCotFile && fCotFile.files && fCotFile.files[0] && API_BASE) {
    try {
      const fd = new FormData();
      fd.append('id', task.id);
      fd.append('file', fCotFile.files[0]);
      const resp = await fetch(`${API_BASE}/cotizacion_docx.php`, { method: 'POST', body: fd });
      const data = await resp.json();
      if (data.ok) {
        const idx = tasks.findIndex(t=>t.id===task.id);
        if (idx>=0) tasks[idx].cotizacionDocx = data.nombre;
        save(); render();
      } else {
        alert('⚠️ No se pudo subir la cotización: ' + (data.error||'error desconocido'));
      }
    } catch (e) {
      console.error('Error subiendo cotización', e);
      alert('⚠️ No se pudo subir la cotización.');
    }
  }

  const fRepFile = document.getElementById('f-reporte-file');
  if (fRepFile && fRepFile.files && fRepFile.files[0] && API_BASE) {
    try {
      const fd = new FormData();
      fd.append('id', task.id);
      fd.append('file', fRepFile.files[0]);
      const resp = await fetch(`${API_BASE}/reporte_archivo.php`, { method: 'POST', body: fd });
      const data = await resp.json();
      if (data.ok) {
        const idx = tasks.findIndex(t=>t.id===task.id);
        if (idx>=0) tasks[idx].reporteArchivo = data.nombre;
        save(); render();
      } else {
        alert('⚠️ No se pudo subir el archivo del reporte: ' + (data.error||'error desconocido'));
      }
    } catch (e) {
      console.error('Error subiendo archivo del reporte', e);
      alert('⚠️ No se pudo subir el archivo del reporte.');
    }
  }
}

function deleteTask() {
  if (!editingId||!confirm('¿Eliminar esta tarea?')) return;
  const id = editingId;
  save(); closeModal(); render();
  syncDelete(id);
}

// ---- Marcar como Facturado desde el modal ----
async function _marcarFacturadoDesdeModal() {
  const nro = (document.getElementById('f-factura')?.value || '').trim();
  if (!nro) {
    document.getElementById('f-factura')?.focus();
    alert('Ingresa el número de factura antes de continuar.');
    return;
  }
  const t = editingId ? tasks.find(x => x.id === editingId) : null;
  if (!t) return;
  const nextEstado = ['it','if'].includes(t.area) ? 'facturado' : t.estado;
  document.getElementById('f-est').value = nextEstado;
  document.getElementById('f-factura').value = nro;
  await saveTask();
}

// ---- Registro rápido de factura desde la tarjeta ----
function _abrirRegistroFacturaRapido(tareaId, event) {
  event.stopPropagation();
  _cerrarRegistroFacturaRapido();
  const btn = event.currentTarget;
  const popup = document.createElement('div');
  popup.id = 'factura-rapida-popup';
  popup.style.cssText = 'position:fixed;z-index:600;background:var(--card-bg,#fff);border:1px solid var(--border);border-radius:10px;padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,.18);min-width:260px;max-width:300px';
  const rect = btn.getBoundingClientRect();
  popup.style.top  = (rect.bottom + 6) + 'px';
  popup.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 316)) + 'px';
  popup.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px">🧾 Registrar factura</div>
    <input id="factura-rapida-input" type="text" placeholder="Nro. de factura en Alegra"
      style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;
             padding:7px 10px;font-size:13px;color:var(--text);background:var(--bg);outline:none;margin-bottom:8px"
      onkeydown="if(event.key==='Enter')_confirmarFacturaRapida('${tareaId}')"
      onclick="event.stopPropagation()">
    <div style="display:flex;gap:6px">
      <button onclick="_confirmarFacturaRapida('${tareaId}')"
        style="flex:1;padding:7px;border-radius:6px;border:none;cursor:pointer;
               background:#169BBC;color:#fff;font-weight:600;font-size:13px">
        ✓ Marcar facturado
      </button>
      <button onclick="_cerrarRegistroFacturaRapido()"
        style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);cursor:pointer;
               background:transparent;color:var(--text-muted);font-size:13px">✕</button>
    </div>
    <div style="margin-top:9px;text-align:center">
      <a onclick="openModal('${tareaId}');_cerrarRegistroFacturaRapido();return false;" href="#"
         style="font-size:11px;color:#169BBC;text-decoration:none">🔍 Buscar en Alegra</a>
    </div>`;
  document.body.appendChild(popup);
  setTimeout(() => document.addEventListener('click', _cerrarRegistroFacturaRapido, { once: true }), 0);
  document.getElementById('factura-rapida-input')?.focus();
}

function _cerrarRegistroFacturaRapido() {
  const p = document.getElementById('factura-rapida-popup');
  if (p) p.remove();
}

async function _confirmarFacturaRapida(tareaId) {
  const input = document.getElementById('factura-rapida-input');
  const nro = (input?.value || '').trim();
  if (!nro) { input?.focus(); return; }
  _cerrarRegistroFacturaRapido();
  const t = tasks.find(x => x.id === tareaId);
  if (!t) return;
  const nextEstado = ['it','if'].includes(t.area) ? 'facturado' : t.estado;
  try {
    const res = await fetch(`${API_BASE}/tareas.php?id=${tareaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...taskToApi(t), factura: nro, estado: nextEstado }),
    });
    if (!res.ok) throw new Error();
    const updated = await res.json();
    const idx = tasks.findIndex(x => x.id === tareaId);
    if (idx >= 0) tasks[idx] = apiToTask(updated);
    render();
  } catch(e) {
    alert('No se pudo guardar la factura. Intenta de nuevo.');
  }
}

document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))closeModal();});
document.getElementById('cartera-modal').addEventListener('click',e=>{if(e.target===document.getElementById('cartera-modal'))closeCarteraModal();});

// Escape cierra cualquier popup/modal abierto de Ginno sin guardar cambios
// (igual que su botón "Cancelar"/"Cerrar"/click-fuera, nunca el de "Guardar").
// Orden: primero los popups ANIDADOS (los que se abren encima de otro modal
// ya abierto), luego sus modales padre — así Escape cierra solo el de más
// arriba, no los dos de un tirón.
// Exclusiones intencionales:
//   - login-overlay: es el candado de acceso, no un popup con "cancelar".
//   - popup-tarea-terminada: no tiene una opción neutra de "cancelar" — sus
//     dos botones (Sí/No) cambian y guardan el estado de la tarjeta, así que
//     Escape no hace nada aquí (se debe elegir explícitamente con un clic).
const _ESC_MODALES = [
  ['popup-aprobar-area',       () => resolverPopupAprobarArea(null)],                                    // anidado sobre #modal
  ['popup-sin-reporte',        () => document.getElementById('popup-sin-reporte').classList.remove('open')], // anidado sobre #reporte-modal ('← Volver')
  ['modal-motivo-no-factura',  () => cerrarMotivoNoFactura()],
  ['admin-checkin-modal',      () => cerrarAdminCheckinModal()],
  ['pausa-modal',              () => cerrarPausaModal()],
  ['visita-tecnico-modal',     () => closeVisitaTecnicoModal()],
  ['reporte-modal',            () => cerrarFormularioReporte()],
  ['modal',                    () => closeModal()],
  ['cliente-modal',            () => cerrarModalCliente()],
  ['usuarios-modal',           () => cerrarModalUsuario()],
  ['prog-modal',               () => closeProgModal()],
  ['retraso-modal',            () => cerrarRetrasoModal()],
  ['alarma-modal',             () => cerrarAlarma()],
  ['cartera-modal',            () => closeCarteraModal()],
  ['modal-visitas-pendientes', () => document.getElementById('modal-visitas-pendientes').classList.remove('open')],
];
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  for (const [id, cerrar] of _ESC_MODALES) {
    const el = document.getElementById(id);
    if (el && el.classList.contains('open')) {
      cerrar();
      e.preventDefault();
      return;
    }
  }
});
