<?php
/**
 * Cron: recordatorio_visita_email.php
 * Envía aviso por correo al cliente el día anterior a una visita IT/IF programada.
 *
 * Condiciones para enviar:
 *  - area IN ('it','if')
 *  - fecha_programacion = mañana
 *  - avisar_cliente = 1
 *  - Al menos un técnico asignado (tarea_equipo)
 *  - El cliente tiene email en tabla clientes
 *
 * IMPORTANTE: cero output — usar > /dev/null 2>&1 en cPanel.
 * Cron command:
 *   0 18 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/recordatorio_visita_email.php > /dev/null 2>&1
 */

define('CRON_RUN', true);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/mailer.php';

@ini_set('display_errors', '0');
error_reporting(0);

// URL base pública del sistema (para foto del técnico)
define('GINNO_URL', 'https://grupoinnovate.com/ginno');

try {
  $pdo    = getDB();
  $manana = date('Y-m-d', strtotime('+1 day'));

  // 1. Obtener tareas que califican
  $stmt = $pdo->prepare("
    SELECT t.id, t.titulo, t.descripcion, t.fecha_programacion, t.hora_programacion,
           t.area, c.email AS cliente_email, t.cliente AS cliente_nombre
    FROM tareas t
    JOIN clientes c ON c.nombre COLLATE utf8mb4_general_ci = t.cliente COLLATE utf8mb4_general_ci
    WHERE t.area IN ('it','if')
      AND t.fecha_programacion = ?
      AND t.avisar_cliente = 1
      AND t.estado NOT IN ('archivado','cancelado')
      AND c.email IS NOT NULL
      AND c.email <> ''
      AND EXISTS (SELECT 1 FROM tarea_equipo te WHERE te.tarea_id = t.id)
  ");
  $stmt->execute([$manana]);
  $tareas = $stmt->fetchAll();

  foreach ($tareas as $tarea) {
    // 2. Obtener técnicos asignados (nombre, cedula, foto)
    $stmtTec = $pdo->prepare("
      SELECT u.id, u.nombre, u.cedula, u.foto
      FROM usuarios u
      JOIN tarea_equipo te ON te.usuario_id = u.id
      WHERE te.tarea_id = ?
      ORDER BY u.nombre ASC
    ");
    $stmtTec->execute([$tarea['id']]);
    $tecnicos = $stmtTec->fetchAll();

    if (empty($tecnicos)) continue;

    // 3. Construir HTML del correo
    $fechaFormateada = _formatearFecha($tarea['fecha_programacion']);
    $horaFormateada  = _formatearHora($tarea['hora_programacion']);
    $areaLabel       = strtoupper($tarea['area']) === 'IT' ? 'Soporte Técnico' : 'Infraestructura';

    $tecHtml = '';
    foreach ($tecnicos as $tec) {
      $fotoUrl = '';
      if ($tec['foto']) {
        $fotoUrl = GINNO_URL . '/backend/api/foto_tecnico.php?usuario_id=' . urlencode($tec['id']);
      }
      $fotoTag = $fotoUrl
        ? "<img src=\"{$fotoUrl}\" alt=\"" . htmlspecialchars($tec['nombre']) . "\" style=\"width:110px;height:auto;display:block;margin-bottom:8px;border:1px solid #169BBC\">"
        : "<div style=\"width:110px;height:140px;background:#D6F3F4;border:1px solid #169BBC;display:table-cell;text-align:center;vertical-align:middle;font-size:44px;margin-bottom:8px\">👤</div>";

      $cedulaLine = $tec['cedula'] ? "<div style=\"font-size:12px;color:#888888\">Cédula: " . htmlspecialchars($tec['cedula']) . "</div>" : '';

      $tecHtml .= "
        <div style=\"display:inline-block;text-align:center;margin:8px 20px 8px 0;vertical-align:top\">
          {$fotoTag}
          <div style=\"font-weight:700;font-size:14px;color:#1A1A1A\">" . htmlspecialchars($tec['nombre']) . "</div>
          {$cedulaLine}
        </div>";
    }

    $descripcionHtml = '';
    if (!empty($tarea['descripcion'])) {
      $descripcionHtml = "
        <tr style=\"background:#ffffff\">
          <td style=\"padding:7px 14px;color:#0D3B40;font-size:13px;font-weight:600;width:100px\">Descripción</td>
          <td style=\"padding:7px 14px;font-size:13px;color:#1A1A1A\">" . nl2br(htmlspecialchars($tarea['descripcion'])) . "</td>
        </tr>";
    }

    $html = "
<!DOCTYPE html>
<html lang=\"es\">
<head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>
<body style=\"margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif\">
  <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f0f0f0;padding:32px 0\">
    <tr><td align=\"center\">
      <table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;width:100%;background:#ffffff\">

        <!-- Cabecera -->
        <tr>
          <td style=\"background:#0D3B40;padding:24px 32px 20px;text-align:center\">
            <div style=\"font-size:22px;font-weight:700;color:#169BBC;letter-spacing:1px\">INNOVATE</div>
            <div style=\"font-size:12px;color:#D6F3F4;margin-top:2px\">Grupo Innovate SAS</div>
            <div style=\"height:2px;background:#169BBC;width:48px;margin:12px auto 10px\"></div>
            <div style=\"font-size:13px;color:#D6F3F4\">Aviso de visita programada</div>
          </td>
        </tr>

        <!-- Saludo -->
        <tr>
          <td style=\"padding:24px 32px 0\">
            <p style=\"margin:0;font-size:14px;color:#1A1A1A\">
              Estimado cliente <strong>" . htmlspecialchars($tarea['cliente_nombre']) . "</strong>,
            </p>
            <p style=\"margin:10px 0 0;font-size:13px;color:#555555;line-height:1.6\">
              Tiene programada una visita de <strong style=\"color:#1A1A1A\">{$areaLabel}</strong> para el día de mañana.
            </p>
          </td>
        </tr>

        <!-- Datos de la visita -->
        <tr>
          <td style=\"padding:18px 32px 0\">
            <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;border:1px solid #169BBC\">
              <tr style=\"background:#0D3B40\">
                <th colspan=\"2\" style=\"padding:8px 14px;text-align:left;font-size:12px;color:#ffffff;font-weight:700;letter-spacing:0.5px\">DETALLE DE LA VISITA</th>
              </tr>
              <tr style=\"background:#D6F3F4\">
                <td style=\"padding:7px 14px;color:#0D3B40;font-size:13px;font-weight:600;width:100px\">Servicio</td>
                <td style=\"padding:7px 14px;font-size:13px;color:#1A1A1A;font-weight:700\">" . htmlspecialchars($tarea['titulo']) . "</td>
              </tr>
              {$descripcionHtml}
              <tr style=\"background:#D6F3F4\">
                <td style=\"padding:7px 14px;color:#0D3B40;font-size:13px;font-weight:600\">Fecha</td>
                <td style=\"padding:7px 14px;font-size:13px;color:#1A1A1A\">{$fechaFormateada}</td>
              </tr>
              <tr style=\"background:#ffffff\">
                <td style=\"padding:7px 14px;color:#0D3B40;font-size:13px;font-weight:600\">Hora</td>
                <td style=\"padding:7px 14px;font-size:13px;color:#1A1A1A\">{$horaFormateada} <span style=\"color:#888888;font-size:12px\">(aprox.)</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Nota hora aproximada -->
        <tr>
          <td style=\"padding:14px 32px 0\">
            <div style=\"padding:10px 14px;background:#FFF4E0;border-left:3px solid #F29206\">
              <span style=\"font-size:12px;color:#555555;line-height:1.5\">La hora indicada es aproximada y puede variar según las condiciones de tráfico o clima del día. Le agradecemos su comprensión.</span>
            </div>
          </td>
        </tr>

        <!-- Técnicos -->
        <tr>
          <td style=\"padding:18px 32px 0\">
            <div style=\"font-size:13px;font-weight:700;color:#0D3B40;border-bottom:2px solid #169BBC;padding-bottom:6px;margin-bottom:14px\">TÉCNICO(S) ASIGNADO(S)</div>
            <div>{$tecHtml}</div>
          </td>
        </tr>

        <!-- Contacto para cancelar -->
        <tr>
          <td style=\"padding:18px 32px 24px\">
            <div style=\"background:#D6F3F4;border:1px solid #169BBC;padding:12px 16px\">
              <div style=\"font-size:13px;color:#0D3B40;font-weight:700;margin-bottom:6px\">¿Necesita cancelar o reprogramar?</div>
              <div style=\"font-size:13px;color:#555555\">
                ✉ <a href=\"mailto:soporte@innovate.com.co\" style=\"color:#169BBC;text-decoration:none\">soporte@innovate.com.co</a>
                &nbsp;·&nbsp;
                ☎ <a href=\"tel:+573176452811\" style=\"color:#169BBC;text-decoration:none\">317 645 2811</a>
              </div>
            </div>
          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td style=\"background:#0D3B40;border-top:2px solid #169BBC;padding:12px 32px;text-align:center\">
            <div style=\"font-size:11px;color:#9ecfd2\">Cra. 30 #6-06 Of. 501 · Cali · 317 649 0590</div>
            <div style=\"font-size:11px;color:#6fa8ad;margin-top:2px\">Mensaje automático · No responda a este correo</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>";

    // 4. Enviar
    $asunto = "📅 Visita programada para mañana {$fechaFormateada} — Grupo Innovate";
    enviarCorreoConAdjunto(
      [$tarea['cliente_email']],
      $asunto,
      $html
    );
  }

} catch (Throwable $e) {
  // Silencioso en producción
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _formatearFecha(string $fecha): string {
  $dias   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  $meses  = ['','enero','febrero','marzo','abril','mayo','junio',
             'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  $dt     = new DateTime($fecha);
  $dow    = (int)$dt->format('w');
  $dia    = (int)$dt->format('j');
  $mes    = (int)$dt->format('n');
  $anio   = $dt->format('Y');
  return ucfirst($dias[$dow]) . ", {$dia} de {$meses[$mes]} de {$anio}";
}

function _formatearHora(string $hora): string {
  if (!$hora) return '';
  [$h, $m] = explode(':', $hora);
  $h = (int)$h;
  $sufijo = $h >= 12 ? 'p.m.' : 'a.m.';
  $h12 = $h % 12 ?: 12;
  return "{$h12}:{$m} {$sufijo}";
}
