<?php
/**
 * alegra_facturas.php — Creación de facturas en Alegra (POST /invoices).
 *
 * Lógica compartida entre:
 *   - backend/api/alegra_crear_factura.php (creación inmediata desde el
 *     formulario del módulo de Facturación)
 *   - backend/api/facturas_pendientes.php (creación diferida de una factura
 *     que se dejó "lista para después" mientras el límite mensual de Alegra
 *     estaba agotado)
 *
 * Una sola función construye el payload y hace el POST, para que ambos
 * flujos creen exactamente la misma factura sin duplicar código.
 */
require_once __DIR__ . '/../config/config_alegra.php';

/**
 * Crea una factura en Alegra y registra el resultado en facturas_generadas.
 *
 * @param array       $datos   { date, dueDate?, client:{id}, items:[{id,description,quantity,price,tax?}],
 *                                clienteNombre?, tareaId? }
 * @param PDO         $pdo
 * @return array      ['ok' => bool, 'data' => array|null, 'error' => string|null, 'status' => int|null, 'detalle' => mixed]
 */
function crearFacturaEnAlegra(array $datos, PDO $pdo): array {
  if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
    return ['ok' => false, 'httpStatus' => 500, 'error' => 'Credenciales de Alegra no configuradas'];
  }

  $date = $datos['date'] ?? null;
  $client = $datos['client'] ?? null;
  $items = $datos['items'] ?? null;
  $dueDate = $datos['dueDate'] ?? null;
  $clienteNombre = $datos['clienteNombre'] ?? null;
  $tareaId = $datos['tareaId'] ?? null;

  if (!$date || empty($client['id']) || !is_array($items) || empty($items)) {
    return ['ok' => false, 'httpStatus' => 400, 'error' => 'Faltan datos: se requiere date, client.id e items[]'];
  }
  foreach ($items as $it) {
    if (empty($it['id']) || !isset($it['price']) || !isset($it['quantity'])) {
      return ['ok' => false, 'httpStatus' => 400, 'error' => 'Cada ítem debe tener id, price y quantity'];
    }
  }

  // La fecha de vencimiento es obligatoria para Alegra; si no se envía,
  // por defecto se usa la fecha de la factura + 8 días.
  if (!$dueDate) {
    $dueDate = date('Y-m-d', strtotime($date . ' +8 days'));
  }

  // Plazo de pago en días = diferencia entre dueDate y date (mínimo 0)
  $dias = (int) round((strtotime($dueDate) - strtotime($date)) / 86400);
  if ($dias < 0) $dias = 0;

  $payload = [
    'date'            => $date,
    'dueDate'         => $dueDate,
    'paymentForm'     => 'CREDIT',
    'termsConditions' => 'Pago a ' . $dias . ' días',
    'client'  => ['id' => $client['id']],
    'items'  => array_map(function ($it) {
      return [
        'id'          => (int) $it['id'],
        'description' => $it['description'] ?? '',
        'price'       => (float) $it['price'],
        'quantity'    => (float) $it['quantity'],
        'tax'         => $it['tax'] ?? [['id' => 5]],
      ];
    }, $items),
  ];

  $ch = curl_init('https://api.alegra.com/api/v1/invoices');
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_HTTPHEADER => [
      'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
      'Accept: application/json',
      'Content-Type: application/json',
    ],
    CURLOPT_TIMEOUT => 20,
  ]);
  $resp = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);

  if ($resp === false) {
    return ['ok' => false, 'httpStatus' => 502, 'error' => 'No se pudo conectar con Alegra: ' . $err];
  }

  $data = json_decode($resp, true);

  if ($status < 200 || $status >= 300) {
    $msg = $data['message'] ?? $resp;
    return ['ok' => false, 'httpStatus' => 502, 'error' => 'Alegra respondió con error', 'status' => $status, 'detalle' => $msg];
  }

  // Registrar la factura creada para el informe "Facturas generadas (módulo Facturación)".
  // No bloqueante: si falla el log, la factura ya quedó creada en Alegra de todas formas.
  try {
    $numeroFactura = $data['numberTemplate']['fullNumber'] ?? ($data['id'] ?? '');
    $totalFactura = isset($data['total']) ? (float) $data['total'] : null;
    $pdo->prepare("INSERT INTO facturas_generadas (numero_factura, alegra_id, cliente_id, cliente_nombre, total, tarea_id, fecha_factura)
      VALUES (?, ?, ?, ?, ?, ?, ?)")
      ->execute([
        (string) $numeroFactura,
        isset($data['id']) ? (string) $data['id'] : null,
        (string) $client['id'],
        $clienteNombre,
        $totalFactura,
        $tareaId,
        $date,
      ]);
  } catch (Throwable $e) { /* no bloquear la respuesta si el log falla */ }

  return ['ok' => true, 'data' => $data];
}
