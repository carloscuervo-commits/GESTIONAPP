<?php
/**
 * recalcular_bitacora.php — Script de corrección histórica (una sola vez)
 *
 * Recalcula horas_real en TODAS las filas de bitacora_usuario restando
 * las pausas completadas de visita_pausas.
 *
 * Ejecutar desde terminal cPanel:
 *   /usr/bin/php /home/innovate/public_html/ginno/backend/cron/recalcular_bitacora.php
 *
 * - Preserva nota y admin_id cuando el técnico sigue en déficit (deficit_con_nota).
 * - Si tenía nota pero ahora cubre las horas → pasa a 'ok' y borra la nota.
 * - Salida por stdout para ver el progreso en terminal.
 */

require_once __DIR__ . '/../lib/db.php';
ini_set('display_errors', '1');
error_reporting(E_ALL);

$pdo = getDB();

// 1. Obtener todas las filas de bitacora_usuario
$filas = $pdo->query(
  "SELECT bu.id, bu.tecnico_id, bu.fecha, bu.horas_esp, bu.estado, bu.nota, bu.admin_id,
          u.nombre
   FROM bitacora_usuario bu
   JOIN usuarios u ON u.id COLLATE utf8mb4_general_ci = bu.tecnico_id COLLATE utf8mb4_general_ci
   ORDER BY bu.fecha ASC, u.nombre ASC"
)->fetchAll(PDO::FETCH_ASSOC);

echo "Filas a procesar: " . count($filas) . "\n\n";

$ok = 0; $cambiados = 0; $errores = 0;

foreach ($filas as $fila) {
  $tecId    = $fila['tecnico_id'];
  $fecha    = $fila['fecha'];
  $horasEsp = (float)$fila['horas_esp'];
  $nombre   = $fila['nombre'];

  try {
    // Sumar horas reales de visitas restando pausas
    $stmt = $pdo->prepare(
      "SELECT COALESCE(SUM(
         TIMESTAMPDIFF(MINUTE, vp.check_in, vp.check_out)
         - COALESCE((
             SELECT SUM(TIMESTAMPDIFF(MINUTE, p.pausa_inicio, p.pausa_fin))
             FROM visita_pausas p
             WHERE p.participante_id COLLATE utf8mb4_general_ci = vp.id COLLATE utf8mb4_general_ci
               AND p.pausa_fin IS NOT NULL
           ), 0)
       ), 0) AS minutos
       FROM visita_participantes vp
       WHERE vp.tecnico_id = ?
         AND DATE(vp.check_in) = ?
         AND vp.check_out IS NOT NULL"
    );
    $stmt->execute([$tecId, $fecha]);
    $minutos   = (float)$stmt->fetchColumn();
    $horasReal = round($minutos / 60, 2);

    // Determinar nuevo estado
    $esDeficit = $horasReal < $horasEsp - 0.05;

    if (!$esDeficit) {
      // Cubre horas → ok, sin nota
      $nuevoEstado = 'ok';
      $nuevaNota   = null;
      $nuevoAdmin  = null;
    } elseif ($fila['estado'] === 'deficit_con_nota' && $fila['nota']) {
      // Sigue en déficit y ya tenía justificación → conservar nota
      $nuevoEstado = 'deficit_con_nota';
      $nuevaNota   = $fila['nota'];
      $nuevoAdmin  = $fila['admin_id'];
    } else {
      // Déficit sin nota
      $nuevoEstado = 'deficit_sin_nota';
      $nuevaNota   = null;
      $nuevoAdmin  = null;
    }

    // Actualizar fila
    $pdo->prepare(
      "UPDATE bitacora_usuario
       SET horas_real = ?, estado = ?, nota = ?, admin_id = ?, updated_at = NOW()
       WHERE id = ?"
    )->execute([$horasReal, $nuevoEstado, $nuevaNota, $nuevoAdmin, $fila['id']]);

    $diferencia = round($horasReal - (float)str_replace(',','.', $fila['horas_esp'] ?? 0), 2);
    $cambio     = $fila['estado'] !== $nuevoEstado ? " [{$fila['estado']} → {$nuevoEstado}]" : '';

    echo "  {$nombre} · {$fecha}: {$horasReal}h / {$horasEsp}h{$cambio}\n";

    $cambiados++;
  } catch (Throwable $e) {
    echo "  ERROR {$nombre} · {$fecha}: " . $e->getMessage() . "\n";
    $errores++;
  }
}

echo "\n";
echo "Procesados: {$cambiados} · Errores: {$errores}\n";
echo "Listo.\n";
