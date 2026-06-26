<?php
// ============================================================
// alertas.php – Alerta de retraso de técnico
// POST { tareaId } → envía correo a administrativo y marca flag en DB
// ============================================================
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/mailer.php';
applyCors();

$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonOut(['error' => 'Método no soportado'], 405);

$d = jsonInput();
$tareaId = $d['tareaId'] ?? null;
if (!$tareaId) jsonOut(['error' => 'tareaId requerido'], 400);

// Obtener tarea con nombres de técnicos
$stmt = $pdo->prepare("
  SELECT t.*,
         GROUP_CONCAT(u.nombre ORDER BY u.nombre SEPARATOR ', ') AS nombres_equipo
  FROM tareas t
  LEFT JOIN tarea_equipo te ON te.tarea_id = t.id
  LEFT JOIN usuarios     u  ON u.id = te.usuario_id
  WHERE t.id = ?
  GROUP BY t.id
");
$stmt->execute([$tareaId]);
$tarea = $stmt->fetch();

if (!$tarea) jsonOut(['error' => 'Tarea no encontrada'], 404);

// Si la alerta ya se envió (en una sesión anterior), no duplicar
if ($tarea['alerta_retraso_enviada']) {
  jsonOut(['ok' => true, 'ya_enviada' => true]);
}

// Marcar ANTES de enviar para evitar duplicados en caso de timeout del correo
$pdo->prepare("UPDATE tareas SET alerta_retraso_enviada = 1 WHERE id = ?")->execute([$tareaId]);

// Construir correo
$tecnico  = $tarea['nombres_equipo'] ?: 'Sin asignar';
$fecha    = $tarea['fecha_programacion'] ?: '-';
$hora     = $tarea['hora_programacion'] ?: '08:00';
$titulo   = $tarea['titulo'];
$cliente  = $tarea['cliente'] ?: 'Sin cliente';
$area     = strtoupper($tarea['area']);

$asunto = "⚠️ Técnico tardío – {$titulo}";
$cuerpo = "
<div style='font-family:Arial,sans-serif;max-width:620px;color:#1e293b'>
  <div style='background:#dc2626;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0'>
    <h2 style='margin:0;font-size:18px'>⚠️ Alerta: técnico no ha iniciado visita</h2>
  </div>
  <div style='background:#fef2f2;border:1px solid #fecaca;padding:16px 20px'>
    <p style='margin:0 0 12px'>El siguiente técnico <strong>no registró check-in</strong> a la hora programada:</p>
    <table style='border-collapse:collapse;width:100%;font-size:14px'>
      <tr><td style='padding:8px 12px;font-weight:600;color:#64748b;width:140px'>Tarea</td>
          <td style='padding:8px 12px;background:#fff;border-radius:4px'>" . htmlspecialchars($titulo) . "</td></tr>
      <tr><td style='padding:8px 12px;font-weight:600;color:#64748b'>Cliente</td>
          <td style='padding:8px 12px'>" . htmlspecialchars($cliente) . "</td></tr>
      <tr><td style='padding:8px 12px;font-weight:600;color:#64748b'>Área</td>
          <td style='padding:8px 12px;background:#fff;border-radius:4px'>{$area}</td></tr>
      <tr><td style='padding:8px 12px;font-weight:600;color:#64748b'>Técnico(s)</td>
          <td style='padding:8px 12px'>" . htmlspecialchars($tecnico) . "</td></tr>
      <tr><td style='padding:8px 12px;font-weight:600;color:#64748b'>Fecha prog.</td>
          <td style='padding:8px 12px;background:#fff;border-radius:4px'>{$fecha}</td></tr>
      <tr><td style='padding:8px 12px;font-weight:600;color:#dc2626;font-size:15px'>Hora prog.</td>
          <td style='padding:8px 12px;color:#dc2626;font-weight:700;font-size:15px'>{$hora}</td></tr>
    </table>
  </div>
  <div style='background:#f8fafc;border:1px solid #e2e8f0;border-top:0;padding:12px 20px;border-radius:0 0 8px 8px'>
    <p style='margin:0;color:#94a3b8;font-size:12px'>
      Ginno · Asistente de Grupo Innovate · <a href='https://grupoinnovate.com/ginno/' style='color:#169BBC;text-decoration:none'>grupoinnovate.com</a>
    </p>
  </div>
</div>";

$ok = enviarCorreoConAdjunto(['administrativo@innovate.com.co'], $asunto, $cuerpo);

jsonOut(['ok' => true, 'email_enviado' => $ok]);
