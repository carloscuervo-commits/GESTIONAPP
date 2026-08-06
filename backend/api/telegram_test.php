<?php
/**
 * telegram_test.php — Diagnóstico de la integración Telegram.
 * USO: GET ?token=ADMIN_TOKEN&usuario_id=CAC
 * Solo accesible con token de admin. Eliminar o restringir en producción.
 */
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/telegram.php';
applyCors();

// --- Autenticación mínima: requiere token de admin ---
$auth  = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = '';
if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) $token = trim($m[1]);
if (!$token) jsonOut(['error' => 'Se requiere Authorization: Bearer TOKEN'], 401);

$pdo = getDB();
$stmt = $pdo->prepare("SELECT perfil FROM usuarios WHERE token_sesion = ? AND activo = 1");
$stmt->execute([$token]);
$u = $stmt->fetch();
if (!$u || $u['perfil'] !== 'admin') jsonOut(['error' => 'Se requiere perfil admin'], 403);

// --- Diagnóstico ---
$resultado = [];

// 1. Token definido
$tokenDefinido = defined('TELEGRAM_BOT_TOKEN') && TELEGRAM_BOT_TOKEN !== '';
$resultado['token_definido'] = $tokenDefinido;
if ($tokenDefinido) {
  $tok = TELEGRAM_BOT_TOKEN;
  $resultado['token_preview'] = substr($tok, 0, 10) . '...' . substr($tok, -4);
}

// 2. Usuario y su chat_id
$usuarioId = trim($_GET['usuario_id'] ?? '');
if ($usuarioId) {
  $sU = $pdo->prepare("SELECT id, nombre, telegram_chat_id FROM usuarios WHERE id = ?");
  $sU->execute([$usuarioId]);
  $uRow = $sU->fetch();
  $resultado['usuario'] = $uRow
    ? ['id' => $uRow['id'], 'nombre' => $uRow['nombre'], 'telegram_chat_id' => $uRow['telegram_chat_id']]
    : 'No encontrado';
}

// 3. Envío de mensaje de prueba (si hay chat_id)
$chatId = $_GET['chat_id'] ?? ($uRow['telegram_chat_id'] ?? '');
if ($chatId && $tokenDefinido) {
  $url  = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage';
  $body = json_encode([
    'chat_id'    => $chatId,
    'text'       => '✅ <b>Prueba de conexión Ginno</b>\n\nSi ves este mensaje, la integración funciona correctamente.',
    'parse_mode' => 'HTML',
  ]);
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $body,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
  ]);
  $raw  = curl_exec($ch);
  $err  = curl_error($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  $resultado['telegram_http_code'] = $code;
  $resultado['curl_error']         = $err ?: null;
  $resultado['telegram_response']  = $raw ? json_decode($raw, true) : null;
} elseif (!$chatId) {
  $resultado['envio'] = 'Omitido — no hay chat_id (pasa ?chat_id=NUMERO o ?usuario_id=ID)';
} else {
  $resultado['envio'] = 'Omitido — TELEGRAM_BOT_TOKEN no definido';
}

jsonOut($resultado);
