<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

$dir = __DIR__ . '/../uploads/cotizaciones';
if (!is_dir($dir)) {
  mkdir($dir, 0700, true);
}

// --------------------------------------------------------------
// POST /cotizacion_docx.php
// multipart/form-data: campos "id" (id de la tarea) y "file" (.docx)
// Guarda el archivo en backend/uploads/cotizaciones/{id}.docx y
// actualiza tareas.cotizacion_docx con el nombre original del archivo.
// --------------------------------------------------------------
if ($method === 'POST') {
  $id = $_POST['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    jsonOut(['error' => 'No se recibió el archivo (campo "file")'], 400);
  }

  $nombreOriginal = $_FILES['file']['name'];
  if (!preg_match('/\.docx$/i', $nombreOriginal)) {
    jsonOut(['error' => 'El archivo debe ser .docx'], 400);
  }

  $stmt = $pdo->prepare("SELECT id FROM tareas WHERE id = ?");
  $stmt->execute([$id]);
  if (!$stmt->fetch()) jsonOut(['error' => 'Tarea no encontrada'], 404);

  $destino = $dir . '/' . $id . '.docx';
  if (!move_uploaded_file($_FILES['file']['tmp_name'], $destino)) {
    jsonOut(['error' => 'No se pudo guardar el archivo'], 500);
  }

  $pdo->prepare("UPDATE tareas SET cotizacion_docx = ? WHERE id = ?")->execute([$nombreOriginal, $id]);

  jsonOut(['ok' => true, 'nombre' => $nombreOriginal]);
}

// --------------------------------------------------------------
// GET /cotizacion_docx.php?id=UUID  -> descarga el .docx adjunto
// --------------------------------------------------------------
if ($method === 'GET') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT cotizacion_docx FROM tareas WHERE id = ?");
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  if (!$row || !$row['cotizacion_docx']) jsonOut(['error' => 'No hay cotización adjunta'], 404);

  $archivo = $dir . '/' . $id . '.docx';
  if (!file_exists($archivo)) jsonOut(['error' => 'Archivo no encontrado en el servidor'], 404);

  header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  header('Content-Disposition: attachment; filename="' . basename($row['cotizacion_docx']) . '"');
  header('Content-Length: ' . filesize($archivo));
  readfile($archivo);
  exit;
}

// --------------------------------------------------------------
// DELETE /cotizacion_docx.php?id=UUID  -> elimina el adjunto
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $archivo = $dir . '/' . $id . '.docx';
  if (file_exists($archivo)) unlink($archivo);

  $pdo->prepare("UPDATE tareas SET cotizacion_docx = NULL WHERE id = ?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
