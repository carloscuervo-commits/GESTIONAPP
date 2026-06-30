-- Migración 017: tabla bitacora_usuario
-- Una fila por (técnico, día hábil). El cron la popula cada noche con el día anterior.
-- estado:
--   ok               → horas_real >= horas_esp
--   deficit_sin_nota → horas_real <  horas_esp, sin justificación del admin
--   deficit_con_nota → horas_real <  horas_esp, admin escribió una nota
CREATE TABLE IF NOT EXISTS bitacora_usuario (
  id          CHAR(32)     NOT NULL PRIMARY KEY,
  tecnico_id  VARCHAR(20)  NOT NULL,
  fecha       DATE         NOT NULL,
  horas_real  DECIMAL(5,2) NOT NULL DEFAULT 0,
  horas_esp   DECIMAL(4,2) NOT NULL,
  estado      ENUM('ok','deficit_sin_nota','deficit_con_nota') NOT NULL DEFAULT 'ok',
  nota        TEXT         NULL,
  admin_id    VARCHAR(20)  NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tecnico_fecha (tecnico_id, fecha),
  INDEX idx_estado (estado),
  INDEX idx_tecnico (tecnico_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
