-- Migración 019: cédula y foto en usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cedula VARCHAR(20) NULL AFTER email,
  ADD COLUMN IF NOT EXISTS foto   VARCHAR(255) NULL AFTER cedula;
