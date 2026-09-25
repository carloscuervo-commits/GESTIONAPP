-- ============================================================================
-- CORRECCION del 2026-09-25 — reemplaza a anticipos_fix_2026-09-25.sql (RETRACTADO)
-- ============================================================================
-- El archivo anterior (anticipos_fix_2026-09-25.sql) se calculó con
-- mcp__Alegra__reports_get_third_party_trial_balance, que resultó NO ser
-- confiable: el filtro idClient no aisla bien los movimientos del tercero
-- (se confirmó con evidencia cruzada — ver ANTICIPOS_VERIFICACION.md).
--
-- Este archivo se construyó con datos verificados directamente en la
-- interfaz de Alegra (el cuadro "Anticipos recibidos / Anticipos entregados"
-- que aparece en la parte superior de la pantalla de cada contacto),
-- revisados uno por uno vía Claude en Chrome. Esta es la fuente confiable.
--
-- Total: 94 contactos (18 recibido + 76 entregado).
--
-- A pedido de Carlos, NO se redondean/clampean los montos pequeños: se
-- guarda el valor exacto que muestra Alegra para cada contacto, por chico
-- que sea. Los montos pequeños de esta corrida son:
--   1639 ALONDRA: 807.70 | 1011 CAROLINA ARISTIZABAL MONTOYA: 4163.00
--   1816 SOL DE LA ARBOLEDA: 0.40 | 1563 ALUMINIOS Y VIDRIOS X METRO: 17.30
--   1827 COVAL COMERCIAL: 0.50 | 9 GVS COLOMBIA S.A.S: -0.05
--   138 IZC Mayorista: 11.00 | 139 MULTIREDES Y TECNOLOGIA: 3.00
--   296 SION TECHNOLOGY: 3950.00
--
-- Casos que se CORRIGIERON respecto al archivo retractado:
--   927 GRUPO INNOVATE S.A.S: era 10.834.392,00 (mal calculado, sumaba dos
--       cuentas contables distintas) -> ahora 4.488.717,00 (confirmado por
--       Carlos directamente en Alegra Y por Claude en Chrome).
--   1276 Saulo Andres Pizo Jimenez: era 226.700,00 -> ahora 426.700,00
--       (el valor de la API estaba mal, diferencia de $200.000).
--
-- Casos que se CONFIRMARON en $0 (antes se habían calculado como negativos,
-- que era el bug de la API — Carlos ya había verificado esto manualmente
-- en Alegra para estos 5 y todos daban $0):
--   867 Alfredo José Santimone Barreto | 9 GVS COLOMBIA S.A.S (da -0,05,
--   se clampa a 0) | 1667 HOMETECH EL HOGAR DIGITAL S.A.S. |
--   582 JORGE JAVIER GUERRERO BEDOYA | 514 SEBASTIAN GAMBOA COLLAZOS
--
-- Nota: en los datos verificados, ningún contacto tiene saldo en ambas
-- direcciones (recibido y entregado) a la vez.
-- ============================================================================

