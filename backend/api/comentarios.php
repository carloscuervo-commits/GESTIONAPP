<?php
/**
 * comentarios.php — Comentarios por tarjeta con @menciones.
 *
 * GET    ?tareaId=UUID          -> lista de comentarios de esa tarea (asc)
 * POST   { tareaId, usuarioId, texto }
 *   -> crea el comentario; detecta @ID en el texto y notifica (correo y/o
 *      Telegram) a cada usuario mencionado, según su preferencia individual
 *      (usuarios.notif_menciones_correo / notif_menciones_tg).
 * DELETE ?id=UUID               -> elimina un comentario
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// Etiquetas en español de los estados de tarjeta (todas las áreas).
function _estadoLegible(string $estado): string {
  $labels = [
    'solicitud'        => 'Solicitud',
    'programado'       => 'Programada',
    'por_reprogramar'  => 'Por reprogramar',
    'realizado'        => 'Realizada',
    'facturado'        => 'Facturada',
    'archivado'        => 'Archivada',
    'por-cotizar'      => 'Por cotizar',
    'enviada'          => 'Enviada',
    'aprobada'         => 'Aprobada',
    'rechazada'        => 'Rechazada',
    'pendiente'        => 'Pendiente',
  ];
  if (isset($labels[$estado])) return $labels[$estado];
  if ($estado === '') return '—';
  return ucfirst(str_replace(['_', '-'], ' ', $estado));
}

// Fecha de programación/ejecución en formato d/m/Y, o '—' si no tiene.
function _fechaLegible(?string $fecha): string {
  if (!$fecha || $fecha === '0000-00-00') return '—';
  $ts = strtotime($fecha);
  return $ts ? date('d/m/Y', $ts) : '—';
}

function comentarioConAutor($pdo, $id) {
  $stmt = $pdo->prepare("
    SELECT c.id, c.tarea_id, c.usuario_id, c.texto, c.creado_en,
           u.nombre, u.iniciales, u.color
    FROM comentarios c
    JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.id = ?
  ");
  $stmt->execute([$id]);
  return $stmt->fetch();
}

if ($method === 'GET') {
  $tareaId = $_GET['tareaId'] ?? null;
  if (!$tareaId) jsonOut(['error' => 'tareaId requerido'], 400);

  $stmt = $pdo->prepare("
    SELECT c.id, c.tarea_id, c.usuario_id, c.texto, c.creado_en,
           u.nombre, u.iniciales, u.color
    FROM comentarios c
    JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.tarea_id = ?
    ORDER BY c.creado_en ASC
  ");
  $stmt->execute([$tareaId]);
  jsonOut($stmt->fetchAll());
}

if ($method === 'POST') {
  $d = jsonInput();
  $tareaId   = $d['tareaId']   ?? null;
  $usuarioId = $d['usuarioId'] ?? null;
  $texto     = trim($d['texto'] ?? '');

  if (!$tareaId || !$usuarioId) jsonOut(['error' => 'tareaId y usuarioId son requeridos'], 400);
  if ($texto === '') jsonOut(['error' => 'El comentario no puede estar vacío'], 400);

  $stmtTarea = $pdo->prepare("SELECT titulo, cliente, area, estado, fecha_programacion FROM tareas WHERE id = ?");
  $stmtTarea->execute([$tareaId]);
  $tarea = $stmtTarea->fetch();
  if (!$tarea) jsonOut(['error' => 'Tarea no encontrada'], 404);

  $stmtAutor = $pdo->prepare("SELECT nombre FROM usuarios WHERE id = ?");
  $stmtAutor->execute([$usuarioId]);
  $autor = $stmtAutor->fetch();
  $autorNombre = $autor['nombre'] ?? $usuarioId;

  $id = bin2hex(random_bytes(16));
  $pdo->prepare("INSERT INTO comentarios (id, tarea_id, usuario_id, texto) VALUES (?,?,?,?)")
    ->execute([$id, $tareaId, $usuarioId, $texto]);

  // ── Notificar a los mencionados (@ID) ──────────────────────────────
  try {
    preg_match_all('/@([A-Za-z0-9]{2,10})\b/', $texto, $m);
    $idsUnicos = array_values(array_unique(array_map('strtoupper', $m[1] ?? [])));

    if ($idsUnicos) {
      require_once __DIR__ . '/../lib/avisos_tecnicos.php';
      require_once __DIR__ . '/../lib/telegram.php';

      $placeholders = implode(',', array_fill(0, count($idsUnicos), '?'));
      $stmtMenc = $pdo->prepare("
        SELECT id, nombre, email, telegram_chat_id, notif_menciones_correo, notif_menciones_tg
        FROM usuarios
        WHERE id IN ($placeholders) AND activo = 1
      ");
      $stmtMenc->execute($idsUnicos);
      $mencionados = $stmtMenc->fetchAll();

      $tituloEsc   = htmlspecialchars($tarea['titulo'] ?: 'Tarea', ENT_QUOTES, 'UTF-8');
      $clienteEsc  = htmlspecialchars($tarea['cliente'] ?: '—', ENT_QUOTES, 'UTF-8');
      $idTarjeta   = '#' . strtoupper(substr($tareaId, 0, 6));
      $estadoEsc   = htmlspecialchars(_estadoLegible($tarea['estado'] ?? ''), ENT_QUOTES, 'UTF-8');
      $fechaEjecEsc = htmlspecialchars(_fechaLegible($tarea['fecha_programacion'] ?? null), ENT_QUOTES, 'UTF-8');
      $textoEscHtml = nl2br(htmlspecialchars($texto, ENT_QUOTES, 'UTF-8'));
      $areaLink  = urlencode($tarea['area'] ?? '');
      $link      = "https://grupoinnovate.com/ginno/tareas-equipo.html?abrir_tarea={$tareaId}&area={$areaLink}";

      foreach ($mencionados as $u) {
        if ($u['notif_menciones_correo'] == 1 && !empty($u['email'])) {
          $infoTarjeta = "<table style='margin:10px 0;font-size:13px;color:#334155'>"
            . "<tr><td style='padding:2px 10px 2px 0;color:#64748b'>👤 Cliente</td><td style='font-weight:600'>{$clienteEsc}</td></tr>"
            . "<tr><td style='padding:2px 10px 2px 0;color:#64748b'>🆔 ID tarjeta</td><td style='font-weight:600'>{$idTarjeta}</td></tr>"
            . "<tr><td style='padding:2px 10px 2px 0;color:#64748b'>📅 Fecha de ejecución</td><td style='font-weight:600'>{$fechaEjecEsc}</td></tr>"
            . "<tr><td style='padding:2px 10px 2px 0;color:#64748b'>📌 Estado</td><td style='font-weight:600'>{$estadoEsc}</td></tr>"
            . "</table>";
          $cuerpo = htmlAvisoTecnico(
            $u['nombre'],
            htmlspecialchars($autorNombre, ENT_QUOTES, 'UTF-8') . " te mencionó en un comentario de la tarjeta \"{$tituloEsc}\".",
            $infoTarjeta
            . "<blockquote style='margin:10px 0;padding:8px 12px;border-left:3px solid #169BBC;background:#f8fafc;font-size:14px'>{$textoEscHtml}</blockquote>"
            . "<p style='margin:12px 0 0'><a href='{$link}' style='color:#169BBC'>Ver en Ginno →</a></p>"
          );
          enviarAvisoTecnico($u['email'], $u['nombre'], "💬 Te mencionaron — " . ($tarea['titulo'] ?: 'Tarea'), $cuerpo);
        }

        if ($u['notif_menciones_tg'] == 1 && !empty($u['telegram_chat_id'])) {
          $msg = "💬 <b>Te mencionaron en un comentario</b>\n\n"
               . "Hola <b>" . htmlspecialchars($u['nombre'], ENT_QUOTES, 'UTF-8') . "</b>, "
               . htmlspecialchars($autorNombre, ENT_QUOTES, 'UTF-8') . " te mencionó en la tarjeta \"{$tituloEsc}\":\n\n"
               . "👤 <b>Cliente:</b> {$clienteEsc}\n"
               . "🆔 <b>ID tarjeta:</b> {$idTarjeta}\n"
               . "📅 <b>Fecha de ejecución:</b> {$fechaEjecEsc}\n"
               . "📌 <b>Estado:</b> {$estadoEsc}\n\n"
               . "“" . htmlspecialchars($texto, ENT_QUOTES, 'UTF-8') . "”\n\n"
               . "🔗 <a href='{$link}'>Ver en Ginno</a>";
          sendTelegramMsg($u['telegram_chat_id'], $msg);
        }
      }
    }
  } catch (Throwable $e) {
    // No bloquear la creación del comentario si falla el envío de avisos
  }

  jsonOut(comentarioConAutor($pdo, $id), 201);
}

if ($method === 'DELETE') {
  $id = $_GET['id'] ?? null;
  if (!$id) jsonOut(['error' => 'id requerido'], 400);
  $pdo->prepare("DELETE FROM comentarios WHERE id = ?")->execute([$id]);
  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
