-- 042_cartera_etapas.sql
-- Rediseño del tablero de Cartera: ahora hay una columna por etapa de
-- escalamiento (en vez de "Llamado"/"Correo enviado" genéricos), y la
-- tarjeta avanza sola a la etapa correspondiente al enviar el mensaje de
-- esa etapa:
--   por-contactar -> etapa1 -> etapa2 -> etapa3 -> acuerdo -> pagado
-- Este script remapea los estados existentes:
--   'correo'  + plantilla_nivel='firme'       -> 'etapa2'
--   'correo'  + plantilla_nivel='prejuridico' -> 'etapa3'
--   'correo'  (cualquier otro caso, incl. sin nivel) -> 'etapa1'
--   'llamado' -> 'etapa2'  (Etapa 2 es justamente WhatsApp/llamada)

UPDATE cartera_gestion
SET estado = CASE
  WHEN estado = 'correo' AND plantilla_nivel = 'firme'       THEN 'etapa2'
  WHEN estado = 'correo' AND plantilla_nivel = 'prejuridico' THEN 'etapa3'
  WHEN estado = 'correo'                                     THEN 'etapa1'
  WHEN estado = 'llamado'                                    THEN 'etapa2'
  ELSE estado
END
WHERE estado IN ('correo', 'llamado');
