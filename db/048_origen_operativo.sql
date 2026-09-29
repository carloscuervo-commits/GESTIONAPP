-- ============================================================
-- Migración 048: enlace de vuelta desde una tarjeta comercial
-- auto-generada hacia la tarjeta operativa (IT/IF) que la originó.
--
-- Ya existía comercial_tarea_id en tareas (IT/IF -> comercial), pero no
-- había nada en sentido contrario: al abrir la tarjeta comercial no había
-- forma de volver a la tarjeta operativa que la generó. Estas dos columnas
-- guardan ese enlace inverso, solo en la tarjeta comercial hija.
--
-- Autorreferencia dentro de la misma tabla tareas (mismo tipo/colación que
-- tareas.id), sin FK: se sigue el mismo criterio que ya usan admin_tarea_id
-- y comercial_tarea_id (enlaces informales, sin integridad referencial
-- forzada en la BD).
-- Ejecutar en phpMyAdmin antes del deploy correspondiente.
-- ============================================================

ALTER TABLE tareas
  ADD COLUMN origen_operativo_id   CHAR(36)    NULL COMMENT 'Si esta tarjeta comercial fue auto-generada desde una tarjeta IT/IF, apunta a esa tarjeta origen.',
  ADD COLUMN origen_operativo_area VARCHAR(10) NULL COMMENT 'Área (it/if) de la tarjeta origen, para poder cambiar de pestaña antes de abrirla.';
