-- 039_pin_bloqueo_intentos.sql
-- Protección contra fuerza bruta del PIN de login: cuenta intentos fallidos
-- consecutivos por usuario y bloquea esa cuenta 15 minutos tras 5 seguidos
-- (ver backend/api/auth.php). Se resetea a 0 / NULL apenas el usuario
-- acierta el PIN.

ALTER TABLE usuarios
  ADD COLUMN pin_intentos_fallidos INT NOT NULL DEFAULT 0,
  ADD COLUMN pin_bloqueado_hasta DATETIME NULL DEFAULT NULL;
