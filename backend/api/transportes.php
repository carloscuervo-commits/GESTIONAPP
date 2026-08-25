<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();
require_once __DIR__ . '/../lib/transportes.php';

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// GET /transportes.php
//   ?estado=pendiente|archivado          (default: pendiente)
//   ?tecnico_id=X
//   ?desde=YYYY-MM-DD
//   ?hasta=YYYY-MM-DD
//   ?pendientes_tarea=TAREA_ID           → devuelve { pendientes: N }
// --------------------------------------------------------------
if ($method === 'GET') {

  if (!empty($_GET['pendientes_tarea'])) {
    $tareaId = $_GET['pendientes_tarea'];
    $stmt = $pdo->prepare("
      SELECT COUNT(*) AS total
      FROM visita_participantes vp
      JOIN reportes r ON r.id COLLATE utf8mb4_general_ci = vp.reporte_id COLLATE utf8mb4_general_ci
      JOIN tareas t   ON t.id = r.tarea_id
      LEFT JOIN clientes c ON LOWER(c.nombre) = LOWER(t.cliente)
      WHERE r.tarea_id = ?
        AND t.area IN ('it','if')
        AND t.modalidad = 'en_sitio'
        AND vp.check_in IS NOT NULL
        AND vp.check_out IS NOT NULL
        AND (vp.transporte_estado IS NULL OR vp.transporte_estado = 'pendiente')
        AND c.valor_transporte > 0
    ");
    $stmt->execute([$tareaId]);
    $row = $stmt->fetch();
    jsonOut(['pendientes' => (int)($row['total'] ?? 0)]);
  }

  $where  = [];
  $params = [];

  if (!empty($_GET['tecnico_id'])) {
    $where[] = 't.tecnico_id = ?';
    $params[] = $_GET['tecnico_id'];
  }
  if (!empty($_GET['desde'])) {
    $where[] = 't.fecha >= ?';
    $params[] = $_GET['desde'];
  }
  if (!empty($_GET['hasta'])) {
    $where[] = 't.fecha <= ?';
    $params[] = $_GET['hasta'];
  }

  $estadoFiltro = $_GET['estado'] ?? 'pendiente';
  if ($estadoFiltro === 'archivado') {
    $where[] = "t.estado IN ('pagado','no_aprobado')";
  } else {
    $where[] = "t.estado = 'pendiente'";
  }

  $sql = "SELECT t.*, u.nombre AS tecnico_nombre
          FROM transportes t
          LEFT JOIN usuarios u ON u.id = t.tecnico_id";
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY u.nombre ASC, t.fecha ASC, t.check_in ASC';

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll();

  foreach ($rows as &$r) {
    $r['valor']     = (int)$r['valor'];
    $r['trayectos'] = (int)($r['trayectos'] ?? 2);
  }
  jsonOut($rows);
}

// --------------------------------------------------------------
// POST /transportes.php
//   body: { tarea_id }
//   Crea un registro de transporte por cada check-in pendiente.
//   Primera visita del día por técnico: trayectos=2.
//   Visitas adicionales del mismo técnico ese día: trayectos=0.
// --------------------------------------------------------------
if ($method === 'POST') {
  $d       = jsonInput();
  $tareaId = $d['tarea_id'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tarea_id requerido'], 400);

  $r = crearTransportesTarea($pdo, $tareaId);
  if ($r['error']) jsonOut(['error' => $r['error']], $r['error'] === 'Tarea no encontrada' ? 404 : 400);
  jsonOut(['created' => $r['created'], 'skipped' => $r['skipped']]);
}

// --------------------------------------------------------------
// PUT /transportes.php?id=CHAR32
//   body: { estado: 'pagado' | 'no_aprobado' }   → actualiza estado
//   body: { trayectos: 0 | 1 | 2 }               → actualiza trayectos
//
// PUT /transportes.php?marcar_no_aplica=1
//   body: { tarea_id }
// --------------------------------------------------------------
if ($method === 'PUT') {

  if (!empty($_GET['marcar_no_aplica'])) {
    $d       = jsonInput();
    $tareaId = $d['tarea_id'] ?? null;
    if (!$tareaId) jsonOut(['error' => 'tarea_id requerido'], 400);

    $stmt = $pdo->prepare("
      UPDATE visita_participantes vp
      JOIN reportes r ON r.id COLLATE utf8mb4_general_ci = vp.reporte_id COLLATE utf8mb4_general_ci
      SET vp.transporte_estado = 'no_aplica'
      WHERE r.tarea_id = ?
        AND vp.check_in IS NOT NULL
        AND (vp.transporte_estado IS NULL OR vp.transporte_estado = 'pendiente')
    ");
    $stmt->execute([$tareaId]);
    jsonOut(['ok' => true, 'actualizados' => $stmt->rowCount()]);
  }

  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $d = jsonInput();

  // Actualizar trayectos
  if (array_key_exists('trayectos', $d)) {
    $trayectos = (int)$d['trayectos'];
    if (!in_array($trayectos, [0, 1, 2])) {
      jsonOut(['error' => 'trayectos debe ser 0, 1 o 2'], 400);
    }
    $pdo->prepare("UPDATE transportes SET trayectos = ? WHERE id = ?")
        ->execute([$trayectos, $id]);
    jsonOut(['ok' => true]);
  }

  // Actualizar estado
  $estado = $d['estado'] ?? null;
  if (!in_array($estado, ['pagado', 'no_aprobado'])) {
    jsonOut(['error' => 'estado debe ser pagado o no_aprobado'], 400);
  }
  $pdo->prepare("UPDATE transportes SET estado = ? WHERE id = ?")
      ->execute([$estado, $id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
