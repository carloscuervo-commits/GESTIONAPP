# DEPLOY.md — Instrucciones de despliegue GESTIONAPP

Este archivo se adjunta en la conversación "deploy" para que Claude haga el deploy cuando se le pida.

## Contexto del proyecto

- Repo local: `D:\OneDrive\INNOVATE\GESTIONAPP`
- Repo remoto: `https://github.com/carloscuervo-commits/GESTIONAPP.git` (rama `main`)
- Servidor: cPanel en `https://grupoinnovate.com:2083`, cuenta `innovate`
- App en producción: `https://grupoinnovate.com/ginno/tareas-equipo.html`
- El deploy copia archivos según `.cpanel.yml` a `/home/innovate/public_html/ginno/`

## Pasos del deploy

1. **Commit y push (GitHub Desktop)**
   - Abrir GitHub Desktop, repo GESTIONAPP.
   - Revisar los cambios pendientes.
   - Escribir un mensaje de commit descriptivo en español (imperativo/sustantivo, ej. "Actualizar...", "Fix: ...").
   - Hacer commit y luego "Push origin".
   - Verificar que quede "No local changes" / "Last fetched just now".

2. **cPanel → Git™ Version Control**
   - Navegar a `https://grupoinnovate.com:2083/.../version_control/index.html#/manage/%252Fhome%252Finnovate%252Frepos%252Fgestionapp/deploy`
   - Pestaña "Pull or Deploy".
   - Clic en **"Update from Remote"**.
     - Si el botón queda en estado de carga/gris, esperar unos segundos y, si no se actualiza el HEAD Commit, hacer clic de nuevo (a veces requiere dos clics).
   - Verificar que aparezca el badge **"New"** junto a "HEAD Commit" y que el mensaje del commit coincida con el que se acaba de pushear.

3. **Deploy**
   - Clic en **"Deploy HEAD Commit"**.
   - Esperar el mensaje "The deployment ... is complete."

4. **Verificación**
   - Abrir/recargar `https://grupoinnovate.com/ginno/tareas-equipo.html?cb=<numero único>` (usar un parámetro de cache-busting nuevo cada vez, cPanel/navegador cachea).
   - Verificar visualmente que el cambio esperado esté presente (ej. abrir "Nueva Tarea", revisar campos, etc.)

## Notas importantes

- ⚠️ **NO hacer deploy automáticamente.** Solo ejecutar estos pasos cuando el usuario lo pida explícitamente en esta conversación ("deploy").
- `backend/config.php` NO está en git (se crea manualmente en el servidor, contiene credenciales reales de BD).
- Cualquier archivo nuevo de backend que deba llegar a producción tiene que estar listado en `.cpanel.yml`, si no, el deploy "tendrá éxito" pero el archivo no se copiará.
- ⚠️ **Caché de `assets/js/*.js` (7 días)**: estos archivos se sirven con `Cache-Control: public, max-age=604800`. Si un deploy modifica cualquier archivo en `assets/js/`, hay que actualizar el query param `?v=YYYYMMDD` en los 5 `<script src="assets/js/...?v=...">` de `tareas-equipo.html` (subirlo a una fecha nueva), o los navegadores seguirán usando el JS viejo hasta una semana después del deploy.
- Para más detalle de arquitectura/estructura del proyecto, ver `CONTEXTO.md`.

## Cambios pendientes de deploy (2026-08-19 — fix: hora de checkout incorrecta impresa en el PDF)

Sin migraciones ni cron. `assets/js/reportes.js?v=20260819a`:

**Bug detectado** (tarjeta MSYZ, visita 2026-08-19, técnico Jorge Guerrero): el checkout real quedó a las 5:44 p.m. — coincide con la hora de envío del correo al cliente, correcto y sin afectar. Pero el PDF adjunto imprimía la salida a las 10:43 p.m., 5 horas después.

**Causa:** `generarPDFReporte()` estampa "la hora en que se dio clic en Generar PDF" cuando detecta un checkout diferido local (`_pendingCheckout`) que coincide con el reporte abierto — pero solo validaba el id, no si el reporte seguía realmente abierto en el servidor. Si esa variable local sobrevive en el navegador más allá del envío real (ej. se reabre el mismo reporte, en la misma sesión del navegador, después de que el checkout ya quedó registrado por otro camino) y alguien vuelve a darle "Generar PDF", el archivo se sobrescribe con una hora de salida nueva e incorrecta, aunque el checkout real en el servidor ya estaba bien.

**Fix:** el estampado de "ahora" en el PDF solo se aplica si `reporteActual.estado === 'activo'` (el reporte sigue genuinamente sin checkout real). Si no, se descarta la referencia local obsoleta (`_pendingCheckout = null` + se limpia de `sessionStorage`) y el PDF usa la hora de checkout real ya guardada.

El PDF ya enviado en el caso MSYZ no se corrigió a pedido del usuario (el cliente ya lo recibió) — el checkout real de esa visita nunca estuvo mal, solo lo impreso en ese archivo puntual.

## Cambios pendientes de deploy (2026-08-18 — reenviar correo / WhatsApp desde el historial de visitas)

Sin migraciones ni cron nuevo. `assets/js/reportes.js?v=20260807g`:

- Cuando un reporte ya está "✅ Enviado", el historial de visitas del modal ahora muestra, junto a "📄 Ver PDF", dos botones nuevos: "✉️ Reenviar correo" y "📲 WhatsApp" — disponibles para técnico y admin (antes solo se podía reenviar entrando a "✏️ Editar reporte", que además solo ve el admin).
- `reenviarCorreoHistorial(reporteId, btn)` (nueva): busca el correo del cliente registrado (mismo endpoint que usa el formulario), reenvía con `reporte_enviar_correo.php` y confirma con `alert()`. Pide confirmación antes de enviar (evita reenvíos accidentales). No toca checkout/estado — el reporte ya está cerrado.
- `compartirPDFWhatsApp()` se refactorizó: la lógica de armar el archivo/mensaje y compartir quedó en `_compartirPDFWhatsAppImpl(rep, btn, usarTextContent)`, reutilizada por el botón original del formulario (usa `reporteActual`) y por la nueva `compartirPDFWhatsAppHistorial(reporteId, btn)` (trae el reporte del servidor primero, ya que no hay formulario abierto). Mismo comportamiento de fondo: solo registra `whatsapp_enviado_en`, nunca afecta el checkout.

## Cambios pendientes de deploy (2026-08-18 — checkout automático de cierre de jornada)

