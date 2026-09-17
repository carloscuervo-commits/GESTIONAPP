<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
requireSesion($pdo);
$method = $_SERVER['REQUEST_METHOD'];

const AUSENCIA_TIPOS = ['vacaciones', 'permiso_remunerado', 'permiso_no_remunerado', 'incapacidad', 'falta', 'otro'];

// --------------------------------------------------------------
// requireAdmin(): igual patrón que en usuarios.php — todo este módulo
// es de uso exclusivo del encargado/admin (no hay autogestión de
// técnicos sobre sus propias ausencias).
// Retorna el usuario admin autenticado (para creado_por/gestionado_por).
// --------------------------------------------------------------
function requireAdmin($pdo) {
  $auth  = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  $token = '';
  if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) $token = trim($m[1]);
  if (!$token) jsonOut(['error' => 'No autorizado — se requiere sesión'], 401);

  $stmt = $pdo->prepare("SELECT id, perfil FROM usuarios WHERE token_sesion = ? AND activo = 1");
  $stmt->execute([$token]);
  $u = $stmt->fetch();
  if (!$u || $u['perfil'] !== 'admin') jsonOut(['error' => 'Se requiere perfil administrador'], 403);
  return $u;
}

// --------------------------------------------------------------
// Calcula los días de una ausencia:
//   - Cuenta lunes a viernes dentro del rango (todos los técnicos
//     trabajan de lunes a viernes).
//   - Solo para 'permiso_no_remunerado': por cada semana en la que los
//     5 días hábiles (lun-vie) caen completos dentro del rango, se
//     suman también el sábado y domingo de esa semana (se pierde la
//     semana completa, no solo los días hábiles).
//   - No contempla festivos (no existe hoy un calendario de festivos
//     en Ginno) — el valor queda siempre editable a mano en el front.
// --------------------------------------------------------------
function calcularDiasAusencia(string $tipo, string $fechaInicio, string $fechaFin): float {
  $d0 = new DateTime($fechaInicio);
  $d1 = new DateTime($fechaFin);
  if ($d1 < $d0) return 0.0;

  $diasHabiles = 0;
  $cursor = clone $d0;
  while ($cursor <= $d1) {
    $dow = (int)$cursor->format('N'); // 1=lunes ... 7=domingo
    if ($dow >= 1 && $dow <= 5) $diasHabiles++;
    $cursor->modify('+1 day');
  }

  $diasExtra = 0;
  if ($tipo === 'permiso_no_remunerado') {
    $lunes = clone $d0;
    $lunes->modify('monday this week');
    while ($lunes <= $d1) {
      $viernes = (clone $lunes)->modify('+4 days');
      if ($lunes >= $d0 && $viernes <= $d1) {
        $diasExtra += 2; // sábado y domingo de esa semana
      }
      $lunes->modify('+7 days');
    }
  }

  return (float)($diasHabiles + $diasExtra);
}

function _auRow(array $r): array {
  return [
    'id'            => (int)$r['id'],
    'usuarioId'     => $r['usuario_id'],
    'usuarioNombre' => $r['usuario_nombre'] ?? null,
    'tipo'          => $r['tipo'],
    'fechaInicio'   => $r['fecha_inicio'],
    'fechaFin'      => $r['fecha_fin'],
    'dias'          => (float)$r['dias'],
    'nota'          => $r['nota'],
    'estado'        => $r['estado'],
    'notaGestion'   => $r['nota_gestion'],
    'gestionadoPor' => $r['gestionado_por'],
    'gestionadoEn'  => $r['gestionado_en'],
    'creadoPor'     => $r['creado_por'],
    'creadoEn'      => $r['creado_en'],
  ];
}

