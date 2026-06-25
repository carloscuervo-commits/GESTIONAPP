-- Migración: tabla visita_pausas
-- Ejecutar ANTES del deploy que agrega pausa/reanuda en visitas
-- Registra cada período de pausa de un participante durante su visita.
-- pausa_fin NULL = pausa activa en curso.

CREATE TABLE IF NOT EXISTS visita_pausas (
  id              CHAR(36)      NOT NULL,
  participante_id CHAR(36)      NOT NULL,
  pausa_inicio    DATETIME      NOT NULL,
  pausa_fin       DATETIME      NULL,
  justificacion   VARCHAR(500)  NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_part (participante_id),
  CONSTRAINT fk_pausa_part FOREIGN KEY (participante_id)
    REFERENCES visita_participantes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
