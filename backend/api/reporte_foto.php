<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

$dir = __DIR__ . '/../uploads/reporte_fotos';
if (!is_dir($dir)) mkdir($dir, 0700, true);

// --------------------------------------------------------------
// POST /reporte_foto.php
// multipart/form-data: reporteId, seccionId, file (imagen)
// --------------------------------------------------------------
if ($method === 'POST') {
  $reporteId = $_POST['reporteId'] ?? null;
  $seccionId = $_POST['seccionId'] ?? null;
  if (!$reporteId || !$seccionId) jsonOut(['error' => 'reporteId y seccionId son requeridos'], 400);

  if (!isset($_FILES['file'])) {
    jsonOut(['error' => 'No se recibió el archivo. Verifica que la foto no sea demasiado grande (máx. 20 MB).'], 400);
  }
  if ($_FILES['file']['error'] === UPLOAD_ERR_INI_SIZE || $_FILES['file']['error'] === UPLOAD_ERR_FORM_SIZE) {
    jsonOut(['error' => 'La foto es demasiado grande. Usa una imagen de menor resolución.'], 400);
  }
  if ($_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    jsonOut(['error' => 'Error al recibir el archivo (código ' . $_FILES['file']['error'] . ').'], 400);
  }

  $stmt = $pdo->prepare("SELECT id FROM reportes WHERE id = ?");
  $stmt->execute([$reporteId]);
  if (!$stmt->fetch()) jsonOut(['error' => 'Reporte no encontrado'], 404);

  $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
  $ext = preg_replace('/[^a-z0-9]/', '', $ext) ?: 'jpg';
  $nombreArchivo = bin2hex(random_bytes(8)) . '.' . $ext;
  $destino = $dir . '/' . $nombreArchivo;

  if (!move_uploaded_file($_FILES['file']['tmp_name'], $destino)) {
    jsonOut(['error' => 'No se pudo guardar la foto'], 500);
  }

  $stmt = $pdo->prepare("SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente FROM reporte_fotos WHERE reporte_id = ? AND seccion_id = ?");
  $stmt->execute([$reporteId, $seccionId]);
  $orden = $stmt->fetch()['siguiente'];

  $pdo->prepare("INSERT INTO reporte_fotos (reporte_id, seccion_id, archivo, orden) VALUES (?,?,?,?)")
    ->execute([$reporteId, $seccionId, $nombreArchivo, $orden]);

  jsonOut(['ok' => true, 'id' => $pdo->lastInsertId(), 'archivo' => $nombreArchivo, 'url' => "reporte_foto.php?archivo={$nombreArchivo}"], 201);
}

// --------------------------------------------------------------
// GET /reporte_foto.php?archivo=NOMBRE  -> sirve la imagen
// --------------------------------------------------------------
if ($method === 'GET') {
  $archivo = $_GET['archivo'] ?? null;
  if (!$archivo) jsonOut(['error' => 'archivo requerido'], 400);
  $archivo = basename($archivo); // evitar path traversal
  $ruta = $dir . '/' . $archivo;
  if (!file_exists($ruta)) jsonOut(['error' => 'No encontrado'], 404);

  $ext = strtolower(pathinfo($ruta, PATHINFO_EXTENSION));
  $mime = $ext === 'png' ? 'image/png' : ($ext === 'webp' ? 'image/webp' : 'image/jpeg');
  header('Content-Type: ' . $mime);
  header('Content-Length: ' . filesize($ruta));
  header('Cache-Control: public, max-age=31536000');
  readfile($ruta);
  exit;
}

// --------------------------------------------------------------
// DELETE /reporte_foto.php?id=N  -> elimina una foto puntual
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $fotoId = $_GET['id'] ?? null;
  if (!$fotoId) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT archivo FROM reporte_fotos WHERE id = ?");
  $stmt->execute([$fotoId]);
  $row = $stmt->fetch();
  if ($row) {
    $ruta = $dir . '/' . $row['archivo'];
    if (file_exists($ruta)) unlink($ruta);
    $pdo->prepare("DELETE FROM reporte_fotos WHERE id = ?")->execute([$fotoId]);
  }
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
