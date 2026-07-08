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

// GET ?id=X — devuelve {id, name, address, email} de un contacto por su ID de Alegra
if (!empty($_GET['id'])) {
  $alegraId = intval($_GET['id']);
  $url2 = "https://api.alegra.com/api/v1/contacts/{$alegraId}";
  $ch2 = curl_init($url2);
  curl_setopt_array($ch2, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
      'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
      'Accept: application/json',
    ],
    CURLOPT_TIMEOUT => 8,
  ]);
  $resp2   = curl_exec($ch2);
  $status2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
  curl_close($ch2);
  if ($resp2 === false || $status2 < 200 || $status2 >= 300) jsonOut([]);
  $c2 = json_decode($resp2, true);
  if (!is_array($c2) || empty($c2['id'])) jsonOut([]);
  $addr2 = null;
  if (!empty($c2['address'])) {
    $addr2 = is_array($c2['address']) ? ($c2['address']['address'] ?? null) : (string)$c2['address'];
  }
  $email2 = null;
  if (!empty($c2['email'])) {
    if (is_array($c2['email'])) {
      $email2 = $c2['email'][0]['address'] ?? ($c2['email'][0] ?? null);
      if (is_array($email2)) $email2 = null;
    } else {
      $email2 = (string)$c2['email'];
    }
  }
  jsonOut(['id' => $c2['id'], 'name' => $c2['name'] ?? '', 'address' => $addr2, 'email' => $email2]);
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
    // Extraer dirección si Alegra la devuelve (puede ser string u objeto)
    $addr = null;
    if (!empty($c['address'])) {
      if (is_array($c['address'])) {
        $addr = $c['address']['address'] ?? null;
      } else {
        $addr = (string)$c['address'];
      }
    }
    // Extraer email (puede ser string o array de objetos {address:...})
    $email = null;
    if (!empty($c['email'])) {
      if (is_array($c['email'])) {
        $email = $c['email'][0]['address'] ?? ($c['email'][0] ?? null);
        if (is_array($email)) $email = null;
      } else {
        $email = (string)$c['email'];
      }
    }
    $out[] = ['id' => $c['id'], 'name' => $c['name'], 'address' => $addr, 'email' => $email];
  }
}

jsonOut($out);
