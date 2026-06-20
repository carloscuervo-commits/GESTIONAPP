<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
$method = $_SERVER['REQUEST_METHOD'];

$dir = __DIR__ . '/../uploads/reporte_pdf';
if (!is_dir($dir)) mkdir($dir, 0700, true);

// --------------------------------------------------------------
// POST /reporte_pdf.php
// multipart/form-data: reporteId, file (application/pdf)
// Guarda el PDF generado en el navegador y lo asocia al reporte.
// --------------------------------------------------------------
if ($method === 'POST') {
  $reporteId = $_POST['reporteId'] ?? null;
  if (!$reporteId) jsonOut(['error' => 'reporteId requerido'], 400);

  if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    jsonOut(['error' => 'No se recibió el archivo (campo "file")'], 400);
  }

  $stmt = $pdo->prepare("SELECT id FROM reportes WHERE id = ?");
  $stmt->execute([$reporteId]);
  if (!$stmt->fetch()) jsonOut(['error' => 'Reporte no encontrado'], 404);

  $nombreArchivo = 'reporte-' . $reporteId . '.pdf';
  $destino = $dir . '/' . $nombreArchivo;
  if (!move_uploaded_file($_FILES['file']['tmp_name'], $destino)) {
    jsonOut(['error' => 'No se pudo guardar el PDF'], 500);
  }

  $pdo->prepare("UPDATE reportes SET pdf_archivo = ? WHERE id = ?")->execute([$nombreArchivo, $reporteId]);
  jsonOut(['ok' => true, 'archivo' => $nombreArchivo]);
}

// --------------------------------------------------------------
// GET /reporte_pdf.php?id=UUID  -> descarga el PDF del reporte
// --------------------------------------------------------------
if ($method === 'GET') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);

  $stmt = $pdo->prepare("SELECT pdf_archivo FROM reportes WHERE id = ?");
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  if (!$row || !$row['pdf_archivo']) jsonOut(['error' => 'No hay PDF generado'], 404);

  $ruta = $dir . '/' . $row['pdf_archivo'];
  if (!file_exists($ruta)) jsonOut(['error' => 'Archivo no encontrado en el servidor'], 404);

  header('Content-Type: application/pdf');
  header('Content-Disposition: inline; filename="' . $row['pdf_archivo'] . '"');
  header('Content-Length: ' . filesize($ruta));
  readfile($ruta);
  exit;
}

jsonOut(['error' => 'Método no soportado'], 405);
