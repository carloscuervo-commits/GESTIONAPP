<?php
/**
 * Cron: avisos_dia_anterior.php
 * Envía a cada técnico un resumen de sus tareas programadas para mañana.
 * Ejecutar a las 5pm (hora Colombia): 0 17 * * *
 * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/avisos_dia_anterior.php > /dev/null 2>&1
 */
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php';

$pdo = getDB();

// Verificar que el aviso esté activado
if (configGet($pdo, 'aviso_dia_anterior') !== '1') {
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
$tareasPorTecnico = []; // tecnico_id => [ { tarea_info, nombre_tec, email_tec } ]

foreach ($tareas as $tarea) {
  $stmtTec = $pdo->prepare("
    SELECT u.id, u.nombre, u.email
    FROM tarea_equipo te
    JOIN usuarios u ON u.id COLLATE utf8mb4_general_ci = te.usuario_id COLLATE utf8mb4_general_ci
    WHERE te.tarea_id = ?
      AND u.email IS NOT NULL
      AND u.email != ''
  ");
  $stmtTec->execute([$tarea['id']]);
  $tecnicos = $stmtTec->fetchAll(PDO::FETCH_ASSOC);

  foreach ($tecnicos as $tec) {
    if (!isset($tareasPorTecnico[$tec['id']])) {
      $tareasPorTecnico[$tec['id']] = [
        'nombre' => $tec['nombre'],
        'email'  => $tec['email'],
        'tareas' => [],
      ];
    }
    $tareasPorTecnico[$tec['id']]['tareas'][] = $tarea;
  }
}

// Enviar un correo por técnico
$fechaMananaFmt = date('d/m/Y', strtotime($manana));
foreach ($tareasPorTecnico as $tecnicoId => $info) {
  // Evitar envío duplicado (si el cron corre dos veces en el mismo día)
  if (avisoYaEnviado($pdo, 'dia_anterior', $tecnicoId, 'multiple', $manana)) {
    continue;
  }

  // Construir lista de tareas en HTML
  $bloquesTareas = '';
  foreach ($info['tareas'] as $i => $tarea) {
    $sep = $i > 0 ? '<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0">' : '';
    $bloquesTareas .= $sep . htmlTareaInfo($tarea);
  }

  $n = count($info['tareas']);
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

exit(0);
