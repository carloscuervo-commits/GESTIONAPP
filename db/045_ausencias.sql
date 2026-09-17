-- ============================================================
-- Migración 045: Módulo de vacaciones, permisos y faltas
-- ============================================================

-- Datos de contrato en la ficha técnico, usados para el control anual
-- de vacaciones (fecha de inicio informativa; la cuota es manual).
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS fecha_inicio_contrato DATE          NULL AFTER cedula,
  ADD COLUMN IF NOT EXISTS dias_vacaciones_anual  DECIMAL(5,2) NULL AFTER fecha_inicio_contrato
    COMMENT 'Cuota de días de vacaciones que le corresponden al año, asignada manualmente por el admin';

-- Registro de ausencias (vacaciones / permisos / incapacidades / faltas).
-- Cada fila es un período. "dias" se calcula al crear el registro pero
-- siempre queda editable a mano (ej: para ajustar por un festivo).
CREATE TABLE IF NOT EXISTS ausencias (
  id              INT           NOT NULL AUTO_INCREMENT,
  usuario_id      VARCHAR(10)   NOT NULL,
  tipo            ENUM('vacaciones','permiso_remunerado','permiso_no_remunerado','incapacidad','falta','otro') NOT NULL,
  fecha_inicio    DATE          NOT NULL,
  fecha_fin       DATE          NOT NULL,
  dias            DECIMAL(4,1)  NOT NULL,
  nota            TEXT          NULL,

  -- Gestión: cada tipo tiene un trámite distinto (descuento en nómina,
  -- reclamo ante la EPS, aprobación de gerencia, carta firmada de
  -- vacaciones...) — se registra libremente en nota_gestion y al
  -- guardarla la ausencia queda archivada. No afecta el cálculo del
  -- saldo de vacaciones, que cuenta el período esté o no gestionado.
  estado          ENUM('pendiente','gestionado') NOT NULL DEFAULT 'pendiente',
  nota_gestion    TEXT          NULL,
  gestionado_por  VARCHAR(10)   NULL,
  gestionado_en   DATETIME      NULL,

  creado_por      VARCHAR(10)   NULL,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_ausencias_usuario (usuario_id, tipo),
  INDEX idx_ausencias_estado (estado),
  INDEX idx_ausencias_fecha (fecha_inicio),

  CONSTRAINT fk_ausencias_usuario   FOREIGN KEY (usuario_id)     REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_ausencias_creador   FOREIGN KEY (creado_por)     REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_ausencias_gestor    FOREIGN KEY (gestionado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
