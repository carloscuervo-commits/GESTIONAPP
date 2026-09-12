<?php
/**
 * cartera_archivo.php — Archivado automático de gestiones de cartera ya
 * resueltas (el cliente dejó de tener facturas vencidas en Alegra, es decir,
 * pagó — o el saldo se resolvió de otra forma).
 *
 * Se llama cada vez que se consulta la cartera vigente de Alegra:
 *   - alegra_cartera_resumen.php  → al abrir/refrescar la pestaña Cartera
 *   - cartera_recordatorio.php    → cron diario, antes de armar los avisos
 *
 * No borra nada — solo marca `archivado = 1` (con `archivado_en`) en
 * cartera_gestion para que deje de aparecer en el tablero activo y pase a la
 * sección "🗄️ Archivados". Si ese cliente vuelve a tener una factura vencida
 * más adelante, se reactiva solo (archivado = 0) la próxima vez que aparezca
 * en la cartera vigente.
 *
 * También guarda `ultimo_total_deuda` en cada sincronización — así, cuando
 * un cliente se archiva, la sección de archivados puede mostrar cuánto se
 * le llegó a cobrar antes de resolverse (después de archivado ya no hay
 * forma de volver a consultarlo en Alegra, porque ahí ya no aparece).
 */

/**
 * @param PDO   $pdo
 * @param array $vigentes  Salida de alegraCarteraVigente(): [{clienteId, clienteNombre, totalDeuda, ...}, ...]
 * @return array{archivados:int, reactivados:int}
 */
function carteraSincronizarYArchivar(PDO $pdo, array $vigentes): array {
  $idsVigentes = array_column($vigentes, 'clienteId');

  // 1) Para los que siguen vigentes: actualizar el último total conocido y
  //    el nombre (por si cambió en Alegra), y reactivar si estaban archivados
  //    (les volvió a salir cartera vencida después de haber sido archivados).
  $stmtSync = $pdo->prepare("
    UPDATE cartera_gestion
    SET ultimo_total_deuda = ?, cliente_nombre = ?, archivado = 0
    WHERE cliente_alegra_id = ?
  ");
  $reactivados = 0;
  foreach ($vigentes as $v) {
    $stmtSync->execute([$v['totalDeuda'], $v['clienteNombre'], $v['clienteId']]);
    if ($stmtSync->rowCount() > 0) $reactivados++;
  }

  // 2) Archivar los que YA NO están vigentes (no tienen fila para actualizar
  //    de todas formas si nunca se gestionaron, así que esto solo afecta a
  //    quienes sí tenían una gestión abierta). Si $idsVigentes viene vacío
  //    (por ejemplo porque falló la consulta a Alegra, no porque de verdad
  //    no haya nadie vencido) NO se archiva nada, por seguridad — mejor
  //    perder un archivado que archivar a todo el mundo por error.
  $archivados = 0;
  if (!empty($idsVigentes)) {
    $in = implode(',', array_fill(0, count($idsVigentes), '?'));
    $stmt = $pdo->prepare("
      UPDATE cartera_gestion
      SET archivado = 1, archivado_en = NOW(), estado = 'pagado'
      WHERE archivado = 0 AND cliente_alegra_id NOT IN ($in)
    ");
    $stmt->execute($idsVigentes);
    $archivados = $stmt->rowCount();
  }

  return ['archivados' => $archivados, 'reactivados' => $reactivados];
}
