// ============================================================
// comentarios.js — Comentarios por tarjeta con @menciones
// v20260820a
// ============================================================
// Se recarga cada vez que se abre el modal de una tarjeta existente
// (ver openModal() en tareas.js). No se actualiza en vivo mientras el
// modal permanece abierto — hay que cerrar y volver a abrir para ver
// comentarios nuevos de otras personas (decisión explícita para no sumar
// más carga de polling al servidor).

let _comentTareaId = null;
let _comentCandidatos = []; // [{id,name,initials,color}] — a quién se puede mencionar en esta tarjeta
let _comentMencionActiva = null; // {inicio, fin} posición del "@..." que se está escribiendo

async function renderComentariosTarea(tareaId) {
  _comentTareaId = tareaId;

  // Candidatos para @mención: equipo asignado a la tarjeta + todos los
  // administradores (así cualquiera que se mencione siempre puede abrir
  // la tarjeta para ver el comentario, sin importar el filtro de
  // visibilidad de tareasVisibles()).
  const t = tasks.find(x => x.id === tareaId);
  const idsCandidatos = new Set(t?.team || []);
  TEAM.filter(m => m.perfil === 'admin').forEach(m => idsCandidatos.add(m.id));
  _comentCandidatos = TEAM.filter(m => idsCandidatos.has(m.id));

  const inputEl = document.getElementById('comentario-texto');
  if (inputEl) inputEl.value = '';
  _cerrarMencionDropdown();

  const listaDiv = document.getElementById('comentarios-lista');
  if (!listaDiv) return;
  if (!API_BASE) { listaDiv.innerHTML = ''; return; }

  listaDiv.innerHTML = '<div style="padding:10px 0;color:var(--text-muted);font-size:12px">⏳ Cargando comentarios...</div>';
  try {
    const res = await fetch(`${API_BASE}/comentarios.php?tareaId=${tareaId}`);
    const data = await res.json();
    _renderListaComentarios(Array.isArray(data) ? data : []);
  } catch (e) {
    listaDiv.innerHTML = '<div style="padding:10px 0;color:#dc2626;font-size:12px">Error cargando comentarios.</div>';
  }
}

function _renderListaComentarios(comentarios) {
  const listaDiv = document.getElementById('comentarios-lista');
  if (!listaDiv) return;
  if (!comentarios.length) {
    listaDiv.innerHTML = '<div style="padding:10px 0;color:var(--text-muted);font-size:12px">Sin comentarios todavía.</div>';
    return;
  }
  const esAdmin = currentUser?.perfil === 'admin';
  listaDiv.innerHTML = comentarios.map(c => {
    const propio = currentUser && c.usuario_id === currentUser.id;
    const fecha = c.creado_en
      ? new Date(c.creado_en.replace(' ', 'T')).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    const textoHtml = _resaltarMenciones(esc(c.texto));
    return `<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div class="avatar" style="width:26px;height:26px;background:${c.color || '#94a3b8'};font-size:9px;flex-shrink:0">${esc(c.iniciales || '?')}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:700;color:var(--text)">${esc(c.nombre || c.usuario_id)}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--text-muted)">${esc(fecha)}</span>
            ${(propio || esAdmin) ? `<span onclick="eliminarComentario('${c.id}')" style="cursor:pointer;color:#dc2626;font-size:12px" title="Eliminar comentario">🗑️</span>` : ''}
          </div>
        </div>
        <div style="font-size:13px;color:var(--text);margin-top:2px;white-space:pre-wrap;word-break:break-word">${textoHtml}</div>
      </div>
    </div>`;
  }).join('');
  listaDiv.scrollTop = listaDiv.scrollHeight;
}

// Convierte cada "@ID" del texto (ya escapado) en una etiqueta resaltada
// con el nombre real de la persona, si ese id existe en el equipo.
function _resaltarMenciones(textoEsc) {
  return textoEsc.replace(/@([A-Za-z0-9]{2,10})\b/g, (match, id) => {
    const m = TEAM.find(x => x.id.toUpperCase() === id.toUpperCase());
    if (!m) return match;
    return `<span style="background:#D6F3F4;color:#0D3B40;border-radius:4px;padding:1px 5px;font-weight:600">@${esc(m.name)}</span>`;
  });
}

async function enviarComentario() {
  const inputEl = document.getElementById('comentario-texto');
  const texto = inputEl ? inputEl.value.trim() : '';
  if (!texto) return;
  if (!_comentTareaId || !currentUser) { alert('No se pudo identificar la tarjeta o el usuario.'); return; }

  const btn = document.getElementById('btn-enviar-comentario');
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const res = await fetch(`${API_BASE}/comentarios.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tareaId: _comentTareaId, usuarioId: currentUser.id, texto }),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    if (inputEl) inputEl.value = '';
    _cerrarMencionDropdown();
    await renderComentariosTarea(_comentTareaId);
  } catch (e) {
    alert('No se pudo enviar el comentario. Revisa la conexión.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

async function eliminarComentario(id) {
  if (!confirm('¿Eliminar este comentario?')) return;
  try {
    await fetch(`${API_BASE}/comentarios.php?id=${id}`, { method: 'DELETE' });
    await renderComentariosTarea(_comentTareaId);
  } catch (e) {
    alert('No se pudo eliminar el comentario.');
  }
}

// ----------------- Autocompletado @mención -----------------

function _onComentarioInput() {
  const el = document.getElementById('comentario-texto');
  if (!el) return;
  const cursor = el.selectionStart;
  const textoAntes = el.value.slice(0, cursor);
  const match = textoAntes.match(/@([A-Za-z0-9]{0,10})$/);
  if (!match) { _cerrarMencionDropdown(); return; }

  const filtro = match[1].toLowerCase();
  _comentMencionActiva = { inicio: cursor - match[0].length, fin: cursor };
  const candidatos = _comentCandidatos.filter(m =>
    m.name.toLowerCase().includes(filtro) || m.id.toLowerCase().includes(filtro)
  );
  _mostrarMencionDropdown(candidatos);
}

function _mostrarMencionDropdown(candidatos) {
  const drop = document.getElementById('comentario-mencion-dropdown');
  if (!drop) return;
  if (!candidatos.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = candidatos.map(m => `
    <div onclick="_insertarMencion('${m.id}')"
      style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer"
      onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
      <div class="avatar" style="width:20px;height:20px;background:${m.color};font-size:8px">${esc(m.initials)}</div>
      <span style="font-size:12px">${esc(m.name)}</span>
    </div>`).join('');
  drop.style.display = 'block';
}

function _cerrarMencionDropdown() {
  const drop = document.getElementById('comentario-mencion-dropdown');
  if (drop) { drop.style.display = 'none'; drop.innerHTML = ''; }
  _comentMencionActiva = null;
}

function _insertarMencion(id) {
  const el = document.getElementById('comentario-texto');
  if (!el || !_comentMencionActiva) return;
  const { inicio, fin } = _comentMencionActiva;
  const antes = el.value.slice(0, inicio);
  const despues = el.value.slice(fin);
  const inserto = `@${id} `;
  el.value = antes + inserto + despues;
  const nuevaPos = (antes + inserto).length;
  el.focus();
  el.setSelectionRange(nuevaPos, nuevaPos);
  _cerrarMencionDropdown();
}