"Blindaje" contra visitas que nunca se cierran: aviso previo a los técnicos + checkout forzado a la hora de corte + resumen a administradores.

⚠️ **Acción manual en base de datos (phpMyAdmin) — correr antes de desplegar el código:**
```sql
ALTER TABLE visita_participantes
  ADD COLUMN checkout_automatico TINYINT(1) NOT NULL DEFAULT 0 AFTER check_out;

ALTER TABLE reportes
  ADD COLUMN cerrado_automatico TINYINT(1) NOT NULL DEFAULT 0 AFTER estado;

INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('checkout_auto_hora',     '18:30'),
  ('aviso_checkout_auto',    '1'),
  ('aviso_checkout_auto_tg', '1');
```
(Migración trackeada en `db/031_checkout_automatico.sql`.)

⚠️ **Acción manual en cPanel — dos cron jobs nuevos** (hora Colombia, deben ejecutarse en este orden y coordinarse con `checkout_auto_hora` si se cambia esa hora desde Configuración):
```
# Aviso previo — 5:30pm, 1h antes del corte, solo días laborales
30 17 * * 1-5 /usr/bin/php /home/innovate/public_html/ginno/backend/cron/aviso_checkout_automatico.php > /dev/null 2>&1

# Checkout automático — 6:30pm, hora de corte, solo días laborales
30 18 * * 1-5 /usr/bin/php /home/innovate/public_html/ginno/backend/cron/checkout_automatico.php > /dev/null 2>&1
```

**Cómo funciona:**
1. **5:30pm (`aviso_checkout_automatico.php`):** a cada técnico con visitas de hoy sin checkout, avisa por correo/Telegram (togglable en Configuración → Avisos a técnicos, activado por defecto) que si no las cierra antes de las 6:30pm, Ginno va a hacer un checkout automático 1 hora después de la hora de inicio de cada una, y esa será la hora que se tome como trabajada para nómina.
2. **6:30pm (`checkout_automatico.php`):** por cada participante que siga sin checkout con check-in de hoy, fuerza `check_out = MIN(check_in + 1h, ahora)` — nunca una hora futura (ej. si el check-in fue a las 6:15pm, el checkout queda a las 6:30pm, no a las 7:15pm). Marca `visita_participantes.checkout_automatico = 1` y cierra cualquier pausa activa a esa misma hora. Si con esto el reporte queda sin nadie pendiente, se cierra igual que un "Continuar sin reporte" (`estado='sin_reporte'`) pero además marcado `cerrado_automatico = 1` — **no se envía correo al cliente ni se exige generar el reporte**; el técnico puede completarlo después si quiere con "📝 Completar reporte".
3. **Resumen a administradores:** si hubo al menos un checkout forzado ese día, se envía un resumen por correo y Telegram a todos los administradores con esos datos configurados — **siempre activo, no depende de ningún toggle**. Si no hubo ninguno, no se envía nada.
4. **Diferenciación visual:** tanto en la tarjeta (botón de visita activa) como en el historial de visitas del modal y en la bitácora, un checkout automático se ve distinto (🤖 morado) de uno normal — para que quede claro que lo cerró Ginno, no el técnico.

**Archivos:**
- `db/031_checkout_automatico.sql` (nuevo)
- `backend/cron/aviso_checkout_automatico.php` (nuevo) — aviso previo
- `backend/cron/checkout_automatico.php` (nuevo) — checkout forzado + resumen admin
- `backend/api/bitacora.php` — agregado `vp.checkout_automatico` al SELECT de detalle de visitas
- `assets/js/bitacora.js?v=20260807b` — `_bitHorarioCell()`: hora de salida con 🤖 morado cuando `checkout_automatico`
- `assets/js/reportes.js?v=20260807f` — `renderVisitaBoton()`: línea morada "🤖 checkout automático" en vez de la línea verde normal; `renderHistorialVisitasModal()`: badge "🤖 Cerrado automático" (antes de "Reporte pendiente") + marca en la línea de cada participante (vista técnico y vista admin)
- `assets/js/configuracion.js?v=20260807a` — nueva fila en Avisos a técnicos (`aviso_checkout_auto` / `_tg`) + campo de hora `checkout_auto_hora` (junto al umbral de horas de contrato)
- `tareas-equipo.html` — bumps de versiones arriba

**Nota de diseño confirmada con el usuario:** el límite de las 6:30pm cap la hora de checkout automático (nunca queda en el futuro), el aviso previo corre a las 5:30pm, y el resumen a administradores siempre está activo (no toggle).

## Cambios pendientes de deploy (2026-08-06 — fix "Continuar reporte" en visitas recién iniciadas)

`assets/js/reportes.js?v=20260806c`. En `renderHistorialVisitasModal()` se eliminó el bloque que inyectaba un botón "📝 Continuar reporte" para cualquier reporte con `estado === 'activo'`. Ese estado solo significa "check-in hecho, sin checkout aún" — es el estado normal de toda visita en curso, no un borrador abandonado. El botón duplicaba/contradecía el flujo correcto de "🏁 Finalizar" (`renderVisitaBoton()`) y aparecía apenas el técnico daba clic en "Iniciar visita", antes de siquiera llegar al formulario de reporte.

También se eliminaron 3 `alert()` de debug dejados en `_geofenceCheck()` (`[GEO] Sin GPS`, `[GEO] Sin ubicación del cliente`, `[GEO] Dentro de zona`) que interrumpían con popups cada check-in/checkout con geolocalización, sin cambiar el comportamiento (solo dejaron de mostrar el popup).

**Bug adicional corregido (mismo día, `?v=20260806d`):** al finalizar la visita del último técnico, el checkout queda diferido (`_pendingCheckout`) hasta que se envíe el reporte o se confirme "sin reporte" — el servidor no se entera todavía. Mientras tanto, el objeto local usado para mostrar el formulario se marcaba `estado:'enviado'` solo por estética de UI. `cerrarFormularioReporte()` usaba ese mismo campo para decidir si mostrar la advertencia "vas a cerrar sin hacer reporte" — como ya decía `'enviado'`, se saltaba la advertencia y pasaba directo al popup "¿cómo quedó la tarea?" sin nunca confirmar el checkout en el servidor. Resultado: el checkout quedaba huérfano y la visita "revivía" como en curso al recargar. Pasaba en ambos casos (terminada o por reprogramar); en "terminada" no se notaba porque el indicador de visita en curso se oculta para tarjetas en Realizado/Por facturar salvo que sean de hoy.

