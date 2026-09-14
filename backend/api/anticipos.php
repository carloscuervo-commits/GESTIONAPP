<?php
/**
 * anticipos.php — Módulo de anticipos (recibidos y entregados).
 *
 * GET  /anticipos.php?direccion=recibido|entregado
 *   -> lista los anticipos abiertos en caché para esa dirección, con su
 *      seguimiento (nota, próxima revisión) si existe. Ordenados por fecha
 *      ascendente (los más viejos primero — los más urgentes).
 *
 * PUT  /anticipos.php?alegra_payment_id=X&direccion=recibido|entregado
 *   body: { nota?, fechaProximaRevision? }
 *   -> crea o actualiza el seguimiento de ese anticipo. Solo guarda la nota
 *      y la fecha — nunca toca el monto ni nada en Alegra.
 *
 * POST /anticipos.php?accion=actualizar&direccion=recibido|entregado
 *   -> vuelve a consultar Alegra (incremental, desde el cursor guardado) y
 *      refresca la caché. Es lo que dispara el botón "🔄 Actualizar ahora".
 *
 * POST /anticipos.php?accion=escaneo_completo&direccion=recibido|entregado
 *   -> igual, pero recorre TODO el historial desde el inicio (más lento) —
 *      úsalo si sospechas que quedó algo viejo sin detectar (p. ej. un pago
 *      registrado con fecha retroactiva). El escaneo incremental normal no
 *      hace falta correrlo seguido, ya cubre lo nuevo.
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

require_once __DIR__ . '/../lib/alegra_anticipos.php';

$pdo = getDB();
$usuario = requireSesion($pdo, 'admin');
$method = $_SERVER['REQUEST_METHOD'];

function _direccionValida($d) {
  return in_array($d, ['recibido', 'entregado'], true);
}

function _aRow($row) {
  $row['valor'] = (float)$row['valor'];
  return $row;
}

if ($method === 'GET') {
  $direccion = $_GET['direccion'] ?? '';
  if (!_direccionValida($direccion)) jsonOut(['error' => 'direccion inválida (recibido|entregado)'], 400);

  $stmt = $pdo->prepare("
    SELECT c.*, g.nota, g.fecha_proxima_revision
    FROM anticipos_cache c
    LEFT JOIN anticipos_gestion g
      ON g.alegra_payment_id = c.alegra_payment_id AND g.direccion = c.direccion
    WHERE c.direccion = ?
    ORDER BY c.fecha ASC
  ");
  $stmt->execute([$direccion]);

  $estadoStmt = $pdo->prepare("SELECT * FROM anticipos_scan_estado WHERE direccion = ?");
  $estadoStmt->execute([$direccion]);
  $estadoRow = $estadoStmt->fetch();

  jsonOut([
    'items'                => array_map('_aRow', $stmt->fetchAll()),
    'ultimaCorridaEn'       => $estadoRow['ultima_corrida_en'] ?? null,
    'escaneoCompletoHecho'  => (bool)($estadoRow['escaneo_completo_hecho'] ?? false),
  ]);
}

if ($method === 'PUT') {
  $alegraId  = $_GET['alegra_payment_id'] ?? null;
  $direccion = $_GET['direccion'] ?? '';
  if (!$alegraId || !_direccionValida($direccion)) jsonOut(['error' => 'alegra_payment_id y direccion son requeridos'], 400);

  $d = jsonInput();
  $stmt = $pdo->prepare("SELECT * FROM anticipos_gestion WHERE alegra_payment_id = ? AND direccion = ?");
  $stmt->execute([$alegraId, $direccion]);
  $prev = $stmt->fetch();

  $nota                 = array_key_exists('nota', $d)                 ? $d['nota']                 : ($prev['nota'] ?? null);
  $fechaProximaRevision = array_key_exists('fechaProximaRevision', $d) ? ($d['fechaProximaRevision'] ?: null) : ($prev['fecha_proxima_revision'] ?? null);

  $pdo->prepare("INSERT INTO anticipos_gestion (alegra_payment_id, direccion, nota, fecha_proxima_revision, actualizado_por)
      VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      nota = VALUES(nota), fecha_proxima_revision = VALUES(fecha_proxima_revision), actualizado_por = VALUES(actualizado_por)")
    ->execute([$alegraId, $direccion, $nota, $fechaProximaRevision, $usuario['id']]);

  $stmt = $pdo->prepare("SELECT * FROM anticipos_gestion WHERE alegra_payment_id = ? AND direccion = ?");
  $stmt->execute([$alegraId, $direccion]);
  jsonOut($stmt->fetch());
}

if ($method === 'POST') {
  $accion    = $_GET['accion'] ?? '';
  $direccion = $_GET['direccion'] ?? '';
  if (!_direccionValida($direccion)) jsonOut(['error' => 'direccion inválida (recibido|entregado)'], 400);
  if (!in_array($accion, ['actualizar', 'escaneo_completo'], true)) jsonOut(['error' => 'accion inválida'], 400);

  try {
    $r = anticiposActualizarCache($pdo, $direccion, $accion === 'escaneo_completo');
  } catch (Throwable $e) {
    jsonOut(['error' => $e->getMessage()], 502);
  }

  jsonOut(['actualizado' => $r['encontrados'], 'fechaMasAntigua' => $r['fechaMasAntigua']]);
}

jsonOut(['error' => 'Método no soportado'], 405);
