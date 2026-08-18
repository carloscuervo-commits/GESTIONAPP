<?php
/**
 * Cron: aviso_checkout_automatico.php
 * Aviso previo al checkout automático de cierre de jornada.
 *
 * Corre una vez al día, en días laborales, ~1 hora antes de la hora de
 * corte configurada (config.checkout_auto_hora, por defecto 18:30). Avisa
 * por correo y/o Telegram (config.aviso_checkout_auto / _tg) a cada técnico
 * que todavía tenga visitas sin checkout ese mismo día, advirtiendo que si
 * no las cierra antes de la hora de corte, Ginno hará un checkout automático
 * 1 hora después de la hora de inicio de cada una — esa será la hora que se
 * tome como laborada para nómina.
 *
 * El checkout automático en sí lo ejecuta checkout_automatico.php, un cron
 * aparte que debe correr a la hora de corte exacta.
 *
 * Ejecutar en días laborales, 1h antes del corte (ej. 5:30pm hora Colombia
 * si el corte es a las 6:30pm): 30 17 * * 1-5
 * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/aviso_checkout_automatico.php > /dev/null 2>&1
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
  $hoy = (new DateTimeImmutable('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');

  if (esFestivoOFinde($hoy, festivosColombia((new DateTimeImmutable($hoy))->format('Y')))) {
    exit;
  }

  $avisoCorreo = configGet($pdo, 'aviso_checkout_auto')    === '1';
  $avisoTg     = configGet($pdo, 'aviso_checkout_auto_tg') === '1';
  if (!$avisoCorreo && !$avisoTg) {
    exit;
  }

  $horaCorte    = configGet($pdo, 'checkout_auto_hora') ?: '18:30';
  $horaCorteFmt = (DateTime::createFromFormat('H:i', $horaCorte) ?: new DateTime('18:30'))->format('g:i a');

  // Participantes con check-in HOY y sin checkout todavía. COLLATE requerido:
  // visita_participantes usa utf8mb4_unicode_ci, el resto general_ci.
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
      AND DATE(vp.check_in) = ?
    ORDER BY vp.check_in ASC
  ");
  $stmt->execute([$hoy]);
  $pendientes = $stmt->fetchAll(PDO::FETCH_ASSOC);

  if (empty($pendientes)) {
    exit;
  }

  // ── Agrupar por técnico ─────────────────────────────────────────
  $porTecnico = [];
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
    $hora = (new DateTime($p['check_in']))->format('H:i');
    return "📅 {$hora} · 👤 " . ($p['cliente'] ?: '-') . " · 📋 " . ($p['titulo'] ?: '-');
  };

  foreach ($porTecnico as $tid => $info) {
    $n = count($info['visitas']);
    $plural = $n === 1 ? '1 visita' : "{$n} visitas";

    if ($avisoCorreo && !empty($info['email']) && !avisoYaEnviado($pdo, 'checkout_auto_aviso', $tid, 'digest', $hoy)) {
      $lineas = '';
      foreach ($info['visitas'] as $p) {
        $lineas .= '<p style="margin:6px 0">' . htmlspecialchars($fmtLinea($p), ENT_QUOTES, 'UTF-8') . '</p>';
      }
      $cuerpo = htmlAvisoTecnico(
        $info['nombre'],
        'tengo pendiente ' . $plural . ' tuya' . ($n === 1 ? '' : 's') . ' sin cerrar hoy.',
        $lineas . "<p style='margin:12px 0 0;color:#dc2626'>Si no las cierras antes de las {$horaCorteFmt}, voy a hacer un checkout automático 1 hora después de tu hora de inicio en cada una, y esa será la hora que se tome como trabajada para nómina.</p>"
      );
      $ok = enviarAvisoTecnico($info['email'], $info['nombre'], "⏰ Cierra tus visitas antes de las {$horaCorteFmt}", $cuerpo);
      if ($ok) registrarAvisoEnviado($pdo, 'checkout_auto_aviso', $tid, 'digest', $hoy);
    }

    if ($avisoTg && !empty($info['telegram_chat_id']) && !avisoYaEnviado($pdo, 'checkout_auto_aviso_tg', $tid, 'digest', $hoy)) {
      $lineas = implode("\n", array_map($fmtLinea, $info['visitas']));
      $msg = "⏰ <b>Cierra tus visitas antes de las {$horaCorteFmt}</b>\n\n"
           . "Hola <b>" . htmlspecialchars($info['nombre'], ENT_QUOTES, 'UTF-8') . "</b>, "
           . "tengo pendiente " . $plural . " tuya" . ($n === 1 ? '' : 's') . " sin cerrar hoy:\n\n"
           . htmlspecialchars($lineas, ENT_QUOTES, 'UTF-8') . "\n\n"
           . "⚠️ Si no las cierras antes de las {$horaCorteFmt}, voy a hacer un checkout automático 1 hora después de tu hora de inicio en cada una, y esa será la hora que se tome como trabajada para nómina.\n\n"
           . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
      $okTg = sendTelegramMsg($info['telegram_chat_id'], $msg);
      if ($okTg) registrarAvisoEnviado($pdo, 'checkout_auto_aviso_tg', $tid, 'digest', $hoy);
    }
  }

} catch (Throwable $e) {
  // Sin output — el cron no debe generar mails de error
}

// ── Helpers (Colombia festivos/fin de semana) ─────────────────────────────
function festivosColombia(string $anio): array {
  $festivos = [];
  $add = function(string $iso) use (&$festivos) { $festivos[$iso] = true; };
  $addNextLunes = function(string $base) use ($add) {
    $d = new DateTime($base);
    if ((int)$d->format('w') !== 1) $d->modify('next monday');
    $add($d->format('Y-m-d'));
  };

  $y = (int)$anio;
  $add("$y-01-01"); $add("$y-05-01");
  $add("$y-07-20"); $add("$y-08-07"); $add("$y-12-08"); $add("$y-12-25");
  $addNextLunes("$y-01-06"); $addNextLunes("$y-03-19"); $addNextLunes("$y-06-29");
  $addNextLunes("$y-08-15"); $addNextLunes("$y-10-12"); $addNextLunes("$y-11-01");
  $addNextLunes("$y-11-11");

  // Pascua
  $a=$y%19;$b=intdiv($y,100);$c=$y%100;
  $d2=intdiv($b,4);$e=$b%4;$f=intdiv($b+8,25);
  $g=intdiv($b-$f+1,3);$h2=(19*$a+$b-$d2-$g+15)%30;
  $i=intdiv($c,4);$k=$c%4;
  $l=(32+2*$e+2*$i-$h2-$k)%7;
  $m=intdiv($a+11*$h2+22*$l,451);
  $mes=intdiv($h2+$l-7*$m+114,31);
  $dia=(($h2+$l-7*$m+114)%31)+1;
  $pascua=new DateTime(sprintf('%04d-%02d-%02d',$y,$mes,$dia));
  $off=function($n)use($pascua){$d=clone $pascua;$d->modify("+$n days");return $d->format('Y-m-d');};
  $nl=function($base)use($addNextLunes){$addNextLunes($base);};
  $add($off(-3)); $add($off(-2));
  $nl($off(39)); $nl($off(60)); $nl($off(68));

  return $festivos;
}

function esFestivoOFinde(string $iso, array $festivos): bool {
  $dow = (int)(new DateTime($iso))->format('w');
  return $dow === 0 || $dow === 6 || isset($festivos[$iso]);
}
