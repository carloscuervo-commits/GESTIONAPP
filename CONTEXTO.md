# CONTEXTO.md — Ginno (Grupo Innovate)

**Ginno** es el asistente de gestión de Grupo Innovate — G Inno. Tablero de tareas para el equipo (IT, IF, Administrativo, Comercial/Cartera), con integración a Alegra. Se comunica como un compañero de trabajo, no como un sistema.

URL pública: https://grupoinnovate.com/ginno/ (antes: /gestion/tareas-equipo.html)

## Estado actual (última actualización: 2026-09-03 — sesión larga: cotización→factura, dashboard lento, contrato por área, comentarios privados)

### fix: cliente equivocado al procesar cotización para factura

`backend/api/alegra_factura_desde_cotizacion.php`: el fallback de búsqueda de cliente por palabra suelta (cuando el nombre completo no matchea en Alegra) traía falsos positivos masivos (ej. "SAN" matcheaba "Sanchez", "Santimone", etc.), y el `<select>` del frontend no marcaba ningún candidato como `selected`, dejando el primero de la lista (irrelevante) elegido por defecto. Ahora cada candidato se anota con `match_exacto` (nombre normalizado igual o contenido como frase completa) y `score` de similitud, se ordenan exactos primero y se limitan a 8; el frontend marca `✓`/`≈` y advierte si no hay match exacto. Ver `assets/js/facturacion.js?v=20260903a`.

### fix: dashboard con scroll saltando solo en la zona de alertas

Causa real (no la primera hipótesis): `renderDashboard()` (`tareas.js`) reconstruye TODO `#dashboard-view` con `innerHTML=` cada ~10-20s (autoSync llama `render()` dos veces por ciclo), dejando momentáneamente vacíos los contenedores de alertas que se llenan por fetch async (contratos, sin-reporte, fuera de sitio) — colapsan y reaparecen escalonados, produciendo el salto. Fix real: guardar el `innerHTML` de esos 6 contenedores antes del rebuild y reponerlo de inmediato (síncrono) hasta que el fetch real los actualice. Además, todas las sub-funciones que reescriben piezas de la zona de alertas (`renderAlertasRetraso`, `renderAlertasIncumplidas`, `renderAlertasFueraSitio`, `cargarAlertasSinReporte`, `renderContratosVigentesCard`, `renderProyectosActivosCard`, `renderContratosAlertaFinMes`) usan un helper común `_setHtmlConservandoScroll(el, html)` que guarda/restaura `window.scrollY`. `tareas.js?v=20260903c`.

### feat: orden por vencimiento en zonas de alerta del dashboard

"Realizados sin facturar", "Pendientes por cotizar" y "Cotizado por seguimiento" ahora se ordenan por días de atraso descendente (antes no tenían orden explícito). `tareas.js?v=20260903d`/`e`.

### feat: técnicos solo ven comentarios donde son autores o mencionados

`backend/api/comentarios.php` GET acepta `usuarioId`+`perfil`; si `perfil=tecnico` filtra a comentarios propios o con `@suID` mencionado (regex, mismo formato que el aviso de menciones). Admin sigue viendo todos. **Nota de seguridad**: la app no tiene sesión de servidor — todo el backend confía en lo que manda el frontend, así que esto es una restricción de UI/uso normal, no a prueba de manipulación deliberada (un técnico con devtools podría forzar `perfil=admin` en la URL). `comentarios.js?v=20260903a`.

### fix: horas de contrato mostraban el ciclo de HOY, no el de la visita

`backend/api/reportes.php` (`?horasContrato=1`): `periodoContratoActual()` siempre usaba "hoy" como referencia — una tarjeta ejecutada en julio, abierta en septiembre, mostraba el consumo del ciclo de septiembre. Ahora usa el `MAX(check_out)` de la propia tarea como fecha de referencia (si no tiene check_out aún, sigue usando hoy). El frontend muestra el rango del ciclo junto a Consumidas/Disponibles.

### fix urgente: reload de Ginno se demoraba minutos (regresión del fix anterior)

El query nuevo del punto anterior se disparaba por cada tarjeta tipo Contrato renderizada en el kanban (`_cargarHorasContratoCard`, `reportes.js`), no solo al abrir el modal — multiplicado por el auto-refresh cada 20s. Se eliminó ese cálculo de la renderización de tarjetas por completo (función y sus 2 call-sites); ahora solo se calcula al abrir el modal de una tarjeta específica. `reportes.js?v=20260903a`.

### fix real de fondo: dashboard lento — N+1 y subconsultas de proyecto en cada tarea de `GET tareas.php`

El fix anterior no era la causa real de fondo (Carlos confirmó que seguía lento). `backend/api/tareas.php` (llamado sin filtro en cada arranque y cada 20s): 1) `rowConTeam()` hacía una consulta a `tarea_equipo` POR CADA tarea devuelta (N+1) — ahora se trae el equipo de todas las tareas en una sola consulta y se agrupa en PHP. 2) Las 3 subconsultas de avance/horas/días de Proyecto se evaluaban para TODAS las tareas aunque solo aplican a tipo Proyecto — ahora envueltas en `CASE WHEN t.tipo_tarea = 'proyecto' THEN (...) ELSE NULL END`. Sin cambios de frontend/output. **No se pudo confirmar con `EXPLAIN`/`COUNT(*)` desde el sandbox** — si sigue lento, ese es el siguiente paso (correrlo en phpMyAdmin).

### fix: "Contrato" se revertía a "Evento" al seleccionarlo en el tipo de tarea

`onTipoTareaChange()` (`tareas.js`) volvía a llamar `_verificarContratoClientePorNombre()` en cada cambio del selector — incluida la propia selección de "Contrato" — pudiendo revertir la elección si esa segunda consulta fallaba. Ahora solo refresca el texto de horas, sin re-ocultar la opción ni resetear el valor. `tareas.js?v=20260903g`.

### hallazgo importante (no es bug): un cliente solo puede tener UN contrato (una sola `contrato_area`)

La ficha de cliente (`clientes.contrato_area`/`contrato_horas_mes`) solo admite un área de contrato por cliente. Si una tarjeta está en área IT pero el contrato del cliente es IF (o viceversa), "Contrato" correctamente NO aparece como tipo de tarea válido para esa tarjeta (tras la verificación async, que tarda unos ~3s contra producción — durante esa ventana la opción se ve pero luego se oculta si no coincide, lo cual puede parecer un bug pero es el comportamiento correcto dado el desajuste de área). Si Grupo Innovate necesita que un cliente tenga contrato en ambas áreas simultáneamente, hay que ampliar el modelo de datos (hoy es 1 columna `contrato_area`, no soporta múltiples).

### fix: horas ya reportadas no se descontaban al reclasificar una tarjeta a Contrato después de ejecutada

`horas_contrato` (en `visita_participantes`) solo se calculaba en el momento del checkout, y solo si en ESE momento la tarjeta ya era `tipo_tarea='contrato'`. Si una visita se ejecutaba con otro tipo (ej. Evento/IT) y la tarjeta se reclasificaba a Contrato DESPUÉS (como pasó con la tarjeta de cámaras que se movió a IF), ese campo quedaba en NULL para siempre — tanto el modal de la tarjeta como la tarjeta "Contratos vigentes" del dashboard excluyen explícitamente `horas_contrato IS NULL` de la suma de consumo. Fix: el cálculo (duración neta menos pausas, redondeo a bloques de 30 min, mínimo 0.5h) se extrajo a `calcularHorasContratoVisita()` en `backend/lib/contrato.php`, reutilizada por el checkout de `reportes.php`. Nueva función `backfillHorasContratoTarea()` en el mismo archivo: al guardar una tarjeta (`PUT tareas.php`) que queda en `tipo_tarea='contrato'`, rellena `horas_contrato` de cualquier participante ya finalizado (check_in+check_out) que aún no la tenga calculada, sin tocar valores ya existentes (incluidas ediciones manuales del admin). Solo backend, sin cambios de frontend/`?v=`. **Para que la tarjeta de cámaras (ya reclasificada a IF/Contrato) quede con sus 2.7h contadas, basta con abrirla y guardarla una vez desplegado este fix** — el backfill se dispara solo al guardar.

Ver detalle completo de cada fix en `DEPLOY.md` (sección "Cambios pendientes de deploy").

---

## Estado actual (última actualización: 2026-08-31 — visitas puntuales de proyecto, Escape cierra popups, fix PDF checkout, contrato oculto sin activo, aviso facturación Alegra, fix loop archivar)

### feat: visitas puntuales de proyecto (programación + alarma de tardío)

Nueva tabla `proyecto_visitas_programadas` + `backend/api/proyecto_visitas.php`. Al copiar la programación del día siguiente, si hay una tarjeta de Proyecto activa, un popup pide asignar técnico(s) + hora específica por proyecto (en vez de "Sin asignar" + hora de alarma). Esas mismas visitas se reutilizan para la alarma de "técnico tardío" (dedup diario vía `avisos_enviados`, tipo `proyecto_retraso`). `core.js?v=20260827c`, `alarma.js?v=20260827a`, `backend/api/alertas.php`.

### feat: Escape cierra cualquier popup/modal sin guardar

`_ESC_MODALES` en `tareas.js` — 16 de 17 modales cubiertos (excluidos intencionalmente `login-overlay` y `popup-tarea-terminada`), respetando orden de anidación.

### fix: PDF de cierre de visita mostraba checkout +5h

`reportes.js` usaba `new Date().toISOString()` (UTC) mal etiquetado como hora local Bogotá en 4 sitios de `generarPDFReporte()`. Nuevo helper `_ahoraBogotaSQL()` (Intl.DateTimeFormat timeZone America/Bogota) reemplaza los 4 usos. `reportes.js?v=20260831a`.

### fix: ocultar "Contrato" en tipo de tarea si el cliente no tiene contrato activo

La opción ya no solo queda deshabilitada — se oculta del todo (`hidden`+`disabled`) si el cliente no tiene contrato para esa área. `tareas.js?v=20260831a` (superado por el fix de área del 2026-09-03 arriba).

### feat: aviso claro + limpiar formulario al crear factura en Alegra

Antes no pasaba nada visible tras crear la factura. Ahora `alert()` con el resultado + limpieza del formulario. `facturacion.js?v=20260831a`.

### fix: loop al archivar con transporte pendiente + aviso motivo "Contrato" sin tipoTarea contrato

`_ejecutarArchivar()` no cerraba el modal ni era idempotente — repetía el aviso de transporte en cada intento. Ahora cierra modal y no hace nada si ya está archivada. Además, si se elige motivo "Contrato" al archivar sin ser tipoTarea=contrato, aparece confirmación para cambiar el tipo o cancelar. `tareas.js?v=20260831b`.

---

## Estado actual (última actualización: 2026-08-05 — integración Telegram Bot)

### feat: Notificaciones Telegram a técnicos (`backend/lib/telegram.php` + `tareas.php`)

**Infraestructura** (`backend/lib/telegram.php` — nuevo):
- `sendTelegramMsg($chatId, $texto)`: envía mensaje HTML al Bot API con timeout 5 s; silencioso si `TELEGRAM_BOT_TOKEN` no está definido
- `tecnicosConTelegram($pdo, $tareaId)`: igual que `tecnicosConEmail` pero filtra por `telegram_chat_id IS NOT NULL`
- `telegramTareaInfo($tarea)`: formatea cliente, título, fecha, hora, modalidad como texto HTML para Telegram

**Disparadores en `tareas.php`:**
- POST (nueva tarea): después del bloque de email, envía "📋 Nueva tarea asignada" a técnicos con `telegram_chat_id`
- PUT (cambio de fecha/hora): envía "📅 Cambio de programación"
- PUT (cambio de título/descripción): envía "✏️ Tarea modificada"

**Config del servidor** (`config.php` — NO en git): agregar:
```php
define('TELEGRAM_BOT_TOKEN', 'TOKEN_DEL_BOT');
```
Sin este define, las funciones retornan `false` silenciosamente — no rompe nada.

**Para registrar un técnico**: en Ginno → Usuarios → editar → campo "Telegram Chat ID". El técnico obtiene su ID escribiendo a `@userinfobot` en Telegram.

---

## Estado actual (última actualización: 2026-08-05 — campo Telegram Chat ID en usuarios)

### feat: Campo Telegram Chat ID en módulo de usuarios (`usuarios.js?v=20260805a`)

Preparación para integración con Telegram Bot. El campo es opcional — si está vacío (`NULL`) no se envía ningún mensaje.

- **BD**: nueva columna `usuarios.telegram_chat_id VARCHAR(20) NULL` (requiere `ALTER TABLE` manual antes del deploy)
- **Backend** (`usuarios.php`): SELECT, INSERT y UPDATE incluyen `telegram_chat_id`
- **Frontend** (`usuarios.js`): modal de usuario tiene nuevo input `#um-telegram`; se pobla al abrir y se incluye en el payload al guardar
- **Modal** (`tareas-equipo.html`): texto de ayuda indica que el técnico debe escribir a `@userinfobot` para obtener su ID

---

## Estado actual (última actualización: 2026-08-01 — informe para cliente v20260801c)

### feat: Informe para cliente con PDF (`informes.js?v=20260801c` + nuevo `backend/api/informe_cliente.php`)

Nueva opción **"📄 Informe para cliente"** en la pestaña Informes (solo admin).

**Backend** (`backend/api/informe_cliente.php` — nuevo):
- GET `?cliente=<nombre>&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD`
- Une `tareas` → `reportes` (estado='enviado') → `visita_participantes` (check_out IS NOT NULL) → `usuarios`
- Filtra por `DATE(CONVERT_TZ(vp.check_in, '+00:00', '-05:00'))` (Colombia UTC-5)
- COLLATE `utf8mb4_general_ci` en todos los JOINs (regla activa del proyecto)
- Retorna visitas agrupadas por `reporte_id` con: `descripcion_acciones`, `materiales`, `pendientes` (sin fotos), array de participantes con `duracion_minutos` individual, flag `es_contrato` si `horas_contrato IS NOT NULL`

**Frontend** (`assets/js/informes.js?v=20260801a`):
- Entrada `informe_cliente_pdf` en el objeto `INFORMES` con `campos: ['cliente', 'desde', 'hasta']`
- `obtenerClientesUnicos()` ahora incluye `_clientes` (tabla de clientes) además de tareas/reportes/facturas
- Selector de cliente: `<input type="text">` + `<datalist>` (ya existía este patrón; la lista ahora incluye todos los clientes del BD)
- Si el cliente tiene `contrato_horas_mes` aparece toggle **"Solo visitas de contrato"** (filtra visitas con `vp.horas_contrato IS NOT NULL`)
- Cada visita tiene botón 🙈/👁️ para excluirla/incluirla del PDF — resumen de totales se actualiza en tiempo real
- **Horas**: muestra **horas hombre** (suma de minutos de cada técnico por separado, no solo duración de la visita) — coherente con facturación por técnico
- Botón **🖨️ Guardar PDF**: abre nueva ventana con HTML estilizado (brand Innovate: `#0D3B40`/`#169BBC`), llama `window.print()` automáticamente; incluye CSS `@page { size: A4; }` y `print-color-adjust: exact`
- No depende de bibliotecas externas — solo DOM + fetch

**Refinamientos aplicados (v20260801b→c):** email footer → `info@innovate.com.co`; fix `about:blank` vía `@page{margin:0}` + `body{padding:18mm 20mm}`; texto actividades justificado; badge 📍 En sitio / 💻 Remoto por visita; checkbox "Redondear horas" (mín 1h + redondeo 30min para `en_sitio`); campo Materiales oculto si vacío; botones **"📅 Este mes"** / **"⬅️ Mes anterior"** para selección rápida del periodo (aparecen en todos los informes que usan fechas, función `setPeriodoRapido(tipo)`).

`tareas-equipo.html` bumpeado a `informes.js?v=20260801c`.

---

## Estado actual (última actualización: 2026-07-29 — edición de horarios de pausa restringida a admin)

### feat: editar horario de una pausa (solo admin)

**Problema**: en el historial de visitas, las pausas (check-in de descanso) solo se mostraban en modo lectura; no había forma de corregir una hora de pausa mal registrada.

**Solución** (mismo patrón que la edición de check-in/checkout existente — restringido a `perfil=admin` solo en el frontend, sin validación server-side):
- **Backend** (`backend/api/reportes.php`): nueva acción `accion='editPausa'` en el PUT de `reportes.php?id=`. Recibe `pausaId`, `pausaInicio` ("HH:MM"), `pausaFin` ("HH:MM" o null). Compone el datetime con la fecha del `pausa_inicio` existente, valida que fin > inicio, y hace `UPDATE visita_pausas`.
- **Frontend** (`assets/js/reportes.js?v=20260729c`): en `renderHistorialVisitasModal`, el bloque de pausas ahora renderiza inputs `type="time"` (`.hvp-pausa-in`/`.hvp-pausa-out`) + botón 💾 cuando `esAdmin`; para no-admin sigue siendo texto de solo lectura. Nueva función `guardarPausaVisita(btn)` hace el PUT y refresca el historial.

