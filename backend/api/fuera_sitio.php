<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// GET /fuera_sitio.php?count=1       -> conteo de pendientes (para badge)
// GET /fuera_sitio.php               -> lista pendientes (revisado=0)
// GET /fuera_sitio.php?archivados=1  -> lista gestionados (revisado=1)
// Filtros opcionales: tareaId, tecnicoId, desde, hasta
// --------------------------------------------------------------
if ($method === 'GET') {
  // Badge del dashboard: solo devuelve el conteo de no revisados
  if (isset($_GET['count'])) {
    try {
      $stmt = $pdo->query("SELECT COUNT(*) FROM checkin_fuera_sitio WHERE revisado = 0");
      jsonOut(['pendientes' => (int)$stmt->fetchColumn()]);
    } catch (Exception $e) {
      jsonOut(['error' => $e->getMessage()], 500);
    }
  }

  $archivados = !empty($_GET['archivados']) ? 1 : 0;
  $where  = ['f.revisado = ' . $archivados];
  $params = [];

  if (!empty($_GET['tareaId'])) {
    $where[] = 'f.tarea_id = ?'; $params[] = $_GET['tareaId'];
  }
  if (!empty($_GET['tecnicoId'])) {
    $where[] = 'f.tecnico_id = ?'; $params[] = $_GET['tecnicoId'];
  }
  if (!empty($_GET['desde'])) {
    $where[] = 'DATE(f.creado_en) >= ?'; $params[] = $_GET['desde'];
  }
  if (!empty($_GET['hasta'])) {
    $where[] = 'DATE(f.creado_en) <= ?'; $params[] = $_GET['hasta'];
  }

  $sql = "SELECT f.*, u.nombre AS tecnico_nombre,
            t.titulo AS tarea_titulo, t.cliente AS tarea_cliente,
            ur.nombre AS revisado_por_nombre
          FROM checkin_fuera_sitio f
          LEFT JOIN usuarios u  ON u.id  COLLATE utf8mb4_general_ci = f.tecnico_id   COLLATE utf8mb4_general_ci
          LEFT JOIN tareas   t  ON t.id  COLLATE utf8mb4_general_ci = f.tarea_id     COLLATE utf8mb4_general_ci
          LEFT JOIN usuarios ur ON ur.id COLLATE utf8mb4_general_ci = f.revisado_por COLLATE utf8mb4_general_ci
          WHERE " . implode(' AND ', $where) . "
          ORDER BY f.creado_en DESC";

  try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
      $r['distancia_metros'] = (int)$r['distancia_metros'];
      $r['radio_metros']     = (int)$r['radio_metros'];
      $r['revisado']         = (bool)$r['revisado'];
      if ($r['lat'] !== null) $r['lat'] = (float)$r['lat'];
      if ($r['lng'] !== null) $r['lng'] = (float)$r['lng'];
    }
    jsonOut($rows);
  } catch (Exception $e) {
    jsonOut(['error' => $e->getMessage()], 500);
  }
}

// --------------------------------------------------------------
// PUT /fuera_sitio.php?id=X
// body: { revisadoPor, observacion? }
// Marca el registro como gestionado por el admin.
// --------------------------------------------------------------
if ($method === 'PUT') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);
  $d = jsonInput();
  if (empty($d['revisadoPor'])) jsonOut(['error' => 'revisadoPor requerido'], 400);

  try {
    $pdo->prepare(
      "UPDATE checkin_fuera_sitio
       SET revisado = 1, revisado_por = ?, revisado_en = NOW(), observacion = ?
       WHERE id = ?"
    )->execute([$d['revisadoPor'], $d['observacion'] ?? null, $id]);
    jsonOut(['ok' => true]);
  } catch (Exception $e) {
    jsonOut(['error' => $e->getMessage()], 500);
  }
}

// --------------------------------------------------------------
// POST /fuera_sitio.php
// body: { tareaId, tecnicoId, tipo, lat, lng, distanciaMetros, radioMetros, accion }
// tipo:  'checkin' | 'checkout'
// accion: 'aceptado' | 'cancelado'
// Registra un intento de check fuera del radio del cliente.
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  $required = ['tareaId', 'tecnicoId', 'tipo', 'lat', 'lng', 'distanciaMetros', 'radioMetros', 'accion'];
  foreach ($required as $k) {
    if (!isset($d[$k])) jsonOut(['error' => "Campo requerido: {$k}"], 400);
  }

  $id = bin2hex(random_bytes(16));
  $pdo->prepare(
    "INSERT INTO checkin_fuera_sitio
     (id, tarea_id, tecnico_id, tipo, lat, lng, distancia_metros, radio_metros, accion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )->execute([
    $id,
    $d['tareaId'],
    $d['tecnicoId'],
    $d['tipo'],
    (float)$d['lat'],
    (float)$d['lng'],
    (int)$d['distanciaMetros'],
    (int)$d['radioMetros'],
    $d['accion'],
  ]);

  jsonOut(['id' => $id], 201);
}

jsonOut(['error' => 'Método no soportado'], 405);
