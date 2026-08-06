<?php
/**
 * Cron: avisos_visitas_colgadas.php
 * Ninguna visita debería quedar sin checkout el mismo día del check-in.
 * Este cron es la versión servidor de revisarVisitasEnCursoAntiguas() (frontend,
 * assets/js/reportes.js) — corre una vez al día por la mañana y avisa aunque
 * nadie haya abierto la app:
 *   - A cada técnico, sus propias visitas colgadas de días anteriores.
 *   - A los administradores, el listado completo (con el nombre del técnico).
 *
 * Ejecutar una vez al día, en la mañana (ej. 7:30am hora Colombia): 30 7 * * *
 * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/avisos_visitas_colgadas.php > /dev/null 2>&1
 *
 * IMPORTANTE: cero output — usar > /dev/null 2>&1 en el cron de cPanel.
 */

define('CRON_RUN', true);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php';
require_once __DIR__ . '/../lib/telegram.php';

@ini_set('display_errors', '0');
error_reporting(0);

try {
  $pdo = getDB();

  $avisoCorreo = configGet($pdo, 'aviso_visitas_colgadas')    === '1';
  $avisoTg     = configGet($pdo, 'aviso_visitas_colgadas_tg') === '1';
  if (!$avisoCorreo && !$avisoTg) {
    exit;
  }

  $hoy = (new DateTimeImmutable('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');

  // Participantes con check-in activo (sin checkout) cuyo check-in fue en un
  // día anterior a hoy. COLLATE requerido: visita_participantes usa
  // utf8mb4_unicode_ci, el resto de tablas utf8mb4_general_ci.
  $stmt = $pdo->prepare("
    SELECT vp.id AS participante_id, vp.tecnico_id, vp.check_in,
           r.tarea_id,
           u.nombre AS tecnico_nombre, u.email AS tecnico_email, u.telegram_chat_id,
           t.titulo, t.cliente, t.area
    FROM visita_participantes vp
    JOIN reportes r ON r.id = vp.reporte_id COLLATE utf8mb4_general_ci
    JOIN tareas t   ON t.id = r.tarea_id
    LEFT JOIN usuarios u ON u.id = vp.tecnico_id COLLATE utf8mb4_general_ci
    WHERE r.estado = 'activo'
      AND vp.check_out IS NULL
      AND DATE(vp.check_in) < ?
    ORDER BY vp.check_in ASC
  ");
  $stmt->execute([$hoy]);
  $pendientes = $stmt->fetchAll(PDO::FETCH_ASSOC);

  if (empty($pendientes)) {
    exit;
  }

  // ── Agrupar por técnico ─────────────────────────────────────────
  $porTecnico = []; // tecnico_id => { nombre, email, telegram_chat_id, visitas: [...] }
  foreach ($pendientes as $p) {
    $tid = $p['tecnico_id'];
    if (!isset($porTecnico[$tid])) {
      $porTecnico[$tid] = [
        'nombre'           => $p['tecnico_nombre'] ?: $tid,
        'email'            => $p['tecnico_email'],
        'telegram_chat_id' => $p['telegram_chat_id'],
        'visitas'          => [],
      ];
    }
    $porTecnico[$tid]['visitas'][] = $p;
  }

  $fmtLinea = function (array $p): string {
    $fecha = (new DateTime($p['check_in']))->format('d/m/Y');
    return "📅 {$fecha} · 👤 " . ($p['cliente'] ?: '-') . " · 📋 " . ($p['titulo'] ?: '-');
  };

  // ── Aviso individual a cada técnico ─────────────────────────────
  foreach ($porTecnico as $tid => $info) {
    $n = count($info['visitas']);

    if ($avisoCorreo && !empty($info['email'])) {
      $lineas = '';
      foreach ($info['visitas'] as $p) {
        $lineas .= '<p style="margin:6px 0">' . htmlspecialchars($fmtLinea($p), ENT_QUOTES, 'UTF-8') . '</p>';
      }
      $cuerpo = htmlAvisoTecnico(
        $info['nombre'],
        'tienes ' . ($n === 1 ? '1 visita' : "{$n} visitas") . ' en curso de días anteriores que no ha' . ($n === 1 ? '' : 'n') . ' sido cerrada' . ($n === 1 ? '' : 's') . '.',
        $lineas . '<p style="margin:12px 0 0;color:#dc2626">Ciérralas cuanto antes desde la tarjeta correspondiente.</p>'
      );
      $ok = enviarAvisoTecnico($info['email'], $info['nombre'], '⚠️ Visitas en curso de días anteriores', $cuerpo);
      if ($ok) registrarAvisoEnviado($pdo, 'visitas_colgadas', $tid, 'digest', $hoy);
    }

    if ($avisoTg && !empty($info['telegram_chat_id'])) {
      $lineas = implode("\n", array_map($fmtLinea, $info['visitas']));
      $msg = "⚠️ <b>Visitas en curso de días anteriores</b>\n\n"
           . "Hola <b>" . htmlspecialchars($info['nombre'], ENT_QUOTES, 'UTF-8') . "</b>, "
           . "tienes " . ($n === 1 ? '1 visita' : "{$n} visitas") . " sin cerrar:\n\n"
           . htmlspecialchars($lineas, ENT_QUOTES, 'UTF-8') . "\n\n"
           . "Ciérralas cuanto antes desde la tarjeta correspondiente.\n\n"
           . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
      $okTg = sendTelegramMsg($info['telegram_chat_id'], $msg);
      if ($okTg) registrarAvisoEnviado($pdo, 'visitas_colgadas_tg', $tid, 'digest', $hoy);
    }
  }

  // ── Resumen consolidado a administradores ───────────────────────
  // Dedup independiente por canal (si solo un canal está activo, el otro
  // no debe bloquear ni ser bloqueado por el que está apagado).
  {
    $totalVisitas = count($pendientes);

    if ($avisoCorreo && !avisoYaEnviado($pdo, 'visitas_colgadas_admin', 'admin', 'digest', $hoy)) {
      $filas = '';
      foreach ($pendientes as $p) {
        $filas .= '<p style="margin:6px 0">' . htmlspecialchars($fmtLinea($p) . ' · 🧑‍🔧 ' . ($p['tecnico_nombre'] ?: $p['tecnico_id']), ENT_QUOTES, 'UTF-8') . '</p>';
      }
      $enviadoAlgunAdmin = false;
      foreach (adminsConEmail($pdo) as $adm) {
        $cuerpo = htmlAvisoTecnico(
          $adm['nombre'],
          'hay ' . ($totalVisitas === 1 ? '1 visita' : "{$totalVisitas} visitas") . ' en curso de días anteriores sin cerrar en todo el equipo.',
          $filas
        );
        if (enviarAvisoTecnico($adm['email'], $adm['nombre'], '⚠️ Visitas en curso de días anteriores (equipo)', $cuerpo)) {
          $enviadoAlgunAdmin = true;
        }
      }
      if ($enviadoAlgunAdmin) registrarAvisoEnviado($pdo, 'visitas_colgadas_admin', 'admin', 'digest', $hoy);
    }

    if ($avisoTg && !avisoYaEnviado($pdo, 'visitas_colgadas_admin_tg', 'admin', 'digest', $hoy)) {
      $lineasAdmin = [];
      foreach ($pendientes as $p) {
        $lineasAdmin[] = $fmtLinea($p) . ' · 🧑‍🔧 ' . ($p['tecnico_nombre'] ?: $p['tecnico_id']);
      }
      $msgAdmin = "⚠️ <b>Visitas en curso de días anteriores (equipo)</b>\n\n"
                . "Hay " . ($totalVisitas === 1 ? '1 visita' : "{$totalVisitas} visitas") . " sin cerrar:\n\n"
                . htmlspecialchars(implode("\n", $lineasAdmin), ENT_QUOTES, 'UTF-8') . "\n\n"
                . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
      $enviadoAlgunAdminTg = false;
      foreach (adminsConTelegram($pdo) as $adm) {
        if (sendTelegramMsg($adm['telegram_chat_id'], $msgAdmin)) $enviadoAlgunAdminTg = true;
      }
      if ($enviadoAlgunAdminTg) registrarAvisoEnviado($pdo, 'visitas_colgadas_admin_tg', 'admin', 'digest', $hoy);
    }
  }

} catch (Throwable $e) {
  // Sin output — el cron no debe generar mails de error
}
