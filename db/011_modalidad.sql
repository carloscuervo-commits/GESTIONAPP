-- Migración 011: modalidad de la visita (en_sitio / remoto)
ALTER TABLE tareas
  ADD COLUMN modalidad ENUM('en_sitio','remoto') NULL AFTER reporte;
