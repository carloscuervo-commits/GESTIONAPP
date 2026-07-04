<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

set_exception_handler(function($e) {
  jsonOut(['error' => $e->getMessage()], 500);
});

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// GET ?dashboard=1
if ($method === 'GET' && !empty($_GET['dashboard'])) {
  $stmt = $pdo->query(
    "SELECT bu.tecnico_id, u.nombre, u.iniciales, u.color,
            COUNT(*) AS dias_pendientes
     FROM bitacora_usuario bu
     JOIN usuarios u ON u.id COLLATE utf8mb4_general_ci = bu.tecnico_id COLLATE utf8mb4_general_ci
     WHERE bu.estado = 'deficit_sin_nota'
       AND u.activo = 1
     GROUP BY bu.tecnico_id, u.nombre, u.iniciales, u.color"
  );
  jsonOut($stmt->fetchAll());
}

// GET ?desde=&hasta=
if ($method === 'GET') {
  $desde = $_GET['desde'] ?? null;
  $hasta = $_GET['hasta'] ?? null;
  if (!$desde || !$hasta) jsonOut(['error' => 'desde y hasta requeridos'], 400);
  if ($desde > $hasta)    jsonOut(['error' => 'desde debe ser <= hasta'], 400);

  $diffDias = (strtotime($hasta) - strtotime($desde)) / 86400;
  if ($diffDias > 90) jsonOut(['error' => 'Rango maximo 90 dias'], 400);

  // 1. Tecnicos activos con horario
  $stmtTec = $pdo->query(
    "SELECT id, nombre, iniciales, color,
            h_lun, h_mar, h_mie, h_jue, h_vie, h_sab, h_dom, horario_desde
     FROM usuarios
     WHERE activo = 1
     ORDER BY nombre ASC"
  );
  $tecnicos = $stmtTec->fetchAll();

  // 2. Dias precalculados del rango
  $stmtDias = $pdo->prepare(
    "SELECT bu.tecnico_id, bu.fecha, bu.horas_real, bu.horas_esp,
            bu.estado, bu.nota_tipo, bu.nota, bu.admin_id,
            u.nombre AS admin_nombre
     FROM bitacora_usuario bu
     LEFT JOIN usuarios u ON u.id COLLATE utf8mb4_general_ci = bu.admin_id COLLATE utf8mb4_general_ci
     WHERE bu.fecha BETWEEN ? AND ?
     ORDER BY bu.tecnico_id, bu.fecha ASC"
  );
  $stmtDias->execute([$desde, $hasta]);
  $dias = $stmtDias->fetchAll();

  // 3. Detalle de visitas del rango
  $stmtVis = $pdo->prepare(
    "SELECT vp.id         AS participante_id,
            vp.tecnico_id,
            vp.check_in,
            vp.check_out,
            t.titulo,
            t.cliente,
            t.area,
            r.id AS reporte_id,
            r.pdf_archivo,
            COALESCE((
              SELECT SUM(TIMESTAMPDIFF(MINUTE, p.pausa_inicio, p.pausa_fin))
              FROM visita_pausas p
              WHERE p.participante_id COLLATE utf8mb4_general_ci = vp.id COLLATE utf8mb4_general_ci
                AND p.pausa_fin IS NOT NULL
            ), 0) AS mins_pausa
     FROM visita_participantes vp
     JOIN reportes r ON r.id COLLATE utf8mb4_general_ci = vp.reporte_id COLLATE utf8mb4_general_ci
     JOIN tareas   t ON t.id COLLATE utf8mb4_general_ci = r.tarea_id   COLLATE utf8mb4_general_ci
     WHERE DATE(vp.check_in) BETWEEN ? AND ?
     ORDER BY vp.check_in ASC"
  );
  $stmtVis->execute([$desde, $hasta]);
  $visitas = $stmtVis->fetchAll();

  // 4. Detalle de pausas del rango
  $stmtPausas = $pdo->prepare(
    "SELECT p.participante_id, p.pausa_inicio, p.pausa_fin, p.justificacion
     FROM visita_pausas p
     JOIN visita_participantes vp
          ON vp.id COLLATE utf8mb4_general_ci = p.participante_id COLLATE utf8mb4_general_ci
     WHERE DATE(vp.check_in) BETWEEN ? AND ?
       AND p.pausa_fin IS NOT NULL
     ORDER BY p.pausa_inicio ASC"
  );
  $stmtPausas->execute([$desde, $hasta]);
  $pausas = $stmtPausas->fetchAll();

  jsonOut(compact('tecnicos', 'dias', 'visitas', 'pausas'));
}

// POST — guardar justificación
if ($method === 'POST') {
  $d = jsonInput();

  $tecId    = $d['tecnico_id'] ?? null;
  $fecha    = $d['fecha']      ?? null;
  $notaTipo = trim($d['nota_tipo'] ?? '');
  $nota     = trim($d['nota']     ?? '');
  $adminId  = $d['admin_id']   ?? null;

  if (!$tecId || !$fecha || !$notaTipo || !$adminId) {
    jsonOut(['error' => 'tecnico_id, fecha, nota_tipo y admin_id son requeridos'], 400);
  }

  $notaGuardar = $nota !== '' ? $nota : null;

  // Verificar si ya existe la fila
  $stmt = $pdo->prepare("SELECT id, horas_esp FROM bitacora_usuario WHERE tecnico_id=? AND fecha=?");
  $stmt->execute([$tecId, $fecha]);
  $fila = $stmt->fetch();

  if ($fila) {
    $pdo->prepare(
      "UPDATE bitacora_usuario
       SET nota_tipo=?, nota=?, admin_id=?, estado='deficit_con_nota', updated_at=NOW()
       WHERE tecnico_id=? AND fecha=?"
    )->execute([$notaTipo, $notaGuardar, $adminId, $tecId, $fecha]);
  } else {
    $dow    = (int)(new DateTime($fecha))->format('w');
    $colMap = [0=>'h_dom',1=>'h_lun',2=>'h_mar',3=>'h_mie',4=>'h_jue',5=>'h_vie',6=>'h_sab'];
    $col    = $colMap[$dow];
    $stmtH  = $pdo->prepare("SELECT $col AS horas_esp FROM usuarios WHERE id=?");
    $stmtH->execute([$tecId]);
    $rowH     = $stmtH->fetch();
    $horasEsp = $rowH ? (float)($rowH['horas_esp'] ?? 0) : 0;

    $id = bin2hex(random_bytes(16));
    $pdo->prepare(
      "INSERT INTO bitacora_usuario (id, tecnico_id, fecha, horas_real, horas_esp, estado, nota_tipo, nota, admin_id)
       VALUES (?,?,?,0,?,'deficit_con_nota',?,?,?)"
    )->execute([$id, $tecId, $fecha, $horasEsp, $notaTipo, $notaGuardar, $adminId]);
  }

  jsonOut(['ok' => true]);
}

// DELETE ?tecnico_id=X&fecha=Y — eliminar justificación
if ($method === 'DELETE') {
  $tecId = $_GET['tecnico_id'] ?? null;
  $fecha = $_GET['fecha']      ?? null;
  if (!$tecId || !$fecha) jsonOut(['error' => 'tecnico_id y fecha requeridos'], 400);

  $pdo->prepare(
    "UPDATE bitacora_usuario
     SET nota_tipo=NULL, nota=NULL, admin_id=NULL,
         estado = IF(horas_real < horas_esp, 'deficit_sin_nota', 'ok'),
         updated_at=NOW()
     WHERE tecnico_id=? AND fecha=?"
  )->execute([$tecId, $fecha]);

  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Metodo no soportado'], 405);
