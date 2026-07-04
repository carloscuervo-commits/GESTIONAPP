// ===================== AUTENTICACIÓN (login por PIN + perfiles) =====================
// Login ligero pensado para celular: el técnico elige su nombre y escribe
// un PIN de 4 dígitos. La sesión queda guardada en el dispositivo
// (localStorage) para no pedir el PIN cada vez que se abre la app.
// currentUser.perfil ('admin' | 'tecnico') controla qué ve cada uno
// (ver aplicarPermisosUI) y se usa también para identificar quién hace
// check-in/check-out de una visita, sin tener que preguntarlo cada vez.

let currentUser = null;
let _loginUsuarios = [];
let _loginUsuarioSeleccionado = null;
let _loginPin = '';

// --------------- Sesión ---------------
async function cargarSesion() {
  const token = localStorage.getItem('sesion_token');
  if (!token || !API_BASE) { await mostrarLogin(); return false; }

  try {
    const res = await fetch(`${API_BASE}/auth.php?action=verificar&token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (data.error || !data.usuario) {
      localStorage.removeItem('sesion_token');
      localStorage.removeItem('sesion_usuario_cache');
      await mostrarLogin();
      return false;
    }
    currentUser = data.usuario;
    localStorage.setItem('sesion_usuario_cache', JSON.stringify(currentUser));
    return true;
  } catch (e) {
    console.error('No se pudo verificar la sesión (sin conexión?)', e);
    // Sin conexión: si ya había un usuario guardado en este dispositivo, seguir en modo offline
    const cache = localStorage.getItem('sesion_usuario_cache');
    if (cache) { try { currentUser = JSON.parse(cache); return true; } catch (e2) {} }
    await mostrarLogin();
    return false;
  }
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
  const token = localStorage.getItem('sesion_token');
  if (token && API_BASE) {
    fetch(`${API_BASE}/auth.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout', token }),
    }).catch(() => {});
  }
  localStorage.removeItem('sesion_token');
  localStorage.removeItem('sesion_usuario_cache');
  location.reload();
}