`tareas-equipo.html` bumpeado a `reportes.js?v=20260729c`.

**Nota de seguridad**: la restricción a admin es solo de UI (igual que el resto de ediciones admin en reportes.php) — el endpoint no valida el rol en el servidor. Pendiente si se quiere cerrar ese hueco: validar `token_sesion`/`perfil` en servidor para todas las acciones admin (editParticipante, editPausa, eliminarParticipante, eliminarReporteVisita).

---

## Estado actual (última actualización: 2026-07-29 — filtro cliente por texto en informes)

### feat: filtro cliente en informes cambiado de select a input de texto

**Problema**: el filtro "cliente" en la sección Informes era un `<select>` con lista fija; no permitía buscar ingresando letras.

**Fix** (`assets/js/informes.js?v=20260729b`):
- `actualizarCamposInforme()`: reemplazado `<select id="informe-cliente">` por `<input type="text" id="informe-cliente">` con `<datalist>` de sugerencias. Removida la optimización `dataset.built = '1'` del campo cliente para que el input se resetee al cambiar de informe.
- Todas las comparaciones exactas `=== filtros.cliente` cambiadas a substring case-insensitive: `(campo || '').toLowerCase().includes(filtros.cliente.toLowerCase())`. Afecta: `calcTarjetasCliente`, `calcFacturasModulo`, `calcReportesBusqueda`, `renderReportesBusquedaHTML`.

`tareas-equipo.html` bumpeado a `informes.js?v=20260729b`.

---

## Estado actual (última actualización: 2026-07-31 — fix doble check-in + checkout robusto)

### fix: Tres bugs de consistencia en el flujo checkout/reporte (`reportes.js?v=20260731a`)

**Bug 1 — "Iniciar visita hoy" aparecía junto a borrador de día anterior (causa del caso MS9C)**

En `renderVisitaBoton`, la rama de borradores mostraba "🚀 Iniciar visita hoy" aunque ya hubiera un "📝 Reporte pendiente" de un día anterior, permitiendo crear un segundo check-in duplicado.

Fix: para tareas de un solo día (`diasProg <= 1`), el botón "Iniciar visita hoy" solo aparece si `anteriores.length === 0`. Las tareas multi-día conservan el botón (el técnico legítimamente trabaja varios días).

**Bug 2 — `_pendingCheckout` se perdía al refrescar la página**

`_pendingCheckout` y `borradoresActivos` solo vivían en memoria JS. Al refrescar, el reporte volvía a aparecer como "activo" en el servidor y el técnico volvía a ver "Finalizar mi visita", capturando una hora de checkout incorrecta.

Fix: `_pendingCheckout` se persiste en `sessionStorage`. Al correr `cargarVisitasActivas()`, si se detecta un checkout pendiente guardado y la visita sigue activa en el servidor, se restaura el estado local (`borradoresActivos` + `visitasActivas`) para que la tarjeta muestre "📝 Continuar reporte" en lugar de los botones de checkout.

**Bug 3 — El email se enviaba aunque el checkout PUT fallara**

El checkout se registraba DESPUÉS del correo. Si el PUT fallaba silenciosamente, `visita_participantes.check_out` quedaba NULL con el reporte ya marcado como `enviado` → PDF mostraba "(En curso)".

Fix: `_completarCheckout()` ahora devuelve `true/false`. Si falla, restaura `_pendingCheckout` y sessionStorage para reintentar. En `enviarCorreoCliente()`, el checkout va PRIMERO; si falla, se muestra error al técnico y el correo NO se envía.

`tareas-equipo.html` bumpeado a `reportes.js?v=20260731a`.

---

## Estado actual (última actualización: 2026-07-28 — fix hora checkout en PDF)

### fix: Hora de checkout incorrecta en PDF (mostraba la hora del envío del correo, no del checkout real)

**Problema:** `_pendingCheckout` guardaba el checkout en el servidor solo cuando el técnico enviaba el reporte. Si pasaban horas entre el checkout y el envío, el servidor registraba `check_out = NOW()` (hora del email), no la hora real del checkout.

**Solución:**
- **Frontend** (`assets/js/reportes.js?v=20260728a`): `_pendingCheckout` captura `checkoutAt: new Date().toISOString()...` en el momento del checkout real. `_completarCheckout()` y `confirmarSinReporte()` envían `checkoutAt` en el body del PUT.
- **Backend** (`backend/api/reportes.php`): handlers `accion='checkout'` y `accion='sin_reporte'` leen `$d['checkoutAt']` y lo usan como `check_out`; si no viene (compatibilidad), usa `date('Y-m-d H:i:s')`.

`tareas-equipo.html` bumpeado a `reportes.js?v=20260728a`.

---

## Estado actual (última actualización: 2026-07-17 — fix resolverTareaTerminada + syncTask)

### fix: Tarjeta no pasaba a "Por facturar" al confirmar popup

**Problema en 3 capas:**

1. **Race condition auto-sync**: `resolverTareaTerminada(true)` llamaba `syncTask(...)` sin `await`. Si el auto-sync disparaba antes de que el PUT llegara al servidor, `load()` traía el estado viejo y revertía el local.
2. **`syncTask` no verificaba respuesta del servidor**: si el PUT retornaba 4xx/5xx, se ignoraba silenciosamente. Solo capturaba errores de red.
3. **Modal de tarea (`#modal`) quedaba abierto en segundo plano**: la visita se inicia desde el modal de la tarea, que permanece abierto mientras corre la visita y el reporte. Al confirmar el popup, el modal reaparecía con el estado antiguo; darle "Guardar" sobreescribía el 'realizado' recién guardado.

**`assets/js/core.js?v=20260625c`:**
- `syncTask`: verifica `res.ok`; si respuesta es 4xx/5xx, lanza el error con el mensaje del servidor + `alert()`.

**`assets/js/reportes.js?v=20260625d`:**
- `resolverTareaTerminada`: convertida a `async`; `await syncTask(...)` garantiza que el servidor actualiza antes de cualquier recarga; `await load(); render()` sincroniza la UI con el estado real del servidor; cierra `#modal` al inicio para evitar que datos viejos sobreescriban el estado.

`tareas-equipo.html` bumpeado a `core.js?v=20260625c` y `reportes.js?v=20260625d`.

---

### fix: Correo de reporte al cliente usa el mismo mensaje que WhatsApp

`backend/api/reporte_enviar_correo.php` — asunto y cuerpo ahora coinciden con el mensaje de WhatsApp:
- Asunto: `"🧾 Reporte de visita técnica — [Cliente]"`
- Cuerpo: "Buen día. Adjunto el reporte de visita técnica para **[titulo]** – [cliente], realizada el [fecha]." + agradecimiento + firma Grupo Innovate.
- `fechaVisita` calculada desde `$rep['check_in']` con `DateTime` en `America/Bogota` y meses en español.

---

### feat: Auto-sync polling cada 20s

`assets/js/app.js` — bloque `AUTO_SYNC`:
- `autoSync()`: llama `load()` + `render()` + `cargarVisitasActivas()` cada 20s.
- Se salta si `document.visibilityState === 'hidden'` o si `#modal`/`#reporte-modal` tienen clase `open`.
- `iniciarAutoSync()`: guard `_autoSyncActivo` para no duplicar el intervalo; llamado desde `iniciarApp()`.

---

### fix: Editar hora de checkout de técnico no actualizaba el reporte

`backend/api/reportes.php` — rama `editParticipante` ahora:
1. Elimina pausas fuera de la ventana [newIn, newOut] del participante editado.
2. Sincroniza `reportes.check_in`/`check_out` con `MIN`/`MAX` de todos los participantes vía query adicional.

`assets/js/reportes.js` — `guardarParticipanteVisita()`: cuenta pausas antes/después del save, muestra feedback "✅ (N pausa(s) eliminada(s))", refresca historial y `borradoresActivos`.

---

### fix: Pausas fuera de ventana check-in/checkout causaban duración negativa

- **Backend** (`reportes.php`): DELETE pausas fuera de [check_in, check_out] al editar participante.
- **Frontend** (`assets/js/tareas.js` — `calcularDuracionNeta`): clip de overlap a la ventana: `overlap = max(0, min(pf,b) − max(pi,a))`.

---

## Estado actual (última actualización: 2026-07-15 — rediseño estados reporte + reporte_interno)

### feat: Nuevos estados de reporte + campo reporte_interno

**Estados de reporte rediseñados:**
- `activo` — visita en curso (reemplaza `en_visita`)
- `sin_reporte` — visita finalizada sin reporte (reemplaza `borrador + sin_reporte=1`)
- `enviado` — reporte enviado por correo (reemplaza `borrador` con check_out)
- Ya no existen los estados `en_visita`, `borrador`, ni las columnas `sin_reporte`/`sin_reporte_at`

**Campo `reporte_interno` en `tareas`:**
- Solo visible para admin en tarjetas IT/IF
- Cuando está activo: al enviar el reporte solo llega al admin (`CORREO_ADMIN_FIJO`), no al cliente
- Asunto del correo cambia a `🔔 [Reporte interno] Visita técnica — ...`
- El técnico debe diligenciar y enviar el reporte igual; solo cambia el destinatario

**Archivos modificados:**
- `db/028_reporte_estados.sql` — migración de datos `en_visita`→`activo`, DROP columnas `sin_reporte`/`sin_reporte_at`, ADD `tareas.reporte_interno`
- `backend/api/reportes.php` — todos los estados actualizados; `accion=sin_reporte` escribe `estado='sin_reporte'`; `reporteHecho` check usa `['activo']`
- `backend/api/reporte_enviar_correo.php` — JOIN con `tareas` para `reporte_interno`; si activo → solo envía al admin; asunto diferenciado
- `backend/api/tareas.php` — UPDATE incluye `reporte_interno`
- `assets/js/core.js` — `taskToApi`/`apiToTask` incluyen `reporteInterno`
- `assets/js/reportes.js?v=20260715b` — estados `activo`/`enviado`/`sin_reporte` en toda la lógica; `borradoresActivos` solo local; badge "🚫 Sin reporte", "⏳ En curso"
- `assets/js/tareas.js?v=20260715b` — `grp-reporte-interno` show/hide (admin+IT/IF), populate desde `t.reporteInterno`, guarda en `saveTask()`
- `assets/js/informes.js?v=20260715a` — informe "🚫 Visitas sin reporte"; fix bug `areaLabel`/`areaColor` en `_informeFilas`
- `tareas-equipo.html` — checkbox `#grp-reporte-interno`/`#f-reporte-interno`, bumps a `?v=20260715b`

**⚠️ Pendiente de deploy:** ejecutar migración `028_reporte_estados.sql` en phpMyAdmin ANTES del deploy.

---

### feat: Visitas terminadas sin reporte (2026-07-15 — sesión anterior)

- Flujo checkout diferido: al finalizar el último participante la app abre el formulario de reporte. El checkout se escribe en el servidor solo cuando el técnico envía el reporte o confirma "sin reporte".
- Popup `#popup-sin-reporte` intercepta cualquier intento de cerrar el formulario sin enviar.
- `cargarAlertasSinReporte()` en dashboard muestra visitas con estado `sin_reporte` a admins.
- Migración `027_reporte_sin_reporte.sql` — ya ejecutada en producción (columnas `sin_reporte`/`sin_reporte_at` existen y son eliminadas por `028`).

---

## Estado actual (última actualización: 2026-07-11 — fix botón iniciar visita en tarea reprogramada)

### fix: Botón "Iniciar visita" no aparecía en tarjeta reprogramada para hoy

Cuando una tarea IT/IF tenía una visita previa (días atrás) y se reprogramaba para hoy, el botón desaparecía por dos condiciones independientes:

1. **`tareas.js` línea ~197:** La tarjeta no llamaba `renderVisitaBoton` si `estado='realizado'`. Fix: también la llama cuando `estado='realizado'` Y `fechaProg === hoy` (reprogramada).

2. **`reportes.js` dentro de `renderVisitaBoton`:** Al haber borradores de días anteriores, solo mostraba "Iniciar visita hoy" si `diasProg > 1`. Fix: también lo muestra si `fechaProg === hoy` (tarea de 1 día reprogramada para hoy).

Versiones bumpeadas a `?v=20260711b`.

---

## Estado actual (última actualización: 2026-07-11 — fix UX popup cierra modal)

### fix: Popup no cierra la tarjeta al completar acción

Cuando se interactuaba con un sub-popup (check-in, selector de técnico, popup-aprobar-area) desde dentro del modal de una tarjeta, el modal quedaba abierto. Dar "Guardar" después podía sobreescribir la acción del popup.

**Cambios en `assets/js/tareas.js?v=20260711a`:**
- `updateFormForArea()`: cuando `popup-aprobar-area` resuelve con IT o IF, ahora llama automáticamente `await saveTask()` (que incluye el cierre del modal). Ya no se requiere que el usuario pulse "Guardar" manualmente.

**Cambios en `assets/js/reportes.js?v=20260711a`:**
- `confirmarAdminCheckin()`: tras el POST exitoso, llama `closeModal()`.
- `ejecutarCheckin()`: tras el POST exitoso (online) o tras guardar en IndexedDB (offline), llama `closeModal()`.

`tareas-equipo.html` bumpeado a `?v=20260711a` para ambos archivos.

---

## Estado actual (última actualización: 2026-07-11 — PDF, correo cliente, diagnóstico cron)

### fix: Error 500 en endpoint `horasContrato`

`backend/api/reportes.php` — JOIN entre `visita_participantes` (unicode_ci) y `reportes` (general_ci) sin COLLATE causaba "Illegal mix of collations". Corregido con `COLLATE utf8mb4_general_ci` en ambos lados de los JOINs.

### fix: PDF del reporte

Tres mejoras en `assets/js/reportes.js`:
- **Fecha de visita**: agregada como fila en el encabezado del PDF (tomada de `r.check_in`, formato "9 de julio de 2026").
- **Tamaño**: logo y firma se convertían como bitmap PNG → jsPDF los almacenaba sin comprimir (~567KB solo el logo). Ahora se convierten a JPEG vía canvas antes de insertar. PDF bajó de ~1.8MB a ~350KB.
- **Nombre de archivo**: formato anterior `Innovate-YYYYMMDD-CLIENTE-LARGO.pdf`. Nuevo formato: `INICIALES-DDMMAA-SHORTID.pdf` (ej: `CCVH-090726-MRCJ.pdf`). Iniciales = primera letra de cada palabra del cliente (máx 5). ShortID = primeros 4 chars del ID de tarea en mayúsculas (igual al badge `#MRCJ` en la tarjeta).

### diagnóstico: Correo recordatorio a cliente

El cron `recordatorio_visita_email.php` (6pm diario) ya estaba configurado en cPanel. El email no llegaba por mismatch entre nombre del cliente en tarea vs tabla `clientes`. Verificado con endpoint de diagnóstico `backend/api/test_recordatorio.php?token=ginno_test&fecha=YYYY-MM-DD`. Cron ahora redirige output a `backend/cron/recordatorio_log.txt` (quitar `2>&1 > /dev/null`, reemplazar por `>> log 2>&1`).

### pendiente: Reestructura de estados IT/IF

Análisis completo realizado pero **no implementado** — en standby. Ver detalle en sesión 2026-07-11.

**Nuevos estados propuestos:** `pendiente` → `programada` → `en-ejecucion` → `por-facturar` → `facturado`

**Migración DB (ejecutar una sola vez):**
```sql
UPDATE tareas SET estado='pendiente'    WHERE estado='solicitud'  AND fechaProg IS NULL      AND area IN ('it','if');
UPDATE tareas SET estado='programada'   WHERE estado='solicitud'  AND fechaProg IS NOT NULL   AND area IN ('it','if');
UPDATE tareas SET estado='en-ejecucion' WHERE estado='programado' AND area IN ('it','if');
UPDATE tareas SET estado='por-facturar' WHERE estado='realizado'  AND area IN ('it','if');
```

**Archivos a modificar:** `core.js`, `tareas.js` (15+ refs), `alarma.js`, `reportes.js`, `backend/api/tareas.php`, `backend/api/reportes.php`.

---

## Estado actual (última actualización: 2026-07-09 — configuración email/DNS)

### Investigación: alerta de suplantación en Gmail (julio 2026)

Gmail Workspace emitió una alerta MEDIUM de posible suplantación (spoofing) por correos enviados desde `ginno@grupoinnovate.com` con el nombre "Grupo Innovate" hacia `administrativo@innovate.com.co`. El problema es que el display name coincide con usuarios del dominio `innovate.com.co`, activando la detección de spoofing.

