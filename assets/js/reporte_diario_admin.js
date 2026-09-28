// ===================== REPORTES DIARIOS (vista admin) =====================
// Pestaña "📅 Reportes diarios": permite a un admin revisar lo que los
// técnicos in-house reportaron día a día (hora de inicio/fin + actividades)
// y reabrir un reporte ya cerrado si el técnico necesita corregir algo.
// El técnico mismo llena esto desde reporte-diario.html (página aparte,
// no desde aquí).

let _rdaReportes = [];
let _rdaTecnicos = [];

function _rdaHoy() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function renderReporteDiarioAdminView() {
  const cont = document.getElementById('reporte-diario-admin-view');
  if (!cont) return;

  if (!cont.dataset.init) {
    cont.dataset.init = '1';
    const hace7 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    cont.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">
        <div>
          <label class="form-label">Desde</label>
          <input class="form-input" type="date" id="rda-desde" value="${hace7}">
        </div>
        <div>
          <label class="form-label">Hasta</label>
          <input class="form-input" type="date" id="rda-hasta" value="${_rdaHoy()}">
        </div>
        <div>
          <label class="form-label">Técnico</label>
          <select class="form-input" id="rda-tecnico"><option value="">Todos</option></select>
        </div>
        <button class="btn-save" onclick="_rdaCargar()">Buscar</button>
      </div>
      <div id="rda-lista"></div>
    `;
    try {
      const res = await fetch(`${API_BASE}/usuarios.php`);
      const todos = await res.json();
      _rdaTecnicos = Array.isArray(todos) ? todos.filter(u => u.perfil === 'tecnico_inhouse') : [];
      const sel = document.getElementById('rda-tecnico');
      if (sel) sel.innerHTML += _rdaTecnicos.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
    } catch (e) { /* silencioso */ }
  }

  await _rdaCargar();
}

async function _rdaCargar() {
  const desde = document.getElementById('rda-desde')?.value;
  const hasta = document.getElementById('rda-hasta')?.value;
  const tecId = document.getElementById('rda-tecnico')?.value;
  const lista = document.getElementById('rda-lista');
  if (!desde || !hasta || !lista) return;

  lista.innerHTML = '<div class="muted">Cargando…</div>';
  try {
    let url = `${API_BASE}/reporte_diario.php?admin=1&desde=${desde}&hasta=${hasta}`;
    if (tecId) url += `&tecnico_id=${encodeURIComponent(tecId)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) { lista.innerHTML = `<div class="muted">${esc(data.error)}</div>`; return; }
    _rdaReportes = data;
    _rdaRender();
  } catch (e) {
    lista.innerHTML = '<div class="muted">No se pudo cargar. Revisa tu conexión.</div>';
  }
}

function _rdaRender() {
  const lista = document.getElementById('rda-lista');
  if (!lista) return;

  if (!_rdaReportes.length) {
    lista.innerHTML = '<div class="muted">No hay reportes en este rango.</div>';
    return;
  }

  lista.innerHTML = _rdaReportes.map(r => {
    const cerrado = !!Number(r.cerrado);
    const acts = r.actividades || [];
    const actsHtml = acts.length
      ? acts.map(a => `
          <div style="padding:6px 0;border-top:1px solid var(--border)">
            <div style="font-size:13px">${esc(a.descripcion)}</div>
            <div style="font-size:11px;color:var(--text-muted)">
              ${a.hora_inicio ? `${a.hora_inicio.slice(0,5)} – ${a.hora_fin ? a.hora_fin.slice(0,5) : '?'}` : 'General'}
            </div>
          </div>`).join('')
      : '<div style="font-size:12px;color:var(--text-muted);padding:6px 0">Sin actividades registradas.</div>';

    return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <strong>${esc(r.tecnico_nombre)}</strong>
            <span style="color:var(--text-muted);font-size:13px"> · ${esc(r.cliente_nombre)} · ${r.fecha}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:12px;background:${cerrado ? '#FFF4E0' : '#D6F3F4'};color:${cerrado ? '#8a5a00' : '#0D3B40'};padding:3px 8px;border-radius:99px">
              ${cerrado ? '🔒 Cerrado' : '🟢 En curso'}
            </span>
            ${cerrado ? `<button class="btn-cancel" style="padding:4px 10px;font-size:12px" onclick="_rdaReabrir('${r.tecnico_id}','${r.fecha}')">Reabrir</button>` : ''}
          </div>
        </div>
        <div style="margin-top:8px;font-size:13px;color:var(--text-muted)">
          Inicio: <strong>${r.hora_inicio ? r.hora_inicio.slice(0,5) : '—'}</strong>
          &nbsp;·&nbsp; Fin: <strong>${r.hora_fin ? r.hora_fin.slice(0,5) : '—'}</strong>
        </div>
        <div style="margin-top:6px">${actsHtml}</div>
      </div>
    `;
  }).join('');
}

async function _rdaReabrir(tecnicoId, fecha) {
  if (!confirm('¿Reabrir este reporte? El técnico podrá volver a editarlo.')) return;
  try {
    const res = await fetch(`${API_BASE}/reporte_diario.php`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'reabrir', tecnico_id: tecnicoId, fecha }),
    });
    const data = await res.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    await _rdaCargar();
  } catch (e) { alert('No se pudo reabrir. Revisa tu conexión.'); }
}
// ===================== FIN REPORTES DIARIOS (vista admin) =====================
