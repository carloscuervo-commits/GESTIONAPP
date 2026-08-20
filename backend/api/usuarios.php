<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// --------------------------------------------------------------
// Helper: verifica que el token enviado en Authorization: Bearer
// pertenezca a un usuario activo con perfil 'admin'.
// Llama a jsonOut() y muere si no autorizado.
// --------------------------------------------------------------
function requireAdmin($pdo) {
  $auth  = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  $token = '';
  if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) $token = trim($m[1]);
  if (!$token) jsonOut(['error' => 'No autorizado — se requiere sesión'], 401);

  $stmt = $pdo->prepare("SELECT perfil FROM usuarios WHERE token_sesion = ? AND activo = 1");
  $stmt->execute([$token]);
  $u = $stmt->fetch();
  if (!$u || $u['perfil'] !== 'admin') jsonOut(['error' => 'Se requiere perfil administrador'], 403);
}

// --------------------------------------------------------------
// GET /usuarios.php
// Lista todos los usuarios (activos e inactivos).
// Retorna: id, nombre, iniciales, color, rol, email, perfil,
//          activo, tiene_pin (bool: si pin_hash está configurado).
// NO retorna pin_hash ni token_sesion.
// --------------------------------------------------------------
if ($method === 'GET') {
  $stmt = $pdo->query(
    "SELECT id, nombre, iniciales, color, rol, email, cedula, foto, perfil, activo,
            telegram_chat_id, celular,
            (pin_hash IS NOT NULL) AS tiene_pin
     FROM usuarios
     ORDER BY activo DESC, nombre ASC"
  );
  jsonOut($stmt->fetchAll());
}

// --------------------------------------------------------------
// POST /usuarios.php
// Crea un nuevo usuario. Requiere perfil admin.
// Body JSON: { id, nombre, iniciales, color?, rol?, email?,
//              perfil?, pin? (4 dígitos, opcional), telegram_chat_id? }
// --------------------------------------------------------------
if ($method === 'POST') {
  requireAdmin($pdo);
  $d = jsonInput();

  $id       = strtoupper(trim($d['id'] ?? ''));
  $nombre   = trim($d['nombre'] ?? '');
  $iniciales = strtoupper(trim($d['iniciales'] ?? ''));

  if (!$id)       jsonOut(['error' => 'El campo id es requerido'], 400);
  if (!$nombre)   jsonOut(['error' => 'El campo nombre es requerido'], 400);
  if (!$iniciales) jsonOut(['error' => 'El campo iniciales es requerido'], 400);
  if (strlen($id) > 10) jsonOut(['error' => 'El id no puede superar 10 caracteres'], 400);

  // Verificar unicidad
  $chk = $pdo->prepare("SELECT id FROM usuarios WHERE id = ?");
  $chk->execute([$id]);
  if ($chk->fetch()) jsonOut(['error' => "Ya existe un usuario con id '$id'"], 409);

  // PIN (opcional al crear; sin PIN el usuario no puede iniciar sesión)
  $pin_hash = null;
  if (isset($d['pin']) && $d['pin'] !== '') {
    $pin = (string)$d['pin'];
    if (strlen($pin) !== 4 || !ctype_digit($pin)) {
      jsonOut(['error' => 'El PIN debe ser exactamente 4 dígitos numéricos'], 400);
    }
    $pin_hash = hash('sha256', $id . ':' . $pin);
  }

  $telegramChatId = ($d['telegram_chat_id'] ?? '') ?: null;
  $celular        = ($d['celular'] ?? '') ?: null;

  $stmt = $pdo->prepare(
    "INSERT INTO usuarios (id, nombre, iniciales, color, rol, email, cedula, perfil, pin_hash, activo, telegram_chat_id, celular)
     VALUES (?,?,?,?,?,?,?,?,?,1,?,?)"
  );
  $stmt->execute([
    $id,
    $nombre,
    $iniciales,
    $d['color']  ?? '#94a3b8',
    ($d['rol']    ?? null) ?: null,
    ($d['email']  ?? null) ?: null,
    ($d['cedula'] ?? null) ?: null,
    in_array($d['perfil'] ?? '', ['admin','tecnico']) ? $d['perfil'] : 'tecnico',
    $pin_hash,
    $telegramChatId,
    $celular,
  ]);

  jsonOut(['ok' => true, 'id' => $id], 201);
}

// --------------------------------------------------------------
// PUT /usuarios.php?id=ID
// Actualiza un usuario existente. Requiere perfil admin.
// Body JSON: { nombre?, iniciales?, color?, rol?, email?,
//              perfil?, activo?, pin? (nuevo PIN, opcional), telegram_chat_id? }
// Para cambiar el PIN: enviar pin = "XXXX".
// Para dejar el PIN sin cambios: omitir el campo pin (o enviar null/vacío).
// --------------------------------------------------------------
if ($method === 'PUT') {
  requireAdmin($pdo);
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido en query string'], 400);

  $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE id = ?");
  $stmt->execute([$id]);
  $prev = $stmt->fetch();
  if (!$prev) jsonOut(['error' => 'Usuario no encontrado'], 404);

  $d = jsonInput();

  // PIN: si se envía, se actualiza; si no se envía o es vacío, se mantiene el actual
  $pin_hash = $prev['pin_hash'];
  if (isset($d['pin']) && $d['pin'] !== '' && $d['pin'] !== null) {
    $pin = (string)$d['pin'];
    if (strlen($pin) !== 4 || !ctype_digit($pin)) {
      jsonOut(['error' => 'El PIN debe ser exactamente 4 dígitos numéricos'], 400);
    }
    $pin_hash = hash('sha256', $id . ':' . $pin);
  }

  $nombre         = trim($d['nombre'] ?? $prev['nombre']);
  $iniciales      = strtoupper(trim($d['iniciales'] ?? $prev['iniciales']));
  $color          = $d['color']  ?? $prev['color'];
  $rol            = array_key_exists('rol', $d)             ? (($d['rol']             ?? '') ?: null) : $prev['rol'];
  $email          = array_key_exists('email', $d)           ? (($d['email']           ?? '') ?: null) : $prev['email'];
  $cedula         = array_key_exists('cedula', $d)          ? (($d['cedula']          ?? '') ?: null) : $prev['cedula'];
  $telegramChatId = array_key_exists('telegram_chat_id', $d) ? (($d['telegram_chat_id'] ?? '') ?: null) : $prev['telegram_chat_id'];
  $celular        = array_key_exists('celular', $d)          ? (($d['celular']          ?? '') ?: null) : $prev['celular'];
  $perfil         = in_array($d['perfil'] ?? '', ['admin','tecnico']) ? $d['perfil'] : $prev['perfil'];
  $activo         = isset($d['activo']) ? (int)$d['activo'] : (int)$prev['activo'];

  if (!$nombre)    jsonOut(['error' => 'El campo nombre no puede quedar vacío'], 400);
  if (!$iniciales) jsonOut(['error' => 'El campo iniciales no puede quedar vacío'], 400);

  $stmt = $pdo->prepare(
    "UPDATE usuarios
     SET nombre=?, iniciales=?, color=?, rol=?, email=?, cedula=?, perfil=?, pin_hash=?, activo=?, telegram_chat_id=?, celular=?
     WHERE id=?"
  );
  $stmt->execute([$nombre, $iniciales, $color, $rol, $email, $cedula, $perfil, $pin_hash, $activo, $telegramChatId, $celular, $id]);

  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
