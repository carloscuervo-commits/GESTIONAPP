<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// GET /facturas_generadas.php -> todas las facturas creadas desde el
// módulo de Facturación (tabla facturas_generadas), para el informe.
// --------------------------------------------------------------
if ($method === 'GET') {
  $stmt = $pdo->query("SELECT * FROM facturas_generadas ORDER BY fecha_factura DESC, id DESC");
  jsonOut($stmt->fetchAll());
}

jsonOut(['error' => 'Método no soportado'], 405);
