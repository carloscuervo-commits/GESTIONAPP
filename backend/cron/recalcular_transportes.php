<?php
/**
 * recalcular_transportes.php — Script de corrección histórica (una sola vez)
 *
 * Problema: transportes.participante_id era INT, visita_participantes.id es VARCHAR(32).
 * El cast (int)"mq9j..." = 0 causó que:
 *   1. Solo un registro entrara en transportes (UNIQUE KEY en participante_id=0).
 *   2. El UPDATE WHERE id=0 marcara TODOS los participantes como 'registrado'.
 *
 * Este script:
 *   - Recorre todas las visitas con check_in registrado.
 *   - Si la tarea es IT/IF en sitio y el cliente tiene valor_transporte > 0:
 *       crea el registro en transportes y marca 'registrado'.
 *   - Si la tarea no califica: marca 'no_aplica'.
 *   - Si no hay check_in aún: deja NULL (pendiente futuro).
 *
 * Ejecutar desde terminal cPanel:
 *   /usr/bin/php /home/innovate/public_html/ginno/backend/cron/recalcular_transportes.php
 *
 * IMPORTANTE: ejecutar DESPUÉS de la migración 022 (que limpió transportes).
 */

require_once __DIR__ . '/../lib/db.php';
ini_set('display_errors', '1');
error_reporting(E_ALL);

$pdo = getDB();

// ─── 1. Todas las visitas con check_in, joinando tarea y cliente ──────────────
$visitas = $pdo->query("
  SELECT
    vp.id              AS participante_id,
    vp.tecnico_id,
    vp.check_in,
    vp.check_out,
    vp.transporte_estado,
    t.id               AS tarea_id,
    t.titulo           AS tarea_titulo,
    t.cliente,
    t.area,
    t.modalidad,
    c.valor_transporte
  FROM visita_participantes vp
  JOIN reportes r   ON r.id    COLLATE utf8mb4_general_ci = vp.reporte_id COLLATE utf8mb4_general_ci
  JOIN tareas   t   ON t.id    COLLATE utf8mb4_general_ci = r.tarea_id    COLLATE utf8mb4_general_ci
  LEFT JOIN clientes c ON c.nombre COLLATE utf8mb4_general_ci = t.cliente COLLATE utf8mb4_general_ci
  WHERE vp.check_in IS NOT NULL
  ORDER BY vp.check_in ASC
")->fetchAll(PDO::FETCH_ASSOC);

echo "Visitas a procesar: " . count($visitas) . "\n\n";

$creados   = 0;
$noAplica  = 0;
$errores   = 0;

// Rastrear técnico+fecha que ya tienen transporte asignado en este recálculo
$diasConTransporte = []; // "tecnico_id|fecha" => true

foreach ($visitas as $v) {
  $particId = $v['participante_id'];
  $tecId    = $v['tecnico_id'];
  $tarea    = $v['tarea_titulo'] ?? $v['tarea_id'];
  $fecha    = substr($v['check_in'], 0, 10);

  // ── Determinar si califica para transporte ───────────────────────────────
  $esAreaTransporte = in_array(strtolower($v['area'] ?? ''), ['it', 'if']);
  $esSitio          = ($v['modalidad'] ?? '') === 'en_sitio';
  $valor            = (int)($v['valor_transporte'] ?? 0);
  $califica         = $esAreaTransporte && $esSitio && $valor > 0;

  if (!$califica) {
    // Marcar como no aplica (independiente del estado anterior)
    $pdo->prepare("UPDATE visita_participantes SET transporte_estado = 'no_aplica' WHERE id = ?")
        ->execute([$particId]);
    $noAplica++;
    $razon = !$esAreaTransporte ? "área {$v['area']}" : (!$esSitio ? 'remoto' : 'sin valor_transporte');
    echo "  NO APLICA  · {$tecId} · {$fecha} · {$tarea} ({$razon})\n";
    continue;
  }

  // ── Calcular trayectos ───────────────────────────────────────────────────────
  $key       = $tecId . '|' . $fecha;
  $trayectos = isset($diasConTransporte[$key]) ? 0 : 2;

  // ── Crear registro de transporte ─────────────────────────────────────────
  try {
    $id = bin2hex(random_bytes(16));
    $pdo->prepare("
      INSERT INTO transportes
        (id, tarea_id, participante_id, tecnico_id, cliente, tarea_titulo,
         fecha, check_in, check_out, valor, trayectos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
      $id,
      $v['tarea_id'],
      $particId,
      $tecId,
      $v['cliente']      ?? '',
      $v['tarea_titulo'] ?? '',
      $fecha,
      $v['check_in'],
      $v['check_out'],
      $valor,
      $trayectos,
    ]);

    $pdo->prepare("UPDATE visita_participantes SET transporte_estado = 'registrado' WHERE id = ?")
        ->execute([$particId]);

    $diasConTransporte[$key] = true;
    $creados++;
    $sufijo = $trayectos === 0 ? '(0 trayectos - ya cubierto ese día)' : "(${trayectos} trayectos · \${$valor} c/u)";
    echo "  CREADO     · {$tecId} · {$fecha} · {$tarea} · {$sufijo}\n";

  } catch (\PDOException $e) {
    if ($e->getCode() === '23000') {
      // Ya existe — solo asegurar el estado
      $pdo->prepare("UPDATE visita_participantes SET transporte_estado = 'registrado' WHERE id = ?")
          ->execute([$particId]);
      echo "  YA EXISTE  · {$tecId} · {$fecha} · {$tarea}\n";
    } else {
      echo "  ERROR      · {$tecId} · {$fecha} · {$tarea}: " . $e->getMessage() . "\n";
      $errores++;
    }
  }
}

echo "\n";
echo "Creados: {$creados} · No aplica: {$noAplica} · Errores: {$errores}\n";
echo "Listo.\n";