**Estado actual de autenticación de email para `grupoinnovate.com`:**
- **DKIM**: ✅ Válido y configurado correctamente en Dongee.
- **SPF**: ❌ No configurado — cPanel detecta IP privada `192.168.0.100` (detrás de NAT, inutilizable en SPF público). El servidor usa HELO `zion.dongee.com`.
- **PTR/Reverse DNS**: ⚠️ No aplica para IP privada — problema de configuración interna de Dongee (no accionable por el usuario).

**DNS externo en Dongee — cPanel no puede modificar registros directamente:**
- Nameservers: `ns1.dongee.com`, `ns2.dongee.com`, `ns3.dongee.com`
- El botón "Repair" en cPanel → Email Deliverability está **inactivo** por este motivo.

**Acción pendiente en Dongee (panel DNS de `grupoinnovate.com`):**
Agregar registro TXT:
```
Nombre: @
Tipo:   TXT
Valor:  v=spf1 a:zion.dongee.com ~all
```
Si ya existe un registro SPF, agregar `a:zion.dongee.com` antes del `~all` existente (no crear dos registros SPF).

**Acción adicional recomendada (en servidor — cPanel File Manager):**
En `backend/config/config_correo.php`, cambiar `CORREO_FROM_NOMBRE` de `'Grupo Innovate'` a `'Ginno · Innovate'` para que el display name no coincida con nombres de usuarios del dominio `innovate.com.co`.

**No se hicieron cambios de código en esta sesión.**

---

## Estado actual (última actualización: 2026-07-04 — mejoras UI)

### feat: Vista Clientes — tabla + buscador + filtros + paginación

**Archivo:** `assets/js/clientes.js`

Reemplazada la vista de tarjetas por una tabla con las siguientes columnas: **Nombre · Dirección · GPS · Transporte · Contrato · Plazo · Editar**.

**Buscador:** `<input>` que filtra en tiempo real por nombre o dirección del cliente.

**Filtros chip** (toggle, se iluminan al estar activos):
- 🚗 Con transporte → `valor_transporte > 0`
- 📋 Con contrato → `contrato_area` no nulo

**Paginación:** 25 clientes por página; numeración compacta con puntos suspensivos; scroll suave al inicio de la tabla al cambiar página.

**Estado local:** `_cliSearch`, `_cliFiltroT`, `_cliFiltroC`, `_cliPagina` (se resetean al entrar a la vista).
**Funciones globales:** `cliSetSearch(val)`, `cliToggleFiltro('t'|'c')`, `cliSetPagina(n)`.

La columna GPS muestra ⚠️ clickeable que abre directamente el modal de edición.
La columna Transporte muestra el valor formateado en pesos colombianos o "—".
La columna Contrato muestra chip verde con área y horas/mes o "—".

### feat: Panel ⚙️ Configuración + Usuarios en header

Tabs "Usuarios" y "Configuración" eliminados del menú de pestañas. Reemplazados por botón ⚙️ en el header (solo admin) que abre panel full-screen overlay con:
- Sección **👥 Usuarios** arriba (renderiza `renderUsuariosView()`)
- Sección **🔔 Avisos a técnicos** abajo (renderiza `renderConfiguracion()`)
- Botón "✕ Cerrar" sticky en la parte superior

Funciones: `toggleSettings()`, `abrirSettings()`, `cerrarSettings()` en `configuracion.js`.

---

## Estado actual (última actualización: 2026-07-04 — sesión noche, segunda parte)

### feat: PWA offline — check-in/checkout sin conexión

**Objetivo**: técnico sin señal en sitio cliente puede marcar check-in y checkout; al recuperar señal los datos se sincronizan automáticamente.

**Archivos nuevos:**
- `assets/js/offline.js` — módulo IIFE con IndexedDB (`ginno-offline-db`, store `cola`):
  - `offlineInit()` — abre DB, registra listeners `online`/`offline`, escucha mensajes del SW (`SYNC_COMPLETE`)
  - `offlineEnqueue(url, method, bodyObj)` — guarda request pendiente en IndexedDB con `crypto.randomUUID()` como id
  - `offlineGetCola()` — devuelve items ordenados cronológicamente
  - `offlineDeleteItem(id)` — elimina item procesado
  - `offlineProcesarCola()` — itera la cola secuencialmente, envía cada request, borra los exitosos; llama `cargarVisitasActivas()` y `render()` al terminar
  - Banner `#offline-banner` (sticky, teal): muestra "📵 Sin conexión" o "⏳ Sincronizando N registro(s)"

**sw.js (reemplazado):**
- `install` — pre-cachea `tareas-equipo.html`; `skipWaiting()`
- `activate` — limpia caches viejos; `clients.claim()`
- `fetch` — Network First para `/backend/api/` GETs (cachea respuestas ok); Cache First para estáticos
- `sync (ginno-sync)` — lee IndexedDB, procesa cola en orden cronológico, borra exitosos, postMessage `SYNC_COMPLETE` a clientes abiertos

**backend/api/reportes.php (modificado):**
- POST ahora acepta `$d['id']` como reporteId y `$d['participanteId']` (generados en cliente con `crypto.randomUUID().replace(/-/g,'')`); fallback a `bin2hex(random_bytes(16))` si no vienen
- INSERTs de `reportes` y `visita_participantes` cambiados a `INSERT IGNORE` para idempotencia en reintentos

**assets/js/reportes.js (modificado):**
- `ejecutarCheckin(tecnicoId)` — genera `reporteId` y `participanteId` antes del fetch; si `!navigator.onLine` llama `offlineEnqueue` y crea estado local `visitasActivas[tareaId]` con `_offline:true`
- `finalizarVisitaParticipante.ejecutar(tecnicoId)` — mismo patrón: encola PUT checkout offline, actualiza `participantes[i].check_out` localmente

**assets/js/app.js (modificado):**
- `iniciarApp()` llama `offlineInit()` al final (fire-and-forget)

**tareas-equipo.html (modificado):**
- Div `#offline-banner` sticky después de las tabs
- Scripts `offline.js?v=20260704n` y bump `reportes.js?v=20260704n`, `app.js?v=20260704n`

**Flujo completo:**
1. App cargada en línea → SW cachea assets y respuestas API
2. Técnico pierde señal → banner muestra "📵 Sin conexión"
3. Check-in: genera IDs en cliente → encola en IndexedDB → UI muestra visita activa
4. Checkout: encola PUT en IndexedDB → UI muestra visita cerrada localmente
5. Al recuperar señal: `offlineProcesarCola()` envía en orden (check-in antes de checkout) → servidor INSERT IGNORE hace el resto → `cargarVisitasActivas()` sincroniza con datos reales del servidor

---

## Estado actual (última actualización: 2026-07-04 — sesión noche)

### feat: módulo Configuración + Avisos a técnicos por correo

**Propósito**: sección admin-only para activar/desactivar 6 tipos de correo automático a los técnicos.

**Base de datos:**
- `db/025_configuracion.sql` — tabla `configuracion (clave VARCHAR(60) PK, valor TEXT, updated_at DATETIME)` con 6 filas INSERT IGNORE (todas en `'0'`).
- `db/026_avisos_enviados.sql` — tabla `avisos_enviados (id CHAR(32) PK, tipo, tecnico_id, tarea_id, fecha DATE, UNIQUE KEY uk_aviso)` para deduplicar envíos de cron.

**Backend — lib:**
- `backend/lib/avisos_tecnicos.php`: helpers compartidos por `tareas.php` y los crons:
  - `configGet(PDO, clave)` — lee un valor de `configuracion`.
  - `tecnicosConEmail(PDO, tareaId)` — devuelve [{id, nombre, email}] del equipo con email registrado.
  - `enviarAvisoTecnico(email, nombre, asunto, htmlCuerpo)` — wrapper silencioso sobre `enviarCorreoConAdjunto`.
  - `htmlAvisoTecnico(nombre, intro, contenido)` — HTML con marca Innovate (verde `#0D3B40`, cian `#169BBC`).
  - `htmlTareaInfo(tarea)` — tabla HTML con datos de la tarea (cliente, título, fecha, hora, modalidad, descripción).
  - `registrarAvisoEnviado(PDO, tipo, tecnicoId, tareaId, fecha)` — INSERT IGNORE en `avisos_enviados`.
  - `avisoYaEnviado(PDO, tipo, tecnicoId, tareaId, fecha)` — verificación de duplicado.

**Backend — API:**
- `backend/api/configuracion.php` — GET: devuelve todos los pares como objeto JSON; POST: upsert de los pares enviados.

**Backend — tareas.php (modificado):**
- SELECT en PUT ampliado para incluir `hora_programacion, titulo, descripcion, cliente, area, modalidad, dias_programacion`.
- POST: después de `registrarHistorial`, si `aviso_asignacion_tarea=1` y área es IT/IF, envía email a cada técnico del equipo con correo.
- PUT: después de `registrarHistorial`, detecta y envía según configuración:
  - Cambio en `fecha_programacion` o `hora_programacion` → `aviso_cambio_programacion`.
  - Cambio en `titulo` o `descripcion` → `aviso_cambio_descripcion`.
  - Todo envuelto en try/catch silencioso para no bloquear la operación principal.

**Cron jobs:**
- `backend/cron/avisos_dia_anterior.php`: se ejecuta a las 5 p.m. (`0 17 * * *`). Busca tareas IT/IF en estado `programado` para mañana. Agrupa por técnico y envía un correo por técnico con la lista. Usa `registrarAvisoEnviado` con `tarea_id='multiple'` para evitar duplicados por día.
- `backend/cron/avisos_tiempo.php`: se ejecuta cada 10 min (`*/10 * * * *`). Usa hora Bogotá (`America/Bogota`). Para cada tarea IT/IF programada para hoy:
  - `aviso_30min_antes`: ventana `horaProg - 30 min ± 5 min`; solo si no hizo check-in.
  - `aviso_10min_sin_checkin`: ventana `horaProg + 10 min ± 5 min`; solo si no hizo check-in.
  - Usa `avisoYaEnviado` / `registrarAvisoEnviado` para no repetir.

**Frontend:**
- `assets/js/configuracion.js?v=20260704k` (nuevo): IIFE que expone `renderConfiguracion()` y `cfgToggle(clave)` globalmente.
  - `renderConfiguracion()`: fetch a `configuracion.php`, dibuja panel con sección "Avisos a técnicos" y 6 toggle switches.
  - `cfgToggle(clave)`: actualización optimista del toggle + POST a `configuracion.php`.
- `assets/js/auth.js`: muestra `tab-configuracion` solo cuando `!esTecnico`.
- `assets/js/tareas.js`: `isConfiguracion` en `setArea()`; llama `renderConfiguracion()` al entrar.
- `tareas-equipo.html`: tab `⚙️ Configuración` (id `tab-configuracion`), div `configuracion-view`, `<script src="configuracion.js?v=20260704k">`.

**Los 6 toggles:**
| Clave | Descripción |
|-------|-------------|
| `aviso_asignacion_tarea` | Correo al asignar tarea nueva |
| `aviso_cambio_programacion` | Correo al cambiar fecha u hora |
| `aviso_cambio_descripcion` | Correo al editar título o descripción |
| `aviso_dia_anterior` | Resumen de mañana a las 5 p.m. (cron) |
| `aviso_30min_antes` | Recordatorio 30 min antes (cron) |
| `aviso_10min_sin_checkin` | Aviso 10 min sin check-in (cron) |

---

## Estado actual (última actualización: 2026-07-04 — sesión tarde)

### feat: snapshot de programación por participante (anti-retroactividad)
- **Problema**: cambiar `fecha_programacion`/`hora_programacion` de una tarea afectaba retroactivamente el badge "Tardía" en visitas pasadas.
- **Solución**: guardar una copia (snapshot) por participante al momento del check-in.
- **Migración**: `db/024_visita_participantes_prog_snap.sql` — agrega `fecha_prog_snap DATE NULL` y `hora_prog_snap VARCHAR(5) NULL` a `visita_participantes`.
- **`backend/api/reportes.php`**: SELECT ahora incluye `fecha_programacion, hora_programacion`; variables `$snapFecha`/`$snapHora` definidas tras la consulta; ambos INSERT en `visita_participantes` incluyen las dos columnas nuevas.
- **`assets/js/reportes.js?v=20260704f`**: badge "Tardía" usa `p.hora_prog_snap || horaProg` y `p.fecha_prog_snap || fechaProg` con fallback para visitas históricas (NULL snap).

### feat: transportes — fix INT→VARCHAR + trayectos
- **Bug crítico**: `transportes.participante_id` y `tecnico_id` eran INT; los UUIDs se casteaban a 0; todos los registros fallaban silenciosamente. `db/022_fix_transportes_tipos.sql`: DELETE FROM transportes + ALTER a VARCHAR.
- **`db/023_transportes_trayectos.sql`**: ADD COLUMN `trayectos TINYINT NOT NULL DEFAULT 2` a `transportes`.
- **Lógica trayectos**: `valor` = precio unitario snapshot del cliente; `trayectos` = 0/1/2 (primera visita del técnico ese día = 2, adicionales = 0); total = `trayectos × valor` calculado en frontend.
- **`backend/api/transportes.php`** (reescrito completo): COLLATE en JOINs; sin `(int)` casts; PUT maneja `{ trayectos }` y `{ estado }`; GET devuelve `trayectos` como int.
- **`assets/js/transportes.js?v=20260704e`** (reescrito): columna Trayectos con `<select>` 0/1/2 en pendientes; nota de advertencia para trayectos=0; totales `trayectos × valor`; `_transpCambiarTrayectos()`.
- **`backend/cron/recalcular_transportes.php`** (nuevo): script one-time para reconstruir histórico de transportes. COLLATE en todos los JOINs. Detecta primera visita del día por técnico (trayectos=2) vs adicionales (trayectos=0).

### feat: bitácora — nota_tipo separado de nota
- `db/021_bitacora_nota_tipo.sql`: ADD COLUMN `nota_tipo VARCHAR(50) NULL` a `bitacora_usuario`.
- `backend/api/bitacora.php`: GET devuelve `nota_tipo`; POST requiere `nota_tipo`, acepta `nota` opcional; DELETE limpia ambos.
- `assets/js/bitacora.js?v=20260704d`: radio buttons para tipo; textarea siempre visible; badge teal para tipo + texto ámbar para nota.

### feat: alarmas — tardía vs incumplida + persistencia localStorage
- **Tardía** (solo el día de programación, hoy hábil): alarma sonido+popup + banner rojo superior.
- **Incumplida** (`fechaProgFin < hoy`, tarea sigue en `programado`): alerta naranja `#F54927` en zona de alertas (primera posición, bajo el título "🔔 Zona de alertas"), sin sonido. Desaparece cuando: check-in+out llenado, programación cambiada, o programación borrada.
- **Tarjeta kanban**: borde izquierdo `#F54927` + fondo `#fff3f0` + badge `⛔ Incumplida — sin check-in el día programado`.
- **Días no hábiles**: tardía no dispara en sábado, domingo ni festivos colombianos (`esDiaHabil` guard en `alarma.js` y `tareas.js`).
- **Persistencia**: `_retrasoAlertadas` se guarda en `localStorage` con clave `retraso_alertadas_YYYY-MM-DD`; al recargar la página el popup ya no repite; clave se auto-limpia al día siguiente.
- **Archivos**: `assets/js/alarma.js?v=20260704g`, `assets/js/tareas.js?v=20260704j`.
- **Versiones en HTML**: `tareas.js?v=20260704j`, `alarma.js?v=20260704g`, `reportes.js?v=20260704f`.

### Glosario ampliado
| Término | Definición |
|---------|-----------|
| **tardía** | Tarea programada para HOY (hábil) cuya hora pasó y el técnico no hizo check-in. Genera alarma + banner. |
| **incumplida** | Tarea IT/IF con `estado=programado` y `fechaProgFin < hoy`. Se muestra como alerta naranja en dashboard y marca la tarjeta en el tablero. Se resuelve con check-in+out, cambio de programación, o borrado de programación. |

---

## Estado actual (última actualización: 2026-07-04)

- **fix: colores de tabs activos en pestañas sin color (2026-07-04)**
  - Pestañas `agenda`, `usuarios`, `clientes`, `transportes`, `bitácora` no tenían color de fondo cuando estaban activas → texto blanco sobre fondo transparente = ilegible.
  - Solución: `assets/css/app.css` — agregadas 5 reglas `.area-tab[data-area="X"].active`:
    - `agenda` → `#169BBC` (cian marca)
    - `usuarios` → `#0D3B40` (teal oscuro + borde cian)
    - `clientes` → `#F29206` (naranja marca)
    - `transportes` → `#169BBC` (cian marca)
    - `bitacora` → `#0D3B40` (teal oscuro + borde cian)
  - Sin cambios de JS ni SQL. Sin bump de caché necesario.

