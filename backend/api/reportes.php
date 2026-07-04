<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();
require_once __DIR__ . '/../lib/mailer.php';

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

function fotosDeReporte($pdo, $reporteId) {
  $stmt = $pdo->prepare("SELECT id, seccion_id, archivo, orden FROM reporte_fotos WHERE reporte_id = ? ORDER BY seccion_id, orden, id");
  $stmt->execute([$reporteId]);
  return $stmt->fetchAll();
}

function participantesDeReporte($pdo, $reporteId) {
  $stmt = $pdo->prepare("SELECT * FROM visita_participantes WHERE reporte_id = ? ORDER BY check_in ASC");
  $stmt->execute([$reporteId]);
  $partes = $stmt->fetchAll();
  foreach ($partes as &$p) {
    $stmt2 = $pdo->prepare("SELECT id, pausa_inicio, pausa_fin, justificacion FROM visita_pausas WHERE participante_id = ? ORDER BY pausa_inicio ASC");
    $stmt2->execute([$p['id']]);
    $p['pausas'] = $stmt2->fetchAll();
  }
  return $partes;
}

function reporteConFotos($pdo, $row) {
  $row['fotos']         = fotosDeReporte($pdo, $row['id']);
  $row['participantes'] = participantesDeReporte($pdo, $row['id']);
  $row['datos']         = $row['datos'] ? json_decode($row['datos'], true) : [];
  return $row;
}

// Versión ligera (sin fotos) para listados masivos usados por el módulo de informes.
function reporteSinFotos($row) {
  $row['datos'] = $row['datos'] ? json_decode($row['datos'], true) : [];
  return $row;
}

