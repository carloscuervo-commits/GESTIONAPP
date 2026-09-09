<?php
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/mailer.php';
require_once __DIR__ . '/../lib/telegram.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// Protección contra fuerza bruta del PIN (5 intentos fallidos seguidos =
// bloqueo de 15 minutos, ver db/039_pin_bloqueo_intentos.sql). Avisa a los
// administradores por correo y Telegram cuando un usuario queda bloqueado.
function _avisarBloqueoUsuario(PDO $pdo, string $nombreUsuario): void {
  $nombreEsc = htmlspecialchars($nombreUsuario, ENT_QUOTES, 'UTF-8');
  $asunto = "🔒 Cuenta bloqueada por PIN incorrecto — {$nombreUsuario}";
  $cuerpo = "
  <div style='font-family:Arial,sans-serif;max-width:520px;color:#1e293b'>
    <div style='background:#dc2626;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0'>
      <h2 style='margin:0;font-size:18px'>🔒 Bloqueo de seguridad en Ginno</h2>
    </div>
    <div style='background:#fef2f2;border:1px solid #fecaca;padding:16px 20px;border-radius:0 0 8px 8px'>
      <p style='margin:0 0 8px'>El usuario <strong>{$nombreEsc}</strong> quedó bloqueado temporalmente (15 minutos) después de 5 intentos seguidos de PIN incorrecto.</p>
      <p style='margin:0;color:#64748b;font-size:13px'>Si el usuario no fue quien intentó entrar, alguien más está probando adivinar su PIN.</p>
    </div>
  </div>";
  try { enviarCorreoConAdjunto([CORREO_ADMIN_FIJO], $asunto, $cuerpo); } catch (Throwable $e) { /* silencioso */ }

  try {
    $msg = "🔒 <b>Cuenta bloqueada en Ginno</b>\n\n"
         . "👤 Usuario: {$nombreEsc}\n"
         . "⏱ Bloqueado 15 minutos tras 5 intentos de PIN incorrecto.";
    foreach (adminsConTelegram($pdo) as $adm) {
      sendTelegramMsg($adm['telegram_chat_id'], $msg);
    }
  } catch (Throwable $e) { /* silencioso */ }
}

// --------------------------------------------------------------
// GET /auth.php?action=usuarios
// Lista pública de usuarios activos (sin pin_hash) para mostrar
// el selector de "¿quién eres?" en la pantalla de login.
// --------------------------------------------------------------
if ($method === 'GET' && ($_GET['action'] ?? '') === 'usuarios') {
  $stmt = $pdo->query("SELECT id, nombre, iniciales, color FROM usuarios WHERE activo = 1 ORDER BY nombre");
  jsonOut($stmt->fetchAll());
}

// --------------------------------------------------------------
// GET /auth.php?action=verificar&token=XXXX
// Valida un token de sesión guardado en el dispositivo.
// --------------------------------------------------------------
if ($method === 'GET' && ($_GET['action'] ?? '') === 'verificar') {
  $token = $_GET['token'] ?? '';
  if (!$token) jsonOut(['error' => 'token requerido'], 400);

  $stmt = $pdo->prepare("SELECT id, nombre, iniciales, color, perfil FROM usuarios WHERE token_sesion = ? AND activo = 1");
  $stmt->execute([$token]);
  $u = $stmt->fetch();
  if (!$u) jsonOut(['error' => 'Sesión inválida'], 401);

  jsonOut(['usuario' => $u]);
}

// --------------------------------------------------------------
// POST /auth.php  { action: 'logout', token }
// POST /auth.php  { usuarioId, pin }  -> inicia sesión
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();

  if (($d['action'] ?? '') === 'logout') {
    $token = $d['token'] ?? '';
    if ($token) $pdo->prepare("UPDATE usuarios SET token_sesion = NULL WHERE token_sesion = ?")->execute([$token]);
    jsonOut(['ok' => true]);
  }

  $usuarioId = $d['usuarioId'] ?? null;
  $pin = $d['pin'] ?? null;
  if (!$usuarioId || !$pin) jsonOut(['error' => 'usuarioId y pin son requeridos'], 400);

  $stmt = $pdo->prepare("SELECT id, nombre, iniciales, color, perfil, pin_hash, pin_intentos_fallidos, pin_bloqueado_hasta FROM usuarios WHERE id = ? AND activo = 1");
  $stmt->execute([$usuarioId]);
  $u = $stmt->fetch();
  if (!$u || !$u['pin_hash']) {
    jsonOut(['error' => 'Este usuario no tiene PIN configurado. Pide al administrador que lo active.'], 401);
  }

  // Bloqueo temporal por demasiados intentos fallidos seguidos
  if (!empty($u['pin_bloqueado_hasta']) && strtotime($u['pin_bloqueado_hasta']) > time()) {
    $minutosRestantes = max(1, (int)ceil((strtotime($u['pin_bloqueado_hasta']) - time()) / 60));
    $plural = $minutosRestantes === 1 ? '' : 's';
    jsonOut(['error' => "Cuenta bloqueada temporalmente por varios PIN incorrectos. Intenta de nuevo en {$minutosRestantes} minuto{$plural}."], 429);
  }

  $hashIngresado = hash('sha256', $usuarioId . ':' . $pin);
  if (!hash_equals($u['pin_hash'], $hashIngresado)) {
    $intentos = (int)$u['pin_intentos_fallidos'] + 1;
    if ($intentos >= 5) {
      $pdo->prepare("UPDATE usuarios SET pin_intentos_fallidos = 0, pin_bloqueado_hasta = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?")
        ->execute([$usuarioId]);
      _avisarBloqueoUsuario($pdo, $u['nombre']);
      jsonOut(['error' => 'Demasiados intentos fallidos. Cuenta bloqueada 15 minutos por seguridad.'], 429);
    }
    $pdo->prepare("UPDATE usuarios SET pin_intentos_fallidos = ? WHERE id = ?")->execute([$intentos, $usuarioId]);
    jsonOut(['error' => 'PIN incorrecto'], 401);
  }

  // PIN correcto: limpiar contador/bloqueo si tenía intentos fallidos previos
  if ((int)$u['pin_intentos_fallidos'] > 0 || $u['pin_bloqueado_hasta'] !== null) {
    $pdo->prepare("UPDATE usuarios SET pin_intentos_fallidos = 0, pin_bloqueado_hasta = NULL WHERE id = ?")->execute([$usuarioId]);
  }

  $token = bin2hex(random_bytes(24));
  $pdo->prepare("UPDATE usuarios SET token_sesion = ?, token_creado_en = NOW() WHERE id = ?")
    ->execute([$token, $usuarioId]);

  jsonOut([
    'token' => $token,
    'usuario' => [
      'id' => $u['id'], 'nombre' => $u['nombre'], 'iniciales' => $u['iniciales'],
      'color' => $u['color'], 'perfil' => $u['perfil'],
    ],
  ]);
}

jsonOut(['error' => 'Método no soportado'], 405);