Fix: `cerrarFormularioReporte()` ahora se basa en `_pendingCheckout` (dato real) en vez del `estado` cosmético del objeto local — mientras haya un checkout diferido sin confirmar, siempre advierte antes de cerrar.

⚠️ **Pendiente revisión manual de datos:** la tarjeta que inicia con "MSGH" probablemente tiene un reporte en estado `activo` sin `check_out` en la base de datos (checkout perdido durante la prueba). Revisar y corregir manualmente en `reportes`/`visita_participantes`.

**Hallazgo importante — service worker (`sw.js`):** `tareas-equipo.html` está precacheado con estrategia Cache First, independiente del `?v=` de los scripts. Mientras `sw.js` no cambia de contenido, el navegador nunca instala una versión nueva del service worker y puede seguir sirviendo el HTML/JS viejo indefinidamente aunque se haga deploy + hard refresh. Se subió `CACHE_NAME` de `'ginno-v2'` a `'ginno-v3'` para forzar la actualización. **Después de este deploy, probablemente haya que cerrar completamente pestaña/navegador (no solo refrescar) o desregistrar el service worker manualmente desde DevTools → Application → Service Workers para que tome efecto de inmediato.** Este hallazgo aplica retroactivamente: pudo ser la causa real de otros "no funciona" reportados antes en esta sesión.

Sin cambios de esquema ni cron. Deploy + (posible) cierre completo del navegador o desregistro manual del service worker.

**Validación nueva (`reportes.js?v=20260806f`):** `generarPDFReporte()` ahora exige, antes de generar el PDF (y por tanto antes de poder enviarlo por correo, ya que ese botón solo aparece después): campo 3 "Describa de forma detallada las acciones llevadas a cabo" con mínimo 20 palabras, y campo 6 "Firma de Conformidad del Cliente" guardada. Si falta algo, muestra alerta y no genera el PDF. Los mensajes no mencionan el conteo de palabras (para no darle pistas al técnico) y hablan en primera persona como Ginno.

## Cambios pendientes de deploy (2026-08-07 — botones de reporte por visita + envío confirmado por correo/WhatsApp)

⚠️ **Acción manual en base de datos (phpMyAdmin) — correr antes de desplegar el código:**
```sql
ALTER TABLE reportes
  ADD COLUMN whatsapp_enviado_en DATETIME NULL AFTER enviado_en;
```
(Migración trackeada en `db/030_reporte_whatsapp_enviado.sql`.)

**Resumen:**
- **Modal de tarjeta → Historial de visitas** (`reportes.js?v=20260807a`): los botones "Ver PDF"/"Editar reporte"/"Completar reporte" ya no van en una barra superior genérica (ambigua con varias visitas) — ahora aparecen dentro del recuadro de cada visita, junto a su propio badge de estado.
- **El ciclo de la visita no se considera completo solo por generar el PDF.** Se agregó `whatsapp_enviado_en` (fecha/hora) porque no existía ningún registro de que el PDF se hubiera compartido por WhatsApp. Un reporte se marca "✅ Enviado" solo si tiene `pdf_archivo` Y (`enviado_en` por correo O `whatsapp_enviado_en`). Antes se confiaba en `estado==='enviado'`, que en realidad se pone al hacer checkout, no al enviar — mismo tipo de confusión que causó el bug del checkout perdido corregido hoy más temprano.
- `compartirPDFWhatsApp()` ahora, al completar el share nativo sin que el usuario lo cancele, hace `PUT reportes.php?id=... {accion:'whatsapp_enviado'}` para registrar la fecha. No captura destinatario (el técnico elige el contacto a mano en la hoja de compartir).
- Backend `reportes.php`: nueva acción PUT `whatsapp_enviado`.
- `reporte_interno` (envío solo a admin, no al cliente) ya estaba bien manejado en `reporte_enviar_correo.php` — no requirió cambios.

⚠️ **Nota para más adelante (no incluida en este cambio):** otras partes de la app (`reportesEnviados`/`reportesTodosEnviados` en `cargarVisitasActivas()`, que bloquean "Iniciar visita" el mismo día y controlan cuándo se oculta el indicador de visita en tarjetas "Realizado"/"Por facturar") siguen basándose en `estado==='enviado'` sin verificar `enviado_en`. Es la misma ambigüedad, pero tocarla implica una revisión más amplia — se deja pendiente hasta que se pida explícitamente.

## Cambios pendientes de deploy (2026-08-07 — el correo es lo único que cierra el ciclo; WhatsApp queda como herramienta opcional)

Decisión: WhatsApp facilita el envío pero **no participa en ningún cambio de estado ni checkout** — solo el correo (que sí deja traza) cierra el ciclo de la visita. `reportes.js?v=20260807b`:

- **`renderHistorialVisitasModal()`:** "✅ Enviado" ahora depende solo de `enviado_en` (correo). `whatsapp_enviado_en` sigue guardándose (dato informativo) pero ya no cuenta para marcar el reporte como completo.
- **`enviarCorreoReporte()` reordenado:** antes se registraba el checkout y LUEGO se intentaba enviar el correo (si el correo fallaba, igual quedaba `estado='enviado'` sin correo real). Ahora se intenta enviar el correo primero; el checkout (`_completarCheckout()`) solo se confirma si el correo salió bien. Si el correo sale pero el checkout falla por red, se avisa para reintentar sin perder el envío ya hecho.
- **Hora de checkout = hora real de envío del correo**, no la del clic en "Finalizar". `_completarCheckout()` y `confirmarSinReporte()` ya no envían `checkoutAt` al servidor — este usa su propia hora (`NOW()`) en el momento real de escribir. Así el tiempo que el técnico usa diligenciando el reporte se carga al cliente.
- **El PDF muestra la hora en que se generó** (no la del "Finalizar" ni la del envío del correo): `generarPDFReporte()`, tras pasar las validaciones, actualiza localmente `reporteActual.check_out` (y el participante correspondiente) a la hora actual antes de armar el contenido. Esta hora impresa puede quedar unos minutos antes de la hora real de checkout que se factura (la del envío del correo) — es intencional.
- `compartirPDFWhatsApp()` no se tocó: sigue sin afectar checkout/estado, solo registra `whatsapp_enviado_en`.

Sin cambios de esquema adicionales (usa la migración `030_reporte_whatsapp_enviado.sql` ya aplicada). Reportes ya cerrados no se ven afectados — el cambio de comportamiento aplica hacia adelante.

