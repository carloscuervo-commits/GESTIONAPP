-- Migración 024: snapshot de programación por participante
-- Guarda fecha y hora programadas al momento del check-in para que
-- cambios posteriores en la tarea no afecten visitas ya realizadas.

ALTER TABLE visita_participantes
  ADD COLUMN fecha_prog_snap DATE         NULL AFTER transporte_estado,
  ADD COLUMN hora_prog_snap  VARCHAR(5)   NULL AFTER fecha_prog_snap;
