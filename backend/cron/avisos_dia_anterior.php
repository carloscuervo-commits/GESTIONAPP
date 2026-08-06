<?php
/**
 * Cron: avisos_dia_anterior.php
 * Envía a cada técnico un resumen de sus tareas programadas para mañana.
 * Ejecutar a las 5pm (hora Colombia): 0 17 * * *
 * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/avisos_dia_anterior.php > /dev/null 2>&1
 */
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php';
require_once __DIR__ . '/../lib/telegram.php';

$pdo = getDB();

// Verificar que al menos un canal esté activado
$avisoCorreo = configGet($pdo, 'aviso_dia_anterior')    === '1';
$avisoTg     = configGet($pdo, 'aviso_dia_anterior_tg') === '1';
if (!$avisoCorreo && !$avisoTg) {
  exit(0);
}

// Calcular fecha de mañana
$manana = date('Y-m-d', strtotime('+1 day'));

// Obtener todas las tareas IT/IF programadas para mañana en estado programado
$stmt = $pdo->prepare("
  SELECT t.id, t.titulo, t.cliente, t.descripcion,
         t.fecha_programacion, t.hora_programacion, t.dias_programacion, t.modalidad
  FROM tareas t
  WHERE t.estado = 'programado'
    AND t.area IN ('it', 'if')
    AND t.fecha_programacion = ?
  ORDER BY t.hora_programacion ASC
");
$stmt->execute([$manana]);
$tareas = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($tareas)) {
  exit(0);
}

// Agrupar por técnico
$tareasPorTecnico = []; // tecnico_id => [ { tarea_info, nombre_tec, email_tec, telegram_chat_id } ]

foreach ($tareas as $tarea) {
  $stmtTec = $pdo->prepare("
    SELECT u.id, u.nombre, u.email, u.telegram_chat_id
    FROM tarea_equipo te
    JOIN usuarios u ON u.id COLLATE utf8mb4_general_ci = te.usuario_id COLLATE utf8mb4_general_ci
    WHERE te.tarea_id = ?
  ");
  $stmtTec->execute([$tarea['id']]);
  $tecnicos = $stmtTec->fetchAll(PDO::FETCH_ASSOC);

  foreach ($tecnicos as $tec) {
    if (!isset($tareasPorTecnico[$tec['id']])) {
      $tareasPorTecnico[$tec['id']] = [
        'nombre'           => $tec['nombre'],
        'email'            => $tec['email'],
        'telegram_chat_id' => $tec['telegram_chat_id'],
        'tareas'           => [],
      ];
    }
    $tareasPorTecnico[$tec['id']]['tareas'][] = $tarea;
  }
}

// Enviar un aviso por técnico (correo y/o Telegram, según config y datos disponibles)
$fechaMananaFmt = date('d/m/Y', strtotime($manana));
foreach ($tareasPorTecnico as $tecnicoId => $info) {
  $n = count($info['tareas']);

  // ── Correo ──────────────────────────────────────────────────
  if ($avisoCorreo && !empty($info['email']) && !avisoYaEnviado($pdo, 'dia_anterior', $tecnicoId, 'multiple', $manana)) {
    $bloquesTareas = '';
    foreach ($info['tareas'] as $i => $tarea) {
      $sep = $i > 0 ? '<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0">' : '';
      $bloquesTareas .= $sep . htmlTareaInfo($tarea);
    }
    $intro = "mañana (<b>{$fechaMananaFmt}</b>) tienes " . ($n === 1 ? '1 tarea programada.' : "{$n} tareas programadas.");
    $cuerpo = htmlAvisoTecnico($info['nombre'], $intro, $bloquesTareas);

    $ok = enviarAvisoTecnico(
      $info['email'],
      $info['nombre'],
      "📅 Tus tareas de mañana {$fechaMananaFmt}",
      $cuerpo
    );
    if ($ok) {
      registrarAvisoEnviado($pdo, 'dia_anterior', $tecnicoId, 'multiple', $manana);
    }
  }

  // ── Telegram ────────────────────────────────────────────────
  if ($avisoTg && !empty($info['telegram_chat_id']) && !avisoYaEnviado($pdo, 'dia_anterior_tg', $tecnicoId, 'multiple', $manana)) {
    $bloquesTg = [];
    foreach ($info['tareas'] as $tarea) {
      $bloquesTg[] = telegramTareaInfo($tarea);
    }
    $msg = "🌙 <b>Tus tareas de mañana {$fechaMananaFmt}</b>\n\n"
         . "Hola <b>" . htmlspecialchars($info['nombre'], ENT_QUOTES, 'UTF-8') . "</b>, "
         . "mañana tienes " . ($n === 1 ? '1 tarea programada' : "{$n} tareas programadas") . ":\n\n"
         . implode("\n\n➖➖➖➖➖\n\n", $bloquesTg) . "\n\n"
         . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
    $okTg = sendTelegramMsg($info['telegram_chat_id'], $msg);
    if ($okTg) {
      registrarAvisoEnviado($pdo, 'dia_anterior_tg', $tecnicoId, 'multiple', $manana);
    }
  }
}

exit(0);
