<?php
/**
 * reporte_diario.php — Reporte diario de técnicos in-house.
 *
 * Un técnico con perfil 'tecnico_inhouse' entra por reporte-diario.html
 * (no ve el tablero de Ginno) y aquí registra: hora de inicio/fin de su
 * jornada y la lista de actividades del día (con o sin horario propio).
 * Un admin puede ver/reabrir los reportes de cualquier técnico in-house
 * desde la pestaña "Reportes diarios" de tareas-equipo.html.
 *
 * GET  ?fecha=YYYY-MM-DD           (técnico) reporte propio del día (se crea si no existe y fecha=hoy)
 * GET  ?admin=1&desde=&hasta=&tecnico_id=  (admin) reportes en rango, con actividades
 * POST { accion: 'marcar_inicio'|'marcar_fin'|'agregar_actividad'|'eliminar_actividad', ... }  (técnico)
 * PUT  { accion: 'reabrir', tecnico_id, fecha }  (admin)
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

set_exception_handler(function ($e) {
  jsonOut(['error' => $e->getMessage()], 500);
});

$pdo    = getDB();
$u      = requireSesion($pdo); // cualquier perfil autenticado; se valida abajo según la acción
$method = $_SERVER['REQUEST_METHOD'];

function _rdHoy(): string {
  return (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');
}

function _rdHoraActual(): string {
  return (new DateTime('now', new DateTimeZone('America/Bogota')))->format('H:i:s');
}

// Busca el cliente asignado a un técnico in-house. Null si no tiene ninguno
// (todavía no lo configuró un admin en la ficha del cliente).
function _rdClienteDeTecnico(PDO $pdo, string $tecnicoId): ?array {
  $stmt = $pdo->prepare("SELECT id, nombre FROM clientes WHERE tecnico_inhouse_id = ? LIMIT 1");
  $stmt->execute([$tecnicoId]);
  $c = $stmt->fetch();
  return $c ?: null;
}

function _rdConActividades(PDO $pdo, array $reportes): array {
  if (!$reportes) return [];
  $ids = array_column($reportes, 'id');
  $in  = implode(',', array_fill(0, count($ids), '?'));
  $stmt = $pdo->prepare("SELECT * FROM reporte_diario_actividad WHERE reporte_diario_id IN ($in) ORDER BY orden ASC, creado_en ASC");
  $stmt->execute($ids);
  $porReporte = [];
  foreach ($stmt->fetchAll() as $act) { $porReporte[$act['reporte_diario_id']][] = $act; }
  foreach ($reportes as &$r) { $r['actividades'] = $porReporte[$r['id']] ?? []; }
  return $reportes;
}

// --------------------------------------------------------------
// GET
// --------------------------------------------------------------
if ($method === 'GET') {

  // ---- Vista admin: reportes de un rango de fechas ----
  if (!empty($_GET['admin'])) {
    if ($u['perfil'] !== 'admin') jsonOut(['error' => 'Se requiere perfil administrador'], 403);

    $desde = $_GET['desde'] ?? null;
    $hasta = $_GET['hasta'] ?? null;
    if (!$desde || !$hasta) jsonOut(['error' => 'desde y hasta son requeridos'], 400);

    $params = [$desde, $hasta];
    $filtroTec = '';
    if (!empty($_GET['tecnico_id'])) { $filtroTec = ' AND rd.tecnico_id = ?'; $params[] = $_GET['tecnico_id']; }

    // COLLATE explícito en los JOIN: usuarios/clientes no necesariamente
    // comparten colación (ver nota en la migración 047) — mismo patrón
    // defensivo que ya usa bitacora.php.
    $stmt = $pdo->prepare(
      "SELECT rd.*, ut.nombre AS tecnico_nombre, ut.iniciales AS tecnico_iniciales, c.nombre AS cliente_nombre
       FROM reporte_diario rd
       JOIN usuarios ut ON ut.id COLLATE utf8mb4_general_ci = rd.tecnico_id COLLATE utf8mb4_general_ci
       JOIN clientes c  ON c.id  COLLATE utf8mb4_general_ci = rd.cliente_id COLLATE utf8mb4_general_ci
       WHERE rd.fecha BETWEEN ? AND ? $filtroTec
       ORDER BY rd.fecha DESC, ut.nombre ASC"
    );
    $stmt->execute($params);
    jsonOut(_rdConActividades($pdo, $stmt->fetchAll()));
  }

  // ---- Vista técnico: su reporte de un día (hoy por defecto) ----
  if ($u['perfil'] !== 'tecnico_inhouse') jsonOut(['error' => 'Este reporte es solo para técnicos in-house'], 403);

  $fecha = $_GET['fecha'] ?? _rdHoy();

  $stmt = $pdo->prepare("SELECT * FROM reporte_diario WHERE tecnico_id = ? AND fecha = ?");
  $stmt->execute([$u['id'], $fecha]);
  $reporte = $stmt->fetch();

  if (!$reporte) {
    // Solo se crea automáticamente el reporte de HOY al abrirlo por
    // primera vez. Un día pasado sin reporte simplemente no existe.
    if ($fecha !== _rdHoy()) jsonOut(['reporte' => null, 'actividades' => []]);

    $cliente = _rdClienteDeTecnico($pdo, $u['id']);
    if (!$cliente) {
      jsonOut(['error' => 'Todavía no tienes un cliente asignado. Pide a un administrador que te asocie en la ficha del cliente (Clientes → Técnico in-house).'], 409);
    }

    $id = bin2hex(random_bytes(16));
    $pdo->prepare("INSERT INTO reporte_diario (id, tecnico_id, cliente_id, fecha) VALUES (?, ?, ?, ?)")
      ->execute([$id, $u['id'], $cliente['id'], $fecha]);

    $stmt = $pdo->prepare("SELECT * FROM reporte_diario WHERE id = ?");
    $stmt->execute([$id]);
    $reporte = $stmt->fetch();
  }

  $conAct = _rdConActividades($pdo, [$reporte]);
  jsonOut(['reporte' => $conAct[0]]);
}

// --------------------------------------------------------------
// POST — acciones del técnico sobre su propio reporte
// --------------------------------------------------------------
if ($method === 'POST') {
  if ($u['perfil'] !== 'tecnico_inhouse') jsonOut(['error' => 'Este reporte es solo para técnicos in-house'], 403);

  $d      = jsonInput();
  $accion = $d['accion'] ?? '';

  // Todas las acciones actúan sobre el reporte de una fecha dada (hoy si no se manda).
  $fecha = $d['fecha'] ?? _rdHoy();

  $stmt = $pdo->prepare("SELECT * FROM reporte_diario WHERE tecnico_id = ? AND fecha = ?");
  $stmt->execute([$u['id'], $fecha]);
  $reporte = $stmt->fetch();
  if (!$reporte) jsonOut(['error' => 'No existe un reporte para esa fecha. Ábrelo primero (GET) para crearlo.'], 404);
  if ($reporte['cerrado']) jsonOut(['error' => 'Este reporte ya está cerrado. Pide a un administrador que lo reabra si necesitas corregirlo.'], 409);

  if ($accion === 'marcar_inicio') {
    $pdo->prepare("UPDATE reporte_diario SET hora_inicio = ? WHERE id = ?")->execute([_rdHoraActual(), $reporte['id']]);
    jsonOut(['ok' => true]);
  }

  if ($accion === 'marcar_fin') {
    if (empty($reporte['hora_inicio'])) jsonOut(['error' => 'Primero marca la hora de inicio.'], 400);
    $pdo->prepare("UPDATE reporte_diario SET hora_fin = ?, cerrado = 1 WHERE id = ?")->execute([_rdHoraActual(), $reporte['id']]);
    jsonOut(['ok' => true]);
  }

  if ($accion === 'agregar_actividad') {
    $descripcion = trim($d['descripcion'] ?? '');
    if ($descripcion === '') jsonOut(['error' => 'La descripción de la actividad es requerida'], 400);
    $horaInicio = ($d['hora_inicio'] ?? '') ?: null;
    $horaFin    = ($d['hora_fin']    ?? '') ?: null;

    $stmtOrden = $pdo->prepare("SELECT COUNT(*) AS n FROM reporte_diario_actividad WHERE reporte_diario_id = ?");
    $stmtOrden->execute([$reporte['id']]);
    $orden = (int)$stmtOrden->fetch()['n'];

    $id = bin2hex(random_bytes(16));
    $pdo->prepare(
      "INSERT INTO reporte_diario_actividad (id, reporte_diario_id, descripcion, hora_inicio, hora_fin, orden)
       VALUES (?, ?, ?, ?, ?, ?)"
    )->execute([$id, $reporte['id'], $descripcion, $horaInicio, $horaFin, $orden]);

    jsonOut(['ok' => true, 'id' => $id], 201);
  }

  if ($accion === 'eliminar_actividad') {
    $actId = $d['actividad_id'] ?? null;
    if (!$actId) jsonOut(['error' => 'actividad_id requerido'], 400);
    $pdo->prepare("DELETE FROM reporte_diario_actividad WHERE id = ? AND reporte_diario_id = ?")
      ->execute([$actId, $reporte['id']]);
    jsonOut(['ok' => true]);
  }

  jsonOut(['error' => 'Acción no reconocida'], 400);
}

// --------------------------------------------------------------
// PUT — reabrir un reporte cerrado (admin)
// --------------------------------------------------------------
if ($method === 'PUT') {
  if ($u['perfil'] !== 'admin') jsonOut(['error' => 'Se requiere perfil administrador'], 403);

  $d      = jsonInput();
  $accion = $d['accion'] ?? '';
  if ($accion !== 'reabrir') jsonOut(['error' => 'Acción no reconocida'], 400);

  $tecId = $d['tecnico_id'] ?? null;
  $fecha = $d['fecha']      ?? null;
  if (!$tecId || !$fecha) jsonOut(['error' => 'tecnico_id y fecha son requeridos'], 400);

  $pdo->prepare("UPDATE reporte_diario SET cerrado = 0 WHERE tecnico_id = ? AND fecha = ?")
    ->execute([$tecId, $fecha]);

  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
