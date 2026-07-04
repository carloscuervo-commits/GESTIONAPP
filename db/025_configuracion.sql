-- Tabla de configuración general del sistema (clave → valor)
CREATE TABLE IF NOT EXISTS configuracion (
  clave      VARCHAR(60)  NOT NULL,
  valor      TEXT         NULL,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Valores iniciales: todos desactivados
INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('aviso_asignacion_tarea',    '0'),
  ('aviso_cambio_programacion', '0'),
  ('aviso_cambio_descripcion',  '0'),
  ('aviso_dia_anterior',        '0'),
  ('aviso_30min_antes',         '0'),
  ('aviso_10min_sin_checkin',   '0');
