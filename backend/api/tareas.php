<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------
function rowConTeam($pdo, $row) {
  $stmt = $pdo->prepare("SELECT usuario_id FROM tarea_equipo WHERE tarea_id = ?");
  $stmt->execute([$row['id']]);
  $row['team'] = array_column($stmt->fetchAll(), 'usuario_id');
  return $row;
}

function registrarHistorial($pdo, $tareaId, $estadoAnt, $estadoNuevo, $usuarioId) {
  if ($estadoAnt === $estadoNuevo) return;
  $stmt = $pdo->prepare("INSERT INTO tarea_historial (tarea_id, estado_ant, estado_nuevo, usuario_id) VALUES (?,?,?,?)");
  $stmt->execute([$tareaId, $estadoAnt, $estadoNuevo, $usuarioId]);
}

// --------------------------------------------------------------
// GET /tareas.php          -> lista todas (con filtros opcionales ?area=&estado=)
// GET /tareas.php?id=UUID  -> una tarea
// --------------------------------------------------------------
if ($method === 'GET') {
  if (!empty($_GET['id'])) {
    $stmt = $pdo->prepare("SELECT * FROM tareas WHERE id = ?");
    $stmt->execute([$_GET['id']]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['error' => 'No encontrada'], 404);
    jsonOut(rowConTeam($pdo, $row));
  }

  $sql = "SELECT * FROM tareas WHERE 1=1";
  $params = [];
  if (!empty($_GET['area']))   { $sql .= " AND area = ?";   $params[] = $_GET['area']; }
  if (!empty($_GET['estado'])) { $sql .= " AND estado = ?"; $params[] = $_GET['estado']; }
  $sql .= " ORDER BY actualizado_en DESC";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = array_map(fn($r) => rowConTeam($pdo, $r), $stmt->fetchAll());
  jsonOut($rows);
}

// --------------------------------------------------------------
// POST /tareas.php  -> crear tarea
// body JSON: { id, titulo, desc, area, estado, cliente, fechaProg, fecha,
//              tiempo, tiempoReal, recursos, notas, reporte, factura,
//              team: [usuario_id,...], creadoPor }
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  if (empty($d['titulo']) || empty($d['area']) || empty($d['estado'])) {
    jsonOut(['error' => 'titulo, area y estado son requeridos'], 400);
  }
  $id = $d['id'] ?? bin2hex(random_bytes(16));
  $now = date('Y-m-d H:i:s');
  $realizadoEn = ($d['estado'] === 'por-facturar' || $d['estado'] === 'realizado') ? $now : null;
  $enviadaEn   = ($d['estado'] === 'enviada') ? $now : null;
  $programadoEn = ($d['estado'] === 'programado') ? $now : null;
  $seguimientoHistorial = isset($d['seguimientoHistorial']) ? json_encode($d['seguimientoHistorial']) : null;

  $stmt = $pdo->prepare("INSERT INTO tareas
    (id, titulo, descripcion, area, estado, tipo_tarea, cliente, fecha_programacion, hora_programacion, dias_programacion, fecha_limite,
     tiempo_estimado, tiempo_real, recursos, notas, reporte, modalidad, factura, motivo_no_factura, creado_por,
     realizado_en, enviada_en, programado_en, seguimiento_fecha, seguimiento_historial,
     solicitud_admin, solicitud_comercial, admin_tarea_id, comercial_tarea_id, cotizacion_docx, incluye_prog)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  $stmt->execute([
    $id, $d['titulo'], $d['desc'] ?? null, $d['area'], $d['estado'],
    in_array($d['tipoTarea'] ?? '', ['evento','proyecto','contrato']) ? $d['tipoTarea'] : 'evento',
    $d['cliente'] ?? null,
    $d['fechaProg'] ?? null, $d['horaProg'] ?? '08:00', isset($d['diasProg']) ? (int)$d['diasProg'] : 1,
    $d['fecha'] ?? null, $d['tiempo'] ?? null, $d['tiempoReal'] ?? null,
    $d['recursos'] ?? null, $d['notas'] ?? null, $d['reporte'] ?? null, $d['modalidad'] ?? null, $d['factura'] ?? null,
    $d['motivoNoFactura'] ?? null,
    $d['creadoPor'] ?? null, $realizadoEn, $enviadaEn, $programadoEn,
    $d['seguimientoFecha'] ?? null, $seguimientoHistorial,
    $d['laborAdmin'] ?? null, $d['solicitudComercial'] ?? null,
    $d['adminTaskId'] ?? null, $d['comercialTaskId'] ?? null, $d['cotizacionDocx'] ?? null,
    empty($d['incluyeProg']) ? 0 : 1,
  ]);

  if (!empty($d['team'])) {
    $ins = $pdo->prepare("INSERT INTO tarea_equipo (tarea_id, usuario_id) VALUES (?,?)");
    foreach ($d['team'] as $uid) $ins->execute([$id, $uid]);
  }

  // Auto-crear cliente en tabla clientes si no existe
  if (!empty($d['cliente'])) {
    $cId = bin2hex(random_bytes(16));
    $pdo->prepare("INSERT IGNORE INTO clientes (id, nombre) VALUES (?, ?)")
      ->execute([$cId, $d['cliente']]);
  }

  registrarHistorial($pdo, $id, null, $d['estado'], $d['creadoPor'] ?? null);
  jsonOut(['id' => $id], 201);
}

