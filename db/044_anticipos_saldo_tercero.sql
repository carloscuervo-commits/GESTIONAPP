-- 044_anticipos_saldo_tercero.sql
-- Corrige el módulo de Anticipos: Alegra NO modifica el pago original cuando
-- se "aplica" un anticipo a una factura (confirmado con el caso real de
-- Disproquin) — crea aparte un comprobante contable (journal) que debita la
-- cuenta de anticipos y acredita cartera, dejando el pago original intacto
-- para siempre. Por eso el escaneo de pagos (backend/lib/alegra_anticipos.php)
-- por sí solo no podía saber si un anticipo ya se había aplicado: siempre lo
-- iba a mostrar como pendiente, aunque llevara meses resuelto en Alegra.
--
-- La corrección: por cada cliente/proveedor con anticipos, se consulta a
-- Alegra (api/v1/journals?client_id=...) cuánto se ha aplicado ya contra la
-- cuenta de anticipos, y se guarda aquí el saldo neto resultante. La pestaña
-- de Ginno ahora agrupa por cliente/proveedor (no por pago individual) y solo
-- muestra a quien todavía tiene saldo pendiente — igual que se ve en Alegra.
--
-- Para no golpear la API de Alegra en cada corrida, solo se vuelve a
-- consultar el saldo de: (a) contactos que nunca se han verificado (nuevos, o
-- —la primera vez que corre esto— todo lo que ya había en caché de antes), y
-- (b) contactos que en la corrida anterior todavía tenían saldo > 0. A quien
-- ya quedó en $0 y no tiene actividad nueva no se le vuelve a preguntar nada.

CREATE TABLE IF NOT EXISTS anticipos_saldo_tercero (
  direccion       ENUM('recibido','entregado') NOT NULL,
  contacto_id     VARCHAR(20)   NOT NULL,
  contacto_nombre VARCHAR(150)  NULL,
  saldo           DECIMAL(14,2) NOT NULL DEFAULT 0,
  consultado_en   DATETIME      NOT NULL,
  PRIMARY KEY (direccion, contacto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- anticipos_gestion pasa de llevar la nota/próxima revisión por PAGO a
-- llevarla por CLIENTE/PROVEEDOR (más lógico ahora que la vista se agrupa
-- así). El módulo se lanzó hoy mismo y no tiene notas reales que preservar.
DROP TABLE IF EXISTS anticipos_gestion;
CREATE TABLE anticipos_gestion (
  id                      INT      NOT NULL AUTO_INCREMENT,
  contacto_id             VARCHAR(20) NOT NULL,
  direccion               ENUM('recibido','entregado') NOT NULL,
  nota                    TEXT     NULL,
  fecha_proxima_revision  DATE     NULL,
  actualizado_por         VARCHAR(10) NULL,
  actualizado_en          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gestion (contacto_id, direccion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
