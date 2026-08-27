-- Migración 037: cola de facturas "listas para crear después" en Alegra.
-- Fecha: 2026-08-27
-- Ejecutar en phpMyAdmin antes del deploy.
--
-- Contexto: el plan de Alegra tiene un límite mensual de facturación que a
-- veces se alcanza antes de fin de mes. Este módulo permite a la persona de
-- facturación dejar la factura completamente lista (cliente, ítems,
-- cantidades, precios, fechas) sin crearla todavía en Alegra, guardando el
-- MISMO payload exacto que se usaría para crearla de inmediato — así, cuando
-- el límite se resetea, "Crear ahora" no reescribe nada y no hay riesgo de
-- error de transcripción.

CREATE TABLE IF NOT EXISTS facturas_pendientes (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  payload           TEXT         NOT NULL COMMENT 'JSON: {date,dueDate,client,items,clienteNombre,tareaId}',
  cliente_nombre    VARCHAR(150) NULL,
  total_estimado    DECIMAL(14,2) NULL,
  tarea_id          CHAR(36)     NULL,
  estado            ENUM('pendiente','creada','cancelada') NOT NULL DEFAULT 'pendiente',
  numero_factura    VARCHAR(50)  NULL,
  alegra_id         VARCHAR(50)  NULL,
  error_ultimo      TEXT         NULL COMMENT 'Último mensaje de error de Alegra, si "Crear ahora" falló',
  creado_por        VARCHAR(10)  NULL,
  creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creada_en         DATETIME     NULL COMMENT 'Cuándo se creó de verdad en Alegra',

  INDEX idx_estado (estado),
  INDEX idx_cliente (cliente_nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