**Ajuste de UI (mismo día, `reportes.js?v=20260807c`):** el botón "Enviar por WhatsApp" aparecía antes de la sección de correo y solo si `yaGenerado`, lo que hacía que pareciera inconsistente. Ahora está siempre dentro de la sección de envío (mismo bloque que el correo), justo debajo de "Enviar por correo", mismo tamaño de botón, con una nota debajo aclarando que es una herramienta opcional y que el envío obligatorio es por correo.

**Fix (mismo día, `reportes.js?v=20260807d`):** el badge y las acciones (`Ver PDF`/`Editar reporte`/`Completar reporte`/`Borrar visita`) del historial de visitas dejaron de basarse en `reportes.estado` y ahora miran si los participantes ya tienen checkout real (`todosConCheckout`). Causa del bug reportado: `reportes.estado` puede quedar transitoriamente en `'activo'` sin que nadie siga en sitio — ej. al reabrir una visita `sin_reporte` con el nuevo botón "Completar reporte" y generar el PDF, una regla ya existente en el backend (`reportes.php`, promueve `sin_reporte`→`activo` al adjuntar un PDF) deja el reporte en ese estado intermedio si no se llega a enviar por correo. Antes eso hacía que la visita se viera "🟢 En curso" y hasta ofrecía "🗑️ Borrar visita" (destructivo) aunque ya tuviera checkout real. Ahora "En curso" y "Borrar visita" solo aparecen si de verdad hay alguien sin checkout.

## Cambios pendientes de deploy (2026-08-07 — badge "Falta reporte" en la tarjeta del kanban)

`reportes.php?v=` (sin bump de caché, es backend), `reportes.js?v=20260807e`, `tareas.js?v=20260807a`:

- Nuevo endpoint `GET reportes.php?tarea_ids_falta_reporte=1`: devuelve las tareas con al menos una visita ya terminada (todos los participantes con checkout) cuyo reporte no se ha enviado por correo (`enviado_en IS NULL`). No cuenta visitas todavía en curso.
- `cargarVisitasActivas()` carga ese listado en el nuevo Set `tareasFaltaReporte`.
- Tarjetas del kanban (`tareas.js`): si `tareasFaltaReporte.has(t.id)`, muestra `⚠️ Falta reporte` junto a los demás badges de la tarjeta. Si la tarea tiene varias visitas, basta con que una cumpla la condición.

Sin cambios de esquema ni cron.

## Cambios pendientes de deploy (2026-08-07 — Telegram fase 2: primer botón interactivo "👍 Recibido")

Arranca la fase 2 (interacciones, no solo avisos de salida). Primer bloque, mínimo para validar toda la tubería: botón "👍 Recibido" en el aviso de nueva tarea asignada.

**Archivos:**
- `backend/lib/telegram.php` — nuevas funciones `sendTelegramMsgConBotones()`, `telegramEditarTexto()`, `telegramResponderCallback()`.
- `backend/api/telegram_webhook.php` (nuevo) — recibe las respuestas de Telegram cuando alguien toca un botón. Se despliega solo (`.cpanel.yml` copia `backend/api/` completo).
- `backend/api/tareas.php` — el aviso de nueva tarea ahora incluye el botón.

⚠️ **Acción manual 1 — SQL en phpMyAdmin** (guarda el secreto que valida que las llamadas al webhook vienen realmente de Telegram):
```sql
INSERT INTO configuracion (clave, valor) VALUES
  ('telegram_webhook_secret', 'e8c444f649f0af6e0dfbebad9599d444f33c4c9dc0c1e8d7')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);
```

⚠️ **Acción manual 2 — registrar el webhook ante Telegram (una sola vez, después del deploy).** Abre esta URL en el navegador, reemplazando `<TOKEN>` por el valor de `TELEGRAM_BOT_TOKEN` en `backend/config/config.php` del servidor:
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://grupoinnovate.com/ginno/backend/api/telegram_webhook.php&secret_token=e8c444f649f0af6e0dfbebad9599d444f33c4c9dc0c1e8d7
```
Debe responder `{"ok":true,"result":true,...}`. Para verificar el estado más adelante: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`.

## Cambios pendientes de deploy (2026-08-07 — bitácora: abrir tarjeta en ventana nueva)

`backend/api/bitacora.php`, `bitacora.js?v=20260807a`, `app.js?v=20260807a`:

- `bitacora.php` ahora incluye `t.id AS tarea_id` en el detalle de visitas.
- En la bitácora, el nombre del cliente/tarea de cada fila de visita es clickeable (subrayado) — abre esa tarjeta en una **ventana nueva** (`window.open`), no interrumpe la bitácora que se está revisando.
- `app.js`: `iniciarApp()` ahora reconoce el parámetro de URL `?abrir_tarea=ID&area=AREA` — cambia a esa área y abre el modal de la tarjeta al cargar. Limpia el parámetro de la URL después para que un refresh no la reabra.

Sin cambios de esquema ni cron.

**Cómo funciona:** al tocar "👍 Recibido", Telegram llama a `telegram_webhook.php` con el secreto en el header `X-Telegram-Bot-Api-Secret-Token` (se valida contra `configuracion.telegram_webhook_secret`). Se confirma que quien tocó el botón es un técnico realmente asignado a esa tarea, y se edita el mensaje original agregando "✅ Recibido por «nombre» — fecha/hora" (sin guardar nada nuevo en la base de datos por ahora — el propio mensaje de Telegram es el registro). Sin cambios de esquema ni cron.

## Cambios pendientes de deploy (2026-08-06 — panel Avisos Telegram + 6 eventos nuevos)

Sin migraciones de esquema (la tabla `configuracion` ya es clave/valor libre — las claves nuevas se crean solas al primer guardado desde el panel).

⚠️ **Acción manual en cPanel — nuevo cron job:**
```
30 7 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/avisos_visitas_colgadas.php > /dev/null 2>&1
```

**Resumen:** el panel Configuración → Avisos a técnicos ahora tiene dos columnas de interruptores (📧 Correo / ✈️ Telegram) por cada evento, en vez de un solo toggle que solo controlaba correo. Se agregaron 6 eventos nuevos que antes no notificaban a nadie, y un campo numérico para el umbral de horas de contrato.

