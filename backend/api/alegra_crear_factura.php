<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

require_once __DIR__ . '/../config/config_alegra.php';

// --------------------------------------------------------------
// POST /alegra_crear_factura.php
// Recibe { date, client: {id}, items: [{id, description, quantity, price, tax}] }
// y crea la factura en Alegra (POST /invoices).
// --------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
  jsonOut(['error' => 'Credenciales de Alegra no configuradas'], 500);
}

$body = jsonInput();

$date = $body['date'] ?? null;
$client = $body['client'] ?? null;
$items = $body['items'] ?? null;
$dueDate = $body['dueDate'] ?? null;

if (!$date || empty($client['id']) || !is_array($items) || empty($items)) {
  jsonOut(['error' => 'Faltan datos: se requiere date, client.id e items[]'], 400);
}

foreach ($items as $it) {
  if (empty($it['id']) || !isset($it['price']) || !isset($it['quantity'])) {
    jsonOut(['error' => 'Cada ítem debe tener id, price y quantity'], 400);
  }
}

// La fecha de vencimiento es obligatoria para Alegra; si no se envía,
// por defecto se usa la fecha de la factura + 8 días.
if (!$dueDate) {
  $dueDate = date('Y-m-d', strtotime($date . ' +8 days'));
}

// Plazo de pago en días = diferencia entre dueDate y date (mínimo 0)
$dias = (int) round((strtotime($dueDate) - strtotime($date)) / 86400);
if ($dias < 0) $dias = 0;

$payload = [
  'date'            => $date,
  'dueDate'         => $dueDate,
  'paymentForm'     => 'CREDIT',
  'termsConditions' => 'Pago a ' . $dias . ' días',
  'client'  => ['id' => $client['id']],
  'items'  => array_map(function ($it) {
    return [
      'id'          => (int) $it['id'],
      'description' => $it['description'] ?? '',
      'price'       => (float) $it['price'],
      'quantity'    => (float) $it['quantity'],
      'tax'         => $it['tax'] ?? [['id' => 5]],
    ];
  }, $items),
];

$ch = curl_init('https://api.alegra.com/api/v1/invoices');
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => json_encode($payload),
  CURLOPT_HTTPHEADER => [
    'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
    'Accept: application/json',
    'Content-Type: application/json',
  ],
  CURLOPT_TIMEOUT => 20,
]);
$resp = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($resp === false) {
  jsonOut(['error' => 'No se pudo conectar con Alegra: ' . $err], 502);
}

$data = json_decode($resp, true);

if ($status < 200 || $status >= 300) {
  $msg = $data['message'] ?? $resp;
  jsonOut(['error' => 'Alegra respondió con error', 'status' => $status, 'detalle' => $msg], 502);
}

jsonOut($data);
