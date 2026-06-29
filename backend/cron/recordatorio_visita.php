<?php
/**
 * recordatorio_visita.php — Cron job de recordatorios push
 *
 * Ejecutar cada 15 min en cPanel:
 *   php /home/innovate/public_html/ginno/backend/cron/recordatorio_visita.php
 *
 * Busca tareas con fecha_prog = hoy y hora_prog entre (ahora+45min) y (ahora+75min)
 * y envía push a todos los técnicos asignados que tengan suscripción activa.
 */

define('GINNO_CRON', true);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/webpush.php';
require_once __DIR__ . '/../config/push_config.php'; // PUSH_VAPID_PUBLIC, PUSH_VAPID_PRIVATE, PUSH_SUBJECT

$pdo = getDB();

// Ventana: tareas que empiezan entre 45 y 75 minutos desde ahora
$now   = new DateTimeImmutable('now', new DateTimeZone('America/Bogota'));
$desde = $now->modify('+45 minutes')->format('H:i');
$hasta = $now->modify('+75 minutes')->format('H:i');
$hoy   = $now->format('Y-m-d');

$stmt = $pdo->prepare("
    SELECT id, titulo, cliente, area, hora_programacion, team
    FROM tareas
    WHERE fecha_programacion = ?
      AND hora_programacion  >= ?
      AND hora_programacion  <= ?
      AND estado NOT IN ('archivado','facturado')
");
$stmt->execute([$hoy, $desde, $hasta]);
$tareas = $stmt->fetchAll();

if (!$tareas) {
    echo "[" . date('Y-m-d H:i:s') . "] Sin visitas próximas en la ventana {$desde}–{$hasta}.\n";
    exit;
}

foreach ($tareas as $t) {
    $team = json_decode($t['team'] ?? '[]', true);
    if (empty($team)) continue;

    $area  = strtoupper($t['area'] ?? '');
    $hora  = $t['hora_programacion'] ?? '';
    $title = "📅 Visita en ~1 hora";
    $body  = ($t['cliente'] ? $t['cliente'] . ' · ' : '') . $t['titulo'];
    if ($hora) $body .= " ({$hora})";

    $payload = json_encode([
        'title' => $title,
        'body'  => $body,
        'tag'   => 'visita-' . $t['id'],
        'url'   => '/ginno/tareas-equipo.html',
    ]);

    // Suscripciones de los técnicos asignados a esta tarea
    $placeholders = implode(',', array_fill(0, count($team), '?'));
    $subs = $pdo->prepare("
        SELECT endpoint, p256dh, auth, user_id
        FROM push_subscriptions
        WHERE user_id IN ($placeholders)
    ");
    $subs->execute($team);

    foreach ($subs->fetchAll() as $sub) {
        $code = webpush_send(
            ['endpoint' => $sub['endpoint'], 'p256dh' => $sub['p256dh'], 'auth' => $sub['auth']],
            $payload,
            PUSH_VAPID_PUBLIC,
            PUSH_VAPID_PRIVATE,
            PUSH_SUBJECT
        );

        // 410 Gone = suscripción expirada → borrar
        if ($code === 410) {
            $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")->execute([$sub['endpoint']]);
            echo "[" . date('H:i:s') . "] Suscripción eliminada (410) user {$sub['user_id']}\n";
        } else {
            echo "[" . date('H:i:s') . "] Push enviado a user {$sub['user_id']} para tarea {$t['id']} → HTTP {$code}\n";
        }
    }
}
