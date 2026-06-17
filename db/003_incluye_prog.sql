-- Migración 003: campo incluye_prog en tareas
-- Permite que tarjetas del área Administrativo aparezcan
-- en la programación técnica diaria (sección separada al final).
ALTER TABLE tareas
  ADD COLUMN incluye_prog TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Si es 1, la tarea Admin aparece en la programación técnica';
