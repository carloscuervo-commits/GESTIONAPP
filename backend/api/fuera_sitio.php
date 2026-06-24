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
  $tareaId = $_GET['tareaId'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tareaId requerido'], 400);

  $stmt = $pdo->prepare(
    "SELECT f.*, u.nombre AS tecnico_nombre
     FROM checkin_fuera_sitio f
     LEFT JOIN usuarios u ON u.id = f.tecnico_id
     WHERE f.tarea_id = ?
     ORDER BY f.creado_en ASC"
  );
  $stmt->execute([$tareaId]);
  $rows = $stmt->fetchAll();
  foreach ($rows as &$r) {
    $r['distancia_metros'] = (int)$r['distancia_metros'];
    $r['radio_metros']     = (int)$r['radio_metros'];
    if ($r['lat'] !== null) $r['lat'] = (float)$r['lat'];
    if ($r['lng'] !== null) $r['lng'] = (float)$r['lng'];
  }
  jsonOut($rows);
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
