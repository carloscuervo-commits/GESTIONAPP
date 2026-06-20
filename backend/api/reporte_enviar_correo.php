<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();
require_once __DIR__ . '/../config/config_alegra.php';
require_once __DIR__ . '/../lib/mailer.php';

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// GET /reporte_enviar_correo.php?reporteId=UUID
// Busca el correo del cliente en Alegra (para precargar en el form).
// --------------------------------------------------------------
if ($method === 'GET') {
  $reporteId = $_GET['reporteId'] ?? null;
  if (!$reporteId) jsonOut(['error' => 'reporteId requerido'], 400);

  $stmt = $pdo->prepare("SELECT t.cliente FROM reportes r JOIN tareas t ON t.id = r.tarea_id WHERE r.id = ?");
  $stmt->execute([$reporteId]);
  $row = $stmt->fetch();
  if (!$row) jsonOut(['error' => 'Reporte no encontrado'], 404);

  $email = $row['cliente'] ? _buscarEmailClienteAlegra($row['cliente']) : null;
  jsonOut(['cliente_email_alegra' => $email]);
}

// --------------------------------------------------------------
// POST /reporte_enviar_correo.php
// body: { reporteId, correos: [..] }  (siempre se agrega administrativo@innovate.com.co)
// Envía el PDF del reporte por correo y registra enviado_a/enviado_en.
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  $reporteId = $d['reporteId'] ?? null;
  if (!$reporteId) jsonOut(['error' => 'reporteId requerido'], 400);

  $stmt = $pdo->prepare("SELECT r.*, t.titulo, t.cliente FROM reportes r JOIN tareas t ON t.id = r.tarea_id WHERE r.id = ?");
  $stmt->execute([$reporteId]);
  $rep = $stmt->fetch();
  if (!$rep) jsonOut(['error' => 'Reporte no encontrado'], 404);
  if (!$rep['pdf_archivo']) jsonOut(['error' => 'Este reporte aún no tiene un PDF generado'], 422);

  $correos = $d['correos'] ?? [];
  if (!is_array($correos)) $correos = [];
  $correos[] = CORREO_ADMIN_FIJO;
  $correos = array_values(array_unique(array_filter(array_map('trim', $correos))));

  $rutaPdf = __DIR__ . '/../uploads/reporte_pdf/' . $rep['pdf_archivo'];

  $asunto = "🧾 Reporte de visita — " . ($rep['cliente'] ?: 'Cliente') . " — " . $rep['titulo'];
  $cuerpo = "<p>Se adjunta el reporte de la visita técnica.</p>"
    . "<p><b>Cliente:</b> " . htmlspecialchars($rep['cliente'] ?: '-') . "<br>"
    . "<b>Tarea:</b> " . htmlspecialchars($rep['titulo']) . "</p>";

  $ok = enviarCorreoConAdjunto($correos, $asunto, $cuerpo, $rutaPdf, $rep['pdf_archivo']);
  if (!$ok) jsonOut(['error' => 'No se pudo enviar el correo (revisa la configuración de correo del servidor)'], 500);

  $pdo->prepare("UPDATE reportes SET estado='enviado', enviado_a=?, enviado_en=NOW() WHERE id=?")
    ->execute([implode(', ', $correos), $reporteId]);

  jsonOut(['ok' => true, 'enviado_a' => $correos]);
}

jsonOut(['error' => 'Método no soportado'], 405);

/**
 * Busca el primer contacto en Alegra que coincida con el nombre del
 * cliente y devuelve su email (o null si no se encuentra/no tiene).
 */
function _buscarEmailClienteAlegra(string $nombreCliente): ?string {
  if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') return null;
  $nombreCliente = trim($nombreCliente);
  if ($nombreCliente === '') return null;

  $url = 'https://api.alegra.com/api/v1/contacts?' . http_build_query(['name' => $nombreCliente, 'limit' => 5]);
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

  if ($resp === false || $status < 200 || $status >= 300) return null;
  $data = json_decode($resp, true);
  if (!is_array($data)) return null;

  foreach ($data as $c) {
    if (!empty($c['email'])) return $c['email'];
  }
  return null;
}
