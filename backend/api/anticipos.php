<?php
/**
 * anticipos.php — Módulo de anticipos (recibidos y entregados).
 *
 * GET  /anticipos.php?direccion=recibido|entregado
 *   -> agrupa por cliente/proveedor los anticipos en caché para esa
 *      dirección, y solo deja a quien de verdad sigue con saldo pendiente
 *      (comparado contra lo ya aplicado en Alegra — ver alegra_anticipos.php
 *      / anticiposActualizarSaldoContacto). Ordenados por fecha del anticipo
 *      más viejo del grupo (los más urgentes primero).
 *
 * PUT  /anticipos.php?contacto_id=X&direccion=recibido|entregado
 *   body: { nota?, fechaProximaRevision? }
 *   -> crea o actualiza el seguimiento de ese cliente/proveedor. Solo guarda
 *      la nota y la fecha — nunca toca el monto ni nada en Alegra.
 *
 * POST /anticipos.php?accion=actualizar&direccion=recibido|entregado
 *   -> vuelve a consultar Alegra (incremental, desde el cursor guardado) y
 *      refresca la caché + el saldo pendiente por contacto. Es lo que
 *      dispara el botón "🔄 Actualizar ahora".
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
    SELECT alegra_payment_id, cuenta_id, cuenta_nombre, contacto_id, contacto_nombre, valor, fecha, numero, anotacion
    FROM anticipos_cache
    WHERE direccion = ?
    ORDER BY fecha ASC
  ");
  $stmt->execute([$direccion]);
  $pagos = $stmt->fetchAll();

  $saldoStmt = $pdo->prepare("SELECT contacto_id, saldo, consultado_en FROM anticipos_saldo_tercero WHERE direccion = ?");
  $saldoStmt->execute([$direccion]);
  $saldos = [];
  foreach ($saldoStmt->fetchAll() as $row) $saldos[$row['contacto_id']] = $row;

  $gestionStmt = $pdo->prepare("SELECT contacto_id, nota, fecha_proxima_revision FROM anticipos_gestion WHERE direccion = ?");
  $gestionStmt->execute([$direccion]);
  $gestion = [];
  foreach ($gestionStmt->fetchAll() as $row) $gestion[$row['contacto_id']] = $row;

  // Agrupa los pagos por cliente/proveedor (un anticipo sin identificar, sin
  // contacto, se trata como su propio grupo — no hay con quién agruparlo ni
  // forma de verificar si ya se aplicó, así que siempre se muestra).
  $porContacto = [];
  foreach ($pagos as $p) {
    $cid = $p['contacto_id'] ?? ('_sin_identificar_' . $p['alegra_payment_id']);
    if (!isset($porContacto[$cid])) {
      $porContacto[$cid] = ['contactoId' => $p['contacto_id'], 'contactoNombre' => $p['contacto_nombre'], 'pagos' => []];
    }
    $porContacto[$cid]['pagos'][] = _aRow($p);
  }

  $items = [];
  foreach ($porContacto as $cid => $grupo) {
    $totalRecibido = array_sum(array_column($grupo['pagos'], 'valor'));
    $tieneSaldoVerificado = $grupo['contactoId'] !== null && isset($saldos[$grupo['contactoId']]);
    // Sin contacto, o sin verificar todavía contra Alegra: se muestra por
    // seguridad (nunca se oculta algo que no se ha podido comprobar que ya
    // se aplicó).
    $saldo = $tieneSaldoVerificado ? (float)$saldos[$grupo['contactoId']]['saldo'] : $totalRecibido;
    if ($tieneSaldoVerificado && $saldo <= 0.5) continue; // ya se aplicó del todo en Alegra

    $g = ($grupo['contactoId'] !== null && isset($gestion[$grupo['contactoId']])) ? $gestion[$grupo['contactoId']] : null;
    $items[] = [
      'contactoId'           => $grupo['contactoId'],
      'contactoNombre'       => $grupo['contactoNombre'],
      'saldoPendiente'       => $saldo,
      'totalRecibido'        => $totalRecibido,
      'pagos'                => $grupo['pagos'],
      'fechaMasAntigua'      => min(array_column($grupo['pagos'], 'fecha')),
      'saldoVerificadoEn'    => $tieneSaldoVerificado ? $saldos[$grupo['contactoId']]['consultado_en'] : null,
      'nota'                 => $g['nota'] ?? null,
      'fechaProximaRevision' => $g['fecha_proxima_revision'] ?? null,
    ];
  }
  usort($items, fn($a, $b) => strcmp($a['fechaMasAntigua'], $b['fechaMasAntigua']));

  $estadoStmt = $pdo->prepare("SELECT * FROM anticipos_scan_estado WHERE direccion = ?");
  $estadoStmt->execute([$direccion]);
  $estadoRow = $estadoStmt->fetch();

  jsonOut([
    'items'                => $items,
    'ultimaCorridaEn'       => $estadoRow['ultima_corrida_en'] ?? null,
    'escaneoCompletoHecho'  => (bool)($estadoRow['escaneo_completo_hecho'] ?? false),
  ]);
}

if ($method === 'PUT') {
  $contactoId = $_GET['contacto_id'] ?? null;
  $direccion  = $_GET['direccion'] ?? '';
  if (!$contactoId || !_direccionValida($direccion)) jsonOut(['error' => 'contacto_id y direccion son requeridos'], 400);

  $d = jsonInput();
  $stmt = $pdo->prepare("SELECT * FROM anticipos_gestion WHERE contacto_id = ? AND direccion = ?");
  $stmt->execute([$contactoId, $direccion]);
  $prev = $stmt->fetch();

  $nota                 = array_key_exists('nota', $d)                 ? $d['nota']                 : ($prev['nota'] ?? null);
  $fechaProximaRevision = array_key_exists('fechaProximaRevision', $d) ? ($d['fechaProximaRevision'] ?: null) : ($prev['fecha_proxima_revision'] ?? null);

  $pdo->prepare("INSERT INTO anticipos_gestion (contacto_id, direccion, nota, fecha_proxima_revision, actualizado_por)
      VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      nota = VALUES(nota), fecha_proxima_revision = VALUES(fecha_proxima_revision), actualizado_por = VALUES(actualizado_por)")
    ->execute([$contactoId, $direccion, $nota, $fechaProximaRevision, $usuario['id']]);

  $stmt = $pdo->prepare("SELECT * FROM anticipos_gestion WHERE contacto_id = ? AND direccion = ?");
  $stmt->execute([$contactoId, $direccion]);
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
