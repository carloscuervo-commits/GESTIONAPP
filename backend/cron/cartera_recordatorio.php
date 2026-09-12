<?php
/**
 * cartera_recordatorio.php — Cron diario (sugerido 8:00 a.m.).
 *
 * Antes que nada, cruza la cartera vigente en Alegra (misma lógica que usa
 * la pestaña "💰 Cartera" al abrirse) y archiva en cartera_gestion a quien ya
 * no tenga facturas vencidas — así el cron nunca manda un recordatorio de un
 * cliente que ya pagó, aunque el admin no haya abierto Ginno ese día. Si la
 * consulta a Alegra falla, el cron NO se detiene: sigue con los recordatorios
 * usando el estado que ya haya en la base (con archivado = 0 como filtro de
 * respaldo), simplemente sin poder archivar nada nuevo ese día.
 *
 * Luego busca en cartera_gestion los clientes cuya fecha_proximo_seguimiento
 * ya pasó (o es hoy), que no están en estado 'pagado' y que no están
 * archivados, y envía un correo consolidado a los administradores
 * recordándoles darles seguimiento.
 *
 * No re-agenda nada por su cuenta: mientras el admin no vuelva a guardar una
 * gestión con una fecha_proximo_seguimiento nueva, este cron lo sigue
 * recordando una vez por día (dedupe por día vía avisos_enviados, igual que
 * el resto de los avisos de Ginno).
 *
 * Cron command (cPanel, cero output):
 *   0 8 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/cartera_recordatorio.php > /dev/null 2>&1
 */
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php';
require_once __DIR__ . '/../lib/alegra_cartera.php';
require_once __DIR__ . '/../lib/cartera_archivo.php';

$pdo = getDB();
$hoy = (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');

try {
  $vigentes = alegraCarteraVigente();
  carteraSincronizarYArchivar($pdo, $vigentes);
} catch (Throwable $e) {
  // No bloquear el cron por un problema puntual con Alegra: seguimos con los
  // recordatorios de todas formas, usando el estado archivado que ya haya en
  // la base (ver filtro "archivado = 0" abajo).
}

$stmt = $pdo->prepare("
  SELECT cliente_alegra_id, cliente_nombre, estado, fecha_proximo_seguimiento, notas
  FROM cartera_gestion
  WHERE fecha_proximo_seguimiento IS NOT NULL
    AND fecha_proximo_seguimiento <= ?
    AND estado != 'pagado'
    AND archivado = 0
  ORDER BY fecha_proximo_seguimiento ASC
");
$stmt->execute([$hoy]);
$pendientes = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($pendientes)) exit(0); // nada que recordar hoy

$admins = adminsConEmail($pdo);
if (empty($admins)) exit(0);

$ESTADOS_LABEL = [
  'por-contactar' => 'Por contactar',
  'llamado'       => 'Llamado',
  'correo'        => 'Correo/WhatsApp enviado',
  'acuerdo'       => 'Acuerdo de pago',
];

foreach ($admins as $admin) {
  if (avisoYaEnviado($pdo, 'cartera_recordatorio', $admin['id'], 'multiple', $hoy)) continue;

  $filas = '';
  foreach ($pendientes as $c) {
    $diasAtraso = (int)floor((strtotime($hoy) - strtotime($c['fecha_proximo_seguimiento'])) / 86400);
    $atrasoTxt = $diasAtraso > 0 ? "hace {$diasAtraso} día" . ($diasAtraso === 1 ? '' : 's') : 'hoy';
    $estadoTxt = $ESTADOS_LABEL[$c['estado']] ?? $c['estado'];
    $nombre = htmlspecialchars($c['cliente_nombre'], ENT_QUOTES, 'UTF-8');
    $notas = $c['notas'] ? '<br><span style="color:#64748b;font-size:12px">"' . htmlspecialchars(mb_substr($c['notas'], 0, 100), ENT_QUOTES, 'UTF-8') . '"</span>' : '';
    $filas .= "<tr>
      <td style='padding:6px 12px 6px 0'><b>{$nombre}</b>{$notas}</td>
      <td style='padding:6px 12px 6px 0'>{$estadoTxt}</td>
      <td style='padding:6px 0;color:#dc2626'>Seguimiento vencido {$atrasoTxt}</td>
    </tr>";
  }

  $contenido = "<table style='border-collapse:collapse;width:100%;font-size:13px'>
    <tr style='color:#64748b;font-size:11px;text-align:left'><th style='padding:0 12px 6px 0'>Cliente</th><th style='padding:0 12px 6px 0'>Estado</th><th style='padding:0 0 6px'>Seguimiento</th></tr>
    {$filas}
  </table>
  <p style='margin:16px 0 0;font-size:13px'>Entra a la pestaña 💰 Cartera para registrar la gestión y dejar la próxima fecha de seguimiento.</p>";

  $html = htmlAvisoTecnico(
    $admin['nombre'],
    "esto es lo que sigue pendiente de seguimiento en Cartera (" . count($pendientes) . " cliente" . (count($pendientes) === 1 ? '' : 's') . "):",
    $contenido
  );

  $enviado = enviarAvisoTecnico($admin['email'], $admin['nombre'], '💰 Cartera — clientes pendientes de seguimiento', $html);
  if ($enviado) registrarAvisoEnviado($pdo, 'cartera_recordatorio', $admin['id'], 'multiple', $hoy);
}
