-- ============================================================
-- Migración: columna horas_contrato en visita_participantes
-- Ejecutar en phpMyAdmin antes del deploy correspondiente.
-- ============================================================

ALTER TABLE visita_participantes
  ADD COLUMN horas_contrato DECIMAL(5,2) NULL AFTER check_out;
