-- 038_proyecto_visitas.sql
-- Visitas programadas puntuales para tarjetas tipo Proyecto: qué técnico(s)
-- deben estar en el proyecto un día específico y a qué hora. No reemplaza ni
-- toca `tareas.team` (que sigue vacío/oculto para proyecto) ni `hora_programacion`
-- (que sigue siendo la "hora de alarma" administrativa) — es un dato aparte,
-- pensado para "Copiar programación" (mostrar técnico/hora real de ese día en
-- vez de "Sin asignar") y para la alarma de técnico tardío.
--
-- tecnico_id = 'NINGUNO' es un marcador: "se preguntó por este proyecto+fecha
-- y el admin decidió dejarlo sin asignar" — evita que se vuelva a preguntar
-- cada vez que se copie la programación de esa misma fecha.

CREATE TABLE IF NOT EXISTS proyecto_visitas_programadas (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  tarea_id   CHAR(36)    NOT NULL,
  fecha      DATE        NOT NULL,
  tecnico_id VARCHAR(10) NOT NULL,
  hora       TIME        NULL,
  creado_en  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tarea_fecha (tarea_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
