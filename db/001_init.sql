-- ============================================================
-- Innovate - Tablero de Tareas
-- Migración 001: estructura inicial
-- ============================================================

-- Usuarios / equipo
CREATE TABLE IF NOT EXISTS usuarios (
  id          VARCHAR(10)  NOT NULL PRIMARY KEY,   -- ej: 'CAC', 'AZ', 'JG'
  nombre      VARCHAR(100) NOT NULL,
  iniciales   VARCHAR(5)   NOT NULL,
  color       VARCHAR(10)  NOT NULL DEFAULT '#94a3b8',
  rol         VARCHAR(50)  NULL,                   -- ej: 'Gerente'
  email       VARCHAR(150) NULL,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tareas (tablero principal)
CREATE TABLE IF NOT EXISTS tareas (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,  -- uid generado en frontend
  titulo              VARCHAR(200) NOT NULL,
  descripcion         TEXT         NULL,
  area                ENUM('it','if','admin','comercial') NOT NULL,
  estado              VARCHAR(30)  NOT NULL,              -- pendientes, en-ejecucion, por-facturar, facturado, por-cotizar, enviada, aprobada, rechazada, archivado, etc.
  cliente             VARCHAR(150) NULL,

  -- Campos IT/IF (no aplican a comercial)
  fecha_programacion  DATE         NULL,
  fecha_limite        DATE         NULL,
  tiempo_estimado     VARCHAR(50)  NULL,
  tiempo_real         VARCHAR(50)  NULL,
  recursos            TEXT         NULL,

  -- Resultado / facturación
  notas               TEXT         NULL,
  reporte             TEXT         NULL,
  factura             VARCHAR(100) NULL,

  -- Trazabilidad
  creado_por          VARCHAR(10)  NULL,
  creado_en           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  realizado_en        DATETIME     NULL,   -- usado para alerta de facturación (IT/IF)
  enviada_en          DATETIME     NULL,   -- usado para alerta "por confirmar" (comercial)
  programado_en       DATETIME     NULL,   -- fecha en que la tarea pasó a "En ejecución" (IT/IF), usado para contador de días en ejecución
  reporte_archivo     VARCHAR(255) NULL,   -- nombre original del archivo adjunto al reporte del servicio (IT/IF)

  CONSTRAINT fk_tareas_creador FOREIGN KEY (creado_por) REFERENCES usuarios(id)
    ON DELETE SET NULL,

  INDEX idx_area_estado (area, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Relación tarea <-> integrantes asignados (N:M)
CREATE TABLE IF NOT EXISTS tarea_equipo (
  tarea_id   CHAR(36)    NOT NULL,
  usuario_id VARCHAR(10) NOT NULL,
  PRIMARY KEY (tarea_id, usuario_id),
  CONSTRAINT fk_te_tarea   FOREIGN KEY (tarea_id)   REFERENCES tareas(id)   ON DELETE CASCADE,
  CONSTRAINT fk_te_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historial de cambios de estado (opcional pero útil para auditoría/alertas)
CREATE TABLE IF NOT EXISTS tarea_historial (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tarea_id    CHAR(36)    NOT NULL,
  estado_ant  VARCHAR(30) NULL,
  estado_nuevo VARCHAR(30) NOT NULL,
  usuario_id  VARCHAR(10) NULL,
  fecha       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_th_tarea FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Datos iniciales del equipo (ajustar/ampliar según TEAM en el frontend)
INSERT INTO usuarios (id, nombre, iniciales, color, rol) VALUES
  ('CAC', 'Carlos Andrés Cuervo', 'CAC', '#7c3aed', 'Gerente'),
  ('AZ',  'Alejandro Zuñiga',     'AZ',  '#0891b2', NULL),
  ('JG',  'Jorge Guerrero',       'JG',  '#059669', NULL)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
