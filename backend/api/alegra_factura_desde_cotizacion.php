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
  // OJO: esta búsqueda por palabra suelta puede traer falsos positivos
  // (ej. "SAN" matchea "Sanchez", "Santimone", etc.) — por eso todo
  // resultado se anota con match_exacto/score y se ordena por relevancia
  // más abajo, en vez de confiar en el orden que devuelve Alegra.
  if (empty($clientesCandidatos)) {
    $palabras = preg_split('/\s+/', trim(preg_replace('/^[A-Z]\.[A-Z]\.\s*/i', '', $datos['cliente_nombre'])));
    $palabras = array_values(array_filter($palabras, fn($p) => mb_strlen($p) >= 3));
    if (count($palabras) >= 1) {
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

  if (!empty($clientesCandidatos)) {
    // Anotar coincidencia exacta (nombre normalizado igual o contenido
    // completo en uno u otro sentido) y un score de similitud, luego
    // ordenar: exactos primero, después por score descendente. Así el
    // candidato correcto queda de primero aunque el fallback por palabra
    // suelta haya traído resultados irrelevantes.
    foreach ($clientesCandidatos as &$c) {
      $m = _matchClienteInfo($datos['cliente_nombre'], $c['name']);
      $c['match_exacto'] = $m['exacto'];
      $c['score'] = $m['score'];
    }
    unset($c);
    usort($clientesCandidatos, function ($a, $b) {
      if ($a['match_exacto'] !== $b['match_exacto']) {
        return $a['match_exacto'] ? -1 : 1;
      }
      return $b['score'] <=> $a['score'];
    });
    // limitar para no saturar el select con coincidencias irrelevantes
    $clientesCandidatos = array_slice($clientesCandidatos, 0, 8);
  }

  if (empty($clientesCandidatos)) {
    $avisoCliente = 'No se encontró ningún cliente en Alegra que coincida con "' . $datos['cliente_nombre'] . '". '
      . 'Verifica el nombre o crea el contacto directamente en Alegra y vuelve a intentarlo.';
  }
} else {
  $avisoCliente = 'No se pudo identificar el nombre del cliente en la cotización.';
}

$hayMatchExacto = !empty($clientesCandidatos) && !empty($clientesCandidatos[0]['match_exacto']);

// --- Armar respuesta ---
jsonOut([
  'tareaId'            => $tareaId,
  'ctinn'              => $datos['ctinn'],
  'cliente_nombre_cotizacion' => $datos['cliente_nombre'],
  'clientes_candidatos' => $clientesCandidatos,
  'hay_match_exacto'   => $hayMatchExacto,
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
 * Normaliza un nombre de cliente para comparación: mayúsculas, sin tildes,
 * sin sufijos jurídicos comunes (S.A.S, LTDA, E.U.) ni puntuación, espacios
 * colapsados.
 */
function _normalizarNombreCliente(string $s): string {
  $s = trim($s);
  if ($s === '') return '';
  $s = mb_strtoupper($s, 'UTF-8');
  $s = strtr($s, [
    'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ñ' => 'N', 'Ü' => 'U',
  ]);
  $s = preg_replace('/\b(S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|LTDA|E\.?\s?U\.?)\b\.?/u', ' ', $s);
  $s = preg_replace('/[.,]/', ' ', $s);
  $s = preg_replace('/\s+/', ' ', $s);
  return trim($s);
}

/**
 * Compara el nombre de cliente de la cotización contra un candidato de
 * Alegra. "Exacto" = nombres normalizados iguales, o uno contenido
 * completo dentro del otro (frase completa, no palabra suelta) — esto es
 * lo que evita que un match parcial por palabra común (ej. "SAN") se
 * marque como si fuera confiable. "score" = % de similitud (similar_text),
 * usado solo para ordenar cuando no hay match exacto.
 */
function _matchClienteInfo(string $nombreCotizacion, string $nombreCandidato): array {
  $a = _normalizarNombreCliente($nombreCotizacion);
  $b = _normalizarNombreCliente($nombreCandidato);
  if ($a === '' || $b === '') return ['exacto' => false, 'score' => 0];

  $exacto = ($a === $b) || (mb_strpos($b, $a) !== false) || (mb_strpos($a, $b) !== false);

  similar_text($a, $b, $pct);
  return ['exacto' => $exacto, 'score' => (int) round($pct)];
}

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
