<?php
// ============================================================
// festivos.php — Festivos colombianos.
//
// festivosColombia($anio): calcula los festivos de un año calendario
// (fijos + Ley Emiliani + móviles de Pascua). Es el mismo algoritmo
// usado para precargar la tabla `festivos` en db/046_festivos.sql —
// vive acá aparte para poder recalcular/extender años sin escribir
// SQL a mano (ver backend/cron/generar_festivos.php).
//
// esFestivo() / festivosEnRango(): consultan la tabla `festivos` (NO
// recalculan en caliente) — son las que usa el resto de Ginno, por
// ejemplo backend/api/ausencias.php.
// ============================================================

function festivosColombia(int $anio): array {
  // Festivos de fecha fija (no se corren de día nunca).
  $fijos = [
    [1, 1,  'Año Nuevo'],
    [5, 1,  'Día del Trabajo'],
    [7, 20, 'Día de la Independencia'],
    [8, 7,  'Batalla de Boyacá'],
    [12, 8, 'Inmaculada Concepción'],
    [12, 25,'Navidad'],
  ];

  // Festivos "Ley Emiliani" (Ley 51 de 1983): si no caen en lunes, se
  // trasladan al lunes siguiente.
  $emiliani = [
    [1, 6,  'Reyes Magos'],
    [3, 19, 'San José'],
    [6, 29, 'San Pedro y San Pablo'],
    [8, 15, 'Asunción de la Virgen'],
    [10, 12,'Día de la Raza'],
    [11, 1, 'Todos los Santos'],
    [11, 11,'Independencia de Cartagena'],
  ];

  $siguienteLunes = function (DateTime $d): DateTime {
    $d = clone $d;
    while ((int)$d->format('N') !== 1) $d->modify('+1 day');
    return $d;
  };

  $out = [];
  foreach ($fijos as [$m, $d, $nombre]) {
    $out[] = [new DateTime(sprintf('%04d-%02d-%02d', $anio, $m, $d)), $nombre];
  }
  foreach ($emiliani as [$m, $d, $nombre]) {
    $out[] = [$siguienteLunes(new DateTime(sprintf('%04d-%02d-%02d', $anio, $m, $d))), $nombre];
  }

  // Domingo de Pascua — algoritmo de Meeus/Jones/Butcher (calendario
  // gregoriano). A partir de ahí salen los festivos móviles.
  $a = $anio % 19;
  $b = intdiv($anio, 100);
  $c = $anio % 100;
  $d = intdiv($b, 4);
  $e = $b % 4;
  $f = intdiv($b + 8, 25);
  $g = intdiv($b - $f + 1, 3);
  $h = (19 * $a + $b - $d - $g + 15) % 30;
  $i = intdiv($c, 4);
  $k = $c % 4;
  $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
  $m2 = intdiv($a + 11 * $h + 22 * $l, 451);
  $mes = intdiv($h + $l - 7 * $m2 + 114, 31);
  $dia = (($h + $l - 7 * $m2 + 114) % 31) + 1;
  $pascua = new DateTime(sprintf('%04d-%02d-%02d', $anio, $mes, $dia));

  $out[] = [(clone $pascua)->modify('-3 days'), 'Jueves Santo'];
  $out[] = [(clone $pascua)->modify('-2 days'), 'Viernes Santo'];
  $out[] = [$siguienteLunes((clone $pascua)->modify('+39 days')), 'Ascensión del Señor'];
  $out[] = [$siguienteLunes((clone $pascua)->modify('+60 days')), 'Corpus Christi'];
  $out[] = [$siguienteLunes((clone $pascua)->modify('+68 days')), 'Sagrado Corazón de Jesús'];

  usort($out, fn($x, $y) => $x[0] <=> $y[0]);
  return array_map(fn($x) => ['fecha' => $x[0]->format('Y-m-d'), 'nombre' => $x[1]], $out);
}

// Trae los festivos entre $inicio y $fin (inclusive) como mapa
// ['Y-m-d' => nombre, ...], para lookups O(1) en cálculos de días.
function festivosEnRango(PDO $pdo, string $inicio, string $fin): array {
  $stmt = $pdo->prepare("SELECT fecha, nombre FROM festivos WHERE fecha BETWEEN ? AND ?");
  $stmt->execute([$inicio, $fin]);
  $set = [];
  foreach ($stmt->fetchAll() as $r) $set[$r['fecha']] = $r['nombre'];
  return $set;
}

function esFestivo(PDO $pdo, string $fecha): bool {
  $stmt = $pdo->prepare("SELECT 1 FROM festivos WHERE fecha = ?");
  $stmt->execute([$fecha]);
  return (bool)$stmt->fetch();
}
