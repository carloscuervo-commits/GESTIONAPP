-- Registro de facturas creadas en Alegra desde el módulo de Facturación de la app.
-- Antes de esto, el número de factura solo se mostraba en pantalla y se perdía
-- (salvo que viniera de una tarea, donde se guardaba en tareas.factura).
-- Esta tabla permite construir el informe "Facturas generadas (módulo Facturación)".

CREATE TABLE IF NOT EXISTS facturas_generadas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero_factura VARCHAR(50) NOT NULL,
  alegra_id VARCHAR(50) NULL,
  cliente_id VARCHAR(50) NULL,
  cliente_nombre VARCHAR(150) NULL,
  total DECIMAL(14,2) NULL,
  tarea_id CHAR(36) NULL,
  fecha_factura DATE NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cliente (cliente_nombre),
  INDEX idx_fecha (fecha_factura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