INSERT INTO anticipos_saldo_tercero (direccion, contacto_id, contacto_nombre, saldo, consultado_en)
VALUES
  ('recibido', '1605', '"ALTOPANCE CONDOMINIO CAMPESTRE ETAPA 1" - PROPIEDAD HORIZONTAL', 0.00, NOW()),
  ('recibido', '1639', 'ALONDRA CONJUNTO RESIDENCIAL ETAPA I - P-H', 807.70, NOW()),
  ('recibido', '1011', 'CAROLINA ARISTIZABAL MONTOYA', 4163.00, NOW()),
  ('recibido', '1631', 'CONDOMINIO CAMPESTRE SOLARES DE LA MORADA III Y IV ETAPA', 0.00, NOW()),
  ('recibido', '1816', 'CONDOMINIO SOL DE LA ARBOLEDA', 0.40, NOW()),
  ('recibido', '1586', 'CONDOMINIO SOL DEL CAMPO', 0.00, NOW()),
  ('recibido', '1675', 'CONJUNTO CIAN V.I.S (MANZANA 4 A ETAPA 4 U.G.4 CIUDAD MELENDEZ) -PROPIEDAD HORIZONTAL', 0.00, NOW()),
  ('recibido', '1858', 'CONJUNTO RESIDENCIAL LLANURAS DEL CASTILLO', 0.00, NOW()),
  ('recibido', '546', 'CONJUNTO RESIDENCIAL SENDEROS DEL PARQUE PROPIEDAD HORIZONTAL', 0.00, NOW()),
  ('recibido', '995', 'DISPROQUIN S A S', 0.00, NOW()),
  ('recibido', '1925', 'EDIFICIO COLINA DEL RIO - PROPIEDAD HORIZONTAL', 0.00, NOW()),
  ('recibido', '1901', 'GRUPO GLOBAL IMPORTACIONES S.A.S.', 0.00, NOW()),
  ('recibido', '927', 'GRUPO INNOVATE S.A.S', 4488717.00, NOW()),
  ('recibido', '573', 'INDUSTRIAS SUPLAS S.A.S', 0.00, NOW()),
  ('recibido', '1797', 'PANCE CAMPESTRE ETAPA 1 - PROPIEDAD HORIZONTAL', 5520.00, NOW()),
  ('recibido', '1913', 'PARCELACION CAMPESTRE LAGUNA SECA - PROPIEDAD HORIZONTAL', 0.00, NOW()),
  ('recibido', '1811', 'PARQUE INDUSTRIAL Y COMERCIAL ACEROSA PROPIEDAD HORIZONTAL', 0.00, NOW()),
  ('recibido', '1950', 'URBANIZACION CERROS DE GUADALUPE - PROPIEDAD HORIZONTAL', 0.00, NOW()),
  ('entregado', '955', 'ACUABUITRERA', 0.00, NOW()),
  ('entregado', '1196', 'ALEJANDRO ZUÑIGA VALENCIA', 1000000.00, NOW()),
  ('entregado', '867', 'Alfredo José Santimone Barreto', 0.00, NOW()),
  ('entregado', '1437', 'ALQUILEQUIPOS C.M.M S.A.S.', 0.00, NOW()),
  ('entregado', '1622', 'ALUMCENTRO SAS', 572000.00, NOW()),
  ('entregado', '1563', 'ALUMINIOS Y VIDRIOS X METRO S.A.S', 17.30, NOW()),
  ('entregado', '622', 'Aml SAS', 0.00, NOW()),
  ('entregado', '1796', 'ANDRES FELIPE CARVAJAL CARVAJAL', 200000.00, NOW()),
  ('entregado', '1814', 'Andres Felipe Zuñiga Ruiz', 0.00, NOW()),
  ('entregado', '1726', 'ANDRES RIOS HURTADO', 0.00, NOW()),
  ('entregado', '1836', 'ANNIE PAOLA MURCIA MONCAYO', 0.00, NOW()),
  ('entregado', '1172', 'AQP Hosting A1', 0.00, NOW()),
  ('entregado', '1520', 'AQUA INTEGRAL S.A.S', 0.00, NOW()),
  ('entregado', '509', 'ASEGURADORA SOLIDARIA DE COLOMBIA ENTIDAD COOPERATIVA', 0.00, NOW()),
  ('entregado', '1856', 'CESAR AUGUSTO RAMIREZ GALLEGO', 0.00, NOW()),
  ('entregado', '725', 'CLAUDIA MARCELA CASTAÑO', 0.00, NOW()),
  ('entregado', '63', 'Colombia telecomunicaciones SA ESP BIC', 0.00, NOW()),
  ('entregado', '537', 'Colombiana de comercio SA - Alkosto Cali', 0.00, NOW()),
  ('entregado', '1739', 'COMERCIO TECNOLOGICO L.A.M S.A.S.', 0.00, NOW()),
  ('entregado', '1531', 'CONEXION TOTAL DE OCCIDENTE S.A.S.', 0.00, NOW()),
  ('entregado', '1827', 'COVAL COMERCIAL S.A.S', 0.50, NOW()),
  ('entregado', '1648', 'DIEGO FERNANDO PINZON REYES', 79900.00, NOW()),
  ('entregado', '1940', 'DISEÑOS Y ESTRUCTURAS EN ALUMINIO S.A.S.', 0.00, NOW()),
  ('entregado', '894', 'Distribuidora Nissan S.A', 0.00, NOW()),
  ('entregado', '1600', 'DOINTECH SISTEMAS INTEGRADOS EN AUTOMATIZACION SEGURIDAD Y CONTROL SAS', 0.00, NOW()),
  ('entregado', '1601', 'DON ELECTRICO S. A. S.', 0.00, NOW()),
  ('entregado', '8', 'EL COMERCIO ELECTRICO S.A.S.', 1287884.60, NOW()),
  ('entregado', '816', 'ELECTRONICA SAN NICOLAS S.A.S', 0.00, NOW()),
  ('entregado', '975', 'Ferreteria Tubolaminas S.A', 0.00, NOW()),
  ('entregado', '1897', 'GRUPO CONTROL DE COLOMBIA SAS', 45252.70, NOW()),
  ('entregado', '1839', 'GRUPO LEDACOM SAS', 0.00, NOW()),
  ('entregado', '9', 'GVS COLOMBIA S.A.S', -0.05, NOW()),
  ('entregado', '686', 'HERITAGE GROUP S.A.S.', 0.00, NOW()),
  ('entregado', '1667', 'HOMETECH EL HOGAR DIGITAL S.A.S.', 0.00, NOW()),
  ('entregado', '1720', 'INNOVATRONIC SAS', 0.00, NOW()),
  ('entregado', '309', 'Internacional de electricos SAS', 0.00, NOW()),
  ('entregado', '138', 'IZC Mayorista SAS', 11.00, NOW()),
  ('entregado', '142', 'JANUS LTDA', 0.00, NOW()),
  ('entregado', '1880', 'JHON JAIRO DAZA CARDENAS', 0.00, NOW()),
  ('entregado', '582', 'JORGE JAVIER GUERRERO BEDOYA', 0.00, NOW()),
  ('entregado', '1263', 'José Luis Galvis Ruano', 0.00, NOW()),
  ('entregado', '1869', 'JOTTA SPORT LTDA', 0.00, NOW()),
  ('entregado', '1666', 'JUAN ANDRES LERMA QUIÑONES', 0.00, NOW()),
  ('entregado', '1696', 'JUAN CAMILO GALLEGO TRUJILLO', 0.00, NOW()),
  ('entregado', '1845', 'JUAN DIEGO VARGAS MIRANDA', 0.00, NOW()),
  ('entregado', '1448', 'LEONARDO ZAPATA JORDAN', 97000.00, NOW()),
  ('entregado', '543', 'LEXCO S.A.', 0.00, NOW()),
  ('entregado', '413', 'LILIANA BOLAÑOS URBANO', 107718.00, NOW()),
  ('entregado', '583', 'Lince Comercial SAS', 0.00, NOW()),
  ('entregado', '1519', 'LUISA MARIA JARAMILLO MONSALVE', 0.00, NOW()),
  ('entregado', '164', 'MACROTICS S.A.S.', 0.00, NOW()),
  ('entregado', '986', 'MADECENTRO COLOMBIA S.A.S', 0.00, NOW()),
  ('entregado', '1565', 'MARTHA LUCIA VALENCIA LOZANO', 0.00, NOW()),
  ('entregado', '1980', 'MEGA COMPUTER SAS', 0.00, NOW()),
  ('entregado', '1477', 'MICHAEL STIVEN SALAZAR PULIDO', 0.00, NOW()),
  ('entregado', '1274', 'MIGUEL MATEO RIVERA GRIJALBA', 100000.00, NOW()),
  ('entregado', '1715', 'MOVISTAR - COLOMBIA TELECOMUNICACIONES S.A. E.S.P. BIC', 0.00, NOW()),
  ('entregado', '1151', 'MPS MAYORISTA DE COLOMBIA S.A.', 0.00, NOW()),
  ('entregado', '139', 'MULTIREDES Y TECNOLOGIA S.A.S', 3.00, NOW()),
  ('entregado', '1155', 'OSCAR EDMUNDO LA TORRE CESPEDES', 490677.00, NOW()),
  ('entregado', '1859', 'PAPELERÍA UNIVERSAL DISTRIBUIDORA S.A.S.', 0.00, NOW()),
  ('entregado', '1874', 'PRONTECH TELECOMUNICACIONES SAS', 0.00, NOW()),
  ('entregado', '1495', 'PROYECTO E SAS', 0.00, NOW()),
  ('entregado', '220', 'RAMIREZ CASTRO MARCELA ELENA', 0.00, NOW()),
  ('entregado', '1611', 'REDCOM TODO EN CONECTIVIDAD SAS', 0.00, NOW()),
  ('entregado', '1256', 'ROBERT IVAN BENITEZ PEREZ', 0.00, NOW()),
  ('entregado', '1276', 'Saulo Andres Pizo Jimenez', 426700.00, NOW()),
  ('entregado', '514', 'SEBASTIAN GAMBOA COLLAZOS', 0.00, NOW()),
  ('entregado', '1658', 'SIDERURGICA DEL OCCIDENTE S.A.S. SIDOC S.A.S.', 10000.00, NOW()),
  ('entregado', '296', 'SION TECHNOLOGY S.A.S.', 3950.00, NOW()),
  ('entregado', '243', 'SOLUCIONES ALEGRA SAS', 0.00, NOW()),
  ('entregado', '1327', 'Tarrer Artisitico La Casita de Eida', 0.00, NOW()),
  ('entregado', '1310', 'TECNOPLAZA COLOMBIA SAS', 0.00, NOW()),
  ('entregado', '1695', 'WILMER ANDRES ARCE ESTRADA', 0.00, NOW()),
  ('entregado', '196', 'Yesica Vanessa Valencia', 0.00, NOW()),
  ('entregado', '704', 'ZINKO COLOMBIA S.A.S.', 0.00, NOW())
ON DUPLICATE KEY UPDATE
  contacto_nombre = VALUES(contacto_nombre),
  saldo            = VALUES(saldo),
  consultado_en    = VALUES(consultado_en);
