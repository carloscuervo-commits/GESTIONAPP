<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $stmt = $pdo->query("SELECT id, nombre, iniciales, color, rol, email, activo FROM usuarios WHERE activo = 1 ORDER BY nombre");
  jsonOut($stmt->fetchAll());
}

jsonOut(['error' => 'Método no soportado'], 405);
