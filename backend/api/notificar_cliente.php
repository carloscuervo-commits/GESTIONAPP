<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();
require_once __DIR__ . '/../lib/mailer.php';

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// Etiqueta amigable para el cliente del estado actual de la tarjeta (IT/IF).
// No usa el lenguaje interno del kanban (ej. "Por facturar") — es texto
// pensado para que lo lea el cliente, no el equipo.
function _ncEstadoLabel(string $estado): string {
  $labels = [
    'solicitud'        => 'Solicitud registrada, pendiente de programar',
    'programado'        => 'Visita programada',
    'por_reprogramar'   => 'Pendiente de reprogramación',
    'realizado'         => 'Visita realizada',
    'facturado'         => 'Servicio facturado',
    'archivado'         => 'Cerrado',
    'cancelado'         => 'Cancelado',
  ];
  return $labels[$estado] ?? ucfirst(str_replace('_', ' ', $estado));
}

function _ncFormatFecha(?string $fecha): string {
  if (!$fecha) return '';
  $meses = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  $dt = new DateTime($fecha);
  return $dt->format('j') . ' de ' . $meses[(int)$dt->format('n')] . ' de ' . $dt->format('Y');
}

function _ncFormatHora(?string $hora): string {
  if (!$hora) return '';
  [$h, $m] = array_pad(explode(':', $hora), 2, '00');
  $h = (int)$h;
  $sufijo = $h >= 12 ? 'p.m.' : 'a.m.';
  $h12 = $h % 12 ?: 12;
  return "{$h12}:{$m} {$sufijo}";
}

