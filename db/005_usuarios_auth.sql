-- ============================================================
-- Migración 005: Autenticación simple por PIN + perfiles (admin/técnico)
-- ============================================================
ALTER TABLE usuarios
  ADD COLUMN perfil ENUM('admin','tecnico') NOT NULL DEFAULT 'tecnico'
    COMMENT 'Controla qué áreas/acciones puede ver el usuario en la app',
  ADD COLUMN pin_hash VARCHAR(64) NULL
    COMMENT 'SHA-256 de "id:PIN" (ver backend/api/auth.php). NULL = login deshabilitado para este usuario',
  ADD COLUMN token_sesion VARCHAR(64) NULL
    COMMENT 'Token de sesión persistente para mantener el login en el dispositivo (PIN no se vuelve a pedir)',
  ADD COLUMN token_creado_en DATETIME NULL;

-- Marca a Carlos como administrador (ajusta el id si es necesario).
-- Todos los demás quedan en 'tecnico' por el DEFAULT de la columna.
UPDATE usuarios SET perfil = 'admin' WHERE id = 'CAC';

-- ------------------------------------------------------------
-- IMPORTANTE: ningún usuario queda con PIN configurado todavía
-- (pin_hash queda NULL a propósito). Para activar el login de
-- cada persona, ejecuta una línea como esta por cada una,
-- cambiando el id y eligiendo un PIN de 4 dígitos:
--
--   UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '1234'), 256) WHERE id = 'AZ';
--   UPDATE usuarios SET pin_hash = SHA2(CONCAT(id, ':', '5678'), 256) WHERE id = 'JG';
--
-- Mientras un usuario no tenga pin_hash, no podrá iniciar sesión
-- (el login devuelve "Usuario no configurado para iniciar sesión").
-- ------------------------------------------------------------
