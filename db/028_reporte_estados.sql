-- Migración 028: redefinición de estados del reporte
-- Ejecutar en phpMyAdmin antes del deploy.

-- 1. Renombrar en_visita → activo
UPDATE reportes SET estado = 'activo' WHERE estado = 'en_visita';

-- 2. Borradores sin checkout → activo (visita que quedó incompleta)
UPDATE reportes SET estado = 'activo' WHERE estado = 'borrador' AND check_out IS NULL;

-- 3. Borradores con checkout y sin_reporte = 1 → sin_reporte
UPDATE reportes SET estado = 'sin_reporte' WHERE estado = 'borrador' AND sin_reporte = 1;

-- 4. Borradores con checkout y sin_reporte = 0 → enviado (visita completada, estado definitivo)
UPDATE reportes SET estado = 'enviado' WHERE estado = 'borrador' AND check_out IS NOT NULL AND sin_reporte = 0;

-- 5. Eliminar columnas sin_reporte y sin_reporte_at (el estado ya las reemplaza)
ALTER TABLE reportes
  DROP COLUMN sin_reporte,
  DROP COLUMN sin_reporte_at;

-- 6. Agregar reporte_interno a tareas
ALTER TABLE tareas
  ADD COLUMN reporte_interno TINYINT(1) NOT NULL DEFAULT 0 AFTER avisar_cliente;
