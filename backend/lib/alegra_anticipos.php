<?php
/**
 * alegra_anticipos.php — Anticipos recibidos y entregados.
 *
 * Grupo Innovate no usa la función nativa "aplicar anticipo" de Alegra: un
 * anticipo se registra ahí como un pago (recibido o emitido) codificado
 * directamente a la cuenta contable de anticipos en vez de a una factura o
 * compra — eso pasa cuando llega una plata que no se sabe a qué factura
 * aplicar, o cuando las retenciones no cuadran. Este archivo escanea los
 * pagos de Alegra buscando esos casos y mantiene una caché local (de solo
 * lectura — la verdad financiera sigue siendo 100% de Alegra) para que la
 * pestaña de Ginno cargue instantáneo en vez de tener que recorrer miles de
 * pagos cada vez que se abre.
 *
 * Cuentas de Alegra involucradas (fijas para el plan de cuentas de Grupo
 * Innovate — confirmadas en Alegra > Contabilidad > Cuentas):
 *   Recibidos:  5042 (Anticipos Recibidos), 211894 (Avances y anticipos
 *               recibidos), 212026 (Anticipo recibido por identificar)
 *   Entregados: 5044 (Anticipos Proveedores), 211878 (Avances y anticipos
 *               entregados)
 *
 * Escaneo incremental: cada corrida guarda en anticipos_scan_estado la
 * fecha más vieja entre los anticipos que encontró todavía abiertos, y la
 * próxima corrida solo pide a Alegra los pagos desde esa fecha en adelante
 * (mucho más liviano que recorrer los ~5.900 pagos del historial completo).
 * Ojo: esto asume que los pagos no se registran con fecha retroactiva más
 * vieja que el cursor — si alguna vez se hace una corrección contable así,
 * un escaneo completo (accion=escaneo_completo desde la pestaña) lo detecta.
 *
 * Uso:
 *   require_once __DIR__ . '/alegra_anticipos.php';
 *   $r = alegraAnticiposEscanear('recibido', $desdeFechaONull); // solo Alegra
 *   $r = anticiposActualizarCache($pdo, 'recibido', $completo);  // + guarda en BD
 */
require_once __DIR__ . '/../config/config_alegra.php';

const ANTICIPOS_CUENTAS = [
  'recibido'  => ['5042', '211894', '212026'],
  'entregado' => ['5044', '211878'],
];

/**
 * Consulta en vivo a Alegra. NO toca la base de datos.
 * Devuelve ['items' => [...], 'fechaMasAntigua' => 'YYYY-MM-DD'|null, 'escaneoCompleto' => bool].
 * Lanza RuntimeException si no se pudo consultar Alegra.
 */
