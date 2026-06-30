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
    JOIN clientes c ON c.nombre = t.cliente COLLATE utf8mb4_general_ci
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
        ? "<img src=\"{$fotoUrl}\" alt=\"{$tec['nombre']}\" style=\"width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;display:block;margin-bottom:6px\">"
        : "<div style=\"width:64px;height:64px;border-radius:50%;background:#cbd5e1;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:6px\">👤</div>";

      $cedulaLine = $tec['cedula'] ? "<div style=\"color:#64748b;font-size:12px\">Cédula: " . htmlspecialchars($tec['cedula']) . "</div>" : '';

      $tecHtml .= "
        <div style=\"display:inline-block;text-align:center;margin:8px 16px 8px 0;vertical-align:top\">
          {$fotoTag}
          <div style=\"font-weight:600;font-size:14px;color:#1e293b\">" . htmlspecialchars($tec['nombre']) . "</div>
          {$cedulaLine}
        </div>";
    }

    $descripcionHtml = '';
    if (!empty($tarea['descripcion'])) {
      $descripcionHtml = "
        <tr>
          <td style=\"padding:6px 0;color:#64748b;font-size:13px;width:130px\">Descripción</td>
          <td style=\"padding:6px 0;font-size:13px;color:#1e293b\">" . nl2br(htmlspecialchars($tarea['descripcion'])) . "</td>
        </tr>";
    }

    $html = "
<!DOCTYPE html>
<html lang=\"es\">
<head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>
<body style=\"margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif\">
  <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f1f5f9;padding:32px 0\">
    <tr><td align=\"center\">
      <table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)\">

        <!-- Cabecera -->
        <tr>
          <td style=\"background:#1e40af;padding:28px 32px;text-align:center\">
            <div style=\"color:#ffffff;font-size:22px;font-weight:700\">Grupo Innovate</div>
            <div style=\"color:#bfdbfe;font-size:14px;margin-top:4px\">Aviso de visita programada</div>
          </td>
        </tr>

        <!-- Saludo -->
        <tr>
          <td style=\"padding:28px 32px 0\">
            <p style=\"margin:0;font-size:15px;color:#1e293b\">
              Estimado cliente <strong>" . htmlspecialchars($tarea['cliente_nombre']) . "</strong>,
            </p>
            <p style=\"margin:12px 0 0;font-size:14px;color:#475569;line-height:1.6\">
              Le informamos que tiene programada una visita de <strong>{$areaLabel}</strong> para el día de mañana.
              A continuación encontrará los detalles:
            </p>
          </td>
        </tr>

        <!-- Datos de la visita -->
        <tr>
          <td style=\"padding:20px 32px\">
            <div style=\"background:#f8fafc;border-radius:8px;padding:20px;border:1px solid #e2e8f0\">
              <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">
                <tr>
                  <td style=\"padding:6px 0;color:#64748b;font-size:13px;width:130px\">Servicio</td>
                  <td style=\"padding:6px 0;font-size:13px;color:#1e293b;font-weight:600\">" . htmlspecialchars($tarea['titulo']) . "</td>
                </tr>
                {$descripcionHtml}
                <tr>
                  <td style=\"padding:6px 0;color:#64748b;font-size:13px\">Fecha</td>
                  <td style=\"padding:6px 0;font-size:13px;color:#1e293b\">{$fechaFormateada}</td>
                </tr>
                <tr>
                  <td style=\"padding:6px 0;color:#64748b;font-size:13px\">Hora</td>
                  <td style=\"padding:6px 0;font-size:13px;color:#1e293b\">{$horaFormateada}</td>
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- Técnicos -->
        <tr>
          <td style=\"padding:0 32px 20px\">
            <div style=\"font-size:14px;font-weight:600;color:#1e293b;margin-bottom:12px\">
              Técnico(s) asignado(s):
            </div>
            <div>
              {$tecHtml}
            </div>
          </td>
        </tr>

        <!-- Contacto para cancelar -->
        <tr>
          <td style=\"padding:0 32px 28px\">
            <div style=\"background:#eff6ff;border-radius:8px;padding:16px;border-left:4px solid #3b82f6\">
              <div style=\"font-size:13px;color:#1e40af;font-weight:600;margin-bottom:4px\">¿Necesita cancelar o reprogramar?</div>
              <div style=\"font-size:13px;color:#1e293b\">
                📧 <a href=\"mailto:soporte@innovate.com.co\" style=\"color:#1e40af\">soporte@innovate.com.co</a>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                📞 <a href=\"tel:+573176452811\" style=\"color:#1e40af\">317 645 2811</a>
              </div>
            </div>
          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td style=\"background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0\">
            <div style=\"font-size:12px;color:#94a3b8\">
              Este es un mensaje automático de Grupo Innovate · No responda a este correo
            </div>
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
