-- Migración: campo para adjuntar un archivo (cualquier tipo) al reporte del
-- servicio de tareas operativas (IT/IF), usado por backend/api/reporte_archivo.php.
-- Ejecutar en la base de datos de GESTIONAPP antes (o al momento) de
-- desplegar los cambios de tareas.php / reporte_archivo.php / tareas-equipo.html.

ALTER TABLE tareas
  ADD COLUMN reporte_archivo VARCHAR(255) NULL AFTER programado_en;