// --------------------------------------------------------------
// PUT /tareas.php?id=UUID  -> actualizar tarea (mismo body que POST)
// --------------------------------------------------------------
if ($method === 'PUT') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT estado, realizado_en, enviada_en, programado_en, cotizacion_docx, fecha_programacion, alerta_retraso_enviada FROM tareas WHERE id = ?");
  $stmt->execute([$id]);
  $prev = $stmt->fetch();
  if (!$prev) jsonOut(['error' => 'No encontrada'], 404);

  $d = jsonInput();
  $estado = $d['estado'] ?? $prev['estado'];

  $realizadoEn = $prev['realizado_en'];
  if (in_array($estado, ['por-facturar','realizado']) && !$realizadoEn) $realizadoEn = date('Y-m-d H:i:s');

  $enviadaEn = $prev['enviada_en'];
  if ($estado === 'enviada' && !$enviadaEn) $enviadaEn = date('Y-m-d H:i:s');

  $programadoEn = $prev['programado_en'];
  if ($estado === 'programado' && !$programadoEn) $programadoEn = date('Y-m-d H:i:s');

  $seguimientoHistorial = isset($d['seguimientoHistorial']) ? json_encode($d['seguimientoHistorial']) : null;
  $cotizacionDocx = array_key_exists('cotizacionDocx', $d) ? $d['cotizacionDocx'] : $prev['cotizacion_docx'];

  // Resetear alerta de retraso si cambió la fecha de programación
  $nuevaFechaProg = $d['fechaProg'] ?? null;
  $alertaRetraso = ($nuevaFechaProg !== $prev['fecha_programacion']) ? 0 : (int)$prev['alerta_retraso_enviada'];

  $stmt = $pdo->prepare("UPDATE tareas SET
    titulo=?, descripcion=?, area=?, estado=?, tipo_tarea=?, cliente=?, fecha_programacion=?, hora_programacion=?, dias_programacion=?, fecha_limite=?,
    tiempo_estimado=?, tiempo_real=?, recursos=?, notas=?, reporte=?, modalidad=?, factura=?, motivo_no_factura=?,
    realizado_en=?, enviada_en=?, programado_en=?, seguimiento_fecha=?, seguimiento_historial=?,
    solicitud_admin=?, solicitud_comercial=?, admin_tarea_id=?, comercial_tarea_id=?, cotizacion_docx=?, incluye_prog=?,
    alerta_retraso_enviada=?
    WHERE id=?");
  $stmt->execute([
    $d['titulo'], $d['desc'] ?? null, $d['area'], $estado,
    in_array($d['tipoTarea'] ?? '', ['evento','proyecto','contrato']) ? $d['tipoTarea'] : 'evento',
    $d['cliente'] ?? null,
    $nuevaFechaProg, $d['horaProg'] ?? '08:00', isset($d['diasProg']) ? (int)$d['diasProg'] : 1,
    $d['fecha'] ?? null, $d['tiempo'] ?? null, $d['tiempoReal'] ?? null,
    $d['recursos'] ?? null, $d['notas'] ?? null, $d['reporte'] ?? null, $d['modalidad'] ?? null, $d['factura'] ?? null,
    array_key_exists('motivoNoFactura', $d) ? $d['motivoNoFactura'] : ($prev['motivo_no_factura'] ?? null),
    $realizadoEn, $enviadaEn, $programadoEn, $d['seguimientoFecha'] ?? null, $seguimientoHistorial,
    $d['laborAdmin'] ?? null, $d['solicitudComercial'] ?? null,
    $d['adminTaskId'] ?? null, $d['comercialTaskId'] ?? null, $cotizacionDocx,
    empty($d['incluyeProg']) ? 0 : 1, $alertaRetraso, $id,
  ]);

  // Reasignar equipo
  $pdo->prepare("DELETE FROM tarea_equipo WHERE tarea_id = ?")->execute([$id]);
  if (!empty($d['team'])) {
    $ins = $pdo->prepare("INSERT INTO tarea_equipo (tarea_id, usuario_id) VALUES (?,?)");
    foreach ($d['team'] as $uid) $ins->execute([$id, $uid]);
  }

  registrarHistorial($pdo, $id, $prev['estado'], $estado, $d['usuarioId'] ?? null);
  jsonOut(['ok' => true]);
}

// --------------------------------------------------------------
// DELETE /tareas.php?id=UUID
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  try {
    // 1. visita_participantes (sin FK hacia reportes)
    // Obtener IDs de reportes de esta tarea primero, luego borrar participantes
    $stmt = $pdo->prepare("SELECT id FROM reportes WHERE tarea_id = ?");
    $stmt->execute([$id]);
    $reporteIds = array_column($stmt->fetchAll(), 'id');
    if ($reporteIds) {
      $placeholders = implode(',', array_fill(0, count($reporteIds), '?'));
      $pdo->prepare("DELETE FROM visita_participantes WHERE reporte_id IN ($placeholders)")
        ->execute($reporteIds);
    }

    // 2. checkin_fuera_sitio (sin FK hacia tareas)
    $pdo->prepare("DELETE FROM checkin_fuera_sitio WHERE tarea_id = ?")
      ->execute([$id]);

    // 3. tareas (cascade elimina reportes, reporte_fotos, tarea_equipo, tarea_historial)
    $pdo->prepare("DELETE FROM tareas WHERE id = ?")->execute([$id]);

    jsonOut(['ok' => true]);
  } catch (Exception $e) {
    jsonOut(['error' => $e->getMessage()], 500);
  }
}

jsonOut(['error' => 'Método no soportado'], 405);
