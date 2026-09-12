<?php
/**
 * alegra_cartera.php — Consulta en vivo a Alegra de las facturas abiertas y
 * vencidas, agrupadas por cliente. Extraído de alegra_cartera_resumen.php
 * para que el cron de recordatorio (cartera_recordatorio.php) pueda usar
 * exactamente la misma lógica sin pasar por HTTP.
 *
 * Uso: require_once __DIR__ . '/alegra_cartera.php';
 *      $vigentes = alegraCarteraVigente();
 *      // [{clienteId, clienteNombre, facturas:[{num,balance,dueDate,date}], totalDeuda, fechaMasAntigua}, ...]
 *      // Lanza RuntimeException si no se pudo consultar Alegra.
 */
require_once __DIR__ . '/../config/config_alegra.php';

function alegraCarteraVigente(): array {
  if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
    throw new RuntimeException('Credenciales de Alegra no configuradas');
  }

  $authHeader = [
    'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
    'Accept: application/json',
  ];

  $hoy = (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');

  // Alegra pagina de a 30 registros — recorremos varias páginas hasta agotar
  // resultados o llegar a un tope de seguridad. IMPORTANTE: el filtro
  // dueDate_before de la consulta NO funciona en la práctica (confirmado:
  // con o sin él, Alegra devuelve todas las facturas "open" del cliente sin
  // importar su fecha de vencimiento) — por eso se recorren TODAS las
  // facturas abiertas de la empresa (no solo las vencidas) y se filtra acá
  // mismo por fecha (ver abajo). El tope de 20 páginas (600 facturas) es
  // holgado: hoy la empresa tiene ~80 facturas "open" en total.
  $byClient = [];
  $start = 0;
  $limitPorPagina = 30;
  $topeSeguridad = 20;
  $huboRespuestaValida = false;

  for ($pagina = 0; $pagina < $topeSeguridad; $pagina++) {
    // No se manda dueDate_before: se probó y Alegra lo ignora (devuelve igual
    // todas las facturas "open"), así que no vale la pena pedirlo — el
    // filtro de vencida se hace abajo, por factura.
    $facturas = _acGet('https://api.alegra.com/api/v1/invoices?' . http_build_query([
      'status'          => 'open',
      'order_field'     => 'dueDate',
      'order_direction' => 'ASC',
      'limit'           => $limitPorPagina,
      'start'           => $start,
    ]), $authHeader);

    if (!is_array($facturas)) {
      if ($pagina === 0) throw new RuntimeException('No se pudo consultar Alegra');
      break; // ya habíamos tenido al menos una página válida, cortamos aquí
    }
    $huboRespuestaValida = true;
    if (empty($facturas)) break;

    foreach ($facturas as $f) {
      $balance = isset($f['balance']) ? (float)$f['balance'] : (float)($f['total'] ?? 0);
      if ($balance <= 0) continue;
      $dueDate = $f['dueDate'] ?? '';

      // dueDate_before no filtra nada del lado de Alegra (ver nota arriba) —
      // el filtro real de "vencida" es este.
      if ($dueDate === '' || $dueDate > $hoy) continue;

      $cliente = $f['client'] ?? null;
      if (!$cliente || empty($cliente['id'])) continue;
      $cid = (string)$cliente['id'];
      $numero = $f['numberTemplate']['fullNumber'] ?? $f['numberTemplate']['number'] ?? ($f['number'] ?? (string)($f['id'] ?? ''));
      $date = $f['date'] ?? $dueDate;

      if (!isset($byClient[$cid])) {
        $byClient[$cid] = [
          'clienteId'       => $cid,
          'clienteNombre'   => $cliente['name'] ?? '(sin nombre)',
          'facturas'        => [],
          'totalDeuda'      => 0.0,
          'fechaMasAntigua' => $dueDate ?: $date,
        ];
      }
      $byClient[$cid]['facturas'][] = ['num' => $numero, 'balance' => $balance, 'dueDate' => $dueDate, 'date' => $date];
      $byClient[$cid]['totalDeuda'] += $balance;
      $fecha = $dueDate ?: $date;
      if ($fecha && $fecha < $byClient[$cid]['fechaMasAntigua']) $byClient[$cid]['fechaMasAntigua'] = $fecha;
    }

    if (count($facturas) < $limitPorPagina) break; // última página
    $start += $limitPorPagina;
  }

  if (!$huboRespuestaValida) throw new RuntimeException('No se pudo consultar Alegra');

  $out = array_values($byClient);
  usort($out, fn($a, $b) => $b['totalDeuda'] <=> $a['totalDeuda']);
  return $out;
}

function _acGet(string $url, array $headers) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_TIMEOUT => 15,
  ]);
  $resp = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($resp === false || $status < 200 || $status >= 300) return null;
  return json_decode($resp, true);
}
