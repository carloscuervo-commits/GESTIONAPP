<?php
/**
 * Cron: avisos_tiempo.php
 * Maneja dos tipos de aviso basados en la hora de la tarea:
 *   - aviso_30min_antes:    envía 30 min antes de la hora programada (si el técnico no ha hecho check-in)
 *   - aviso_10min_sin_checkin: envía 10 min después de la hora si no ha hecho check-in
 *
 * Ejecutar cada 10 minutos: 0,10,20,30,40,50 * * * *
 * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/avisos_tiempo.php > /dev/null 2>&1
 *
 * Ventana de detección: ±5 min del momento objetivo para absorber variación del cron scheduler.
 */
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php';
require_once __DIR__ . '/../lib/telegram.php';

$pdo = getDB();

// Hora actual en Colombia (UTC-5)
$ahora        = new DateTimeImmutable('now', new DateTimeZone('America/Bogota'));
$hoy          = $ahora->format('Y-m-d');
$ahoraMinutos = (int)$ahora->format('H') * 60 + (int)$ahora->format('i');

// ── Helper: convertir "HH:MM" a minutos ──────────────────────
function toMinutos(string $hora): int {
  [$h, $m] = explode(':', $hora);
  return (int)$h * 60 + (int)$m;
}

// ── Obtener tareas IT/IF programadas para hoy en estado programado ─
$stmt = $pdo->prepare("
  SELECT t.id, t.titulo, t.cliente, t.descripcion,
         t.fecha_programacion, t.hora_programacion, t.dias_programacion, t.modalidad
  FROM tareas t
  WHERE t.estado = 'programado'
    AND t.area IN ('it', 'if')
    AND t.fecha_programacion = ?
    AND t.hora_programacion IS NOT NULL
  ORDER BY t.hora_programacion ASC
");
$stmt->execute([$hoy]);
$tareas = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($tareas)) {
  exit(0);
}

$aviso30    = configGet($pdo, 'aviso_30min_antes')        === '1';
$aviso10    = configGet($pdo, 'aviso_10min_sin_checkin')   === '1';
$aviso30Tg  = configGet($pdo, 'aviso_30min_antes_tg')      === '1';
$aviso10Tg  = configGet($pdo, 'aviso_10min_sin_checkin_tg') === '1';

if (!$aviso30 && !$aviso10 && !$aviso30Tg && !$aviso10Tg) {
  exit(0);
}

