-- Migración 030: registrar confirmación de envío del PDF por WhatsApp
-- El ciclo de la visita no se considera completo hasta que el PDF fue
-- efectivamente enviado (por correo o por WhatsApp), no solo generado.
-- Para correo ya existen enviado_a/enviado_en. Para WhatsApp no hay
-- destinatario capturable (se comparte vía hoja nativa del sistema
-- operativo, el técnico elige el contacto a mano), así que solo se
-- guarda la fecha/hora de confirmación de envío.

ALTER TABLE reportes
  ADD COLUMN whatsapp_enviado_en DATETIME NULL AFTER enviado_en;
