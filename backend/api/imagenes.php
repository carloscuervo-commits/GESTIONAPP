<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

$dir = __DIR__ . '/../uploads/imagenes';
if (!is_dir($dir)) {
  mkdir($dir, 0700, true);
}

// Tipos de imagen permitidos
$MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
$EXT_MIME = [
  'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
  'png' => 'image/png',  'gif'  => 'image/gif',
  'webp'=> 'image/webp', 'heic' => 'image/heic',
  'heif'=> 'image/heif',
];

// --------------------------------------------------------------
// GET /imagenes.php?tarea_id=X   → lista de imágenes de la tarea
// GET /imagenes.php?id=X&src=1   → sirve la imagen (inline)
// --------------------------------------------------------------
if ($method === 'GET') {

  // Servir imagen directamente
  if (!empty($_GET['id']) && !empty($_GET['src'])) {
    $id = preg_replace('/[^a-f0-9]/i', '', $_GET['id']);
    $stmt = $pdo->prepare("SELECT ext, nombre_original FROM tarea_imagenes WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) { http_response_code(404); exit; }

    $archivo = $dir . '/' . $id . '.' . $row['ext'];
    if (!file_exists($archivo)) { http_response_code(404); exit; }

    $mime = $EXT_MIME[$row['ext']] ?? 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($archivo));
    header('Cache-Control: private, max-age=86400');
    readfile($archivo);
    exit;
  }

  // Lista de imágenes de una tarea
  $tareaId = $_GET['tarea_id'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tarea_id requerido'], 400);

  $stmt = $pdo->prepare(
    "SELECT id, nombre_original, ext, orden, created_at
     FROM tarea_imagenes
     WHERE tarea_id = ?
     ORDER BY orden ASC, created_at ASC"
  );
  $stmt->execute([$tareaId]);
  jsonOut($stmt->fetchAll());
}

// --------------------------------------------------------------
// POST /imagenes.php
// multipart/form-data: campos "tarea_id" y "file" (imagen)
// Sube la imagen a backend/uploads/imagenes/{id}.{ext}
// --------------------------------------------------------------
if ($method === 'POST') {
  $tareaId = $_POST['tarea_id'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tarea_id requerido'], 400);

  // Verificar que la tarea existe
  $stmt = $pdo->prepare("SELECT id FROM tareas WHERE id = ?");
  $stmt->execute([$tareaId]);
  if (!$stmt->fetch()) jsonOut(['error' => 'Tarea no encontrada'], 404);

  if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    jsonOut(['error' => 'No se recibió el archivo'], 400);
  }

  // Validar tipo MIME real (no confiar solo en la extensión)
  $tmpPath = $_FILES['file']['tmp_name'];
  $mime    = mime_content_type($tmpPath);
  if (!in_array($mime, $MIME_PERMITIDOS)) {
    jsonOut(['error' => 'Tipo de archivo no permitido: ' . $mime], 400);
  }

  $nombreOriginal = $_FILES['file']['name'];
  $ext = strtolower(pathinfo($nombreOriginal, PATHINFO_EXTENSION));
  $ext = preg_replace('/[^a-z0-9]/', '', $ext);
  if (!array_key_exists($ext, $EXT_MIME)) {
    // Inferir extensión desde MIME
    $mimeToExt = array_flip(array_unique($EXT_MIME));
    $ext = $mimeToExt[$mime] ?? 'jpg';
  }

  // Calcular orden (último + 1)
  $stmt = $pdo->prepare("SELECT COALESCE(MAX(orden), -1) + 1 AS sig FROM tarea_imagenes WHERE tarea_id = ?");
  $stmt->execute([$tareaId]);
  $orden = (int)($stmt->fetch()['sig'] ?? 0);

  $id     = bin2hex(random_bytes(16));
  $destino = $dir . '/' . $id . '.' . $ext;

  if (!move_uploaded_file($tmpPath, $destino)) {
    jsonOut(['error' => 'No se pudo guardar la imagen'], 500);
  }

  $pdo->prepare(
    "INSERT INTO tarea_imagenes (id, tarea_id, nombre_original, ext, orden) VALUES (?,?,?,?,?)"
  )->execute([$id, $tareaId, $nombreOriginal, $ext, $orden]);

  jsonOut([
    'ok'    => true,
    'imagen' => [
      'id'             => $id,
      'nombre_original'=> $nombreOriginal,
      'ext'            => $ext,
      'orden'          => $orden,
      'created_at'     => date('Y-m-d H:i:s'),
    ],
  ]);
}

// --------------------------------------------------------------
// DELETE /imagenes.php?id=X  → elimina la imagen
// --------------------------------------------------------------
if ($method === 'DELETE') {
  $id = preg_replace('/[^a-f0-9]/i', '', $_GET['id'] ?? '');
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT ext FROM tarea_imagenes WHERE id = ?");
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  if (!$row) jsonOut(['error' => 'Imagen no encontrada'], 404);

  $archivo = $dir . '/' . $id . '.' . $row['ext'];
  if (file_exists($archivo)) unlink($archivo);

  $pdo->prepare("DELETE FROM tarea_imagenes WHERE id = ?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
