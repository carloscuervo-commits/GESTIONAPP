<?php
/**
 * Cron: checkout_automatico.php
 * Checkout automático de cierre de jornada — el "blindaje" del sistema
 * contra visitas que nunca se cierran.
 *
 * Corre una vez al día, en días laborales, a la hora de corte configurada
 * (config.checkout_auto_hora, por defecto 18:30 = 6:30pm). Por cada
 * participante que siga en visita (sin checkout) con check-in HOY:
 *   - Fuerza check_out = MIN(check_in + 1h, ahora) — nunca una hora futura.
 *   - Marca visita_participantes.checkout_automatico = 1.
 *   - Cierra cualquier pausa activa a esa misma hora.
 *   - Si con esto el reporte queda sin ningún participante pendiente, lo
 *     cierra como 'sin_reporte' + cerrado_automatico = 1 (igual que cuando
 *     un técnico confirma "Continuar sin reporte"): NO se envía correo al
 *     cliente ni se exige generar el reporte.
 * El técnico sigue pudiendo entrar después y usar "Completar reporte" si
 * quiere diligenciarlo — este proceso solo protege la hora de nómina.
 *
 * Si hubo al menos un checkout forzado, envía un resumen a TODOS los
 * administradores con email/Telegram configurado (correo + Telegram,
 * siempre activo, no depende de un toggle en Configuración). Si no hubo
 * ninguno ese día, no envía nada.
 *
 * Ejecutar en días laborales, a la hora de corte (ej. 6:30pm hora Colombia,
 * debe coincidir con config.checkout_auto_hora): 30 18 * * 1-5
 * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/checkout_automatico.php > /dev/null 2>&1
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
  $tz  = new DateTimeZone('America/Bogota');
  $hoy = (new DateTimeImmutable('now', $tz))->format('Y-m-d');

  if (esFestivoOFinde($hoy, festivosColombia((new DateTimeImmutable($hoy))->format('Y')))) {
    exit;
  }

  $ahora = new DateTime('now', $tz);

  // Participantes con check-in HOY y sin checkout todavía. COLLATE requerido:
  // visita_participantes usa utf8mb4_unicode_ci, el resto general_ci.
  $stmt = $pdo->prepare("
    SELECT vp.id AS participante_id, vp.reporte_id, vp.tecnico_id, vp.check_in,
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

  $forzados = []; // para el resumen a admin
  $reportesTocados = []; // reporte_id => true, para revisar cuáles quedan cerrados

  foreach ($pendientes as $p) {
    $checkIn = new DateTime($p['check_in'], $tz);
    $limite  = (clone $checkIn)->modify('+1 hour');
    // Nunca una hora futura: si +1h aún no ha llegado, se usa la hora actual.
    $checkoutAt = ($limite < $ahora) ? $limite : $ahora;
    $checkoutStr = $checkoutAt->format('Y-m-d H:i:s');

    $pdo->prepare("UPDATE visita_pausas SET pausa_fin = ? WHERE participante_id = ? AND pausa_fin IS NULL")
      ->execute([$checkoutStr, $p['participante_id']]);

    $pdo->prepare("UPDATE visita_participantes SET check_out = ?, checkout_automatico = 1 WHERE id = ?")
      ->execute([$checkoutStr, $p['participante_id']]);

    $forzados[] = [
      'tecnico'   => $p['tecnico_nombre'] ?: $p['tecnico_id'],
      'cliente'   => $p['cliente'] ?: '-',
      'titulo'    => $p['titulo'] ?: '-',
      'checkIn'   => $checkIn->format('H:i'),
      'checkOut'  => $checkoutAt->format('H:i'),
    ];
    $reportesTocados[$p['reporte_id']] = true;
  }

  // ── Cerrar los reportes que quedaron sin participantes pendientes ──────
  foreach (array_keys($reportesTocados) as $repId) {
    $stmtCnt = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ? AND check_out IS NULL");
    $stmtCnt->execute([$repId]);
    if ((int)$stmtCnt->fetchColumn() === 0) {
      $stmtMax = $pdo->prepare("SELECT MAX(check_out) FROM visita_participantes WHERE reporte_id = ?");
      $stmtMax->execute([$repId]);
      $ultimoCheckout = $stmtMax->fetchColumn();
      $pdo->prepare("UPDATE reportes SET estado='sin_reporte', cerrado_automatico=1, check_out=? WHERE id=?")
        ->execute([$ultimoCheckout, $repId]);
    }
  }

  // ── Resumen a administradores (siempre activo, no depende de config) ───
  if (!empty($forzados)) {
    $total = count($forzados);
    $plural = $total === 1 ? '1 visita' : "{$total} visitas";

    $fmtLinea = function (array $f): string {
      return "🤖 👤 {$f['tecnico']} · 🏢 {$f['cliente']} · 📋 {$f['titulo']} · 🕐 {$f['checkIn']} → {$f['checkOut']}";
    };

    if (!avisoYaEnviado($pdo, 'checkout_auto_admin', 'admin', 'digest', $hoy)) {
      $filas = '';
      foreach ($forzados as $f) {
        $filas .= '<p style="margin:6px 0">' . htmlspecialchars($fmtLinea($f), ENT_QUOTES, 'UTF-8') . '</p>';
      }
      $enviadoAlgunAdmin = false;
      foreach (adminsConEmail($pdo) as $adm) {
        $cuerpo = htmlAvisoTecnico(
          $adm['nombre'],
          'hoy tuve que hacer un checkout automático en ' . $plural . " porque no se cerraron antes de la hora de corte.",
          $filas . '<p style="margin:12px 0 0;color:#64748b;font-size:12px">El checkout automático toma como hora de salida 1 hora después del check-in (o la hora actual, si esa hora aún no había llegado). No se envió correo al cliente ni se generó reporte para estas visitas.</p>'
        );
        if (enviarAvisoTecnico($adm['email'], $adm['nombre'], "🤖 Checkout automático — {$plural}", $cuerpo)) {
          $enviadoAlgunAdmin = true;
        }
      }
      if ($enviadoAlgunAdmin) registrarAvisoEnviado($pdo, 'checkout_auto_admin', 'admin', 'digest', $hoy);
    }

    if (!avisoYaEnviado($pdo, 'checkout_auto_admin_tg', 'admin', 'digest', $hoy)) {
      $lineasAdmin = array_map($fmtLinea, $forzados);
      $msgAdmin = "🤖 <b>Checkout automático — {$plural}</b>\n\n"
                . "Hoy tuve que hacer un checkout automático en {$plural} porque no se cerraron antes de la hora de corte:\n\n"
                . htmlspecialchars(implode("\n", $lineasAdmin), ENT_QUOTES, 'UTF-8') . "\n\n"
                . "No se envió correo al cliente ni se generó reporte para estas visitas.\n\n"
                . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
      $enviadoAlgunAdminTg = false;
      foreach (adminsConTelegram($pdo) as $adm) {
        if (sendTelegramMsg($adm['telegram_chat_id'], $msgAdmin)) $enviadoAlgunAdminTg = true;
      }
      if ($enviadoAlgunAdminTg) registrarAvisoEnviado($pdo, 'checkout_auto_admin_tg', 'admin', 'digest', $hoy);
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
