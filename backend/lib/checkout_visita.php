<?php
// --------------------------------------------------------------
// Lógica compartida de "checkout" de un participante de visita.
//
// Antes vivía solo dentro del PUT /reportes.php (accion:'checkout'). Se
// extrajo a esta función reutilizable para poder llamarla también desde
// reporte_enviar_correo.php: así, cuando el técnico le da "Enviar" al
// reporte, el checkout real (check_out, cierre de pausas, horas de
// contrato, aviso a administrativo) queda en el MISMO request que marca
// el reporte como enviado — en vez de depender de una segunda llamada
// aparte desde el navegador después de que el correo ya salió, que podía
// quedar a medias si se caía la conexión justo en el medio (caso real:
// tarjeta #MU5HGW, 2026-09-17 — correo enviado pero checkout nunca
// llegó a escribirse). Ver CONTEXTO.md para el detalle del diagnóstico.
//
// El comportamiento es exactamente el mismo que antes — solo cambió
// DÓNDE vive el código, no qué hace.
// --------------------------------------------------------------
require_once __DIR__ . '/contrato.php';
require_once __DIR__ . '/transportes.php';
require_once __DIR__ . '/avisos_tecnicos.php';
require_once __DIR__ . '/telegram.php';
require_once __DIR__ . '/mailer.php';

function _nombreTecnico($pdo, $tecnicoId) {
  if (!$tecnicoId) return 'Un técnico';
  $stmt = $pdo->prepare("SELECT nombre FROM usuarios WHERE id = ?");
  $stmt->execute([$tecnicoId]);
  $row = $stmt->fetch();
  return $row['nombre'] ?? $tecnicoId;
}

