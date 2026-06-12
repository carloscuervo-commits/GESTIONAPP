-- Migración: nuevos campos para "labor administrativa" y "solicitud comercial"
-- Ejecutar en la base de datos de GESTIONAPP antes (o al momento) de desplegar
-- los cambios de tareas.php / tareas-equipo.html relacionados.

ALTER TABLE tareas
  ADD COLUMN solicitud_admin TEXT NULL,
  ADD COLUMN solicitud_comercial TEXT NULL,
  ADD COLUMN admin_tarea_id VARCHAR(64) NULL,
  ADD COLUMN comercial_tarea_id VARCHAR(64) NULL;
