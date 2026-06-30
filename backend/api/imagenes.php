<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

// Capturar cualquier error fatal y devolverlo como JSON
set_exception_handler(function($e) {
  jsonOut(['error' => $e->getMessage()], 500);
});

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

$dir = __DIR__ . '/../uploads/imagenes';
if (!is_dir($dir)) {
  if (!mkdir($dir, 0755, true)) {
    jsonOut(['error' => 'No se pudo crear el directorio de imágenes'], 500);
  }
}

// Tipos de imagen permitidos
$EXT_MIME = [
  'jpg'  => 'image/jpeg',
  'jpeg' => 'image/jpeg',
  'png'  => 'image/png',
  'gif'  => 'image/gif',
  'webp' => 'image/webp',
  'heic' => 'image/heic',
  'heif' => 'image/heif',
];
$MIME_PERMITIDOS = array_values(array_unique($EXT_MIME));

// Detectar MIME de forma robusta: finfo → mime_content_type → extensión
function detectarMime($tmpPath, $ext, $EXT_MIME) {
  // 1. finfo (más confiable)
  if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo) {
      $mime = finfo_file($finfo, $tmpPath);
      finfo_close($finfo);
      if ($mime && $mime !== 'application/octet-stream') return $mime;
    }
  }
  // 2. mime_content_type como fallback
  if (function_exists('mime_content_type')) {
    $mime = mime_content_type($tmpPath);
    if ($mime && $mime !== 'application/octet-stream') return $mime;
  }
  // 3. Inferir desde extensión del archivo
  return $EXT_MIME[$ext] ?? 'application/octet-stream';
}

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
// --------------------------------------------------------------
if ($method === 'POST') {
  $tareaId = $_POST['tarea_id'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tarea_id requerido'], 400);

  // Verificar que la tarea existe
  $stmt = $pdo->prepare("SELECT id FROM tareas WHERE id = ?");
  $stmt->execute([$tareaId]);
  if (!$stmt->fetch()) jsonOut(['error' => 'Tarea no encontrada'], 404);

  if (!isset($_FILES['file'])) {
    jsonOut(['error' => 'No se recibió ningún archivo'], 400);
  }
  $uploadError = $_FILES['file']['error'];
  if ($uploadError !== UPLOAD_ERR_OK) {
    $msgs = [
      UPLOAD_ERR_INI_SIZE   => 'El archivo supera upload_max_filesize en php.ini',
      UPLOAD_ERR_FORM_SIZE  => 'El archivo supera MAX_FILE_SIZE del formulario',
      UPLOAD_ERR_PARTIAL    => 'El archivo se subió parcialmente',
      UPLOAD_ERR_NO_FILE    => 'No se seleccionó ningún archivo',
      UPLOAD_ERR_NO_TMP_DIR => 'Falta la carpeta temporal de PHP',
      UPLOAD_ERR_CANT_WRITE => 'No se pudo escribir en disco',
      UPLOAD_ERR_EXTENSION  => 'Una extensión de PHP detuvo la subida',
    ];
    jsonOut(['error' => $msgs[$uploadError] ?? "Error de subida PHP: $uploadError"], 400);
  }

  $tmpPath        = $_FILES['file']['tmp_name'];
  $nombreOriginal = $_FILES['file']['name'];

  // Extensión desde nombre
  $ext = strtolower(pathinfo($nombreOriginal, PATHINFO_EXTENSION));
  $ext = preg_replace('/[^a-z0-9]/', '', $ext);
  if ($ext === '') $ext = 'jpg';

  // Detectar MIME
  $mime = detectarMime($tmpPath, $ext, $EXT_MIME);

  // Si el MIME no está permitido, rechazar
  if (!in_array($mime, $MIME_PERMITIDOS)) {
    // Último recurso: si la extensión es conocida, confiar en ella
    if (!array_key_exists($ext, $EXT_MIME)) {
      jsonOut(['error' => "Tipo no permitido: $mime (ext: $ext)"], 400);
    }
    // Extensión conocida pero MIME raro → aceptar con MIME de la extensión
    $mime = $EXT_MIME[$ext];
  }

  // Si la extensión no coincide con el MIME, inferir extensión correcta
  if (!array_key_exists($ext, $EXT_MIME)) {
    $mimeToExt = array_flip(array_unique($EXT_MIME));
    $ext = $mimeToExt[$mime] ?? 'jpg';
  }

  // Calcular orden
  $stmt = $pdo->prepare(
    "SELECT COALESCE(MAX(orden), -1) + 1 AS sig FROM tarea_imagenes WHERE tarea_id = ?"
  );
  $stmt->execute([$tareaId]);
  $orden = (int)($stmt->fetch()['sig'] ?? 0);

  $id      = bin2hex(random_bytes(16));
  $destino = $dir . '/' . $id . '.' . $ext;

  if (!move_uploaded_file($tmpPath, $destino)) {
    jsonOut(['error' => 'No se pudo guardar la imagen en el servidor'], 500);
  }

  $pdo->prepare(
    "INSERT INTO tarea_imagenes (id, tarea_id, nombre_original, ext, orden) VALUES (?,?,?,?,?)"
  )->execute([$id, $tareaId, $nombreOriginal, $ext, $orden]);

  jsonOut([
    'ok'     => true,
    'imagen' => [
      'id'              => $id,
      'nombre_original' => $nombreOriginal,
      'ext'             => $ext,
      'orden'           => $orden,
      'created_at'      => date('Y-m-d H:i:s'),
    ],
  ]);
}

// --------------------------------------------------------------
// DELETE /imagenes.php?id=X
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
