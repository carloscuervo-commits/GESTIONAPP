<?php
/**
 * telegram_webhook.php — Fase 2 de la integración con Telegram: interacciones
 * (botones), no solo avisos de salida.
 *
 * Telegram llama a esta URL automáticamente cada vez que alguien toca un botón
 * o escribe un comando, una vez que el webhook queda registrado (ver DEPLOY.md
 * para el paso manual de registro, una sola vez).
 *
 * Seguridad: Telegram reenvía el header X-Telegram-Bot-Api-Secret-Token con el
 * valor que se le indicó al registrar el webhook. Se compara contra
 * configuracion.telegram_webhook_secret — si no coincide, no se procesa nada.
 * Sin este chequeo, cualquiera podría llamar esta URL y hacerse pasar por Telegram.
 *
 * IMPORTANTE: siempre responder rápido y sin error visible — Telegram reintenta
 * si no recibe 200, y no debe llegarle nunca un mensaje de error de PHP.
 */
define('CRON_RUN', true);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php'; // configGet
require_once __DIR__ . '/../lib/telegram.php';

@ini_set('display_errors', '0');
error_reporting(0);
http_response_code(200);

try {
  $pdo = getDB();

  $secretoEsperado = configGet($pdo, 'telegram_webhook_secret');
  $secretoRecibido = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
  if (!$secretoEsperado || !hash_equals($secretoEsperado, $secretoRecibido)) {
    exit; // no viene de Telegram (o falta configurar el secreto) — ignorar
  }

  $update = json_decode(file_get_contents('php://input'), true);
  if (!$update) exit;

  // ── Botones tocados (callback_query) ────────────────────────────
  if (!empty($update['callback_query'])) {
    $cq        = $update['callback_query'];
    $data      = $cq['data'] ?? '';
    $chatId    = $cq['message']['chat']['id']    ?? null;
    $messageId = $cq['message']['message_id']    ?? null;
    $cqId      = $cq['id']                       ?? null;

    // "👍 Recibido" en el aviso de nueva tarea asignada
    if (strpos($data, 'ack_tarea:') === 0 && $chatId && $messageId) {
      $tareaId = substr($data, strlen('ack_tarea:'));

      // Verificar que quien tocó el botón es un técnico realmente asignado a
      // esa tarea (evita que un chat_id ajeno confirme tareas de otros).
      $stmt = $pdo->prepare("
        SELECT u.id, u.nombre
        FROM tarea_equipo te
        JOIN usuarios u ON u.id COLLATE utf8mb4_general_ci = te.usuario_id COLLATE utf8mb4_general_ci
        WHERE te.tarea_id = ? AND u.telegram_chat_id = ?
        LIMIT 1
      ");
      $stmt->execute([$tareaId, (string)$chatId]);
      $tecnico = $stmt->fetch();

      if ($tecnico) {
        $textoOriginal = $cq['message']['text'] ?? '';
        $hora = (new DateTimeImmutable('now', new DateTimeZone('America/Bogota')))->format('d/m/Y H:i');
        $textoNuevo = $textoOriginal . "\n\n✅ <b>Recibido</b> por "
                    . htmlspecialchars($tecnico['nombre'], ENT_QUOTES, 'UTF-8') . " — {$hora}";
        telegramEditarTexto((string)$chatId, (int)$messageId, $textoNuevo, []); // [] = quita los botones
        if ($cqId) telegramResponderCallback($cqId, '✅ ¡Recibido!');
      } elseif ($cqId) {
        telegramResponderCallback($cqId, '⚠️ No pude confirmar la tarea.', true);
      }
    }
  }

} catch (Throwable $e) {
  // Silencioso: Telegram no debe ver errores; ya se respondió 200 arriba.
}
