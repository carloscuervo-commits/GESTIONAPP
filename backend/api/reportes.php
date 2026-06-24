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
  return $stmt->fetchAll();
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
  if (!empty($_GET['tardias'])) {
    $where  = ["vp.check_in IS NOT NULL",
               "t.fecha_programacion IS NOT NULL",
               "t.hora_programacion IS NOT NULL",
               "DATE(vp.check_in) = t.fecha_programacion",
               "TIME(vp.check_in) > t.hora_programacion"];
    $params = [];
    if (!empty($_GET['desde'])) { $where[] = "t.fecha_programacion >= ?"; $params[] = $_GET['desde']; }
    if (!empty($_GET['hasta'])) { $where[] = "t.fecha_programacion <= ?"; $params[] = $_GET['hasta']; }
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

  $stmt = $pdo->prepare("SELECT titulo, cliente, area FROM tareas WHERE id = ?");
  $stmt->execute([$tareaId]);
  $tarea = $stmt->fetch();
  if (!$tarea) jsonOut(['error' => 'Tarea no encontrada'], 404);

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

  if ($enCurso) {
    // Reporte en curso → revisar si este técnico ya está registrado sin checkout
    $stmt = $pdo->prepare("SELECT id FROM visita_participantes WHERE reporte_id = ? AND tecnico_id = ? AND check_out IS NULL");
    $stmt->execute([$enCurso['id'], $tecnicoId]);
    if ($stmt->fetch()) {
      // Ya registrado: idempotente
      jsonOut(reporteConFotos($pdo, $enCurso));
    }
    // Agregar como participante adicional
    $partId = bin2hex(random_bytes(16));
    $pdo->prepare("INSERT INTO visita_participantes (id, reporte_id, tecnico_id, check_in) VALUES (?, ?, ?, ?)")
      ->execute([$partId, $enCurso['id'], $tecnicoId, $checkInVal]);
    // Notificar llegada adicional
    try {
      $tecnicoNombre = _nombreTecnico($pdo, $tecnicoId);
      $horaDisplay = $checkInParam ? date('d/m/Y H:i', strtotime($checkInParam)) . ' (manual)' : date('d/m/Y H:i');
      enviarCorreoConAdjunto([CORREO_ADMIN_FIJO],
        "🟢 Técnico adicional en sitio — " . ($tarea['cliente'] ?: 'Sin cliente'),
        "<p><b>{$tecnicoNombre}</b> llegó a sitio (visita en curso).</p>"
        . "<p><b>Cliente:</b> " . htmlspecialchars($tarea['cliente'] ?: '-') . "<br>"
        . "<b>Tarea:</b> " . htmlspecialchars($tarea['titulo']) . "<br>"
        . "<b>Hora:</b> {$horaDisplay}</p>"
      );
    } catch (Throwable $e) {}
    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$enCurso['id']]);
    jsonOut(reporteConFotos($pdo, $stmt->fetch()), 201);
  }

  // No hay reporte en curso → crear reporte + primer participante
  $reporteId = bin2hex(random_bytes(16));
  $pdo->prepare("INSERT INTO reportes (id, tarea_id, estado, tecnico_checkin_id, check_in) VALUES (?, ?, 'en_visita', ?, ?)")
    ->execute([$reporteId, $tareaId, $tecnicoId, $checkInVal]);
  $partId = bin2hex(random_bytes(16));
  $pdo->prepare("INSERT INTO visita_participantes (id, reporte_id, tecnico_id, check_in) VALUES (?, ?, ?, ?)")
    ->execute([$partId, $reporteId, $tecnicoId, $checkInVal]);

  // Notificación a administrativo (no bloqueante si falla)
  try {
    $tecnicoNombre = _nombreTecnico($pdo, $tecnicoId);
    $horaDisplay = $checkInParam ? date('d/m/Y H:i', strtotime($checkInParam)) . ' (manual)' : date('d/m/Y H:i');
    enviarCorreoConAdjunto([CORREO_ADMIN_FIJO],
      "🟢 Visita iniciada — " . ($tarea['cliente'] ?: 'Sin cliente'),
      "<p><b>{$tecnicoNombre}</b> inició una visita técnica.</p>"
      . "<p><b>Cliente:</b> " . htmlspecialchars($tarea['cliente'] ?: '-') . "<br>"
      . "<b>Tarea:</b> " . htmlspecialchars($tarea['titulo']) . "<br>"
      . "<b>Hora de inicio:</b> {$horaDisplay}</p>"
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

    $pdo->prepare("UPDATE visita_participantes SET tecnico_id=?, check_in=?, check_out=? WHERE id=?")
      ->execute([$tecnicoId, $newIn, $newOut, $partId]);

    // Si ya todos tienen checkout → mantener borrador; si hay alguno sin → en_visita
    $stmtCnt = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ? AND check_out IS NULL");
    $stmtCnt->execute([$id]);
    $sinOut = (int)$stmtCnt->fetchColumn();
    $nuevoEstado = $sinOut > 0 ? 'en_visita' : 'borrador';
    $pdo->prepare("UPDATE reportes SET estado=? WHERE id=?")->execute([$nuevoEstado, $id]);

    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$id]);
    jsonOut(reporteConFotos($pdo, $stmt->fetch()));
  }

  if (($d['accion'] ?? '') === 'checkout') {
    $tecnicoOut = $d['tecnicoCheckoutId'] ?? null;
    $partId     = $d['participanteId']    ?? null;

    if ($partId) {
      // ── Multi-tech: actualizar participante específico ──────────
      $pdo->prepare("UPDATE visita_participantes SET check_out = NOW() WHERE id = ?")
        ->execute([$partId]);
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
      $pdo->prepare("UPDATE visita_participantes SET check_out=NOW() WHERE reporte_id=? AND tecnico_id=? AND check_out IS NULL")
        ->execute([$id, $tecnicoOut]);
    }

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
        "<p><b>{$tecnicoNombre}</b> finalizó su visita técnica.</p>"
        . "<table style='border-collapse:collapse;font-size:14px'>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#666'>📅 Fecha</td><td><b>{$fechaVisita}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#666'>🕐 Check-in</td><td><b>{$horaIn}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#666'>🕐 Check-out</td><td><b>{$horaOut}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#666'>👤 Cliente</td><td><b>{$cliente}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#666'>📋 Tarea</td><td><b>{$titulo}</b></td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#666'>📝 Reporte</td><td>{$reporteLabel}</td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#666'>📧 Enviado</td><td>{$enviadoLabel}</td></tr>"
        . "<tr><td style='padding:4px 12px 4px 0;color:#666'>👥 En sitio</td><td>{$otrosLabel}</td></tr>"
        . "</table>"
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
// DELETE /reportes.php?id=UUID  -> elimina un reporte (ej. check-in por error)
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);
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
