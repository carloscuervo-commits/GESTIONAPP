<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

require_once __DIR__ . '/../config/config_alegra.php';
require_once __DIR__ . '/../lib/alegra_facturas.php';

// --------------------------------------------------------------
// POST /alegra_crear_factura.php
// Recibe { date, client: {id}, items: [{id, description, quantity, price, tax}] }
// y crea la factura en Alegra (POST /invoices).
// --------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

$body = jsonInput();
$pdo = getDB();

$resultado = crearFacturaEnAlegra($body, $pdo);

if (!$resultado['ok']) {
  jsonOut([
    'error'   => $resultado['error'],
    'status'  => $resultado['status']  ?? null,
    'detalle' => $resultado['detalle'] ?? null,
  ], $resultado['httpStatus'] ?? 400);
}

jsonOut($resultado['data']);