// --------------- Pantalla de login ---------------
async function mostrarLogin() {
  document.getElementById('login-step-pin').style.display = 'none';
  document.getElementById('login-step-usuario').style.display = 'block';
  document.getElementById('login-overlay').classList.add('open');

  if (!API_BASE) {
    document.getElementById('login-usuarios-grid').innerHTML =
      '<div style="color:var(--text-muted);font-size:13px;grid-column:1/-1">Esta función requiere conexión al servidor.</div>';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth.php?action=usuarios`);
    _loginUsuarios = await res.json();
  } catch (e) { _loginUsuarios = []; }

  document.getElementById('login-usuarios-grid').innerHTML = (Array.isArray(_loginUsuarios) ? _loginUsuarios : []).map(u => `
    <button type="button" onclick="seleccionarUsuarioLogin('${u.id}','${esc(u.nombre)}')"
      style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px;border:1px solid var(--border);border-radius:10px;background:var(--card);cursor:pointer">
      <span style="width:40px;height:40px;border-radius:99px;background:${u.color||'#94a3b8'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${esc(u.iniciales||'')}</span>
      <span style="font-size:11px;color:var(--text);text-align:center">${esc((u.nombre||'').split(' ')[0])}</span>
    </button>
  `).join('');
}

function ocultarLogin() {
  document.getElementById('login-overlay').classList.remove('open');
}

function seleccionarUsuarioLogin(id, nombre) {
  _loginUsuarioSeleccionado = id;
  _loginPin = '';
  document.getElementById('login-step-usuario').style.display = 'none';
  document.getElementById('login-step-pin').style.display = 'block';
  document.getElementById('login-pin-nombre').textContent = nombre;
  document.getElementById('login-pin-error').textContent = '';
  renderPinDots();
  renderPinPad();
}

function volverSelectorUsuarioLogin() {
  _loginUsuarioSeleccionado = null;
  _loginPin = '';
  document.getElementById('login-step-pin').style.display = 'none';
  document.getElementById('login-step-usuario').style.display = 'block';
}

function renderPinDots() {
  const cont = document.getElementById('login-pin-dots');
  if (!cont) return;
  cont.innerHTML = [0, 1, 2, 3].map(i =>
    `<span style="width:14px;height:14px;border-radius:99px;border:2px solid var(--primary);background:${i < _loginPin.length ? 'var(--primary)' : 'transparent'}"></span>`
  ).join('');
}

function renderPinPad() {
  const cont = document.getElementById('login-pin-pad');
  if (!cont) return;
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  cont.innerHTML = teclas.map(k => {
    if (k === '') return '<div></div>';
    const accion = k === '⌫' ? 'pinBorrar()' : `pinDigito('${k}')`;
    return `<button type="button" onclick="${accion}" style="padding:14px 0;font-size:18px;border:1px solid var(--border);border-radius:10px;background:var(--card);cursor:pointer">${k}</button>`;
  }).join('');
}

function pinDigito(d) {
  if (_loginPin.length >= 4) return;
  _loginPin += d;
  renderPinDots();
  if (_loginPin.length === 4) intentarLogin();
}

function pinBorrar() {
  _loginPin = _loginPin.slice(0, -1);
  document.getElementById('login-pin-error').textContent = '';
  renderPinDots();
}

async function intentarLogin() {
  try {
    const res = await fetch(`${API_BASE}/auth.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: _loginUsuarioSeleccionado, pin: _loginPin }),
    });
    const data = await res.json();
    if (data.error) {
      document.getElementById('login-pin-error').textContent = data.error;
      _loginPin = '';
      renderPinDots();
      return;
    }
    localStorage.setItem('sesion_token', data.token);
    localStorage.setItem('sesion_usuario_cache', JSON.stringify(data.usuario));
    currentUser = data.usuario;
    ocultarLogin();
    await iniciarApp();
  } catch (e) {
    console.error(e);
    document.getElementById('login-pin-error').textContent = 'No se pudo conectar con el servidor.';
    _loginPin = '';
    renderPinDots();
  }
}

// --------------- Permisos por perfil ---------------
function aplicarPermisosUI() {
  if (!currentUser) return;
  const esTecnico = currentUser.perfil === 'tecnico';

  document.querySelectorAll('.area-tab').forEach(tab => {
    const area = tab.dataset.area;
    tab.style.display = (!esTecnico || ['it', 'if'].includes(area)) ? '' : 'none';
  });

  const btnDash = document.getElementById('btn-dashboard');
  if (btnDash) btnDash.style.display = esTecnico ? 'none' : '';

  if (esTecnico && !['it', 'if'].includes(currentArea)) currentArea = 'it';

  // Tabs solo visibles para administradores
  const tabClientes = document.getElementById('tab-clientes');
  if (tabClientes) tabClientes.style.display = esTecnico ? 'none' : '';
  const tabTransportes = document.getElementById('tab-transportes');
  if (tabTransportes) tabTransportes.style.display = esTecnico ? 'none' : '';
  const tabBitacora = document.getElementById('tab-bitacora');
  if (tabBitacora) tabBitacora.style.display = esTecnico ? 'none' : '';
  // Botón ⚙️ solo visible para administradores (reemplaza tabs de Usuarios y Configuración)
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.style.display = esTecnico ? 'none' : '';

  const badge = document.getElementById('user-badge');
  if (badge) badge.textContent = `${currentUser.nombre.split(' ')[0]} · ${esTecnico ? 'Técnico' : 'Admin'}`;

  // Alerta de déficit en bitácora (solo admin)
  if (!esTecnico && typeof bitacoraCheckDashboard === 'function') {
    bitacoraCheckDashboard();
  }
}
// ===================== FIN AUTENTICACIÓN =====================