| Archivo | Cambio |
|---|---|
| `backend/lib/telegram.php` | Nueva función `adminsConTelegram($pdo)` — admins activos con `telegram_chat_id`. |
| `backend/lib/avisos_tecnicos.php` | Nueva función `adminsConEmail($pdo)` — admins activos con email. |
| `backend/api/tareas.php` | Los 3 envíos de Telegram existentes (nueva tarea, cambio de programación, cambio de descripción) ya no son incondicionales — ahora respetan los toggles `aviso_asignacion_tarea_tg` / `aviso_cambio_programacion_tg` / `aviso_cambio_descripcion_tg`. |
| `backend/api/reportes.php` | Dos avisos nuevos: (1) al cerrar una visita sin reporte (`estado='sin_reporte'`) se avisa al técnico — `aviso_sin_reporte` / `aviso_sin_reporte_tg`. (2) al hacer checkout de una tarea de contrato, si las horas disponibles del cliente ese mes caen bajo el umbral configurado, se avisa a administradores (máx. 1 vez por cliente/área/mes) — `aviso_horas_contrato` / `aviso_horas_contrato_tg` + `horas_contrato_umbral`. |
| `backend/api/fuera_sitio.php` | Al registrar un check-in/checkout fuera del radio del cliente, avisa a administradores — `aviso_fuera_sitio` / `aviso_fuera_sitio_tg`. |
| `backend/api/alertas.php` | El correo de "técnico tardío" (antes incondicional) ahora se puede desactivar con `aviso_retraso_admin` (queda **activo por defecto** si la clave no existe, para no romper el comportamiento actual). Nuevo: Telegram a administradores con `aviso_retraso_admin_tg` (opt-in, apagado por defecto). |
| `backend/cron/bitacora_deficit.php` | Al detectar déficit de horario del día anterior, avisa al técnico — `aviso_bitacora_deficit` / `aviso_bitacora_deficit_tg`. Antes no notificaba a nadie. |
| `backend/cron/avisos_tiempo.php` | Los avisos "30 min antes" y "sin check-in 10 min después" ahora también pueden ir por Telegram — `aviso_30min_antes_tg` / `aviso_10min_sin_checkin_tg`. |
| `backend/cron/avisos_dia_anterior.php` | El resumen del día siguiente ahora también puede ir por Telegram (un mensaje consolidado por técnico) — `aviso_dia_anterior_tg`. |
| `backend/cron/avisos_visitas_colgadas.php` | **Nuevo.** Versión servidor del popup "visitas en curso de días anteriores" (ver sesión 2026-08-06 anterior): corre una vez al día por la mañana, avisa a cada técnico sus visitas colgadas y a administradores el listado completo — `aviso_visitas_colgadas` / `aviso_visitas_colgadas_tg`. Requiere el cron nuevo de arriba. |
| `assets/js/configuracion.js?v=20260806a` | Panel rediseñado: dos columnas de toggles (Correo/Telegram) por evento, 6 filas nuevas, campo numérico "Umbral de horas de contrato" (`horas_contrato_umbral`, guarda al salir del campo). |
| `tareas-equipo.html` | Bump `configuracion.js?v=20260806a`. |

**Claves de configuración nuevas** (todas arrancan en `0`/apagadas salvo `aviso_retraso_admin` que arranca encendida por compatibilidad — se activan una por una desde el panel):
`aviso_asignacion_tarea_tg`, `aviso_cambio_programacion_tg`, `aviso_cambio_descripcion_tg`, `aviso_dia_anterior_tg`, `aviso_30min_antes_tg`, `aviso_10min_sin_checkin_tg`, `aviso_retraso_admin`, `aviso_retraso_admin_tg`, `aviso_sin_reporte`, `aviso_sin_reporte_tg`, `aviso_fuera_sitio`, `aviso_fuera_sitio_tg`, `aviso_bitacora_deficit`, `aviso_bitacora_deficit_tg`, `aviso_visitas_colgadas`, `aviso_visitas_colgadas_tg`, `aviso_horas_contrato`, `aviso_horas_contrato_tg`, `horas_contrato_umbral` (numérico, default 2).

✅ `.cpanel.yml` copia `backend/lib/`, `backend/api/` y `backend/cron/` completos — el archivo nuevo se despliega automáticamente, solo falta agregar el cron job en cPanel.

**Fase 2 (pendiente, no incluida aquí):** botones interactivos de Telegram (check-in/checkout/cerrar visita sin abrir la app) — requiere un endpoint `telegram_webhook.php` nuevo y registrar la URL con `setWebhook` en el Bot API.

---

## Cambios pendientes de deploy (2026-08-05 — fix z-index modal usuarios + Telegram Bot)

Sin migraciones adicionales de BD.

| Archivo | Cambio |
|---|---|
| `tareas-equipo.html` | Fix: `#usuarios-modal` sube a `z-index:450` para quedar por encima del panel de Configuración (`z-index:400`). El campo Telegram Chat ID ya estaba en el HTML — era invisible por este bug. |

---

## Cambios pendientes de deploy (2026-08-05 — integración Telegram Bot)

⚠️ **Acción manual en el servidor ANTES del deploy:**
1. Migración de BD (si no se hizo antes):
   ```sql
   ALTER TABLE usuarios ADD COLUMN telegram_chat_id VARCHAR(20) NULL DEFAULT NULL;
   ```
2. Agregar a `config.php` en el servidor (el que no está en git):
   ```php
   define('TELEGRAM_BOT_TOKEN', 'TOKEN_DEL_BOT');
   ```

| Archivo | Cambio |
|---|---|
| `backend/lib/telegram.php` | **Nuevo**. `sendTelegramMsg()`, `tecnicosConTelegram()`, `telegramTareaInfo()`. Silencioso si falta el token. |
| `backend/api/tareas.php` | POST: envía Telegram al asignar tarea. PUT: envía Telegram al cambiar fecha/hora o título/descripción. |

✅ `.cpanel.yml` copia `backend/lib/` y `backend/api/` — ambos archivos se despliegan automáticamente.

---

## Cambios pendientes de deploy (2026-08-05 — campo Telegram Chat ID en usuarios)

⚠️ **Requiere migración de BD antes del deploy:**
```sql
ALTER TABLE usuarios ADD COLUMN telegram_chat_id VARCHAR(20) NULL DEFAULT NULL;
```

| Archivo | Cambio |
|---|---|
| `backend/api/usuarios.php` | SELECT, INSERT y UPDATE incluyen `telegram_chat_id`. Campo opcional; NULL si vacío. |
| `assets/js/usuarios.js?v=20260805a` | Modal de usuario: nuevo campo "Telegram Chat ID". Se pobla al abrir y se envía en payload. |
| `tareas-equipo.html` | Bump `usuarios.js?v=20260805a`; nuevo campo `#um-telegram` en el modal. |

