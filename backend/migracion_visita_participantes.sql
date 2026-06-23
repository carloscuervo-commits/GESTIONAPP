-- ============================================================
-- Migración: soporte multi-técnico por visita
-- Ejecutar en phpMyAdmin antes del deploy correspondiente.
-- ============================================================

-- 1. Nueva tabla: un registro por técnico por visita
CREATE TABLE visita_participantes (
  id          VARCHAR(32)  NOT NULL,
  reporte_id  VARCHAR(32)  NOT NULL,
  tecnico_id  VARCHAR(32)  NULL,
  check_in    DATETIME     NOT NULL,
  check_out   DATETIME     NULL,
  PRIMARY KEY (id),
  INDEX idx_reporte_id (reporte_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Migrar participantes desde los registros de reportes ya existentes
--    (cada reporte con check_in se convierte en su primer participante)
INSERT INTO visita_participantes (id, reporte_id, tecnico_id, check_in, check_out)
SELECT
  LOWER(REPLACE(UUID(), '-', '')),
  id,
  NULLIF(tecnico_checkin_id, ''),
  check_in,
  check_out
FROM reportes
WHERE check_in IS NOT NULL;
