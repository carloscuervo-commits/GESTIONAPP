<?php
/**
 * Diagnóstico del recordatorio de visita.
 * Solo accesible con ?token=ginno_test (no exponer en producción).
 * Usar: /ginno/backend/api/test_recordatorio.php?token=ginno_test&fecha=2026-07-11
 */
if (($_GET['token'] ?? '') !== 'ginno_test') { http_response_code(403); exit('Forbidden'); }

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/mailer.php';

header('Content-Type: text/plain; charset=utf-8');

$pdo    = getDB();
// Fecha a consultar: parámetro ?fecha= o mañana por defecto
$fecha  = $_GET['fecha'] ?? date('Y-m-d', strtotime('+1 day'));
echo "=== Diagnóstico recordatorio_visita_email ===\n";
echo "Fecha buscada: $fecha\n\n";

// 1. Tareas que cumplen condiciones
$stmt = $pdo->prepare("
  SELECT t.id, t.titulo, t.estado, t.avisar_cliente,
         t.fecha_programacion, t.hora_programacion, t.area,
         t.cliente AS cliente_nombre,
         c.email AS cliente_email
  FROM tareas t
  LEFT JOIN clientes c ON c.nombre COLLATE utf8mb4_general_ci = t.cliente COLLATE utf8mb4_general_ci
  WHERE t.area IN ('it','if')
    AND t.fecha_programacion = ?
  ORDER BY t.fecha_programacion
");
$stmt->execute([$fecha]);
$tareas = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Tareas IT/IF en esa fecha: " . count($tareas) . "\n";
foreach ($tareas as $t) {
  echo "\n--- Tarea: {$t['titulo']} ({$t['id']}) ---\n";
  echo "  estado:        {$t['estado']}\n";
  echo "  avisar_cliente:{$t['avisar_cliente']}\n";
  echo "  cliente:       {$t['cliente_nombre']}\n";
  echo "  email cliente: " . ($t['cliente_email'] ?? '(no encontrado en tabla clientes)') . "\n";

  // Técnicos
  $stmtT = $pdo->prepare("SELECT u.nombre, u.email FROM usuarios u JOIN tarea_equipo te ON te.usuario_id = u.id WHERE te.tarea_id = ?");
  $stmtT->execute([$t['id']]);
  $tecs = $stmtT->fetchAll(PDO::FETCH_ASSOC);
  echo "  tecnicos:      " . (empty($tecs) ? '(ninguno)' : implode(', ', array_column($tecs, 'nombre'))) . "\n";

  // Evaluar si pasaría el filtro
  $pass = $t['avisar_cliente'] == 1
       && !in_array($t['estado'], ['archivado','cancelado'])
       && !empty($t['cliente_email'])
       && !empty($tecs);
  echo "  ¿Enviaría correo?: " . ($pass ? "SÍ" : "NO") . "\n";

  // Si se pasa ?enviar=1, intenta enviar de verdad
  if ($pass && ($_GET['enviar'] ?? '') === '1') {
    $ok = enviarCorreoConAdjunto(
      [$t['cliente_email']],
      "[TEST] Recordatorio visita — {$t['titulo']}",
      "<p>Prueba de envío para tarea <b>{$t['titulo']}</b>, cliente <b>{$t['cliente_nombre']}</b>.</p>"
    );
    echo "  Resultado envío: " . ($ok ? "✅ OK" : "❌ FALLÓ") . "\n";
  }
}

if (empty($tareas)) {
  echo "\n(Sin tareas IT/IF para esa fecha)\n";
}

echo "\n=== Fin diagnóstico ===\n";