✅ Sin cambios en `.cpanel.yml` — archivos ya incluidos en el deploy.

---

## Cambios pendientes de deploy (2026-08-01 — informe para cliente con PDF + refinamientos + periodo rápido)

Sin migraciones de BD.

| Archivo | Cambio |
|---|---|
| `backend/api/informe_cliente.php` | **Nuevo**. Endpoint GET `?cliente=&fecha_inicio=&fecha_fin=`. Retorna visitas completadas agrupadas con horas hombre por técnico, campos de texto del reporte (sin fotos), y `modalidad` de la tarea. |
| `backend/api/fuera_sitio.php` | Agrega `t.area AS tarea_area` al SELECT, para poder abrir la tarjeta desde el informe de checks fuera de sitio. |
| `assets/js/informes.js?v=20260801f` | Nueva opción "📄 Informe para cliente": selector cliente autocomplete, toggle contrato, botón 🙈 por visita, botón "🖨️ Guardar PDF". Refinamientos: email→info@innovate.com.co, fix about:blank (`@page{margin:0}`), texto justificado, badge presencial/remoto, checkbox "Redondear horas" (mín 1h+30min para en_sitio), ocultar materiales vacíos. Botones "📅 Este mes" / "⬅️ Mes anterior" para selección rápida del periodo (visibles en todos los informes con fechas). Fix: informe de cliente quedaba vacío al cambiar de cliente por respuestas async fuera de orden (oninput dispara una petición por tecla); ahora `recalcularInforme()` descarta respuestas viejas con un `reqId` de secuencia. Nuevo: en los informes que listan tarjetas (Actividades de un técnico, Tarjetas de un cliente, Reportes de tarjetas operativas, Llegadas tardías, Checks fuera de sitio), la primera columna de cada fila es clickeable y abre la tarjeta (`abrirTarjetaInforme()`) cambiando a su pestaña de área. Nuevo filtro "Estado" en "Reportes de tarjetas operativas": Todos / ⏳ En curso (sin checkout) / 🚫 Sin reporte / ❌ No enviado (en curso + sin reporte) / ✅ Enviado — vía `pasaFiltroEstadoReporte()`. |
| `assets/js/tareas.js?v=20260801b` | Checkbox "Ver archivados" (no hacía nada en el tablero kanban) renombrado a "Incluir archivados": ahora filtra las tarjetas archivadas por el buscador/responsable igual que las activas, y expande automáticamente la sección "Archivadas" cuando hay coincidencias. Fix: `saveTask()` revertía sola una tarjeta de "Por reprogramar" a "En ejecución" cuando el campo Fecha de programación ya traía un valor previo (aunque no se hubiera cambiado). Ahora solo auto-convierte a "programado" si la fecha es realmente nueva en ese guardado. |
| `assets/js/reportes.js?v=20260801b` | Nueva alerta "Visitas en curso de días anteriores": al abrir sesión (`iniciarApp()`), `revisarVisitasEnCursoAntiguas()` revisa `visitasActivas` en busca de participantes sin checkout cuyo check-in fue en un día anterior a hoy (hora Colombia). Técnico ve solo las suyas; admin ve todas con el nombre del técnico. Cada fila abre la tarjeta con `openModal()` (que ya incluye el botón de finalizar visita) y cambia a la pestaña correspondiente (`irATarjetaVisitaPendiente()`). |
| `assets/js/app.js?v=20260801a` | Llama `revisarVisitasEnCursoAntiguas()` justo después de `cargarVisitasActivas()` en `iniciarApp()`. |
| `tareas-equipo.html` | Bump `informes.js?v=20260801f`, `tareas.js?v=20260801b`, `reportes.js?v=20260801b`, `app.js?v=20260801a`; checkbox `#show-archivado` renombrado a `#incluir-archivados` con label "Incluir archivados"; nuevo modal `#modal-visitas-pendientes` |

✅ `.cpanel.yml` copia `backend/api/` completo — el archivo nuevo se despliega automáticamente.

---

## Cambios pendientes de deploy (2026-07-29 — edición de pausas restringida a admin)

Sin migraciones de BD.

| Archivo | Cambio |
|---|---|
| `backend/api/reportes.php` | Nueva acción `accion='editPausa'` (PUT) para editar `pausa_inicio`/`pausa_fin` de una pausa registrada |
| `assets/js/reportes.js?v=20260729c` | Historial de visitas: inputs editables de pausa solo si `esAdmin`; nueva función `guardarPausaVisita()` |
| `tareas-equipo.html` | Bump `reportes.js?v=20260729c` |

---

## Cambios pendientes de deploy (2026-07-31)

Sin migraciones de BD.

| Archivo | Cambio |
|---|---|
| `assets/js/reportes.js?v=20260731a` | Fix 1: "Iniciar visita hoy" bloqueado si hay borrador de día anterior (solo tareas 1 día). Fix 2: `_pendingCheckout` persiste en `sessionStorage`, se restaura en refresh. Fix 3: checkout va ANTES del email; si falla, aborta el envío y restaura para reintentar. |
| `tareas-equipo.html` | Bump `reportes.js?v=20260731a` |

---

## Cambios pendientes de deploy (2026-07-28)

Sin migraciones de BD.

| Archivo | Cambio |
|---|---|
| `assets/js/reportes.js?v=20260728a` | Captura `checkoutAt` en el momento del checkout real; lo envía al backend en `_completarCheckout()` y `confirmarSinReporte()` |
| `backend/api/reportes.php` | `accion='checkout'` y `accion='sin_reporte'`: usa `$d['checkoutAt']` como `check_out` en lugar de `NOW()` |
| `tareas-equipo.html` | Bump `reportes.js?v=20260728a` |

---

## Cambios pendientes de deploy (2026-07-15)