- **feat: bitácora — pausas descontadas, horario detallado, columna Observaciones (2026-07-04)**
  - **Horas reales ya descuentan pausa de almuerzo**: tanto el cálculo en tiempo real (frontend) como el cron noche (`bitacora_deficit.php`) restan los minutos de `visita_pausas` (pausa completada) de la duración bruta de cada visita.
  - **Columna Horario muestra detalle**: `check_in ⏸pausa_inicio ▶pausa_fin → check_out`. Múltiples pausas se encadenan. Pausa en amarillo `#f59e0b`, reanuda en verde `#4ade80`. Si no hay pausas: solo `hora_inicio → hora_fin`.
  - **Columna "Observaciones" nueva**: aparece entre Estado y Nota. Auto-generada: si una visita duró > 4h bruto sin ninguna pausa registrada → badge `⚠ Sin pausa registrada`.
  - **Fix bug festivosColombia()**: `$y-07-04` (4 de julio) no es festivo colombiano — eliminado de `bitacora_deficit.php`.

  ### Archivos modificados
  - `backend/api/bitacora.php`: query de visitas agrega `vp.id AS participante_id` y subquery `mins_pausa`; nueva query `stmtPausas` devuelve registros de `visita_pausas`; `jsonOut` ahora retorna `{tecnicos, dias, visitas, pausas}`.
  - `backend/cron/bitacora_deficit.php`: `stmtVis` resta pausas via subquery; eliminado `$y-07-04` de `festivosColombia()`.
  - `assets/js/bitacora.js?v=20260704a`: `_bitRenderTabla()` construye `pausasIdx`; resta `mins_pausa` del cálculo real-time; nueva función `_bitHorarioCell(v, pausas)` renderiza horario detallado; nueva función `_bitObsCell(v, pausas)` genera observaciones; tabla agrega columna "Observaciones".
  - `tareas-equipo.html`: bump `bitacora.js?v=20260703a` → `?v=20260704a`.

  ### COLLATE en pausas
  - `visita_pausas.participante_id COLLATE utf8mb4_general_ci = vp.id COLLATE utf8mb4_general_ci` en todas las comparaciones (ambas tablas son `unicode_ci`, servidor en `general_ci`).

## Estado actual (última actualización: 2026-07-29)

### fix: múltiples bugs en reportes (horasContrato 500, check-out no sincroniza, Sin reporte con PDF)

**500 en `?horasContrato=1`**
- Causa: COLLATE aplicado al parámetro `?` en prepared statements (`? COLLATE utf8mb4_general_ci`), sintaxis que MySQL no acepta en statements preparados.
- Fix: todos los queries `horasContrato` usan ahora `col COLLATE utf8mb4_general_ci = ?` (sin COLLATE en el `?`). Los JOINs de `visita_participantes` corregidos a `ON r2.id = vp.reporte_id COLLATE utf8mb4_general_ci`.
- La columna `horas_contrato DECIMAL(4,1) NULL` ya existía en producción (agregada manualmente). Migración `migracion_horas_contrato.sql` queda como referencia.

**Check-out editado no se refleja en historial ni PDF**
- Causa: `guardarCabeceraReporte()` hace `PUT reportes.php` que actualizaba `reportes.check_out` pero NO `visita_participantes.check_out`. El historial y el PDF leen de `visita_participantes`.
- Fix: en el PUT general, si `checkIn`/`checkOut` cambian y el reporte tiene exactamente 1 participante, se sincroniza `visita_participantes.check_in/check_out`.

**"Sin reporte" aunque tiene PDF**
- Causa: estado `sin_reporte` persiste aunque se genere PDF después.
- Fix: en el PUT, cuando `pdfArchivo` se recibe sobre un reporte en estado `sin_reporte`, se promueve a `activo`.

**Reportes en estado `borrador` no abribles**
- Fix: `reportesAbribles` en `reportes.js` ahora incluye `borrador` además de `activo`/`enviado`/`sin_reporte`.

- **Archivos**: `backend/api/reportes.php`, `assets/js/reportes.js?v=20260729a`.

---

## Estado actual (última actualización: 2026-07-08)

### fix: "Iniciar visita" no reaparece en tareas de un solo día tras enviar el reporte
- **Problema**: después de check-in → checkout → enviar reporte, la tarjeta volvía a mostrar "🚀 Iniciar visita". Correcto para tareas multi-día, incorrecto para tareas de un día.
- **Solución**: nuevo endpoint `GET reportes.php?tarea_ids_enviados=1` → `SELECT DISTINCT tarea_id FROM reportes WHERE estado='enviado'` (muy liviano). `cargarVisitasActivas()` lo carga en paralelo y popula `reportesEnviados = new Set()`. En `renderVisitaBoton()`, si `(t.diasProg||1) <= 1` y `reportesEnviados.has(t.id)` → muestra `✅ Visita completada`. Tareas multi-día no se afectan.
- **Archivos**: `backend/api/reportes.php`, `assets/js/reportes.js?v=20260708a`.

### fix: correo del cliente se captura desde Alegra al momento de creación/selección
- **Problema raíz**: `seleccionarClienteAlegraIdx` en `tareas.js` llamaba `sincronizarClienteAlegra(c.name, c.id, c.address)` sin pasar `c.email`. `sincronizarClienteAlegra` en `clientes.js` tampoco lo aceptaba ni guardaba. Al auto-crear el cliente (al guardar una tarea) solo se guardaban nombre, alegra_id y dirección.
- **Fix**:
  - `tareas.js` → `seleccionarClienteAlegraIdx` ahora pasa `c.email || null` como cuarto argumento.
  - `clientes.js` → `sincronizarClienteAlegra(nombre, alegraId, direccion, email)`: si `email` viene null pero hay `alegraId`, hace un `GET alegra_contactos.php?id={alegraId}` para traer el contacto completo **antes** del POST. El email se incluye en el POST inicial y también en el PUT de completar datos faltantes.
  - `_seleccionarCmIdx()` en el modal de clientes: misma lógica — si `c.email` es null, fetch `?id=X` al seleccionar.
- **Backend**: handler `GET ?id=X` en `alegra_contactos.php` → `GET /contacts/{id}` en Alegra → retorna `{id, name, address, email}`.
- **Archivos**: `backend/api/alegra_contactos.php`, `assets/js/tareas.js?v=20260708b`, `assets/js/clientes.js?v=20260708c`.

### fix: validación "Por facturar" acepta reporte Ginno ya enviado
- **Problema**: `saveTask()` verificaba `borradoresActivos[editingId]` para saber si existe reporte Ginno. Cuando el reporte ya está en estado `enviado` no está en `borradoresActivos` → validación fallaba aunque el reporte existía.
- **Fix**: `tieneReporteGinno` ahora también acepta `reportesEnviados.has(editingId)` (el Set poblado en `cargarVisitasActivas`). La condición queda: borrador pendiente OR ya enviado.
- **Archivo**: `assets/js/tareas.js?v=20260708a`.

### feat: cerrar modal tarjeta con Escape (PC)
- Listener `keydown` en `tareas.js`: `Escape` cierra `#modal` o `#cartera-modal` según cuál esté abierto.
- **Archivo**: `assets/js/tareas.js?v=20260708a`.

---

## Estado actual (última actualización: 2026-07-03)

- **feat: aviso por correo al cliente (2026-06-30)** — pendiente de deploy:

  Envía un correo HTML al cliente el día anterior a una visita IT/IF programada.

  ### Condiciones de envío
  - Área IT o IF, `fecha_programacion = mañana`, `avisar_cliente = 1`
  - Al menos un técnico asignado (`tarea_equipo`)
  - Cliente tiene `email` registrado en tabla `clientes`

  ### Campos nuevos
  - `clientes.email VARCHAR(255) NULL` — auto-poblado al crear/seleccionar cliente desde Alegra; editable en modal de cliente.
  - `usuarios.cedula VARCHAR(20) NULL` y `usuarios.foto VARCHAR(255) NULL` — datos del técnico, aparecen en el correo.
  - `tareas.avisar_cliente TINYINT(1) NOT NULL DEFAULT 1` — checkbox en tarjetas IT/IF (marcado por defecto).

  ### Correo
  - Asunto: "📅 Visita programada para mañana {fecha} — Grupo Innovate"
  - Incluye: nombre del servicio, descripción (si la hay), fecha larga en español, hora, foto/nombre/cédula de cada técnico asignado.
  - Contacto para cancelar: soporte@innovate.com.co / 317 645 2811
  - Foto del técnico servida desde `backend/api/foto_tecnico.php?usuario_id=X`

  ### Migraciones SQL
  - `db/018_clientes_email.sql` — `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL AFTER nombre`
  - `db/019_usuarios_cedula_foto.sql` — `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cedula VARCHAR(20) NULL, ADD COLUMN IF NOT EXISTS foto VARCHAR(255) NULL`
  - `db/020_tareas_avisar_cliente.sql` — `ALTER TABLE tareas ADD COLUMN IF NOT EXISTS avisar_cliente TINYINT(1) NOT NULL DEFAULT 1 AFTER tipo_tarea`

  ### Archivos nuevos
  - `backend/api/foto_tecnico.php` — GET sirve foto (MIME correcto), POST sube (jpg/png/webp → `backend/uploads/fotos/{uid}.{ext}`), DELETE elimina.
  - `backend/cron/recordatorio_visita_email.php` — cron 6pm; cero output. Cron command: `0 18 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/recordatorio_visita_email.php > /dev/null 2>&1`

  ### Archivos modificados
  - `backend/api/alegra_contactos.php` — extrae email del contacto Alegra (soporta string o array de objetos con `.address`).
  - `backend/api/clientes.php` — INSERT y UPDATE incluyen `email`.
  - `backend/api/usuarios.php` — GET devuelve `cedula` y `foto`; INSERT y UPDATE incluyen `cedula`.
  - `backend/api/tareas.php` — INSERT y UPDATE incluyen `avisar_cliente` (default 1).
  - `assets/js/core.js` — `taskToApi`/`apiToTask` incluyen `avisarCliente`.
  - `assets/js/clientes.js` — auto-rellena `email` al seleccionar desde autocomplete de Alegra (si la búsqueda no lo trae, hace GET ?id= al elegir el contacto); lo guarda en BD al confirmar con "Guardar".
  - `assets/js/usuarios.js` — modal incluye `cedula`, foto upload/preview/eliminar.
  - `assets/js/tareas.js` — checkbox `#f-avisar-cliente` visible en IT/IF; se carga en `openModal()` y se lee en `saveTask()`.
  - `tareas-equipo.html` — campo email en modal cliente; checkbox avisar cliente en formulario de tarea; campos cedula/foto en modal usuario.

- **feat: módulo Bitácora de técnicos (2026-06-30)** — pendiente de deploy:

  Control de horario contratado vs horas reales de campo, con alerta en el dashboard y justificaciones del admin.

  ### Diseño (Opción B — implementado)
  - Horario semanal guardado en columnas `h_lun…h_dom DECIMAL(4,2) NULL` + `horario_desde DATE` directamente en tabla `usuarios` (NULL = no trabaja ese día).
  - Nueva tabla `bitacora_usuario` (una fila por técnico+día hábil). Cron inserta/actualiza solo **ayer** cada noche.
  - `estado` ENUM: `ok` | `deficit_sin_nota` | `deficit_con_nota`.
  - Dashboard cuenta `COUNT(*) WHERE estado='deficit_sin_nota'` por técnico → muestra banner con "X días pendientes" hasta que el admin justifique todos.
  - Vista bitácora: itera técnicos × días hábiles del rango. Días con fila en `bitacora_usuario` usan datos pre-calculados; días sin fila (hoy o anteriores al primer cron) calculan horas en tiempo real desde `visita_participantes`.
  - Admin escribe nota de justificación por día; estado pasa a `deficit_con_nota`. Puede borrar la nota (vuelve a `deficit_sin_nota` si sigue en déficit).
  - Visitas sin check-out: "en curso", no cuentan en horas.
  - Tolerancia: 3 min (0.05 h). `horas_real >= horas_esp - 0.05` → `ok`.
  - Cron command (cPanel, sin correos): `0 23 * * * /usr/bin/php /home/tu-usuario/public_html/ginno/backend/cron/bitacora_deficit.php > /dev/null 2>&1`

  ### Migraciones SQL (ejecutar en phpMyAdmin)
  - `db/016_usuarios_horario_cols.sql` — `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS h_lun…h_dom DECIMAL(4,2) NULL, horario_desde DATE NULL`.
  - `db/017_bitacora_usuario.sql` — tabla `bitacora_usuario` (`id CHAR(32) PK`, `tecnico_id`, `fecha DATE`, `horas_real DECIMAL(5,2)`, `horas_esp DECIMAL(4,2)`, `estado ENUM(...)`, `nota TEXT`, `admin_id`, `updated_at`, UNIQUE `(tecnico_id, fecha)`).

  ### Archivos nuevos
  - `backend/api/horario.php` — `GET ?usuario_id=X` (lee h_lun…h_dom, horario_desde de usuarios), `PUT ?usuario_id=X` (UPDATE usuarios SET h_lun=?…).
  - `backend/api/bitacora.php` — `GET ?dashboard=1` (JOIN bitacora_usuario+usuarios WHERE estado='deficit_sin_nota', GROUP BY tecnico); `GET ?desde=&hasta=` (retorna `{tecnicos, dias, visitas}`); `POST` (guarda nota; si fila existe: UPDATE estado='deficit_con_nota'; si no: INSERT con horas_esp del horario del técnico); `DELETE ?tecnico_id&fecha` (borra nota, restaura estado).
  - `backend/cron/bitacora_deficit.php` — zero output; procesa solo AYER; detecta festivos Colombia (implementación PHP interna); ON DUPLICATE KEY UPDATE preserva `deficit_con_nota` si sigue en déficit.
  - `assets/js/bitacora.js?v=20260703a` — `renderBitacoraView()`, `_bitCargar()`, `_bitRenderTabla()`, `_bitRowBg()`, `_bitBadge()`, `_bitNotaCell()`, `_bitAbrirNota()`, `_bitGuardarNota()`, `_bitBorrarNota()`, `bitacoraCheckDashboard()`, `_bitDiasHabiles()`, `_fmtH()`.
    - **fix (2026-07-03):** `_bitGuardarNota` leía `localStorage.getItem('sesion')` (clave inexistente) → `admin_id` llegaba vacío → backend rechazaba con "tecnico_id, fecha, nota y admin_id son requeridos". Corregido a `currentUser?.id`.

  ### Archivos modificados
  - `assets/js/usuarios.js` — modal de usuario: sección "Horario contratado" con checkboxes por día + input horas + vigente_desde. Funciones nuevas: `_bitCargarHorarioModal`, `_bitRenderHorarioModal`, `_umToggleDia`, `_umGuardarHorario`.
  - `assets/js/tareas.js` — `setArea()`: agrega `isBitacora`, muestra/oculta `#bitacora-view`, llama `renderBitacoraView()`.
  - `assets/js/auth.js` — oculta `#tab-bitacora` para técnicos; llama `bitacoraCheckDashboard()` para admins al iniciar sesión.
  - `tareas-equipo.html` — tab `📋 Bitácora` (id=`tab-bitacora`, solo admin), div `#bitacora-view`, div `#um-horario-cont` en modal de usuario, `<script src="assets/js/bitacora.js?v=20260703a">`.

  ### COLLATE
  - `bitacora_usuario` usa `utf8mb4_general_ci`. Todos los JOIN con `visita_participantes` (unicode_ci) llevan `COLLATE utf8mb4_general_ci` en ambos lados del ON.

