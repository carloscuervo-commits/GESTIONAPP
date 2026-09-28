-- Diagnóstico antes de reintentar la migración 047.
-- No modifica nada — solo lectura.

-- 1. ¿La migración anterior alcanzó a dejar algo a medias?
SHOW COLUMNS FROM usuarios LIKE 'perfil';
SHOW COLUMNS FROM clientes LIKE 'contrato_tipo';
SHOW COLUMNS FROM clientes LIKE 'tecnico_inhouse_id';
SHOW TABLES LIKE 'reporte_diario%';

-- 2. Colación real de las columnas que se van a enlazar con FK
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('usuarios', 'clientes')
  AND COLUMN_NAME = 'id';
