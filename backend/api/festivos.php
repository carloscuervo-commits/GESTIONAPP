<?php
// ============================================================
// festivos.php — Consulta de festivos colombianos.
//
// Reference data (no es sensible), por eso solo pide sesión válida
// (requireSesion), no perfil admin — cualquier función de Ginno que
// necesite saber qué días son festivo puede usar este endpoint.
//
// GET /festivos.php              -> todos los festivos cargados
// GET /festivos.php?anio=2027    -> solo los de ese año
// ============================================================
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
requireSesion($pdo);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $anio = isset($_GET['anio']) && ctype_digit((string)$_GET['anio']) ? (int)$_GET['anio'] : null;

  if ($anio) {
    $stmt = $pdo->prepare("SELECT fecha, nombre FROM festivos WHERE YEAR(fecha) = ? ORDER BY fecha ASC");
    $stmt->execute([$anio]);
  } else {
    $stmt = $pdo->query("SELECT fecha, nombre FROM festivos ORDER BY fecha ASC");
  }

  $items = array_map(fn($r) => ['fecha' => $r['fecha'], 'nombre' => $r['nombre']], $stmt->fetchAll());
  jsonOut(['items' => $items]);
}

jsonOut(['error' => 'Método no soportado'], 405);
