-- Migración 009: tipos de tarea + contratos de horas mensuales
-- Fecha: 2026-06-26
-- Ejecutar en phpMyAdmin antes del deploy.

-- 1. Tipo de tarea en tarjetas operativas IT/IF
ALTER TABLE tareas
  ADD COLUMN tipo_tarea ENUM('evento','proyecto','contrato') NOT NULL DEFAULT 'evento'
  AFTER area;

-- 2. Contrato de horas en clientes
ALTER TABLE clientes
  ADD COLUMN contrato_area       ENUM('it','if') NULL    AFTER plazo_factura_dias,
  ADD COLUMN contrato_horas_mes  DECIMAL(4,1)    NULL    AFTER contrato_area;

-- 3. Horas de contrato descontadas por participante (editables por admin)
--    NULL = no aplica (visita no es de contrato)
ALTER TABLE visita_participantes
  ADD COLUMN horas_contrato DECIMAL(4,1) NULL AFTER check_out;
