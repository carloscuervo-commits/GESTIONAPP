# Verificación de anticipos (recibidos/entregados) — procedimiento para Claude

**Última actualización:** 2026-09-24

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

Usar `mcp__Alegra__reports_get_third_party_trial_balance` con:
- `idClient` = el `contacto_id` (el id de Alegra, mismo que `contacto_id` en Ginno)
- `fromDate` = `2025-01-01` (o antes si el contacto es viejo — mejor ampliar
  que dejar por fuera movimientos)
- `toDate` = fecha de hoy

Si no se conoce el `contacto_id` de antemano (por ejemplo, Carlos solo dio
el nombre), resolverlo primero con `mcp__Alegra__contacts_getContactByName`.

En la respuesta, buscar la línea de cuenta correspondiente en
`thirdPartyLines`:
- **Dirección `recibido`** → cuenta "Avances y anticipos recibidos"
  (cuentas 5042 / 211894 / 212026 en el plan de Grupo Innovate).
- **Dirección `entregado`** → cuenta "Avances y anticipos entregados"
  (cuentas 5044 / 211878).

El saldo real pendiente es el `finalBalance` de esa línea. Si no aparece
ninguna línea de esa cuenta para el contacto, el saldo es 0 (no quedó nada
pendiente, o nunca tuvo movimiento en esa cuenta en el rango de fechas —
ampliar `fromDate` si hay duda).

**Redondeo:** `finalBalance` a veces da un valor casi-cero por diferencias
de centavos (ej. -2.600 sobre movimientos de $15.108.544) — tratar como 0
cualquier valor con magnitud menor a, digamos, $5.000, salvo que el
contexto sugiera que sí es un saldo real pequeño.

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

## Caso ya resuelto (referencia, 2026-09-24)

Estos 4 contactos se confirmaron en $0 real en Alegra (estaban mostrando
saldo pendiente en Ginno por error, con la lógica automática vieja):

| contacto_id | contacto_nombre | dirección | saldo real Alegra |
|---|---|---|---|
| 546 | CONJUNTO RESIDENCIAL SENDEROS DEL PARQUE PROPIEDAD HORIZONTAL | recibido | 0 |
| 1901 | GRUPO GLOBAL IMPORTACIONES S.A.S. | recibido | 0 |
| 1858 | CONJUNTO RESIDENCIAL LLANURAS DEL CASTILLO | recibido | 0 |
| 995 | DISPROQUIN S A S | recibido | 0 |

(Confirmar la dirección exacta — `recibido` vs `entregado` — contra
`anticipos_cache` antes de correr el SQL, por si alguno en realidad es un
anticipo entregado a proveedor.)
