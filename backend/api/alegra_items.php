<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

require_once __DIR__ . '/../config/config_alegra.php';

// --------------------------------------------------------------
// GET /alegra_items.php?q=texto  -> busca ítems/productos en Alegra por nombre
// GET /alegra_items.php          -> primeros ítems del catálogo (sin filtro)
// Devuelve [{id, name, reference, price}, ...]
// --------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
  jsonOut(['error' => 'Credenciales de Alegra no configuradas'], 500);
}

function _alegraItemPrice($raw): ?float {
  if (is_array($raw) && !empty($raw)) {
    if (isset($raw[0]['price'])) return (float) $raw[0]['price'];
    return null;
  }
  if (is_numeric($raw)) return (float) $raw;
  return null;
}

$q = trim($_GET['q'] ?? '');
$params = ['order_direction' => 'ASC'];
if ($q !== '') {
  if (mb_strlen($q) < 2) jsonOut([]);
  $params['name'] = $q;
  $params['limit'] = 30;
} else {
  $params['limit'] = 50; // catálogo inicial cuando aún no se ha escrito nada
}

$url = 'https://api.alegra.com/api/v1/items?' . http_build_query($params);
$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
    'Accept: application/json',
  ],
  CURLOPT_TIMEOUT => 10,
]);
$resp = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($resp === false) {
  jsonOut(['error' => 'No se pudo conectar con Alegra: ' . $err], 502);
}
if ($status < 200 || $status >= 300) {
  jsonOut(['error' => 'Alegra respondió con error', 'status' => $status, 'detalle' => $resp], 502);
}

$data = json_decode($resp, true);
if (!is_array($data)) jsonOut([]);

$out = [];
foreach ($data as $it) {
  if (!empty($it['id']) && !empty($it['name'])) {
    $out[] = [
      'id'        => $it['id'],
      'name'      => $it['name'],
      'reference' => $it['reference'] ?? null,
      'price'     => _alegraItemPrice($it['price'] ?? null),
    ];
  }
}

jsonOut($out);
