// ===================== MÓDULO PUSH NOTIFICATIONS =====================
// Registro del Service Worker y gestión de suscripción VAPID.

const PUSH_PUBLIC_KEY = 'BGDU_Dxm4ihX2hhrVN7fPydNnGRQU9o6PiSQYEORT-9fiAMr3XhwWMnxRPxy9OQaoZDRUnInU7CEJMJ5EljOFSA';

let _pushSW = null; // ServiceWorkerRegistration

// Llamar desde app.js después de que el usuario esté autenticado
async function iniciarPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return; // no compatible

  try {
    _pushSW = await navigator.serviceWorker.register('/ginno/sw.js', { scope: '/ginno/' });
    await navigator.serviceWorker.ready;

    const permiso = Notification.permission;
    if (permiso === 'granted') {
      await _pushSuscribir();
    } else if (permiso === 'default') {
      _mostrarBannerPush();
    } else if (permiso === 'denied') {
      _mostrarBannerDenegado();
    }
  } catch (e) {
    console.error('[Push] Error registrando SW:', e);
  }
}

// Suscribir al usuario a push y enviar la suscripción al backend
async function _pushSuscribir() {
  if (!_pushSW) return;
  try {
    let sub = await _pushSW.pushManager.getSubscription();
    if (!sub) {
      sub = await _pushSW.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(PUSH_PUBLIC_KEY),
      });
    }
    await _pushEnviarSuscripcion(sub);
    _pushOcultarBanner();
  } catch (e) {
    console.error('[Push] Error al suscribir:', e);
    _pushOcultarBanner();
  }
}

async function _pushEnviarSuscripcion(sub) {
  if (!currentUser?.id) return;
  const j = sub.toJSON();
  await fetch(`${API_BASE}/push_subscribe.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id : currentUser.id,
      endpoint: j.endpoint,
      p256dh  : j.keys.p256dh,
      auth    : j.keys.auth,
    }),
  });
}

async function pushDesactivar() {
  if (!_pushSW) return;
  const sub = await _pushSW.pushManager.getSubscription();
  if (!sub) return;
  await fetch(`${API_BASE}/push_subscribe.php`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
  _pushActualizarBoton();
}

// ─── Banner de activación ─────────────────────────────────────────────────────

function _mostrarBannerDenegado() {
  if (document.getElementById('push-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'push-banner';
  banner.style.cssText = `position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:700;
    background:var(--card-bg,#fff);border:1px solid #FCA5A5;border-radius:12px;
    padding:14px 18px;box-shadow:0 6px 28px rgba(0,0,0,.18);
    display:flex;align-items:center;gap:14px;max-width:420px;width:calc(100% - 32px)`;
  const esAndroid = /android/i.test(navigator.userAgent);
  const instruccion = esAndroid
    ? 'Toca los tres puntos (⋮) → Configuración del sitio → Notificaciones → Permitir'
    : 'Ve a Configuración de Safari → Ginno → Notificaciones → Permitir';
  banner.innerHTML = `
    <div style="font-size:24px">🔕</div>
    <div style="flex:1">
      <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:2px">Notificaciones bloqueadas</div>
      <div style="font-size:11px;color:var(--text-muted)">${instruccion}</div>
    </div>
    <button onclick="_pushOcultarBanner()"
      style="padding:5px 10px;border-radius:7px;border:1px solid var(--border);cursor:pointer;
             background:none;color:var(--text-muted);font-size:12px;white-space:nowrap">OK</button>`;
  document.body.appendChild(banner);
  setTimeout(_pushOcultarBanner, 12000); // auto-ocultar en 12s
}

function _mostrarBannerPush() {
  if (document.getElementById('push-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'push-banner';
  banner.style.cssText = `
    position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:700;
    background:var(--card-bg,#fff);border:1px solid var(--border);border-radius:12px;
    padding:14px 18px;box-shadow:0 6px 28px rgba(0,0,0,.18);
    display:flex;align-items:center;gap:14px;max-width:420px;width:calc(100% - 32px)
  `;
  banner.innerHTML = `
    <div style="font-size:24px">🔔</div>
    <div style="flex:1">
      <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:2px">Recibe recordatorios de visitas</div>
      <div style="font-size:12px;color:var(--text-muted)">Te avisamos ~1 hora antes aunque el navegador esté cerrado</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <button onclick="_pushSolicitarPermiso()"
        style="padding:7px 14px;border-radius:7px;border:none;cursor:pointer;
               background:#169BBC;color:#fff;font-weight:600;font-size:13px;white-space:nowrap">
        Activar
      </button>
      <button onclick="_pushOcultarBanner()"
        style="padding:5px 10px;border-radius:7px;border:1px solid var(--border);cursor:pointer;
               background:none;color:var(--text-muted);font-size:12px">
        Ahora no
      </button>
    </div>`;
  document.body.appendChild(banner);
}

async function _pushSolicitarPermiso() {
  const permiso = await Notification.requestPermission();
  if (permiso === 'granted') await _pushSuscribir();
  else _pushOcultarBanner();
}

function _pushOcultarBanner() {
  const b = document.getElementById('push-banner');
  if (b) b.remove();
}

// ─── Botón en el menú de configuración ───────────────────────────────────────

async function _pushActualizarBoton() {
  const btn = document.getElementById('btn-push-toggle');
  if (!btn || !('PushManager' in window)) return;
  const sub = _pushSW ? await _pushSW.pushManager.getSubscription() : null;
  const activo = !!sub && Notification.permission === 'granted';
  btn.textContent = activo ? '🔔 Notificaciones ON' : '🔕 Activar notificaciones';
  btn.onclick = activo ? pushDesactivar : _pushSolicitarPermiso;
}

// ─── Utilidad VAPID ──────────────────────────────────────────────────────────

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
