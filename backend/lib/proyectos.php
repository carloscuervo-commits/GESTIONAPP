<?php
/**
 * proyectos.php — Helpers para tarjetas tipo "Proyecto":
 *   - Cálculo de días hábiles (mismo calendario de festivos colombianos que
 *     assets/js/core.js: esDiaHabil() / _festivosColombia(), portado a PHP
 *     para que el cron calcule exactamente lo mismo que ve el usuario en la
 *     tarjeta).
 *   - proyectosSinVisitaHoy(): proyectos cuya "hora de alarma" ya pasó hoy
 *     sin que se haya registrado ningún check-in.
 *   - proyectosPlazoPorVencer(): proyectos cuyo rango de días estimado
 *     (fecha_programacion + dias_programacion días hábiles) está por
 *     cumplirse o ya se cumplió.
 *
 * Usado por backend/cron/aviso_proyectos.php.
 */
require_once __DIR__ . '/avisos_tecnicos.php'; // configGet()

// ──────────────────────────────────────────────
// Días hábiles (festivos de Colombia)
// ──────────────────────────────────────────────

// Pascua (algoritmo Meeus/Jones/Butcher) — mismo cálculo que _pascua() en
// assets/js/core.js, portado sin depender de la extensión "calendar" de PHP
// (easter_date() no siempre está habilitada en hosting compartido).
function _proyPascua(int $anio): DateTime {
  $a = $anio % 19; $b = intdiv($anio, 100); $c = $anio % 100;
  $d = intdiv($b, 4); $e = $b % 4;
  $f = intdiv($b + 8, 25); $g = intdiv($b - $f + 1, 3);
  $h = (19 * $a + $b - $d - $g + 15) % 30;
  $i = intdiv($c, 4); $k = $c % 4;
  $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
  $m = intdiv($a + 11 * $h + 22 * $l, 451);
  $mes = intdiv($h + $l - 7 * $m + 114, 31);       // 1-indexado (3=marzo, 4=abril)
  $dia = (($h + $l - 7 * $m + 114) % 31) + 1;
  return new DateTime(sprintf('%04d-%02d-%02d', $anio, $mes, $dia));
}

// Siguiente lunes (o el mismo día si ya es lunes) — Ley Emiliani.
function _proyNextLunes(DateTime $d): DateTime {
  $r = clone $d;
  $dow = (int)$r->format('N'); // 1=lunes ... 7=domingo
  if ($dow !== 1) {
    $add = (8 - $dow) % 7;
    if ($add === 0) $add = 7;
    $r->modify("+{$add} day");
  }
  return $r;
}

$GLOBALS['_proyFestivosCache'] = [];

function _proyFestivosColombia(int $anio): array {
  if (isset($GLOBALS['_proyFestivosCache'][$anio])) return $GLOBALS['_proyFestivosCache'][$anio];
  $set = [];
  $add = function (DateTime $d) use (&$set) { $set[$d->format('Y-m-d')] = true; };

  // Fijos
  $add(new DateTime("{$anio}-01-01")); // Año Nuevo
  $add(new DateTime("{$anio}-05-01")); // Día del Trabajo
  $add(new DateTime("{$anio}-07-20")); // Independencia
  $add(new DateTime("{$anio}-08-07")); // Batalla de Boyacá
  $add(new DateTime("{$anio}-12-08")); // Inmaculada Concepción
  $add(new DateTime("{$anio}-12-25")); // Navidad
  // Ley Emiliani (siguiente lunes)
  $add(_proyNextLunes(new DateTime("{$anio}-01-06"))); // Reyes Magos
  $add(_proyNextLunes(new DateTime("{$anio}-03-19"))); // San José
  $add(_proyNextLunes(new DateTime("{$anio}-06-29"))); // San Pedro y San Pablo
  $add(_proyNextLunes(new DateTime("{$anio}-08-15"))); // Asunción
  $add(_proyNextLunes(new DateTime("{$anio}-10-12"))); // Día de la Raza
  $add(_proyNextLunes(new DateTime("{$anio}-11-01"))); // Todos los Santos
  $add(_proyNextLunes(new DateTime("{$anio}-11-11"))); // Independencia de Cartagena
  // Semana Santa y móviles (relativos a Pascua)
  $pascua = _proyPascua($anio);
  $addD = function (DateTime $base, int $n): DateTime { $r = clone $base; $r->modify("{$n} day"); return $r; };
  $add($addD($pascua, -3)); // Jueves Santo
  $add($addD($pascua, -2)); // Viernes Santo
  $add(_proyNextLunes($addD($pascua, 39))); // Ascensión
  $add(_proyNextLunes($addD($pascua, 60))); // Corpus Christi
  $add(_proyNextLunes($addD($pascua, 68))); // Sagrado Corazón de Jesús

  return ($GLOBALS['_proyFestivosCache'][$anio] = $set);
}

