-- Migración 023: agregar campo trayectos a transportes
-- trayectos: 0 = ya cubierto ese día, 1 = solo ida, 2 = ida y vuelta (default)
-- valor sigue siendo el precio unitario por trayecto (del cliente)
-- total = trayectos × valor (calculado en frontend/reportes)

ALTER TABLE transportes
  ADD COLUMN trayectos TINYINT NOT NULL DEFAULT 2 AFTER valor;