foreach ($tareas as $tarea) {
  $horaProg = $tarea['hora_programacion'];
  if (!$horaProg) continue;
  $minProg = toMinutos($horaProg);

  // Técnicos del equipo de esta tarea (con email y/o telegram_chat_id)
  $stmtTec = $pdo->prepare("
    SELECT u.id, u.nombre, u.email, u.telegram_chat_id
    FROM tarea_equipo te
    JOIN usuarios u ON u.id COLLATE utf8mb4_general_ci = te.usuario_id COLLATE utf8mb4_general_ci
    WHERE te.tarea_id = ?
  ");
  $stmtTec->execute([$tarea['id']]);
  $tecnicos = $stmtTec->fetchAll(PDO::FETCH_ASSOC);
  if (empty($tecnicos)) continue;

  foreach ($tecnicos as $tec) {
    // Verificar si el técnico ya hizo check-in hoy en esta tarea
    $stmtCI = $pdo->prepare("
      SELECT 1 FROM visita_participantes vp
      JOIN reportes r ON r.id = vp.reporte_id
      WHERE r.tarea_id = ?
        AND vp.tecnico_id = ?
        AND vp.check_in IS NOT NULL
        AND DATE(vp.check_in) = ?
      LIMIT 1
    ");
    $stmtCI->execute([$tarea['id'], $tec['id'], $hoy]);
    $hizoCkIn = (bool)$stmtCI->fetchColumn();

    // ─── 30 min antes ─────────────────────────────────────────
    if (($aviso30 || $aviso30Tg) && !$hizoCkIn) {
      // Objetivo: horaProg - 30 min; ventana: ±5 min
      $objetivo30 = $minProg - 30;
      if (abs($ahoraMinutos - $objetivo30) <= 5) {
        $horaFmt = date('g:i a', mktime((int)explode(':', $horaProg)[0], (int)explode(':', $horaProg)[1]));

        if ($aviso30 && !empty($tec['email']) && !avisoYaEnviado($pdo, '30min_antes', $tec['id'], $tarea['id'], $hoy)) {
          $cuerpo = htmlAvisoTecnico(
            $tec['nombre'],
            "en 30 minutos tienes una tarea programada ({$horaFmt}).",
            htmlTareaInfo($tarea)
          );
          $ok = enviarAvisoTecnico(
            $tec['email'],
            $tec['nombre'],
            '⏰ Recordatorio — tarea en 30 minutos — ' . ($tarea['cliente'] ?? $tarea['titulo']),
            $cuerpo
          );
          if ($ok) registrarAvisoEnviado($pdo, '30min_antes', $tec['id'], $tarea['id'], $hoy);
        }

        if ($aviso30Tg && !empty($tec['telegram_chat_id']) && !avisoYaEnviado($pdo, '30min_antes_tg', $tec['id'], $tarea['id'], $hoy)) {
          $msg = "⏰ <b>Recordatorio — tarea en 30 minutos</b>\n\n"
               . "Hola <b>" . htmlspecialchars($tec['nombre'], ENT_QUOTES, 'UTF-8') . "</b>, "
               . "en 30 minutos tienes una tarea programada ({$horaFmt}).\n\n"
               . telegramTareaInfo($tarea) . "\n\n"
               . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
          $okTg = sendTelegramMsg($tec['telegram_chat_id'], $msg);
          if ($okTg) registrarAvisoEnviado($pdo, '30min_antes_tg', $tec['id'], $tarea['id'], $hoy);
        }
      }
    }

    // ─── 10 min sin check-in ──────────────────────────────────
    if (($aviso10 || $aviso10Tg) && !$hizoCkIn) {
      // Objetivo: horaProg + 10 min; ventana: ±5 min
      $objetivo10 = $minProg + 10;
      if (abs($ahoraMinutos - $objetivo10) <= 5) {
        $horaFmt = date('g:i a', mktime((int)explode(':', $horaProg)[0], (int)explode(':', $horaProg)[1]));

        if ($aviso10 && !empty($tec['email']) && !avisoYaEnviado($pdo, '10min_sin_checkin', $tec['id'], $tarea['id'], $hoy)) {
          $cuerpo = htmlAvisoTecnico(
            $tec['nombre'],
            "la hora programada ({$horaFmt}) ya pasó y aún no hemos registrado tu check-in. Por favor ingresa a la app y registra tu llegada.",
            htmlTareaInfo($tarea)
          );
          $ok = enviarAvisoTecnico(
            $tec['email'],
            $tec['nombre'],
            '⚠️ Sin check-in — ' . ($tarea['cliente'] ?? $tarea['titulo']),
            $cuerpo
          );
          if ($ok) registrarAvisoEnviado($pdo, '10min_sin_checkin', $tec['id'], $tarea['id'], $hoy);
        }

        if ($aviso10Tg && !empty($tec['telegram_chat_id']) && !avisoYaEnviado($pdo, '10min_sin_checkin_tg', $tec['id'], $tarea['id'], $hoy)) {
          $msg = "⚠️ <b>Sin check-in</b>\n\n"
               . "Hola <b>" . htmlspecialchars($tec['nombre'], ENT_QUOTES, 'UTF-8') . "</b>, "
               . "la hora programada ({$horaFmt}) ya pasó y aún no hemos registrado tu check-in. Por favor ingresa a la app y registra tu llegada.\n\n"
               . telegramTareaInfo($tarea) . "\n\n"
               . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
          $okTg = sendTelegramMsg($tec['telegram_chat_id'], $msg);
          if ($okTg) registrarAvisoEnviado($pdo, '10min_sin_checkin_tg', $tec['id'], $tarea['id'], $hoy);
        }
      }
    }
  }
}

exit(0);