- **feat: imágenes adjuntas en tareas (2026-06-30)** — pendiente de deploy:

  - Zona de imágenes en el modal de tarea, justo debajo del campo Descripción (`#grp-imagenes`). Visible para todos los tipos de tarea.
  - **Fuentes de carga**: clic para seleccionar archivos, drag & drop, o **pegar (Ctrl+V)** desde portapapeles.
  - **Thumbnails**: miniaturas 80×80 con botón ✕ para eliminar individualmente.
  - **Lightbox**: clic en thumbnail abre imagen en grande con navegación ‹ › entre imágenes de la misma tarea.
  - Para tareas nuevas (sin guardar), muestra aviso "Guarda la tarea antes de agregar imágenes".
  - **Migración SQL**: `db/015_tarea_imagenes.sql` — crea tabla `tarea_imagenes` (`id CHAR(32) PK`, `tarea_id`, `nombre_original`, `ext`, `orden`, `created_at`, INDEX en `tarea_id`). Ejecutar en phpMyAdmin.
  - **Archivos físicos**: `backend/uploads/imagenes/{id}.{ext}`. Validación de MIME real en el servidor.
  - **Archivos nuevos**:
    - `backend/api/imagenes.php`: `GET ?tarea_id=X` (lista), `GET ?id=X&src=1` (sirve imagen), `POST` multipart (sube), `DELETE ?id=X` (elimina).
    - `assets/js/imagenes.js?v=20260630a`: módulo completo (`_imagenesCargar`, `_imagenesRenderizar`, `_imagenesSubirArchivos`, `_imagenesEliminar`, `_imagenesLightbox`, listener de paste).
  - **Archivos modificados**:
    - `tareas-equipo.html`: `<div id="grp-imagenes">` tras `#grp-desc` en modal; `<script src="assets/js/imagenes.js?v=20260630a">` antes de `transportes.js`.
    - `assets/js/tareas.js?v=20260629p`: en `openModal()`, llama `_imagenesCargar(t?.id || null)` antes de abrir el modal.



- **feat: transporte_estado en visita_participantes + botón manual en modal (2026-06-29)** — pendiente de deploy:

  - **Migración SQL**: `db/014_transporte_estado_participante.sql` — `ALTER TABLE visita_participantes ADD COLUMN transporte_estado ENUM('pendiente','registrado','no_aplica') NULL DEFAULT NULL`. Ejecutar DESPUÉS de `013_transportes.sql`.
  - **3 estados por participante**:
    - `NULL` — legacy (visita anterior a este sistema)
    - `pendiente` — visita ocurrió, transporte no procesado aún
    - `registrado` — se creó registro en `transportes`
    - `no_aplica` — no califica: tarea fue remota o cliente sin valor_transporte
  - **`transportes.php`** ampliado:
    - `GET ?pendientes_tarea=X` → `{ pendientes: N }` (participantes con estado NULL o pendiente).
    - `POST` → además de crear el registro, actualiza `visita_participantes SET transporte_estado='registrado'`.
    - `PUT ?marcar_no_aplica=1` + body `{tarea_id}` → marca todos los participantes pendientes de la tarea como `no_aplica`.
  - **`transportes.js`**: `_transportesCheckTarea` ahora marca `no_aplica` automáticamente si la tarea no califica (remota o cliente sin valor). Agrega `_transpMarcarNoAplica(tareaId)` y `_transpActualizarBotonModal(tareaId)`.
  - **Botón en modal**: `#modal-transporte-btn` (div nuevo en `tareas-equipo.html`). `openModal()` llama `_transpActualizarBotonModal(id)` para tareas IT/IF facturadas/archivadas. Botón naranja "🚗 Registrar transporte (N)" visible solo si hay participantes pendientes; desaparece después de registrar.
  - **Versiones**: `tareas.js?v=20260629p`, `transportes.js?v=20260629b`.

- **feat: módulo transportes por pagar (2026-06-29)** — pendiente de deploy:

  ### Reglas de negocio
  - Solo aplica a tarjetas IT/IF con `modalidad = 'en_sitio'` cuyo cliente tenga `valor_transporte > 0`.
  - Se genera **un registro por check-in real** en `visita_participantes` (tareas multi-día → un transporte por día visitado).
  - Cada técnico que participó en la visita recibe su propio registro.
  - El popup aparece al **facturar** (cambio a `facturado`) o **archivar** la tarea.
  - UNIQUE KEY en `participante_id` previene duplicados si el popup se activa más de una vez.

  ### Migración SQL (ejecutar en phpMyAdmin ANTES del deploy)
  `db/013_transportes.sql` — crea tabla `transportes`:
  ```
  id, tarea_id, participante_id (UNIQUE), tecnico_id, cliente, tarea_titulo,
  fecha, check_in, check_out, valor, estado ENUM(pendiente/pagado/no_aprobado)
  ```

  ### Archivos nuevos
  - **`backend/api/transportes.php`**: GET (filtros: tecnico_id, desde, hasta, estado), POST (crea registros por tarea_id), PUT (actualiza estado a pagado/no_aprobado).
  - **`assets/js/transportes.js?v=20260629a`**: popup de aviso (`_transportesCheckTarea`, `_transportesMostrarPopup`, `_transportesRegistrar`) + vista admin (`iniciarTransportes`, `renderTransportesView`, tabla por técnico, filtros, acciones).

  ### Archivos modificados
  - **`assets/js/tareas.js?v=20260629o`**: hook en `saveTask()` y `_ejecutarArchivar()` que llaman `_transportesCheckTarea(id)` cuando se cumplen las condiciones. `setArea()` maneja `isTransportes` y llama `iniciarTransportes()`.
  - **`assets/js/auth.js?v=20260629a`**: `aplicarPermisosUI()` oculta `#tab-transportes` para técnicos.
  - **`tareas-equipo.html`**: tab `🚗 Transportes` (id=`tab-transportes`, solo admin), div `#transportes-view`, script `transportes.js`.
  - ⚠️ **Patrón de truncación auth.js**: el Edit tool truncó `auth.js` al agregar la línea de `tabTransportes`. Se reparó con Python. Para futuras ediciones de `auth.js` usar Python str.replace() como con `tareas.js`.

  ### Vista admin
  - Filtros: técnico, rango de fechas, toggle Pendientes/Archivados.
  - Pendientes: total general en verde, tabla por técnico con subtotal, columnas fecha/cliente·tarea/check-in→check-out/duración/valor/acciones.
  - Acciones: ✅ Pagar → estado=`pagado` | ❌ No autorizar → estado=`no_aprobado`. Ambas archivan el registro (desaparece de pendientes, visible en Archivados).
  - Archivados: misma tabla con badge de estado en lugar de botones.

- **feat: valor_transporte por trayecto en clientes (2026-06-29)** — pendiente de deploy:

  - Nuevo campo `valor_transporte DECIMAL(10,0) NULL` en tabla `clientes`. Guarda el valor en pesos que se le paga al técnico por trayecto cuando visita ese cliente en sitio. Base para cálculos futuros de liquidación de transporte.
  - **Migración SQL**: `db/012_valor_transporte.sql` — ejecutar en phpMyAdmin ANTES del deploy.
  - **Backend**: `clientes.php` — `clienteRow` castea a int; POST INSERT y PUT UPDATE incluyen el campo.
  - **Frontend**: modal de clientes tiene nuevo input `#cm-transporte` (número, step 1000, COP). El grid radio/plazo se amplió a 3 columnas para acomodar el campo.
  - **Archivos**: `clientes.js?v=20260629b`, `tareas-equipo.html` (HTML modal).
  - El campo está disponible en el objeto de cliente devuelto por `GET /clientes.php`. Los cálculos de liquidación de transporte serán un paso posterior.

- **feat: adjunto de reporte visible en pendientes + flujo directo solicitud→por facturar (2026-06-29)** — pendiente de deploy:

  - **Cambio de flujo**: las tareas IT/IF pueden gestionarse directamente desde Pendientes hasta Por facturar, sin pasar por En ejecución. "En ejecución" queda para proyectos multi-día que requieren programación explícita.
  - **`#grupo-reporte` (adjuntar archivo)** ahora visible para TODOS los estados IT/IF (solicitud, programado, realizado, facturado, archivado). Antes solo aparecía en programado/facturado/archivado.
  - **`toggleFacturaField`** en `tareas.js`: lee `f-area` del formulario; si es IT/IF, `showReporte = true` siempre.
  - **Auto-prompt "¿Mover a Por facturar?"**: antes solo se mostraba si el estado actual era `programado`. Ahora también aplica desde `solicitud` — si se adjunta un archivo en una tarea pendiente, pregunta si se quiere mover directo a Por facturar.
  - La validación de estado `realizado` (requiere archivo o reporte Ginno) no cambió.
  - **Archivos**: `tareas.js?v=20260629n`. Sin cambios de backend ni SQL.



- **feat: festivos Colombia en conteo de días multi-día (2026-06-29)** — pendiente de deploy:

  - **Problema**: `fechaProgFin`, `diaActualEnProg` y `diasHabilesDesde` en `core.js` solo saltaban sábados y domingos. `_agendaTareasDelDia` en `agenda.js` calculaba el fin de rango sin saltarlos tampoco.
  - **Solución**: se añadió a `core.js` el cálculo de festivos colombianos completo:
    - `_pascua(anio)` — algoritmo Meeus/Jones/Butcher.
    - `_nextLunes(d)` — Ley Emiliani (festivo → siguiente lunes).
    - `_festivosColombia(anio)` — genera el `Set` de ISO strings con festivos fijos (Año Nuevo, 1 May, 20 Jul, 7 Ago, 8 Dic, 25 Dic), Emiliani (Reyes Magos, San José, San Pedro y San Pablo, Asunción, Día de la Raza, Todos los Santos, Ind. Cartagena) y móviles relativos a Pascua (Jue Santo, Vie Santo, Ascensión, Corpus Christi, Sagrado Corazón). Cache por año (`_festivosCache`).
    - `esDiaHabil(fecha)` — devuelve `false` si es sáb/dom o festivo Colombia.
  - Las tres funciones existentes (`diasHabilesDesde`, `fechaProgFin`, `diaActualEnProg`) ahora usan `esDiaHabil()` en lugar del check directo de `dow`.
  - `_agendaTareasDelDia` en `agenda.js` actualizada: (a) retorna `[]` si `isoFecha` no es día hábil; (b) usa `fechaProgFin(t)` de `core.js` para calcular el fin del rango (en vez de sumar días calendario).
  - **Versiones**: `core.js?v=20260629b`, `agenda.js?v=20260629b`.
  - **Sin cambios SQL ni backend.**

- **fix: sintaxis push.js (2026-06-29)** — había un `}` de más que dejaba el bloque `else if (permiso === 'denied')` fuera del `try/catch`. Corregido.

- **feat: notificaciones push Web Push (2026-06-29)** — pendiente de deploy + setup manual:

  ### Archivos nuevos
  - **`sw.js`** (raíz): Service Worker — maneja evento `push` y `notificationclick`. Scope `/ginno/`.
  - **`assets/js/push.js`**: Registra SW, suscribe al usuario con clave VAPID pública, envía suscripción al backend. Banner de activación aparece automáticamente tras login si permisos no otorgados aún.
  - **`backend/api/push_subscribe.php`**: POST guarda suscripción (upsert por endpoint), DELETE la elimina.
  - **`backend/lib/webpush.php`**: Enviador VAPID + cifrado aes128gcm (RFC 8291/8292) en PHP puro — sin Composer ni dependencias externas. Requiere PHP 7.3+ con openssl y curl.
  - **`backend/cron/recordatorio_visita.php`**: Cron job (cada 15 min) — busca tareas con `fechaProg=hoy` y `horaProg` entre +45min y +75min desde ahora, envía push a técnicos asignados. Borra suscripciones expiradas (HTTP 410).
  - **`backend/config/push_config.example.php`**: Plantilla con las claves VAPID generadas. El archivo real (`push_config.php`) se crea manualmente en el servidor — no va en git.
  - **`db/010_push_subscriptions.sql`**: Tabla `push_subscriptions`.
  - **`Ginno_Push_Setup.pdf`**: Instrucciones completas de configuración primera vez (SQL, config, cron, activación por técnico, troubleshooting).

  ### Claves VAPID (generadas para este proyecto)
  - **PUBLIC**: `BPOMS5YqvRClLy9u4d6-cUcQoqrn7SHyfiv1ZHrpKSPtDNIRfHGggk55O3AK6Oz8burhlxRQuSho0gSXqWc20uA`
  - **PRIVATE**: `XucVmxA0geLi0mMpF2ldqCKRIkPf-idN69G5oJGm8Tg` ⚠️ solo en servidor
  - No cambiar las claves después del primer deploy (los técnicos ya suscritos quedarían inválidos).

  ### Setup requerido ANTES de que funcione
  1. Ejecutar `db/010_push_subscriptions.sql` en phpMyAdmin
  2. Crear `backend/config/push_config.php` en el servidor (ver ejemplo)
  3. Deploy (incluye `sw.js` — nuevo en `.cpanel.yml`)
  4. Configurar cron job en cPanel (cada 15 min)
  5. Cada técnico activa una vez desde su celular

  ### Modificados
  - `.cpanel.yml`: agrega `sw.js` al deploy
  - `tareas-equipo.html`: agrega `push.js?v=20260629a`, bump `app.js?v=20260629b`
  - `assets/js/app.js`: llama `iniciarPush()` al terminar `iniciarApp()`

- **feat: registro rápido de factura + limpieza modal "por facturar" (2026-06-29)** — pendiente de deploy:

  - **Tarjeta kanban**: botón naranja `🧾 Registrar factura` en tarjetas IT/IF `realizado` y Admin `por-facturar` sin factura. Popup inline con input → Enter o botón guarda factura y mueve a `facturado` automáticamente. "Buscar en Alegra" abre el modal completo.
  - **Modal**: nuevo botón `✓ Marcar como Facturado` dentro de `#grupo-factura` (visible solo en estado "por facturar"). Al hacer clic valida el campo `f-factura`, asigna estado `facturado` y llama `saveTask()`.
  - **Limpieza visual del modal en "por facturar"**: se ocultan `#grp-fechaprog` (fecha prog + días + hora de inicio) y `#grupo-reporte` (textarea reporte + adjuntar archivo). La función `toggleFacturaField()` maneja esto; el campo de factura ahora también se muestra en estado `realizado` (no solo `facturado`/`archivado`/`por-facturar`).
  - **Archivos**: `tareas.js?v=20260629k`, `tareas-equipo.html` (botón `#btn-marcar-facturado` en `#grupo-factura`). Sin cambios de backend ni SQL.

- **feat: agenda semanal por técnico (2026-06-29)** — pendiente de deploy:

  ### Archivos nuevos/modificados
  - **`assets/js/agenda.js`** (nuevo, v=20260629a): módulo completo de agenda semanal.
    - Técnico: lista Lun–Sáb con sus tareas del día (filtra `tasks` por `fechaProg`/`diasProg`/`team`).
    - Admin: chips selector de técnicos (todos activos por defecto); si hay ≤1 tec seleccionado → vista lista; si ≥2 → grid comparativo por columnas.
    - Funciones: `iniciarAgenda()`, `renderAgendaSemanal()`, `_agendaNavSemana(delta)`, `_agendaToggleTec(id)`.
    - Usa `tasks` (array ya cargado en memoria) — no hace fetch extra.
    - Click en card → `openModal(t.id)`.
  - **`tareas-equipo.html`**: tab `📅 Agenda` (`data-area="agenda"`), `#agenda-view` div, `<script src="assets/js/agenda.js?v=20260629a">`. Versión tareas.js bumpeada a `?v=20260629i`.
  - **`assets/js/tareas.js`** (`?v=20260629i`): `setArea()` maneja `isAgenda`; técnicos pueden acceder a 'agenda' además de 'it'/'if'.

  ### No requiere migración SQL — usa campos existentes.

