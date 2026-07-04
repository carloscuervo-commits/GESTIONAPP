-- Registro de avisos ya enviados para evitar duplicados en crons
CREATE TABLE IF NOT EXISTS avisos_enviados (
  id         CHAR(32)    NOT NULL,
  tipo       VARCHAR(40) NOT NULL,
  tecnico_id VARCHAR(10) NOT NULL,
  tarea_id   VARCHAR(36) NOT NULL,
  fecha      DATE        NOT NULL,
  enviado_en DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_aviso (tipo, tecnico_id, tarea_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
