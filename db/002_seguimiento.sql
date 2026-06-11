-- ============================================================
-- Innovate - Tablero de Tareas
-- Migración 002: seguimiento comercial (cotizaciones enviadas)
-- ============================================================

ALTER TABLE tareas
  ADD COLUMN seguimiento_fecha DATE NULL COMMENT 'Próxima fecha de seguimiento (comercial)' AFTER enviada_en,
  ADD COLUMN seguimiento_historial TEXT NULL COMMENT 'JSON: lista de {fecha, nota} de seguimientos realizados' AFTER seguimiento_fecha;
