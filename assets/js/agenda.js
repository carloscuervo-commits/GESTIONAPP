// ===================== MÓDULO AGENDA SEMANAL =====================
// Vista semanal por técnico. Técnico ve solo su agenda; admin tiene
// selector multi-técnico y vista en grid comparativo.

let _agendaSemanaOffset = 0; // 0 = semana actual
let _agendaTecSeleccion = []; // IDs seleccionados (admin)

const _AGENDA_DIAS  = ['Lun','Mar','Mié','Jue','Vie','Sáb'];
const _AGENDA_COLOR = { it:'#169BBC', if:'#534AB7', admin:'#6366f1', comercial:'#f59e0b' };
const _AGENDA_BG    = { it:'#E1F5EE', if:'#EEEDFE', admin:'#EEF2FF', comercial:'#FAEEDA' };
const _AGENDA_TEXT  = { it:'#085041', if:'#3C3489', admin:'#312e81', comercial:'#633806' };

function iniciarAgenda() {
  _agendaSemanaOffset = 0;
  if (currentUser?.perfil === 'admin') {
    _agendaTecSeleccion = TEAM.map(t => t.id);
  } else {
    _agendaTecSeleccion = [currentUser?.id].filter(Boolean);
  }
  renderAgendaSemanal();
}

function renderAgendaSemanal() {
  const el = document.getElementById('agenda-view');
  if (!el) return;
  const dias = _agendaDias();
  const esAdmin = currentUser?.perfil === 'admin';
  el.innerHTML = esAdmin ? _agendaHtmlAdmin(dias) : _agendaHtmlTecnico(dias);
}

function _agendaDias() {
  const hoy = new Date();
  const dow = hoy.getDay();
  const diffLun = dow === 0 ? -6 : 1 - dow;
  const lun = new Date(hoy);
  lun.setDate(hoy.getDate() + diffLun + _agendaSemanaOffset * 7);
  lun.setHours(0, 0, 0, 0);
  return _AGENDA_DIAS.map((nombre, i) => {
    const d = new Date(lun);
    d.setDate(lun.getDate() + i);
    return { nombre, fecha: d, iso: d.toISOString().split('T')[0] };
  });
}

function _agendaTareasDelDia(isoFecha, tecnicoId = null) {
  // Saltar días no hábiles (fines de semana y festivos Colombia)
  const dFecha = new Date(isoFecha + 'T00:00:00');
  if (!esDiaHabil(dFecha)) return [];
  return tasks
    .filter(t => {
      if (!t.fechaProg || t.estado === 'archivado') return false;
      if (isoFecha < t.fechaProg) return false;
      if ((t.diasProg || 1) <= 1) return isoFecha === t.fechaProg;
      const isoFin = fechaProgFin(t) || t.fechaProg;
      if (isoFecha > isoFin) return false;
      if (tecnicoId && !(t.team || []).includes(tecnicoId)) return false;
      return true;
    })
    .sort((a, b) => (a.horaProg || '00:00').localeCompare(b.horaProg || '00:00'));
}

function _agendaMesLabel(d1, d2) {
  const fmt = d => d.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
  return `${fmt(d1)} — ${fmt(d2)}, ${d1.getFullYear()}`;
}

