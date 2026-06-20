<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

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

  $stmt = $pdo->prepare("SELECT id, nombre, iniciales, color, perfil, pin_hash FROM usuarios WHERE id = ? AND activo = 1");
  $stmt->execute([$usuarioId]);
  $u = $stmt->fetch();
  if (!$u || !$u['pin_hash']) {
    jsonOut(['error' => 'Este usuario no tiene PIN configurado. Pide al administrador que lo active.'], 401);
  }

  $hashIngresado = hash('sha256', $usuarioId . ':' . $pin);
  if (!hash_equals($u['pin_hash'], $hashIngresado)) {
    jsonOut(['error' => 'PIN incorrecto'], 401);
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