- **feat: tipo_tarea contrato de horas (2026-06-29)** — pendiente de deploy:

  ### Migración SQL (ejecutar en phpMyAdmin ANTES del deploy)
  `db/009_tipo_tarea_contrato.sql`:
  ```sql
  ALTER TABLE tareas ADD COLUMN tipo_tarea ENUM('evento','proyecto','contrato') NOT NULL DEFAULT 'evento' AFTER area;
  ALTER TABLE clientes ADD COLUMN contrato_area ENUM('it','if') NULL AFTER plazo_factura_dias, ADD COLUMN contrato_horas_mes DECIMAL(4,1) NULL AFTER contrato_area;
  ALTER TABLE visita_participantes ADD COLUMN horas_contrato DECIMAL(4,1) NULL AFTER check_out;
  ```
  ⚠️ El usuario confirmó que ya ejecutó esta migración.

  ### Archivos modificados
  - **`backend/api/clientes.php`**: campos `contrato_area`/`contrato_horas_mes` en POST INSERT y PUT UPDATE. Nuevo endpoint `GET ?alegra_id=X` (busca por ID de Alegra). Endpoint `GET ?nombre=X` corregido (usaba `? COLLATE utf8mb4_general_ci` que es sintaxis inválida en PDO → 500; cambiado a `LOWER(nombre) = LOWER(?)`).
  - **`backend/api/tareas.php`**: `tipo_tarea` en POST INSERT y PUT UPDATE.
  - **`backend/api/reportes.php`**:
    - GET `?horasContrato=1&tareaId=X` → `{horasContratadas, horasConsumidas, horasDisponibles}`.
    - Checkout: calcula duración neta, descuenta horas con redondeo a media hora (mínimo 30min; residuo >10min sube al siguiente medio, ej. 40min → 1h, 10min → 0.5h), guarda `horas_contrato` en `visita_participantes`, auto-crea tarea adicional "Visita de contrato adicional" cuando se agotan horas.
    - `editParticipante`: admin puede editar `horas_contrato` desde historial.
  - **`assets/js/core.js`**: `tipoTarea` en `taskToApi()`/`apiToTask()`.
  - **`assets/js/tareas.js`**: selector `#f-tipo-tarea` (oculto por defecto, visible solo en IT/IF cuando el cliente tiene contrato). Dos funciones de verificación:
    - `_verificarContratoCliente(alegraId, area)` — usa `?alegra_id=` (se llama al seleccionar del dropdown de Alegra).
    - `_verificarContratoClientePorNombre(nombre, area)` — usa `?nombre=` (se llama al editar tarea existente o cambiar área).
    - `seleccionarClienteAlegraIdx` ahora pasa `c.id` (ID Alegra), no `c.name`.
    - Eliminado el debounce de verificación al escribir en `onClienteInput` — solo verifica al seleccionar.
  - **`assets/js/reportes.js`**: muestra horas disponibles en tarjeta (antes del check-in); admin edita `horas_contrato` en historial; alerta post-checkout con horas consumidas/restantes.
  - **`assets/js/clientes.js`**: modal de cliente incluye selector de área de contrato y campo de horas/mes.
  - **`tareas-equipo.html`**: HTML de `#grp-tipo-tarea`, `#contrato-horas-info`, sección contrato en modal cliente. Versiones: `core.js?v=20260629a`, `tareas.js?v=20260629d`, `reportes.js?v=20260629a`, `clientes.js?v=20260629a`.

  ### Reglas de negocio del contrato
  - Un cliente puede tener contrato en IT o IF (no ambos a la vez, columna `contrato_area`).
  - Al seleccionar un cliente IT/IF en el formulario de tarea, si tiene contrato para esa área aparece el selector tipo_tarea (evento/proyecto/contrato). Si no tiene contrato, se asigna `evento` automáticamente.
  - Descuento de horas: al hacer checkout, duración neta (checkout − checkin, descontando pausas si las hay) → redondear a media hora con gracia de 10min. Mínimo 0.5h.
  - Si horas consumidas > horas contratadas → alerta al técnico + auto-crear nueva tarea "Visita de contrato adicional" en el mismo área/cliente.
  - El contrato se resetea al inicio de cada mes (no implementado aún en backend — pendiente un cron o verificación en el endpoint de horas).
  - Admin puede editar `horas_contrato` de cada participante desde el historial de visitas.

  ### Issue de truncación de tareas.js (patrón identificado)
  El Edit tool trunca las últimas líneas de `tareas.js` en cada edición. Solución definitiva: **usar python para todas las ediciones de este archivo** (reemplazos con `str.replace()` + write completo). El archivo tiene 1391 líneas y termina con los dos `addEventListener` del modal y cartera-modal.

## Estado actual (última actualización: 2026-06-26)

- **Rebrand a Ginno (2026-06-26)** — pendiente de deploy:
  - `tareas-equipo.html`: `<title>` → "Ginno"; pantalla de login muestra "Ginno" + "Tu asistente · Grupo Innovate"; alt del logo → "Ginno"; modal de alarma → "🔔 Ginno te recuerda" + botón "Entendido, gracias Ginno".
  - `backend/lib/mailer.php`: boundary MIME cambiado de `INNOVATE-` a `GINNO-`.
  - `backend/api/reportes.php`: correos de check-in y checkout internos ahora dicen "¡Hola! Te cuento que..." y firman "Ginno · Asistente de Grupo Innovate".
  - `backend/api/reporte_enviar_correo.php`: correo al cliente mantiene marca "Grupo Innovate" pero añade "Mensaje enviado por Ginno, asistente de Grupo Innovate".
  - `backend/api/alertas.php`: footer del correo de técnico tardío → "Ginno · Asistente de Grupo Innovate · grupoinnovate.com".
  - **Acción manual en servidor**: cambiar `CORREO_FROM_NOMBRE` en `backend/config/config_correo.php` de lo que sea actual a `'Ginno'` para que el campo "De:" de los correos diga "Ginno".

## Estado actual (última actualización: 2026-06-25)

- **Cambio pendiente de deploy (2026-06-25): Pausa / reanuda visita**
  - Nueva tabla `visita_pausas (id, participante_id, pausa_inicio, pausa_fin, justificacion)` con FK a `visita_participantes ON DELETE CASCADE`. **Acción pendiente en deploy**: ejecutar `backend/migracion_visita_pausas.sql` antes de publicar.
  - Backend (`reportes.php`): `participantesDeReporte()` incluye `pausas[]` por participante. Nuevas acciones PUT: `pausar` (crea fila con justificación obligatoria, idempotente) y `reanudar` (cierra pausa activa). Checkout auto-cierra la pausa activa si el técnico finaliza estando en pausa.
  - Frontend (`reportes.js?v=20260625a`): `calcularDuracionNeta(checkIn, checkOut, pausas)` y `minutosEnPausas(pausas)` descuentan las pausas del tiempo ejecutado. `renderVisitaBoton` muestra "⏸️ EN PAUSA" (amber) con el motivo, botón "▶️ Reanudar" cuando hay pausa activa, o "⏸️ Pausar visita" cuando no. Historial y PDF muestran detalle de pausas y duración neta.
  - HTML: nuevo modal `#pausa-modal` (z-index:315) con textarea de justificación. Funciones JS: `abrirPausaModal`, `cerrarPausaModal`, `confirmarPausa`, `reanudarVisita`.

## Estado actual (última actualización: 2026-06-24 — Deploy #27 desplegado y verificado ✅)

- **Versiones de caché en `tareas-equipo.html`**: `core.js?v=20260624a`, `tareas.js?v=20260624a`, `reportes.js?v=20260624a`, `informes.js?v=20260624a`, `alarma.js?v=20260624a`, `app.js?v=20260623c`.
- **Estado del repo (local y GitHub `main`)**: commit `92e9b69` ("Deploy #27: consolidación post-rollback + cache-busting 20260624a").
- **Estado de producción**: Deploy #27 en producción desde 24/06/2026 09:00:56. SHA desplegado: `92e9b69`.