function _agendaNav() {
  const dias = _agendaDias();
  const mesLabel = _agendaMesLabel(dias[0].fecha, dias[5].fecha);
  const esSemActual = _agendaSemanaOffset === 0;
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <button onclick="_agendaNavSemana(-1)"
        style="border:0.5px solid var(--border);background:none;border-radius:var(--radius);
               padding:6px 14px;cursor:pointer;color:var(--text-muted);font-size:13px">← Anterior</button>
      <div style="text-align:center">
        <div style="font-size:15px;font-weight:500;color:var(--text)">${mesLabel}</div>
        ${esSemActual ? `<div style="font-size:11px;color:#169BBC;margin-top:2px">Esta semana</div>` : ''}
      </div>
      <button onclick="_agendaNavSemana(1)"
        style="border:0.5px solid var(--border);background:none;border-radius:var(--radius);
               padding:6px 14px;cursor:pointer;color:var(--text-muted);font-size:13px">Siguiente →</button>
    </div>`;
}

function _agendaCardSmall(t) {
  const c  = _AGENDA_COLOR[t.area] || '#888';
  const bg = _AGENDA_BG[t.area]   || '#f1f5f9';
  const tx = _AGENDA_TEXT[t.area] || '#333';
  const hora = t.horaProg ? ` · ${t.horaProg}` : '';
  const contrato = t.tipoTarea === 'contrato' ? ' 📋' : '';
  return `
    <div onclick="openModal('${t.id}')" style="background:${bg};border-left:3px solid ${c};
         border-radius:0 8px 8px 0;padding:9px 12px;cursor:pointer;transition:opacity .15s"
         onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'">
      <div style="font-size:11px;color:${c};font-weight:600;margin-bottom:2px">
        ${(t.area||'').toUpperCase()}${hora}${contrato}
      </div>
      <div style="font-size:13px;font-weight:500;color:var(--text);line-height:1.3">
        ${esc(t.cliente || 'Sin cliente')}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:1px">${esc(t.titulo || '')}</div>
    </div>`;
}

// ---- Vista técnico (lista) ----

function _agendaHtmlTecnico(dias) {
  const hoyIso = new Date().toISOString().split('T')[0];
  const userId = currentUser?.id;
  const rows = dias.map(dia => {
    const tareas = _agendaTareasDelDia(dia.iso, userId);
    const esHoy  = dia.iso === hoyIso;
    const numBg  = esHoy ? '#169BBC' : 'transparent';
    const numTxt = esHoy ? '#fff' : 'var(--text)';
    return `
      <div style="display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:start;
                  padding:10px 0;border-bottom:0.5px solid var(--border)">
        <div style="text-align:center;padding-top:2px">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">${dia.nombre}</div>
          <div style="width:30px;height:30px;border-radius:50%;background:${numBg};display:inline-flex;
                      align-items:center;justify-content:center;font-size:16px;font-weight:500;color:${numTxt}">
            ${dia.fecha.getDate()}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px">
          ${tareas.length
            ? tareas.map(t => _agendaCardSmall(t)).join('')
            : `<div style="font-size:12px;color:var(--text-muted);font-style:italic;padding:8px 0">Sin tareas programadas</div>`}
        </div>
      </div>`;
  }).join('');
  return `<div style="max-width:640px">${_agendaNav()}${rows}</div>`;
}

// ---- Vista admin ----

function _agendaHtmlAdmin(dias) {
  const chips = TEAM.map(tec => {
    const activo = _agendaTecSeleccion.includes(tec.id);
    return `<span onclick="_agendaToggleTec('${tec.id}')"
      style="cursor:pointer;font-size:12px;padding:5px 12px;border-radius:20px;font-weight:500;
             user-select:none;transition:all .15s;
             background:${activo ? '#169BBC' : 'var(--card-bg,var(--surface-1))'};
             color:${activo ? '#fff' : 'var(--text-muted)'};
             border:0.5px solid ${activo ? '#169BBC' : 'var(--border)'}">${esc(tec.name)}</span>`;
  }).join('');

  const tecsSel = TEAM.filter(t => _agendaTecSeleccion.includes(t.id));
  const hoyIso  = new Date().toISOString().split('T')[0];
  const vista   = tecsSel.length <= 1
    ? _agendaAdminLista(dias, tecsSel[0]?.id || null, hoyIso)
    : _agendaAdminGrid(dias, tecsSel, hoyIso);

  const leyenda = Object.entries(_AGENDA_COLOR).map(([a, c]) =>
    `<span style="font-size:11px;color:var(--text-muted);display:inline-flex;align-items:center;gap:4px">
       <span style="width:10px;height:10px;background:${c};border-radius:2px;display:inline-block"></span>${a.toUpperCase()}
     </span>`).join('');

  return `
    <div>
      ${_agendaNav()}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${chips}</div>
      ${vista}
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px">
        ${leyenda}
        <span style="font-size:11px;color:var(--text-muted)">📋 contrato</span>
      </div>
    </div>`;
}

