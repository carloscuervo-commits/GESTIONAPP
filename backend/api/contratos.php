<?php
/**
 * contratos.php — Consumo de contratos de horas (IT/IF) en el ciclo vigente.
 *
 * GET ?vigentes=1 -> lista de todos los clientes con contrato activo, con
 *   horas contratadas/consumidas/disponibles del ciclo actual y si están en
 *   condición de alerta de fin de ciclo. Usado por el dashboard (tarjeta de
 *   contratos vigentes + zona de alertas) y comparte la misma lógica que el
 *   cron aviso_contratos_pendientes.php vía contratosVigentesConsumo().
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();
require_once __DIR__ . '/../lib/contrato.php';

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  if (!empty($_GET['vigentes'])) {
    jsonOut(contratosVigentesConsumo($pdo));
  }
  jsonOut(['error' => 'Parámetro requerido: vigentes=1'], 400);
}

jsonOut(['error' => 'Método no soportado'], 405);
