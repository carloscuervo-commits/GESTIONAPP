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
