<?php
/**
 * transportes.php (lib) — Registro de transportes por tarea, compartido.
 *
 * crearTransportesTarea() crea un registro en `transportes` por cada
 * check-in con checkout ya hecho y sin transporte registrado, de una tarea
 * IT/IF en sitio cuyo cliente tenga valor_transporte configurado. La usan:
 *   - backend/api/transportes.php (POST) — registro manual desde el botón
 *     del modal (respaldo para visitas que el automático no haya cubierto).
 *   - backend/api/reporte_enviar_correo.php — automático, al enviar el
 *     reporte de una visita (si el checkout ya estaba hecho).
 *   - backend/api/reportes.php (acción checkout) — automático, cuando el
 *     checkout de una visita queda completo con el reporte ya enviado.
 *
 * Reglas: primera visita del día por técnico → 2 trayectos; visitas
 * adicionales del mismo técnico ese día → 0 trayectos. No falla si la tarea
 * no aplica (área distinta de IT/IF, modalidad remota, o cliente sin valor
 * de transporte) — simplemente no crea nada ('aplica' => false).
 */
function crearTransportesTarea(PDO $pdo, string $tareaId): array {
  $resultado = ['created' => 0, 'skipped' => 0, 'aplica' => false, 'error' => null];

  $stmt = $pdo->prepare("SELECT * FROM tareas WHERE id = ?");
  $stmt->execute([$tareaId]);
  $tarea = $stmt->fetch();
  if (!$tarea) { $resultado['error'] = 'Tarea no encontrada'; return $resultado; }

  if (!in_array($tarea['area'], ['it', 'if'], true) || $tarea['modalidad'] !== 'en_sitio') {
    return $resultado; // no aplica — silencioso
  }

  // Valor unitario por trayecto del cliente (snapshot al momento de registrar)
  $stmt = $pdo->prepare("SELECT valor_transporte FROM clientes WHERE LOWER(nombre) = LOWER(?)");
  $stmt->execute([$tarea['cliente'] ?? '']);
  $clienteRow = $stmt->fetch();
  $valorUnit  = $clienteRow ? (int)($clienteRow['valor_transporte'] ?? 0) : 0;
  if ($valorUnit <= 0) {
    $resultado['error'] = 'El cliente no tiene valor de transporte configurado';
    return $resultado;
  }

  $resultado['aplica'] = true;

  // Check-ins con checkout ya hecho, ordenados por check_in ASC (para
  // detectar cuál es el primero del día por técnico).
  $stmt = $pdo->prepare("
    SELECT vp.id, vp.tecnico_id, vp.check_in, vp.check_out
    FROM visita_participantes vp
    JOIN reportes r ON r.id COLLATE utf8mb4_general_ci = vp.reporte_id COLLATE utf8mb4_general_ci
    WHERE r.tarea_id = ?
      AND vp.check_in IS NOT NULL
      AND vp.check_out IS NOT NULL
      AND (vp.transporte_estado IS NULL OR vp.transporte_estado = 'pendiente')
    ORDER BY vp.check_in ASC
  ");
  $stmt->execute([$tareaId]);
  $participantes = $stmt->fetchAll();

  if (!$participantes) return $resultado;

  // Detectar si el técnico ya tiene transporte registrado ese día
  // (puede haber visitas de otras tareas ya registradas)
  $diasConTransporte = []; // "tecnico_id|fecha" → true

  foreach ($participantes as $p) {
    $tecId = $p['tecnico_id'];
    $fecha = substr($p['check_in'], 0, 10);
    $key   = $tecId . '|' . $fecha;

    if (!isset($diasConTransporte[$key])) {
      $chk = $pdo->prepare("
        SELECT COUNT(*) FROM transportes
        WHERE tecnico_id = ? AND fecha = ? AND trayectos > 0
      ");
      $chk->execute([$tecId, $fecha]);
      $diasConTransporte[$key] = ((int)$chk->fetchColumn() > 0);
    }
  }

  foreach ($participantes as $p) {
    $tecId = $p['tecnico_id'];
    $fecha = substr($p['check_in'], 0, 10);
    $key   = $tecId . '|' . $fecha;
    $id    = bin2hex(random_bytes(16));

    // Primera visita del día con transporte → 2 trayectos; las demás → 0
    $trayectos = $diasConTransporte[$key] ? 0 : 2;

    try {
      $pdo->prepare("
        INSERT INTO transportes
          (id, tarea_id, participante_id, tecnico_id, cliente, tarea_titulo,
           fecha, check_in, check_out, valor, trayectos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ")->execute([
        $id,
        $tareaId,
        $p['id'],
        $tecId,
        $tarea['cliente'] ?? '',
        $tarea['titulo']  ?? '',
        $fecha,
        $p['check_in'],
        $p['check_out'],
        $valorUnit,
        $trayectos,
      ]);

      $pdo->prepare("UPDATE visita_participantes SET transporte_estado = 'registrado' WHERE id = ?")
          ->execute([$p['id']]);

      $diasConTransporte[$key] = true;
      $resultado['created']++;
    } catch (\PDOException $e) {
      if ($e->getCode() === '23000') {
        $pdo->prepare("UPDATE visita_participantes SET transporte_estado = 'registrado' WHERE id = ?")
            ->execute([$p['id']]);
        $resultado['skipped']++;
        continue;
      }
      throw $e;
    }
  }

  return $resultado;
}
