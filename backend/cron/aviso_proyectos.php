<?php
/**
 * Cron: aviso_proyectos.php
 * Dos avisos a administradores para tarjetas tipo "Proyecto":
 *
 *   1) Sin visita del día: si ya pasó la "hora de alarma" configurada en el
 *      proyecto y hoy (día hábil) no se ha registrado ningún check-in,
 *      avisa a los admins. Se reevalúa cada corrida — no hay mensaje de
 *      "resuelto", simplemente deja de dispararse el día en que sí hay
 *      check-in (dedupe diario vía avisos_enviados).
 *
 *   2) Plazo por vencer: si al proyecto le quedan config.proyecto_plazo_dias_umbral
 *      días hábiles o menos para llegar a la fecha fin estimada (o ya se
 *      cumplió), avisa una sola vez por plazo (dedupe por fecha fin — si se
 *      reprograma el proyecto y cambia la fecha fin, se vuelve a avisar).
 *
 * Gateado por config.aviso_proyecto_sin_visita / _tg y
 * config.aviso_proyecto_plazo / _tg (ver configuracion.js).
 *
 * Ejecutar cada hora en horario laboral, ej. cada hora de 7am a 6pm:
 * 0 7-18 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/aviso_proyectos.php > /dev/null 2>&1
 *
 * IMPORTANTE: cero output — usar > /dev/null 2>&1 en el cron de cPanel.
 */

define('CRON_RUN', true);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/proyectos.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php';
require_once __DIR__ . '/../lib/telegram.php';

@ini_set('display_errors', '0');
error_reporting(0);

const _AVISO_PROY_TECNICO_ID = 'ADMIN'; // avisos van a todos los admins, no a un técnico puntual