- **Deploy #27 — Consolidación y fix post-rollback (2026-06-24) — DESPLEGADO Y VERIFICADO**:
  - Acumula todos los cambios del 23/06 desde las 13:32 hasta el commit `5f8492a`.
  - Errores que causaron los deploys fallidos del día anterior, ya corregidos en esta versión:
    1. Script tags truncados en `tareas-equipo.html` (Fix #25c/d).
    2. COLLATE faltante en JOIN `visita_participantes` → `reportes` (Fix #25b).
    3. Double fetch de `visitasActivas` al arrancar la alarma (Fix #26).
  - Cache bumpeado a `20260624a` para forzar recarga completa en browser.
  - **Desplegado**: cPanel Update from Remote + Deploy HEAD Commit el 24/06/2026 09:00:56. SHA: `92e9b69`.

- **Rollback previo (2026-06-24 07:52)**:
  - Producción fue revertida al commit `cac254b` por problemas en Deploy #25/#26.
  - Método: `git reset --hard cac254b` en cPanel Terminal + "Deploy HEAD Commit".
  - El repo GitHub sigue en `5f8492a`. Al hacer nuevo deploy, **no** resetear el servidor — avanzar con commit nuevo.

- **Deploy #26 — Perf (2026-06-23 23:13) — ROLLEADO BACK**:
  - `alarma.js?v=20260623b`: `_chequearRetrasoTecnicos(skipFetch = false)` — parámetro `skipFetch`; `iniciarAlarmaChecker()` pasa `true` en primera llamada para evitar fetch duplicado.
  - `reportes.js?v=20260623h`: lazy-loader `_cargarJsPDF()` — inyecta `<script>` con jsPDF desde CDN solo cuando se llama `generarPDFReporte()`.
  - `informes.js?v=20260623b`: `exportarInformeExcel()` hecha async, xlsx cargado on-demand vía `<script>` inyectado.
  - `tareas-equipo.html?v=20260623h`: eliminados los `<script>` bloqueantes de jsPDF y xlsx del `<head>`.

## Estado actual (última actualización: 2026-06-23 — deploy #25e ✅)

- **Deploy #25e (2026-06-23 23:00) — desplegado y verificado**:
- **Cache-bust `reportes.js`**: bumpeado a `?v=20260623g` para forzar descarga del archivo correcto (completo, 44786B, 927L). El browser tenía cacheada la versión truncada `?v=20260623f` (37674B, 810L) que producía `SyntaxError: Missing } in template expression` → `cargarVisitasActivas is not defined` → app no iniciaba. Commit `Fix #25e`. Con `?v=20260623g` todas las funciones de `reportes.js` cargan correctamente.

## Estado actual (última actualización: 2026-06-23 — deploy #25d ✅)

- **Deploy #25d (2026-06-23 22:49) — desplegado y verificado**:
- **Fix crítico `tareas-equipo.html`**: el archivo estaba truncado en el repo GitHub (faltaban el modal de alarma diaria y todos los `<script>` tags). Causa: commit corrupto `4156b1c` generado por bug de "Find & Replace All" en editor web de GitHub (el string de búsqueda era prefijo del de reemplazo → loop infinito → 51358 bytes con scripts duplicados). Fix: script Python truncó en byte 44282 y añadió el contenido correcto → 45509 bytes. Commit `b22cc17` + merge con `dfcf8ed` (COLLATE fix). Deploy SHA `345e3dfa`.
- **app.js, alarma.js y 11 scripts más** se cargan correctamente en producción. App funcional.

## Estado actual (última actualización: 2026-06-23 — deploy #25b)

- **Cache-busting actual en `tareas-equipo.html`**: `core.js?v=20260623b`, `auth.js?v=20260622d`, `tareas.js?v=20260623f`, `reportes.js?v=20260623g`, `informes.js?v=20260623a`, `alarma.js?v=20260623a`, `usuarios.js?v=20260622a`, `app.js?v=20260623c`.
- **NOTA COLACIÓN**: `visita_participantes` usa `COLLATE utf8mb4_unicode_ci` (vs `utf8mb4_general_ci` en `reportes`/`tareas`). Todo JOIN entre estas tablas debe incluir `COLLATE utf8mb4_general_ci` en la condición ON. Ejemplo: `JOIN reportes r ON r.id = vp.reporte_id COLLATE utf8mb4_general_ci`.
- **Deploy #25b (2026-06-23 21:58) — desplegado y verificado**:
- **Fix colación MySQL**: `JOIN reportes r ON r.id = vp.reporte_id COLLATE utf8mb4_general_ci` en endpoint `?tardias=1` de `reportes.php`. Sin este COLLATE el JOIN fallaba con `SQLSTATE[HY000] 1267 Illegal mix of collations`. Commit `dfcf8ed` en GitHub → deploy cPanel completado. Endpoint verificado: HTTP 200 con datos reales.
- **Deploy #25 (2026-06-23 21:24) — desplegado y verificado**:
- **Fix alerta técnico tardío**: `_chequearRetrasoTecnicos()` en `alarma.js` ahora refresca `visitasActivas` desde `reportes.php?estado=en_visita` antes de calcular tardíos. Esto captura check-ins registrados en otros dispositivos y apaga la alerta/banner en tiempo real (máx. 60s de delay). Sin cambios en DB.
- **Reporte "Llegadas tardías"** en Pestaña Informes: nueva entrada `tardias_llegada` en `INFORMES`. Filtros: rango de fechas y técnico. Llama a `reportes.php?tardias=1` (nuevo endpoint). Muestra tabla: fecha, cliente, tarea, técnico, hora programada, llegada real, minutos tarde (badge rojo). Exportable a Excel. Lógica: `DATE(check_in) = fecha_programacion AND TIME(check_in) > hora_programacion`. `informes.js?v=20260623a`.
- **Badge "Tardía" en historial de visitas**: en `renderHistorialVisitasModal()` (`reportes.js`), cuando el `check_in` de un participante es posterior a `hora_programacion` de la tarea (en la misma `fecha_programacion`), se muestra badge rojo "🕐 Tardía" junto al nombre. `reportes.js?v=20260623f`.
- **Nuevo endpoint `GET reportes.php?tardias=1`**: JOIN entre `visita_participantes`, `reportes` y `tareas`. Filtra por `DATE(check_in)=fecha_programacion AND TIME(check_in)>hora_programacion`. Soporta filtros `desde`, `hasta`, `tecnico_id`. Sin migración SQL.
- **Deploy #24 (2026-06-23) — desplegado y verificado**:
- **`autocomplete="off"` en todos los inputs**: todos los `type="text"`, `type="email"` y `type="password"` del HTML recibieron `autocomplete="off"` (o `autocomplete="new-password"` en el caso de los PIN). Esto evita que Chrome autollene con credenciales de cPanel.
- **Popup "¿Se terminó la tarea?"**: muestra el título y cliente de la tarea en una franja teal bajo el encabezado (`#popup-tarea-terminada-nombre`). Se agrega botón "Cancelar" (misma acción que "No, falta continuar"). JS en `reportes.js`.
- **Acciones rápidas en modal**: al abrir una tarjeta para editar, `openModal()` en `tareas.js` llena `#modal-acciones-rapidas` con los mismos botones que aparecen en la tarjeta (Iniciar visita, Continuar reporte, Archivar, etc.) — depende de `renderVisitaBoton()` que vive en `reportes.js` (mismo scope global).
- **Historial de visitas en modal** (`renderHistorialVisitasModal()` en `reportes.js`): al abrir una tarjeta IT/IF, hace GET a `reportes.php?tareaId=...` y muestra todas las visitas con participantes. Técnico: solo lectura (nombre, horas, duración). Admin: grilla editable (select técnico, time inputs check-in/out, botón 💾). Llama `PUT reportes.php?id=X` con `accion:'editParticipante'`. Backend: nueva rama `editParticipante` en `reportes.php PUT` que actualiza `visita_participantes` y recalcula estado del reporte (en_visita vs borrador).
- **Deploy #23 (2026-06-23) — desplegado y verificado**:
- **Input búsqueda cambiado a `type="search"`**: en `tareas-equipo.html`, el `<input id="search">` pasó de `type="text"` a `type="search"`, lo que habilita el botón nativo "×" del browser para limpiar el campo de búsqueda sin JS adicional.
- **Deploy #22 (2026-06-23) — desplegado y verificado**:
- **Fix "carcuervo" definitivo**: `setArea()` en `tareas.js` ahora limpia `#search`, `#f-estado`, `#f-responsable` al cambiar de área. Esto cubre el caso de navegar entre tabs (el `pageshow` cubre el reload/bfcache).
- **Fix archivar sin factura**: `confirmarMotivoNoFactura()` capturaba `_archivarPendienteId` DESPUÉS de llamar `cerrarMotivoNoFactura()` que lo ponía en null. Fix: capturar el id ANTES de cerrar el modal.
- **Admin check-in multi-técnico mejorado**: `abrirAdminCheckinModal()` ahora filtra del selector los técnicos que ya tienen check-in activo (sin check_out), y muestra un aviso verde "🟢 Ya en sitio: Jorge Guerrero" encima del select para que el admin sepa quién ya está registrado. Nuevo `<div id="admin-checkin-ya-en-sitio">` en el HTML del modal.
- **Tarjetas: cliente antes del título**: cliente en teal Innovate sobre el título en todas las tarjetas. `tareas.js?v=20260623d`.
- **Correo de checkout a admin** (`reportes.php`): fecha, hora in/out, cliente, tarea, estado del reporte, si fue enviado y a qué correo, si quedan técnicos en sitio. No bloqueante.
- **Modal motivo no factura — colores Innovate**: `#D6F3F4`/`#169BBC`/`#0D3B40`.
- **Deploy #21 (2026-06-23) — desplegado y verificado**:
- **Motivo de archivado sin factura**: cuando se archiva una tarjeta IT/IF desde la columna "Por facturar" (`estado='realizado'`) sin tener factura asignada, `archivarTask()` ya no hace `confirm` directo sino que abre el modal `#modal-motivo-no-factura` con 4 opciones: Garantía, Levantamiento, Contrato, Otros. El motivo elegido se guarda en `motivoNoFactura` (campo nuevo en el modelo frontend) → `motivo_no_factura VARCHAR(30)` en BD → se muestra en la tarjeta como `📋 Sin factura: Garantía` (color violeta). Si la tarjeta ya tiene `factura`, el archivado es directo sin preguntar. Archivos modificados: `backend/migracion_motivo_no_factura.sql` (NEW), `backend/api/tareas.php` (POST INSERT + PUT UPDATE), `assets/js/core.js` (`taskToApi`/`apiToTask`), `assets/js/tareas.js` (`archivarTask()` refactorizado + `_ejecutarArchivar()` + `confirmarMotivoNoFactura()` + `cerrarMotivoNoFactura()` + badge en tarjeta), `tareas-equipo.html` (modal `#modal-motivo-no-factura`).
- **Multi-técnico por visita (2026-06-23)**: nueva tabla `visita_participantes (id, reporte_id, tecnico_id, check_in, check_out)`. Migración: `backend/migracion_visita_participantes.sql` (ejecutar ANTES del deploy). `reportes.php` POST ya no bloquea check-in si hay reporte en curso — agrega un participante adicional. PUT checkout usa `participanteId`; el reporte solo pasa a `borrador` cuando TODOS los participantes hacen checkout. `reporteConFotos()` incluye `participantes[]`. Frontend `renderVisitaBoton()` muestra estado individual por técnico: el técnico ve su propio botón, el admin ve botón de finalizar por cada participante activo + "Agregar técnico". PDF muestra una fila por participante con sus horarios. Fallback para reportes pre-migración (sin participantes) usa los campos legacy `tecnico_checkin_id`/`check_in`/`check_out`.
- **Fix PDF nombre de archivo + overflow cliente (2026-06-23)**: `reportes.js` ahora usa `splitTextToSize` para todas las filas del encabezado del PDF (Cliente, Tarea, etc.) — el nombre largo ya no se sale de la página, se parte en segundas líneas. Nombre de archivo cambiado de `reporte-{uuid}.pdf` a `Innovate-YYYYMMDD-Pal1-Pal2-Pal3-Pal4.pdf` (primeras 4 palabras del cliente, caracteres especiales removidos). `reporte_pdf.php` POST acepta campo `nombre` sanitizado y lo usa para guardar; GET lo sirve en `Content-Disposition`.
- **Fix bfcache filtro "carcuervo" (2026-06-23)**: el intento anterior de limpiar en `iniciarApp()` no era suficiente porque Chrome restaura los valores del formulario DESPUÉS de que JS corre. Solución: `window.addEventListener('pageshow', ...)` en `app.js` que limpia `#search`, `#f-estado`, `#f-responsable` — `pageshow` dispara justo después de que el browser termina el restore del bfcache.
- **Últimos deploys desplegados y verificados**:
- **Deploy #24 (2026-06-23)**: historial de visitas editable en modal de tarea; acciones rápidas en modal (Iniciar visita, Archivar, etc.); cliente·título en popup "¿Se terminó la tarea?"; botón "✕ Borrar fecha" en formulario de programación.
- **Deploy #23 (2026-06-23)**: input búsqueda `type="search"` (botón nativo "×").
- **Deploy #22 (2026-06-23)**: modal check-in admin muestra técnicos ya en sitio y excluye del selector los con check-in activo; notificación de checkout al admin; fix `confirmarMotivoNoFactura` (capturaba id después de cerrar el modal); cliente en uppercase en tarjetas; `setArea()` limpia filtros al cambiar área.
- **Deploy #21 (2026-06-23)**: multi-técnico por visita (`visita_participantes`), motivo de archivado sin factura (`motivo_no_factura`), PDF nombre descriptivo, bfcache fix via `pageshow`. Migraciones ejecutadas: `migracion_motivo_no_factura.sql`, `migracion_visita_participantes.sql`, `migracion_hora_prog.sql`.
- **Deploy #20 (2026-06-23)**: check-in manual por admin — `iniciarVisita()` en `reportes.js` bifurca por perfil: admin abre `#admin-checkin-modal` (selector de técnico + time input `#admin-checkin-hora`); técnico usa flujo normal. `backend/api/reportes.php` acepta `checkIn` ("HH:MM") en POST; construye el timestamp como fecha Bogotá + hora manual o `NOW()`. Correo indica "(registrada manualmente)" cuando aplica. Sin migración SQL. `reportes.js?v=20260623a`.
- **Deploy #19 (2026-06-23)**: ordenamiento automático de tarjetas kanban IT/IF — sin fecha por `createdAt` asc, con fecha por `fechaProg` desc (`sortTarjetasOperativas()` en `tareas.js`).
- **Deploy #18 (2026-06-22)**: alerta de técnico tardío (`#retraso-modal`, `#alertas-retraso-banner`, `backend/api/alertas.php`) + campo hora de inicio en programación (`#f-hora-prog`, `hora_programacion` en BD) + fix bfcache (limpiar filtros en `iniciarApp()`).
- **Deploy #17 (2026-06-22)**: módulo gestión de usuarios admin (nuevo `assets/js/usuarios.js`, tab "👤 Usuarios" solo admin, CRUD completo en `backend/api/usuarios.php`) + `loadTeam()` carga `TEAM` dinámicamente desde la BD.
- **Deploy #16 (2026-06-22)**: programación multi-día (`diasProg`/`dias_programacion`). Migración `migracion_dias_programacion.sql` ya ejecutada.
- **Deploy #15 (2026-06-22)**: informe de actividades de técnico combina tarjetas + visitas; edición admin de check-in/out en Informes (`_reporteSoloEdicion` flag).
- **Deploy 2026-06-22 (2)**: nuevo `assets/js/alarma.js` — alarma diaria de recordatorio solo para admin (`currentUser.perfil === 'admin'`), lunes a viernes a las 16:00 hora Bogotá (`ALARMA_HORA` en el archivo), revisa la hora cada 20s vía `Intl.DateTimeFormat`. Suena un beep (Web Audio API, sin archivo de audio) repetido cada 8s y muestra el modal `#alarma-modal` con el mensaje "Programar técnicos para mañana" y botón "Entendido" que lo detiene. Arranque vía `iniciarAlarmaChecker()` en `app.js`; modal agregado a `tareas-equipo.html`; cache-busting de `app.js` y `alarma.js` subido a `?v=20260622a`. Hecho en el otro equipo (oficina), detectado sin commitear al abrir GitHub Desktop, confirmado por el usuario (verificado cruzando con la conversación "GESTION - 1" donde se pidió la función) antes de desplegar. Deploy verificado en producción.
- **Deploy 2026-06-22 (1)**: nueva función `tareasVisibles()` en `assets/js/core.js` — filtra las tareas que ve cada usuario según su perfil: un técnico solo ve las tarjetas del equipo al que está asignado (`t.team.includes(currentUser.id)`), un admin ve todas. Se usa desde `assets/js/tareas.js`. El cambio se hizo en el otro equipo (oficina), se sincronizó por OneDrive y apareció como cambio sin commitear al instalar GitHub Desktop en este equipo por primera vez; el usuario confirmó que era intencional antes de commitear/pushear/desplegar. Deploy verificado en producción (`tareas-equipo.html` carga sin errores).
- Último cambio desplegado antes de ese: cache-busting (`?v=20260614`) en los 5 `<script src="assets/js/...">` de `tareas-equipo.html`, para evitar que el navegador sirva JS desactualizado (`assets/js/*.js` se cachea 7 días). Ver nota en `DEPLOY.md` — cualquier deploy futuro que modifique `assets/js/` debe subir este `?v=`. Migración `programado_en` ya ejecutada manualmente en la BD de producción.
- Cambio desplegado anterior: rediseño de la tarjeta de tarea para IT/IF (orden Cliente → Título → Descripción → Equipo asignado; equipo asignado con `<select>` "+ Agregar técnico..." + chips removibles; ocultos fecha límite, tiempo estimado, tiempo real, recursos y notas para IT/IF). Ver decisión #10 más abajo.
- **Cambios pendientes de deploy**:
-6. **Alarma diaria de recordatorio, solo admin (2026-06-22)**: nuevo `assets/js/alarma.js` — de lunes a viernes a las 4:00pm hora Bogotá (`ALARMA_HORA = '16:00'`), si el usuario logueado es admin (`currentUser.perfil==='admin'`), sonido (beep generado con Web Audio API, sin archivo externo) + modal en pantalla (`#alarma-modal` en `tareas-equipo.html`, función `dispararAlarma()`/`cerrarAlarma()`). Se arranca con `iniciarAlarmaChecker()` desde `iniciarApp()` en `assets/js/app.js` (revisa la hora cada 20s, vía `Intl.DateTimeFormat` con `timeZone:'America/Bogota'` para no depender de la hora del PC). Solo suena si la pestaña sigue abierta; requiere que el navegador haya registrado alguna interacción del usuario en la página (ya ocurre con el login por PIN) para no ser bloqueado por la política de autoplay. Nuevo `<script src="assets/js/alarma.js?v=20260622a">` agregado a `tareas-equipo.html` (antes de `app.js`); cache-busting de `app.js` subido a `?v=20260622a` también.
-5. **Reordenar formulario de tarjetas operativas (2026-06-13)**: en `tareas-equipo.html`, el orden de los campos del formulario ahora es: Fecha de programación → 📝 Reporte del servicio (+ adjuntar archivo) → 🗂 Labor del área administrativa → 💼 Solicitud para área comercial (cotización) → ... → Área / Estado (al final). Solo se reordenó el HTML (`<div class="form-grid">`); la lógica de visibilidad por área (`updateFormForArea()` en `assets/js/tareas.js`) no cambió.
-4. **Adjuntar archivo al reporte del servicio (tarjetas operativas IT/IF) (2026-06-13)**:
- En la sección "📝 Reporte del servicio" del formulario (visible cuando el estado es "En ejecución", "Por facturar", "Facturado" o "Archivado") se agregó un campo para adjuntar un archivo (PDF, fotos, etc.) con el reporte de la visita técnica.
- Si una tarjeta IT/IF está "En ejecución" y al guardar se llenó el texto del reporte y/o se adjuntó un archivo, se pregunta al usuario (`confirm`) si desea mover la tarjeta a "Por facturar"; si confirma, cambia el estado a `realizado` antes de guardar (`assets/js/tareas.js`, `saveTask`).
- Nuevo campo `reporteArchivo` (frontend) / `reporte_archivo` (BD, `VARCHAR(255) NULL`): guarda el nombre original del archivo. Actualizado en `assets/js/core.js` (`taskToApi`/`apiToTask`), `assets/js/tareas.js` (formulario + subida tras guardar) y `db/001_init.sql`.
- Nuevo endpoint `backend/api/reporte_archivo.php` (POST sube el archivo a `backend/uploads/reportes/{id}.{ext}` y registra el nombre original, GET descarga, DELETE elimina), siguiendo el mismo patrón que `cotizacion_docx.php` pero aceptando cualquier tipo de archivo.
- `.cpanel.yml` ya actualizado para crear `backend/uploads/reportes/`.
- **Acción pendiente en deploy**: ejecutar la migración `backend/migracion_reporte_archivo.sql` (`ALTER TABLE tareas ADD COLUMN reporte_archivo VARCHAR(255) NULL AFTER programado_en;`).
-3. **Contadores de días y nueva alerta "Pendientes sin programar" (2026-06-13)**:
- IT e IF son las "tarjetas operativas". En sus tarjetas del kanban ahora se muestra un contador de días según el estado: en "Pendientes" (`estado==='solicitud'`) se muestra "⏳ N días en pendientes" (días hábiles desde `createdAt`); en "En ejecución" (`estado==='programado'`) se muestra "🔧 N días en ejecución" (días hábiles desde el nuevo campo `programadoAt`).
- Nuevo campo `programadoAt` (frontend) / `programado_en` (BD, `DATETIME NULL`): se registra la primera vez que una tarea IT/IF pasa a "En ejecución" (mismo patrón que `realizadoAt`/`realizado_en` y `enviadaAt`/`enviada_en`). Actualizado en `assets/js/core.js` (`taskToApi`/`apiToTask`), `assets/js/tareas.js` (`onDrop`, `saveTask`), `backend/api/tareas.php` (POST y PUT) y `db/001_init.sql`.
- **Acción pendiente en deploy**: ejecutar la migración `backend/migracion_programado_en.sql` (`ALTER TABLE tareas ADD COLUMN programado_en DATETIME NULL AFTER enviada_en;`) en la base de datos antes de publicar estos cambios.
- La sección inferior del dashboard (antes sin título, con "🚨 Realizados sin facturar" y "📞 Cotizaciones enviadas que necesitan seguimiento") ahora se titula **"🔔 Zona de alertas"**.
- Nueva alerta dentro de "Zona de alertas": **"⚠️ Pendientes sin programar"** — lista tarjetas IT/IF en "Pendientes" (`estado==='solicitud'`) sin `fechaProg`, mostrando "📅 N días sin programar" (días hábiles desde `createdAt`, vía nueva función `alertaProgramacion(t)` en `core.js`). Se pinta en rojo (`#fee2e2`/`#ef4444`) cuando `dias >= 2` (2+ días hábiles sin programar).
-2. **Ajustes de formulario y navegación del dashboard (2026-06-13)**:
- `setArea()`: si se hace clic en una pestaña de área (IT/IF/Admin/Comercial) estando en la vista Dashboard, ahora cambia automáticamente a la vista Kanban de esa área (antes no hacía nada).
- Formulario de tarea: el grupo "Equipo asignado" (`grp-team`) se oculta cuando el área seleccionada es Comercial (lógica agregada en `updateFormForArea()`).
- Formulario de tarea: los campos "Área" (`f-area`, ahora con `id="grp-area"`) y "Estado" (`f-est`, ahora con `id="grp-estado"`) se movieron al final del formulario (`.form-grid`), para todas las áreas/tarjetas.
-1. **Migración frontend a módulos JS** (primer paso del roadmap "Frontend modular"): el `<script>` único de `tareas-equipo.html` (~1586 líneas) se dividió en 5 archivos clásicos (sin `type="module"`, mismo scope global compartido, mismo orden de ejecución) bajo `assets/js/`: `core.js` (config/API, estado global, helpers, programación técnica), `tareas.js` (render, kanban, dashboard, modal, autocompletar cliente, drag&drop), `cartera.js`, `facturacion.js` y `app.js` (migración de datos locales + `init()`). `tareas-equipo.html` ahora solo tiene 5 `<script src="assets/js/...">` en ese orden. `.cpanel.yml` actualizado para copiar `assets/js/`. Sin cambios de comportamiento, solo reorganización.
0. **Ciclo completo cotización → programación → facturación** (ver `FACTURACION.md`, sección "Ciclo completo"):
- Tarjetas de Comercial ahora permiten adjuntar el `.docx` de la cotización (campo nuevo `cotizacion_docx` en `tareas`, migración `backend/migracion_cotizacion_docx.sql` — ejecutar antes de este deploy).
- Nuevo endpoint `backend/api/cotizacion_docx.php` (POST sube/guarda el `.docx` en `backend/uploads/cotizaciones/{id}.docx`, GET descarga, DELETE elimina).
- Al aprobar una cotización (Comercial → "Aprobada"), se elige IT o IF y la misma tarjeta se mueve a esa área en estado "Pendientes".
- En tarjetas IT/IF en "Por facturar" con cotización adjunta, aparece el botón "🧾 Generar factura desde cotización" que reutiliza el `.docx` ya guardado (`alegra_factura_desde_cotizacion.php` ahora acepta `tareaId` además de subir archivo).
- Al crear la factura en Alegra desde ese flujo, la tarjeta pasa automáticamente a "Facturado" con el número de factura guardado.
- **Acción pendiente en deploy**: agregar `backend/uploads/cotizaciones/` (mkdir) y `backend/api/cotizacion_docx.php` al `.cpanel.yml` si no quedan cubiertos por `backend/api/*` y `backend/uploads/`.
0.1. `alegra_crear_factura.php` ahora envía `paymentForm: "CREDIT"` y `termsConditions` (días entre `date` y `dueDate`) — ver `FACTURACION.md`.
0.2. Pestaña "Todas" eliminada del menú de áreas; pestaña activa ya no queda en blanco-sobre-blanco (fix CSS en `assets/css/app.css`); área por defecto al cargar es IT.
0.3. Las facturas generadas desde cotización agregan "Fecha de ejecución/entrega del servicio" a la descripción de cada ítem (campo editable, por defecto hoy).
1. `alertaFacturacion(t)` ahora devuelve `{dias, vencido}` (antes devolvía `días` solo si > 2, o `null`). Se muestra en el dashboard ("🚨 Realizados sin facturar") apenas la tarea IT/IF/Admin queda "por facturar" (ya no espera 3 días), con el contador de días hábiles transcurridos al lado (igual que seguimiento comercial). El plazo máximo para facturar bajó de 3 a 2 días hábiles (`vencido = dias >= 2`); al llegarlo, el renglón del dashboard y el borde/fondo de la tarjeta en kanban se pintan en rojo.
2. **Reorganización de carpetas (preparación para crecimiento, ver sección "Roadmap / arquitectura objetivo")**: `backend/config.php` y `backend/config_alegra.php` se movieron a `backend/config/`; `backend/db.php` se movió a `backend/lib/`. Se creó `assets/css/app.css` (CSS extraído del `<style>` embebido de `tareas-equipo.html`, que ahora lo enlaza con `<link>`). Se creó `backend/uploads/` (vacía, para futuras fotos de reportes). `.gitignore` y `.cpanel.yml` actualizados acorde. **Acción manual pendiente en el servidor antes de este deploy**: copiar el `config.php` y `config_alegra.php` actuales (en `backend/`) a `backend/config/` (con el mismo contenido/credenciales), ya que estos archivos no se suben por git/deploy.
3. `alertaSeguimiento(t)`: una cotización recién "enviada" aparece de inmediato en el panel "📞 Cotizaciones enviadas que necesitan seguimiento" del dashboard y en la tarjeta del kanban, mostrando "0 días sin contactar" (mientras no haya seguimiento registrado, `alertaSeguimiento` devuelve `{tipo:'sin-seguimiento', dias, vencido}` desde el día 0). Al llegar a 2 días hábiles sin seguimiento (`vencido = dias >= 2`), el renglón del dashboard y el borde/fondo de la tarjeta se pintan en rojo (mismo patrón que `alertaFacturacion`). Una vez registrado el primer seguimiento, el flujo de `seguimientoFecha` (pendiente/al-día) sigue igual.
4. **Nueva pestaña "🧾 Facturación"** (al lado de "💰 Cartera"): permite subir el `.docx` de una cotización (plantilla estándar Innovate), extraer automáticamente cliente, CTINN, fecha y los ítems (IT/MIT/IF/MIF) con sus precios/cantidades/descripciones según las reglas de `FACTURACION.md`, mostrarlos en un formulario editable (incluyendo selección del cliente entre los candidatos encontrados en Alegra por nombre) y crear la factura en Alegra al confirmar. Nuevos endpoints backend:
- `backend/lib/cotizacion_docx_parser.php`: parsea el `.docx` (ZipArchive + DOMDocument, sin dependencias externas) y devuelve cliente, CTINN, fecha, ítems mapeados a los ids de Alegra (IT=16, MIT=12, IF=17, MIF=8, IVA 19%=id 5) y totales.
- `backend/api/alegra_factura_desde_cotizacion.php`: recibe el `.docx` (POST multipart), lo parsea y busca el cliente en Alegra por nombre (con fallback palabra por palabra si el nombre de la cotización es más corto que el registrado en Alegra, ej. "VERDE HORIZONTE" vs "CONDOMINIO CAMPESTRE VERDEHORIZONTE"). No crea nada, solo devuelve los datos para revisión.
- `backend/api/alegra_crear_factura.php`: recibe el JSON ya revisado/editado por el usuario y hace `POST /invoices` en Alegra.
- Documento de reglas de negocio: `FACTURACION.md` (nuevo, en la raíz del repo) — referencia para esta lógica y para futuras extracciones (ej. desde PDF o con IA).
- Deploy ya hecho y verificado en producción.
- **Importante: el deploy ya NO se hace automáticamente.** Cuando se necesite desplegar, usar la conversación "deploy" (con `DEPLOY.md` adjunto), no hacerlo en esta conversación.
- Pendiente conocido: tarea #14, recordatorio diario de seguimientos comerciales (ver sección "Pendientes conocidos"), aplazada por el usuario.
- Nota de seguridad resuelta en código (pendiente de deploy + acción manual en servidor): `backend/config_alegra.php` ya no se sube a git ni se copia por deploy (ver punto 2 arriba y "Notas de seguridad pendientes").
- Instrucción permanente: mantener este archivo (`CONTEXTO.md`) actualizado con cada cambio (arquitectura, convenciones, estructura, pendientes).
- **Instrucción permanente de sesión**: al final de cada conversación en este proyecto, actualizar `CONTEXTO.md` (y otros `.md` relevantes) con todo lo necesario para continuar en el otro equipo. La carpeta se sincroniza por OneDrive, así que los `.md` son el puente entre sesiones.

## Pendientes de seguridad (backlog)

Decisión tomada: mejorar seguridad a nivel API se deja para después. Análisis hecho en sesión 4:
- Hoy el filtrado de vistas es solo UI (JS oculta tabs); un técnico podría llamar `GET /tareas.php` directamente y ver todas las tareas.
- Plan acordado cuando se retome: `requireAuth($pdo)` en todos los endpoints + filtrado server-side en `tareas.php GET` (técnico solo recibe sus tareas) + wrapper `apiFetch()` en JS que inyecta `Authorization: Bearer TOKEN` en todos los fetch. No implementar autorización granular por ahora (técnico puede PUT solo en sus tareas) hasta que haya un caso concreto.

## Pendientes conocidos / Próximas tareas

- **Tarea #14**: recordatorio diario de seguimientos comerciales. Aplazada por el usuario.
- **Seguridad API-level**: ver sección "Pendientes de seguridad" arriba. Aplazada.
- ✅ **Programación multi-día para tarjetas operativas (2026-06-22 → implementado 2026-06-22)**: campo `diasProg` (frontend) / `dias_programacion` (BD, `TINYINT UNSIGNED DEFAULT 1`). El formulario muestra "por N día(s)" junto a la fecha de inicio, y una etiqueta "Hasta: YYYY-MM-DD" cuando N > 1. `generarProgramacion()` usa `enRangoProg(t, fechaISO)` en lugar de igualdad exacta. Las tarjetas IT/IF en "En ejecución" con `diasProg > 1` muestran "🔧 Día X de N · Y días restantes". **Acción pendiente en deploy**: ejecutar `backend/migracion_dias_programacion.sql` antes de publicar.
- ✅ **Bug técnico asignado en tarjetas multi-día (resuelto preventivamente)**: el flujo `openModal → buildTeamPicker(t?.team||[])` ya carga el equipo desde la tarea guardada. `closeModal` resetea `selectedTeam=[]` pero el siguiente `openModal` lo recarga correctamente. No se agregó ningún atajo que evite ese flujo, por lo que el bug no aplica en la implementación actual.

## Roadmap / arquitectura objetivo

La app va a crecer para cubrir gestión integral de la empresa: reportes de visitas técnicas con fotos, comunicación con clientes/técnicos por correo y WhatsApp, y manejo de usuarios con login por técnico. Decisiones para cuando se construya cada pieza (aún no implementadas):

- **Frontend modular**: ✅ implementado — `assets/js/core.js`, `tareas.js`, `cartera.js`, `facturacion.js`, `auth.js`, `reportes.js`, `informes.js`, `alarma.js`, `usuarios.js`, `app.js` (scripts clásicos, scope global compartido). Pendiente: evaluar más adelante migrar a `type="module"` con imports/exports explícitos si el scope global compartido empieza a generar conflictos. (CSS ya se extrajo a `assets/css/app.css`.)
- **Backend por dominio dentro de `api/`**: `api/auth/` (login.php, logout.php, me.php), `api/reportes.php` (reportes de visita + fotos), `api/comunicaciones.php` (cola de envío email/WhatsApp), además de los existentes.
- **`backend/lib/`**: además de `db.php`, irán `auth.php` (helper `requireAuth($roles)`), `MailService.php`, `WhatsAppService.php`, `AlegraService.php`, `PdfService.php`.
- **`backend/config/`**: además de `config.php` y `config_alegra.php`, irán `config_mail.php` y `config_whatsapp.php` — todos gitignored, creados manualmente en el servidor.
- **Autenticación**: sesiones PHP + `password_hash`/`password_verify`, tabla `usuarios` con columna `password_hash` y `rol` (admin/tecnico/comercial/admin_if). Pantalla de login en el frontend.
- **Fotos / reportes de visita**: tabla `reportes_visita` + `reporte_fotos`, archivos en `backend/uploads/reportes/<año>/<mes>/`, PDF con `dompdf` (primer uso de Composer en el proyecto).
- **Mensajería**: tabla `mensajes_salientes` (cola con destinatario, canal, plantilla, payload, estado, intentos) + cron que procesa — empezar con la tarea #14 (recordatorio de seguimientos) como caso piloto.
- **Orden sugerido de implementación**: 1) usuarios/login, 2) reportes de visita con fotos, 3) email/WhatsApp (piloto tarea #14).

## Stack y versiones

- **Frontend**: HTML + JavaScript vanilla, todo en un único archivo `tareas-equipo.html` (~1500 líneas tras extraer el CSS). Sin frameworks, sin build step. CSS en `assets/css/app.css`, enlazado con `<link>`.
- **Backend**: PHP plano (sin frameworks), expuesto como endpoints REST sencillos bajo `backend/api/`.
- **Base de datos**: MySQL (InnoDB, charset `utf8mb4`), acceso vía PDO.
- **Hosting**: cPanel (`grupoinnovate.com`), cuenta `innovate`.
- **Control de versiones / deploy**: GitHub (`carloscuervo-commits/GESTIONAPP`) + cPanel **Git™ Version Control**, que hace `pull` y ejecuta `.cpanel.yml` para copiar archivos a producción.
- **Integración externa**: API REST de Alegra (`https://api.alegra.com/api/v1/...`), autenticación Basic Auth (base64 `email:token`).
- **Zona horaria**: `America/Bogota` (definida en `backend/config/config.php`).

No hay `package.json`, `composer.json` ni gestor de dependencias — todo es código directo.

## Estructura de carpetas

```
GESTIONAPP/
├── .cpanel.yml # Script de deploy: qué archivos se copian a producción y a dónde
├── .gitignore # Ignora backend/config/*.php, migrar-datos.html y backend/uploads/*
├── tareas-equipo.html # Frontend (HTML+JS, SPA de una sola página). CSS vive en assets/css/app.css
├── migrar-datos.html # Herramienta de migración inicial (ya no se usa, ignorada en git)
├── assets/
│ └── css/
│ └── app.css # CSS extraído de tareas-equipo.html
├── backend/
│ ├── config/
│ │ ├── config.php # Credenciales de BD (NO está en git, debe crearse manualmente en el servidor)
│ │ └── config_alegra.php # Credenciales API de Alegra (NO está en git, debe crearse manualmente en el servidor)
│ ├── lib/
│ │ └── db.php # Helpers comunes: getDB(), jsonOut(), jsonInput(), applyCors()
│ ├── uploads/ # Archivos subidos por la app (fotos de reportes, etc.) — gitignored
│ ├── migracion_admin_comercial.sql
│ └── api/
│ ├── tareas.php # CRUD de tareas (GET/POST/PUT/DELETE)
│ ├── usuarios.php # Lista de usuarios/equipo
│ └── alegra_contactos.php # Proxy de búsqueda de contactos en Alegra (para autocomplete de Cliente)
└── db/
├── 001_init.sql # Esquema inicial: usuarios, tareas, tarea_equipo, tarea_historial
└── 002_seguimiento.sql # Migración: columnas seguimiento_fecha y seguimiento_historial
```

Ver sección "Roadmap / arquitectura objetivo" para la estructura destino conforme se agreguen autenticación, reportes y mensajería.

### `.cpanel.yml` — qué se despliega

```yaml
DEPLOYPATH=/home/innovate/public_html/ginno/
- tareas-equipo.html -> DEPLOYPATH
- assets/css/* -> DEPLOYPATH/assets/css/
- backend/lib/* -> DEPLOYPATH/backend/lib/
- backend/api/* -> DEPLOYPATH/backend/api/
- backend/cron/* -> DEPLOYPATH/backend/cron/
- (mkdir) backend/uploads/ -> DEPLOYPATH/backend/uploads/
- db/* -> DEPLOYPATH/db/
```

⚠️ `backend/config/config.php` y `backend/config/config_alegra.php` **no** se copian por deploy (están en `.gitignore` y no existen en el repo); deben existir manualmente en el servidor con las credenciales reales (BD y Alegra respectivamente). Cualquier archivo nuevo de backend que se necesite en producción debe agregarse explícitamente aquí, o el deploy "tendrá éxito" pero el archivo no llegará al servidor.

## Decisiones de arquitectura

1. **SPA de un solo archivo**: todo el frontend vive en `tareas-equipo.html` para simplicidad de despliegue (un solo `cp`). No hay bundlers ni módulos ES.

2. **Modo local / modo servidor con un solo flag**: la constante `API_BASE` en `tareas-equipo.html` decide el modo:
- Si está vacía → la app usa `localStorage` (`STORAGE_KEY = 'cowork_tareas_v4'`), útil para pruebas sin backend.
- Si tiene una URL → todas las operaciones (`load`, `syncTask`, `syncDelete`, `syncEstado`) hablan con `backend/api/tareas.php`.
En producción: `API_BASE = 'https://grupoinnovate.com/ginno/backend/api'` (hardcoded).

3. **Modelo de datos por "área"**: cada tarea (`tareas`) pertenece a un área (`it`, `if`, `admin`, `comercial`) y tiene su propio flujo de estados (`AREA_FLOWS` en el frontend):
- IT / IF: `solicitud → programado → realizado → facturado` (+ `archivado`)
- Admin: `pendiente → en-progreso → bloqueada → por-facturar` (+ `archivado`)
- Comercial: `por-cotizar → enviada → aprobada / rechazada` (+ `archivado`)
El backend guarda `estado` como `VARCHAR(30)` libre (no ENUM), la validez del flujo se controla solo en frontend.

4. **Mapeo explícito API ↔ modelo frontend**: `taskToApi()` / `apiToTask()` traducen entre los nombres de campo del frontend (camelCase, ej. `fechaProg`, `seguimientoFecha`) y las columnas de la BD (snake_case, ej. `fecha_programacion`, `seguimiento_fecha`). Cualquier campo nuevo debe agregarse en **ambos** mapeos + columna SQL + `tareas.php` (INSERT y UPDATE).

5. **Seguimiento comercial** (cotizaciones en estado `enviada`): la función `alertaSeguimiento(t)` calcula en el frontend si una cotización está:
- `sin-seguimiento`: nunca se registró seguimiento (usa `enviadaAt` + días hábiles transcurridos)
- `pendiente`: ya hubo seguimiento pero `seguimientoFecha <= hoy`
- `al-dia`: seguimiento programado a futuro
El historial de seguimientos (`seguimiento_historial`) se guarda como JSON (texto) en una columna `TEXT` y se serializa/deserializa en `taskToApi`/`apiToTask`.

6. **Integración Alegra como autocomplete, no como sincronización**: `alegra_contactos.php` es un proxy delgado que consulta `GET /contacts?name=...` en Alegra y devuelve `[{id, name}, ...]` simplificado. Se usa solo para sugerir nombres de cliente al escribir (mínimo 2 caracteres) — no hay sincronización bidireccional ni almacenamiento de IDs de Alegra en la BD todavía.

7. **Helpers backend centralizados en `backend/lib/db.php`**: `applyCors()` (CORS abierto `*` + maneja `OPTIONS`), `jsonOut($data, $code)` (responde JSON y `exit`), `jsonInput()` (lee body JSON), `getDB()` (PDO singleton con `ERRMODE_EXCEPTION`, `FETCH_ASSOC`, `EMULATE_PREPARES=false`). Todos los endpoints nuevos deben `require_once __DIR__ . '/../lib/db.php'` y empezar con `applyCors()`. Configs sensibles (`config.php`, `config_alegra.php`, y los que se agreguen como `config_mail.php`/`config_whatsapp.php`) viven en `backend/config/`, gitignored.

8. **IDs de tareas**: cadena alfanumérica larga generada por el frontend (ej. `mr20a1xnts1p6qzt4db`, ~19 chars), con codificación basada en tiempo (similar a ULID). Columna `VARCHAR(36)` aprox. **La UI muestra solo los primeros 4 caracteres en mayúscula con prefijo `#`** (ej. `#MQ9J` corresponde al ID `mq9j...` en BD). Al buscar una tarea por su código de display, usar `WHERE id LIKE 'mq9j%'` (primeros 4 chars en minúscula), nunca igualdad exacta con el código display.

9. **Trazabilidad de cambios de estado**: cada cambio de `estado` en una tarea se registra en `tarea_historial` vía `registrarHistorial()` (no se registra si el estado no cambió).

10. **Tarjeta de tarea simplificada para IT/IF**: el modal "Nueva Tarea"/edición tiene orden de campos fijo (Cliente → Título → Descripción → Equipo asignado → Área/Estado/...) para todas las áreas. Cuando `area` es `it` o `if`, `updateFormForArea()` oculta además `grp-fecha` (fecha límite), `grp-tiempo`, `grp-treal`, `grp-recursos` y `grp-notas` (todos con `id` asignado para poder ocultarlos). El **equipo asignado** ya no usa chips seleccionables tipo toggle: `buildTeamPicker()` ahora renderiza los miembros ya asignados como chips con botón "✕" para quitar (`toggleTeamChip`), más un `<select>` "+ Agregar técnico..." con los miembros disponibles que al elegir uno lo ag