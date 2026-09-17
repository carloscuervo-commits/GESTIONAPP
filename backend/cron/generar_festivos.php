<?php
// ============================================================
// generar_festivos.php — script de mantenimiento (NO es un cron real,
// vive en backend/cron/ por convención de "scripts que no son API").
//
// Uso (por SSH o terminal de cPanel, desde la raíz del proyecto):
//   php backend/cron/generar_festivos.php 2029 2030
//
// Calcula los festivos colombianos del/los año(s) pedido(s) con
// backend/lib/festivos.php::festivosColombia() y los inserta en la
// tabla `festivos` (INSERT IGNORE — no duplica ni pisa los que ya
// estén cargados). Pensado para cuando haga falta extender el
// calendario más allá de lo que trajo la migración 046 (2026-2028) —
// hoy no hay pantalla de administración de festivos en Ginno.
// ============================================================

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/festivos.php';

$anios = array_slice($argv, 1);
if (!$anios) {
  fwrite(STDERR, "Uso: php generar_festivos.php <anio> [anio2 ...]\n");
  exit(1);
}

$pdo  = getDB();
$stmt = $pdo->prepare("INSERT IGNORE INTO festivos (fecha, nombre) VALUES (?, ?)");

foreach ($anios as $anioStr) {
  if (!ctype_digit($anioStr)) {
    fwrite(STDERR, "Año inválido: {$anioStr}\n");
    continue;
  }
  $anio     = (int)$anioStr;
  $festivos = festivosColombia($anio);
  foreach ($festivos as $f) {
    $stmt->execute([$f['fecha'], $f['nombre']]);
  }
  echo "OK: {$anio} — " . count($festivos) . " festivos cargados/verificados.\n";
}
