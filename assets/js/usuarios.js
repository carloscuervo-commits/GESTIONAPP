// ===================== MÓDULO DE USUARIOS (solo admin) =====================

let _usuariosData   = [];
let _editandoUsuarioId = null;

const COLORES_USUARIO = [
  '#7c3aed','#0891b2','#059669','#d97706','#dc2626','#db2777',
  '#4f46e5','#0284c7','#16a34a','#ca8a04','#b91c1c','#9333ea',
  '#94a3b8','#0f766e','#1d4ed8','#c2410c','#854d0e','#166534',
];

// ---- Vista principal ----

async function renderUsuariosView() {
  const cont = document.getElementById('usuarios-view');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">Cargando usuarios...</div>';

  try {
    const token = localStorage.getItem('sesion_token') || '';
    const res = await fetch(`${API_BASE}/usuarios.php`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    _usuariosData = await res.json();
    if (!Array.isArray(_usuariosData)) throw new Error('Respuesta inesperada');
  } catch (e) {
    cont.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">No se pudo cargar la lista de usuarios.</div>';
    return;
  }

  const activos  = _usuariosData.filter(u => u.activo == 1);
  const inactivos = _usuariosData.filter(u => u.activo == 0);

  function tarjetaUsuario(u) {
    const tienePin = u.tiene_pin == 1;
    return `
      <div onclick="abrirModalUsuario('${u.id}')" style="
          display:flex;align-items:center;gap:14px;padding:14px 16px;
          background:var(--card);border:1px solid var(--border);
          border-radius:var(--radius);cursor:pointer;
          transition:box-shadow .15s,transform .1s;
          opacity:${u.activo ? '1' : '0.55'}"
        onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.1)';this.style.transform='translateY(-1px)'"
        onmouseout="this.style.boxShadow='';this.style.transform=''">
        <div style="width:42px;height:42px;border-radius:99px;background:${u.color||'#94a3b8'};color:#fff;
                    display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">
          ${esc(u.iniciales)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${esc(u.nombre)}${u.activo ? '' : ' <span style="font-size:11px;color:#94a3b8">(inactivo)</span>'}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
            <span style="font-weight:600;color:${u.perfil==='admin'?'#6366f1':'#059669'}">
              ${u.perfil==='admin' ? 'Administrador' : 'Técnico'}
            </span>
            ${u.rol ? ` · ${esc(u.rol)}` : ''}
            ${u.email ? ` · ${esc(u.email)}` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;font-size:11px">
          ${tienePin
            ? '<span style="color:#059669;font-weight:600">🔑 PIN activo</span>'
            : '<span style="color:#ef4444;font-weight:600">⚠️ Sin PIN</span>'}
          <div style="color:var(--text-muted);margin-top:2px">${esc(u.id)}</div>
        </div>
      </div>`;
  }

  cont.innerHTML = `
    <div style="max-width:780px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
        <div style="font-weight:700;font-size:16px">👥 Usuarios del equipo</div>
        <button class="btn-save" onclick="abrirModalUsuario(null)">+ Nuevo usuario</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${activos.map(tarjetaUsuario).join('')}
        ${inactivos.length ? `
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-top:10px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px">
            Inactivos (${inactivos.length})
          </div>
          ${inactivos.map(tarjetaUsuario).join('')}
        ` : ''}
      </div>
    </div>`;
}

// ---- Modal ----

function abrirModalUsuario(id) {
  _editandoUsuarioId = id;
  const u      = id ? _usuariosData.find(x => x.id === id) : null;
  const esNuevo = !id;

  document.getElementById('um-titulo').textContent = esNuevo ? 'Nuevo usuario' : 'Editar usuario';

  const idInput = document.getElementById('um-id');
  idInput.value    = u?.id || '';
  idInput.readOnly = !esNuevo;
  idInput.style.background = esNuevo ? '' : 'var(--bg)';

  document.getElementById('um-nombre').value    = u?.nombre   || '';
  document.getElementById('um-iniciales').value = u?.iniciales || '';
  document.getElementById('um-email').value     = u?.email     || '';
  document.getElementById('um-rol').value       = u?.rol       || '';
  document.getElementById('um-perfil').value    = u?.perfil    || 'tecnico';
  document.getElementById('um-activo').checked  = u ? u.activo == 1 : true;
  document.getElementById('um-pin').value         = '';
  document.getElementById('um-pin-confirm').value = '';

  // Cargar horario si el usuario ya existe
  _bitCargarHorarioModal(id);

  const tienePin = u?.tiene_pin == 1;
  document.getElementById('um-pin-status').innerHTML = tienePin
    ? '🔑 Este usuario ya tiene un PIN. Para cambiarlo escribe uno nuevo abajo (deja en blanco para no cambiarlo).'
    : '⚠️ Sin PIN — el usuario no podrá iniciar sesión hasta que se le asigne uno.';
  document.getElementById('um-pin-status').style.color = tienePin ? '#059669' : '#b45309';

  document.getElementById('um-grp-activo').style.display = esNuevo ? 'none' : 'flex';

  _renderColorPicker(u?.color || '#7c3aed');

  document.getElementById('usuarios-modal').classList.add('open');
  setTimeout(() => document.getElementById(esNuevo ? 'um-id' : 'um-nombre').focus(), 60);
}

function cerrarModalUsuario() {
  document.getElementById('usuarios-modal').classList.remove('open');
  _editandoUsuarioId = null;
}

function _renderColorPicker(colorSeleccionado) {
  const cont = document.getElementById('um-color-picker');
  cont.innerHTML = COLORES_USUARIO.map(c => `
    <div onclick="seleccionarColorUsuario('${c}')" title="${c}" style="
        width:30px;height:30px;border-radius:99px;background:${c};cursor:pointer;
        border:3px solid ${c === colorSeleccionado ? '#1e293b' : 'transparent'};
        box-shadow:${c === colorSeleccionado ? '0 0 0 1px #1e293b' : 'none'};
        box-sizing:border-box;transition:transform .1s,border .1s"
      onmouseover="this.style.transform='scale(1.2)'"
      onmouseout="this.style.transform=''">
    </div>
  `).join('') + `
    <label title="Color personalizado" style="
        display:flex;align-items:center;justify-content:center;
        width:30px;height:30px;border-radius:99px;border:2px dashed var(--border);
        cursor:pointer;font-size:16px;color:var(--text-muted);position:relative">
      +
      <input type="color" id="um-color-custom" value="${colorSeleccionado}"
        onchange="seleccionarColorUsuario(this.value)"
        style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer">
    </label>`;
  document.getElementById('um-color-val').value = colorSeleccionado;

  // Preview del avatar
  _actualizarAvatarPreview();
}

function seleccionarColorUsuario(color) {
  document.getElementById('um-color-val').value = color;
  _renderColorPicker(color);
}

function _actualizarAvatarPreview() {
  const color     = document.getElementById('um-color-val').value || '#94a3b8';
  const iniciales = document.getElementById('um-iniciales').value.trim().toUpperCase() || '??';
  const prev = document.getElementById('um-avatar-preview');
  if (prev) {
    prev.style.background = color;
    prev.textContent      = iniciales.slice(0, 3);
  }
}

async function guardarUsuario() {
  const esNuevo = !_editandoUsuarioId;
  const id = esNuevo
    ? document.getElementById('um-id').value.trim().toUpperCase()
    : _editandoUsuarioId;

  const nombre    = document.getElementById('um-nombre').value.trim();
  const iniciales = document.getElementById('um-iniciales').value.trim().toUpperCase();
  const email     = document.getElementById('um-email').value.trim();
  const rol       = document.getElementById('um-rol').value.trim();
  const perfil    = document.getElementById('um-perfil').value;
  const color     = document.getElementById('um-color-val').value || '#94a3b8';
  const activo    = document.getElementById('um-activo').checked ? 1 : 0;
  const pin       = document.getElementById('um-pin').value;
  const pinConf   = document.getElementById('um-pin-confirm').value;

  // Validaciones
  if (!id)       { alert('El ID del usuario es obligatorio'); return; }
  if (!nombre)   { alert('El nombre es obligatorio'); return; }
  if (!iniciales){ alert('Las iniciales son obligatorias'); return; }
  if (pin) {
    if (!/^\d{4}$/.test(pin)) { alert('El PIN debe ser exactamente 4 dígitos'); return; }
    if (pin !== pinConf)      { alert('Los PINs no coinciden'); return; }
  }

  const payload = { nombre, iniciales, email: email || null, rol: rol || null, perfil, color };
  if (!esNuevo) payload.activo = activo;
  if (esNuevo)  payload.id = id;
  if (pin)      payload.pin = pin;

  const token = localStorage.getItem('sesion_token') || '';
  const url    = esNuevo ? `${API_BASE}/usuarios.php` : `${API_BASE}/usuarios.php?id=${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, {
      method:  esNuevo ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }

    // Guardar horario si hay configuración
    if (_editandoUsuarioId || esNuevo) {
      await _umGuardarHorario(id);
    }
    cerrarModalUsuario();
    await renderUsuariosView(); // refresh list
    await loadTeam();           // refresh TEAM global para avatars/pickers
    updateFilters();            // refresh filtro de responsable
  } catch (e) {
    console.error(e);
    alert('No se pudo guardar. Revisa la conexión.');
  }
}

// ─── Horario semanal en modal de usuario ─────────────────────────────────────

let _umHorario = {};  // estado temporal mientras el modal está abierto

async function _bitCargarHorarioModal(uid) {
  const cont = document.getElementById('um-horario-cont');
  if (!cont) return;
  _umHorario = {};

  if (!uid) {
    _bitRenderHorarioModal();
    return;
  }

  try {
    const res  = await fetch(`${API_BASE}/horario.php?usuario_id=${encodeURIComponent(uid)}`);
    const data = await res.json();
    if (data && !data.error) {
      _umHorario = {
        lun: data.h_lun, mar: data.h_mar, mie: data.h_mie,
        jue: data.h_jue, vie: data.h_vie, sab: data.h_sab, dom: data.h_dom,
        vigente_desde: data.horario_desde,
      };
    }
  } catch (_) {}
  _bitRenderHorarioModal();
}

function _bitRenderHorarioModal() {
  const cont = document.getElementById('um-horario-cont');
  if (!cont) return;

  const dias = [
    { key:'lun', label:'Lun' }, { key:'mar', label:'Mar' },
    { key:'mie', label:'Mié' }, { key:'jue', label:'Jue' },
    { key:'vie', label:'Vie' }, { key:'sab', label:'Sáb' },
    { key:'dom', label:'Dom' },
  ];

  const checkboxes = dias.map(d => {
    const tiene = _umHorario[d.key] !== null && _umHorario[d.key] !== undefined;
    const horas = tiene ? _umHorario[d.key] : '';
    return `
      <div style="display:flex;align-items:center;gap:6px;min-width:130px">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;font-weight:600;width:38px">
          <input type="checkbox" id="umh-chk-${d.key}" ${tiene ? 'checked' : ''}
                 onchange="_umToggleDia('${d.key}')" style="cursor:pointer">
          ${d.label}
        </label>
        <input type="number" id="umh-h-${d.key}"
               value="${tiene ? horas : ''}"
               min="0.5" max="24" step="0.5"
               placeholder="0"
               ${tiene ? '' : 'disabled'}
               style="width:58px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;
                      font-size:13px;background:${tiene ? 'var(--card)' : 'var(--bg)'}">
        <span style="font-size:11px;color:var(--text-muted)">h</span>
      </div>`;
  }).join('');

  const vigente = _umHorario.vigente_desde || new Date().toISOString().split('T')[0];

  cont.innerHTML = `
    <div style="font-weight:600;font-size:13px;color:var(--text-muted);margin-bottom:10px">
      ⏱️ Horario contratado (marcar días y horas por día)
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      ${checkboxes}
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <label style="font-size:12px;color:var(--text-muted);white-space:nowrap">Vigente desde:</label>
      <input type="date" id="umh-vigente" value="${vigente}"
             style="font-size:13px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card)">
    </div>`;
}

function _umToggleDia(key) {
  const chk = document.getElementById(`umh-chk-${key}`);
  const inp = document.getElementById(`umh-h-${key}`);
  if (!chk || !inp) return;
  inp.disabled   = !chk.checked;
  inp.style.background = chk.checked ? 'var(--card)' : 'var(--bg)';
  if (!chk.checked) inp.value = '';
}

async function _umGuardarHorario(uid) {
  // Guardia: solo guardar si el uid corresponde al usuario que está en el modal
  if (!uid || uid !== _editandoUsuarioId) return;
  const dias = ['lun','mar','mie','jue','vie','sab','dom'];
  const payload = { vigente_desde: document.getElementById('umh-vigente')?.value || new Date().toISOString().split('T')[0] };
  dias.forEach(d => {
    const chk = document.getElementById(`umh-chk-${d}`);
    const inp = document.getElementById(`umh-h-${d}`);
    if (chk && chk.checked && inp && inp.value !== '') {
      payload[d] = parseFloat(inp.value);
    } else {
      payload[d] = null;
    }
  });

  // Solo guardar si al menos un día está configurado o si hay horario previo
  const tieneDias = dias.some(d => payload[d] !== null);
  if (!tieneDias) return;  // Sin horario configurado, no guardar

  try {
    const res  = await fetch(`${API_BASE}/horario.php?usuario_id=${encodeURIComponent(uid)}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  } catch (e) {
    console.error('[Horario] Error guardando:', e);
  }
}

// Cierre con clic en backdrop
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('usuarios-modal');
  if (overlay) overlay.addEventListener('click', e => {
    if (e.target === overlay) cerrarModalUsuario();
  });
});
// ===================== FIN MÓDULO USUARIOS =====================
