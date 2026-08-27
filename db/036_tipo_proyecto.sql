-- Migración 036: tarjetas tipo "Proyecto"
-- Fecha: 2026-08-27
-- Ejecutar en phpMyAdmin antes del deploy.
--
-- Nota: tareas.tipo_tarea ya incluye el valor 'proyecto' desde la migración
-- 009 (ENUM('evento','proyecto','contrato')), así que no se requiere ALTER
-- sobre esa tabla. El campo tareas.hora_programacion se reutiliza como "hora
-- de alarma" cuando tipo_tarea = 'proyecto' (solo cambia su interpretación
-- en el frontend, no el esquema).
--
-- La deduplicación de los dos avisos nuevos (sin visita del día / plazo por
-- vencer) reutiliza la tabla avisos_enviados (migración 026), igual que
-- aviso_contrato_pendiente — no se necesitan columnas de control adicionales
-- en tareas.

-- 1. % de avance del proyecto, indicado por el técnico en cada cierre de visita.
ALTER TABLE reportes
  ADD COLUMN avance_proyecto_pct TINYINT UNSIGNED NULL COMMENT '0-100, solo tareas tipo proyecto' AFTER datos;

-- 2. Config de los dos avisos nuevos + umbral de días hábiles del aviso de plazo.
INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('aviso_proyecto_sin_visita',      '1'),
  ('aviso_proyecto_sin_visita_tg',   '1'),
  ('aviso_proyecto_plazo',           '1'),
  ('aviso_proyecto_plazo_tg',        '1'),
  ('proyecto_plazo_dias_umbral',     '2');
