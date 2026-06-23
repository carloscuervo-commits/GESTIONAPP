-- Migración: agrega columna dias_programacion a la tabla tareas
-- Permite programar tarjetas IT/IF en un rango de días hábiles.
-- Valor 1 = un solo día (comportamiento anterior, por defecto).
-- Ejecutar UNA sola vez en producción antes de hacer el deploy de estos cambios.

ALTER TABLE tareas
  ADD COLUMN dias_programacion TINYINT UNSIGNED NOT NULL DEFAULT 1
  AFTER fecha_programacion;
