-- 043_anticipos.sql
-- Módulo "Anticipos": Grupo Innovate registra en Alegra, como anticipo (pago
-- codificado a la cuenta contable de anticipos en vez de a una factura), los
-- pagos que llegan sin saber a qué factura aplicar o cuyas retenciones no
-- cuadran. El objetivo es mantener esas cuentas en $0 — este módulo ayuda a
-- ubicarlos y darles seguimiento hasta que se "maten" (se apliquen a una
-- factura con sus retenciones), pero la operación real (aplicar el anticipo)
-- siempre se hace directo en Alegra, nunca desde Ginno.
--
-- anticipos_cache: caché de solo lectura, reconstruida desde Alegra por el
--   cron backend/cron/anticipos_index.php (o el botón "Actualizar ahora").
--   Nunca se edita a mano — la verdad financiera sigue siendo 100% de Alegra.
-- anticipos_gestion: seguimiento propio de Ginno (nota + próxima revisión),
--   igual patrón que cartera_gestion — no toca el monto ni el estado real.
-- anticipos_scan_estado: guarda, por dirección, desde qué fecha hay que
--   volver a escanear (evita recorrer todo el historial en cada corrida).

CREATE TABLE IF NOT EXISTS anticipos_cache (
  id                INT           NOT NULL AUTO_INCREMENT,
  alegra_payment_id VARCHAR(20)   NOT NULL,
  direccion         ENUM('recibido','entregado') NOT NULL,
  cuenta_id         VARCHAR(20)   NOT NULL,
  cuenta_nombre     VARCHAR(100)  NOT NULL,
  contacto_id       VARCHAR(20)   NULL,
  contacto_nombre   VARCHAR(150)  NULL COMMENT 'NULL = anticipo sin identificar (consignación sin asociar a cliente)',
  valor             DECIMAL(14,2) NOT NULL,
  fecha             DATE          NOT NULL,
  numero            VARCHAR(30)   NULL,
  anotacion         VARCHAR(255)  NULL,
  actualizado_en    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_anticipo (alegra_payment_id, direccion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS anticipos_gestion (
  id                      INT      NOT NULL AUTO_INCREMENT,
  alegra_payment_id       VARCHAR(20) NOT NULL,
  direccion               ENUM('recibido','entregado') NOT NULL,
  nota                    TEXT     NULL,
  fecha_proxima_revision  DATE     NULL,
  actualizado_por         VARCHAR(10) NULL,
  actualizado_en          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gestion (alegra_payment_id, direccion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS anticipos_scan_estado (
  direccion               ENUM('recibido','entregado') NOT NULL,
  cursor_fecha            DATE     NULL COMMENT 'próxima corrida solo escanea pagos desde esta fecha en adelante',
  escaneo_completo_hecho  TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 tras el primer barrido histórico completo',
  ultima_corrida_en       DATETIME NULL,
  PRIMARY KEY (direccion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO anticipos_scan_estado (direccion, cursor_fecha, escaneo_completo_hecho) VALUES
  ('recibido',  NULL, 0),
  ('entregado', NULL, 0);
