-- ============================================================
-- Migración: razón de archivado sin factura en tarjetas operativas
-- Ejecutar en phpMyAdmin antes del deploy correspondiente.
-- ============================================================
ALTER TABLE tareas
  ADD COLUMN motivo_no_factura VARCHAR(30) NULL AFTER factura;
