-- Migración 022: corregir tipos de columnas en transportes
-- participante_id era INT pero visita_participantes.id es VARCHAR(32)
-- tecnico_id era INT pero usuarios.id es VARCHAR(10)
-- Todos los datos existentes son inválidos (INT 0 por cast de UUID a int)

-- Limpiar datos corruptos
DELETE FROM transportes;

-- Cambiar tipos de columna
ALTER TABLE transportes
  MODIFY participante_id VARCHAR(32) NOT NULL,
  MODIFY tecnico_id      VARCHAR(10) NOT NULL;
