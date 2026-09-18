<?php
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/festivos.php';
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
// Calcula los días de una ausencia. $festivos es un mapa ['Y-m-d' =>
// nombre] con los festivos que tocan el rango (ver festivosEnRango()
// en backend/lib/festivos.php) — se recibe ya armado para no consultar
// la tabla adentro de esta función (así queda fácil de probar sola).
//
//   - Vacaciones: cuenta lunes a SÁBADO del rango, sin contar los
//     festivos que caigan ahí (así se cuentan en Colombia: domingo y
//     festivo no descuentan de la cuota de vacaciones).
//   - Permiso no remunerado: si el técnico falta aunque sea un solo
//     día hábil (lunes a viernes) de una semana, además de ese día se
//     descuentan el domingo de esa semana y cualquier festivo que
//     caiga esa semana. El sábado YA NO se descuenta automáticamente
//     (solo cuenta si el sábado mismo es festivo). Los días que sí
//     trabajó esa semana (lunes a viernes, no festivo, fuera del
//     rango del permiso) no se cuentan.
//   - El resto de tipos: cuenta lunes a viernes del rango, igual que
//     antes (sin lógica de fin de semana ni de festivos).
//
// El valor calculado siempre queda editable a mano en el front.
// --------------------------------------------------------------
function calcularDiasAusencia(string $tipo, string $fechaInicio, string $fechaFin, array $festivos = []): float {
  $d0 = new DateTime($fechaInicio);
  $d1 = new DateTime($fechaFin);
  if ($d1 < $d0) return 0.0;

  if ($tipo === 'vacaciones') {
    $dias = 0;
    $cursor = clone $d0;
    while ($cursor <= $d1) {
      $dow   = (int)$cursor->format('N'); // 1=lunes ... 7=domingo
      $fecha = $cursor->format('Y-m-d');
      if ($dow >= 1 && $dow <= 6 && !isset($festivos[$fecha])) $dias++;
      $cursor->modify('+1 day');
    }
    return (float)$dias;
  }

  if ($tipo === 'permiso_no_remunerado') {
    $total = 0;
    $lunes = clone $d0;
    $lunes->modify('monday this week');
    $ultimoLunes = clone $d1;
    $ultimoLunes->modify('monday this week');

    while ($lunes <= $ultimoLunes) {
      $diasSemana = [];
      for ($n = 0; $n < 7; $n++) $diasSemana[] = (clone $lunes)->modify("+{$n} days");

      // ¿esta semana tiene algún día hábil (lun-vie) dentro del rango del permiso?
      $activada = false;
      foreach ($diasSemana as $i => $dia) {
        if ($i <= 4 && $dia >= $d0 && $dia <= $d1) { $activada = true; break; }
      }

      if ($activada) {
        foreach ($diasSemana as $i => $dia) {
          $fecha     = $dia->format('Y-m-d');
          $esFestivo = isset($festivos[$fecha]);
          if ($i <= 4) {
            // lunes a viernes: cuenta si está dentro del permiso, o si
            // es festivo (ese día tampoco se trabajaba de todas formas).
            $dentroDelPermiso = $dia >= $d0 && $dia <= $d1;
            if ($dentroDelPermiso || $esFestivo) $total++;
          } elseif ($i === 5) {
            // sábado: ya no se descuenta automáticamente — solo cuenta
            // si el sábado mismo es festivo.
            if ($esFestivo) $total++;
          } else {
            // domingo: se pierde completo, la semana ya se activó.
            $total++;
          }
        }
      }
      $lunes->modify('+7 days');
    }
    return (float)$total;
  }

  // Resto de tipos: lunes a viernes del rango, sin más.
  $dias = 0;
  $cursor = clone $d0;
  while ($cursor <= $d1) {
    $dow = (int)$cursor->format('N');
    if ($dow >= 1 && $dow <= 5) $dias++;
    $cursor->modify('+1 day');
  }
  return (float)$dias;
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

  $dias = isset($d['dias']) && $d['dias'] !== ''
    ? round((float)$d['dias'], 1)
    : calcularDiasAusencia($tipo, $fechaInicio, $fechaFin, festivosEnRango($pdo, $fechaInicio, $fechaFin));
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
