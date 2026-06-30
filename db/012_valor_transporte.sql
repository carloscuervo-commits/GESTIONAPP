-- Migración 012: valor de transporte por trayecto en clientes
-- Se usa para calcular el pago de transporte a técnicos en visitas en sitio.
ALTER TABLE clientes
  ADD COLUMN valor_transporte DECIMAL(10,0) NULL AFTER contrato_horas_mes;
