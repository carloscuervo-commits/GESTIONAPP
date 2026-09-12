<?php
/**
 * alegra_cartera_resumen.php — GET /alegra_cartera_resumen.php
 *
 * Trae en vivo, desde Alegra, todas las facturas abiertas y vencidas
 * agrupadas por cliente (ver backend/lib/alegra_cartera.php). Cada vez que
 * se llama, también sincroniza y archiva automáticamente en cartera_gestion
 * los clientes que ya no tienen cartera vencida (ver backend/lib/cartera_archivo.php)
 * — así la pestaña "💰 Cartera" se va vaciando sola apenas Alegra refleja el
 * pago, sin borrar el histórico de la gestión.
 *
 * Para cada cliente, si existe una fila en la tabla local `clientes` con el
 * mismo alegra_id, se adjunta su email/celular guardado en Ginno (para
 * prellenar el envío de cobro sin tener que ir a buscarlo a Alegra).
 *
 * Respuesta: { actualizado: 'YYYY-MM-DD', clientes: [{ clienteId, clienteNombre,
 *   email, celular, facturas:[{num,balance,dueDate,date}], totalDeuda, fechaMasAntigua }, ...] }
 */
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo = getDB();
requireSesion($pdo, 'admin');

require_once __DIR__ . '/../lib/alegra_cartera.php';
require_once __DIR__ . '/../lib/cartera_archivo.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  jsonOut(['error' => 'Método no soportado'], 405);
}

try {
  $vigentes = alegraCarteraVigente();
} catch (Throwable $e) {
  jsonOut(['error' => $e->getMessage()], 502);
}

// Archivar automáticamente en la BD lo que ya se resolvió (o reactivar lo
// que volvió a tener cartera vencida). No bloquea la respuesta si falla.
try { carteraSincronizarYArchivar($pdo, $vigentes); } catch (Throwable $e) { /* no bloquear */ }

// Adjuntar email/celular locales (tabla clientes) por alegra_id, si existen.
if (!empty($vigentes)) {
  $ids = array_column($vigentes, 'clienteId');
  $in  = implode(',', array_fill(0, count($ids), '?'));
  $stmt = $pdo->prepare("SELECT alegra_id, email, celular FROM clientes WHERE alegra_id IN ($in)");
  $stmt->execute($ids);
  $porId = [];
  foreach ($stmt->fetchAll() as $row) $porId[(string)$row['alegra_id']] = $row;
  foreach ($vigentes as &$c) {
    $c['email']   = $porId[$c['clienteId']]['email']   ?? null;
    $c['celular'] = $porId[$c['clienteId']]['celular'] ?? null;
  }
  unset($c);
} else {
  foreach ($vigentes as &$c) { $c['email'] = null; $c['celular'] = null; }
  unset($c);
}

$hoy = (new DateTime('now', new DateTimeZone('America/Bogota')))->format('Y-m-d');
jsonOut(['actualizado' => $hoy, 'clientes' => $vigentes]);
