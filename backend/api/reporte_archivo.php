<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

$dir = __DIR__ . '/../uploads/reportes';
if (!is_dir($dir)) {
  mkdir($dir, 0700, true);
}

// --------------------------------------------------------------
// POST /reporte_archivo.php
// multipart/form-data: campos "id" (id de la tarea) y "file" (cualquier tipo)
// Guarda el archivo en backend/uploads/reportes/{id}.{ext} y
// actualiza tareas.reporte_archivo con el nombre original del archivo.
// --------------------------------------------------------------
if ($method === 'POST') {
  $id = $_POST['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    jsonOut(['error' => 'No se recibió el archivo (campo "file")'], 400);
  }

  $stmt = $pdo->prepare("SELECT id, reporte_archivo FROM tareas WHERE id = ?");
  $stmt->execute([$id]);
  $prev = $stmt->fetch();
  if (!$prev) jsonOut(['error' => 'Tarea no encontrada'], 404);

  $nombreOriginal = $_FILES['file']['name'];
  $ext = strtolower(pathinfo($nombreOriginal, PATHINFO_EXTENSION));
  $ext = preg_replace('/[^a-z0-9]/', '', $ext);
  if ($ext === '') $ext = 'bin';

  // Si había un archivo previo con otra extensión, eliminarlo
  if (!empty($prev['reporte_archivo'])) {
    $prevExt = strtolower(pathinfo($prev['reporte_archivo'], PATHINFO_EXTENSION));
    $prevExt = preg_replace('/[^a-z0-9]/', '', $prevExt);
    if ($prevExt !== '') {
      $prevFile = $dir . '/' . $id . '.' . $prevExt;
      if (file_exists($prevFile) && $prevFile !== $dir . '/' . $id . '.' . $ext) unlink($prevFile);
    }
  }

  $destino = $dir . '/' . $id . '.' . $ext;
  if (!move_uploaded_file($_FILES['file']['tmp_name'], $destino)) {
    jsonOut(['error' => 'No se pudo guardar el archivo'], 500);
  }

  $pdo->prepare("UPDATE tareas SET reporte_archivo = ? WHERE id = ?")->execute([$nombreOriginal, $id]);

  jsonOut(['ok' => true, 'nombre' => $nombreOriginal]);
}

// --------------------------------------------------------------
// GET /reporte_archivo.php?id=UUID  -> descarga el archivo adjunto
// --------------------------------------------------------------
if ($method === 'GET') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT reporte_archivo FROM tareas WHERE id = ?");
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  if (!$row || !$row['reporte_archivo']) jsonOut(['error' => 'No hay reporte adjunto'], 404);

  $ext = strtolower(pathinfo($row['reporte_archivo'], PATHINFO_EXTENSION));
  $ext = preg_replace('/[^a-z0-9]/', '', $ext);
  if ($ext === '') $ext = 'bin';

  $archivo = $dir . '/' . $id . '.' . $ext;
  if (!file_exists($archivo)) jsonOut(['error' => 'Archivo no encontrado en el servidor'], 404);

  header('Content-Type: application/octet-stream');
  header('Content-Disposition: attachment; filename="' . basename($row['reporte_archivo']) . '"');
  header('Content-Length: ' . filesize($archivo));
  readfile($archivo);
  exit;
}

// --------------------------------------------------------------
// DELETE /reporte_archivo.php?id=UUID  -> elimina el adjunto
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT reporte_archivo FROM tareas WHERE id = ?");
  $stmt->execute([$id]);
  $row = $stmt->fetch();

  if ($row && $row['reporte_archivo']) {
    $ext = strtolower(pathinfo($row['reporte_archivo'], PATHINFO_EXTENSION));
    $ext = preg_replace('/[^a-z0-9]/', '', $ext);
    if ($ext === '') $ext = 'bin';
    $archivo = $dir . '/' . $id . '.' . $ext;
    if (file_exists($archivo)) unlink($archivo);
  }

  $pdo->prepare("UPDATE tareas SET reporte_archivo = NULL WHERE id = ?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
