-- Migración 013: tabla de transportes por pagar a técnicos
-- Registra un transporte por cada check-in en visita_participantes para tarjetas
-- IT/IF en sitio cuyo cliente tenga valor_transporte > 0.
-- Se genera al facturar o archivar la tarea.
CREATE TABLE IF NOT EXISTS transportes (
  id               CHAR(32)      NOT NULL PRIMARY KEY,
  tarea_id         CHAR(32)      NOT NULL,
  participante_id  INT           NOT NULL,
  tecnico_id       INT           NOT NULL,
  cliente          VARCHAR(255)  NOT NULL,
  tarea_titulo     VARCHAR(255)  NOT NULL DEFAULT '',
  fecha            DATE          NOT NULL,
  check_in         DATETIME      NOT NULL,
  check_out        DATETIME      NULL,
  valor            DECIMAL(10,0) NOT NULL,
  estado           ENUM('pendiente','pagado','no_aprobado') NOT NULL DEFAULT 'pendiente',
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_participante (participante_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
