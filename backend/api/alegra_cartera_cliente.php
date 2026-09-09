<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();
requireSesion(getDB());

require_once __DIR__ . '/../config/config_alegra.php';

// --------------------------------------------------------------
// GET /alegra_cartera_cliente.php?alegra_id=X
// GET /alegra_cartera_cliente.php?cliente=texto   (fallback si no se tiene
//   a mano el id de Alegra — busca el contacto por nombre primero)
//
// Revisa si el cliente tiene facturas vencidas en Alegra: status=open (no
// pagada, ni parcial ni completamente) y con fecha de vencimiento (dueDate)
// ya pasada. Se usa al elegir/editar el cliente de una tarjeta, para avisar
// (sin bloquear) si tiene cartera vencida antes de seguir atendiéndolo.
// --------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
  jsonOut(['error' => 'Credenciales de Alegra no configuradas'], 500);
}

$authHeader = [
  'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
  'Accept: application/json',
];

$alegraId      = trim($_GET['alegra_id'] ?? '');
$clienteNombre = trim($_GET['cliente'] ?? '');

if (!$alegraId && !$clienteNombre) {
  jsonOut(['error' => 'Falta alegra_id o cliente'], 400);
}

$nombreMostrar = $clienteNombre;

// Si no vino el id de Alegra directo (ej. al editar una tarjeta vieja, donde
// solo tenemos el nombre guardado), buscar el contacto por nombre — mismo
// patrón que alegra_facturas_cliente.php.
if (!$alegraId) {
  $contactos = _acvGet('https://api.alegra.com/api/v1/contacts?' . http_build_query([
    'name'  => $clienteNombre,
    'limit' => 5,
    'order_direction' => 'ASC',
  ]), $authHeader);

  if (!is_array($contactos) || empty($contactos)) {
    jsonOut(['tiene_vencida' => false, 'facturas' => [], 'total_vencido' => 0, 'nota' => 'Cliente no encontrado en Alegra']);
  }

  foreach ($contactos as $c) {
    if (!empty($c['id']) && !empty($c['name']) && mb_strtolower($c['name']) === mb_strtolower($clienteNombre)) {
      $alegraId = $c['id'];
      $nombreMostrar = $c['name'];
      break;
    }
  }
  if (!$alegraId) {
    $alegraId = $contactos[0]['id'] ?? null;
    $nombreMostrar = $contactos[0]['name'] ?? $clienteNombre;
  }
  if (!$alegraId) {
    jsonOut(['tiene_vencida' => false, 'facturas' => [], 'total_vencido' => 0, 'nota' => 'Cliente no encontrado en Alegra']);
  }
}

$hoy = (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');

$facturas = _acvGet('https://api.alegra.com/api/v1/invoices?' . http_build_query([
  'client_id'       => $alegraId,
  'status'          => 'open',
  'dueDate_before'  => $hoy,
  'order_field'     => 'dueDate',
  'order_direction' => 'ASC',
  'limit'           => 30,
]), $authHeader);

if (!is_array($facturas)) $facturas = [];

$out = [];
$totalVencido = 0;
foreach ($facturas as $f) {
  $balance = isset($f['balance']) ? (float)$f['balance'] : (float)($f['total'] ?? 0);
  if ($balance <= 0) continue; // por si acaso — status=open ya debería filtrar esto
  $numero  = $f['numberTemplate']['fullNumber'] ?? $f['numberTemplate']['number'] ?? ($f['number'] ?? '');
  $dueDate = $f['dueDate'] ?? '';
  $diasVencido = $dueDate ? (int)floor((strtotime($hoy) - strtotime($dueDate)) / 86400) : null;
  $totalVencido += $balance;
  $out[] = [
    'numero'       => $numero,
    'dueDate'      => $dueDate,
    'dias_vencido' => $diasVencido,
    'balance'      => $balance,
  ];
}

jsonOut([
  'cliente_alegra' => $nombreMostrar,
  'tiene_vencida'  => count($out) > 0,
  'total_vencido'  => $totalVencido,
  'facturas'       => $out,
]);

/**
 * Hace un GET a la API de Alegra y devuelve el JSON decodificado (o null si falla).
 */
function _acvGet(string $url, array $headers) {
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
