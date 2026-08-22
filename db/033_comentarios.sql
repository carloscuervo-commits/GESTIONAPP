-- Módulo de comentarios/menciones por tarjeta.
CREATE TABLE IF NOT EXISTS comentarios (
  id         VARCHAR(32)  NOT NULL,
  tarea_id   VARCHAR(32)  NOT NULL,
  usuario_id VARCHAR(10)  NOT NULL,
  texto      TEXT         NOT NULL,
  creado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tarea (tarea_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Preferencia individual de notificación cuando a un usuario lo mencionan
-- en un comentario (@ID). Activadas por defecto para todos.
ALTER TABLE usuarios
  ADD COLUMN notif_menciones_correo TINYINT(1) NOT NULL DEFAULT 1 AFTER celular,
  ADD COLUMN notif_menciones_tg     TINYINT(1) NOT NULL DEFAULT 1 AFTER notif_menciones_correo;
