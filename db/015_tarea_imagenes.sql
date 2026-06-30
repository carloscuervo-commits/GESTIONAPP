-- Migración 015: imágenes adjuntas a tareas
-- Soporta múltiples imágenes por tarea con orden y nombre original.
-- Archivos físicos: backend/uploads/imagenes/{id}.{ext}
CREATE TABLE IF NOT EXISTS tarea_imagenes (
  id           CHAR(32)     NOT NULL PRIMARY KEY,
  tarea_id     CHAR(32)     NOT NULL,
  nombre_original VARCHAR(255) NOT NULL DEFAULT '',
  ext          VARCHAR(10)  NOT NULL DEFAULT '',
  orden        SMALLINT     NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tarea_imagenes_tarea (tarea_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
