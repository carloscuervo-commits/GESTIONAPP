<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

require_once __DIR__ . '/../config/config_alegra.php';

// --------------------------------------------------------------
// GET /alegra_contactos.php?q=texto
// Busca contactos en Alegra cuyo nombre coincida con "q" y
// devuelve un array simplificado [{id, name}, ...]
// --------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

$q = trim($_GET['q'] ?? '');
if ($q === '' || strlen($q) < 2) {
  jsonOut([]);
}

if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
  jsonOut(['error' => 'Credenciales de Alegra no configuradas'], 500);
}

$url = 'https://api.alegra.com/api/v1/contacts?' . http_build_query([
  'name'  => $q,
  'limit' => 10,
  'order_direction' => 'ASC',
]);

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
if (!is_array($data)) {
  jsonOut([]);
}

$out = [];
foreach ($data as $c) {
  if (!empty($c['id']) && !empty($c['name'])) {
    $out[] = ['id' => $c['id'], 'name' => $c['name']];
  }
}

jsonOut($out);
