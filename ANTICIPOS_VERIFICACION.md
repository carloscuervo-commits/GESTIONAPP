# Verificación de anticipos (recibidos/entregados) — procedimiento para Claude

**Última actualización:** 2026-09-25

## Por qué existe este archivo

Ginno guarda en `anticipos_cache` los anticipos que recibe/entrega (eso sí lo
puede escanear solo desde Alegra, vía el botón "🔄 Actualizar ahora" /
"Escaneo completo"). Pero **cuánto de eso ya se aplicó a una factura** —el
saldo real pendiente— NO lo puede calcular Ginno de forma confiable desde su
propio backend PHP.

Se intentó con `_aaTotalAplicadoContacto()` (en `backend/lib/alegra_anticipos.php`),
que consulta `/api/v1/journals?client_id=X` en Alegra. Esa consulta **solo
detecta anticipos aplicados con un ajuste contable manual** (un journal
creado a mano). Cuando el anticipo se aplica con el botón nativo **"Aplicar
anticipo"** desde la pantalla de la factura en Alegra —que es el caso
normal—, esa consulta no lo ve, y Ginno se queda mostrando el anticipo como
pendiente para siempre, aunque en Alegra ya esté en $0.

Se confirmó con un caso real: Grupo Global Importaciones tenía en Ginno
$138.040 "pendientes", pero en Alegra el anticipo ya estaba en $0 (aplicado
por la pantalla, no por journal manual). Se probó también con
`ledger_listLedgerEntries` (resourceType=advanceAppliedJournal) y no dio
resultados útiles. No se encontró un endpoint público de la API de Alegra
que replique esto de forma confiable desde PHP.

**Por eso, desde el 2026-09-24, `anticipos_saldo_tercero` (la tabla que dice
cuánto le queda pendiente a cada cliente/proveedor) la mantiene Claude a
mano, cuando Carlos lo pide en el chat.** El código automático que hacía
esto en Ginno (el lote embebido en `anticiposActualizarCache()` y la
verificación perezosa en `anticipos.js`) se desactivó — quedan comentados
en el código, no borrados, por si en el futuro aparece una forma confiable
de hacerlo.

Ginno sigue haciendo solo (sin pedírselo a Claude):
- Escanear anticipos nuevos desde Alegra (`accion=actualizar` / cron nocturno).
- Mostrar lo que haya en `anticipos_saldo_tercero`; si un contacto nunca se
  ha verificado, muestra el total recibido/entregado como si todo siguiera
  pendiente (por seguridad — nunca oculta algo sin comprobar).

## Cuándo correr este procedimiento