// --------------------------------------------------------------
// GET /ausencias.php?anio=2026&usuario_id=CAC&estado=pendiente
// Lista ausencias (filtros opcionales) + resumen anual por técnico
// (cuota asignada / días de vacaciones tomados / saldo).
// --------------------------------------------------------------
if ($method === 'GET') {
  requireAdmin($pdo);

  $anio      = isset($_GET['anio']) && ctype_digit((string)$_GET['anio']) ? (int)$_GET['anio'] : (int)date('Y');
  $usuarioId = $_GET['usuario_id'] ?? null;
  $estado    = $_GET['estado'] ?? null;

  $where  = ['YEAR(a.fecha_inicio) = ?'];
  $params = [$anio];
  if ($usuarioId) { $where[] = 'a.usuario_id = ?'; $params[] = $usuarioId; }
  if ($estado === 'pendiente' || $estado === 'gestionado') { $where[] = 'a.estado = ?'; $params[] = $estado; }

  $sql = "SELECT a.*, u.nombre AS usuario_nombre
          FROM ausencias a
          LEFT JOIN usuarios u ON u.id = a.usuario_id
          WHERE " . implode(' AND ', $where) . "
          ORDER BY a.fecha_inicio DESC, a.id DESC";
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $items = array_map('_auRow', $stmt->fetchAll());

  // Resumen anual: cuota vs. vacaciones tomadas, por cada técnico activo.
  $usuarios = $pdo->query("SELECT id, nombre, dias_vacaciones_anual FROM usuarios WHERE activo = 1 ORDER BY nombre ASC")->fetchAll();
  $tomadosStmt = $pdo->prepare("SELECT COALESCE(SUM(dias),0) AS s FROM ausencias WHERE usuario_id = ? AND tipo = 'vacaciones' AND YEAR(fecha_inicio) = ?");
  $resumen = [];
  foreach ($usuarios as $u) {
    $tomadosStmt->execute([$u['id'], $anio]);
    $tomados = (float)($tomadosStmt->fetch()['s'] ?? 0);
    $cuota   = $u['dias_vacaciones_anual'] !== null ? (float)$u['dias_vacaciones_anual'] : 0.0;
    $resumen[] = [
      'usuarioId'     => $u['id'],
      'usuarioNombre' => $u['nombre'],
      'cuota'         => $cuota,
      'tomados'       => $tomados,
      'saldo'         => round($cuota - $tomados, 2),
    ];
  }

  jsonOut(['anio' => $anio, 'items' => $items, 'resumen' => $resumen]);
}

// --------------------------------------------------------------
// POST /ausencias.php
// Registra una ausencia nueva. Requiere perfil admin.
// Body JSON: { usuario_id, tipo, fecha_inicio, fecha_fin, dias?, nota? }
// Si no se envía "dias", se calcula automáticamente.
// --------------------------------------------------------------
if ($method === 'POST') {
  $admin = requireAdmin($pdo);
  $d = jsonInput();

  $usuarioId    = trim($d['usuario_id'] ?? '');
  $tipo         = $d['tipo'] ?? '';
  $fechaInicio  = $d['fecha_inicio'] ?? '';
  $fechaFin     = $d['fecha_fin'] ?? '';
  $nota         = trim($d['nota'] ?? '') ?: null;

  if (!$usuarioId) jsonOut(['error' => 'usuario_id es requerido'], 400);
  if (!in_array($tipo, AUSENCIA_TIPOS, true)) jsonOut(['error' => 'tipo inválido'], 400);
  if (!$fechaInicio || !$fechaFin) jsonOut(['error' => 'fecha_inicio y fecha_fin son requeridas'], 400);
  if (strtotime($fechaFin) < strtotime($fechaInicio)) jsonOut(['error' => 'fecha_fin no puede ser anterior a fecha_inicio'], 400);

  $chk = $pdo->prepare("SELECT id FROM usuarios WHERE id = ?");
  $chk->execute([$usuarioId]);
  if (!$chk->fetch()) jsonOut(['error' => "No existe el usuario '$usuarioId'"], 404);

  $dias = isset($d['dias']) && $d['dias'] !== '' ? round((float)$d['dias'], 1) : calcularDiasAusencia($tipo, $fechaInicio, $fechaFin);
  if ($dias <= 0) jsonOut(['error' => 'Los días de la ausencia deben ser mayores a 0'], 400);

  $stmt = $pdo->prepare(
    "INSERT INTO ausencias (usuario_id, tipo, fecha_inicio, fecha_fin, dias, nota, creado_por)
     VALUES (?,?,?,?,?,?,?)"
  );
  $stmt->execute([$usuarioId, $tipo, $fechaInicio, $fechaFin, $dias, $nota, $admin['id']]);

  jsonOut(['ok' => true, 'id' => (int)$pdo->lastInsertId()], 201);
}

