# FACTURACION.md — Reglas de negocio para creación de facturas en Alegra

Documento vivo: aquí registramos las reglas que sigue Innovate para crear facturas en Alegra, de modo que sirvan tanto de referencia humana como de "lógica" para que la IA/código de extracción de cotizaciones/reportes sepa mapear cada dato al campo correcto de la factura.

## Cliente

- En Alegra, el cliente se identifica solo por **nombre** (autocomplete, igual que ya hace `alegra_contactos.php`). Al seleccionar el cliente, Alegra ya trae automáticamente: documento de identificación, correo, forma de pago predefinida, medio de pago, tipo de persona y responsabilidad tributaria. **No es necesario pedir ni completar esos datos manualmente** — basta con el `id` del contacto.
- **Si el cliente no existe en Alegra**: la app debe avisarle al usuario y pedirle que cree el contacto directamente en Alegra (no se crea automáticamente desde la app). Una vez creado allá, se reintenta la generación de la factura (debería poder volver a buscar el cliente y continuar).

## Fecha

- La fecha de la factura (`date`) siempre es **la fecha del día en que se genera la factura** (no la fecha de la cotización ni del reporte).

## Ítems / Conceptos (tarjetas IT / IF)

Para tarjetas de área IT o IF solo se usan **4 ítems** del catálogo de Alegra:

| Ítem | ID Alegra | Área | Tipo de línea          |
|------|-----------|------|-------------------------|
| IT   | 16        | IT   | Mano de obra            |
| MIT  | 12        | IT   | Mercancía / materiales   |
| IF   | 17        | IF   | Mano de obra            |
| MIF  | 8         | IF   | Mercancía / materiales   |

- En tarjetas **IT**: la mano de obra va al ítem **IT** (`id=16`), la mercancía/materiales van al ítem **MIT** (`id=12`).
- En tarjetas **IF**: la mano de obra va al ítem **IF** (`id=17`), la mercancía/materiales van al ítem **MIF** (`id=8`).
- Una misma factura puede tener líneas en ambos ítems (mano de obra + materiales) si la cotización los incluye por separado.

## Precio, cantidad e IVA

- **Precio (`price`) y cantidad (`quantity`)** se extraen directamente de la cotización, línea por línea.
- Las cotizaciones siempre se hacen **antes de IVA**.
- Todos los productos/servicios llevan **IVA del 19%** → `id=5` en Alegra (`items[].tax = [{id: 5}]`).
- Por lo tanto, el `price` que se envía a Alegra es el valor antes de IVA tal como aparece en la cotización, y cada línea debe llevar `tax: [{id: 5}]`.

## Cómo identificar el tipo de línea en la cotización

- En la tabla de la cotización, cada bloque de líneas empieza con el **nombre del ítem** (IT, IF, MIT o MIF) como encabezado/título del bloque — eso indica directamente a qué ítem de Alegra corresponde ese grupo de líneas. No hace falta inferirlo del contenido de la descripción.

## Descripción

- La descripción de cada línea (`description`) es la misma descripción que aparece en la cotización, **incluyendo el prefijo del ítem** (ej. "MIF - ROUTER TP-LINK ARCHER C64..."). No se quita ese prefijo.
- Si la cotización tiene número CTINN, se agrega al final de la descripción: **"Según cotización CTINN-<número>"** (ej. "Mantenimiento preventivo CCTV. Según cotización CTINN-1234").
- Si la cotización **no** tiene número CTINN, no se agrega ningún comentario adicional — la descripción queda tal cual.

## Forma de pago / fecha de vencimiento

- Alegra exige `dueDate` (fecha de vencimiento) y `paymentForm` al crear la factura — no los asigna automáticamente.
- Por defecto, la app propone `dueDate = date + 8 días`. Se muestra un aviso al usuario indicando que la fecha de vencimiento se estableció a 8 días por defecto y que puede editarla en el formulario antes de crear la factura.
- La factura se crea siempre con `paymentForm = "CREDIT"` (a crédito).
- El plazo de pago (`termsConditions`, ej. "Pago a 8 días") se calcula automáticamente como la diferencia en días entre `dueDate` y `date`.
