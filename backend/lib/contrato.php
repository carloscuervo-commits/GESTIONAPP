<?php
/**
 * contrato.php — Cálculo del ciclo de facturación de contratos de horas.
 *
 * El "día de corte" (1-31) marca el día del mes en que arranca cada ciclo.
 * Si es null/0 se trata como corte = 1, que equivale exactamente al mes
 * calendario (comportamiento por defecto para clientes sin fecha de corte
 * configurada).
 */

// Devuelve [inicio, fin] ('Y-m-d', ambos inclusive) del ciclo vigente para
// la fecha de referencia (por defecto, hoy en hora Colombia).
function periodoContratoActual(?int $corteDia, ?string $refDate = null): array {
  $corteDia = $corteDia ?: 1;
  $ref = $refDate ? new DateTime($refDate) : new DateTime('now', new DateTimeZone('America/Bogota'));

  $anio = (int)$ref->format('Y');
  $mes  = (int)$ref->format('m');
  $dia  = (int)$ref->format('d');

  $diasEnMesRef     = (int)$ref->format('t');
  $corteEfectivoRef = min($corteDia, $diasEnMesRef);

  if ($dia >= $corteEfectivoRef) {
    $inicioAnio = $anio;
    $inicioMes  = $mes;
  } else {
    $inicioAnio = $anio;
    $inicioMes  = $mes - 1;
    if ($inicioMes < 1) { $inicioMes = 12; $inicioAnio--; }
  }

  $diasEnMesInicio = (int)(new DateTime(sprintf('%04d-%02d-01', $inicioAnio, $inicioMes)))->format('t');
  $corteInicio     = min($corteDia, $diasEnMesInicio);
  $inicio = new DateTime(sprintf('%04d-%02d-%02d', $inicioAnio, $inicioMes, $corteInicio));

  $finMes  = $inicioMes + 1;
  $finAnio = $inicioAnio;
  if ($finMes > 12) { $finMes = 1; $finAnio++; }
  $diasEnMesFin = (int)(new DateTime(sprintf('%04d-%02d-01', $finAnio, $finMes)))->format('t');
  $corteFin     = min($corteDia, $diasEnMesFin);
  $fin = new DateTime(sprintf('%04d-%02d-%02d', $finAnio, $finMes, $corteFin));
  $fin->modify('-1 day');

  return [$inicio->format('Y-m-d'), $fin->format('Y-m-d')];
}

// Ciclo inmediatamente anterior al vigente.
function periodoContratoAnterior(?int $corteDia, ?string $refDate = null): array {
  [$inicioActual] = periodoContratoActual($corteDia, $refDate);
  $refAnterior = (new DateTime($inicioActual))->modify('-1 day')->format('Y-m-d');
  return periodoContratoActual($corteDia, $refAnterior);
}
