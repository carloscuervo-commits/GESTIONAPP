-- Migración: hora de programación + flag de alerta de retraso en tareas
-- Ejecutar en la BD de producción antes de desplegar los cambios relacionados.

ALTER TABLE tareas
  ADD COLUMN hora_programacion VARCHAR(5) NOT NULL DEFAULT '08:00' AFTER fecha_programacion,
  ADD COLUMN alerta_retraso_enviada TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER hora_programacion;
