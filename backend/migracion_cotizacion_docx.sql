-- Migración: campo para guardar el nombre del archivo de cotización (.docx)
-- adjuntado en tareas de Comercial, usado luego para generar la factura
-- en Alegra desde la tarea de IT/IF.
-- Ejecutar en la base de datos de GESTIONAPP antes (o al momento) de
-- desplegar los cambios de tareas.php / cotizacion_docx.php / tareas-equipo.html.

ALTER TABLE tareas
  ADD COLUMN cotizacion_docx VARCHAR(255) NULL;
