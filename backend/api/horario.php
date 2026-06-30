<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// GET /horario.php?usuario_id=X  →  devuelve horario del usuario
if ($method === 'GET') {
  $uid = $_GET['usuario_id'] ?? null;
  if (!$uid) jsonOut(['error' => 'usuario_id requerido'], 400);

  $stmt = $pdo->prepare(
    "SELECT h_lun, h_mar, h_mie, h_jue, h_vie, h_sab, h_dom, horario_desde
     FROM usuarios WHERE id = ?"
  );
  $stmt->execute([$uid]);
  $row = $stmt->fetch();
  jsonOut($row ?: (object)[]);
}

// PUT /horario.php?usuario_id=X
// body JSON: { lun, mar, mie, jue, vie, sab, dom, vigente_desde }
// NULL en un día = no trabaja ese día
if ($method === 'PUT') {
  $uid = $_GET['usuario_id'] ?? null;
  if (!$uid) jsonOut(['error' => 'usuario_id requerido'], 400);

  $d    = jsonInput();
  $dias = ['lun','mar','mie','jue','vie','sab','dom'];

  $vals = [];
  foreach ($dias as $dia) {
    $vals[$dia] = isset($d[$dia]) && $d[$dia] !== '' && $d[$dia] !== null
      ? round((float)$d[$dia], 2)
      : null;
  }

  $vigente = !empty($d['vigente_desde']) ? $d['vigente_desde'] : date('Y-m-d');

  $pdo->prepare(
    "UPDATE usuarios SET
       h_lun=?, h_mar=?, h_mie=?, h_jue=?, h_vie=?, h_sab=?, h_dom=?,
       horario_desde=?
     WHERE id=?"
  )->execute([
    $vals['lun'], $vals['mar'], $vals['mie'], $vals['jue'],
    $vals['vie'], $vals['sab'], $vals['dom'],
    $vigente, $uid,
  ]);

  jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);
