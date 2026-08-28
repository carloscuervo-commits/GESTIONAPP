<?php
/**
 * proyecto_visitas.php — Visitas programadas puntuales para tarjetas tipo
 * Proyecto: qué técnico(s) deben estar en el proyecto un día específico y a
 * qué hora. No toca `tareas.team` ni `hora_programacion` (la "hora de
 * alarma" del proyecto sigue siendo un dato administrativo aparte).
 *
 * GET    /proyecto_visitas.php?fecha=YYYY-MM-DD[&tarea_id=ID]
 *          -> lista [{id, tareaId, fecha, tecnicoId, hora}, ...]
 *             (incluye filas con tecnico_id='NINGUNO' = "ya se preguntó,
 *             quedó sin asignar a propósito")
 * POST   /proyecto_visitas.php
 *          body: { tareaId, fecha, visitas: [{tecnicoId, hora}, ...] }
 *          Reemplaza TODAS las filas de ese tarea_id+fecha por las nuevas.
 *          Si visitas viene vacío, guarda el marcador 'NINGUNO' (para no
 *          volver a preguntar esa misma fecha).
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

function _visitaRow(array $row): array {
  return [
    'id'        => (int) $row['id'],
    'tareaId'   => $row['tarea_id'],
    'fecha'     => $row['fecha'],
    'tecnicoId' => $row['tecnico_id'],
    'hora'      => $row['hora'] ? substr($row['hora'], 0, 5) : null,
  ];
}

if ($method === 'GET') {
  $fecha = $_GET['fecha'] ?? null;
  if (!$fecha) jsonOut(['error' => 'fecha requerida'], 400);

  $where = ['fecha = ?'];
  $params = [$fecha];
  if (!empty($_GET['tarea_id'])) { $where[] = 'tarea_id = ?'; $params[] = $_GET['tarea_id']; }

  $stmt = $pdo->prepare("SELECT * FROM proyecto_visitas_programadas WHERE " . implode(' AND ', $where) . " ORDER BY hora ASC");
  $stmt->execute($params);
  jsonOut(array_map('_visitaRow', $stmt->fetchAll()));
}

if ($method === 'POST') {
  $d = jsonInput();
  $tareaId = $d['tareaId'] ?? null;
  $fecha = $d['fecha'] ?? null;
  $visitas = $d['visitas'] ?? [];
  if (!$tareaId || !$fecha) jsonOut(['error' => 'Faltan datos: se requiere tareaId y fecha'], 400);
  if (!is_array($visitas)) $visitas = [];

  $pdo->beginTransaction();
  try {
    $pdo->prepare("DELETE FROM proyecto_visitas_programadas WHERE tarea_id = ? AND fecha = ?")
      ->execute([$tareaId, $fecha]);

    $filas = [];
    foreach ($visitas as $v) {
      $tecnicoId = trim($v['tecnicoId'] ?? '');
      if ($tecnicoId === '') continue;
      $hora = trim($v['hora'] ?? '') ?: null;
      $filas[] = [$tecnicoId, $hora];
    }
    // Sin técnicos válidos → marcador "sin asignar, ya se preguntó"
    if (!$filas) $filas[] = ['NINGUNO', null];

    $ins = $pdo->prepare("INSERT INTO proyecto_visitas_programadas (tarea_id, fecha, tecnico_id, hora) VALUES (?, ?, ?, ?)");
    foreach ($filas as [$tecnicoId, $hora]) {
      $ins->execute([$tareaId, $fecha, $tecnicoId, $hora]);
    }

    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    jsonOut(['error' => 'No se pudo guardar: ' . $e->getMessage()], 500);
  }

  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
