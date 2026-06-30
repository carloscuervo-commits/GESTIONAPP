-- Migración 016: columnas de horario contratado directamente en usuarios
-- NULL en un día = no trabaja ese día
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS h_lun        DECIMAL(4,2) NULL AFTER color,
  ADD COLUMN IF NOT EXISTS h_mar        DECIMAL(4,2) NULL AFTER h_lun,
  ADD COLUMN IF NOT EXISTS h_mie        DECIMAL(4,2) NULL AFTER h_mar,
  ADD COLUMN IF NOT EXISTS h_jue        DECIMAL(4,2) NULL AFTER h_mie,
  ADD COLUMN IF NOT EXISTS h_vie        DECIMAL(4,2) NULL AFTER h_jue,
  ADD COLUMN IF NOT EXISTS h_sab        DECIMAL(4,2) NULL AFTER h_vie,
  ADD COLUMN IF NOT EXISTS h_dom        DECIMAL(4,2) NULL AFTER h_sab,
  ADD COLUMN IF NOT EXISTS horario_desde DATE         NULL AFTER h_dom;
