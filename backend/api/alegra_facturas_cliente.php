<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

require_once __DIR__ . '/../config/config_alegra.php';

// --------------------------------------------------------------
// GET /alegra_facturas_cliente.php?cliente=texto
// Busca el cliente en Alegra por nombre y devuelve sus facturas
// más recientes: [{id, numero, fecha, total}, ...]
// --------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

$cliente = trim($_GET['cliente'] ?? '');
if ($cliente === '' || mb_strlen($cliente) < 2) {
  jsonOut(['error' => 'Falta el parámetro "cliente"'], 400);
}

if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
  jsonOut(['error' => 'Credenciales de Alegra no configuradas'], 500);
}

$authHeader = [
  'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
  'Accept: application/json',
];

// --- 1) Buscar el contacto por nombre ---
$contactos = _alegraGet('https://api.alegra.com/api/v1/contacts?' . http_build_query([
  'name'  => $cliente,
  'limit' => 5,
  'order_direction' => 'ASC',
]), $authHeader);

if (!is_array($contactos) || empty($contactos)) {
  jsonOut(['error' => 'No se encontró ningún cliente en Alegra que coincida con "' . $cliente . '"', 'facturas' => []], 404);
}

// Tomar el primer contacto cuyo nombre sea igual o más parecido
$contactoId = null;
foreach ($contactos as $c) {
  if (!empty($c['id']) && !empty($c['name']) && mb_strtolower($c['name']) === mb_strtolower($cliente)) {
    $contactoId = $c['id'];
    break;
  }
}
if (!$contactoId) {
  $contactoId = $contactos[0]['id'] ?? null;
}
if (!$contactoId) {
  jsonOut(['error' => 'No se encontró ningún cliente en Alegra que coincida con "' . $cliente . '"', 'facturas' => []], 404);
}

// --- 2) Buscar las facturas más recientes de ese cliente ---
$facturas = _alegraGet('https://api.alegra.com/api/v1/invoices?' . http_build_query([
  'client_id' => $contactoId,
  'order_direction' => 'DESC',
  'order' => 'date',
  'limit' => 15,
]), $authHeader);

if (!is_array($facturas)) $facturas = [];

$out = [];
foreach ($facturas as $f) {
  $numero = $f['numberTemplate']['fullNumber'] ?? $f['numberTemplate']['number'] ?? ($f['number'] ?? '');
  $out[] = [
    'id'     => $f['id'] ?? null,
    'numero' => $numero,
    'fecha'  => $f['date'] ?? '',
    'total'  => $f['total'] ?? 0,
    'estado' => $f['status'] ?? '',
  ];
}

jsonOut([
  'cliente_alegra' => $contactos[0]['name'] ?? $cliente,
  'facturas' => $out,
]);

/**
 * Hace un GET a la API de Alegra y devuelve el JSON decodificado (o null si falla).
 */
function _alegraGet(string $url, array $headers) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_TIMEOUT => 10,
  ]);
  $resp = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($resp === false || $status < 200 || $status >= 300) return null;
  $data = json_decode($resp, true);
  return $data;
}
