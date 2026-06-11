<?php
require_once __DIR__ . '/../db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------
function rowConTeam($pdo, $row) {
  $stmt = $pdo->prepare("SELECT usuario_id FROM tarea_equipo WHERE tarea_id = ?");
  $stmt->execute([$row['id']]);
  $row['team'] = array_column($stmt->fetchAll(), 'usuario_id');
  return $row;
}

function registrarHistorial($pdo, $tareaId, $estadoAnt, $estadoNuevo, $usuarioId) {
  if ($estadoAnt === $estadoNuevo) return;
  $stmt = $pdo->prepare("INSERT INTO tarea_historial (tarea_id, estado_ant, estado_nuevo, usuario_id) VALUES (?,?,?,?)");
  $stmt->execute([$tareaId, $estadoAnt, $estadoNuevo, $usuarioId]);
}

// --------------------------------------------------------------
// GET /tareas.php          -> lista todas (con filtros opcionales ?area=&estado=)
// GET /tareas.php?id=UUID  -> una tarea
// --------------------------------------------------------------
if ($method === 'GET') {
  if (!empty($_GET['id'])) {
    $stmt = $pdo->prepare("SELECT * FROM tareas WHERE id = ?");
    $stmt->execute([$_GET['id']]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['error' => 'No encontrada'], 404);
    jsonOut(rowConTeam($pdo, $row));
  }

  $sql = "SELECT * FROM tareas WHERE 1=1";
  $params = [];
  if (!empty($_GET['area']))   { $sql .= " AND area = ?";   $params[] = $_GET['area']; }
  if (!empty($_GET['estado'])) { $sql .= " AND estado = ?"; $params[] = $_GET['estado']; }
  $sql .= " ORDER BY actualizado_en DESC";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = array_map(fn($r) => rowConTeam($pdo, $r), $stmt->fetchAll());
  jsonOut($rows);
}

// --------------------------------------------------------------
// POST /tareas.php  -> crear tarea
// body JSON: { id, titulo, desc, area, estado, cliente, fechaProg, fecha,
//              tiempo, tiempoReal, recursos, notas, reporte, factura,
//              team: [usuario_id,...], creadoPor }
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  if (empty($d['titulo']) || empty($d['area']) || empty($d['estado'])) {
    jsonOut(['error' => 'titulo, area y estado son requeridos'], 400);
  }
  $id = $d['id'] ?? bin2hex(random_bytes(16));
  $now = date('Y-m-d H:i:s');
  $realizadoEn = ($d['estado'] === 'por-facturar' || $d['estado'] === 'realizado') ? $now : null;
  $enviadaEn   = ($d['estado'] === 'enviada') ? $now : null;

  $stmt = $pdo->prepare("INSERT INTO tareas
    (id, titulo, descripcion, area, estado, cliente, fecha_programacion, fecha_limite,
     tiempo_estimado, tiempo_real, recursos, notas, reporte, factura, creado_por,
     realizado_en, enviada_en)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  $stmt->execute([
    $id, $d['titulo'], $d['desc'] ?? null, $d['area'], $d['estado'], $d['cliente'] ?? null,
    $d['fechaProg'] ?? null, $d['fecha'] ?? null, $d['tiempo'] ?? null, $d['tiempoReal'] ?? null,
    $d['recursos'] ?? null, $d['notas'] ?? null, $d['reporte'] ?? null, $d['factura'] ?? null,
    $d['creadoPor'] ?? null, $realizadoEn, $enviadaEn,
  ]);

  if (!empty($d['team'])) {
    $ins = $pdo->prepare("INSERT INTO tarea_equipo (tarea_id, usuario_id) VALUES (?,?)");
    foreach ($d['team'] as $uid) $ins->execute([$id, $uid]);
  }

  registrarHistorial($pdo, $id, null, $d['estado'], $d['creadoPor'] ?? null);
  jsonOut(['id' => $id], 201);
}

// --------------------------------------------------------------
// PUT /tareas.php?id=UUID  -> actualizar tarea (mismo body que POST)
// --------------------------------------------------------------
if ($method === 'PUT') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT estado, realizado_en, enviada_en FROM tareas WHERE id = ?");
  $stmt->execute([$id]);
  $prev = $stmt->fetch();
  if (!$prev) jsonOut(['error' => 'No encontrada'], 404);

  $d = jsonInput();
  $estado = $d['estado'] ?? $prev['estado'];

  $realizadoEn = $prev['realizado_en'];
  if (in_array($estado, ['por-facturar','realizado']) && !$realizadoEn) $realizadoEn = date('Y-m-d H:i:s');

  $enviadaEn = $prev['enviada_en'];
  if ($estado === 'enviada' && !$enviadaEn) $enviadaEn = date('Y-m-d H:i:s');

  $stmt = $pdo->prepare("UPDATE tareas SET
    titulo=?, descripcion=?, area=?, estado=?, cliente=?, fecha_programacion=?, fecha_limite=?,
    tiempo_estimado=?, tiempo_real=?, recursos=?, notas=?, reporte=?, factura=?,
    realizado_en=?, enviada_en=?
    WHERE id=?");
  $stmt->execute([
    $d['titulo'], $d['desc'] ?? null, $d['area'], $estado, $d['cliente'] ?? null,
    $d['fechaProg'] ?? null, $d['fecha'] ?? null, $d['tiempo'] ?? null, $d['tiempoReal'] ?? null,
    $d['recursos'] ?? null, $d['notas'] ?? null, $d['reporte'] ?? null, $d['factura'] ?? null,
    $realizadoEn, $enviadaEn, $id,
  ]);

  // Reasignar equipo
  $pdo->prepare("DELETE FROM tarea_equipo WHERE tarea_id = ?")->execute([$id]);
  if (!empty($d['team'])) {
    $ins = $pdo->prepare("INSERT INTO tarea_equipo (tarea_id, usuario_id) VALUES (?,?)");
    foreach ($d['team'] as $uid) $ins->execute([$id, $uid]);
  }

  registrarHistorial($pdo, $id, $prev['estado'], $estado, $d['usuarioId'] ?? null);
  jsonOut(['ok' => true]);
}

// --------------------------------------------------------------
// DELETE /tareas.php?id=UUID
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);
  $pdo->prepare("DELETE FROM tareas WHERE id = ?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
