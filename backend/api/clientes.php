<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------
function clienteRow($row) {
  // Normalizar tipos numéricos
  $row['radio_metros']       = (int)($row['radio_metros']       ?? 200);
  $row['plazo_factura_dias'] = (int)($row['plazo_factura_dias'] ?? 8);
  if ($row['lat'] !== null) $row['lat'] = (float)$row['lat'];
  if ($row['lng'] !== null) $row['lng'] = (float)$row['lng'];
  return $row;
}

// --------------------------------------------------------------
// GET /clientes.php           -> lista todos
// GET /clientes.php?id=UUID   -> uno por id
// GET /clientes.php?nombre=X  -> uno por nombre exacto
// --------------------------------------------------------------
if ($method === 'GET') {
  if (!empty($_GET['id'])) {
    $stmt = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
    $stmt->execute([$_GET['id']]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['error' => 'No encontrado'], 404);
    jsonOut(clienteRow($row));
  }

  if (!empty($_GET['nombre'])) {
    $stmt = $pdo->prepare("SELECT * FROM clientes WHERE nombre = ?");
    $stmt->execute([$_GET['nombre']]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['error' => 'No encontrado'], 404);
    jsonOut(clienteRow($row));
  }

  $stmt = $pdo->query("SELECT * FROM clientes ORDER BY nombre ASC");
  jsonOut(array_map('clienteRow', $stmt->fetchAll()));
}

// --------------------------------------------------------------
// POST /clientes.php
// body: { nombre, direccion?, lat?, lng?, radio_metros?, plazo_factura_dias?, alegra_id? }
// Si el nombre ya existe devuelve el existente (no duplica).
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  if (empty($d['nombre'])) jsonOut(['error' => 'nombre es requerido'], 400);

  // ¿Ya existe?
  $stmt = $pdo->prepare("SELECT * FROM clientes WHERE nombre = ?");
  $stmt->execute([$d['nombre']]);
  $existe = $stmt->fetch();
  if ($existe) jsonOut(clienteRow($existe));

  $id = bin2hex(random_bytes(16));
  $pdo->prepare("INSERT INTO clientes
    (id, nombre, direccion, lat, lng, radio_metros, plazo_factura_dias, alegra_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    ->execute([
      $id,
      $d['nombre'],
      $d['direccion']          ?? null,
      isset($d['lat'])         ? (float)$d['lat']                : null,
      isset($d['lng'])         ? (float)$d['lng']                : null,
      isset($d['radio_metros']) ? (int)$d['radio_metros']        : 200,
      isset($d['plazo_factura_dias']) ? (int)$d['plazo_factura_dias'] : 8,
      $d['alegra_id']          ?? null,
    ]);

  $stmt = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
  $stmt->execute([$id]);
  jsonOut(clienteRow($stmt->fetch()), 201);
}

// --------------------------------------------------------------
// PUT /clientes.php?id=UUID
// body: campos a actualizar (todos opcionales)
// --------------------------------------------------------------
if ($method === 'PUT') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
  $stmt->execute([$id]);
  $prev = $stmt->fetch();
  if (!$prev) jsonOut(['error' => 'No encontrado'], 404);

  $d = jsonInput();

  $pdo->prepare("UPDATE clientes SET
    nombre              = ?,
    direccion           = ?,
    lat                 = ?,
    lng                 = ?,
    radio_metros        = ?,
    plazo_factura_dias  = ?,
    alegra_id           = ?
    WHERE id = ?")
    ->execute([
      $d['nombre']             ?? $prev['nombre'],
      array_key_exists('direccion', $d) ? $d['direccion'] : $prev['direccion'],
      array_key_exists('lat', $d)       ? (isset($d['lat']) ? (float)$d['lat'] : null) : $prev['lat'],
      array_key_exists('lng', $d)       ? (isset($d['lng']) ? (float)$d['lng'] : null) : $prev['lng'],
      isset($d['radio_metros'])         ? (int)$d['radio_metros']        : (int)$prev['radio_metros'],
      isset($d['plazo_factura_dias'])   ? (int)$d['plazo_factura_dias']  : (int)$prev['plazo_factura_dias'],
      array_key_exists('alegra_id', $d) ? $d['alegra_id'] : $prev['alegra_id'],
      $id,
    ]);

  $stmt = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
  $stmt->execute([$id]);
  jsonOut(clienteRow($stmt->fetch()));
}

// --------------------------------------------------------------
// DELETE /clientes.php?id=UUID
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);
  $pdo->prepare("DELETE FROM clientes WHERE id = ?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
