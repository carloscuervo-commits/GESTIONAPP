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

function reporteConFotos($pdo, $row) {
  $row['fotos'] = fotosDeReporte($pdo, $row['id']);
  $row['datos'] = $row['datos'] ? json_decode($row['datos'], true) : [];
  return $row;
}

// --------------------------------------------------------------
// GET /reportes.php?id=UUID            -> un reporte (con fotos)
// GET /reportes.php?tareaId=UUID        -> reportes de una tarea (desc)
// --------------------------------------------------------------
if ($method === 'GET') {
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
// POST /reportes.php  -> Iniciar visita (check-in)
// body: { tareaId, tecnicoCheckinId }
// Crea el reporte en estado 'en_visita' y notifica a administrativo.
// --------------------------------------------------------------
if ($method === 'POST') {
  $d = jsonInput();
  $tareaId = $d['tareaId'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tareaId requerido'], 400);

  $stmt = $pdo->prepare("SELECT titulo, cliente, area FROM tareas WHERE id = ?");
  $stmt->execute([$tareaId]);
  $tarea = $stmt->fetch();
  if (!$tarea) jsonOut(['error' => 'Tarea no encontrada'], 404);

  // No permitir doble check-in: si ya hay una visita en curso, devolverla.
  $stmt = $pdo->prepare("SELECT * FROM reportes WHERE tarea_id = ? AND estado = 'en_visita' ORDER BY creado_en DESC LIMIT 1");
  $stmt->execute([$tareaId]);
  $enCurso = $stmt->fetch();
  if ($enCurso) jsonOut(reporteConFotos($pdo, $enCurso));

  $id = bin2hex(random_bytes(16));
  $tecnicoId = $d['tecnicoCheckinId'] ?? null;
  $pdo->prepare("INSERT INTO reportes (id, tarea_id, estado, tecnico_checkin_id, check_in)
    VALUES (?, ?, 'en_visita', ?, NOW())")->execute([$id, $tareaId, $tecnicoId]);

  // Notificación a administrativo (no bloqueante si falla)
  try {
    $tecnicoNombre = _nombreTecnico($pdo, $tecnicoId);
    $asunto = "🟢 Visita iniciada — " . ($tarea['cliente'] ?: 'Sin cliente');
    $cuerpo = "<p><b>{$tecnicoNombre}</b> inició una visita técnica.</p>"
      . "<p><b>Cliente:</b> " . htmlspecialchars($tarea['cliente'] ?: '-') . "<br>"
      . "<b>Tarea:</b> " . htmlspecialchars($tarea['titulo']) . "<br>"
      . "<b>Hora de inicio:</b> " . date('d/m/Y H:i') . "</p>";
    enviarCorreoConAdjunto([CORREO_ADMIN_FIJO], $asunto, $cuerpo);
  } catch (Throwable $e) { /* no bloquear el check-in si el correo falla */ }

  $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
  $stmt->execute([$id]);
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
    $pdo->prepare("UPDATE reportes SET check_out = NOW(), tecnico_checkout_id = ?, estado = 'borrador' WHERE id = ?")
      ->execute([$tecnicoOut, $id]);
    $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
    $stmt->execute([$id]);
    jsonOut(reporteConFotos($pdo, $stmt->fetch()));
  }

  $plantilla = array_key_exists('plantilla', $d) ? $d['plantilla'] : $prev['plantilla'];
  $datosPrev = $prev['datos'] ? json_decode($prev['datos'], true) : [];
  $datosNuevos = array_key_exists('datos', $d) ? array_merge($datosPrev, $d['datos']) : $datosPrev;
  $pdfArchivo = array_key_exists('pdfArchivo', $d) ? $d['pdfArchivo'] : $prev['pdf_archivo'];
  $estado = $d['estado'] ?? $prev['estado'];

  $pdo->prepare("UPDATE reportes SET plantilla=?, datos=?, pdf_archivo=?, estado=? WHERE id=?")
    ->execute([$plantilla, json_encode($datosNuevos, JSON_UNESCAPED_UNICODE), $pdfArchivo, $estado, $id]);

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
