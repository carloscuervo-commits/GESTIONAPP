<?php
/**
 * telegram.php — Helpers para envío de mensajes vía Telegram Bot API.
 *
 * Requiere que config.php defina:
 *   define('TELEGRAM_BOT_TOKEN', 'TOKEN_DEL_BOT');
 *
 * Si la constante no está definida o está vacía, las funciones retornan
 * false sin lanzar excepciones (el flujo principal nunca se interrumpe).
 */

/**
 * Envía un mensaje de texto a un chat de Telegram.
 * Soporta parse_mode HTML (<b>, <i>, <code>, etc.).
 * Timeout de 5 s para no bloquear la respuesta HTTP al cliente.
 *
 * @param  string $chatId  ID numérico del chat (telegram_chat_id del usuario)
 * @param  string $texto   Texto del mensaje (puede incluir HTML básico)
 * @return bool            true si Telegram respondió sin error de cURL
 */
function sendTelegramMsg(string $chatId, string $texto): bool {
  if (!defined('TELEGRAM_BOT_TOKEN') || !TELEGRAM_BOT_TOKEN) return false;
  $url  = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage';
  $body = json_encode([
    'chat_id'    => $chatId,
    'text'       => $texto,
    'parse_mode' => 'HTML',
  ]);
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $body,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 5,
  ]);
  $result = curl_exec($ch);
  curl_close($ch);
  return $result !== false;
}

/**
 * Retorna [{id, nombre, telegram_chat_id}] de los técnicos del equipo
 * de una tarea que tienen telegram_chat_id configurado.
 * Aplica COLLATE utf8mb4_general_ci para respetar la regla del proyecto.
 */
function tecnicosConTelegram(PDO $pdo, string $tareaId): array {
  $stmt = $pdo->prepare("
    SELECT u.id, u.nombre, u.telegram_chat_id
    FROM tarea_equipo te
    JOIN usuarios u
      ON u.id COLLATE utf8mb4_general_ci = te.usuario_id COLLATE utf8mb4_general_ci
    WHERE te.tarea_id = ?
      AND u.telegram_chat_id IS NOT NULL
      AND u.telegram_chat_id != ''
  ");
  $stmt->execute([$tareaId]);
  return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Retorna [{id, nombre, telegram_chat_id}] de los administradores activos
 * que tienen telegram_chat_id configurado. Usado para avisos que van al
 * equipo administrativo (retraso, fuera de sitio, horas de contrato, etc.)
 * en vez de a un técnico puntual.
 */
function adminsConTelegram(PDO $pdo): array {
  $stmt = $pdo->query("
    SELECT id, nombre, telegram_chat_id
    FROM usuarios
    WHERE perfil = 'admin'
      AND activo = 1
      AND telegram_chat_id IS NOT NULL
      AND telegram_chat_id != ''
  ");
  return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Formatea los datos de una tarea como texto HTML para Telegram.
 * $tarea puede tener: titulo, cliente, descripcion,
 *   fecha_programacion, hora_programacion, dias_programacion, modalidad.
 */
function telegramTareaInfo(array $tarea): string {
  $cliente   = htmlspecialchars($tarea['cliente']            ?? '—', ENT_QUOTES, 'UTF-8');
  $titulo    = htmlspecialchars($tarea['titulo']             ?? '—', ENT_QUOTES, 'UTF-8');
  $desc      = htmlspecialchars($tarea['descripcion']        ?? '', ENT_QUOTES, 'UTF-8');
  $fecha     = $tarea['fecha_programacion']                  ?? null;
  $hora      = $tarea['hora_programacion']                   ?? null;
  $dias      = (int)($tarea['dias_programacion']             ?? 1);
  $modalidad = $tarea['modalidad']                           ?? null;

  $fechaStr = $fecha ? date('d/m/Y', strtotime($fecha)) : '—';
  if ($dias > 1) $fechaStr .= " ({$dias} días)";
  $horaStr  = $hora ?? '—';
  $modStr   = $modalidad === 'en_sitio' ? '📍 En sitio'
            : ($modalidad === 'remoto'  ? '💻 Remoto' : '—');

  $lineas = "👤 <b>Cliente:</b> {$cliente}\n"
          . "📋 <b>Tarea:</b> {$titulo}\n"
          . "📅 <b>Fecha:</b> {$fechaStr}\n"
          . "🕗 <b>Hora:</b> {$horaStr}\n"
          . "🗺 <b>Modalidad:</b> {$modStr}";

  if ($desc) {
    $lineas .= "\n📝 <b>Descripción:</b> " . mb_strimwidth($desc, 0, 200, '…');
  }

  return $lineas;
}
