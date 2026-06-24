-- Migración: módulo clientes + geofencing de check-in/checkout
-- Ejecutar en phpMyAdmin antes del deploy correspondiente
-- Fecha: 2026-06-24

-- 1. Tabla clientes
CREATE TABLE clientes (
  id VARCHAR(32) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  direccion TEXT NULL,
  lat DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  radio_metros INT NOT NULL DEFAULT 200,
  plazo_factura_dias INT NOT NULL DEFAULT 8,
  alegra_id VARCHAR(50) NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Coordenadas del técnico en visita_participantes
ALTER TABLE visita_participantes
  ADD COLUMN checkin_lat  DECIMAL(10,7) NULL AFTER check_in,
  ADD COLUMN checkin_lng  DECIMAL(10,7) NULL AFTER checkin_lat,
  ADD COLUMN checkout_lat DECIMAL(10,7) NULL AFTER check_out,
  ADD COLUMN checkout_lng DECIMAL(10,7) NULL AFTER checkout_lat;

-- 3. Log de intentos fuera de sitio (aceptados y cancelados)
CREATE TABLE checkin_fuera_sitio (
  id VARCHAR(32) NOT NULL,
  tarea_id VARCHAR(32) NOT NULL,
  tecnico_id VARCHAR(32) NOT NULL,
  tipo ENUM('checkin','checkout') NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  distancia_metros INT NOT NULL,
  radio_metros INT NOT NULL,
  accion ENUM('aceptado','cancelado') NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tarea (tarea_id),
  INDEX idx_tecnico (tecnico_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
