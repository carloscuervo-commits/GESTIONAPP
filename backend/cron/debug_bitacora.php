<?php
/**
 * DEBUG temporal — NO dejar en producción.
 * Ejecutar: /usr/bin/php /home/innovate/public_html/ginno/backend/cron/debug_bitacora.php
 */
require_once __DIR__ . '/../lib/db.php';
ini_set('display_errors', '1');
error_reporting(E_ALL);

$pdo  = getDB();
$ayer = date('Y-m-d', strtotime('-1 day'));
echo "Procesando fecha: $ayer\n";

$dow    = (int)(new DateTime($ayer))->format('w');
$colMap = [0=>'h_dom',1=>'h_lun',2=>'h_mar',3=>'h_mie',4=>'h_jue',5=>'h_vie',6=>'h_sab'];
$col    = $colMap[$dow];
echo "Día semana (0=dom): $dow → columna: $col\n";

// Festivos check
function festivosColombia(string $anio): array {
  $festivos = [];
  $add = function(string $iso) use (&$festivos) { $festivos[$iso] = true; };
  $addNextLunes = function(string $base) use ($add) {
    $d = new DateTime($base); if ((int)$d->format('w') !== 1) $d->modify('next monday');
    $add($d->format('Y-m-d'));
  };
  $y = (int)$anio;
  $add("$y-01-01"); $add("$y-05-01"); $add("$y-07-20"); $add("$y-08-07"); $add("$y-12-08"); $add("$y-12-25");
  $addNextLunes("$y-01-06"); $addNextLunes("$y-03-19"); $addNextLunes("$y-06-29");
  $addNextLunes("$y-08-15"); $addNextLunes("$y-10-12"); $addNextLunes("$y-11-01"); $addNextLunes("$y-11-11");
  $a=$y%19;$b=intdiv($y,100);$c=$y%100;
  $d2=intdiv($b,4);$e=$b%4;$f=intdiv($b+8,25);$g=intdiv($b-$f+1,3);
  $h2=(19*$a+$b-$d2-$g+15)%30;$i=intdiv($c,4);$k=$c%4;
  $l=(32+2*$e+2*$i-$h2-$k)%7;$m=intdiv($a+11*$h2+22*$l,451);
  $mes=intdiv($h2+$l-7*$m+114,31);$dia=(($h2+$l-7*$m+114)%31)+1;
  $pascua=new DateTime(sprintf('%04d-%02d-%02d',$y,$mes,$dia));
  $off=function($n)use($pascua){$d=clone $pascua;$d->modify("+$n days");return $d->format('Y-m-d');};
  $add($off(-3)); $add($off(-2));
  $addNextLunes($off(39)); $addNextLunes($off(60)); $addNextLunes($off(68));
  return $festivos;
}

$festivos = festivosColombia(date('Y', strtotime($ayer)));
$esFestivo = isset($festivos[$ayer]);
$esFinde   = ($dow === 0 || $dow === 6);
echo "¿Es festivo? " . ($esFestivo ? "SÍ ($ayer)" : 'no') . "\n";
echo "¿Es fin de semana? " . ($esFinde ? 'SÍ' : 'no') . "\n";

if ($esFestivo || $esFinde) {
  echo "→ El script habría salido aquí (festivo/finde). Sin filas insertadas.\n";
  exit;
}

// Técnicos activos con horas ese día
$stmt = $pdo->prepare("SELECT id, nombre, $col AS horas_esp FROM usuarios WHERE activo = 1");
$stmt->execute();
$todos = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "\nTodos los técnicos activos:\n";
foreach ($todos as $t) {
  echo "  {$t['nombre']} → {$col} = " . var_export($t['horas_esp'], true) . "\n";
}

$tecnicos = array_filter($todos, fn($t) => $t['horas_esp'] !== null && (float)$t['horas_esp'] > 0);
echo "\nTécnicos con horas > 0 para el $col: " . count($tecnicos) . "\n";

if (empty($tecnicos)) {
  echo "→ Sin técnicos con horario configurado para este día. Nada que insertar.\n";
  exit;
}

foreach ($tecnicos as $tec) {
  $uid = $tec['id'];
  $horasEsp = (float)$tec['horas_esp'];

  $stmtVis = $pdo->prepare(
    "SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, vp.check_in, vp.check_out)), 0) AS minutos
     FROM visita_participantes vp
     WHERE vp.tecnico_id COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci
       AND DATE(vp.check_in) = ?
       AND vp.check_out IS NOT NULL"
  );
  $stmtVis->execute([$uid, $ayer]);
  $minutos   = (float)$stmtVis->fetchColumn();
  $horasReal = round($minutos / 60, 2);
  $estado    = $horasReal >= $horasEsp - 0.05 ? 'ok' : 'deficit_sin_nota';

  echo "\n{$tec['nombre']}: esp={$horasEsp}h real={$horasReal}h → $estado\n";

  $id = bin2hex(random_bytes(16));
  $pdo->prepare(
    "INSERT INTO bitacora_usuario (id, tecnico_id, fecha, horas_real, horas_esp, estado)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       horas_real = VALUES(horas_real),
       estado = IF(estado = 'deficit_con_nota' AND VALUES(horas_real) < horas_esp, 'deficit_con_nota', VALUES(estado))"
  )->execute([$id, $uid, $ayer, $horasReal, $horasEsp, $estado]);
  echo "  → Insertado/actualizado en bitacora_usuario.\n";
}

echo "\nListo.\n";