⚠️ **Ejecutar en phpMyAdmin ANTES del deploy (en orden):**
```sql
-- 1. db/027_reporte_sin_reporte.sql (solo si NO se ejecutó antes)
ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS sin_reporte    TINYINT(1) NOT NULL DEFAULT 0 AFTER estado,
  ADD COLUMN IF NOT EXISTS sin_reporte_at DATETIME NULL AFTER sin_reporte;

-- 2. db/028_reporte_estados.sql (rediseño de estados)
UPDATE reportes SET estado = 'activo'     WHERE estado = 'en_visita';
UPDATE reportes SET estado = 'activo'     WHERE estado = 'borrador' AND check_out IS NULL;
UPDATE reportes SET estado = 'sin_reporte' WHERE estado = 'borrador' AND sin_reporte = 1;
UPDATE reportes SET estado = 'enviado'    WHERE estado = 'borrador' AND check_out IS NOT NULL AND sin_reporte = 0;
ALTER TABLE reportes DROP COLUMN sin_reporte, DROP COLUMN sin_reporte_at;
ALTER TABLE tareas ADD COLUMN reporte_interno TINYINT(1) NOT NULL DEFAULT 0 AFTER avisar_cliente;
```

| Archivo | Cambio |
|---|---|
| `backend/api/reportes.php` | Estados actualizados (`activo`/`enviado`/`sin_reporte`); PUT `accion=sin_reporte` → `estado='sin_reporte'`; GET `?sin_reporte=1` |
| `backend/api/reporte_enviar_correo.php` | JOIN con tareas para `reporte_interno`; si activo → solo correo al admin; asunto diferenciado |
| `backend/api/tareas.php` | UPDATE incluye `reporte_interno` |
| `assets/js/core.js` | `taskToApi`/`apiToTask` incluyen `reporteInterno` |
| `assets/js/reportes.js?v=20260715b` | Estados `activo`/`enviado`/`sin_reporte`; badges "🚫 Sin reporte", "⏳ En curso"; popup intercepta cierre sin enviar |
| `assets/js/tareas.js?v=20260715b` | Alerta "Visitas sin reporte" en dashboard; checkbox `#grp-reporte-interno` show/hide+populate+save |
| `assets/js/informes.js?v=20260715a` | Informe "🚫 Visitas sin reporte" con filtros de fecha |
| `tareas-equipo.html` | `#popup-sin-reporte`, `#grp-reporte-interno` checkbox, bumps a `?v=20260715b` |

---

## Cambios pendientes de deploy (2026-07-11)

Los siguientes archivos fueron modificados y commiteados pero aún no están en producción:

| Archivo | Cambio |
|---|---|
| `backend/api/reportes.php` | fix COLLATE en JOIN horasContrato + tarea_ids_enviados scoped a hoy |
| `assets/js/reportes.js?v=20260711b` | fecha en PDF, logo/firma a JPEG, nombre archivo nuevo formato; closeModal() tras check-in; "Iniciar visita hoy" en tareas 1 día reprogramadas para hoy |
| `assets/js/tareas.js?v=20260711b` | popup-aprobar-area auto-guarda y cierra modal al seleccionar IT/IF; botón iniciar visita visible en tarjetas `realizado` reprogramadas para hoy |
| `tareas-equipo.html` | bump versiones tareas.js y reportes.js a `?v=20260711b` |
| `backend/cron/recordatorio_visita_email.php` | agrega log de ejecución a `recordatorio_log.txt` |
| `backend/api/test_recordatorio.php` | endpoint de diagnóstico (puede borrarse de producción cuando ya no se necesite) |

**Cron en cPanel — cambiar comando a:**
```
0 18 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/recordatorio_visita_email.php >> /home/innovate/public_html/ginno/backend/cron/recordatorio_log.txt 2>&1
```

---

## Archivos nuevos pendientes de agregar a `.cpanel.yml`

Los siguientes archivos creados el `2026-06-30` deben estar listados en `.cpanel.yml`:

**Módulo aviso por correo al cliente:**
- `backend/api/foto_tecnico.php`
- `backend/cron/recordatorio_visita_email.php`
- `db/018_clientes_email.sql`
- `db/019_usuarios_cedula_foto.sql`
- `db/020_tareas_avisar_cliente.sql`
- `backend/uploads/fotos/` (directorio — agregar mkdir en .cpanel.yml)

**Pasos adicionales para el deploy del aviso por correo:**
1. Ejecutar `db/018_clientes_email.sql` en phpMyAdmin.
2. Ejecutar `db/019_usuarios_cedula_foto.sql` en phpMyAdmin.
3. Ejecutar `db/020_tareas_avisar_cliente.sql` en phpMyAdmin.
4. Configurar el cron en cPanel:
   `0 18 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/recordatorio_visita_email.php > /dev/null 2>&1`
5. En la app: editar cada técnico (Usuarios) → agregar cédula y foto.
6. En la app: completar email de los clientes que ya existen (los nuevos se auto-populan desde Alegra).

**Módulo Bitácora (Opción B — diseño final):**
- `backend/api/horario.php`
- `backend/api/bitacora.php`
- `backend/cron/bitacora_deficit.php`
- `assets/js/bitacora.js`
- `db/016_usuarios_horario_cols.sql`
- `db/017_bitacora_usuario.sql`

**Módulo Imágenes (mismo día):**
- `backend/api/imagenes.php`
- `assets/js/imagenes.js`
- `db/015_tarea_imagenes.sql`

**Pasos adicionales para el deploy de Bitácora:**
1. Ejecutar `db/016_usuarios_horario_cols.sql` en phpMyAdmin (agrega columnas h_lun…h_dom y horario_desde a la tabla usuarios).
2. Ejecutar `db/017_bitacora_usuario.sql` en phpMyAdmin (crea tabla bitacora_usuario).
3. Configurar el cron en cPanel:
   `0 23 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/bitacora_deficit.php > /dev/null 2>&1`
4. En la app: ir a Usuarios → editar cada técnico → configurar horario contratado.

**Mejoras bitácora + fix tabs (2026-07-04) — sin migraciones SQL nuevas:**
- `assets/css/app.css`: colores activos para tabs agenda/usuarios/clientes/transportes/bitacora.
- `backend/api/bitacora.php`: devuelve `pausas` en el GET por rango.
- `backend/cron/bitacora_deficit.php`: descuenta pausas del cálculo de horas; corregido bug `$y-07-04`.
- `assets/js/bitacora.js?v=20260704a`: horario detallado con pausas, columna Observaciones.
- `tareas-equipo.html`: bump `bitacora.js` a `?v=20260704a`.

**Transportes fix + trayectos + snapshot programación + incumplidas (2026-07-04 sesión tarde):**

