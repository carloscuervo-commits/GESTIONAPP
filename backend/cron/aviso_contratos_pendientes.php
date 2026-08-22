<?php
/**
 * Cron: aviso_contratos_pendientes.php
 * Aviso a administradores: contratos de horas (IT/IF) que están por cerrar
 * su ciclo sin haber consumido todas las horas contratadas.
 *
 * Corre una vez al día. Para cada cliente con contrato activo, usa
 * contratosVigentesConsumo() (backend/lib/contrato.php) — misma lógica que
 * alimenta la tarjeta del dashboard — y avisa (correo y/o Telegram, según
 * config.aviso_contrato_pendiente / _tg) cuando:
 *   - faltan config.contrato_pendiente_dias_umbral días o menos para el
 *     cierre del ciclo (por defecto 10),
 *   - aún quedan horas contratadas sin consumir,
 *   - el cliente tiene el checkbox "alertar_fin_mes_contrato" activado
 *     (se desactiva manualmente en contratos "solo por daños").
 *
 * Deduplicado por ciclo: no reenvía el mismo aviso más de una vez por
 * cliente/área/ciclo de contrato (tabla avisos_enviados).
 *
 * Ejecutar una vez al día, ej. 8:00am hora Colombia: 0 8 * * *
 * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/aviso_contratos_pendientes.php > /dev/null 2>&1
 *
 * IMPORTANTE: cero output — usar > /dev/null 2>&1 en el cron de cPanel.
 */

define('CRON_RUN', true);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/contrato.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php';
require_once __DIR__ . '/../lib/telegram.php';

@ini_set('display_errors', '0');
error_reporting(0);

try {
  $pdo = getDB();

  $avisoCorreo = configGet($pdo, 'aviso_contrato_pendiente')    === '1';
  $avisoTg     = configGet($pdo, 'aviso_contrato_pendiente_tg') === '1';
  if (!$avisoCorreo && !$avisoTg) {
    exit;
  }

  $contratos = contratosVigentesConsumo($pdo);
  $pendientes = array_filter($contratos, fn($c) => $c['alerta_pendiente']);
  if (empty($pendientes)) {
    exit;
  }

  $admins = $avisoCorreo ? adminsConEmail($pdo) : [];
  $adminsTg = $avisoTg ? adminsConTelegram($pdo) : [];

  foreach ($pendientes as $c) {
    $claveCliente = md5($c['cliente']);
    $claveCiclo   = $c['periodo_inicio']; // dedup por ciclo, no por día

    $clienteEsc = htmlspecialchars($c['cliente'], ENT_QUOTES, 'UTF-8');
    $areaEsc    = strtoupper($c['area']);

    if ($avisoCorreo && $admins && !avisoYaEnviado($pdo, 'contrato_pendiente', $c['area'], $claveCliente, $claveCiclo)) {
      $extra = "<p style='margin:8px 0'>👤 <b>Cliente:</b> {$clienteEsc}</p>"
             . "<p style='margin:8px 0'>🗺 <b>Área:</b> {$areaEsc}</p>"
             . "<p style='margin:8px 0'>🕐 <b>Horas contratadas:</b> {$c['horas_contratadas']}h</p>"
             . "<p style='margin:8px 0'>📊 <b>Consumidas:</b> {$c['horas_consumidas']}h</p>"
             . "<p style='margin:8px 0;color:#dc2626;font-weight:700'>⚠️ Sin consumir: {$c['horas_disponibles']}h</p>"
             . "<p style='margin:8px 0'>📅 <b>Cierra el ciclo:</b> {$c['periodo_fin']} ({$c['dias_restantes']} día" . ($c['dias_restantes'] === 1 ? '' : 's') . " restantes)</p>";
      $seEnvio = false;
      foreach ($admins as $adm) {
        $cuerpo = htmlAvisoTecnico(
          $adm['nombre'],
          'un contrato está por cerrar su ciclo del mes sin haber consumido todas las horas.',
          $extra
        );
        if (enviarAvisoTecnico($adm['email'], $adm['nombre'], '📋 Contrato por consumir — ' . $c['cliente'], $cuerpo)) {
          $seEnvio = true;
        }
      }
      if ($seEnvio) registrarAvisoEnviado($pdo, 'contrato_pendiente', $c['area'], $claveCliente, $claveCiclo);
    }

    if ($avisoTg && $adminsTg && !avisoYaEnviado($pdo, 'contrato_pendiente_tg', $c['area'], $claveCliente, $claveCiclo)) {
      $msg = "📋 <b>Contrato por consumir</b>\n\n"
           . "👤 <b>Cliente:</b> {$clienteEsc}\n"
           . "🗺 <b>Área:</b> {$areaEsc}\n"
           . "🕐 <b>Contratadas:</b> {$c['horas_contratadas']}h\n"
           . "📊 <b>Consumidas:</b> {$c['horas_consumidas']}h\n"
           . "⚠️ <b>Sin consumir:</b> {$c['horas_disponibles']}h\n"
           . "📅 <b>Cierra el ciclo:</b> {$c['periodo_fin']} ({$c['dias_restantes']} día" . ($c['dias_restantes'] === 1 ? '' : 's') . " restantes)\n\n"
           . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
      $seEnvioTg = false;
      foreach ($adminsTg as $adm) {
        if (sendTelegramMsg($adm['telegram_chat_id'], $msg)) $seEnvioTg = true;
      }
      if ($seEnvioTg) registrarAvisoEnviado($pdo, 'contrato_pendiente_tg', $c['area'], $claveCliente, $claveCiclo);
    }
  }

} catch (Throwable $e) {
  // Sin output — el cron no debe generar mails de error
}
