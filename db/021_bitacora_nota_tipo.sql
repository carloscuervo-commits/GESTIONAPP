-- Migración 021: campo nota_tipo en bitacora_usuario
-- Guarda la categoría de justificación separada del texto libre.
-- Ejecutar en phpMyAdmin antes del deploy correspondiente.

ALTER TABLE bitacora_usuario
  ADD COLUMN nota_tipo VARCHAR(50) NULL AFTER estado;
