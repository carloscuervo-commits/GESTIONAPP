<?php
/**
 * cartera_mensaje.php — POST /cartera_mensaje.php
 * body: { clienteNombre, facturas:[{num,date,dueDate,balance}], nivel: cordial|firme|prejuridico,
 *         clienteAlegraId?, nombreContacto?, fechaContacto? }
 *
 * Genera el asunto/HTML/texto del mensaje de cobro para ese cliente y nivel,
 * usando las facturas que el frontend ya tiene (las mismas que muestra el
 * tablero — no vuelve a consultar Alegra). Se usa para previsualizar antes
 * de enviar por correo, o de abrir el enlace de WhatsApp (nivel 'firme').
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
$clienteAlegraId = trim((string)($d['clienteAlegraId'] ?? ''));

if ($clienteNombre === '' || !is_array($facturas) || empty($facturas)) {
  jsonOut(['error' => 'Faltan clienteNombre y/o facturas[]'], 400);
}

$opciones = [];

if ($nivel === 'firme') {
  // Etapa 2 (WhatsApp/llamada): nombre de quien se contactó (lo escribe el
  // admin en el modal, no se guarda en ningún lado) y la fecha del primer
  // correo — si no la mandaron, se usa la del último contacto que ya
  // tengamos registrado para este cliente (normalmente cuando se envió el
  // correo de la Etapa 1).
  $opciones['nombreContacto'] = trim((string)($d['nombreContacto'] ?? ''));
  $fechaContacto = trim((string)($d['fechaContacto'] ?? ''));
  if ($fechaContacto === '' && $clienteAlegraId !== '') {
    $stmt = $pdo->prepare("SELECT fecha_ultimo_contacto FROM cartera_gestion WHERE cliente_alegra_id = ?");
    $stmt->execute([$clienteAlegraId]);
    $fechaContacto = (string)($stmt->fetchColumn() ?: '');
  }
  $opciones['fechaContacto'] = $fechaContacto;
} elseif ($nivel === 'prejuridico') {
  // Días hábiles de plazo que se mencionan en el texto antes de escalar a
  // cobro prejurídico — es un dato del mensaje, no el mismo concepto que
  // "cartera_dias_recordatorio" (que solo prellena la próxima fecha de
  // seguimiento en el tablero).
  $opciones['diasPlazo'] = 5;
}

$msg = carteraGenerarMensaje($clienteNombre, $facturas, $nivel, $opciones);
jsonOut($msg);
