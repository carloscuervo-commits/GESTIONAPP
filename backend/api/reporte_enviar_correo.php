<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();
require_once __DIR__ . '/../lib/mailer.php';
require_once __DIR__ . '/../lib/transportes.php';
require_once __DIR__ . '/../lib/checkout_visita.php';

$pdo = getDB();
requireSesion($pdo);
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

  // El correo YA salió en este punto — eso no se puede deshacer. A partir de
  // aquí, marcar el reporte como enviado y (si el checkout venía diferido,
  // ver reportes.js:_pendingCheckout) cerrar la visita del técnico quedan en
  // UNA sola transacción: antes esto eran dos llamadas de red separadas desde
  // el navegador (enviar correo, y luego un PUT aparte para el checkout), y
  // si la segunda se cortaba (mala señal, app cerrada) el reporte quedaba
  // 'enviado' con check_out sin escribir — sin ninguna forma automática de
  // corregirse (caso real: tarjeta #MU5HGW, 2026-09-17). Ahora el checkout se
  // hace aquí mismo, en el servidor, en el mismo request.
  $participanteId    = $d['participanteId']    ?? null;
  $tecnicoCheckoutId = $d['tecnicoCheckoutId'] ?? null;
  $checkoutLat       = isset($d['lat']) ? (float)$d['lat'] : null;
  $checkoutLng       = isset($d['lng']) ? (float)$d['lng'] : null;

  $pdo->beginTransaction();
  try {
    $pdo->prepare("UPDATE reportes SET estado='enviado', enviado_a=?, enviado_en=NOW() WHERE id=?")
      ->execute([implode(', ', $correos), $reporteId]);

    if ($participanteId) {
      // Checkout diferido de la visita (flujo normal: el técnico le dio
      // "Finalizar" y quedó pendiente hasta enviar el reporte). Incluye
      // transportes, horas de contrato y el aviso a administrativo.
      ejecutarCheckoutParticipante($pdo, $reporteId, $rep, $participanteId, $tecnicoCheckoutId, $checkoutLat, $checkoutLng, null);
    } else {
      // No hay checkout diferido (ya se había cerrado por otra vía, o es un
      // reenvío de un reporte ya completado): solo registrar transportes,
      // igual que antes — no bloqueante, un fallo aquí no debe tumbar la
      // confirmación de envío ya lograda.
      try {
        if (!empty($rep['tarea_id'])) crearTransportesTarea($pdo, $rep['tarea_id']);
      } catch (Throwable $e) { /* silencioso */ }
    }

    $pdo->commit();
  } catch (Throwable $e) {
    // El correo ya salió y no se puede deshacer, pero si algo falla al
    // cerrar la visita preferimos revertir el estado del reporte (queda
    // como estaba, normalmente 'activo') en vez de dejarlo a medias como
    // 'enviado' sin checkout: así el checkout automático de las 6:30pm lo
    // recoge esta misma tarde como red de seguridad. Si el técnico reintenta
    // "Enviar", el freno de 20s de arriba evita un duplicado inmediato.
    $pdo->rollBack();
    jsonOut(['error' => 'El correo se envió, pero no se pudo registrar el cierre de la visita. Intenta enviar de nuevo en un momento.'], 500);
  }

  jsonOut(['ok' => true, 'enviado_a' => $correos]);
}

jsonOut(['error' => 'Método no soportado'], 405);
