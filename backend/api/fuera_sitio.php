<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// GET /fuera_sitio.php?count=1       -> conteo de pendientes (para badge)
// GET /fuera_sitio.php               -> lista pendientes (revisado=0)
// GET /fuera_sitio.php?archivados=1  -> lista gestionados (revisado=1)
// Filtros opcionales: tareaId, tecnicoId, desde, hasta
// --------------------------------------------------------------
if ($method === 'GET') {
  // Badge del dashboard: solo devuelve el conteo de no revisados
  if (isset($_GET['count'])) {
    try {
      $stmt = $pdo->query("SELECT COUNT(*) FROM checkin_fuera_sitio WHERE revisado = 0");
      jsonOut(['pendientes' => (int)$stmt->fetchColumn()]);
    } catch (Exception $e) {
      jsonOut(['error' => $e->getMessage()], 500);
    }
  }

  $archivados = !empty($_GET['archivados']) ? 1 : 0;
  $where  = ['f.revisado = ' . $archivados];
  $params = [];

  if (!empty($_GET['tareaId'])) {
    $where[] = 'f.tarea_id = ?'; $params[] = $_GET['tareaId'];
  }
  if (!empty($_GET['tecnicoId'])) {
    $where[] = 'f.tecnico_id = ?'; $params[] = $_GET['tecnicoId'];
  }
  if (!empty($_GET['desde'])) {
    $where[] = 'DATE(f.creado_en) >= ?'; $params[] = $_GET['desde'];
  }
  if (!empty($_GET['hasta'])) {
    $where[] = 'DATE(f.creado_en) <= ?'; $params[] = $_GET['hasta'];
  }

  $sql = "SELECT f.*, u.nombre AS tecnico_nombre,
            t.titulo AS tarea_titulo, t.cliente AS tarea_cliente, t.area AS tarea_area,
            ur.nombre AS revisado_por_nombre
          FROM checkin_fuera_sitio f
          LEFT JOIN usuarios u  ON u.id  COLLATE utf8mb4_general_ci = f.tecnico_id   COLLATE utf8mb4_general_ci
          LEFT JOIN tareas   t  ON t.id  COLLATE utf8mb4_general_ci = f.tarea_id     COLLATE utf8mb4_general_ci
          LEFT JOIN usuarios ur ON ur.id COLLATE utf8mb4_general_ci = f.revisado_por COLLATE utf8mb4_general_ci
          WHERE " . implode(' AND ', $where) . "
          ORDER BY f.creado_en DESC";

  try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
      $r['distancia_metros'] = (int)$r['distancia_metros'];
      $r['radio_metros']     = (int)$r['radio_metros'];
      $r['revisado']         = (bool)$r['revisado'];
      if ($r['lat'] !== null) $r['lat'] = (float)$r['lat'];
      if ($r['lng'] !== null) $r['lng'] = (float)$r['lng'];
    }
    jsonOut($rows);
  } catch (Exception $e) {
    jsonOut(['error' => $e->getMessage()], 500);
  }
}

// --------------------------------------------------------------
// PUT /fuera_sitio.php?id=X
// body: { revisadoPor, observacion? }
// Marca el registro como gestionado por el admin.
// --------------------------------------------------------------
if ($method === 'PUT') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);
  $d = jsonInput();
  if (empty($d['revisadoPor'])) jsonOut(['error' => 'revisadoPor requerido'], 400);

  try {
    $pdo->prepare(
      "UPDATE checkin_fuera_sitio
       SET revisado = 1, revisado_por = ?, revisado_en = NOW(), observacion = ?
       WHERE id = ?"
    )->execute([$d['revisadoPor'], $d['observacion'] ?? null, $id]);
    jsonOut(['ok' => true]);
  } catch (Exception $e) {
    jsonOut(['error' => $e->getMessage()], 500);
  }
}

