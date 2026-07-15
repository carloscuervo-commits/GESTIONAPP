-- Migración 027: visitas sin reporte
-- Agrega campos para marcar reportes de visita que finalizaron sin documentar.
-- Ejecutar en phpMyAdmin antes del deploy.

ALTER TABLE reportes
  ADD COLUMN sin_reporte    TINYINT(1)  NOT NULL DEFAULT 0   AFTER estado,
  ADD COLUMN sin_reporte_at DATETIME    NULL                  AFTER sin_reporte;