Migraciones SQL a ejecutar en phpMyAdmin (en orden):
1. `db/021_bitacora_nota_tipo.sql` — ADD COLUMN `nota_tipo` a `bitacora_usuario`
2. `db/022_fix_transportes_tipos.sql` — DELETE transportes + ALTER participante_id/tecnico_id a VARCHAR
3. `db/023_transportes_trayectos.sql` — ADD COLUMN `trayectos TINYINT DEFAULT 2` a `transportes`
4. `db/024_visita_participantes_prog_snap.sql` — ADD COLUMNS `fecha_prog_snap`, `hora_prog_snap` a `visita_participantes`

Script one-time (ejecutar desde terminal cPanel DESPUÉS de las migraciones):
```
/usr/bin/php /home/innovate/public_html/ginno/backend/cron/recalcular_transportes.php
```

Archivos modificados (ya en repo):
- `backend/api/bitacora.php` — nota_tipo en GET/POST/DELETE
- `backend/api/reportes.php` — snapshot fecha/hora prog en INSERT visita_participantes
- `backend/api/transportes.php` — reescrito: sin INT casts, trayectos, COLLATE
- `backend/cron/recalcular_transportes.php` — nuevo script one-time
- `assets/js/bitacora.js?v=20260704d` — nota_tipo frontend
- `assets/js/transportes.js?v=20260704e` — trayectos UI
- `assets/js/reportes.js?v=20260704f` — snapshot en badge Tardía
- `assets/js/alarma.js?v=20260704g` — localStorage persistencia + guard días no hábiles + guard incumplidas
- `assets/js/tareas.js?v=20260704j` — incumplida: alerta dashboard + badge tarjeta + guard días no hábiles
- `tareas-equipo.html` — bumps de versiones

---

**Módulo Configuración + Avisos a técnicos (2026-07-04 sesión noche):**

Migraciones SQL a ejecutar en phpMyAdmin (en orden):
1. `db/025_configuracion.sql` — CREATE TABLE `configuracion` (clave→valor, 6 filas iniciales en 0)
2. `db/026_avisos_enviados.sql` — CREATE TABLE `avisos_enviados` (deduplicar envíos de cron)

Cron jobs nuevos a configurar en cPanel → Cron Jobs:
```
# Resumen del día anterior — 5 p.m. hora Colombia
0 17 * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/avisos_dia_anterior.php > /dev/null 2>&1

# Avisos de tiempo (30 min antes / 10 min sin check-in) — cada 10 min
0,10,20,30,40,50 * * * * /usr/bin/php /home/innovate/public_html/ginno/backend/cron/avisos_tiempo.php > /dev/null 2>&1
```

Archivos nuevos (ya en repo — copiados por .cpanel.yml automáticamente):
- `db/025_configuracion.sql`
- `db/026_avisos_enviados.sql`
- `backend/lib/avisos_tecnicos.php` — helpers: configGet, tecnicosConEmail, htmlAvisoTecnico, etc.
- `backend/api/configuracion.php` — GET/POST pares clave→valor
- `backend/cron/avisos_dia_anterior.php` — cron 5pm
- `backend/cron/avisos_tiempo.php` — cron cada 10 min
- `assets/js/configuracion.js?v=20260704k` — UI toggles

Archivos modificados:
- `backend/api/tareas.php` — SELECT ampliado en PUT + hooks aviso_asignacion, aviso_cambio_programacion, aviso_cambio_descripcion
- `assets/js/tareas.js` — setArea: isConfiguracion + renderConfiguracion()
- `assets/js/auth.js` — mostrar tab-configuracion solo a admins
- `tareas-equipo.html` — tab ⚙️ Configuración, div configuracion-view, script configuracion.js?v=20260704k

---

**PWA Offline support (2026-07-04 sesión noche):**

Sin migraciones SQL — solo archivos JS/PHP.

Archivos nuevos:
- `assets/js/offline.js?v=20260704n` — IndexedDB queue (store `cola`), `offlineInit()`, `offlineEnqueue()`, `offlineProcesarCola()`, banner `#offline-banner`
- (sw.js ya estaba en el repo — ahora reemplazado con versión completa)

Archivos modificados:
- `sw.js` — agregado: install (pre-cache tareas-equipo.html), fetch (Network First para /backend/api/, Cache First para estáticos), sync (`ginno-sync` → procesa cola IndexedDB)
- `backend/api/reportes.php` — POST ahora acepta `id` y `participanteId` del cliente; INSERTs cambiados a `INSERT IGNORE` para idempotencia en reintentos
- `assets/js/reportes.js?v=20260704n` — `ejecutarCheckin`: genera IDs en cliente, detecta `!navigator.onLine` → encola y actualiza estado local; `finalizarVisitaParticipante.ejecutar`: mismo patrón para checkout
- `assets/js/app.js?v=20260704n` — llama `offlineInit()` al final de `iniciarApp()`
- `tareas-equipo.html` — banner `#offline-banner` (sticky, teal), scripts `offline.js?v=20260704n` y `app.js?v=20260704n`; bump `reportes.js` a `?v=20260704n`

Comportamiento:
1. Técnico pierde señal durante una visita
2. Al hacer check-in/checkout sin conexión: se guarda en IndexedDB, la pantalla se actualiza inmediatamente con estado local
3. Al recuperar señal: `offlineProcesarCola()` envía los requests en orden cronológico; el servidor usa `INSERT IGNORE` para idempotencia
4. Background Sync del SW garantiza la sincronización incluso si el técnico cierra la app

---

**Panel ⚙️ Configuración en header (2026-07-04):**

Sin migraciones SQL ni cambios de backend — solo frontend.

Archivos modificados:
- `tareas-equipo.html` — quitados tabs Usuarios y Configuración; botón `#btn-settings` (⚙️) en header; `#settings-panel` overlay full-screen con `#usuarios-view` y `#configuracion-view` adentro; bumps: `auth.js?v=20260704p`, `tareas.js?v=20260704p`, `configuracion.js?v=20260704p`
- `assets/js/auth.js?v=20260704p` — `aplicarPermisosUI()`: sustituye `tab-usuarios` + `tab-configuracion` por `btn-settings` (oculto para técnicos)
- `assets/js/tareas.js?v=20260704p` — `setArea()`: eliminadas referencias a `isUsuarios`, `isConfiguracion`, sus display y render calls
- `assets/js/configuracion.js?v=20260704p` — agrega `toggleSettings()`, `abrirSettings()`, `cerrarSettings()` (llama `renderConfiguracion()` + `renderUsuariosView()`)

Comportamiento:
- Técnicos: no ven el botón ⚙️
- Admins: botón ⚙️ en header abre panel full-screen con sección Usuarios arriba y Avisos a técnicos abajo
- Panel 