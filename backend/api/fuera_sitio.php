<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// GET /fuera_sitio.php?tareaId=X
// Devuelve todos los intentos de check fuera de sitio de una tarea
// (aceptados y cancelados).
// --------------------------------------------------------------
if ($method === 'GET') {
  $where  = ['1=1'];
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
            t.titulo AS tarea_titulo, t.cliente AS tarea_cliente
          FROM checkin_fuera_sitio f
          LEFT JOIN usuarios u ON u.id = f.tecnico_id
          LEFT JOIN tareas   t ON t.id = f.tarea_id
          WHERE " . implode(' AND ', $where) . "
          ORDER BY f.creado_en DESC";

  try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
      $r['distancia_metros'] = (int)$r['distancia_metros'];
      $r['radio_metros']     = (int)$r['radio_metros'];
      if ($r['lat'] !== null) $r['lat'] = (float)$r['lat'];
      if ($r['lng'] !== null) $r['lng'] = (float)$r['lng'];
    }
    jsonOut($rows);
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
