<?php
// informe_cliente.php
// GET ?cliente=<nombre>&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
// Returns all completed visits for a client in the date range with work summaries.
// Hours are man-hours: sum of each technician's individual time per visit.
// COLLATE rule: visita_participantes uses utf8mb4_unicode_ci; server default is
// utf8mb4_general_ci — all JOINs need COLLATE utf8mb4_general_ci on both sides.

require_once __DIR__ . '/../lib/db.php';
applyCors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonOut(['error' => 'Método no permitido'], 405);
}

$pdo = getDB();

$clienteNombre = trim($_GET['cliente'] ?? '');
$fechaInicio   = $_GET['fecha_inicio'] ?? '';
$fechaFin      = $_GET['fecha_fin']    ?? '';

if (!$clienteNombre) jsonOut(['error' => 'cliente requerido'], 400);
if (!$fechaInicio)   jsonOut(['error' => 'fecha_inicio requerido'], 400);
if (!$fechaFin)      jsonOut(['error' => 'fecha_fin requerido'], 400);

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaInicio) ||
    !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaFin)) {
    jsonOut(['error' => 'Formato de fecha inválido (YYYY-MM-DD)'], 400);
}

// Query all completed visits for this client in the date range.
// Filter by DATE(CONVERT_TZ(vp.check_in)) so dates match Colombia time (UTC-5).
// Order by check_in ASC so visits appear chronologically.
$sql = "
  SELECT
    t.id              AS tarea_id,
    t.titulo,
    t.area,
    t.fecha_programacion,
    t.cliente,
    r.id              AS reporte_id,
    r.datos,
    r.estado          AS reporte_estado,
    vp.id             AS vp_id,
    vp.tecnico_id,
    vp.check_in,
    vp.check_out,
    vp.horas_contrato,
    TIMESTAMPDIFF(MINUTE, vp.check_in, vp.check_out) AS duracion_minutos,
    u.nombre          AS tecnico_nombre
  FROM tareas t
  JOIN reportes r
    ON r.tarea_id COLLATE utf8mb4_general_ci = t.id COLLATE utf8mb4_general_ci
  JOIN visita_participantes vp
    ON vp.reporte_id COLLATE utf8mb4_general_ci = r.id COLLATE utf8mb4_general_ci
  LEFT JOIN usuarios u
    ON u.id COLLATE utf8mb4_general_ci = vp.tecnico_id COLLATE utf8mb4_general_ci
  WHERE t.cliente COLLATE utf8mb4_general_ci = ?
    AND r.estado = 'enviado'
    AND vp.check_out IS NOT NULL
    AND DATE(CONVERT_TZ(vp.check_in, '+00:00', '-05:00')) BETWEEN ? AND ?
  ORDER BY vp.check_in ASC
";

$stmt = $pdo->prepare($sql);
$stmt->execute([$clienteNombre, $fechaInicio, $fechaFin]);
$rows = $stmt->fetchAll();

// Group rows by reporte_id — each reporte = one visit card
$visitasMap = [];
foreach ($rows as $row) {
    $rid = $row['reporte_id'];

    if (!isset($visitasMap[$rid])) {
        // Decode datos JSON; extract text fields, skip photos
        $datos = [];
        if (!empty($row['datos'])) {
            $decoded = json_decode($row['datos'], true);
            if (is_array($decoded)) $datos = $decoded;
        }

        $visitasMap[$rid] = [
            'reporte_id'            => $rid,
            'tarea_id'              => $row['tarea_id'],
            'titulo'                => $row['titulo'],
            'area'                  => $row['area'],
            'fecha_programacion'    => $row['fecha_programacion'],
            'fecha_visita'          => $row['check_in'],   // earliest check_in, refined below
            'descripcion_acciones'  => $datos['descripcion_acciones'] ?? '',
            'materiales'            => $datos['materiales']           ?? '',
            'pendientes'            => $datos['pendientes']           ?? '',
            'es_contrato'           => false,
            'participantes'         => [],
        ];
    }

    // Track earliest check_in as the canonical visit date
    if ($row['check_in'] < $visitasMap[$rid]['fecha_visita']) {
        $visitasMap[$rid]['fecha_visita'] = $row['check_in'];
    }

    $esContrato = !empty($row['horas_contrato']);
    if ($esContrato) $visitasMap[$rid]['es_contrato'] = true;

    $visitasMap[$rid]['participantes'][] = [
        'vp_id'            => $row['vp_id'],
        'tecnico_id'       => $row['tecnico_id'],
        'tecnico_nombre'   => $row['tecnico_nombre'] ?: $row['tecnico_id'],
        'check_in'         => $row['check_in'],
        'check_out'        => $row['check_out'],
        'duracion_minutos' => (int)max(0, (int)($row['duracion_minutos'] ?? 0)),
        'es_contrato'      => $esContrato,
    ];
}

jsonOut([
    'cliente_nombre' => $clienteNombre,
    'fecha_inicio'   => $fechaInicio,
    'fecha_fin'      => $fechaFin,
    'visitas'        => array_values($visitasMap),
]);