try {
  $pdo = getDB();
  $hoy = (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');

  // ── Aviso 1: sin visita registrada hoy ──────────────────────────
  $avisoSVCorreo = configGet($pdo, 'aviso_proyecto_sin_visita')    === '1';
  $avisoSVTg     = configGet($pdo, 'aviso_proyecto_sin_visita_tg') === '1';
  if ($avisoSVCorreo || $avisoSVTg) {
    $pendientes = proyectosSinVisitaHoy($pdo);
    if (!empty($pendientes)) {
      $admins   = $avisoSVCorreo ? adminsConEmail($pdo)    : [];
      $adminsTg = $avisoSVTg     ? adminsConTelegram($pdo) : [];
      foreach ($pendientes as $p) {
        $clienteEsc = htmlspecialchars($p['cliente'] ?? '-', ENT_QUOTES, 'UTF-8');
        $tituloEsc  = htmlspecialchars($p['titulo']  ?? '-', ENT_QUOTES, 'UTF-8');
        $areaEsc    = strtoupper($p['area']);
        $horaEsc    = substr($p['hora_programacion'] ?? '', 0, 5);

        if ($admins && !avisoYaEnviado($pdo, 'proyecto_sin_visita', _AVISO_PROY_TECNICO_ID, $p['id'], $hoy)) {
          $extra = "<p style='margin:8px 0'>👤 <b>Cliente:</b> {$clienteEsc}</p>"
                 . "<p style='margin:8px 0'>📋 <b>Proyecto:</b> {$tituloEsc}</p>"
                 . "<p style='margin:8px 0'>🗺 <b>Área:</b> {$areaEsc}</p>"
                 . "<p style='margin:8px 0;color:#dc2626;font-weight:700'>🔔 Hora de alarma: {$horaEsc} — aún sin registro de visita hoy.</p>";
          $seEnvio = false;
          foreach ($admins as $adm) {
            $cuerpo = htmlAvisoTecnico(
              $adm['nombre'],
              'no se ha registrado ninguna visita hoy al proyecto ' . $tituloEsc . '.',
              $extra
            );
            if (enviarAvisoTecnico($adm['email'], $adm['nombre'], '🔔 Sin visita hoy — ' . $p['cliente'], $cuerpo)) $seEnvio = true;
          }
          if ($seEnvio) registrarAvisoEnviado($pdo, 'proyecto_sin_visita', _AVISO_PROY_TECNICO_ID, $p['id'], $hoy);
        }

        if ($adminsTg && !avisoYaEnviado($pdo, 'proyecto_sin_visita_tg', _AVISO_PROY_TECNICO_ID, $p['id'], $hoy)) {
          $msg = "🔔 <b>No se ha registrado ninguna visita al proyecto {$tituloEsc}</b>\n\n"
               . "👤 <b>Cliente:</b> {$clienteEsc}\n"
               . "🗺 <b>Área:</b> {$areaEsc}\n"
               . "🕗 <b>Hora de alarma:</b> {$horaEsc}\n\n"
               . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
          $seEnvioTg = false;
          foreach ($adminsTg as $adm) {
            if (sendTelegramMsg($adm['telegram_chat_id'], $msg)) $seEnvioTg = true;
          }
          if ($seEnvioTg) registrarAvisoEnviado($pdo, 'proyecto_sin_visita_tg', _AVISO_PROY_TECNICO_ID, $p['id'], $hoy);
        }
      }
    }
  }

  // ── Aviso 2: plazo por vencer ────────────────────────────────────
  $avisoPlCorreo = configGet($pdo, 'aviso_proyecto_plazo')    === '1';
  $avisoPlTg     = configGet($pdo, 'aviso_proyecto_plazo_tg') === '1';
  if ($avisoPlCorreo || $avisoPlTg) {
    $umbralRaw  = configGet($pdo, 'proyecto_plazo_dias_umbral');
    $umbralDias = ($umbralRaw !== null && $umbralRaw !== '') ? (int)$umbralRaw : 2;

    $porVencer = proyectosPlazoPorVencer($pdo, $umbralDias);
    if (!empty($porVencer)) {
      $admins   = $avisoPlCorreo ? adminsConEmail($pdo)    : [];
      $adminsTg = $avisoPlTg     ? adminsConTelegram($pdo) : [];
      foreach ($porVencer as $p) {
        $clienteEsc = htmlspecialchars($p['cliente'] ?? '-', ENT_QUOTES, 'UTF-8');
        $tituloEsc  = htmlspecialchars($p['titulo']  ?? '-', ENT_QUOTES, 'UTF-8');
        $areaEsc    = strtoupper($p['area']);
        // Dedupe por fecha fin: si se reprograma el proyecto (cambia la fecha
        // fin estimada), el aviso se vuelve a disparar para el nuevo plazo.
        $claveFecha = $p['fecha_fin'];
        $vencido    = $p['dias_restantes'] < 0;
        $diasTxt    = $vencido
          ? ('excedido por ' . abs($p['dias_restantes']) . ' día' . (abs($p['dias_restantes']) === 1 ? '' : 's') . ' hábil(es)')
          : ($p['dias_restantes'] . ' día' . ($p['dias_restantes'] === 1 ? '' : 's') . ' hábil(es) restante(s)');

        if ($admins && !avisoYaEnviado($pdo, 'proyecto_plazo', _AVISO_PROY_TECNICO_ID, $p['tarea_id'], $claveFecha)) {
          $extra = "<p style='margin:8px 0'>👤 <b>Cliente:</b> {$clienteEsc}</p>"
                 . "<p style='margin:8px 0'>📋 <b>Proyecto:</b> {$tituloEsc}</p>"
                 . "<p style='margin:8px 0'>🗺 <b>Área:</b> {$areaEsc}</p>"
                 . "<p style='margin:8px 0'>📅 <b>Fecha fin estimada:</b> {$p['fecha_fin']}</p>"
                 . "<p style='margin:8px 0;color:#dc2626;font-weight:700'>⏳ {$diasTxt}</p>"
                 . "<p style='margin:8px 0'>Si el proyecto necesita más tiempo, considera ampliar los días estimados desde la tarjeta.</p>";
          $seEnvio = false;
          foreach ($admins as $adm) {
            $cuerpo = htmlAvisoTecnico(
              $adm['nombre'],
              'el proyecto ' . $tituloEsc . ' se está acercando a (o ya superó) su plazo estimado.',
              $extra
            );
            if (enviarAvisoTecnico($adm['email'], $adm['nombre'], '⏳ Plazo por vencer — ' . $p['cliente'], $cuerpo)) $seEnvio = true;
          }
          if ($seEnvio) registrarAvisoEnviado($pdo, 'proyecto_plazo', _AVISO_PROY_TECNICO_ID, $p['tarea_id'], $claveFecha);
        }

        if ($adminsTg && !avisoYaEnviado($pdo, 'proyecto_plazo_tg', _AVISO_PROY_TECNICO_ID, $p['tarea_id'], $claveFecha)) {
          $msg = "⏳ <b>Plazo por vencer — {$tituloEsc}</b>\n\n"
               . "👤 <b>Cliente:</b> {$clienteEsc}\n"
               . "🗺 <b>Área:</b> {$areaEsc}\n"
               . "📅 <b>Fecha fin estimada:</b> {$p['fecha_fin']}\n"
               . "⏳ <b>{$diasTxt}</b>\n\n"
               . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
          $seEnvioTg = false;
          foreach ($adminsTg as $adm) {
            if (sendTelegramMsg($adm['telegram_chat_id'], $msg)) $seEnvioTg = true;
          }
          if ($seEnvioTg) registrarAvisoEnviado($pdo, 'proyecto_plazo_tg', _AVISO_PROY_TECNICO_ID, $p['tarea_id'], $claveFecha);
        }
      }
    }
  }

} catch (Throwable $e) {
  // Sin output — el cron no debe generar mails de error
}
