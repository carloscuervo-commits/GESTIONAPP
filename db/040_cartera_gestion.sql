-- 040_cartera_gestion.sql
-- Módulo de gestión de cartera (cobro): la pestaña "💰 Cartera" existía ya,
-- pero su tablero vivía en localStorage del navegador (assets/js/cartera.js,
-- clave cowork_cartera_v1) y los datos de Alegra estaban quemados en el
-- código (ALEGRA_CARTERA_DATA), actualizados a mano por Claude cada vez que
-- Carlos pedía "actualiza mi cartera". Esta migración mueve el estado del
-- tablero a una tabla compartida (visible para todo el equipo, no solo en el
-- navegador de quien lo usó) y agrega lo necesario para el envío de cobro
-- por correo/WhatsApp con recordatorio de seguimiento.

CREATE TABLE IF NOT EXISTS cartera_gestion (
  cliente_alegra_id         VARCHAR(20)   NOT NULL,
  cliente_nombre            VARCHAR(255)  NOT NULL,
  estado                    VARCHAR(30)   NOT NULL DEFAULT 'por-contactar',
  responsable_id            VARCHAR(10)   NULL,
  notas                     TEXT          NULL,
  fecha_acuerdo             DATE          NULL,
  monto_acuerdo             DECIMAL(14,2) NULL,
  plantilla_nivel           VARCHAR(20)   NULL COMMENT 'cordial | firme | prejuridico — última plantilla usada',
  fecha_ultimo_contacto     DATE          NULL,
  fecha_proximo_seguimiento DATE          NULL COMMENT 'dispara el recordatorio del cron cuando ya pasó y estado != pagado',
  creado_en                 DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por           VARCHAR(10)   NULL,
  PRIMARY KEY (cliente_alegra_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Celular del cliente, para el enlace de WhatsApp (wa.me). Igual que email,
-- es editable y opcional — muchos contactos de Alegra no lo tienen cargado.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS celular VARCHAR(20) NULL AFTER email;

-- Días estándar por defecto para la próxima fecha de seguimiento al
-- registrar una gestión de cobro (editable en Configuración; el valor real
-- de cada caso se guarda por cliente en cartera_gestion.fecha_proximo_seguimiento,
-- este solo es el valor sugerido/prellenado).
INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('cartera_dias_recordatorio', '7');
