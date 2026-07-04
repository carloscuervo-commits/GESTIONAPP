<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// GET /transportes.php
//   ?estado=pendiente|archivado          (default: pendiente)
//   ?tecnico_id=N
//   ?desde=YYYY-MM-DD
//   ?hasta=YYYY-MM-DD
//   ?pendientes_tarea=TAREA_ID           → devuelve { pendientes: N }
// --------------------------------------------------------------
if ($method === 'GET') {

  // Verificar si hay visitas pendientes de registrar transporte para una tarea
  if (!empty($_GET['pendientes_tarea'])) {
    $tareaId = $_GET['pendientes_tarea'];
    $stmt = $pdo->prepare("
      SELECT COUNT(*) AS total
      FROM visita_participantes vp
      JOIN reportes r ON r.id COLLATE utf8mb4_general_ci = vp.reporte_id COLLATE utf8mb4_general_ci
      WHERE r.tarea_id = ?
        AND vp.check_in IS NOT NULL
        AND (vp.transporte_estado IS NULL OR vp.transporte_estado = 'pendiente')
    ");
    $stmt->execute([$tareaId]);
    $row = $stmt->fetch();
    jsonOut(['pendientes' => (int)($row['total'] ?? 0)]);
  }

  // Lista de registros de transporte con filtros
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
  $sql .= ' ORDER BY u.nombre ASC, t.fecha DESC, t.check_in DESC';

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll();

  foreach ($rows as &$r) {
    $r['valor'] = (int)$r['valor'];
  }
  jsonOut($rows);
}

// --------------------------------------------------------------
// POST /transportes.php
//   body: { tarea_id }
//   Crea un registro de transporte por cada check-in pendiente
//   y marca esos participantes como 'registrado'.
// --------------------------------------------------------------
if ($method === 'POST') {
  $d       = jsonInput();
  $tareaId = $d['tarea_id'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tarea_id requerido'], 400);

  // Datos de la tarea
  $stmt = $pdo->prepare("SELECT * FROM tareas WHERE id = ?");
  $stmt->execute([$tareaId]);
  $tarea = $stmt->fetch();
  if (!$tarea) jsonOut(['error' => 'Tarea no encontrada'], 404);

  // valor_transporte del cliente
  $stmt = $pdo->prepare("SELECT valor_transporte FROM clientes WHERE LOWER(nombre) = LOWER(?)");
  $stmt->execute([$tarea['cliente'] ?? '']);
  $clienteRow = $stmt->fetch();
  $valor = $clienteRow ? (int)($clienteRow['valor_transporte'] ?? 0) : 0;
  if ($valor <= 0) jsonOut(['error' => 'El cliente no tiene valor de transporte configurado'], 400);

  // Check-ins pendientes de transporte para esta tarea
  $stmt = $pdo->prepare("
    SELECT vp.id, vp.tecnico_id, vp.check_in, vp.check_out
    FROM visita_participantes vp
    JOIN reportes r ON r.id COLLATE utf8mb4_general_ci = vp.reporte_id COLLATE utf8mb4_general_ci
    WHERE r.tarea_id = ?
      AND vp.check_in IS NOT NULL
      AND (vp.transporte_estado IS NULL OR vp.transporte_estado = 'pendiente')
  ");
  $stmt->execute([$tareaId]);
  $participantes = $stmt->fetchAll();

  if (!$participantes) jsonOut(['created' => 0, 'skipped' => 0]);

  $created = 0;
  $skipped = 0;

  foreach ($participantes as $p) {
    $id      = bin2hex(random_bytes(16));
    $checkIn = $p['check_in'];
    $fecha   = substr($checkIn, 0, 10);

    try {
      $pdo->prepare("
        INSERT INTO transportes
          (id, tarea_id, participante_id, tecnico_id, cliente, tarea_titulo,
           fecha, check_in, check_out, valor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ")->execute([
        $id,
        $tareaId,
        $p['id'],
        $p['tecnico_id'],
        $tarea['cliente'] ?? '',
        $tarea['titulo']  ?? '',
        $fecha,
        $checkIn,
        $p['check_out'],
        $valor,
      ]);

      // Marcar el participante como 'registrado'
      $pdo->prepare("UPDATE visita_participantes SET transporte_estado = 'registrado' WHERE id = ?")
          ->execute([$p['id']]);

      $created++;
    } catch (\PDOException $e) {
      if ($e->getCode() === '23000') {
        // Duplicado: el registro ya existía; solo actualizar estado
        $pdo->prepare("UPDATE visita_participantes SET transporte_estado = 'registrado' WHERE id = ?")
            ->execute([$p['id']]);
        $skipped++;
        continue;
      }
      throw $e;
    }
  }

  jsonOut(['created' => $created, 'skipped' => $skipped]);
}

// --------------------------------------------------------------
// PUT /transportes.php?id=CHAR32
//   body: { estado: 'pagado' | 'no_aprobado' }
//
// PUT /transportes.php?marcar_no_aplica=1
//   body: { tarea_id }
//   Marca como 'no_aplica' todos los participantes pendientes de esa tarea.
// --------------------------------------------------------------
if ($method === 'PUT') {

  // Marcar participantes como no_aplica (tarea no califica para transporte)
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

  // Actualizar estado de un registro de transporte (pagado / no_aprobado)
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $d      = jsonInput();
  $estado = $d['estado'] ?? null;
  if (!in_array($estado, ['pagado', 'no_aprobado'])) {
    jsonOut(['error' => 'estado debe ser pagado o no_aprobado'], 400);
  }

  $pdo->prepare("UPDATE transportes SET estado = ? WHERE id = ?")
      ->execute([$estado, $id]);

  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
