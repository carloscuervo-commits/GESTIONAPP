<?php
/**
 * cartera_gestion.php — Estado del tablero de cartera, compartido en base de
 * datos (reemplaza el localStorage por cliente/navegador que usaba antes
 * assets/js/cartera.js).
 *
 * GET  /cartera_gestion.php                     -> lista todas las filas
 * PUT  /cartera_gestion.php?cliente_alegra_id=X  -> crea o actualiza la gestión de ese cliente
 *      body: { clienteNombre, estado?, responsableId?, notas?, fechaAcuerdo?,
 *              montoAcuerdo?, plantillaNivel?, fechaUltimoContacto?, fechaProximoSeguimiento? }
 *      (todos los campos opcionales excepto clienteNombre en el primer PUT;
 *       lo que no se envía conserva su valor anterior)
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$usuario = requireSesion($pdo, 'admin');
$method = $_SERVER['REQUEST_METHOD'];

function _cgRow($row) {
  $row['monto_acuerdo']       = $row['monto_acuerdo']       !== null ? (float)$row['monto_acuerdo']       : null;
  $row['ultimo_total_deuda']  = $row['ultimo_total_deuda']  !== null ? (float)$row['ultimo_total_deuda']  : null;
  $row['archivado']           = (int)($row['archivado'] ?? 0);
  return $row;
}

if ($method === 'GET') {
  $stmt = $pdo->query("SELECT * FROM cartera_gestion");
  jsonOut(array_map('_cgRow', $stmt->fetchAll()));
}

if ($method === 'PUT') {
  $clienteAlegraId = $_GET['cliente_alegra_id'] ?? null;
  if (!$clienteAlegraId) jsonOut(['error' => 'cliente_alegra_id requerido'], 400);

  $d = jsonInput();

  $stmt = $pdo->prepare("SELECT * FROM cartera_gestion WHERE cliente_alegra_id = ?");
  $stmt->execute([$clienteAlegraId]);
  $prev = $stmt->fetch();

  if (!$prev && empty($d['clienteNombre'])) {
    jsonOut(['error' => 'clienteNombre es requerido para crear una gestión nueva'], 400);
  }

  $clienteNombre           = $d['clienteNombre']           ?? $prev['cliente_nombre'];
  $estado                  = $d['estado']                  ?? ($prev['estado'] ?? 'por-contactar');
  $responsableId           = array_key_exists('responsableId', $d)           ? $d['responsableId']           : ($prev['responsable_id'] ?? null);
  $notas                   = array_key_exists('notas', $d)                   ? $d['notas']                   : ($prev['notas'] ?? null);
  $fechaAcuerdo             = array_key_exists('fechaAcuerdo', $d)             ? ($d['fechaAcuerdo'] ?: null)   : ($prev['fecha_acuerdo'] ?? null);
  $montoAcuerdo             = array_key_exists('montoAcuerdo', $d)             ? (is_numeric($d['montoAcuerdo']) ? (float)$d['montoAcuerdo'] : null) : ($prev['monto_acuerdo'] ?? null);
  $plantillaNivel           = array_key_exists('plantillaNivel', $d)           ? $d['plantillaNivel']           : ($prev['plantilla_nivel'] ?? null);
  $fechaUltimoContacto      = array_key_exists('fechaUltimoContacto', $d)      ? ($d['fechaUltimoContacto'] ?: null) : ($prev['fecha_ultimo_contacto'] ?? null);
  $fechaProximoSeguimiento = array_key_exists('fechaProximoSeguimiento', $d) ? ($d['fechaProximoSeguimiento'] ?: null) : ($prev['fecha_proximo_seguimiento'] ?? null);

  $pdo->prepare("INSERT INTO cartera_gestion
      (cliente_alegra_id, cliente_nombre, estado, responsable_id, notas, fecha_acuerdo, monto_acuerdo,
       plantilla_nivel, fecha_ultimo_contacto, fecha_proximo_seguimiento, actualizado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      cliente_nombre = VALUES(cliente_nombre), estado = VALUES(estado), responsable_id = VALUES(responsable_id),
      notas = VALUES(notas), fecha_acuerdo = VALUES(fecha_acuerdo), monto_acuerdo = VALUES(monto_acuerdo),
      plantilla_nivel = VALUES(plantilla_nivel), fecha_ultimo_contacto = VALUES(fecha_ultimo_contacto),
      fecha_proximo_seguimiento = VALUES(fecha_proximo_seguimiento), actualizado_por = VALUES(actualizado_por)")
    ->execute([
      $clienteAlegraId, $clienteNombre, $estado, $responsableId ?: null, $notas,
      $fechaAcuerdo, $montoAcuerdo, $plantillaNivel, $fechaUltimoContacto, $fechaProximoSeguimiento,
      $usuario['id'],
    ]);

  $stmt = $pdo->prepare("SELECT * FROM cartera_gestion WHERE cliente_alegra_id = ?");
  $stmt->execute([$clienteAlegraId]);
  jsonOut(_cgRow($stmt->fetch()));
}

jsonOut(['error' => 'Método no soportado'], 405);
