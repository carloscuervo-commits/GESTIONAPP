<?php
/**
 * cartera_mensaje.php — POST /cartera_mensaje.php
 * body: { clienteNombre, facturas:[{numero,dueDate,balance}], nivel: cordial|firme|prejuridico }
 *
 * Genera el asunto/HTML/texto del mensaje de cobro para ese cliente y nivel,
 * usando las facturas que el frontend ya tiene (las mismas que muestra el
 * tablero — no vuelve a consultar Alegra). Se usa para previsualizar antes
 * de enviar por correo o de abrir el enlace de WhatsApp.
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
requireSesion($pdo, 'admin');

require_once __DIR__ . '/../lib/cartera_plantillas.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

$d = jsonInput();
$clienteNombre = trim($d['clienteNombre'] ?? '');
$facturas = $d['facturas'] ?? [];
$nivel = $d['nivel'] ?? 'cordial';

if ($clienteNombre === '' || !is_array($facturas) || empty($facturas)) {
  jsonOut(['error' => 'Faltan clienteNombre y/o facturas[]'], 400);
}

// Días hábiles de plazo que se mencionan en el texto del nivel "prejurídico"
// antes de escalar a cobro jurídico — es un dato del mensaje, no el mismo
// concepto que "cartera_dias_recordatorio" (que solo prellena la próxima
// fecha de seguimiento en el tablero).
$msg = carteraGenerarMensaje($clienteNombre, $facturas, $nivel, 5);
jsonOut($msg);
