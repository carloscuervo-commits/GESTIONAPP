<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

require_once __DIR__ . '/../config/config_alegra.php';
require_once __DIR__ . '/../lib/cotizacion_docx_parser.php';

// --------------------------------------------------------------
// POST /alegra_factura_desde_cotizacion.php
// Recibe un .docx de cotización (multipart/form-data, campo "file"),
// lo parsea según las reglas de FACTURACION.md y devuelve un JSON
// con los datos listos para revisar/editar antes de crear la factura
// en Alegra (no crea nada todavía).
// --------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

// Permite dos orígenes para el .docx:
// 1) archivo subido directamente (campo "file")
// 2) "tareaId": usa la cotización ya adjuntada a esa tarea de Comercial
$tareaId = $_POST['tareaId'] ?? null;

if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
  $tmpPath = $_FILES['file']['tmp_name'];
  $nombreOriginal = $_FILES['file']['name'];

  if (!preg_match('/\.docx$/i', $nombreOriginal)) {
    jsonOut(['error' => 'El archivo debe ser .docx'], 400);
  }
} elseif ($tareaId) {
  $tmpPath = __DIR__ . '/../uploads/cotizaciones/' . $tareaId . '.docx';
  if (!file_exists($tmpPath)) {
    jsonOut(['error' => 'No hay cotización adjunta a esta tarea'], 404);
  }
} else {
  jsonOut(['error' => 'No se recibió el archivo (campo "file") ni "tareaId"'], 400);
}

try {
  $datos = parseCotizacionDocx($tmpPath);
} catch (Exception $e) {
  jsonOut(['error' => 'No se pudo leer la cotización: ' . $e->getMessage()], 422);
}

if (empty($datos['items'])) {
  jsonOut(['error' => 'No se encontraron ítems reconocibles (IT/IF/MIT/MIF) en la cotización'], 422);
}

// --- Buscar cliente en Alegra por nombre ---
$clientesCandidatos = [];
$avisoCliente = null;

if (!empty($datos['cliente_nombre'])) {
  $clientesCandidatos = _buscarContactosAlegra($datos['cliente_nombre']);

  // Si no hay resultados y el nombre tiene varias palabras, intentar con
  // una búsqueda más corta (las últimas 1-2 palabras), porque el nombre
  // en la cotización puede ser más corto que el registrado en Alegra
  // (ej. "VERDE HORIZONTE" vs "CONDOMINIO CAMPESTRE VERDEHORIZONTE").
  if (empty($clientesCandidatos)) {
    $palabras = preg_split('/\s+/', trim(preg_replace('/^[A-Z]\.[A-Z]\.\s*/i', '', $datos['cliente_nombre'])));
    $palabras = array_values(array_filter($palabras, fn($p) => mb_strlen($p) >= 3));
    if (count($palabras) > 1) {
      // probar con cada palabra individualmente y combinar resultados
      $vistos = [];
      foreach ($palabras as $palabra) {
        foreach (_buscarContactosAlegra($palabra) as $c) {
          if (!isset($vistos[$c['id']])) {
            $vistos[$c['id']] = $c;
          }
        }
      }
      $clientesCandidatos = array_values($vistos);
    }
  }

  if (empty($clientesCandidatos)) {
    $avisoCliente = 'No se encontró ningún cliente en Alegra que coincida con "' . $datos['cliente_nombre'] . '". '
      . 'Verifica el nombre o crea el contacto directamente en Alegra y vuelve a intentarlo.';
  }
} else {
  $avisoCliente = 'No se pudo identificar el nombre del cliente en la cotización.';
}

// --- Armar respuesta ---
jsonOut([
  'tareaId'            => $tareaId,
  'ctinn'              => $datos['ctinn'],
  'cliente_nombre_cotizacion' => $datos['cliente_nombre'],
  'clientes_candidatos' => $clientesCandidatos,
  'aviso_cliente'      => $avisoCliente,
  'fecha_cotizacion'   => $datos['fecha_cotizacion'],
  'date'               => date('Y-m-d'), // fecha de la factura = hoy
  'dueDate'            => date('Y-m-d', strtotime('+8 days')), // vencimiento por defecto: 8 días
  'items'              => $datos['items'],
  'totales_cotizacion' => [
    'subtotal' => $datos['subtotal'],
    'iva'      => $datos['iva'],
    'total'    => $datos['total'],
  ],
]);

/**
 * Busca contactos en Alegra por nombre (parcial) y devuelve
 * [{id, name}, ...]
 */
function _buscarContactosAlegra(string $q): array {
  $q = trim($q);
  if ($q === '' || mb_strlen($q) < 2) return [];

  if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
    return [];
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
  curl_close($ch);

  if ($resp === false || $status < 200 || $status >= 300) return [];

  $data = json_decode($resp, true);
  if (!is_array($data)) return [];

  $out = [];
  foreach ($data as $c) {
    if (!empty($c['id']) && !empty($c['name'])) {
      $out[] = ['id' => $c['id'], 'name' => $c['name']];
    }
  }
  return $out;
}