function _agendaAdminLista(dias, tecId, hoyIso) {
  if (!tecId) return `
    <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:40px 0">
      Selecciona al menos un técnico
    </div>`;
  const rows = dias.map(dia => {
    const tareas = _agendaTareasDelDia(dia.iso, tecId);
    const esHoy  = dia.iso === hoyIso;
    const numBg  = esHoy ? '#169BBC' : 'transparent';
    const numTxt = esHoy ? '#fff' : 'var(--text)';
    return `
      <div style="display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:start;
                  padding:10px 0;border-bottom:0.5px solid var(--border)">
        <div style="text-align:center;padding-top:2px">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">${dia.nombre}</div>
          <div style="width:30px;height:30px;border-radius:50%;background:${numBg};display:inline-flex;
                      align-items:center;justify-content:center;font-size:16px;font-weight:500;color:${numTxt}">
            ${dia.fecha.getDate()}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px">
          ${tareas.length
            ? tareas.map(t => _agendaCardSmall(t)).join('')
            : `<div style="font-size:12px;color:var(--text-muted);font-style:italic;padding:8px 0">Libre</div>`}
        </div>
      </div>`;
  }).join('');
  return `<div style="max-width:640px">${rows}</div>`;
}

function _agendaAdminGrid(dias, tecs, hoyIso) {
  const cols = `52px ${tecs.map(() => 'minmax(100px,1fr)').join(' ')}`;
  const minW = 52 + tecs.length * 120;

  const thead = `
    <div style="background:var(--surface-1,var(--card));border-bottom:0.5px solid var(--border);padding:8px 6px"></div>
    ${tecs.map(tec => `
      <div style="background:var(--surface-1,var(--card));border-bottom:0.5px solid var(--border);
                  border-left:0.5px solid var(--border);padding:8px 10px;text-align:center">
        <div style="font-size:12px;font-weight:500;color:var(--text)">${esc(tec.name.split(' ')[0])}</div>
      </div>`).join('')}`;

  const tbody = dias.map((dia, idx) => {
    const esHoy  = dia.iso === hoyIso;
    const isLast = idx === dias.length - 1;
    const bb     = isLast ? '' : 'border-bottom:0.5px solid var(--border);';
    const numBg  = esHoy ? '#169BBC' : 'transparent';
    const numTxt = esHoy ? '#fff' : 'var(--text)';

    const diaCell = `
      <div style="padding:8px 4px;text-align:center;${bb}">
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">${dia.nombre}</div>
        <div style="width:26px;height:26px;border-radius:50%;background:${numBg};display:inline-flex;
                    align-items:center;justify-content:center;font-size:14px;font-weight:500;color:${numTxt};margin-top:3px">
          ${dia.fecha.getDate()}
        </div>
      </div>`;

    const tecCells = tecs.map(tec => {
      const tareas = _agendaTareasDelDia(dia.iso, tec.id);
      return `
        <div style="padding:5px 6px;border-left:0.5px solid var(--border);${bb}vertical-align:top">
          ${tareas.length
            ? tareas.map(t => {
                const c  = _AGENDA_COLOR[t.area] || '#888';
                const bg = _AGENDA_BG[t.area]    || '#f1f5f9';
                const tx = _AGENDA_TEXT[t.area]  || '#333';
                const hora = t.horaProg ? ` ${t.horaProg}` : '';
                const cont = t.tipoTarea === 'contrato' ? ' 📋' : '';
                const cliente = (t.cliente || '').split(' ').slice(0, 3).join(' ');
                return `
                  <div onclick="openModal('${t.id}')" style="background:${bg};border-left:2px solid ${c};
                       border-radius:0 4px 4px 0;padding:4px 6px;margin-bottom:3px;cursor:pointer;
                       transition:opacity .15s" onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'">
                    <div style="font-size:10px;color:${c};font-weight:600">${(t.area||'').toUpperCase()}${hora}${cont}</div>
                    <div style="font-size:11px;color:${tx};line-height:1.3">${esc(cliente)}</div>
                  </div>`;
              }).join('')
            : `<div style="font-size:11px;color:var(--text-muted);padding:4px 2px;font-style:italic">libre</div>`}
        </div>`;
    }).join('');

    return diaCell + tecCells;
  }).join('');

  return `
    <div style="border:0.5px solid var(--border);border-radius:8px;overflow-x:auto">
      <div style="display:grid;grid-template-columns:${cols};min-width:${minW}px">
        ${thead}${tbody}
      </div>
    </div>`;
}

function _agendaNavSemana(delta) {
  _agendaSemanaOffset += delta;
  renderAgendaSemanal();
}

function _agendaToggleTec(id) {
  const idx = _agendaTecSeleccion.indexOf(id);
  if (idx >= 0) {
    if (_agendaTecSeleccion.length === 1) return; // mínimo 1 siempre
    _agendaTecSeleccion.splice(idx, 1);
  } else {
    _agendaTecSeleccion.push(id);
  }
  renderAgendaSemanal();
}
