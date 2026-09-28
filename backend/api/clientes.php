<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
requireSesion($pdo);
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
  if ($row['contrato_horas_mes']  !== null) $row['contrato_horas_mes']  = (float)$row['contrato_horas_mes'];
  if ($row['fecha_corte_contrato'] !== null) $row['fecha_corte_contrato'] = (int)$row['fecha_corte_contrato'];
  $row['contrato_tipo'] = $row['contrato_tipo'] ?? 'ninguno';
  $row['alertar_fin_mes_contrato'] = (int)($row['alertar_fin_mes_contrato'] ?? 1);
  if ($row['valor_transporte']    !== null) $row['valor_transporte']    = (int)$row['valor_transporte'];
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

  if (!empty($_GET['alegra_id'])) {
    $stmt = $pdo->prepare("SELECT * FROM clientes WHERE alegra_id = ?");
    $stmt->execute([$_GET['alegra_id']]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['error' => 'No encontrado'], 404);
    jsonOut(clienteRow($row));
  }

  if (!empty($_GET['nombre'])) {
    $stmt = $pdo->prepare("SELECT * FROM clientes WHERE LOWER(nombre) = LOWER(?)");
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
// body: { nombre, direccion?, lat?, lng?, radio_metros?, plazo_factura_dias?, alegra_id?,
//         contrato_area?, contrato_horas_mes? }
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
  $contratoTipo = in_array($d['contrato_tipo'] ?? '', ['ninguno','tiempo_completo']) ? $d['contrato_tipo'] : 'ninguno';
  $tecnicoInhouseId = $contratoTipo === 'tiempo_completo' ? (($d['tecnico_inhouse_id'] ?? '') ?: null) : null;

  try {
    $pdo->prepare("INSERT INTO clientes
      (id, nombre, email, celular, direccion, lat, lng, radio_metros, plazo_factura_dias, alegra_id,
       contrato_area, contrato_horas_mes, fecha_corte_contrato, alertar_fin_mes_contrato, valor_transporte,
       contrato_tipo, tecnico_inhouse_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      ->execute([
        $id,
        $d['nombre'],
        $d['email']                   ?? null,
        $d['celular']                 ?? null,
        $d['direccion']               ?? null,
        isset($d['lat'])              ? (float)$d['lat']               : null,
        isset($d['lng'])              ? (float)$d['lng']               : null,
        isset($d['radio_metros'])     ? (int)$d['radio_metros']        : 200,
        isset($d['plazo_factura_dias']) ? (int)$d['plazo_factura_dias'] : 8,
        $d['alegra_id']               ?? null,
        $d['contrato_area']           ?? null,
        isset($d['contrato_horas_mes']) ? (float)$d['contrato_horas_mes'] : null,
        isset($d['fecha_corte_contrato']) ? (int)$d['fecha_corte_contrato'] : null,
        isset($d['alertar_fin_mes_contrato']) ? (int)!!$d['alertar_fin_mes_contrato'] : 1,
        isset($d['valor_transporte'])   ? (int)$d['valor_transporte']   : null,
        $contratoTipo,
        $tecnicoInhouseId,
      ]);
  } catch (PDOException $e) {
    if ($e->getCode() === '23000' && strpos($e->getMessage(), 'uq_cliente_tecnico_inhouse') !== false) {
      jsonOut(['error' => 'Ese técnico in-house ya está asignado a otro cliente. Quítalo de ahí primero.'], 409);
    }
    throw $e;
  }

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

  $contratoTipo = array_key_exists('contrato_tipo', $d)
    ? (in_array($d['contrato_tipo'] ?? '', ['ninguno','tiempo_completo']) ? $d['contrato_tipo'] : 'ninguno')
    : ($prev['contrato_tipo'] ?? 'ninguno');
  $tecnicoInhouseId = $contratoTipo === 'tiempo_completo'
    ? (array_key_exists('tecnico_inhouse_id', $d) ? (($d['tecnico_inhouse_id'] ?? '') ?: null) : $prev['tecnico_inhouse_id'])
    : null;

  try {
    $pdo->prepare("UPDATE clientes SET
      nombre              = ?,
      email               = ?,
      celular             = ?,
      direccion           = ?,
      lat                 = ?,
      lng                 = ?,
      radio_metros        = ?,
      plazo_factura_dias  = ?,
      alegra_id           = ?,
      contrato_area       = ?,
      contrato_horas_mes  = ?,
      fecha_corte_contrato = ?,
      alertar_fin_mes_contrato = ?,
      valor_transporte    = ?,
      contrato_tipo       = ?,
      tecnico_inhouse_id  = ?
      WHERE id = ?")
      ->execute([
        $d['nombre']             ?? $prev['nombre'],
        array_key_exists('email', $d)     ? $d['email']     : $prev['email'],
        array_key_exists('celular', $d)   ? $d['celular']   : $prev['celular'],
        array_key_exists('direccion', $d) ? $d['direccion'] : $prev['direccion'],
        array_key_exists('lat', $d)       ? (isset($d['lat']) ? (float)$d['lat'] : null) : $prev['lat'],
        array_key_exists('lng', $d)       ? (isset($d['lng']) ? (float)$d['lng'] : null) : $prev['lng'],
        isset($d['radio_metros'])         ? (int)$d['radio_metros']        : (int)$prev['radio_metros'],
        isset($d['plazo_factura_dias'])   ? (int)$d['plazo_factura_dias']  : (int)$prev['plazo_factura_dias'],
        array_key_exists('alegra_id', $d)          ? $d['alegra_id']                     : $prev['alegra_id'],
        array_key_exists('contrato_area', $d)       ? $d['contrato_area']                : $prev['contrato_area'],
        array_key_exists('contrato_horas_mes', $d)  ? (isset($d['contrato_horas_mes']) ? (float)$d['contrato_horas_mes'] : null) : $prev['contrato_horas_mes'],
        array_key_exists('fecha_corte_contrato', $d) ? (isset($d['fecha_corte_contrato']) ? (int)$d['fecha_corte_contrato'] : null) : $prev['fecha_corte_contrato'],
        array_key_exists('alertar_fin_mes_contrato', $d) ? (int)!!$d['alertar_fin_mes_contrato'] : (int)$prev['alertar_fin_mes_contrato'],
        array_key_exists('valor_transporte', $d)    ? (isset($d['valor_transporte']) ? (int)$d['valor_transporte'] : null) : $prev['valor_transporte'],
        $contratoTipo,
        $tecnicoInhouseId,
        $id,
      ]);
  } catch (PDOException $e) {
    if ($e->getCode() === '23000' && strpos($e->getMessage(), 'uq_cliente_tecnico_inhouse') !== false) {
      jsonOut(['error' => 'Ese técnico in-house ya está asignado a otro cliente. Quítalo de ahí primero.'], 409);
    }
    throw $e;
  }

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
