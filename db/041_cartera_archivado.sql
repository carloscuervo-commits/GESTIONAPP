-- 041_cartera_archivado.sql
-- Archivado de cartera: cuando un cliente deja de tener facturas vencidas en
-- Alegra (pagó), se archiva su gestión en vez de borrarla, para que la
-- pestaña "💰 Cartera" solo muestre lo vigente pero el histórico quede.

ALTER TABLE cartera_gestion
  ADD COLUMN IF NOT EXISTS archivado        TINYINT(1)    NOT NULL DEFAULT 0 AFTER estado,
  ADD COLUMN IF NOT EXISTS archivado_en     DATETIME      NULL     AFTER archivado,
  ADD COLUMN IF NOT EXISTS ultimo_total_deuda DECIMAL(14,2) NULL   AFTER archivado_en;
