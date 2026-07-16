-- Migración 029: evitar duplicados de reporte activo por tarea
-- La columna generada vale tarea_id cuando estado='activo', NULL en cualquier otro caso.
-- Los índices UNIQUE ignoran NULL → permite múltiples 'enviado'/'sin_reporte' por tarea
-- pero solo UN 'activo' a la vez.

ALTER TABLE reportes
  ADD COLUMN activo_tarea_unico VARCHAR(36)
    GENERATED ALWAYS AS (IF(estado = 'activo', tarea_id, NULL)) VIRTUAL,
  ADD UNIQUE INDEX uk_one_activo_per_tarea (activo_tarea_unico);