function alegraAnticiposEscanear(string $direccion, ?string $desde): array {
  if (!isset(ANTICIPOS_CUENTAS[$direccion])) {
    throw new InvalidArgumentException('Dirección inválida: ' . $direccion);
  }
  if (ALEGRA_EMAIL === 'CAMBIAR_CORREO_ALEGRA' || ALEGRA_TOKEN === 'CAMBIAR_TOKEN_API_ALEGRA') {
    throw new RuntimeException('Credenciales de Alegra no configuradas');
  }

  $authHeader = [
    'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
    'Accept: application/json',
  ];

  $cuentasValidas = array_flip(ANTICIPOS_CUENTAS[$direccion]);
  $tipoAlegra = $direccion === 'recibido' ? 'in' : 'out';

  $items = [];
  $fechaMasAntigua = null;
  $start = 0;
  $limitPorPagina = 30;
  // Tope de seguridad: 300 páginas (9.000 pagos) — de sobra para un escaneo
  // completo de todo el historial (~5.900 pagos recibidos hoy), y muy por
  // encima de lo que hace falta en un escaneo incremental normal.
  $topeSeguridad = 300;
  $huboRespuestaValida = false;
  $llegoAlFinal = false;

  for ($pagina = 0; $pagina < $topeSeguridad; $pagina++) {
    $pagos = _aaGet('https://api.alegra.com/api/v1/payments?' . http_build_query([
      'type'            => $tipoAlegra,
      'order_field'     => 'date',
      'order_direction' => 'DESC',
      'limit'           => $limitPorPagina,
      'start'           => $start,
    ]), $authHeader);

    if (!is_array($pagos)) {
      if ($pagina === 0) throw new RuntimeException('No se pudo consultar Alegra');
      break; // ya habíamos tenido al menos una página válida, cortamos aquí
    }
    $huboRespuestaValida = true;
    if (empty($pagos)) { $llegoAlFinal = true; break; }

    $paginaTieneFechaMenorQueDesde = false;

    foreach ($pagos as $p) {
      $fecha = $p['date'] ?? '';
      if ($desde !== null && $fecha !== '' && $fecha < $desde) {
        $paginaTieneFechaMenorQueDesde = true;
        continue;
      }

      $categorias = $p['categories'] ?? [];
      $cuentaUsada = null;
      foreach ($categorias as $cat) {
        if (isset($cat['id']) && isset($cuentasValidas[(string)$cat['id']])) { $cuentaUsada = $cat; break; }
      }
      if (!$cuentaUsada) continue; // este pago no está codificado a una cuenta de anticipos

      $contacto = $p['client'] ?? null;
      $items[] = [
        'id'             => (string)($p['id'] ?? ''),
        'direccion'      => $direccion,
        'cuentaId'       => (string)$cuentaUsada['id'],
        'cuentaNombre'   => $cuentaUsada['name'] ?? '',
        'contactoId'     => $contacto['id']   ?? null,
        'contactoNombre' => $contacto['name'] ?? null,
        'valor'          => (float)($cuentaUsada['total'] ?? $cuentaUsada['price'] ?? $p['amount'] ?? 0),
        'fecha'          => $fecha,
        'numero'         => $p['numberTemplate']['fullNumber'] ?? $p['numberTemplate']['number'] ?? ($p['number'] ?? null),
        'anotacion'      => $p['anotation'] ?? ($p['observations'] ?? null),
      ];
      if ($fechaMasAntigua === null || $fecha < $fechaMasAntigua) $fechaMasAntigua = $fecha;
    }

    if (count($pagos) < $limitPorPagina) { $llegoAlFinal = true; break; } // última página de Alegra
    if ($desde !== null && $paginaTieneFechaMenorQueDesde) break; // ya cubrimos todo lo que hacía falta desde el cursor
    $start += $limitPorPagina;
  }

  if (!$huboRespuestaValida) throw new RuntimeException('No se pudo consultar Alegra');

  return [
    'items'           => $items,
    'fechaMasAntigua' => $fechaMasAntigua,
    'escaneoCompleto' => $desde === null && $llegoAlFinal,
  ];
}

/**
 * Escanea Alegra (incremental desde el cursor guardado, o completo si
 * $completo=true) y guarda el resultado en anticipos_cache, actualizando el
 * cursor en anticipos_scan_estado. Devuelve un resumen; lanza excepción si
 * Alegra no respondió (no deja la BD a medias — todo en una transacción).
 */
