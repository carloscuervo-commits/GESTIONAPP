-- ============================================================
-- Migración 046: Tabla de festivos colombianos
-- ============================================================
-- Usada por el cálculo de días de vacaciones y permiso no remunerado
-- (backend/api/ausencias.php) y disponible para cualquier otra función
-- de Ginno que necesite saber si una fecha es festivo.
--
-- Se cargan 2026-2028 (hoy + ~2 años), calculados con el algoritmo de
-- festivos colombianos (fijos + Ley Emiliani + móviles de Pascua) que
-- vive en backend/lib/festivos.php::festivosColombia(). Si más adelante
-- hace falta cargar un año nuevo, correr desde el servidor:
--   php backend/cron/generar_festivos.php 2029
-- (agrega solo los festivos de ese año, sin duplicar ni tocar los que
-- ya estén — no hay pantalla de administración de festivos todavía).

CREATE TABLE IF NOT EXISTS festivos (
  fecha      DATE         NOT NULL,
  nombre     VARCHAR(150) NULL,
  creado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO festivos (fecha, nombre) VALUES
('2026-01-01','Año Nuevo'),
('2026-01-12','Reyes Magos'),
('2026-03-23','San José'),
('2026-04-02','Jueves Santo'),
('2026-04-03','Viernes Santo'),
('2026-05-01','Día del Trabajo'),
('2026-05-18','Ascensión del Señor'),
('2026-06-08','Corpus Christi'),
('2026-06-15','Sagrado Corazón de Jesús'),
('2026-06-29','San Pedro y San Pablo'),
('2026-07-20','Día de la Independencia'),
('2026-08-07','Batalla de Boyacá'),
('2026-08-17','Asunción de la Virgen'),
('2026-10-12','Día de la Raza'),
('2026-11-02','Todos los Santos'),
('2026-11-16','Independencia de Cartagena'),
('2026-12-08','Inmaculada Concepción'),
('2026-12-25','Navidad'),
('2027-01-01','Año Nuevo'),
('2027-01-11','Reyes Magos'),
('2027-03-22','San José'),
('2027-03-25','Jueves Santo'),
('2027-03-26','Viernes Santo'),
('2027-05-01','Día del Trabajo'),
('2027-05-10','Ascensión del Señor'),
('2027-05-31','Corpus Christi'),
('2027-06-07','Sagrado Corazón de Jesús'),
('2027-07-05','San Pedro y San Pablo'),
('2027-07-20','Día de la Independencia'),
('2027-08-07','Batalla de Boyacá'),
('2027-08-16','Asunción de la Virgen'),
('2027-10-18','Día de la Raza'),
('2027-11-01','Todos los Santos'),
('2027-11-15','Independencia de Cartagena'),
('2027-12-08','Inmaculada Concepción'),
('2027-12-25','Navidad'),
('2028-01-01','Año Nuevo'),
('2028-01-10','Reyes Magos'),
('2028-03-20','San José'),
('2028-04-13','Jueves Santo'),
('2028-04-14','Viernes Santo'),
('2028-05-01','Día del Trabajo'),
('2028-05-29','Ascensión del Señor'),
('2028-06-19','Corpus Christi'),
('2028-06-26','Sagrado Corazón de Jesús'),
('2028-07-03','San Pedro y San Pablo'),
('2028-07-20','Día de la Independencia'),
('2028-08-07','Batalla de Boyacá'),
('2028-08-21','Asunción de la Virgen'),
('2028-10-16','Día de la Raza'),
('2028-11-06','Todos los Santos'),
('2028-11-13','Independencia de Cartagena'),
('2028-12-08','Inmaculada Concepción'),
('2028-12-25','Navidad');
