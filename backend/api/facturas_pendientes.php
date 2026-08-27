<?php
/**
 * facturas_pendientes.php — Cola de facturas "listas para crear después" en
 * Alegra, para cuando se alcanza el límite mensual de facturación del plan.
 *
 * GET    /facturas_pendientes.php[?estado=pendiente]  -> listar
 * POST   /facturas_pendientes.php                     -> guardar como pendiente
 *          body: { plazoDias, client:{id}, items:[...], clienteNombre, tareaId }
 *          (sin date/dueDate: la factura se fecha con el día real en que se
 *          cree en Alegra, no con el día en que se diligencia el formulario)
 * PUT    /facturas_pendientes.php?id=N&accion=crear    -> crear esa factura en Alegra ahora
 * PUT    /facturas_pendientes.php?accion=crear_todas    -> crear todas las pendientes en Alegra ahora
 * DELETE /facturas_pendientes.php?id=N                 -> cancelar (no se borra, queda con estado 'cancelada')
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();
require_once __DIR__ . '/../lib/alegra_facturas.php';

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// Usuario autenticado (opcional, solo para trazabilidad — no bloquea si falta)
function _facturasPendientesUsuarioId(PDO $pdo): ?string {
  $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  $token = '';
  if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) $token = trim($m[1]);
  if (!$token) return null;
  $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE token_sesion = ? AND activo = 1");
  $stmt->execute([$token]);
  $row = $stmt->fetch();
  return $row ? $row['id'] : null;
}

function _facturaPendienteRow(array $row): array {
  $payload = json_decode($row['payload'], true) ?: [];
  $row['payload'] = $payload;
  $row['items_resumen'] = array_map(fn($it) => [
    'id' => $it['id'] ?? null,
    'description' => $it['description'] ?? '',
    'quantity' => $it['quantity'] ?? null,
    'price' => $it['price'] ?? null,
  ], $payload['items'] ?? []);
  return $row;
}

// --------------------------------------------------------------
// GET
// --------------------------------------------------------------
if ($method === 'GET') {
  $where = [];
  $params = [];
  if (!empty($_GET['estado'])) { $where[] = 'estado = ?'; $params[] = $_GET['estado']; }
  else { $where[] = "estado != 'cancelada'"; } // por defecto ocultar canceladas
  $sql = "SELECT * FROM facturas_pendientes" . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY creado_en ASC";
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  jsonOut(array_map('_facturaPendienteRow', $stmt->fetchAll()));
}

// --------------------------------------------------------------
// POST — guardar como pendiente (no se crea en Alegra todavía)
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  $client = $d['client'] ?? null;
  $items = $d['items'] ?? null;
  $plazoDias = isset($d['plazoDias']) && is_numeric($d['plazoDias']) ? max(0, (int)$d['plazoDias']) : 8;
  if (empty($client['id']) || !is_array($items) || empty($items)) {
    jsonOut(['error' => 'Faltan datos: se requiere client.id e items[]'], 400);
  }
  foreach ($items as $it) {
    if (empty($it['id']) || !isset($it['price']) || !isset($it['quantity'])) {
      jsonOut(['error' => 'Cada ítem debe tener id, price y quantity'], 400);
    }
  }

  $totalEstimado = 0;
  foreach ($items as $it) $totalEstimado += (float)$it['price'] * (float)$it['quantity'];

  $payload = [
    'plazoDias'     => $plazoDias,
    'client'        => $client,
    'items'         => $items,
    'clienteNombre' => $d['clienteNombre'] ?? null,
    'tareaId'       => $d['tareaId'] ?? null,
  ];

  $stmt = $pdo->prepare("INSERT INTO facturas_pendientes
    (payload, cliente_nombre, total_estimado, tarea_id, creado_por)
    VALUES (?, ?, ?, ?, ?)");
  $stmt->execute([
    json_encode($payload, JSON_UNESCAPED_UNICODE),
    $d['clienteNombre'] ?? null,
    round($totalEstimado, 2),
    $d['tareaId'] ?? null,
    _facturasPendientesUsuarioId($pdo),
  ]);

  jsonOut(['ok' => true, 'id' => (int)$pdo->lastInsertId()], 201);
}

// --------------------------------------------------------------
// PUT ?id=N&accion=crear         -> crea esa factura pendiente en Alegra
// PUT ?accion=crear_todas         -> crea todas las pendientes en Alegra
// --------------------------------------------------------------
if ($method === 'PUT') {
  $accion = $_GET['accion'] ?? '';

  if ($accion === 'crear_todas') {
    $stmt = $pdo->query("SELECT * FROM facturas_pendientes WHERE estado = 'pendiente' ORDER BY creado_en ASC");
    $pendientes = $stmt->fetchAll();
    $creadas = [];
    $fallidas = [];
    foreach ($pendientes as $row) {
      $payload = json_decode($row['payload'], true) ?: [];
      $resultado = crearFacturaEnAlegra($payload, $pdo);
      if ($resultado['ok']) {
        $numeroFactura = $resultado['data']['numberTemplate']['fullNumber'] ?? ($resultado['data']['id'] ?? '');
        $pdo->prepare("UPDATE facturas_pendientes SET estado='creada', numero_factura=?, alegra_id=?, creada_en=NOW(), error_ultimo=NULL WHERE id=?")
          ->execute([(string)$numeroFactura, isset($resultado['data']['id']) ? (string)$resultado['data']['id'] : null, $row['id']]);
        $creadas[] = ['id' => (int)$row['id'], 'numeroFactura' => $numeroFactura, 'tareaId' => $payload['tareaId'] ?? null];
      } else {
        $pdo->prepare("UPDATE facturas_pendientes SET error_ultimo=? WHERE id=?")
          ->execute([$resultado['error'] . (isset($resultado['detalle']) ? ' — ' . (is_string($resultado['detalle']) ? $resultado['detalle'] : json_encode($resultado['detalle'])) : ''), $row['id']]);
        $fallidas[] = ['id' => (int)$row['id'], 'error' => $resultado['error']];
      }
    }
    jsonOut(['ok' => true, 'creadas' => $creadas, 'fallidas' => $fallidas]);
  }

  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT * FROM facturas_pendientes WHERE id = ?");
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  if (!$row) jsonOut(['error' => 'No encontrada'], 404);
  if ($row['estado'] !== 'pendiente') jsonOut(['error' => 'Esta factura ya no está pendiente (estado: ' . $row['estado'] . ')'], 409);

  if ($accion !== 'crear') jsonOut(['error' => 'Acción no soportada'], 400);

  $payload = json_decode($row['payload'], true) ?: [];
  $resultado = crearFacturaEnAlegra($payload, $pdo);

  if (!$resultado['ok']) {
    $pdo->prepare("UPDATE facturas_pendientes SET error_ultimo=? WHERE id=?")
      ->execute([$resultado['error'] . (isset($resultado['detalle']) ? ' — ' . (is_string($resultado['detalle']) ? $resultado['detalle'] : json_encode($resultado['detalle'])) : ''), $id]);
    jsonOut([
      'error'   => $resultado['error'],
      'status'  => $resultado['status']  ?? null,
      'detalle' => $resultado['detalle'] ?? null,
    ], $resultado['httpStatus'] ?? 400);
  }

  $numeroFactura = $resultado['data']['numberTemplate']['fullNumber'] ?? ($resultado['data']['id'] ?? '');
  $pdo->prepare("UPDATE facturas_pendientes SET estado='creada', numero_factura=?, alegra_id=?, creada_en=NOW(), error_ultimo=NULL WHERE id=?")
    ->execute([(string)$numeroFactura, isset($resultado['data']['id']) ? (string)$resultado['data']['id'] : null, $id]);

  jsonOut(['ok' => true, 'numeroFactura' => $numeroFactura, 'tareaId' => $payload['tareaId'] ?? null, 'data' => $resultado['data']]);
}

// --------------------------------------------------------------
// DELETE ?id=N -> cancelar (no se borra, queda con estado 'cancelada')
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);
  $stmt = $pdo->prepare("SELECT estado FROM facturas_pendientes WHERE id = ?");
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  if (!$row) jsonOut(['error' => 'No encontrada'], 404);
  if ($row['estado'] !== 'pendiente') jsonOut(['error' => 'Esta factura ya no está pendiente (estado: ' . $row['estado'] . ')'], 409);
  $pdo->prepare("UPDATE facturas_pendientes SET estado='cancelada' WHERE id=?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
