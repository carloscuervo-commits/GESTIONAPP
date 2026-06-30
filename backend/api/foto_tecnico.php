<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

set_exception_handler(function($e) { jsonOut(['error' => $e->getMessage()], 500); });

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

$uploadDir = __DIR__ . '/../uploads/fotos/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

// GET ?usuario_id=X  → sirve la foto
if ($method === 'GET') {
  $uid = $_GET['usuario_id'] ?? null;
  if (!$uid) jsonOut(['error' => 'usuario_id requerido'], 400);

  $stmt = $pdo->prepare("SELECT foto FROM usuarios WHERE id = ?");
  $stmt->execute([$uid]);
  $row = $stmt->fetch();
  if (!$row || !$row['foto']) jsonOut(['error' => 'Sin foto'], 404);

  $path = $uploadDir . basename($row['foto']);
  if (!file_exists($path)) jsonOut(['error' => 'Archivo no encontrado'], 404);

  $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
  $mime = match($ext) {
    'jpg','jpeg' => 'image/jpeg',
    'png'        => 'image/png',
    'webp'       => 'image/webp',
    default      => 'application/octet-stream',
  };
  header('Content-Type: ' . $mime);
  header('Cache-Control: public, max-age=86400');
  readfile($path);
  exit;
}

// POST multipart → sube foto del técnico
if ($method === 'POST') {
  $uid = $_POST['usuario_id'] ?? null;
  if (!$uid) jsonOut(['error' => 'usuario_id requerido'], 400);
  if (empty($_FILES['foto'])) jsonOut(['error' => 'Archivo requerido'], 400);

  $file = $_FILES['foto'];
  if ($file['error'] !== UPLOAD_ERR_OK) jsonOut(['error' => 'Error al subir archivo'], 400);

  // Validar MIME real
  $finfo = new finfo(FILEINFO_MIME_TYPE);
  $mime  = $finfo->file($file['tmp_name']);
  $allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!in_array($mime, $allowed)) jsonOut(['error' => 'Solo se permiten imágenes JPG, PNG o WEBP'], 400);

  $ext      = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'][$mime];
  $filename = $uid . '.' . $ext;
  $dest     = $uploadDir . $filename;

  // Eliminar foto anterior si tiene distinta extensión
  foreach (['jpg','png','webp'] as $e) {
    $old = $uploadDir . $uid . '.' . $e;
    if ($e !== $ext && file_exists($old)) unlink($old);
  }

  if (!move_uploaded_file($file['tmp_name'], $dest)) {
    jsonOut(['error' => 'No se pudo guardar el archivo'], 500);
  }

  // Actualizar columna foto en usuarios
  $pdo->prepare("UPDATE usuarios SET foto = ? WHERE id = ?")
      ->execute([$filename, $uid]);

  jsonOut(['ok' => true, 'foto' => $filename]);
}

// DELETE ?usuario_id=X → elimina foto
if ($method === 'DELETE') {
  $uid = $_GET['usuario_id'] ?? null;
  if (!$uid) jsonOut(['error' => 'usuario_id requerido'], 400);

  $stmt = $pdo->prepare("SELECT foto FROM usuarios WHERE id = ?");
  $stmt->execute([$uid]);
  $row = $stmt->fetch();
  if ($row && $row['foto']) {
    $path = $uploadDir . basename($row['foto']);
    if (file_exists($path)) unlink($path);
  }
  $pdo->prepare("UPDATE usuarios SET foto = NULL WHERE id = ?")->execute([$uid]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
