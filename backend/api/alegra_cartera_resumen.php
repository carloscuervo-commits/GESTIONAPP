<?php
/**
 * alegra_cartera_resumen.php — GET /alegra_cartera_resumen.php
 *
 * Trae en vivo, desde Alegra, todas las facturas abiertas y vencidas
 * (status=open, dueDate_before=hoy), agrupadas por cliente. Reemplaza el
 * arreglo ALEGRA_CARTERA_DATA que antes venía quemado en cartera.js y se
 * actualizaba a mano — ahora la pestaña "💰 Cartera" siempre pide esto al
 * abrirse.
 *
 * Para cada cliente, si existe una fila en la tabla local `clientes` con el
 * mismo alegra_id, se adjunta su email/celular guardado en Ginno (para
 * prellenar el envío de cobro sin tener que ir a buscarlo a Alegra).
 *
 * Respuesta: [{ clienteId, clienteNombre, email, celular, facturas:[{num,balance,dueDate,date}],
 *               totalDeuda, fechaMasAntigua }, ...] ordenado por totalDeuda desc.
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
requireSesion($pdo, 'admin');

require_once __DIR__ . '/../config/config_alegra.php';

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

$hoy = (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');

// Alegra pagina de a 30 registros — recorremos varias páginas hasta agotar
// resultados o llegar a un tope de seguridad.
$byClient = [];
$start = 0;
$limitPorPagina = 30;
$topeSeguridad = 20; // hasta 600 facturas vencidas
for ($pagina = 0; $pagina < $topeSeguridad; $pagina++) {
  $facturas = _acrGet('https://api.alegra.com/api/v1/invoices?' . http_build_query([
    'status'          => 'open',
    'dueDate_before'  => $hoy,
    'order_field'     => 'dueDate',
    'order_direction' => 'ASC',
    'limit'           => $limitPorPagina,
    'start'           => $start,
  ]), $authHeader);

  if (!is_array($facturas) || empty($facturas)) break;

  foreach ($facturas as $f) {
    $balance = isset($f['balance']) ? (float)$f['balance'] : (float)($f['total'] ?? 0);
    if ($balance <= 0) continue;
    $cliente = $f['client'] ?? null;
    if (!$cliente || empty($cliente['id'])) continue;
    $cid = (string)$cliente['id'];
    $numero = $f['numberTemplate']['fullNumber'] ?? $f['numberTemplate']['number'] ?? ($f['number'] ?? (string)($f['id'] ?? ''));
    $dueDate = $f['dueDate'] ?? '';
    $date = $f['date'] ?? $dueDate;

    if (!isset($byClient[$cid])) {
      $byClient[$cid] = [
        'clienteId'       => $cid,
        'clienteNombre'   => $cliente['name'] ?? '(sin nombre)',
        'facturas'        => [],
        'totalDeuda'      => 0.0,
        'fechaMasAntigua' => $dueDate ?: $date,
      ];
    }
    $byClient[$cid]['facturas'][] = ['num' => $numero, 'balance' => $balance, 'dueDate' => $dueDate, 'date' => $date];
    $byClient[$cid]['totalDeuda'] += $balance;
    $fecha = $dueDate ?: $date;
    if ($fecha && $fecha < $byClient[$cid]['fechaMasAntigua']) $byClient[$cid]['fechaMasAntigua'] = $fecha;
  }

  if (count($facturas) < $limitPorPagina) break; // última página
  $start += $limitPorPagina;
}

// Adjuntar email/celular locales (tabla clientes) por alegra_id, si existen.
if (!empty($byClient)) {
  $ids = array_keys($byClient);
  $in  = implode(',', array_fill(0, count($ids), '?'));
  $stmt = $pdo->prepare("SELECT alegra_id, email, celular FROM clientes WHERE alegra_id IN ($in)");
  $stmt->execute($ids);
  foreach ($stmt->fetchAll() as $row) {
    $cid = (string)$row['alegra_id'];
    if (isset($byClient[$cid])) {
      $byClient[$cid]['email']   = $row['email']   ?: null;
      $byClient[$cid]['celular'] = $row['celular'] ?: null;
    }
  }
}

$out = array_values($byClient);
foreach ($out as &$c) {
  $c['email']   = $c['email']   ?? null;
  $c['celular'] = $c['celular'] ?? null;
}
unset($c);

usort($out, fn($a, $b) => $b['totalDeuda'] <=> $a['totalDeuda']);

jsonOut(['actualizado' => $hoy, 'clientes' => $out]);

function _acrGet(string $url, array $headers) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_TIMEOUT => 15,
  ]);
  $resp = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($resp === false || $status < 200 || $status >= 300) return null;
  $data = json_decode($resp, true);
  return $data;
}
