-- Checkbox por cliente: si se debe avisar a admins cuando se acerca el fin
-- del ciclo de contrato y aún quedan horas sin consumir. Activado por defecto;
-- se desactiva manualmente en clientes cuyo contrato es "solo por daños"
-- (no se espera que consuman todas las horas cada mes).
ALTER TABLE clientes
  ADD COLUMN alertar_fin_mes_contrato TINYINT(1) NOT NULL DEFAULT 1 AFTER fecha_corte_contrato;

INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('aviso_contrato_pendiente',       '1'),
  ('aviso_contrato_pendiente_tg',    '1'),
  ('contrato_pendiente_dias_umbral', '10');