Solo cuando Carlos lo pida explícitamente en el chat (p. ej. "actualiza
anticipos", "revisa el saldo de anticipos"). No es automático ni
periódico.

## Procedimiento paso a paso

### 1. Obtener la lista de contactos con anticipo pendiente en Ginno

Pedirle a Carlos que corra esta consulta y pegue el resultado (o, si hay
acceso MCP a la BD de Ginno en el futuro, correrla directo — hoy no lo hay,
así que siempre se le pide a Carlos):

```sql
SELECT DISTINCT direccion, contacto_id, contacto_nombre
FROM anticipos_cache
WHERE contacto_id IS NOT NULL
ORDER BY direccion, contacto_nombre;
```

Esto da TODOS los contactos con algún anticipo en caché (recibido y
entregado), no solo los que Carlos haya mencionado. Si Carlos ya pegó una
lista puntual de contactos a verificar (como pasó la primera vez), se puede
usar esa lista directamente sin pedir el SELECT, pero conviene ofrecerle
correr el SELECT para no dejar contactos viejos sin revisar.

### 2. Para cada contacto, consultar el saldo real en Alegra

**MÉTODO PRINCIPAL — Claude en Chrome, leyendo la interfaz de Alegra
(usar este, no la API de reportes; ver el porqué más abajo):**

1. Armar un prompt para Claude en Chrome con la lista de contactos
   (`contacto_id | nombre`, sin dirección — el cuadro de Alegra muestra
   ambos valores, recibidos y entregados, para cualquier contacto) y las
   instrucciones: buscar cada contacto por nombre en `app.alegra.com`
   (por NIT si el nombre no lo encuentra bien), abrirlo, y anotar los
   valores exactos de "Anticipos recibidos" y "Anticipos entregados" del
   cuadro que aparece en la parte superior de la pantalla del contacto
   (junto a "Cuentas por cobrar", "Por pagar", "Notas crédito/débito por
   aplicar"). Pedir que devuelva una tabla
   `contacto_id | nombre | anticipos_recibidos | anticipos_entregados`,
   y que avise explícitamente si algún contacto no aparece o hay
   ambigüedad (nunca que adivine o lo salte en silencio). El prompt
   completo usado el 2026-09-25 quedó guardado como referencia en
   `prompt_claude_chrome_anticipos.txt` (raíz del proyecto).
2. Pasarle ese prompt a Carlos para que lo corra en su propia sesión de
   Claude en Chrome (con Alegra ya logueado ahí) y que pegue la tabla de
   resultados de vuelta en el chat.
3. Con esa tabla: la columna que aplica es `anticipos_recibidos` para
   contactos con `direccion='recibido'` y `anticipos_entregados` para
   `direccion='entregado'` (según la dirección de `anticipos_cache`).

**MÉTODO DESCARTADO — API de reportes (`reports_get_third_party_trial_balance`
con `idClient`):** se usó en la primera corrida (2026-09-25) y dio
resultados incorrectos — el filtro `idClient` no aísla de forma confiable
los movimientos de un solo tercero (parece filtrar mal cuando el tercero
no tiene movimiento real en una cuenta, mezclando datos de otros
terceros/cuentas). Confirmado por Carlos revisando varios contactos a
mano en Alegra. Detalle completo de la evidencia en la sección "Primera
corrida" más abajo. **No usar este método salvo que se encuentre y
confirme una forma distinta de consultarlo por API.**

**Redondeo:** NO se redondea ni se clampea nada — se guarda el valor
exacto que muestra el cuadro de Alegra para cada contacto, por chico que
sea (incluyendo negativos, como -$0,05). A diferencia de la API, este
cuadro es la fuente que Carlos mismo lee, así que su valor —aunque sea
$0,40 o $11— es el dato real, no ruido de cálculo nuestro.

### 3. Armar el SQL de actualización

Para cada contacto verificado, un `INSERT ... ON DUPLICATE KEY UPDATE`
(la tabla tiene PK compuesta `(direccion, contacto_id)`, así que esto sirve
tanto para insertar contactos nuevos como para corregir uno ya existente):

```sql
INSERT INTO anticipos_saldo_tercero (direccion, contacto_id, contacto_nombre, saldo, consultado_en)
VALUES
  ('recibido', '546',  'CONJUNTO RESIDENCIAL SENDEROS DEL PARQUE PROPIEDAD HORIZONTAL', 0.00, NOW()),
  ('recibido', '1901', 'GRUPO GLOBAL IMPORTACIONES S.A.S.',                              0.00, NOW()),
  ('recibido', '1858', 'CONJUNTO RESIDENCIAL LLANURAS DEL CASTILLO',                      0.00, NOW()),
  ('recibido', '995',  'DISPROQUIN S A S',                                                0.00, NOW())
ON DUPLICATE KEY UPDATE
  contacto_nombre = VALUES(contacto_nombre),
  saldo            = VALUES(saldo),
  consultado_en    = VALUES(consultado_en);
```

Entregar SIEMPRE este SQL listo para copiar/pegar y correr — nunca pedirle
a Carlos que lo arme él, y nunca conectarse directo a la base de datos (regla
de la casa: sin acceso directo a la BD).

`contacto_nombre` debe ser el mismo texto que ya usa `anticipos_cache` para
ese `contacto_id` (para que no genere una fila "duplicada visualmente" con
otro nombre) — si hay duda, usar el nombre que traiga Alegra o el que
Carlos haya pegado, no inventar uno.

### 4. Avisarle a Carlos qué se corrigió

Un resumen corto: cuántos contactos se verificaron, cuáles cambiaron de
valor (y de cuánto a cuánto), y cuáles quedaron igual. Si algún contacto no
se pudo verificar (Alegra no respondió, o no se encontró el contacto), decirlo
explícitamente — no omitirlo silenciosamente.

## Primera corrida (2026-09-25) — RETRACTADA, no usar sus valores

Se hizo con `reports_get_third_party_trial_balance` (`idClient`,
`fromDate=2020-01-01`). SQL entregado entonces: `anticipos_fix_2026-09-25.sql`.
Carlos revisó varios contactos directamente en Alegra y los valores no
coincidían (ver detalle en `CONTEXTO.md`, sección 2026-09-25). Causa:
el filtro `idClient` de ese reporte no aísla de forma confiable los
movimientos de un solo tercero. **Los valores de esa corrida no son
válidos** — quedan reemplazados por la corrida corregida de abajo.
`anticipos_fix_2026-09-25.sql` se dejó en el repo con una nota de
retractación al inicio, apuntando a `anticipos_fix_2026-09-25_corregido.sql`.

## Corrida corregida (2026-09-25) — verificada en la interfaz de Alegra

Mismos 94 contactos (18 `recibido` + 76 `entregado`), esta vez verificados
uno por uno leyendo el cuadro "Anticipos recibidos/entregados" en la
pantalla de cada contacto en Alegra, vía Claude en Chrome (ver método
principal en el paso 2 más arriba). SQL entregado:
`anticipos_fix_2026-09-25_corregido.sql` (raíz del proyecto).

A pedido de Carlos, esta corrida **no redondea ni clampea nada** — se
guarda el valor exacto que muestra el cuadro de Alegra para cada
contacto, por chico que sea. Quedaron con saldo distinto de $0:

| contacto_id | contacto_nombre | dirección | saldo real Alegra |
|---|---|---|---|
| 927 | GRUPO INNOVATE S.A.S | recibido | 4.488.717,00 |
| 8 | EL COMERCIO ELECTRICO S.A.S. | entregado | 1.287.884,60 |
| 1196 | ALEJANDRO ZUÑIGA VALENCIA | entregado | 1.000.000,00 |
| 1622 | ALUMCENTRO SAS | entregado | 572.000,00 |
| 1155 | OSCAR EDMUNDO LA TORRE CESPEDES | entregado | 490.677,00 |
| 1276 | Saulo Andres Pizo Jimenez | entregado | 426.700,00 |
| 1796 | ANDRES FELIPE CARVAJAL CARVAJAL | entregado | 200.000,00 |
| 413 | LILIANA BOLAÑOS URBANO | entregado | 107.718,00 |
| 1274 | MIGUEL MATEO RIVERA GRIJALBA | entregado | 100.000,00 |
| 1448 | LEONARDO ZAPATA JORDAN | entregado | 97.000,00 |
| 1648 | DIEGO FERNANDO PINZON REYES | entregado | 79.900,00 |
| 1897 | GRUPO CONTROL DE COLOMBIA SAS | entregado | 45.252,70 |
| 296 | SION TECHNOLOGY S.A.S. | entregado | 3.950,00 |
| 1797 | PANCE CAMPESTRE ETAPA 1 - PROPIEDAD HORIZONTAL | recibido | 5.520,00 |
| 1011 | CAROLINA ARISTIZABAL MONTOYA | recibido | 4.163,00 |
| 1658 | SIDERURGICA DEL OCCIDENTE S.A.S. SIDOC S.A.S. | entregado | 10.000,00 |
| 1639 | ALONDRA CONJUNTO RESIDENCIAL ETAPA I - P-H | recibido | 807,70 |
| 1563 | ALUMINIOS Y VIDRIOS X METRO S.A.S | entregado | 17,30 |
| 138 | IZC Mayorista SAS | entregado | 11,00 |
| 1827 | COVAL COMERCIAL S.A.S | entregado | 0,50 |
| 1816 | CONDOMINIO SOL DE LA ARBOLEDA | recibido | 0,40 |
| 139 | MULTIREDES Y TECNOLOGIA S.A.S | entregado | 3,00 |
| 9 | GVS COLOMBIA S.A.S | entregado | -0,05 |

Los otros 71 contactos quedaron en $0,00 exacto (sin ningún movimiento
pendiente en Alegra).

Respecto a la corrida retractada, dos correcciones de monto:
- **927 GRUPO INNOVATE S.A.S**: $10.834.392 (mal) → **$4.488.717** (correcto
  — confirmado por Carlos directamente en el cuadro de Alegra). El valor
  viejo sumaba por error dos cuentas contables distintas.
- **1276 Saulo Andres Pizo Jimenez**: $226.700 (mal) → **$426.700**
  (correcto). Diferencia de $200.000.

**Los 5 "negativos" de la corrida anterior quedaron confirmados en $0**
(el negativo era el bug de la API, no un saldo real): Alfredo José
Santimone Barreto, GVS Colombia S.A.S. (da -$0,05 en Alegra, se clampa a
0), Hometech El Hogar Digital S.A.S., Jorge Javier Guerrero Bedoya y
Sebastian Gamboa Collazos.

**Caso Grupo Innovate S.A.S. (927)** ya no es un "caso raro sin resolver"
— Carlos confirmó el valor $4.488.717 directamente en Alegra, es un
anticipo recibido real y pendiente de la propia empresa como cliente.

**Otra observación de Carlos, confirmada en los datos**: ningún contacto
de los 94 tiene saldo pendiente en las dos direcciones a la vez — el que
tiene algo en "recibido" no tiene nada en "entregado", y viceversa.

(Al construir el `INSERT`, se usó como `contacto_nombre` el nombre COMPLETO
que devuelve Alegra — no el de `anticipos_cache`, que en la consulta de
phpMyAdmin venía truncado a ~50 caracteres por la vista de la tabla.)
