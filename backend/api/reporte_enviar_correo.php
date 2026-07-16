<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();
require_once __DIR__ . '/../lib/mailer.php';

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// GET /reporte_enviar_correo.php?reporteId=UUID
// Lee el email del cliente directo desde nuestra tabla clientes.
// --------------------------------------------------------------
if ($method === 'GET') {
  $reporteId = $_GET['reporteId'] ?? null;
  if (!$reporteId) jsonOut(['error' => 'reporteId requerido'], 400);

  $stmt = $pdo->prepare("
    SELECT c.email
    FROM reportes r
    JOIN tareas t      ON t.id      COLLATE utf8mb4_general_ci = r.tarea_id COLLATE utf8mb4_general_ci
    LEFT JOIN clientes c ON c.nombre COLLATE utf8mb4_general_ci = t.cliente  COLLATE utf8mb4_general_ci
    WHERE r.id = ?
  ");
  $stmt->execute([$reporteId]);
  $row = $stmt->fetch();
  if ($row === false) jsonOut(['error' => 'Reporte no encontrado'], 404);

  jsonOut(['cliente_email_alegra' => $row['email'] ?? null]);
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

  $stmt = $pdo->prepare("SELECT r.*, t.titulo, t.cliente, t.reporte_interno FROM reportes r JOIN tareas t ON t.id = r.tarea_id COLLATE utf8mb4_general_ci WHERE r.id = ?");
  $stmt->execute([$reporteId]);
  $rep = $stmt->fetch();
  if (!$rep) jsonOut(['error' => 'Reporte no encontrado'], 404);
  if (!$rep['pdf_archivo']) jsonOut(['error' => 'Este reporte aún no tiene un PDF generado'], 422);

  // Freno de seguridad: si se envió hace menos de 20 segundos, no reenviar.
  if (!empty($rep['enviado_en'])) {
    $segundosDesdeEnvio = time() - strtotime($rep['enviado_en']);
    if ($segundosDesdeEnvio >= 0 && $segundosDesdeEnvio < 20) {
      jsonOut([
        'error' => 'Este reporte ya se envió hace ' . $segundosDesdeEnvio . ' segundos (a: ' . ($rep['enviado_a'] ?: '-') . '). Espera un momento antes de reenviarlo para evitar duplicados.',
      ], 429);
    }
  }

  $correos = $d['correos'] ?? [];
  if (!is_array($correos)) $correos = [];
  if (!empty($rep['reporte_interno'])) {
    // Reporte solo interno: ignorar correo del cliente, enviar solo al admin
    $correos = [CORREO_ADMIN_FIJO];
  } else {
    $correos[] = CORREO_ADMIN_FIJO;
    $correos = array_values(array_unique(array_filter(array_map('trim', $correos))));
  }

  $rutaPdf = __DIR__ . '/../uploads/reporte_pdf/' . $rep['pdf_archivo'];

  // Fecha de la visita en español
  $fechaVisita = '';
  if (!empty($rep['check_in'])) {
    $meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    $dt = new DateTime($rep['check_in'], new DateTimeZone('America/Bogota'));
    $fechaVisita = $dt->format('j') . ' de ' . $meses[(int)$dt->format('n') - 1] . ' de ' . $dt->format('Y');
  }

  $tituloH  = htmlspecialchars($rep['titulo'] ?: 'servicio técnico');
  $clienteH = htmlspecialchars($rep['cliente'] ?: '');

  $esInterno = !empty($rep['reporte_interno']);
  $asunto = $esInterno
    ? "🔔 [Reporte interno] Visita técnica — " . ($rep['titulo'] ?: 'Tarea')
    : "🧾 Reporte de visita técnica — " . ($rep['cliente'] ?: 'Cliente');
  $cuerpo = "<div style='font-family:Arial,sans-serif;max-width:600px;color:#1e293b'>"
    . "<p>Buen día. Adjunto el reporte de visita técnica para <b>{$tituloH}</b>"
    . ($clienteH ? " – {$clienteH}" : '')
    . ($fechaVisita ? ", realizada el {$fechaVisita}" : '') . ".</p>"
    . "<p>Agradecemos su confianza en Grupo Innovate. Estamos siempre disponibles para apoyarle en sus próximas necesidades de soporte técnico. ¡Será un gusto servirle de nuevo! 🔧</p>"
    . "<hr style='border:none;border-top:1px solid #e2e8f0;margin:20px 0'>"
    . "<p style='color:#64748b;font-size:13px;margin:0'>"
    . "<strong style='color:#169BBC'>Grupo Innovate</strong> · 📞 317 645 2811 · "
    . "<a href='mailto:info@innovate.com.co' style='color:#169BBC;text-decoration:none'>info@innovate.com.co</a><br>"
    . "<span style='color:#94a3b8;font-size:12px'>Mensaje enviado por Ginno, asistente de Grupo Innovate</span>"
    . "</p></div>";

  $ok = enviarCorreoConAdjunto($correos, $asunto, $cuerpo, $rutaPdf, $rep['pdf_archivo']);
  if (!$ok) jsonOut(['error' => 'No se pudo enviar el correo (revisa la configuración de correo del servidor)'], 500);

  $pdo->prepare("UPDATE reportes SET estado='enviado', enviado_a=?, enviado_en=NOW() WHERE id=?")
    ->execute([implode(', ', $correos), $reporteId]);

  jsonOut(['ok' => true, 'enviado_a' => $correos]);
}

jsonOut(['error' => 'Método no soportado'], 405);
