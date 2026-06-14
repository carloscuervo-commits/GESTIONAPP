-- Migración: campo para registrar la fecha en que una tarea operativa (IT/IF)
-- pasa a estado "En ejecución" (programado), usado para calcular el contador
-- de "días en ejecución" en las tarjetas.
-- Ejecutar en la base de datos de GESTIONAPP antes (o al momento) de
-- desplegar los cambios de tareas.php / tareas-equipo.html.

ALTER TABLE tareas
  ADD COLUMN programado_en DATETIME NULL AFTER enviada_en;
