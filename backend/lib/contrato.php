<?php
/**
 * contrato.php — Cálculo del ciclo de facturación de contratos de horas.
 *
 * El "día de corte" (1-31) marca el día del mes en que arranca cada ciclo.
 * Si es null/0 se trata como corte = 1, que equivale exactamente al mes
 * calendario (comportamiento por defecto para clientes sin fecha de corte
 * configurada).
 */
require_once __DIR__ . '/avisos_tecnicos.php'; // configGet(), usado por contratosVigentesConsumo()

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

// Calcula las horas de contrato (redondeadas a bloques de 30 min, mínimo
// 0.5h; residuo > 10 min sube al siguiente bloque) de una visita a partir
// de su check_in/check_out y sus pausas cerradas. $pausas es un array de
// filas con 'pausa_inicio'/'pausa_fin'. Devuelve null si falta check_in o
// check_out (visita sin finalizar). Misma lógica que usaba antes inline el
// checkout de reportes.php — extraída aquí para reutilizarla también en el
// backfill de tareas.php.
function calcularHorasContratoVisita(?string $checkIn, ?string $checkOut, array $pausas): ?float {
  if (!$checkIn || !$checkOut) return null;

  $durMinutos = max(0, (int)((strtotime($checkOut) - strtotime($checkIn)) / 60));
  foreach ($pausas as $pz) {
    if (empty($pz['pausa_inicio']) || empty($pz['pausa_fin'])) continue;
    $durMinutos -= max(0, (int)((strtotime($pz['pausa_fin']) - strtotime($pz['pausa_inicio'])) / 60));
  }
  $durMinutos = max(0, $durMinutos);

  $medias = (int)floor($durMinutos / 30);
  if (($durMinutos % 30) > 10) $medias++;
  return max(0.5, $medias * 0.5);
}

// Rellena horas_contrato para los participantes ya finalizados (con
// check_in y check_out) de una tarea que todavía no lo tienen calculado —
// típicamente porque la tarjeta se reclasificó a tipo Contrato DESPUÉS de
// que la visita ya había hecho checkout (en ese momento no era Contrato,
// así que el checkout no calculó nada y el campo quedó NULL para siempre).
// Se llama al guardar la tarjeta (PUT tareas.php) cuando tipo_tarea queda
// en 'contrato'. No toca participantes que ya tengan un valor (incluidas
// ediciones manuales del admin).
function backfillHorasContratoTarea(PDO $pdo, string $tareaId): void {
  $stmt = $pdo->prepare("
    SELECT vp.id, vp.check_in, vp.check_out
    FROM visita_participantes vp
    JOIN reportes r ON r.id = vp.reporte_id COLLATE utf8mb4_general_ci
    WHERE r.tarea_id = ?
      AND vp.horas_contrato IS NULL
      AND vp.check_in IS NOT NULL
      AND vp.check_out IS NOT NULL
  ");
  $stmt->execute([$tareaId]);
  $participantes = $stmt->fetchAll();
  if (!$participantes) return;

  $stmtPausas = $pdo->prepare("SELECT pausa_inicio, pausa_fin FROM visita_pausas WHERE participante_id = ? AND pausa_fin IS NOT NULL");
  $stmtUpdate = $pdo->prepare("UPDATE visita_participantes SET horas_contrato = ? WHERE id = ?");

  foreach ($participantes as $p) {
    $stmtPausas->execute([$p['id']]);
    $horas = calcularHorasContratoVisita($p['check_in'], $p['check_out'], $stmtPausas->fetchAll());
    if ($horas !== null) {
      $stmtUpdate->execute([$horas, $p['id']]);
    }
  }
}

/**
 * Consumo de horas de contrato de TODOS los clientes con contrato activo
 * (IT o IF), en el ciclo vigente de cada uno. Fuente única de verdad
 * compartida por el endpoint del dashboard (backend/api/contratos.php) y el
 * cron de aviso (backend/cron/aviso_contratos_pendientes.php), para que
 * ambos usen exactamente el mismo criterio de "hay que avisar".
 *
 * Cada fila: cliente_id, cliente, area, horas_contratadas, horas_consumidas,
 * horas_disponibles, dias_restantes (hasta el fin del ciclo, puede ser 0),
 * periodo_inicio, periodo_fin, alertar_fin_mes_contrato (bool del cliente),
 * alerta_pendiente (bool ya calculado: dias_restantes <= umbral Y
 * horas_consumidas < horas_contratadas Y alertar_fin_mes_contrato).
 */
function contratosVigentesConsumo(PDO $pdo): array {
  $umbralRaw   = configGet($pdo, 'contrato_pendiente_dias_umbral');
  $umbralDias  = ($umbralRaw !== null && $umbralRaw !== '') ? (int)$umbralRaw : 10;

  $stmtC = $pdo->prepare("
    SELECT id, nombre, contrato_area, contrato_horas_mes, fecha_corte_contrato, alertar_fin_mes_contrato
    FROM clientes
    WHERE contrato_area IS NOT NULL AND contrato_horas_mes IS NOT NULL
    ORDER BY contrato_area ASC, nombre ASC
  ");
  $stmtC->execute();
  $clientes = $stmtC->fetchAll();

  $hoy = new DateTime('now', new DateTimeZone('America/Bogota'));
  $resultado = [];

  $stmtCons = $pdo->prepare("
    SELECT COALESCE(SUM(vp.horas_contrato), 0)
    FROM visita_participantes vp
    JOIN reportes r2 ON r2.id = vp.reporte_id COLLATE utf8mb4_general_ci
    JOIN tareas t2   ON t2.id = r2.tarea_id
    WHERE t2.cliente COLLATE utf8mb4_general_ci = ?
      AND t2.tipo_tarea = 'contrato'
      AND t2.area      = ?
      AND DATE(vp.check_out) BETWEEN ? AND ?
      AND vp.horas_contrato IS NOT NULL
  ");

  foreach ($clientes as $c) {
    $corteDia = $c['fecha_corte_contrato'] !== null ? (int)$c['fecha_corte_contrato'] : null;
    [$periodoInicio, $periodoFin] = periodoContratoActual($corteDia);

    $stmtCons->execute([$c['nombre'], $c['contrato_area'], $periodoInicio, $periodoFin]);
    $horasConsumidas = (float)$stmtCons->fetchColumn();
    $horasContratadas = (float)$c['contrato_horas_mes'];

    $fin = new DateTime($periodoFin);
    $diasRestantes = max(0, (int)$hoy->diff($fin)->format('%r%a'));
    // Si $fin ya pasó (no debería, pero por seguridad), no negativo.
    if ($fin < $hoy) $diasRestantes = 0;

    $alertarCliente = ((int)$c['alertar_fin_mes_contrato']) === 1;
    $alertaPendiente = $alertarCliente
      && $diasRestantes <= $umbralDias
      && $horasConsumidas < $horasContratadas;

    $resultado[] = [
      'cliente_id'               => $c['id'],
      'cliente'                  => $c['nombre'],
      'area'                     => $c['contrato_area'],
      'horas_contratadas'        => $horasContratadas,
      'horas_consumidas'         => $horasConsumidas,
      'horas_disponibles'        => round($horasContratadas - $horasConsumidas, 1),
      'dias_restantes'           => $diasRestantes,
      'periodo_inicio'           => $periodoInicio,
      'periodo_fin'              => $periodoFin,
      'alertar_fin_mes_contrato' => $alertarCliente,
      'alerta_pendiente'         => $alertaPendiente,
    ];
  }

  return $resultado;
}
