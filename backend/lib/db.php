<?php
require_once __DIR__ . '/../config/config.php';

function getDB() {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
    try {
      $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
      ]);
    } catch (PDOException $e) {
      http_response_code(500);
      header('Content-Type: application/json');
      echo json_encode(['error' => 'Error de conexión a la base de datos']);
      exit;
    }
  }
  return $pdo;
}

// Helpers de respuesta JSON
function jsonInput() {
  $raw = file_get_contents('php://input');
  return json_decode($raw, true) ?? [];
}

function jsonOut($data, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

// CORS básico (ajustar dominio cuando se publique)
function applyCors() {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
  }
}

// Verifica que la petición traiga un token de sesión válido (usuarios.token_sesion).
// Busca primero en el header Authorization: Bearer <token> (llamadas fetch), y si
// no viene, en ?token= (fallback para <a href>, <img src>, window.open, que no
// pueden mandar headers personalizados). Si $rolRequerido se indica, además exige
// que el usuario tenga ese perfil. Corta la ejecución con 401/403 si no es válido.
// Devuelve los datos básicos del usuario autenticado si todo OK.
function requireSesion($pdo, $rolRequerido = null) {
  $auth  = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  $token = '';
  if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) $token = trim($m[1]);
  if (!$token && !empty($_GET['token'])) $token = trim($_GET['token']);
  if (!$token) jsonOut(['error' => 'No autorizado — se requiere sesión'], 401);

  $stmt = $pdo->prepare("SELECT id, nombre, perfil FROM usuarios WHERE token_sesion = ? AND activo = 1");
  $stmt->execute([$token]);
  $u = $stmt->fetch();
  if (!$u) jsonOut(['error' => 'Sesión inválida o expirada'], 401);
  if ($rolRequerido && $u['perfil'] !== $rolRequerido) jsonOut(['error' => 'Se requiere perfil ' . $rolRequerido], 403);
  return $u;
}
