-- Migración 020: aviso al cliente por correo
ALTER TABLE tareas
  ADD COLUMN IF NOT EXISTS avisar_cliente TINYINT(1) NOT NULL DEFAULT 1 AFTER tipo_tarea;
