<?php
/**
 * cartera_enviar_correo.php — POST /cartera_enviar_correo.php
 * body: { clienteAlegraId, clienteNombre, destinatarios: "correo1,correo2",
 *         asunto, cuerpoTexto, nivel, fechaProximoSeguimiento? }
 *
 * cuerpoTexto es el texto plano que el usuario ya revisó/editó en el modal
 * (mismo texto que se usaría para WhatsApp) — aquí se convierte a un HTML
 * simple (párrafos + saltos de línea) para el correo, en vez de recibir HTML
 * ya armado desde el frontend, así lo que se ve al editar es exactamente lo
 * que se envía por cualquiera de los dos canales.
 *
 * Envía el correo de cobro y registra la gestión en
 * cartera_gestion: fecha de contacto = hoy, nivel usado, y la próxima fecha
 * de seguimiento (la que el usuario haya dejado en el campo del modal, ya
 * sea el valor estándar sugerido o uno que haya cambiado para este caso).
 *
 * El estado del tablero avanza automáticamente a la columna de la etapa
 * correspondiente al nivel de la plantilla enviada (cordial->etapa1,
 * firme->etapa2, prejuridico->etapa3) — nunca retrocede: si ya estaba en
 * una etapa más adelantada (o en acuerdo/pagado) no se toca, para no
 * perder el trabajo manual del tablero. Ver cartera_estados.php.
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

require_once __DIR__ . '/../lib/cartera_estados.php';

$pdo = getDB();
$usuario = requireSesion($pdo, 'admin');

require_once __DIR__ . '/../lib/avisos_tecnicos.php'; // trae mailer.php (enviarCorreoConAdjunto) y configGet

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

$d = jsonInput();
$clienteAlegraId = trim($d['clienteAlegraId'] ?? '');
$clienteNombre   = trim($d['clienteNombre'] ?? '');
$destinatariosRaw = trim($d['destinatarios'] ?? '');
$asunto = trim($d['asunto'] ?? '');
$cuerpoTexto = $d['cuerpoTexto'] ?? '';
$nivel = $d['nivel'] ?? 'cordial';
$fechaProximoSeguimiento = trim($d['fechaProximoSeguimiento'] ?? '');

if ($clienteAlegraId === '' || $clienteNombre === '') jsonOut(['error' => 'clienteAlegraId y clienteNombre son requeridos'], 400);
if ($destinatariosRaw === '') jsonOut(['error' => 'Falta al menos un destinatario'], 400);
if ($asunto === '' || trim($cuerpoTexto) === '') jsonOut(['error' => 'Falta asunto o cuerpo del mensaje'], 400);

$destinatarios = array_values(array_filter(array_map('trim', explode(',', $destinatariosRaw))));
foreach ($destinatarios as $email) {
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonOut(['error' => "Correo inválido: {$email}"], 400);
}

$cuerpoHtml = "<div style='font-family:Arial,sans-serif;font-size:14px;color:#1e293b;white-space:pre-wrap;line-height:1.6'>"
  . nl2br(htmlspecialchars($cuerpoTexto, ENT_QUOTES, 'UTF-8'))
  . "</div>";

$ok = enviarCorreoConAdjunto($destinatarios, $asunto, $cuerpoHtml);
if (!$ok) jsonOut(['error' => 'No se pudo enviar el correo (revisa la configuración de envío del servidor)'], 502);

// Registrar la gestión
$hoy = (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');
if ($fechaProximoSeguimiento === '') {
  $diasEstandar = (int)(configGet($pdo, 'cartera_dias_recordatorio') ?? 7);
  $fechaProximoSeguimiento = (new DateTime($hoy))->modify("+{$diasEstandar} days")->format('Y-m-d');
}

$stmt = $pdo->prepare("SELECT estado FROM cartera_gestion WHERE cliente_alegra_id = ?");
$stmt->execute([$clienteAlegraId]);
$prev = $stmt->fetch();
$estadoNuevo = carteraEstadoTrasEnvio($prev['estado'] ?? 'por-contactar', $nivel);

$pdo->prepare("INSERT INTO cartera_gestion
    (cliente_alegra_id, cliente_nombre, estado, plantilla_nivel, fecha_ultimo_contacto, fecha_proximo_seguimiento, actualizado_por)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    cliente_nombre = VALUES(cliente_nombre), estado = VALUES(estado), plantilla_nivel = VALUES(plantilla_nivel),
    fecha_ultimo_contacto = VALUES(fecha_ultimo_contacto), fecha_proximo_seguimiento = VALUES(fecha_proximo_seguimiento),
    actualizado_por = VALUES(actualizado_por)")
  ->execute([$clienteAlegraId, $clienteNombre, $estadoNuevo, $nivel, $hoy, $fechaProximoSeguimiento, $usuario['id']]);

jsonOut(['ok' => true, 'estado' => $estadoNuevo, 'fechaProximoSeguimiento' => $fechaProximoSeguimiento]);
