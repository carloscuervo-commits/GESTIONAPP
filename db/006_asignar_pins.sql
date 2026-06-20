-- ============================================================
-- Migración 006: Perfiles y PINs iniciales del equipo
-- Ejecutar DESPUÉS de 005_usuarios_auth.sql
-- ============================================================

-- Perfiles (admin / técnico)
UPDATE usuarios SET perfil = 'admin' WHERE id IN ('CAC', 'AZ');

-- PINs (se guarda el hash SHA-256 de "id:PIN", ver backend/api/auth.php)
UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '1121'), 256) WHERE id = 'CAC'; -- Carlos Cuervo (admin)
UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '9403'), 256) WHERE id = 'AZ';  -- Alejandro Zuñiga (admin)
UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '0724'), 256) WHERE id = 'JG';  -- Jorge Guerrero (técnico)
UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '1323'), 256) WHERE id = 'SG';  -- Sebastian Gamboa (técnico)
UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '5566'), 256) WHERE id = 'RB';  -- Robert Benitez (técnico)

-- Nota: Brandon Naranjo (BN) queda sin PIN por ahora (no se incluyó en la
-- lista). No podrá iniciar sesión hasta que se le asigne uno, con una
-- línea como las anteriores:
--   UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', 'XXXX'), 256) WHERE id = 'BN';
