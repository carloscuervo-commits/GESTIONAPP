-- ============================================================
-- Migración 047: Técnicos in-house (reporte diario) + contrato
-- de tiempo completo en clientes.
-- Ejecutar en phpMyAdmin antes del deploy correspondiente.
--
-- CORREGIDA 2026-09-28: la primera versión falló con
-- #1005 / Error 150 "Foreign key constraint is incorrectly formed"
-- porque tecnico_inhouse_id no declaraba colación explícita y
-- heredaba la de clientes (utf8mb4_unicode_ci), distinta a la de
-- usuarios.id (utf8mb4_general_ci). Confirmado en phpMyAdmin
-- (pestaña Estructura): usuarios.id = utf8mb4_general_ci,
-- clientes.id = utf8mb4_unicode_ci. Esta versión declara cada
-- columna nueva con el cotejamiento exacto de la tabla que
-- referencia por FK.
--
-- Si ya ejecutaste la versión anterior: el paso 1 (usuarios.perfil)
-- se aplicó bien y es idempotente, no pasa nada si se repite. Los
-- pasos 2, 3 y 4 nunca llegaron a aplicarse (el ALTER de clientes
-- falló completo y detuvo el lote), así que no hay nada que
-- deshacer: solo corre este archivo completo de nuevo.
-- ============================================================

-- 1. Nuevo perfil de usuario: 'tecnico_inhouse'. Entra a Ginno por una
--    página propia (reporte-diario.html) — no ve el tablero de tareas.
ALTER TABLE usuarios
  MODIFY COLUMN perfil ENUM('admin','tecnico','tecnico_inhouse') NOT NULL DEFAULT 'tecnico';

-- 2. Contrato de tiempo completo en clientes: independiente del contrato
--    de bolsa de horas que ya existe (contrato_area/contrato_horas_mes).
--    tecnico_inhouse_id es UNIQUE: un técnico in-house solo puede estar
--    asignado a un cliente a la vez.
--    COLLATE utf8mb4_general_ci explícito: debe coincidir con usuarios.id.
ALTER TABLE clientes
  ADD COLUMN contrato_tipo ENUM('ninguno','tiempo_completo') NOT NULL DEFAULT 'ninguno' AFTER contrato_area,
  ADD COLUMN tecnico_inhouse_id VARCHAR(10) COLLATE utf8mb4_general_ci NULL AFTER contrato_tipo,
  ADD CONSTRAINT fk_cliente_tecnico_inhouse FOREIGN KEY (tecnico_inhouse_id)
    REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD UNIQUE KEY uq_cliente_tecnico_inhouse (tecnico_inhouse_id);

-- 3. Reporte diario — una fila por técnico in-house/día.
--    cliente_id lleva COLLATE utf8mb4_unicode_ci explícito porque debe
--    coincidir con clientes.id (la tabla en sí usa utf8mb4_general_ci
--    por defecto, igual que tecnico_id, que sí coincide con usuarios.id).
CREATE TABLE IF NOT EXISTS reporte_diario (
  id             CHAR(32)     NOT NULL PRIMARY KEY,
  tecnico_id     VARCHAR(10)  NOT NULL,
  cliente_id     CHAR(32)     COLLATE utf8mb4_unicode_ci NOT NULL,   -- copiado al crear el reporte (no cambia si el técnico se reasigna después)
  fecha          DATE         NOT NULL,
  hora_inicio    TIME         NULL,
  hora_fin       TIME         NULL,
  cerrado        TINYINT(1)   NOT NULL DEFAULT 0,   -- 1 = ya no editable (se marcó hora de fin); un admin lo reabre
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rd_tecnico_fecha (tecnico_id, fecha),
  CONSTRAINT fk_rd_tecnico FOREIGN KEY (tecnico_id) REFERENCES usuarios(id),
  CONSTRAINT fk_rd_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  INDEX idx_rd_cliente_fecha (cliente_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. Actividades del día. hora_inicio/hora_fin NULL = actividad general,
--    sin franja horaria propia.
CREATE TABLE IF NOT EXISTS reporte_diario_actividad (
  id                 CHAR(32) NOT NULL PRIMARY KEY,
  reporte_diario_id  CHAR(32) NOT NULL,
  descripcion        TEXT     NOT NULL,
  hora_inicio        TIME     NULL,
  hora_fin           TIME     NULL,
  orden              INT      NOT NULL DEFAULT 0,
  creado_en          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rda_reporte FOREIGN KEY (reporte_diario_id)
    REFERENCES reporte_diario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Nota de colación: usuarios usa utf8mb4_general_ci; clientes usa
-- utf8mb4_unicode_ci (confirmado en phpMyAdmin, pestaña Estructura).
-- Cada columna nueva que referencia una de estas dos tablas por FK
-- arriba lleva el COLLATE explícito que le corresponde según a cuál
-- de las dos apunta. reporte_diario.php ya usa COLLATE utf8mb4_general_ci
-- explícito en los JOIN hacia usuarios, igual que hace bitacora.php; el
-- JOIN hacia clientes ya no necesita forzar colación porque cliente_id
-- ahora coincide de forma nativa con clientes.id.
