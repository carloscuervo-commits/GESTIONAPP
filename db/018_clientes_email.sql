-- Migración 018: email en clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL AFTER nombre;
