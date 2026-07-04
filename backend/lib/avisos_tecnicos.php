<?php
/**
 * Helpers compartidos para envío de avisos a técnicos.
 *
 * Uso: require_once __DIR__ . '/avisos_tecnicos.php';
 *      (mailer.php se incluye aquí automáticamente)
 */
require_once __DIR__ . '/mailer.php';

// ──────────────────────────────────────────────
// Configuración
// ──────────────────────────────────────────────

/**
 * Lee un valor de la tabla configuracion. Retorna null si la clave no existe.
 */
function configGet(PDO $pdo, string $clave): ?string {
  $stmt = $pdo->prepare("SELECT valor FROM configuracion WHERE clave = ?");
  $stmt->execute([$clave]);
  $row = $stmt->fetch();
  return $row ? (string)$row['valor'] : null;
}

// ──────────────────────────────────────────────
// Técnicos del equipo
// ──────────────────────────────────────────────

/**
 * Retorna [{id, nombre, email}] de los técnicos del equipo de una tarea que tienen email.
 */
function tecnicosConEmail(PDO $pdo, string $tareaId): array {
  $stmt = $pdo->prepare("
    SELECT u.id, u.nombre, u.email
    FROM tarea_equipo te
    JOIN usuarios u ON u.id COLLATE utf8mb4_general_ci = te.usuario_id COLLATE utf8mb4_general_ci
    WHERE te.tarea_id = ?
      AND u.email IS NOT NULL
      AND u.email != ''
  ");
  $stmt->execute([$tareaId]);
  return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

// ──────────────────────────────────────────────
// Envío
// ──────────────────────────────────────────────

/**
 * Envía un correo a un técnico. Silencia excepciones.
 */
function enviarAvisoTecnico(string $email, string $nombre, string $asunto, string $cuerpoHtml): bool {
  try {
    return enviarCorreoConAdjunto([$email], $asunto, $cuerpoHtml);
  } catch (Throwable $e) {
    return false;
  }
}

// ──────────────────────────────────────────────
// HTML helpers
// ──────────────────────────────────────────────

/**
 * Wrapper HTML base para avisos con colores de marca Innovate.
 */
function htmlAvisoTecnico(string $nombre, string $intro, string $contenido): string {
  $nombreEsc = htmlspecialchars($nombre, ENT_QUOTES, 'UTF-8');
  return "<!DOCTYPE html>
<html><head><meta charset='UTF-8'></head><body>
<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b'>
  <div style='background:#0D3B40;padding:16px 20px;border-radius:8px 8px 0 0'>
    <span style='color:#ffffff;font-size:20px;font-weight:700'>Ginno</span>
    <span style='color:#D6F3F4;font-size:13px;margin-left:10px'>· Grupo Innovate</span>
  </div>
  <div style='padding:24px 20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;background:#ffffff'>
    <p style='margin:0 0 16px'>Hola <b>{$nombreEsc}</b>, {$intro}</p>
    {$contenido}
    <hr style='border:none;border-top:1px solid #e2e8f0;margin:20px 0 12px'>
    <p style='color:#94a3b8;font-size:12px;margin:0'>Ginno · Asistente de Grupo Innovate · <a href='https://grupoinnovate.com/ginno/tareas-equipo.html' style='color:#169BBC'>grupoinnovate.com/ginno</a></p>
  </div>
</div>
</body></html>";
}

/**
 * Genera el bloque HTML con la información de una tarea.
 * $tarea puede tener: titulo, cliente, descripcion, fecha_programacion,
 *   hora_programacion, dias_programacion, modalidad.
 */
function htmlTareaInfo(array $tarea): string {
  $cliente   = htmlspecialchars($tarea['cliente']        ?? '-', ENT_QUOTES, 'UTF-8');
  $titulo    = htmlspecialchars($tarea['titulo']         ?? '-', ENT_QUOTES, 'UTF-8');
  $desc      = htmlspecialchars($tarea['descripcion']    ?? '', ENT_QUOTES, 'UTF-8');
  $fecha     = $tarea['fecha_programacion']              ?? null;
  $hora      = $tarea['hora_programacion']               ?? null;
  $dias      = (int)($tarea['dias_programacion']         ?? 1);
  $modalidad = $tarea['modalidad']                       ?? null;

  $fechaStr  = $fecha ? date('d/m/Y', strtotime($fecha)) : '—';
  if ($dias > 1) $fechaStr .= " ({$dias} días)";
  $horaStr   = $hora    ?? '—';
  $modStr    = $modalidad === 'en_sitio' ? '🏢 En sitio' : ($modalidad === 'remoto' ? '💻 Remoto' : '—');

  $rows = "
    <tr>
      <td style='padding:6px 16px 6px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top'>👤 Cliente</td>
      <td style='padding:6px 0;font-size:14px;font-weight:700'>{$cliente}</td>
    </tr>
    <tr>
      <td style='padding:6px 16px 6px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top'>📋 Tarea</td>
      <td style='padding:6px 0;font-size:14px;font-weight:700'>{$titulo}</td>
    </tr>
    <tr>
      <td style='padding:6px 16px 6px 0;color:#64748b;font-size:14px;white-space:nowrap'>📅 Fecha</td>
      <td style='padding:6px 0;font-size:14px'>{$fechaStr}</td>
    </tr>
    <tr>
      <td style='padding:6px 16px 6px 0;color:#64748b;font-size:14px;white-space:nowrap'>🕗 Hora</td>
      <td style='padding:6px 0;font-size:14px'>{$horaStr}</td>
    </tr>
    <tr>
      <td style='padding:6px 16px 6px 0;color:#64748b;font-size:14px;white-space:nowrap'>📍 Modalidad</td>
      <td style='padding:6px 0;font-size:14px'>{$modStr}</td>
    </tr>";

  if ($desc) {
    $rows .= "
    <tr>
      <td style='padding:6px 16px 6px 0;color:#64748b;font-size:14px;vertical-align:top'>📝 Descripción</td>
      <td style='padding:6px 0;font-size:14px'>" . nl2br($desc) . "</td>
    </tr>";
  }

  return "<table style='border-collapse:collapse;margin:12px 0;background:#f8fafc;border-radius:8px;padding:8px;width:100%'>
    <tbody>{$rows}</tbody>
  </table>";
}

/**
 * Registra un aviso como enviado. Retorna true si fue insertado (no duplicado).
 * Usa la tabla avisos_enviados con UNIQUE KEY (tipo, tecnico_id, tarea_id, fecha).
 */
function registrarAvisoEnviado(PDO $pdo, string $tipo, string $tecnicoId, string $tareaId, string $fecha): bool {
  try {
    $id = md5($tipo . $tecnicoId . $tareaId . $fecha);
    $stmt = $pdo->prepare("
      INSERT IGNORE INTO avisos_enviados (id, tipo, tecnico_id, tarea_id, fecha)
      VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$id, $tipo, $tecnicoId, $tareaId, $fecha]);
    return $stmt->rowCount() > 0;
  } catch (Throwable $e) {
    return false;
  }
}

/**
 * Verifica si un aviso ya fue enviado hoy.
 */
function avisoYaEnviado(PDO $pdo, string $tipo, string $tecnicoId, string $tareaId, string $fecha): bool {
  $stmt = $pdo->prepare("
    SELECT 1 FROM avisos_enviados
    WHERE tipo = ? AND tecnico_id = ? AND tarea_id = ? AND fecha = ?
    LIMIT 1
  ");
  $stmt->execute([$tipo, $tecnicoId, $tareaId, $fecha]);
  return (bool)$stmt->fetchColumn();
}
