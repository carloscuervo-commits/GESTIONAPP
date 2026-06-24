-- Migración: gestión de checks fuera de sitio por admin
-- Ejecutar en phpMyAdmin antes del deploy correspondiente
-- Fecha: 2026-06-24

ALTER TABLE checkin_fuera_sitio
  ADD COLUMN revisado      TINYINT(1)   NOT NULL DEFAULT 0         AFTER accion,
  ADD COLUMN revisado_por  VARCHAR(32)  NULL                       AFTER revisado,
  ADD COLUMN revisado_en   DATETIME     NULL                       AFTER revisado_por,
  ADD COLUMN observacion   TEXT         NULL                       AFTER revisado_en,
  ADD INDEX  idx_revisado (revisado);
