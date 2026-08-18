-- Checkout automático de cierre de jornada (6:30pm días laborales)
-- Ver DEPLOY.md para el detalle funcional completo.

ALTER TABLE visita_participantes
  ADD COLUMN checkout_automatico TINYINT(1) NOT NULL DEFAULT 0 AFTER check_out;

ALTER TABLE reportes
  ADD COLUMN cerrado_automatico TINYINT(1) NOT NULL DEFAULT 0 AFTER estado;

INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('checkout_auto_hora',     '18:30'),
  ('aviso_checkout_auto',    '1'),
  ('aviso_checkout_auto_tg', '1');
