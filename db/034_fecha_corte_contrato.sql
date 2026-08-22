-- Fecha de corte del contrato: día del mes (1-31) desde el que se cuenta el
-- ciclo de horas contratadas. Si es NULL, se asume corte = 1 (mes calendario,
-- comportamiento equivalente al que ya existía antes de este campo).
ALTER TABLE clientes
  ADD COLUMN fecha_corte_contrato TINYINT UNSIGNED NULL AFTER contrato_horas_mes;