// Recopila el estado actual de la tarjeta (título, cliente, estado en
// lenguaje amigable, fecha/hora programada si aplica, técnicos asignados) y
// el correo del cliente registrado. Fuente única usada tanto por el GET
// (previsualización + precarga del popup) como por el POST (envío real) —
// así el correo que se manda siempre refleja el dato más reciente, no lo
// que se cargó cuando se abrió el popup.
function _ncDatosTarea(PDO $pdo, string $tareaId): ?array {
  $stmt = $pdo->prepare("
    SELECT t.id, t.titulo, t.cliente, t.area, t.estado,
           t.fecha_programacion, t.hora_programacion,
           c.email AS cliente_email
    FROM tareas t
    LEFT JOIN clientes c ON c.nombre COLLATE utf8mb4_general_ci = t.cliente COLLATE utf8mb4_general_ci
    WHERE t.id = ?
  ");
  $stmt->execute([$tareaId]);
  $t = $stmt->fetch();
  if (!$t) return null;

  $stmtTec = $pdo->prepare("
    SELECT u.nombre
    FROM usuarios u
    JOIN tarea_equipo te ON te.usuario_id = u.id
    WHERE te.tarea_id = ?
    ORDER BY u.nombre ASC
  ");
  $stmtTec->execute([$tareaId]);
  $tecnicos = array_column($stmtTec->fetchAll(), 'nombre');

  $fechaFmt = _ncFormatFecha($t['fecha_programacion']);
  $horaFmt  = _ncFormatHora($t['hora_programacion']);
  $fechaHora = $fechaFmt ? trim($fechaFmt . ($horaFmt ? " · {$horaFmt}" : '')) : null;

  $estadoLabel = _ncEstadoLabel($t['estado']);

  return [
    'tarea_id'      => $t['id'],
    'cliente'       => $t['cliente'],
    'cliente_email' => $t['cliente_email'],
    'titulo'        => $t['titulo'],
    'estado_label'  => $estadoLabel,
    'fecha_hora'    => $fechaHora,
    'tecnicos'      => $tecnicos,
  ];
}

function _ncTextoWhatsApp(array $d): string {
  $lineas = [];
  $lineas[] = "Hola" . ($d['cliente'] ? " {$d['cliente']}" : '') . ", te escribimos desde Grupo Innovate sobre tu servicio:";
  $lineas[] = "";
  $lineas[] = "🔧 " . ($d['titulo'] ?: 'Servicio técnico');
  $lineas[] = "📌 Estado: " . $d['estado_label'];
  if ($d['fecha_hora']) $lineas[] = "📅 Fecha programada: " . $d['fecha_hora'];
  if (!empty($d['tecnicos'])) $lineas[] = "👷 Técnico(s) asignado(s): " . implode(', ', $d['tecnicos']);
  $lineas[] = "";
  $lineas[] = "Cualquier duda, quedamos atentos.";
  $lineas[] = "Grupo Innovate · 317 645 2811";
  return implode("\n", $lineas);
}

function _ncHtmlCorreo(array $d): string {
  $tituloH  = htmlspecialchars($d['titulo'] ?: 'servicio técnico');
  $clienteH = htmlspecialchars($d['cliente'] ?: '');
  $filaFecha = $d['fecha_hora'] ? "
      <tr style=\"background:#ffffff\">
        <td style=\"padding:7px 14px;color:#0D3B40;font-size:13px;font-weight:600;width:130px\">Fecha programada</td>
        <td style=\"padding:7px 14px;font-size:13px;color:#1A1A1A\">" . htmlspecialchars($d['fecha_hora']) . "</td>
      </tr>" : '';
  $filaTecnicos = !empty($d['tecnicos']) ? "
      <tr style=\"background:#D6F3F4\">
        <td style=\"padding:7px 14px;color:#0D3B40;font-size:13px;font-weight:600\">Técnico(s)</td>
        <td style=\"padding:7px 14px;font-size:13px;color:#1A1A1A\">" . htmlspecialchars(implode(', ', $d['tecnicos'])) . "</td>
      </tr>" : '';

  return "
<!DOCTYPE html>
<html lang=\"es\">
<head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>
<body style=\"margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif\">
  <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f0f0f0;padding:32px 0\">
    <tr><td align=\"center\">
      <table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;width:100%;background:#ffffff\">
        <tr>
          <td style=\"background:#0D3B40;padding:24px 32px 20px;text-align:center\">
            <div style=\"font-size:22px;font-weight:700;color:#169BBC;letter-spacing:1px\">INNOVATE</div>
            <div style=\"font-size:12px;color:#D6F3F4;margin-top:2px\">Grupo Innovate SAS</div>
            <div style=\"height:2px;background:#169BBC;width:48px;margin:12px auto 10px\"></div>
            <div style=\"font-size:13px;color:#D6F3F4\">Novedades de tu servicio</div>
          </td>
        </tr>
        <tr>
          <td style=\"padding:24px 32px 0\">
            <p style=\"margin:0;font-size:14px;color:#1A1A1A\">Estimado cliente <strong>{$clienteH}</strong>,</p>
            <p style=\"margin:10px 0 0;font-size:13px;color:#555555;line-height:1.6\">Le compartimos el estado actual de su servicio con Grupo Innovate.</p>
          </td>
        </tr>
        <tr>
          <td style=\"padding:18px 32px 0\">
            <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;border:1px solid #169BBC\">
              <tr style=\"background:#0D3B40\">
                <th colspan=\"2\" style=\"padding:8px 14px;text-align:left;font-size:12px;color:#ffffff;font-weight:700;letter-spacing:0.5px\">ESTADO DEL SERVICIO</th>
              </tr>
              <tr style=\"background:#D6F3F4\">
                <td style=\"padding:7px 14px;color:#0D3B40;font-size:13px;font-weight:600;width:130px\">Servicio</td>
                <td style=\"padding:7px 14px;font-size:13px;color:#1A1A1A;font-weight:700\">{$tituloH}</td>
              </tr>
              <tr style=\"background:#ffffff\">
                <td style=\"padding:7px 14px;color:#0D3B40;font-size:13px;font-weight:600\">Estado</td>
                <td style=\"padding:7px 14px;font-size:13px;color:#1A1A1A\">" . htmlspecialchars($d['estado_label']) . "</td>
              </tr>
              {$filaFecha}
              {$filaTecnicos}
            </table>
          </td>
        </tr>
        <tr>
          <td style=\"padding:18px 32px 24px\">
            <div style=\"background:#D6F3F4;border:1px solid #169BBC;padding:12px 16px\">
              <div style=\"font-size:13px;color:#0D3B40;font-weight:700;margin-bottom:6px\">¿Alguna pregunta?</div>
              <div style=\"font-size:13px;color:#555555\">
                ✉ <a href=\"mailto:soporte@innovate.com.co\" style=\"color:#169BBC;text-decoration:none\">soporte@innovate.com.co</a>
                &nbsp;·&nbsp;
                ☎ <a href=\"tel:+573176452811\" style=\"color:#169BBC;text-decoration:none\">317 645 2811</a>
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <td style=\"background:#0D3B40;border-top:2px solid #169BBC;padding:12px 32px;text-align:center\">
            <div style=\"font-size:11px;color:#9ecfd2\">Cra. 30 #6-06 Of. 501 · Cali · 317 649 0590</div>
            <div style=\"font-size:11px;color:#6fa8ad;margin-top:2px\">Mensaje enviado por Ginno, asistente de Grupo Innovate</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>";
}

// --------------------------------------------------------------
// GET /notificar_cliente.php?tareaId=UUID
// Previsualización: correo del cliente + texto listo para WhatsApp + resumen.
// --------------------------------------------------------------
if ($method === 'GET') {
  $tareaId = $_GET['tareaId'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tareaId requerido'], 400);

  $d = _ncDatosTarea($pdo, $tareaId);
  if (!$d) jsonOut(['error' => 'Tarea no encontrada'], 404);

  jsonOut([
    'cliente_email'  => $d['cliente_email'],
    'texto_whatsapp' => _ncTextoWhatsApp($d),
    'resumen'        => [
      'cliente'      => $d['cliente'],
      'titulo'       => $d['titulo'],
      'estado_label' => $d['estado_label'],
      'fecha_hora'   => $d['fecha_hora'],
      'tecnicos'     => $d['tecnicos'],
    ],
  ]);
}

// --------------------------------------------------------------
// POST /notificar_cliente.php
// body: { tareaId, correos: [..] }  (siempre se agrega administrativo@innovate.com.co)
// Envía por correo un resumen del estado actual de la tarjeta (sin depender
// de que exista un reporte de visita finalizado).
// --------------------------------------------------------------
if ($method === 'POST') {
  $body = jsonInput();
  $tareaId = $body['tareaId'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tareaId requerido'], 400);

  $d = _ncDatosTarea($pdo, $tareaId);
  if (!$d) jsonOut(['error' => 'Tarea no encontrada'], 404);

  $correos = $body['correos'] ?? [];
  if (!is_array($correos)) $correos = [];
  $correos[] = CORREO_ADMIN_FIJO;
  $correos = array_values(array_unique(array_filter(array_map('trim', $correos))));

  if (count($correos) <= 1) { // solo quedó el admin: no hay destinatario real
    jsonOut(['error' => 'Ingresa al menos un correo del cliente antes de enviar.'], 422);
  }

  $asunto = "📣 Novedades de tu servicio — " . ($d['titulo'] ?: 'Grupo Innovate');
  $html   = _ncHtmlCorreo($d);

  $ok = enviarCorreoConAdjunto($correos, $asunto, $html);
  if (!$ok) jsonOut(['error' => 'No se pudo enviar el correo (revisa la configuración de correo del servidor)'], 500);

  jsonOut(['ok' => true, 'enviado_a' => $correos]);
}

jsonOut(['error' => 'Método no soportado'], 405);
