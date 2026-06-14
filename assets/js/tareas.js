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
  const showArchivado = document.getElementById('show-archivado').checked;
  return tasks.filter(t => {
    if (currentArea !== 'all' && t.area !== currentArea) return false;
    if (t.estado === 'archivado' && !showArchivado && est !== 'archivado') return false;
    const teamNames = (t.team||[]).map(id=>getMember(id)?.name||'').join(' ').toLowerCase();
    const teamInitials = (t.team||[]).join(' ').toLowerCase();
    if (q && !((t.titulo||'').toLowerCase().includes(q)||(t.cliente||'').toLowerCase().includes(q)||teamNames.includes(q)||teamInitials.includes(q))) return false;
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
    if (el) el.textContent = tasks.filter(t=>t.area===a&&active(t)).length;
  });
}

function renderStats() {
  const pool = currentArea==='all' ? tasks : tasks.filter(t=>t.area===currentArea);
  const active = pool.filter(t=>t.estado!=='archivado');
  const total  = active.length;
  const prog   = active.filter(t=>t.estado==='en-progreso').length;
  const bloq   = active.filter(t=>t.estado==='bloqueada').length;
  const pfact  = active.filter(t=>t.estado==='por-facturar').length;
  const arch   = tasks.filter(t=>t.estado==='archivado').length;
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
  const team      = t.team||[];
  const segColor = (alertaSeg?.tipo==='sin-seguimiento' && alertaSeg.vencido) ? '#ef4444'
    : { 'sin-seguimiento':'#94a3b8', 'pendiente':'#ef4444', 'al-dia':'#10b981' }[alertaSeg?.tipo] || ac;
  const segBg    = (alertaSeg?.tipo==='sin-seguimiento' && alertaSeg.vencido) ? 'background:#fff5f5;'
    : { 'sin-seguimiento':'background:#f8fafc;', 'pendiente':'background:#fff5f5;', 'al-dia':'' }[alertaSeg?.tipo] || '';
  const sinProgramar = ['it','if'].includes(t.area) && t.estado === 'solicitud' && !t.fechaProg;
  const borderColor = (alerta&&alerta.vencido) ? '#ef4444' : sinProgramar ? '#ef4444' : alertaSeg ? segColor : ac;
  const bgAlert     = (alerta&&alerta.vencido) ? 'background:#fff5f5;' : sinProgramar ? 'background:#fff5f5;' : (alertaSeg ? segBg : '');
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
      const dias = diasHabilesDesde(t.programadoAt);
      diasEstadoBadge = `<div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px">🔧 ${dias} día${dias===1?'':'s'} en ejecución</div>`;
    }
  }
  return `<div class="task-card" data-id="${t.id}" draggable="true"
      ondragstart="onDragStart(event,'${t.id}')"
      ondragend="onDragEnd(event)"
      onclick="openModal('${t.id}')"
      style="border-left:3px solid ${borderColor};${bgAlert}">
    ${alerta ? `<div style="font-size:11px;font-weight:700;color:${alerta.vencido?'#ef4444':'#92400e'};margin-bottom:4px">🧾 ${alerta.dias} día${alerta.dias===1?'':'s'} hábil${alerta.dias===1?'':'es'} sin facturar</div>` : ''}
    ${sinProgramar ? `<div style="font-size:11px;font-weight:700;color:#ef4444;margin-bottom:4px">⚠️ Sin fecha de programación</div>` : ''}
    ${diasEstadoBadge}
    ${segBadge}
    <div class="task-title">${esc(t.titulo)}</div>
    <div class="task-meta">
      ${t.cliente?`<span class="badge" style="background:#f0fdf4;color:#166534">👤 ${esc(t.cliente)}</span>`:''}
      ${currentArea==='all'&&t.area?`<span class="badge" style="background:${ac}20;color:${ac}">${esc((AREAS[t.area]||{}).label||t.area)}</span>`:''}
    </div>
    ${team.length ? `<div class="task-assignee">${teamAvatars(team)}<span>${team.map(id=>getMember(id)?.initials||id).join(', ')}</span></div>` : ''}
    ${t.fechaProg?`<div class="task-date">🗓 Prog: ${t.fechaProg}</div>`:''}
    ${t.fecha?`<div class="task-date${venc?' vencida':''}">${venc?'⚠️ ':'📅 '}Límite: ${t.fecha}${t.tiempo?` · ⏱ ${esc(t.tiempo)}`:''}</div>`:(t.tiempo?`<div class="task-date">⏱ ${esc(t.tiempo)}</div>`:'')}
    ${t.recursos?`<div class="task-date">🔧 ${esc(t.recursos.slice(0,45))}${t.recursos.length>45?'...':''}</div>`:''}
    ${t.reporte?`<div class="task-date" style="color:#059669">📝 Reporte registrado</div>`:''}
    ${t.factura?`<div class="task-date" style="color:#166534">✅ Factura: ${esc(t.factura)}</div>`:''}
    ${(['it','if'].includes(t.area) && t.estado==='realizado' && t.cotizacionDocx) ? `<button class="btn-archivar" style="background:#3b82f6;color:#fff" onclick="generarFacturaDesdeTarea('${t.id}',event)">🧾 Generar factura desde cotización</button>` : ''}
    ${showArchivar ? `<button class="btn-archivar" onclick="archivarTask('${t.id}',event)">📦 Archivar</button>` : ''}
  </div>`;
}