// Ejecuta el checkout de un participante (o el legacy sin participanteId):
// cierra la pausa activa si la hay, marca check_out, sincroniza el estado
// del reporte cuando ya no queda nadie pendiente, registra transportes,
// calcula horas de contrato (si aplica) y avisa a administrativo por
// correo. Devuelve la fila de "reportes" ya actualizada (sin fotos ni
// participantes — eso lo arma el llamador con reporteConFotos() si hace
// falta).
function ejecutarCheckoutParticipante(
  PDO $pdo,
  string $reporteId,
  array $prevReporte,
  ?string $partId,
  ?string $tecnicoOut,
  ?float $checkoutLat,
  ?float $checkoutLng,
  ?string $checkoutAt = null
): array {
  $quedoEnviado = false;
  $coAt = $checkoutAt ?: date('Y-m-d H:i:s');

  if ($partId) {
    // ── Multi-tech: actualizar participante específico ──────────
    // Auto-cerrar pausa activa si el técnico finaliza estando en pausa
    $pdo->prepare("UPDATE visita_pausas SET pausa_fin = NOW() WHERE participante_id = ? AND pausa_fin IS NULL")
      ->execute([$partId]);
    $pdo->prepare("UPDATE visita_participantes SET check_out = ?, checkout_lat = ?, checkout_lng = ? WHERE id = ?")
      ->execute([$coAt, $checkoutLat, $checkoutLng, $partId]);
    // ¿Quedan participantes sin checkout?
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ? AND check_out IS NULL");
    $stmt->execute([$reporteId]);
    $pendientes = (int)$stmt->fetchColumn();
    if ($pendientes === 0) {
      // Todos terminaron → enviado (checkout diferido, ya se envió el reporte)
      $stmt2 = $pdo->prepare("SELECT MAX(check_out) FROM visita_participantes WHERE reporte_id = ?");
      $stmt2->execute([$reporteId]);
      $ultimoCheckout = $stmt2->fetchColumn();
      $pdo->prepare("UPDATE reportes SET estado='enviado', check_out=?, tecnico_checkout_id=? WHERE id=?")
        ->execute([$ultimoCheckout, $tecnicoOut, $reporteId]);
      $quedoEnviado = true;
    }
  } else {
    // ── Legacy: checkout único (registros sin visita_participantes) ──
    $pdo->prepare("UPDATE reportes SET check_out=?, tecnico_checkout_id=?, estado='enviado' WHERE id=?")
      ->execute([$coAt, $tecnicoOut, $reporteId]);
    // Intentar actualizar participante coincidente si existe
    $pdo->prepare("UPDATE visita_participantes SET check_out=?, checkout_lat=?, checkout_lng=? WHERE reporte_id=? AND tecnico_id=? AND check_out IS NULL")
      ->execute([$coAt, $checkoutLat, $checkoutLng, $reporteId, $tecnicoOut]);
    $quedoEnviado = true;
  }

  // Transporte: si el reporte quedó enviado (checkout completo + reporte
  // ya enviado), registrar automáticamente. No bloqueante.
  if ($quedoEnviado) {
    try {
      if (!empty($prevReporte['tarea_id'])) crearTransportesTarea($pdo, $prevReporte['tarea_id']);
    } catch (Throwable $e) { /* silencioso */ }
  }

  // ── Descuento de horas de contrato (si la tarea es tipo contrato) ──
  try {
    $stmtTipo = $pdo->prepare("SELECT t.tipo_tarea, t.cliente, t.area FROM reportes r JOIN tareas t ON t.id = r.tarea_id WHERE r.id = ?");
    $stmtTipo->execute([$reporteId]);
    $tareaInfo = $stmtTipo->fetch();

    if ($tareaInfo && $tareaInfo['tipo_tarea'] === 'contrato' && $partId) {
      $stmtPart2 = $pdo->prepare("SELECT check_in, check_out FROM visita_participantes WHERE id = ?");
      $stmtPart2->execute([$partId]);
      $partData = $stmtPart2->fetch();

      if ($partData && $partData['check_in'] && $partData['check_out']) {
        // Cálculo (duración neta descontando pausas + redondeo a bloques
        // de 30 min, mínimo 0.5h) centralizado en lib/contrato.php para
        // reutilizarlo también en el backfill de tareas reclasificadas.
        $stmtPausas = $pdo->prepare("SELECT pausa_inicio, pausa_fin FROM visita_pausas WHERE participante_id = ? AND pausa_fin IS NOT NULL");
        $stmtPausas->execute([$partId]);
        $horasContrato = calcularHorasContratoVisita($partData['check_in'], $partData['check_out'], $stmtPausas->fetchAll());

        $pdo->prepare("UPDATE visita_participantes SET horas_contrato = ? WHERE id = ?")
          ->execute([$horasContrato, $partId]);

        // Horas del contrato del cliente + fecha de corte
        $stmtContrato = $pdo->prepare("
          SELECT contrato_horas_mes, fecha_corte_contrato FROM clientes
          WHERE nombre COLLATE utf8mb4_general_ci = ?
            AND contrato_area = ?
          LIMIT 1
        ");
        $stmtContrato->execute([$tareaInfo['cliente'], $tareaInfo['area']]);
        $contratoRow      = $stmtContrato->fetch();
        $horasContratadas = $contratoRow ? (float)$contratoRow['contrato_horas_mes'] : 0;
        $corteDia = ($contratoRow && $contratoRow['fecha_corte_contrato'] !== null) ? (int)$contratoRow['fecha_corte_contrato'] : null;
        [$periodoInicio, $periodoFin] = periodoContratoActual($corteDia);

        // Horas consumidas en el ciclo de contrato vigente para el cliente/área
        $stmtConsumo = $pdo->prepare("
          SELECT COALESCE(SUM(vp.horas_contrato), 0)
          FROM visita_participantes vp
          JOIN reportes r2 ON r2.id = vp.reporte_id COLLATE utf8mb4_general_ci
          JOIN tareas t2   ON t2.id = r2.tarea_id
          WHERE t2.cliente COLLATE utf8mb4_general_ci = ?
            AND t2.tipo_tarea = 'contrato'
            AND t2.area      = ?
            AND DATE(vp.check_out) BETWEEN ? AND ?
            AND vp.horas_contrato IS NOT NULL
        ");
        $stmtConsumo->execute([$tareaInfo['cliente'], $tareaInfo['area'], $periodoInicio, $periodoFin]);
        $horasConsumidas = (float)$stmtConsumo->fetchColumn();

        // Si se agotaron → crear tarea adicional automáticamente
        if ($horasContratadas > 0 && $horasConsumidas > $horasContratadas) {
          $nuevaTareaId = bin2hex(random_bytes(16));
          $pdo->prepare("INSERT INTO tareas
            (id, titulo, descripcion, area, estado, tipo_tarea, cliente, creado_por)
            VALUES (?, ?, ?, ?, 'programado', 'evento', ?, 'ginno')")
            ->execute([
              $nuevaTareaId,
              'Visita de contrato adicional',
              'Horas de contrato agotadas. Visita generada automáticamente por Ginno.',
              $tareaInfo['area'],
              $tareaInfo['cliente'],
            ]);
        }

        // ── Aviso: horas de contrato por agotarse ────────────────────
        // Umbral configurable (config.horas_contrato_umbral, mismo para todos
        // los contratos). Se avisa como máximo una vez por cliente/área/mes
        // (reutiliza la tabla avisos_enviados: tecnico_id=area, tarea_id=md5(cliente)).
        if ($horasContratadas > 0) {
          $horasDisponiblesAviso = round($horasContratadas - $horasConsumidas, 1);
          $umbralRaw = configGet($pdo, 'horas_contrato_umbral');
          $umbralHoras = ($umbralRaw !== null && $umbralRaw !== '') ? (float)$umbralRaw : 2.0;
          if ($horasDisponiblesAviso <= $umbralHoras) {
            $claveMes = $periodoInicio; // clave por ciclo de contrato, no por mes calendario
            $claveCliente = md5($tareaInfo['cliente']);
            if (!avisoYaEnviado($pdo, 'horas_contrato', $tareaInfo['area'], $claveCliente, $claveMes)) {
              try {
                $clienteEsc = htmlspecialchars($tareaInfo['cliente'], ENT_QUOTES, 'UTF-8');
                $seEnvioAviso = false;

                if (configGet($pdo, 'aviso_horas_contrato') === '1') {
                  $extraHoras = "<p style='margin:8px 0'>👤 <b>Cliente:</b> {$clienteEsc}</p>"
                              . "<p style='margin:8px 0'>🗺 <b>Área:</b> " . strtoupper($tareaInfo['area']) . "</p>"
                              . "<p style='margin:8px 0'>🕐 <b>Horas contratadas/mes:</b> {$horasContratadas}h</p>"
                              . "<p style='margin:8px 0'>📊 <b>Consumidas este mes:</b> {$horasConsumidas}h</p>"
                              . "<p style='margin:8px 0;color:#dc2626;font-weight:700'>⚠️ Disponibles: {$horasDisponiblesAviso}h</p>";
                  foreach (adminsConEmail($pdo) as $adm) {
                    $cuerpo = htmlAvisoTecnico(
                      $adm['nombre'],
                      'el contrato de un cliente está por agotar sus horas del mes.',
                      $extraHoras
                    );
                    enviarAvisoTecnico($adm['email'], $adm['nombre'], '⏳ Horas de contrato por agotarse — ' . $tareaInfo['cliente'], $cuerpo);
                  }
                  $seEnvioAviso = true;
                }

                if (configGet($pdo, 'aviso_horas_contrato_tg') === '1') {
                  $msg = "⏳ <b>Horas de contrato por agotarse</b>\n\n"
                       . "👤 <b>Cliente:</b> {$clienteEsc}\n"
                       . "🗺 <b>Área:</b> " . strtoupper($tareaInfo['area']) . "\n"
                       . "🕐 <b>Contratadas:</b> {$horasContratadas}h\n"
                       . "📊 <b>Consumidas:</b> {$horasConsumidas}h\n"
                       . "⚠️ <b>Disponibles:</b> {$horasDisponiblesAviso}h\n\n"
                       . "🔗 <a href='https://grupoinnovate.com/ginno/tareas-equipo.html'>Ver en Ginno</a>";
                  foreach (adminsConTelegram($pdo) as $adm) {
                    sendTelegramMsg($adm['telegram_chat_id'], $msg);
                  }
                  $seEnvioAviso = true;
                }

                if ($seEnvioAviso) {
                  registrarAvisoEnviado($pdo, 'horas_contrato', $tareaInfo['area'], $claveCliente, $claveMes);
                }
              } catch (Throwable $e) { /* silencioso */ }
            }
          }
        }
      }
    }
  } catch (Throwable $e) { /* no bloquear checkout */ }
  // ────────────────────────────────────────────────────────────────

  // ── Notificación de checkout a administrativo ──────────────────
  try {
    // Datos del participante que acaba de hacer checkout
    $stmtPart = $partId
      ? $pdo->prepare("SELECT * FROM visita_participantes WHERE id = ?")
      : $pdo->prepare("SELECT * FROM visita_participantes WHERE reporte_id = ? AND tecnico_id = ? ORDER BY check_out DESC LIMIT 1");
    if ($partId) { $stmtPart->execute([$partId]); }
    else         { $stmtPart->execute([$reporteId, $tecnicoOut]); }
    $part = $stmtPart->fetch();

    // Estado actualizado del reporte
    $stmtRep = $pdo->prepare("SELECT r.*, t.titulo, t.cliente FROM reportes r JOIN tareas t ON t.id = r.tarea_id WHERE r.id = ?");
    $stmtRep->execute([$reporteId]);
    $repInfo = $stmtRep->fetch();

    $tecnicoNombre  = _nombreTecnico($pdo, $tecnicoOut ?: ($part['tecnico_id'] ?? null));
    $horaIn         = $part ? date('H:i', strtotime($part['check_in']))  : '-';
    $horaOut        = $part && $part['check_out'] ? date('H:i', strtotime($part['check_out'])) : date('H:i');
    $fechaVisita    = $part ? date('d/m/Y', strtotime($part['check_in'])) : date('d/m/Y');

    // ¿Ya generó el reporte?
    $reporteHecho   = !empty($repInfo['pdf_archivo']) || !in_array($repInfo['estado'] ?? '', ['activo']);
    $reporteLabel   = $reporteHecho ? '✅ Sí' : '⏳ Pendiente';

    // ¿Ya se envió al cliente?
    $enviado        = ($repInfo['estado'] ?? '') === 'enviado';
    $enviadoLabel   = $enviado
      ? '✅ Sí — <b>' . htmlspecialchars($repInfo['enviado_a'] ?? '') . '</b>'
      : '⏳ No enviado aún';

    // ¿Quedan otros técnicos en visita?
    $stmtActivos = $pdo->prepare("SELECT COUNT(*) FROM visita_participantes WHERE reporte_id = ? AND check_out IS NULL");
    $stmtActivos->execute([$reporteId]);
    $activosRestantes = (int)$stmtActivos->fetchColumn();
    $otrosLabel = $activosRestantes > 0
      ? "⚠️ Quedan <b>{$activosRestantes}</b> técnico(s) aún en sitio"
      : "✅ Todos los técnicos han salido";

    $titulo  = htmlspecialchars($repInfo['titulo'] ?? '');
    $cliente = htmlspecialchars($repInfo['cliente'] ?? '-');

    enviarCorreoConAdjunto(
      [CORREO_ADMIN_FIJO],
      "🔴 Visita finalizada — {$cliente}",
      "<div style='font-family:Arial,sans-serif;max-width:600px;color:#1e293b'>"
      . "<p>¡Hola! <b>{$tecnicoNombre}</b> ya terminó su visita. Aquí el resumen:</p>"
      . "<table style='border-collapse:collapse;font-size:14px'>"
      . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>📅 Fecha</td><td><b>{$fechaVisita}</b></td></tr>"
      . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>🕐 Check-in</td><td><b>{$horaIn}</b></td></tr>"
      . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>🕐 Check-out</td><td><b>{$horaOut}</b></td></tr>"
      . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>👤 Cliente</td><td><b>{$cliente}</b></td></tr>"
      . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>📋 Tarea</td><td><b>{$titulo}</b></td></tr>"
      . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>📝 Reporte</td><td>{$reporteLabel}</td></tr>"
      . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>📧 Enviado</td><td>{$enviadoLabel}</td></tr>"
      . "<tr><td style='padding:4px 12px 4px 0;color:#64748b'>👥 En sitio</td><td>{$otrosLabel}</td></tr>"
      . "</table>"
      . "<hr style='border:none;border-top:1px solid #e2e8f0;margin:16px 0'>"
      . "<p style='color:#94a3b8;font-size:12px;margin:0'>Ginno · Asistente de Grupo Innovate</p>"
      . "</div>"
    );
  } catch (Throwable $e) {}
  // ────────────────────────────────────────────────────────────────

  $stmt = $pdo->prepare("SELECT * FROM reportes WHERE id = ?");
  $stmt->execute([$reporteId]);
  return $stmt->fetch();
}
