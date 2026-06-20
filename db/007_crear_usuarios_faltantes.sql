-- ============================================================
-- Migración 007: Crear usuarios faltantes en la tabla "usuarios"
--
-- Sebastian Gamboa (SG) y Robert Benitez (RB) existen en el equipo
-- definido en el frontend (TEAM, assets/js/core.js) pero nunca se
-- insertaron en la base de datos. Por eso el UPDATE de PINs de la
-- migración 006 no les aplicó nada (no había fila que actualizar).
-- ============================================================

INSERT INTO usuarios (id, nombre, iniciales, color, rol) VALUES
  ('SG', 'Sebastian Gamboa', 'SG', '#d97706', NULL),
  ('RB', 'Robert Benitez',   'RB', '#db2777', NULL)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- Ahora que ya existen, se les asigna el PIN (mismos PINs pedidos antes)
UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '1323'), 256) WHERE id = 'SG'; -- Sebastian Gamboa (técnico)
UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '5566'), 256) WHERE id = 'RB'; -- Robert Benitez (técnico)

-- Nota: Brandon Naranjo (BN) también está en el TEAM del frontend pero
-- tampoco existe en la base de datos. No se crea aquí porque no se dio
-- un PIN para él. Si lo necesitas, la línea sería:
--   INSERT INTO usuarios (id, nombre, iniciales, color, rol) VALUES ('BN', 'Brandon Naranjo', 'BN', '#dc2626', NULL)
--     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
--   UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', 'XXXX'), 256) WHERE id = 'BN';