// --------------------------------------------------------------
// GET /reportes.php?id=UUID            -> un reporte (con fotos)
// GET /reportes.php?tareaId=UUID        -> reportes de una tarea (desc)
// GET /reportes.php?todos=1            -> TODOS los reportes (con datos de la tarea), para informes/exportes
// --------------------------------------------------------------
if ($method === 'GET') {
  // GET ?tardias=1[&desde=YYYY-MM-DD][&hasta=YYYY-MM-DD][&tecnico_id=X]
  // Devuelve participantes cuyo check_in fue posterior a la hora_programacion de la tarea, en la misma fecha programada.
  // GET ?geofence=1&tareaId=X&lat=Y&lng=Z
  // Comprueba si el técnico (lat,lng) está dentro del radio del cliente de la tarea.
  // No hace check-in — solo devuelve el resultado para que el frontend decida.
  if (!empty($_GET['geofence'])) {
    $tareaId = $_GET['tareaId'] ?? null;
    $lat     = isset($_GET['lat']) ? (float)$_GET['lat'] : null;
    $lng     = isset($_GET['lng']) ? (float)$_GET['lng'] : null;
    if (!$tareaId || $lat === null || $lng === null) jsonOut(['error' => 'tareaId, lat y lng requeridos'], 400);

    $stmt = $pdo->prepare(
      "SELECT t.cliente, c.id AS cliente_id, c.nombre, c.lat, c.lng, c.radio_metros, c.direccion
       FROM tareas t
       LEFT JOIN clientes c ON c.nombre COLLATE utf8mb4_general_ci = t.cliente COLLATE utf8mb4_general_ci
       WHERE t.id = ?"
    );
    $stmt->execute([$tareaId]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['error' => 'Tarea no encontrada'], 404);

    if ($row['lat'] === null || $row['lng'] === null) {
      jsonOut([
        'sinUbicacion'  => true,
        'cliente'       => $row['cliente'],
        'clienteNombre' => $row['nombre'] ?? $row['cliente'],
        'clienteId'     => $row['cliente_id'] ?? null,
        'direccion'     => $row['direccion'] ?? null,
      ]);
    }

    $distancia = haversineMetros($lat, $lng, (float)$row['lat'], (float)$row['lng']);
    $radio     = (int)$row['radio_metros'];
    jsonOut([
      'dentroZona'      => $distancia <= $radio,
      'distanciaMetros' => (int)round($distancia),
      'radioMetros'     => $radio,
      'clienteNombre'   => $row['nombre'] ?? $row['cliente'],
      'clienteId'       => $row['cliente_id'] ?? null,
      'clienteLat'      => (float)$row['lat'],
      'clienteLng'      => (float)$row['lng'],
    ]);
  }

  if (!empty($_GET['tardias'])) {
    $where  = ["vp.check_in IS NOT NULL",
               "t.fecha_programacion IS NOT NULL",
               "t.hora_programacion IS NOT NULL",
               // Tareas multi-día: check-in puede ser en cualquier día del rango programado
               "DATE(vp.check_in) BETWEEN t.fecha_programacion AND DATE_ADD(t.fecha_programacion, INTERVAL (COALESCE(t.dias_programacion, 1) - 1) DAY)",
               "TIME(vp.check_in) > t.hora_programacion"];
    $params = [];
    if (!empty($_GET['desde'])) { $where[] = "DATE(vp.check_in) >= ?"; $params[] = $_GET['desde']; }
    if (!empty($_GET['hasta'])) { $where[] = "DATE(vp.check_in) <= ?"; $params[] = $_GET['hasta']; }
    if (!empty($_GET['tecnico_id'])) { $where[] = "vp.tecnico_id = ?"; $params[] = $_GET['tecnico_id']; }
    $sql = "SELECT
              vp.id          AS participante_id,
              vp.tecnico_id,
              vp.check_in,
              vp.check_out,
              r.id           AS reporte_id,
              r.tarea_id,
              t.titulo,
              t.cliente,
              t.area,
              t.fecha_programacion,
              t.hora_programacion
            FROM visita_participantes vp
            JOIN reportes r ON r.id = vp.reporte_id COLLATE utf8mb4_general_ci
            JOIN tareas t   ON t.id = r.tarea_id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY vp.check_in DESC";
    try {
      $stmt = $pdo->prepare($sql);
      $stmt->execute($params);
      jsonOut($stmt->fetchAll());
    } catch (Exception $e) {
      jsonOut(['error' => $e->getMessage(), 'sql_fragment' => substr($sql, 0, 200)], 500);
    }
  }

  if (!empty($_GET['todos'])) {
    $stmt = $pdo->query("SELECT r.*, t.cliente, t.titulo, t.area FROM reportes r JOIN tareas t ON t.id = r.tarea_id ORDER BY r.creado_en DESC");
    jsonOut(array_map('reporteSinFotos', $stmt->fetchAll()));
  }

  if (!empty($_GET['activos'])) {
    $stmt = $pdo->query("SELECT * FROM reportes WHERE estado = 'en_visita'");
    jsonOut(array_map(fn($r) => reporteConFotos($pdo, $r), $stmt->fetchAll()));
  }

  if (!empty($_GET['estado'])) {
    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE estado = ?");
    $stmt->execute([$_GET['estado']]);
    jsonOut(array_map(fn($r) => reporteConFotos($pdo, $r), $stmt->fetchAll()));
  }

  if (!empty($_GET['id'])) {
    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$_GET['id']]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['error' => 'No encontrado'], 404);
    jsonOut(reporteConFotos($pdo, $row));
  }

  // GET ?horasContrato=1&tareaId=X
  // Devuelve horas_contratadas, horas_consumidas y horas_disponibles este mes para la tarea.
  if (!empty($_GET['horasContrato']) && !empty($_GET['tareaId'])) {
    $tareaId2 = $_GET['tareaId'];
    $stmtT = $pdo->prepare("SELECT cliente, area, tipo_tarea FROM tareas WHERE id = ?");
    $stmtT->execute([$tareaId2]);
    $tInfo = $stmtT->fetch();
    if (!$tInfo || $tInfo['tipo_tarea'] !== 'contrato') {
      jsonOut(['horasContratadas' => 0, 'horasConsumidas' => 0, 'horasDisponibles' => 0]);
    }

    $stmtC = $pdo->prepare("
      SELECT contrato_horas_mes FROM clientes
      WHERE nombre COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci
        AND contrato_area = ?
      LIMIT 1
    ");
    $stmtC->execute([$tInfo['cliente'], $tInfo['area']]);
    $cRow = $stmtC->fetch();
    $horasContratadas = $cRow ? (float)$cRow['contrato_horas_mes'] : 0;

    $stmtCons = $pdo->prepare("
      SELECT COALESCE(SUM(vp.horas_contrato), 0)
      FROM visita_participantes vp
      JOIN reportes r2 ON r2.id = vp.reporte_id
      JOIN tareas t2   ON t2.id = r2.tarea_id COLLATE utf8mb4_general_ci
      WHERE t2.cliente   COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci
        AND t2.tipo_tarea = 'contrato'
        AND t2.area      = ?
        AND YEAR(vp.check_out)  = YEAR(CURDATE())
        AND MONTH(vp.check_out) = MONTH(CURDATE())
        AND vp.horas_contrato IS NOT NULL
    ");
    $stmtCons->execute([$tInfo['cliente'], $tInfo['area']]);
    $horasConsumidas = (float)$stmtCons->fetchColumn();

    jsonOut([
      'horasContratadas' => $horasContratadas,
      'horasConsumidas'  => $horasConsumidas,
      'horasDisponibles' => round($horasContratadas - $horasConsumidas, 1),
    ]);
  }

  if (!empty($_GET['tareaId'])) {
    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE tarea_id = ? ORDER BY creado_en DESC");
    $stmt->execute([$_GET['tareaId']]);
    $rows = array_map(fn($r) => reporteConFotos($pdo, $r), $stmt->fetchAll());
    jsonOut($rows);
  }

  jsonOut(['error' => 'id o tareaId requerido'], 400);
}

// --------------------------------------------------------------
// POST /reportes.php  -> Iniciar visita / agregar técnico (check-in)
// body: { tareaId, tecnicoCheckinId, checkIn? }
//   checkIn (opcional): "HH:MM" — hora manual ingresada por admin (hora Bogotá).
//   Si se omite, se usa NOW() (flujo normal del técnico).
//
// Multi-técnico: si ya hay un reporte 'en_visita' para la tarea se agrega
// un nuevo participante en lugar de crear un segundo reporte. Si el técnico
// ya tiene un participante activo (sin check_out) se devuelve el reporte tal
// cual (idempotente). Crea un reporte nuevo solo si no hay ninguno en curso.
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  $tareaId = $d['tareaId'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tareaId requerido'], 400);

  $stmt = $pdo->prepare("SELECT titulo, cliente, area, fecha_programacion, hora_programacion FROM tareas WHERE id = ?");
  $stmt->execute([$tareaId]);
  $tarea = $stmt->fetch();
  if (!$tarea) jsonOut(['error' => 'Tarea no encontrada'], 404);

  // Snapshot de programación para visita_participantes
  $snapFecha = $tarea['fecha_programacion'] ?? null;
  $snapHora  = $tarea['hora_programacion']  ?? null;

  $tecnicoId = $d['tecnicoCheckinId'] ?? null;

  // Construir timestamp de check-in
  $checkInParam = null;
  if (!empty($d['checkIn']) && preg_match('/^\d{2}:\d{2}$/', $d['checkIn'])) {
    $tz = new DateTimeZone('America/Bogota');
    $checkInParam = (new DateTime('now', $tz))->format('Y-m-d') . ' ' . $d['checkIn'] . ':00';
  }
  $checkInVal = $checkInParam ?: date('Y-m-d H:i:s');

  // ¿Existe un reporte en_visita para esta tarea?
  $stmt = $pdo->prepare("SELECT * FROM reportes WHERE tarea_id = ? AND estado = 'en_visita' ORDER BY creado_en DESC LIMIT 1");
  $stmt->execute([$tareaId]);
  $enCurso = $stmt->fetch();

  $checkinLat = isset($d['lat']) ? (float)$d['lat'] : null;
  $checkinLng = isset($d['lng']) ? (float)$d['lng'] : null;

  if ($enCurso) {
    // Reporte en curso → revisar si este técnico ya está registrado sin checkout
    $stmt = $pdo->prepare("SELECT id FROM visita_participantes WHERE reporte_id = ? AND tecnico_id = ? AND check_out IS NULL");
    $stmt->execute([$enCurso['id'], $tecnicoId]);
    if ($stmt->fetch()) {
      // Ya registrado: idempotente
      jsonOut(reporteConFotos($pdo, $enCurso));
    }
    // Agregar como participante adicional
    $partId = isset($d['participanteId']) ? $d['participanteId'] : bin2hex(random_bytes(16));
    $pdo->prepare("INSERT INTO visita_participantes (id, reporte_id, tecnico_id, check_in, checkin_lat, checkin_lng, fecha_prog_snap, hora_prog_snap) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      ->execute([$partId, $enCurso['id'], $tecnicoId, $checkInVal, $checkinLat, $checkinLng, $snapFecha, $snapHora]);
    // Notificar llegada adicional
    try {
      $tecnicoNombre = _nombreTecnico($pdo, $tecnicoId);
      $horaDisplay = $checkInParam ? date('d/m/Y H:i', strtotime($checkInParam)) . ' (manual)' : date('d/m/Y H:i');
      enviarCorreoConAdjunto([CORREO_ADMIN_FIJO],
        "🟢 Técnico adicional en sitio — " . ($tarea['cliente'] ?: 'Sin cliente'),
        "<div style='font-family:Arial,sans-serif;max-width:600px;color:#1e293b'>"
        . "<p>¡Hola! Te cuento que <b>{$tecnicoNombre}</b> acaba de unirse a una visita en curso.</p>"
        . "<p style='margin:0'><b>Cliente:</b> " . htmlspecialchars($tarea['cliente'] ?: '-') . "<br>"
        . "<b>Tarea:</b> " . htmlspecialchars($tarea['titulo']) . "<br>"
        . "<b>Hora de llegada:</b> {$horaDisplay}</p>"
        . "<hr style='border:none;border-top:1px solid #e2e8f0;margin:16px 0'>"
        . "<p style='color:#94a3b8;font-size:12px;margin:0'>Ginno · Asistente de Grupo Innovate</p>"
        . "</div>"
      );
    } catch (Throwable $e) {}
    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$enCurso['id']]);
    jsonOut(reporteConFotos($pdo, $stmt->fetch()), 201);
  }

  // No hay reporte en curso → crear reporte + primer participante
  // Aceptar id generado por el cliente (soporte offline); si no viene, generarlo aquí
  $reporteId = (isset($d['id']) && strlen($d['id']) >= 16) ? $d['id'] : bin2hex(random_bytes(16));
  $partId    = (isset($d['participanteId']) && strlen($d['participanteId']) >= 16) ? $d['participanteId'] : bin2hex(random_bytes(16));
  $pdo->prepare("INSERT IGNORE INTO reportes (id, tarea_id, estado, tecnico_checkin_id, check_in) VALUES (?, ?, 'en_visita', ?, ?)")
    ->execute([$reporteId, $tareaId, $tecnicoId, $checkInVal]);
  $pdo->prepare("INSERT IGNORE INTO visita_participantes (id, reporte_id, tecnico_id, check_in, checkin_lat, checkin_lng, fecha_prog_snap, hora_prog_snap) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    ->execute([$partId, $reporteId, $tecnicoId, $checkInVal, $checkinLat, $checkinLng, $snapFecha, $snapHora]);

  // Notificación a administrativo (no bloqueante si falla)
  try {
    $tecnicoNombre = _nombreTecnico($pdo, $tecnicoId);
    $horaDisplay = $checkInParam ? date('d/m/Y H:i', strtotime($checkInParam)) . ' (manual)' : date('d/m/Y H:i');
    enviarCorreoConAdjunto([CORREO_ADMIN_FIJO],
      "🟢 Visita iniciada — " . ($tarea['cliente'] ?: 'Sin cliente'),
      "<div style='font-family:Arial,sans-serif;max-width:600px;color:#1e293b'>"
      . "<p>¡Hola! Te cuento que <b>{$tecnicoNombre}</b> ya está en sitio.</p>"
      . "<p style='margin:0'><b>Cliente:</b> " . htmlspecialchars($tarea['cliente'] ?: '-') . "<br>"
      . "<b>Tarea:</b> " . htmlspecialchars($tarea['titulo']) . "<br>"
      . "<b>Hora de inicio:</b> {$horaDisplay}</p>"
      . "<hr style='border:none;border-top:1px solid #e2e8f0;margin:16px 0'>"
      . "<p style='color:#94a3b8;font-size:12px;margin:0'>Ginno · Asistente de Grupo Innovate</p>"
      . "</div>"
    );
  } catch (Throwable $e) {}

  $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
  $stmt->execute([$reporteId]);
  jsonOut(reporteConFotos($pdo, $stmt->fetch()), 201);
}

// --------------------------------------------------------------
// PUT /reportes.php?id=UUID
// body: { accion: 'checkout', tecnicoCheckoutId }
//    -> marca check_out = NOW(), estado = 'borrador'
// body: { plantilla, datos: {...} }
//    -> guarda los campos de la plantilla (descripción, materiales, etc.)
// body: { pdfArchivo }
//    -> registra el nombre del PDF ya subido (ver reporte_pdf.php)
// --------------------------------------------------------------
if ($method === 'PUT') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
  $stmt->execute([$id]);
  $prev = $stmt->fetch();
  if (!$prev) jsonOut(['error' => 'No encontrado'], 404);

  $d = jsonInput();

  // ── Edición admin de un participante individual ──────────────────
  if (($d['accion'] ?? '') === 'editParticipante') {
    $partId   = $d['participanteId'] ?? null;
    $tecnicoId = $d['tecnicoId']     ?? null;
    $hIn      = $d['checkIn']        ?? null;  // "HH:MM"
    $hOut     = $d['checkOut']       ?? null;  // "HH:MM" o null
    if (!$partId || !$hIn) jsonOut(['error' => 'participanteId y checkIn son obligatorios'], 400);

    // Recuperar la fecha de la fila actual para componer datetimes
    $stmtPrev = $pdo->prepare("SELECT check_in FROM visita_participantes WHERE id = ?");
    $stmtPrev->execute([$partId]);
    $prevPart = $stmtPrev->fetch();
    $fechaBase = $prevPart ? substr($prevPart['check_in'], 0, 10) : date('Y-m-d');

    $newIn  = $fechaBase . ' ' . $hIn  . ':00';
    $newOut = $hOut ? ($fechaBase . ' ' . $hOut . ':00') : null;

    // Actualizar horas_contrato si el admin las edita explícitamente
    if (array_key_exists('horasContrato', $d)) {
      $horasContratoVal = ($d['horasContrato'] !== null && $d['horasContrato'] !== '') ? (float)$d['horasContrato'] : null;
      $pdo->prepare("UPDATE visita_participantes SET tecnico_id=?, check_in=?, check_out=?, horas_contrato=? WHERE id=?")
        ->execute([$tecnicoId, $newIn, $newOut, $horasContratoVal, $partId]);
    } else {
      $pdo->prepare("UPDATE visita_participantes SET tecnico_id=?, check_in=?, check_out=? WHERE id=?")
        ->execute([$tecnicoId, $newIn, $newOut, $partId]);
    }

    // Eliminar pausas que quedaron completamente fuera del nuevo rango de trabajo:
    //   - empieza después del nuevo checkout (o no hay checkout)
    //   - termina antes del nuevo check-in
    if ($newOut) {
      $pdo->prepare("DELETE FROM visita_pausas WHERE participante_id = ? AND (pausa_inicio >= ? OR (pausa_fin IS NOT NULL AND pausa_fin <= ?))")
        ->execute([$partId, $newOut, $newIn]);
    } else {
      $pdo->prepare("DELETE FROM visita_pausas WHERE participante_id = ? AND pausa_fin IS NOT NULL AND pausa_fin <= ?")
        ->execute([$partId, $newIn]);
    }

    // Si ya todos tienen checkout → mantener borrador; si hay alguno sin → en_visita
    $stmtCnt = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ? AND check_out IS NULL");
    $stmtCnt->execute([$id]);
    $sinOut = (int)$stmtCnt->fetchColumn();
    $nuevoEstado = $sinOut > 0 ? 'en_visita' : 'borrador';

    // Sincronizar top-level check_in / check_out del reporte con MIN/MAX de los participantes,
    // para que renderFormularioReporte muestre siempre la hora correcta.
    $stmtSync = $pdo->prepare("SELECT MIN(check_in), MAX(check_out) FROM visita_participantes WHERE reporte_id = ?");
    $stmtSync->execute([$id]);
    [$minIn, $maxOut] = $stmtSync->fetch(\PDO::FETCH_NUM);

    $pdo->prepare("UPDATE reportes SET estado=?, check_in=?, check_out=? WHERE id=?")
      ->execute([$nuevoEstado, $minIn ?: $prev['check_in'], $maxOut, $id]);

    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$id]);
    jsonOut(reporteConFotos($pdo, $stmt->fetch()));
  }

  // ── Pausar visita de un participante ────────────────────────────
  if (($d['accion'] ?? '') === 'pausar') {
    $partId       = $d['participanteId'] ?? null;
    $justificacion = trim($d['justificacion'] ?? '');
    if (!$partId)       jsonOut(['error' => 'participanteId requerido'], 400);
    if ($justificacion === '') jsonOut(['error' => 'La justificación es obligatoria'], 400);
    // Idempotente: si ya hay pausa activa, devolver el reporte tal cual
    $stmtPausa = $pdo->prepare("SELECT id FROM visita_pausas WHERE participante_id = ? AND pausa_fin IS NULL");
    $stmtPausa->execute([$partId]);
    if (!$stmtPausa->fetch()) {
      $pausaId = bin2hex(random_bytes(16));
      $pdo->prepare("INSERT INTO visita_pausas (id, participante_id, pausa_inicio, justificacion) VALUES (?, ?, NOW(), ?)")
        ->execute([$pausaId, $partId, $justificacion]);
    }
    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$id]);
    jsonOut(reporteConFotos($pdo, $stmt->fetch()));
  }

  // ── Reanudar visita de un participante ──────────────────────────
  if (($d['accion'] ?? '') === 'reanudar') {
    $partId = $d['participanteId'] ?? null;
    if (!$partId) jsonOut(['error' => 'participanteId requerido'], 400);
    $pdo->prepare("UPDATE visita_pausas SET pausa_fin = NOW() WHERE participante_id = ? AND pausa_fin IS NULL")
      ->execute([$partId]);
    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$id]);
    jsonOut(reporteConFotos($pdo, $stmt->fetch()));
  }

  if (($d['accion'] ?? '') === 'checkout') {
    $tecnicoOut  = $d['tecnicoCheckoutId'] ?? null;
    $partId      = $d['participanteId']    ?? null;
    $checkoutLat = isset($d['lat']) ? (float)$d['lat'] : null;
    $checkoutLng = isset($d['lng']) ? (float)$d['lng'] : null;

    if ($partId) {
      // ── Multi-tech: actualizar participante específico ──────────
      // Auto-cerrar pausa activa si el técnico finaliza estando en pausa
      $pdo->prepare("UPDATE visita_pausas SET pausa_fin = NOW() WHERE participante_id = ? AND pausa_fin IS NULL")
        ->execute([$partId]);
      $pdo->prepare("UPDATE visita_participantes SET check_out = NOW(), checkout_lat = ?, checkout_lng = ? WHERE id = ?")
        ->execute([$checkoutLat, $checkoutLng, $partId]);
      // ¿Quedan participantes sin checkout?
      $stmt = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ? AND check_out IS NULL");
      $stmt->execute([$id]);
      $pendientes = (int)$stmt->fetchColumn();
      if ($pendientes === 0) {
        // Todos terminaron → pasar a borrador
        $stmt2 = $pdo->prepare("SELECT MAX(check_out) FROM visita_participantes WHERE reporte_id = ?");
        $stmt2->execute([$id]);
        $ultimoCheckout = $stmt2->fetchColumn();
        $pdo->prepare("UPDATE reportes SET estado='borrador', check_out=?, tecnico_checkout_id=? WHERE id=?")
          ->execute([$ultimoCheckout, $tecnicoOut, $id]);
      }
    } else {
      // ── Legacy: checkout único (registros sin visita_participantes) ──
      $pdo->prepare("UPDATE reportes SET check_out=NOW(), tecnico_checkout_id=?, estado='borrador' WHERE id=?")
        ->execute([$tecnicoOut, $id]);
      // Intentar actualizar participante coincidente si existe
      $pdo->prepare("UPDATE visita_participantes SET check_out=NOW(), checkout_lat=?, checkout_lng=? WHERE reporte_id=? AND tecnico_id=? AND check_out IS NULL")
        ->execute([$checkoutLat, $checkoutLng, $id, $tecnicoOut]);
    }

    // ── Descuento de horas de contrato (si la tarea es tipo contrato) ──
    try {
      $stmtTipo = $pdo->prepare("SELECT t.tipo_tarea, t.cliente, t.area FROM reportes r JOIN tareas t ON t.id = r.tarea_id WHERE r.id = ?");
      $stmtTipo->execute([$id]);
      $tareaInfo = $stmtTipo->fetch();

      if ($tareaInfo && $tareaInfo['tipo_tarea'] === 'contrato' && $partId) {
        $stmtPart2 = $pdo->prepare("SELECT check_in, check_out FROM visita_participantes WHERE id = ?");
        $stmtPart2->execute([$partId]);
        $partData = $stmtPart2->fetch();

        if ($partData && $partData['check_in'] && $partData['check_out']) {
          // Duración neta en minutos (descontando pausas)
          $durMinutos = max(0, (int)((strtotime($partData['check_out']) - strtotime($partData['check_in'])) / 60));
          $stmtPausas = $pdo->prepare("SELECT pausa_inicio, pausa_fin FROM visita_pausas WHERE participante_id = ? AND pausa_fin IS NOT NULL");
          $stmtPausas->execute([$partId]);
          foreach ($stmtPausas->fetchAll() as $pz) {
            $durMinutos -= max(0, (int)((strtotime($pz['pausa_fin']) - strtotime($pz['pausa_inicio'])) / 60));
          }
          $durMinutos = max(0, $durMinutos);

          // Redondeo: mínimo 30 min; residuo > 10 min sube al siguiente bloque
          $medias = (int)floor($durMinutos / 30);
          if (($durMinutos % 30) > 10) $medias++;
          $horasContrato = max(0.5, $medias * 0.5);

          $pdo->prepare("UPDATE visita_participantes SET horas_contrato = ? WHERE id = ?")
            ->execute([$horasContrato, $partId]);

          // Horas consumidas este mes para el cliente/área
          $stmtConsumo = $pdo->prepare("
            SELECT COALESCE(SUM(vp.horas_contrato), 0)
            FROM visita_participantes vp
            JOIN reportes r2 ON r2.id = vp.reporte_id
            JOIN tareas t2   ON t2.id = r2.tarea_id COLLATE utf8mb4_general_ci
            WHERE t2.cliente   COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci
              AND t2.tipo_tarea = 'contrato'
              AND t2.area      = ?
              AND YEAR(vp.check_out)  = YEAR(CURDATE())
              AND MONTH(vp.check_out) = MONTH(CURDATE())
              AND vp.horas_contrato IS NOT NULL
          ");
          $stmtConsumo->execute([$tareaInfo['cliente'], $tareaInfo['area']]);
          $horasConsumidas = (float)$stmtConsumo->fetchColumn();

          // Horas del contrato del cliente
          $stmtContrato = $pdo->prepare("
            SELECT contrato_horas_mes FROM clientes
            WHERE nombre COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci
              AND contrato_area = ?
            LIMIT 1
          ");
          $stmtContrato->execute([$tareaInfo['cliente'], $tareaInfo['area']]);
          $contratoRow      = $stmtContrato->fetch();
          $horasContratadas = $contratoRow ? (float)$contratoRow['contrato_horas_mes'] : 0;

          // Si se agotaron → crear tarea adicional automáticamente
          if ($horasContratadas > 0 && $horasConsumidas > $horasContratadas) {
            $nuevaTareaId = bin2hex(random_bytes(16));
            $pdo->prepare("INSERT INTO tareas
              (id, titulo, descripcion, area, estado, tipo_tarea, cliente, creado_por)
              VALUES (?, ?, ?, ?, 'programado', 'evento', ?, 'ginno')")
              ->execute([
                $nuevaTareaId,
                'Visita de contrato adicional',
                'Horas de contrato agotadas. Visita generada automáticamente por Ginno.',
                $tareaInfo['area'],
                $tareaInfo['cliente'],
              ]);
          }
        }
      }
    } catch (Throwable $e) { /* no bloquear checkout */ }
    // ────────────────────────────────────────────────────────────────

    // ── Notificación de checkout a administrativo ──────────────────
    try {
      // Datos del participante que acaba de hacer checkout
      $stmtPart = $partId
        ? $pdo->prepare("SELECT * FROM visita_participantes WHERE id = ?")
        : $pdo->prepare("SELECT * FROM visita_participantes WHERE reporte_id = ? AND tecnico_id = ? ORDER BY check_out DESC LIMIT 1");
      if ($partId) { $stmtPart->execute([$partId]); }
      else         { $stmtPart->execute([$id, $tecnicoOut]); }
      $part = $stmtPart->fetch();

      // Estado actualizado del reporte
      $stmtRep = $pdo->prepare("SELECT r.*, t.titulo, t.cliente FROM reportes r JOIN tareas t ON t.id = r.tarea_id WHERE r.id = ?");
      $stmtRep->execute([$id]);
      $rep = $stmtRep->fetch();

      $tecnicoNombre  = _nombreTecnico($pdo, $tecnicoOut ?: ($part['tecnico_id'] ?? null));
      $horaIn         = $part ? date('H:i', strtotime($part['check_in']))  : '-';
      $horaOut        = $part && $part['check_out'] ? date('H:i', strtotime($part['check_out'])) : date('H:i');
      $fechaVisita    = $part ? date('d/m/Y', strtotime($part['check_in'])) : date('d/m/Y');

      // ¿Ya generó el reporte?
      $reporteHecho   = !empty($rep['pdf_archivo']) || !in_array($rep['estado'] ?? '', ['en_visita', 'borrador']);
      $reporteLabel   = $reporteHecho ? '✅ Sí' : '⏳ Pendiente';

      // ¿Ya se envió al cliente?
      $enviado        = ($rep['estado'] ?? '') === 'enviado';
      $enviadoLabel   = $enviado
        ? '✅ Sí — <b>' . htmlspecialchars($rep['enviado_a'] ?? '') . '</b>'
        : '⏳ No enviado aún';

      // ¿Quedan otros técnicos en visita?
      $stmtActivos = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ? AND check_out IS NULL");
      $stmtActivos->execute([$id]);
      $activosRestantes = (int)$stmtActivos->fetchColumn();
      $otrosLabel = $activosRestantes > 0
        ? "⚠️ Quedan <b>{$activosRestantes}</b> técnico(s) aún en sitio"
        : "✅ Todos los técnicos han salido";

      $titulo  = htmlspecialchars($rep['titulo'] ?? '');
      $cliente = htmlspecialchars($rep['cliente'] ?? '-');

      enviarCorreoConAdjunto(
        [CORREO_ADMIN_FIJO],
        "🔴 Visita finalizada — {$cliente}",
        "<div style='font-family:Arial,sans-serif;max-width:600px;color:#1e293b'>"
        . "<p>¡Hola! <b>{$tecnicoNombre}</b> ya terminó su visita. Aquí el resumen:</p>"
        . "<table style='border-collapse:collapse;font-size:14px'>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>📅 Fecha</td><td><b>{$fechaVisita}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>🕐 Check-in</td><td><b>{$horaIn}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>🕐 Check-out</td><td><b>{$horaOut}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>👤 Cliente</td><td><b>{$cliente}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>📋 Tarea</td><td><b>{$titulo}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>📝 Reporte</td><td>{$reporteLabel}</td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>📧 Enviado</td><td>{$enviadoLabel}</td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>👥 En sitio</td><td>{$otrosLabel}</td></tr>"
        . "</table>"
        . "<hr style='border:none;border-top:1px solid #e2e8f0;margin:16px 0'>"
        . "<p style='color:#94a3b8;font-size:12px;margin:0'>Ginno · Asistente de Grupo Innovate</p>"
        . "</div>"
      );
    } catch (Throwable $e) {}
    // ────────────────────────────────────────────────────────────────

    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$id]);
    jsonOut(reporteConFotos($pdo, $stmt->fetch()));
  }

  $plantilla = array_key_exists('plantilla', $d) ? $d['plantilla'] : $prev['plantilla'];
  $datosPrev = $prev['datos'] ? json_decode($prev['datos'], true) : [];
  $datosNuevos = array_key_exists('datos', $d) ? array_merge($datosPrev, $d['datos']) : $datosPrev;
  $pdfArchivo = array_key_exists('pdfArchivo', $d) ? $d['pdfArchivo'] : $prev['pdf_archivo'];
  $estado = $d['estado'] ?? $prev['estado'];
  // Edición administrativa: permite corregir el técnico que atendió y los
  // horarios de una visita ya registrada (la UI restringe esto a perfil admin).
  $tecnicoCheckinId = array_key_exists('tecnicoCheckinId', $d) ? $d['tecnicoCheckinId'] : $prev['tecnico_checkin_id'];
  $tecnicoCheckoutId = array_key_exists('tecnicoCheckoutId', $d) ? $d['tecnicoCheckoutId'] : $prev['tecnico_checkout_id'];
  $checkIn = array_key_exists('checkIn', $d) ? $d['checkIn'] : $prev['check_in'];
  $checkOut = array_key_exists('checkOut', $d) ? $d['checkOut'] : $prev['check_out'];

  $pdo->prepare("UPDATE reportes SET plantilla=?, datos=?, pdf_archivo=?, estado=?, tecnico_checkin_id=?, tecnico_checkout_id=?, check_in=?, check_out=? WHERE id=?")
    ->execute([$plantilla, json_encode($datosNuevos, JSON_UNESCAPED_UNICODE), $pdfArchivo, $estado, $tecnicoCheckinId, $tecnicoCheckoutId, $checkIn, $checkOut, $id]);

  $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
  $stmt->execute([$id]);
  jsonOut(reporteConFotos($pdo, $stmt->fetch()));
}