// --------------------------------------------------------------
// PUT /ausencias.php?id=X
// - Body { action: 'gestionar', nota_gestion } → marca como gestionada/archivada.
// - Body { action: 'reabrir' } → vuelve a dejarla pendiente.
// - Body { tipo?, fecha_inicio?, fecha_fin?, dias?, nota? } → edita el registro.
// Requiere perfil admin.
// --------------------------------------------------------------
if ($method === 'PUT') {
  $admin = requireAdmin($pdo);
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido en query string'], 400);

  $stmt = $pdo->prepare("SELECT * FROM ausencias WHERE id = ?");
  $stmt->execute([$id]);
  $prev = $stmt->fetch();
  if (!$prev) jsonOut(['error' => 'Ausencia no encontrada'], 404);

  $d = jsonInput();
  $accion = $d['action'] ?? null;

  if ($accion === 'gestionar') {
    $notaGestion = trim($d['nota_gestion'] ?? '');
    if ($notaGestion === '') jsonOut(['error' => 'nota_gestion es requerida para marcar como gestionada'], 400);
    $pdo->prepare("UPDATE ausencias SET estado='gestionado', nota_gestion=?, gestionado_por=?, gestionado_en=NOW() WHERE id=?")
        ->execute([$notaGestion, $admin['id'], $id]);
    jsonOut(['ok' => true]);
  }

  if ($accion === 'reabrir') {
    $pdo->prepare("UPDATE ausencias SET estado='pendiente' WHERE id=?")->execute([$id]);
    jsonOut(['ok' => true]);
  }

  // Edición general de campos
  $tipo        = in_array($d['tipo'] ?? '', AUSENCIA_TIPOS, true) ? $d['tipo'] : $prev['tipo'];
  $fechaInicio = $d['fecha_inicio'] ?? $prev['fecha_inicio'];
  $fechaFin    = $d['fecha_fin']    ?? $prev['fecha_fin'];
  $nota        = array_key_exists('nota', $d) ? ((trim($d['nota'] ?? '')) ?: null) : $prev['nota'];

  if (strtotime($fechaFin) < strtotime($fechaInicio)) jsonOut(['error' => 'fecha_fin no puede ser anterior a fecha_inicio'], 400);

  $dias = isset($d['dias']) && $d['dias'] !== '' ? round((float)$d['dias'], 1) : (float)$prev['dias'];
  if ($dias <= 0) jsonOut(['error' => 'Los días de la ausencia deben ser mayores a 0'], 400);

  $pdo->prepare("UPDATE ausencias SET tipo=?, fecha_inicio=?, fecha_fin=?, dias=?, nota=? WHERE id=?")
      ->execute([$tipo, $fechaInicio, $fechaFin, $dias, $nota, $id]);

  jsonOut(['ok' => true]);
}

// --------------------------------------------------------------
// DELETE /ausencias.php?id=X — elimina un registro (para corregir un
// error de digitación). Requiere perfil admin.
// --------------------------------------------------------------
if ($method === 'DELETE') {
  requireAdmin($pdo);
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido en query string'], 400);
  $pdo->prepare("DELETE FROM ausencias WHERE id = ?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