function anticiposActualizarCache(PDO $pdo, string $direccion, bool $completo = false): array {
  $estadoStmt = $pdo->prepare("SELECT * FROM anticipos_scan_estado WHERE direccion = ?");
  $estadoStmt->execute([$direccion]);
  $estadoRow = $estadoStmt->fetch();

  $desde = $completo ? null : ($estadoRow['cursor_fecha'] ?? null);
  $r = alegraAnticiposEscanear($direccion, $desde); // puede lanzar RuntimeException

  $pdo->beginTransaction();
  try {
    if ($desde === null) {
      $pdo->prepare("DELETE FROM anticipos_cache WHERE direccion = ?")->execute([$direccion]);
    } else {
      $pdo->prepare("DELETE FROM anticipos_cache WHERE direccion = ? AND fecha >= ?")->execute([$direccion, $desde]);
    }

    $ins = $pdo->prepare("INSERT INTO anticipos_cache
        (alegra_payment_id, direccion, cuenta_id, cuenta_nombre, contacto_id, contacto_nombre, valor, fecha, numero, anotacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($r['items'] as $it) {
      $ins->execute([
        $it['id'], $direccion, $it['cuentaId'], $it['cuentaNombre'],
        $it['contactoId'], $it['contactoNombre'], $it['valor'], $it['fecha'],
        $it['numero'], $it['anotacion'],
      ]);
    }

    $nuevoCursor = $r['fechaMasAntigua'];
    if ($nuevoCursor === null) {
      // Nada abierto en el rango escaneado: si queda algo más viejo en
      // caché (de una corrida anterior que no tocamos), el cursor no puede
      // adelantarse más allá de eso; si la caché quedó vacía del todo, no
      // hay nada que vigilar más atrás que hoy.
      $minStmt = $pdo->prepare("SELECT MIN(fecha) AS f FROM anticipos_cache WHERE direccion = ?");
      $minStmt->execute([$direccion]);
      $nuevoCursor = $minStmt->fetch()['f'] ?? (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');
    }

    $escaneoCompletoHecho = (bool)($estadoRow['escaneo_completo_hecho'] ?? false) || $r['escaneoCompleto'];

    $pdo->prepare("UPDATE anticipos_scan_estado
        SET cursor_fecha = ?, escaneo_completo_hecho = ?, ultima_corrida_en = NOW()
      WHERE direccion = ?")
      ->execute([$nuevoCursor, $escaneoCompletoHecho ? 1 : 0, $direccion]);

    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }

  // --- Sincroniza el saldo pendiente por cliente/proveedor ----------------
  // Aparte de la transacción de arriba: esto sí consulta a Alegra (1 llamada
  // extra por contacto), así que se limita a quien nunca se ha verificado
  // (nuevo, o —la primera corrida tras este cambio— todo lo que ya había en
  // caché) o seguía con saldo abierto la vez pasada. Tope de 40 por corrida
  // para no demorar el cron; si queda pendiente, sigue en la próxima.
  $pendientesStmt = $pdo->prepare("
    SELECT DISTINCT c.contacto_id, c.contacto_nombre
    FROM anticipos_cache c
    LEFT JOIN anticipos_saldo_tercero s
      ON s.direccion = c.direccion AND s.contacto_id = c.contacto_id
    WHERE c.direccion = ?
      AND c.contacto_id IS NOT NULL
      AND (s.contacto_id IS NULL OR s.saldo > 0.5)
    LIMIT 40
  ");
  $pendientesStmt->execute([$direccion]);
  foreach ($pendientesStmt->fetchAll() as $row) {
    try {
      anticiposActualizarSaldoContacto($pdo, $direccion, $row['contacto_id'], $row['contacto_nombre']);
    } catch (Throwable $e) {
      // Alegra no respondió para este contacto puntual — se reintenta la próxima corrida.
    }
  }

  return ['encontrados' => count($r['items']), 'fechaMasAntigua' => $nuevoCursor];
}

/**
 * Cuánto de la cuenta de anticipos de este contacto ya se aplicó a facturas
 * en Alegra. Confirmado con el caso real de Disproquin (mayo-junio 2026):
 * aplicar un anticipo NO toca el pago original — Alegra crea aparte un
 * comprobante contable (journal) que debita la cuenta de anticipos y
 * acredita cartera. Por eso hay que sumar esos comprobantes aparte; el pago
 * original (ya capturado por alegraAnticiposEscanear) nunca cambia.
 * Devuelve el monto aplicado (a restar del total recibido/entregado).
 */
function _aaTotalAplicadoContacto(string $direccion, string $contactoId): float {
  $authHeader = [
    'Authorization: Basic ' . base64_encode(ALEGRA_EMAIL . ':' . ALEGRA_TOKEN),
    'Accept: application/json',
  ];
  $cuentasValidas = array_flip(ANTICIPOS_CUENTAS[$direccion]);

  $total = 0.0;
  $start = 0;
  $limit = 30;
  $topeSeguridad = 20; // hasta 600 comprobantes contables de este contacto — de sobra

  for ($pagina = 0; $pagina < $topeSeguridad; $pagina++) {
    $journals = _aaGet('https://api.alegra.com/api/v1/journals?' . http_build_query([
      'client_id' => $contactoId,
      'start'     => $start,
      'limit'     => $limit,
    ]), $authHeader);

    if (!is_array($journals) || empty($journals)) break;

    foreach ($journals as $j) {
      $entries = $j['entries'] ?? null;
      if ($entries === null && isset($j['id'])) {
        // La lista no trajo el detalle de las líneas del comprobante — se pide aparte.
        $detalle = _aaGet('https://api.alegra.com/api/v1/journals/' . $j['id'], $authHeader);
        $entries = $detalle['entries'] ?? [];
      }
      foreach ((array)$entries as $entry) {
        $catId = (string)($entry['category']['id'] ?? $entry['id'] ?? '');
        if ($catId === '' || !isset($cuentasValidas[$catId])) continue;
        // "Aplicar" el anticipo DEBITA la cuenta de anticipos (baja el saldo
        // pendiente); un crédito ahí sería inusual pero se resta si aparece.
        $debito  = (float)($entry['debit']  ?? 0);
        $credito = (float)($entry['credit'] ?? 0);
        if ($debito === 0.0 && $credito === 0.0 && isset($entry['operation'], $entry['amount'])) {
          $monto = is_array($entry['amount']) ? (float)($entry['amount']['mainCurrency'] ?? 0) : (float)$entry['amount'];
          if ($entry['operation'] === 'debit') $debito = $monto; else $credito = $monto;
        }
        $total += $debito - $credito;
      }
    }

    if (count($journals) < $limit) break;
    $start += $limit;
  }

  return $total;
}

/**
 * Recalcula y guarda el saldo pendiente (recibido/entregado) de un
 * cliente/proveedor puntual: lo que se le ha recibido/entregado como
 * anticipo (suma de anticipos_cache, ya escaneado) menos lo que ya se le ha
 * aplicado a facturas en Alegra (_aaTotalAplicadoContacto, consulta en vivo).
 * Lanza excepción si Alegra no respondió — el saldo guardado no se toca.
 */
function anticiposActualizarSaldoContacto(PDO $pdo, string $direccion, string $contactoId, ?string $contactoNombre): float {
  $sumaStmt = $pdo->prepare("SELECT COALESCE(SUM(valor),0) AS s FROM anticipos_cache WHERE direccion = ? AND contacto_id = ?");
  $sumaStmt->execute([$direccion, $contactoId]);
  $totalRecibido = (float)($sumaStmt->fetch()['s'] ?? 0);

  $totalAplicado = _aaTotalAplicadoContacto($direccion, $contactoId); // puede lanzar

  $saldo = round($totalRecibido - $totalAplicado, 2);
  if ($saldo < 0) $saldo = 0.0; // por seguridad ante desfases de redondeo

  $pdo->prepare("INSERT INTO anticipos_saldo_tercero (direccion, contacto_id, contacto_nombre, saldo, consultado_en)
      VALUES (?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      contacto_nombre = VALUES(contacto_nombre), saldo = VALUES(saldo), consultado_en = VALUES(consultado_en)")
    ->execute([$direccion, $contactoId, $contactoNombre, $saldo]);

  return $saldo;
}

function _aaGet(string $url, array $headers) {
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
