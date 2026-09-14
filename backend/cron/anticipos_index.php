<?php
/**
 * anticipos_index.php — Cron nocturno (sugerido 2:00 a.m., fuera de horario
 * laboral porque un escaneo completo puede tardar).
 *
 * Refresca la caché de anticipos (recibidos y entregados) de forma
 * incremental — solo pide a Alegra los pagos desde el cursor guardado en
 * anticipos_scan_estado (ver backend/lib/alegra_anticipos.php). La primera
 * vez que corre, como no hay cursor todavía, hace un escaneo completo del
 * historial (más lento, una sola vez); de ahí en adelante es liviano.
 *
 * Silencioso: si Alegra falla un día, no rompe nada — la pestaña de Ginno
 * sigue mostrando la última caché válida y el botón "🔄 Actualizar ahora"
 * permite reintentar manualmente en cualquier momento.
 *
 * Cron command (cPanel, cero output):
 *   0 2 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/anticipos_index.php > /dev/null 2>&1
 */
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/alegra_anticipos.php';

$pdo = getDB();

foreach (['recibido', 'entregado'] as $direccion) {
  try {
    anticiposActualizarCache($pdo, $direccion, false);
  } catch (Throwable $e) {
    // No bloquear el cron por un problema puntual con Alegra — se reintenta
    // en la próxima corrida (o con el botón "🔄 Actualizar ahora").
  }
}
