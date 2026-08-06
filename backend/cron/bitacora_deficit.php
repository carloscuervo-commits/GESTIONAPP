<?php
/**
 * Cron: bitacora_deficit.php
 * Procesa el día de AYER para cada técnico activo con horario configurado.
 *
 * Por cada técnico:
 *  1. Determina si ayer era un día que debía trabajar (según h_lun…h_dom).
 *  2. Suma horas reales de visita_participantes (solo visitas con checkout).
 *  3. Inserta o actualiza la fila en bitacora_usuario.
 *  4. Si la fila ya tiene deficit_con_nota y sigue siendo déficit → respeta la nota.
 *
 * IMPORTANTE: cero output — usar: > /dev/null 2>&1 en el cron de cPanel.
 * Cron command:
 *   0 23 * * * /usr/bin/php /home/tu-usuario/public_html/ginno/backend/cron/bitacora_deficit.php > /dev/null 2>&1
 */

define('CRON_RUN', true);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/avisos_tecnicos.php';
require_once __DIR__ . '/../lib/telegram.php';

@ini_set('display_errors', '0');
error_reporting(0);

try {
  $pdo  = getDB();
  $ayer = date('Y-m-d', strtotime('-1 day'));

  // Día de la semana de ayer (0=dom … 6=sab) → columna en usuarios
  $dow    = (int)(new DateTime($ayer))->format('w');
  $colMap = [0=>'h_dom',1=>'h_lun',2=>'h_mar',3=>'h_mie',4=>'h_jue',5=>'h_vie',6=>'h_sab'];
  $col    = $colMap[$dow];

  // ¿Ayer era festivo Colombia?
  if (esFestivoOFinde($ayer, festivosColombia(date('Y', strtotime($ayer))))) {
    // Festivo o fin de semana → nada que procesar
    exit;
  }

  // Técnicos activos que deben trabajar ese día de semana
  $stmt = $pdo->prepare(
    "SELECT id AS tecnico_id, nombre, email, telegram_chat_id, $col AS horas_esp
     FROM usuarios
     WHERE activo = 1 AND $col IS NOT NULL AND $col > 0"
  );
  $stmt->execute();
  $tecnicos = $stmt->fetchAll(PDO::FETCH_ASSOC);

  foreach ($tecnicos as $tec) {
    $uid      = $tec['tecnico_id'];
    $horasEsp = (float)$tec['horas_esp'];

    // Sumar horas reales de visitas con checkout restando pausas completadas
    $stmtVis = $pdo->prepare(
      "SELECT COALESCE(SUM(
         TIMESTAMPDIFF(MINUTE, vp.check_in, vp.check_out)
         - COALESCE((
             SELECT SUM(TIMESTAMPDIFF(MINUTE, p.pausa_inicio, p.pausa_fin))
             FROM visita_pausas p
             WHERE p.participante_id COLLATE utf8mb4_general_ci = vp.id COLLATE utf8mb4_general_ci
               AND p.pausa_fin IS NOT NULL
           ), 0)
       ), 0) AS minutos
       FROM visita_participantes vp
       WHERE vp.tecnico_id = ?
         AND DATE(vp.check_in) = ?
         AND vp.check_out IS NOT NULL"
    );
    $stmtVis->execute([$uid, $ayer]);
    $minutos   = (float)$stmtVis->fetchColumn();
    $horasReal = round($minutos / 60, 2);

    // Estado calculado
    $estadoNuevo = $horasReal >= $horasEsp - 0.05 ? 'ok' : 'deficit_sin_nota';

    $id = bin2hex(random_bytes(16));

    // INSERT … ON DUPLICATE KEY UPDATE
    // Si ya existe con deficit_con_nota y sigue siendo déficit → mantener nota
    $pdo->prepare(
      "INSERT INTO bitacora_usuario (id, tecnico_id, fecha, horas_real, horas_esp, estado)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         horas_real = VALUES(horas_real),
         estado = IF(
           estado = 'deficit_con_nota' AND VALUES(horas_real) < horas_esp,
           'deficit_con_nota',
           VALUES(estado)
         )"
    )->execute([$id, $uid, $ayer, $horasReal, $horasEsp, $estadoNuevo]);

    // ── Aviso al técnico: déficit de horario detectado ────────────────
    if ($estadoNuevo === 'deficit_sin_nota' && !avisoYaEnviado($pdo, 'bitacora_deficit', $uid, 'bitacora', $ayer)) {
      try {
        $avisaCorreo = configGet($pdo, 'aviso_bitacora_deficit') === '1';
        $avisaTg     = configGet($pdo, 'aviso_bitacora_deficit_tg') === '1';
        if ($avisaCorreo || $avisaTg) {
          $faltante = round($horasEsp - $horasReal, 2);
          $fechaFmt = (new DateTime($ayer))->format('d/m/Y');

          if ($avisaCorreo && !empty($tec['email'])) {
            $extraBit = "<p style='margin:8px 0'>📅 <b>Fecha:</b> {$fechaFmt}</p>"
                      . "<p style='margin:8px 0'>🕐 <b>Horario esperado:</b> {$horasEsp}h</p>"
                      . "<p style='margin:8px 0'>✅ <b>Horas registradas:</b> {$horasReal}h</p>"
                      . "<p style='margin:8px 0;color:#dc2626;font-weight:700'>⚠️ Déficit: {$faltante}h</p>";
            $cuerpo = htmlAvisoTecnico(
              $tec['nombre'],
              'ayer tu registro de horario quedó por debajo de lo esperado.',
              $extraBit
            );
            enviarAvisoTecnico($tec['email'], $tec['nombre'], '⏱ Déficit de horario — ' . $fechaFmt, $cuerpo);
          }

          if ($avisaTg && !empty($tec['telegram_chat_id'])) {
            $msg = "⏱ <b>Déficit de horario</b>\n\n"
                 . "Hola <b>" . htmlspecialchars($tec['nombre'], ENT_QUOTES, 'UTF-8') . "</b>, "
                 . "ayer tu registro de horario quedó por debajo de lo esperado.\n\n"
                 . "📅 <b>Fecha:</b> {$fechaFmt}\n"
                 . "🕐 <b>Horario esperado:</b> {$horasEsp}h\n"
                 . "✅ <b>Horas registradas:</b> {$horasReal}h\n"
                 . "⚠️ <b>Déficit:</b> {$faltante}h\n\n"
                 . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
            sendTelegramMsg($tec['telegram_chat_id'], $msg);
          }

          registrarAvisoEnviado($pdo, 'bitacora_deficit', $uid, 'bitacora', $ayer);
        }
      } catch (Throwable $e) { /* silencioso, no debe romper el loop de otros técnicos */ }
    }
  }

} catch (Throwable $e) {
  // Sin output — el cron no debe generar mails
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