// --------------------------------------------------------------
// DELETE /reportes.php?id=UUID               -> elimina un reporte completo
// DELETE /reportes.php?participanteId=UUID   -> elimina un participante;
//   si el reporte queda sin participantes, también borra el reporte
// --------------------------------------------------------------
if ($method === 'DELETE') {
  // ── Eliminar participante individual ──────────────────────────
  if (!empty($_GET['participanteId'])) {
    $partId = $_GET['participanteId'];
    // Obtener reporte_id antes de borrar
    $stmt = $pdo->prepare("SELECT reporte_id FROM visita_participantes WHERE id = ?");
    $stmt->execute([$partId]);
    $part = $stmt->fetch();
    if (!$part) jsonOut(['error' => 'Participante no encontrado'], 404);
    $repId = $part['reporte_id'];

    $pdo->prepare("DELETE FROM visita_participantes WHERE id = ?")->execute([$partId]);

    // Si no quedan participantes, borrar el reporte completo
    $cnt = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ?");
    $cnt->execute([$repId]);
    if ((int)$cnt->fetchColumn() === 0) {
      $pdo->prepare("DELETE FROM reportes WHERE id = ?")->execute([$repId]);
      jsonOut(['ok' => true, 'reporteEliminado' => true]);
    }

    // Si quedan participantes, recalcular estado del reporte
    $sinOut = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ? AND check_out IS NULL");
    $sinOut->execute([$repId]);
    $nuevoEstado = (int)$sinOut->fetchColumn() > 0 ? 'en_visita' : 'borrador';
    $pdo->prepare("UPDATE reportes SET estado = ? WHERE id = ?")->execute([$nuevoEstado, $repId]);

    jsonOut(['ok' => true, 'reporteEliminado' => false]);
  }

  // ── Eliminar reporte completo ─────────────────────────────────
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id o participanteId requerido'], 400);
  $pdo->prepare("DELETE FROM reportes WHERE id = ?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);

function _nombreTecnico($pdo, $tecnicoId) {
  if (!$tecnicoId) return 'Un técnico';
  $stmt = $pdo->prepare("SELECT nombre FROM usuarios WHERE id = ?");
  $stmt->execute([$tecnicoId]);
  $row = $stmt->fetch();
  return $row['nombre'] ?? $tecnicoId;
}

// Fórmula de Haversine — distancia en metros entre dos coordenadas GPS
function haversineMetros($lat1, $lng1, $lat2, $lng2) {
  $R   = 6371000; // radio Tierra en metros
  $phi1 = deg2rad($lat1);
  $phi2 = deg2rad($lat2);
  $dphi = deg2rad($lat2 - $lat1);
  $dlam = deg2rad($lng2 - $lng1);
  $a = sin($dphi / 2) ** 2 + cos($phi1) * cos($phi2) * sin($dlam / 2) ** 2;
  return 2 * $R * asin(sqrt($a));
}