function renderKanban() {
  const filtered = getFiltered();
  const cols = getColsForArea(currentArea);
  const colArea = currentArea==='all' ? null : currentArea;

  let html = cols.map(col => {
    const ct = filtered.filter(t=>t.estado===col.id);
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
  const archPool = currentArea==='all' ? tasks : tasks.filter(t=>t.area===currentArea);
  const arch = archPool.filter(t=>t.estado==='archivado');
  const archDiv = document.getElementById('arch-section');
  if (archDiv) {
    if (arch.length) {
      archDiv.innerHTML = `<button class="arch-toggle" onclick="toggleArchSection()">📦 Archivadas (${arch.length}) ▾</button>
        <div id="arch-cards" style="display:none;display:flex;gap:12px;flex-wrap:wrap">${arch.map(taskCard).join('')}</div>`;
    } else {
      archDiv.innerHTML = '';
    }
  }
}

function toggleArchSection() {
  const el = document.getElementById('arch-cards');
  if (el) el.style.display = el.style.display==='none' ? 'flex' : 'none';
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
  currentView=v;
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

function dashAreaCard(icon, title, color, areaKey, solSinProg, solProg, ejec, real, alertCount) {
  return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)">
    <div onclick="goToArea('${areaKey}','')" style="font-weight:700;font-size:15px;color:${color};margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer">
      <span>${icon} ${title} <span style="font-size:12px;font-weight:400;color:var(--text-muted)">→ ver todo</span></span>
      ${alertCount>0?`<span style="font-size:11px;font-weight:700;color:#ef4444;background:#fee2e2;padding:3px 9px;border-radius:99px">🚨 ${alertCount} sin facturar</span>`:''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${dashMetric('Sin programar', solSinProg, '#94a3b8', false, areaKey, 'solicitud')}
      ${dashMetric('Programadas', solProg, '#0891b2', false, areaKey, 'solicitud')}
      ${dashMetric('En ejecución', ejec, '#6366f1', false, areaKey, 'programado')}
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
  const allAlerts   = [...itAlerts, ...ifAlerts, ...adminAlerts];
  const sinProgAlerts = tasks.filter(t=>act(t) && alertaProgramacion(t)!==null);

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
        itT.filter(t=>t.estado==='realizado').length,
        itAlerts.length)}
      ${dashAreaCard('🏗️','IF','#f97316','if',
        ifT.filter(t=>t.estado==='solicitud'&&!t.fechaProg).length,
        ifT.filter(t=>t.estado==='solicitud'&&t.fechaProg).length,
        ifT.filter(t=>t.estado==='programado').length,
        ifT.filter(t=>t.estado==='realizado').length,
        ifAlerts.length)}
    </div>
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

  if (allAlerts.length || sinProgAlerts.length || comT.some(t=>{ const a=alertaSeguimiento(t); return a && (a.tipo==='sin-seguimiento'||a.tipo==='pendiente'); })) {
    html += `<div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:10px">🔔 Zona de alertas</div>`;
  }

  if (allAlerts.length) {
    html += `<div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="font-weight:700;font-size:13px;color:#ef4444;margin-bottom:10px">🚨 Realizados sin facturar</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${allAlerts.map(t=>{
          const a = alertaFacturacion(t);
          const vencido = a && a.vencido;
          return `
          <div onclick="openModal('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:${vencido?'#fee2e2':'white'};border-radius:8px;border:1px solid ${vencido?'#ef4444':'#fecaca'};cursor:pointer;font-size:13px">
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${(AREAS[t.area]||{}).color||'#94a3b8'}25;color:${(AREAS[t.area]||{}).color||'#94a3b8'}">${(AREAS[t.area]||{}).label||t.area}</span>
            <span style="font-weight:600;flex:1">${esc(t.titulo)}</span>
            ${t.cliente?`<span style="color:var(--text-muted);font-size:11px">👤 ${esc(t.cliente)}</span>`:''}
            <span style="color:#ef4444;font-weight:700;font-size:12px">${a.dias} día${a.dias===1?'':'s'}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  const comSeguimiento = comT.filter(t=>{ const a=alertaSeguimiento(t); return a && (a.tipo==='sin-seguimiento'||a.tipo==='pendiente'); });
  if (comSeguimiento.length) {
    html += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:var(--radius);padding:16px;margin-bottom:14px">
      <div style="font-weight:700;font-size:13px;color:#92400e;margin-bottom:10px">📞 Cotizaciones enviadas que necesitan seguimiento</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${comSeguimiento.map(t=>{
          const a = alertaSeguimiento(t);
          const vencido = a.tipo==='sin-seguimiento' && a.vencido;
          const tag = a.tipo==='pendiente'
            ? `<span style="color:#ef4444;font-weight:700;font-size:12px">🔔 ${a.fecha}</span>`
            : `<span style="color:${vencido?'#ef4444':'#64748b'};font-weight:700;font-size:12px">📋 ${a.dias} día${a.dias===1?'':'s'} sin contactar</span>`;
          return `<div onclick="openModal('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:${vencido?'#fee2e2':'white'};border-radius:8px;border:1px solid ${vencido?'#ef4444':'#fde68a'};cursor:pointer;font-size:13px">
            <span style="font-weight:600;flex:1">${esc(t.titulo)}</span>
            ${t.cliente?`<span style="color:var(--text-muted);font-size:11px">👤 ${esc(t.cliente)}</span>`:''}
            ${tag}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  if (sinProgAlerts.length) {
    html += `<div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:var(--radius);padding:16px">
      <div style="font-weight:700;font-size:13px;color:#ef4444;margin-bottom:10px">⚠️ Pendientes sin programar</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${sinProgAlerts.map(t=>{
          const a = alertaProgramacion(t);
          const vencido = a.vencido;
          return `<div onclick="openModal('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:${vencido?'#fee2e2':'white'};border-radius:8px;border:1px solid ${vencido?'#ef4444':'#fecaca'};cursor:pointer;font-size:13px">
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${(AREAS[t.area]||{}).color||'#94a3b8'}25;color:${(AREAS[t.area]||{}).color||'#94a3b8'}">${(AREAS[t.area]||{}).label||t.area}</span>
            <span style="font-weight:600;flex:1">${esc(t.titulo)}</span>
            ${t.cliente?`<span style="color:var(--text-muted);font-size:11px">👤 ${esc(t.cliente)}</span>`:''}
            <span style="color:${vencido?'#ef4444':'#64748b'};font-weight:700;font-size:12px">📅 ${a.dias} día${a.dias===1?'':'s'} sin programar</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  html += '</div>';
  document.getElementById('dashboard-view').innerHTML = html;
}

function setArea(a) {
  currentArea=a;
  document.querySelectorAll('.area-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(`.area-tab[data-area="${a}"]`).classList.add('active');
  const isCartera = a === 'cartera';
  const isFacturacion = a === 'facturacion';
  const isOther = isCartera || isFacturacion;
  document.getElementById('kanban-view').style.display   = isOther ? 'none' : (currentView==='kanban'?'flex':'none');
  document.getElementById('lista-view').style.display    = isOther ? 'none' : (currentView==='lista'?'block':'none');
  document.getElementById('cartera-view').style.display  = isCartera ? 'block' : 'none';
  document.getElementById('facturacion-view').style.display = isFacturacion ? 'block' : 'none';
  document.querySelector('.filters').style.display       = isOther ? 'none' : 'flex';
  document.getElementById('stats').style.display         = isOther ? 'none' : 'grid';
  document.querySelector('.view-toggle').style.display   = isOther ? 'none' : 'flex';
  document.querySelector('.btn-add').style.display       = isOther ? 'none' : 'inline-flex';
  if (isOther) document.getElementById('dashboard-view').style.display = 'none';
  if (isCartera) { renderCartera(); if (!cartera.length) fetchCarteraAlegra(); }
  else if (isFacturacion) { /* nada que cargar al entrar */ }
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

function archivarTask(id, e) {
  if (e) { e.stopPropagation(); }
  if (!confirm('¿Archivar esta tarea? Ya no aparecerá en el tablero activo.')) return;
  tasks = tasks.map(t => t.id===id ? {...t, estado:'archivado', updatedAt:new Date().toISOString()} : t);
  save(); render();
  syncEstado(id);
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
  // Validate requirements
  if (['it','if'].includes(area)) {
    if (estado==='programado' && !t.fechaProg) { openModal(dragId, null, estado); dragId=null; return; }
    if (estado==='realizado'  && !t.reporte)   { openModal(dragId, null, estado); dragId=null; return; }
    if (estado==='facturado'  && !t.factura)   { openModal(dragId, null, estado); dragId=null; return; }
  }
  const now = new Date().toISOString();
  tasks = tasks.map(x => x.id===dragId ? {
    ...x, estado,
    realizadoAt: estado==='realizado' ? (x.realizadoAt||now) : x.realizadoAt,
    enviadaAt:   estado==='enviada'   ? (x.enviadaAt||now)   : x.enviadaAt,
    programadoAt: estado==='programado' ? (x.programadoAt||now) : x.programadoAt,
    seguimientoFecha: x.area==='comercial'
      ? (estado==='enviada' ? (x.seguimientoFecha || sugerirFechaSeguimiento()) : null)
      : x.seguimientoFecha,
    updatedAt: now,
  } : x);
  const movedId = dragId;
  dragId=null; save(); render();
  syncEstado(movedId);
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
  const elCot = document.getElementById('grp-cotizacion-docx');
  if (elCot) elCot.style.display = area==='comercial' ? '' : 'none';
  const elTeam = document.getElementById('grp-team');
  if (elTeam) elTeam.style.display = area==='comercial' ? 'none' : '';
  updateEstadoOptions();
}

function openModal(id, preArea, preEstado) {
  editingId=id||null;
  const t=id?tasks.find(x=>x.id===id):null;
  document.getElementById('modal-title-text').textContent=t?'Editar Tarea':'Nueva Tarea';
  document.getElementById('btn-delete').style.display=t?'inline-block':'none';
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
  document.getElementById('f-fecha').value=t?.fecha||'';
  document.getElementById('f-tiempo').value=t?.tiempo||'';
  document.getElementById('f-treal').value=t?.tiempoReal||'';
  document.getElementById('f-recursos').value=t?.recursos||'';
  document.getElementById('f-notas').value=t?.notas||'';
  document.getElementById('f-reporte').value=t?.reporte||'';
  document.getElementById('f-factura').value=t?.factura||'';
  document.getElementById('f-labor-admin').value=t?.laborAdmin||'';
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
  if (q.length < 2) { box.style.display = 'none'; return; }
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
}
// ===================== FIN BUSCAR FACTURAS EN ALEGRA =====================

function toggleFacturaField(estado) {
  const showReporte  = ['programado','realizado','facturado','archivado'].includes(estado);
  const showFactura  = ['facturado','archivado','por-facturar'].includes(estado);
  document.getElementById('grupo-reporte').style.display  = showReporte  ? 'flex' : 'none';
  document.getElementById('grupo-factura').style.display  = showFactura  ? 'flex' : 'none';
}

function onEstadoChange(estado) {
  toggleFacturaField(estado);
  const t = editingId ? tasks.find(x=>x.id===editingId) : null;
  renderSeguimientoSection(t, estado);
  toggleAprobarAreaGroup(document.getElementById('f-area').value, estado);
}

function toggleAprobarAreaGroup(area, estado) {
  const el = document.getElementById('grp-aprobar-area');
  if (el) el.style.display = (area==='comercial' && estado==='aprobada') ? '' : 'none';
}

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

function closeModal() { document.getElementById('modal').classList.remove('open'); editingId=null; selectedTeam=[]; }

async function saveTask() {
  const titulo  = document.getElementById('f-titulo').value.trim();
  let estado    = document.getElementById('f-est').value;
  const area    = document.getElementById('f-area').value;
  const fechaProg = document.getElementById('f-fechaprog').value;
  const reporte = document.getElementById('f-reporte').value.trim();
  const factura = document.getElementById('f-factura').value.trim();
  if (!titulo) { alert('El título es obligatorio'); return; }

  // Si una tarjeta operativa "En ejecución" recibe el reporte del servicio
  // (texto y/o archivo adjunto), preguntar si se quiere mover a "Por facturar"
  if (['it','if'].includes(area) && estado === 'programado') {
    const fRepFileCheck = document.getElementById('f-reporte-file');
    const tieneArchivo = fRepFileCheck && fRepFileCheck.files && fRepFileCheck.files[0];
    if (reporte || tieneArchivo) {
      if (confirm('Agregaste el reporte del servicio. ¿Deseas mover esta tarjeta a "Por facturar"?')) {
        estado = 'realizado';
        document.getElementById('f-est').value = estado;
      }
    }
  }

  // Validaciones por estado en IT/IF
  if (['it','if'].includes(area)) {
    if (estado==='programado' && !fechaProg) { alert('Para pasar a En ejecución debes ingresar la Fecha de programación'); return; }
    if (estado==='realizado'  && !reporte)   { alert('Para marcar como Por facturar debes ingresar el reporte del servicio'); return; }
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

  const task={
    id: editingId||uid(), titulo,
    desc: document.getElementById('f-desc').value.trim(),
    team: [...selectedTeam],
    area: document.getElementById('f-area').value,
    estado,
    cliente: document.getElementById('f-cliente').value.trim(),
    fechaProg,
    fecha: document.getElementById('f-fecha').value,
    tiempo: document.getElementById('f-tiempo').value.trim(),
    tiempoReal: document.getElementById('f-treal').value.trim(),
    recursos: document.getElementById('f-recursos').value.trim(),
    notas: document.getElementById('f-notas').value.trim(),
    reporte,
    factura,
    updatedAt: now,
    createdAt: prev?.createdAt || now,
    realizadoAt: estado==='realizado' ? (prev?.realizadoAt || now) : prev?.realizadoAt || null,
    enviadaAt: estado==='enviada' ? (prev?.enviadaAt || now) : prev?.enviadaAt || null,
    programadoAt: estado==='programado' ? (prev?.programadoAt || now) : prev?.programadoAt || null,
    seguimientoFecha, seguimientoHistorial,
    laborAdmin, solicitudComercial,
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
      reporte: '',
      factura: '',
      updatedAt: now,
      createdAt: now,
      realizadoAt: null,
      enviadaAt: null,
      seguimientoFecha: null,
      seguimientoHistorial: [],
      laborAdmin: '', solicitudComercial: '',
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
      reporte: '',
      factura: '',
      updatedAt: now,
      createdAt: now,
      realizadoAt: null,
      enviadaAt: null,
      seguimientoFecha: null,
      seguimientoHistorial: [],
      laborAdmin: '', solicitudComercial: '',
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

  // Subir archivo adjunto del reporte del servicio si se seleccionó uno
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
  tasks=tasks.filter(t=>t.id!==id);
  save(); closeModal(); render();
  syncDelete(id);
}

document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))closeModal();});
document.getElementById('cartera-modal').addEventListener('click',e=>{if(e.target===document.getElementById('cartera-modal'))closeCarteraModal();});
