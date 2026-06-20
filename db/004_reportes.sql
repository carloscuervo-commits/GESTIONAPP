-- ============================================================
-- Migración 004: Reportes de visita (check-in/check-out + plantillas)
-- ============================================================

-- Reportes de visita técnica, asociados a una tarea IT/IF.
-- "datos" guarda en JSON los campos propios de la plantilla elegida
-- (descripción de acciones, materiales, pendientes, etc.), de forma
-- que agregar plantillas nuevas en el futuro no requiere cambios de esquema.
CREATE TABLE IF NOT EXISTS reportes (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  tarea_id              CHAR(36)     NOT NULL,
  plantilla             VARCHAR(50)  NULL,                 -- ej. 'evento'; se asigna al finalizar la visita
  estado                ENUM('en_visita','borrador','enviado') NOT NULL DEFAULT 'en_visita',

  -- Check-in / Check-out (tecnico_*_id queda listo para poblarse desde
  -- el usuario autenticado cuando se implemente el login; por ahora se
  -- captura preguntando en el momento, ver botones en la tarjeta).
  tecnico_checkin_id    VARCHAR(10)  NULL,
  check_in              DATETIME     NULL,
  tecnico_checkout_id   VARCHAR(10)  NULL,
  check_out             DATETIME     NULL,

  datos                 TEXT         NULL                 COMMENT 'JSON: campos propios de la plantilla (descripción, materiales, pendientes, etc.)',
  pdf_archivo           VARCHAR(255) NULL,
  enviado_a             TEXT         NULL,
  enviado_en            DATETIME     NULL,

  creado_en             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_reportes_tarea FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE,
  CONSTRAINT fk_reportes_tec_in  FOREIGN KEY (tecnico_checkin_id)  REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_reportes_tec_out FOREIGN KEY (tecnico_checkout_id) REFERENCES usuarios(id) ON DELETE SET NULL,

  INDEX idx_tarea (tarea_id),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fotos asociadas a una sección de la plantilla del reporte (ej. 'fotos_inicial', 'fotos_final')
CREATE TABLE IF NOT EXISTS reporte_fotos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  reporte_id  CHAR(36)     NOT NULL,
  seccion_id  VARCHAR(50)  NOT NULL,
  archivo     VARCHAR(255) NOT NULL,
  orden       INT          NOT NULL DEFAULT 0,
  creado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_reporte_fotos_reporte FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE CASCADE,
  INDEX idx_reporte_seccion (reporte_id, seccion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