// --------------------------------------------------------------
// POST /fuera_sitio.php
// body: { tareaId, tecnicoId, tipo, lat, lng, distanciaMetros, radioMetros, accion }
// tipo:  'checkin' | 'checkout'
// accion: 'aceptado' | 'cancelado'
// Registra un intento de check fuera del radio del cliente.
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  $required = ['tareaId', 'tecnicoId', 'tipo', 'lat', 'lng', 'distanciaMetros', 'radioMetros', 'accion'];
  foreach ($required as $k) {
    if (!isset($d[$k])) jsonOut(['error' => "Campo requerido: {$k}"], 400);
  }

  $id = bin2hex(random_bytes(16));
  $pdo->prepare(
    "INSERT INTO checkin_fuera_sitio
     (id, tarea_id, tecnico_id, tipo, lat, lng, distancia_metros, radio_metros, accion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )->execute([
    $id,
    $d['tareaId'],
    $d['tecnicoId'],
    $d['tipo'],
    (float)$d['lat'],
    (float)$d['lng'],
    (int)$d['distanciaMetros'],
    (int)$d['radioMetros'],
    $d['accion'],
  ]);

  // ── Aviso a administradores ──────────────────────────────────────
  try {
    require_once __DIR__ . '/../lib/avisos_tecnicos.php';
    require_once __DIR__ . '/../lib/telegram.php';

    $avisaCorreo = configGet($pdo, 'aviso_fuera_sitio') === '1';
    $avisaTg     = configGet($pdo, 'aviso_fuera_sitio_tg') === '1';

    if ($avisaCorreo || $avisaTg) {
      $stmtT = $pdo->prepare("SELECT titulo, cliente FROM tareas WHERE id = ?");
      $stmtT->execute([$d['tareaId']]);
      $tareaFS = $stmtT->fetch() ?: [];

      $stmtU = $pdo->prepare("SELECT nombre FROM usuarios WHERE id = ?");
      $stmtU->execute([$d['tecnicoId']]);
      $tecFS = $stmtU->fetch() ?: [];

      $tipoLabel   = $d['tipo'] === 'checkin' ? 'Check-in' : 'Checkout';
      $accionLabel = $d['accion'] === 'aceptado' ? 'Aceptó continuar' : 'Canceló';
      $clienteFS   = $tareaFS['cliente'] ?? '-';
      $tituloFS    = $tareaFS['titulo']  ?? '-';
      $nombreFS    = $tecFS['nombre']    ?? $d['tecnicoId'];
      $distFS      = (int)$d['distanciaMetros'];
      $radioFS     = (int)$d['radioMetros'];

      if ($avisaCorreo) {
        $extraFS = "<p style='margin:8px 0'>👤 <b>Técnico:</b> " . htmlspecialchars($nombreFS, ENT_QUOTES, 'UTF-8') . "</p>"
                 . "<p style='margin:8px 0'>🏢 <b>Cliente:</b> " . htmlspecialchars($clienteFS, ENT_QUOTES, 'UTF-8') . "</p>"
                 . "<p style='margin:8px 0'>📋 <b>Tarea:</b> "   . htmlspecialchars($tituloFS, ENT_QUOTES, 'UTF-8')  . "</p>"
                 . "<p style='margin:8px 0'>📍 <b>Tipo:</b> {$tipoLabel}</p>"
                 . "<p style='margin:8px 0'>📏 <b>Distancia:</b> {$distFS}m (radio permitido: {$radioFS}m)</p>"
                 . "<p style='margin:8px 0;color:#dc2626;font-weight:700'>⚠️ Acción: {$accionLabel}</p>";
        foreach (adminsConEmail($pdo) as $adm) {
          $cuerpo = htmlAvisoTecnico(
            $adm['nombre'],
            'se registró un check fuera del radio permitido del cliente.',
            $extraFS
          );
          enviarAvisoTecnico($adm['email'], $adm['nombre'], '📍 Check fuera de sitio — ' . $nombreFS, $cuerpo);
        }
      }

      if ($avisaTg) {
        $msg = "📍 <b>Check fuera de sitio</b>\n\n"
             . "👤 <b>Técnico:</b> " . htmlspecialchars($nombreFS, ENT_QUOTES, 'UTF-8') . "\n"
             . "🏢 <b>Cliente:</b> " . htmlspecialchars($clienteFS, ENT_QUOTES, 'UTF-8') . "\n"
             . "📋 <b>Tarea:</b> "   . htmlspecialchars($tituloFS, ENT_QUOTES, 'UTF-8')  . "\n"
             . "📍 <b>Tipo:</b> {$tipoLabel}\n"
             . "📏 <b>Distancia:</b> {$distFS}m (radio: {$radioFS}m)\n"
             . "⚠️ <b>Acción:</b> {$accionLabel}\n\n"
             . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
        foreach (adminsConTelegram($pdo) as $adm) {
          sendTelegramMsg($adm['telegram_chat_id'], $msg);
        }
      }
    }
  } catch (Throwable $e) { /* silencioso */ }

  jsonOut(['id' => $id], 201);
}

jsonOut(['error' => 'Método no soportado'], 405);