function esDiaHabilPHP(DateTime $fecha): bool {
  $dow = (int)$fecha->format('N'); // 6=sábado, 7=domingo
  if ($dow >= 6) return false;
  $festivos = _proyFestivosColombia((int)$fecha->format('Y'));
  return !isset($festivos[$fecha->format('Y-m-d')]);
}

// Fecha de fin estimada de un proyecto: fechaProg + (diasProg-1) días hábiles.
// Misma lógica que fechaProgFin() en assets/js/core.js.
function fechaFinProyecto(string $fechaProgIso, int $diasProg): string {
  $dias = max(0, $diasProg - 1);
  $d = new DateTime($fechaProgIso);
  $agregados = 0;
  while ($agregados < $dias) {
    $d->modify('+1 day');
    if (esDiaHabilPHP($d)) $agregados++;
  }
  return $d->format('Y-m-d');
}

// Días hábiles entre $desdeIso y $hastaIso (positivo si hasta > desde,
// negativo si hasta ya pasó respecto a desde). No cuenta el propio $desde.
function diasHabilesEntre(string $desdeIso, string $hastaIso): int {
  $d1 = new DateTime($desdeIso);
  $d2 = new DateTime($hastaIso);
  $signo = 1;
  if ($d2 < $d1) { $tmp = $d1; $d1 = $d2; $d2 = $tmp; $signo = -1; }
  $dias = 0;
  $cur = clone $d1;
  while ($cur < $d2) {
    $cur->modify('+1 day');
    if (esDiaHabilPHP($cur)) $dias++;
  }
  return $dias * $signo;
}

// ──────────────────────────────────────────────
// Consultas de proyectos
// ──────────────────────────────────────────────

// Proyectos "en ejecución" (estado programado) cuya hora de alarma ya pasó
// hoy (hora Colombia) sin que se haya registrado ningún check-in hoy.
// Solo corre en día hábil (no tiene sentido avisar sábados/domingos/festivos).
function proyectosSinVisitaHoy(PDO $pdo): array {
  $hoyDt = new DateTime('now', new DateTimeZone('America/Bogota'));
  if (!esDiaHabilPHP($hoyDt)) return [];
  $hoy = $hoyDt->format('Y-m-d');
  $horaActual = $hoyDt->format('H:i:s');

  $stmt = $pdo->prepare("
    SELECT t.id, t.titulo, t.cliente, t.area, t.hora_programacion
    FROM tareas t
    WHERE t.tipo_tarea = 'proyecto'
      AND t.estado = 'programado'
      AND t.hora_programacion IS NOT NULL
      AND t.hora_programacion <= ?
      AND NOT EXISTS (
        SELECT 1 FROM visita_participantes vp
        JOIN reportes r ON r.id = vp.reporte_id COLLATE utf8mb4_general_ci
        WHERE r.tarea_id = t.id
          AND DATE(CONVERT_TZ(vp.check_in, '+00:00', '-05:00')) = ?
      )
    ORDER BY t.cliente ASC, t.titulo ASC
  ");
  $stmt->execute([$horaActual, $hoy]);
  return $stmt->fetchAll();
}

// Proyectos (estado programado) cuyo plazo estimado está a $umbralDias días
// hábiles o menos de cumplirse (o ya se cumplió — dias_restantes negativo).
function proyectosPlazoPorVencer(PDO $pdo, int $umbralDias): array {
  $hoy = (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');

  $stmt = $pdo->query("
    SELECT id, titulo, cliente, area, fecha_programacion, dias_programacion
    FROM tareas
    WHERE tipo_tarea = 'proyecto'
      AND estado = 'programado'
      AND fecha_programacion IS NOT NULL
  ");
  $rows = $stmt->fetchAll();

  $resultado = [];
  foreach ($rows as $r) {
    $diasProg = (int)($r['dias_programacion'] ?? 1);
    if ($diasProg <= 1) continue; // sin rango de días no aplica "plazo por vencer"
    $fechaFin = fechaFinProyecto($r['fecha_programacion'], $diasProg);
    $diasRestantes = diasHabilesEntre($hoy, $fechaFin);
    if ($diasRestantes <= $umbralDias) {
      $resultado[] = [
        'tarea_id'        => $r['id'],
        'titulo'          => $r['titulo'],
        'cliente'         => $r['cliente'],
        'area'            => $r['area'],
        'fecha_fin'       => $fechaFin,
        'dias_restantes'  => $diasRestantes,
      ];
    }
  }
  return $resultado;
}
