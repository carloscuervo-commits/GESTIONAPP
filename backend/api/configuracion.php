<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// GET — devuelve todos los pares clave→valor
if ($method === 'GET') {
  $stmt = $pdo->query("SELECT clave, valor FROM configuracion ORDER BY clave");
  $rows = [];
  while ($row = $stmt->fetch()) {
    $rows[$row['clave']] = $row['valor'];
  }
  jsonOut($rows);
}

// POST — upsert de uno o varios pares { clave: valor, ... }
if ($method === 'POST') {
  $d = jsonInput();
  if (!is_array($d) || empty($d)) {
    jsonOut(['error' => 'Body debe ser un objeto JSON con pares clave→valor'], 400);
  }

  $upsert = $pdo->prepare("
    INSERT INTO configuracion (clave, valor)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE valor = VALUES(valor), updated_at = NOW()
  ");

  foreach ($d as $clave => $valor) {
    $upsert->execute([(string)$clave, (string)$valor]);
  }

  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
