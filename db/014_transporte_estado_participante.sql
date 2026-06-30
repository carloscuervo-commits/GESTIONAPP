-- Migración 014: estado de transporte por cada participante de visita
-- NULL  = visita anterior a este sistema (legacy, no procesada)
-- pendiente  = visita ocurrió, aún no se ha registrado ni descartado el transporte
-- registrado = se creó un registro en la tabla transportes para esta visita
-- no_aplica  = no califica: la tarea fue remota o el cliente no tiene valor_transporte
ALTER TABLE visita_participantes
  ADD COLUMN transporte_estado ENUM('pendiente','registrado','no_aplica') NULL DEFAULT NULL
  AFTER check_out;
