# CONTEXTO.md — Ginno (Grupo Innovate)

**Ginno** es el asistente de gestión de Grupo Innovate — G Inno. Tablero de tareas para el equipo (IT, IF, Administrativo, Comercial/Cartera), con integración a Alegra. Se comunica como un compañero de trabajo, no como un sistema.

URL pública: https://grupoinnovate.com/ginno/ (antes: /gestion/tareas-equipo.html)

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
DEPLOYPATH=/home/innovate/public_html/gestion/
- tareas-equipo.html -> DEPLOYPATH
- assets/css/* -> DEPLOYPATH/assets/css/
- backend/lib/* -> DEPLOYPATH/backend/lib/
- backend/api/* -> DEPLOYPATH/backend/api/
- (mkdir) backend/uploads/ -> DEPLOYPATH/backend/uploads/
- db/* -> DEPLOYPATH/db/
```

⚠️ `backend/config/config.php` y `backend/config/config_alegra.php` **no** se copian por deploy (están en `.gitignore` y no existen en el repo); deben existir manualmente en el servidor con las credenciales reales (BD y Alegra respectivamente). Cualquier archivo nuevo de backend que se necesite en producción debe agregarse explícitamente aquí, o el deploy "tendrá éxito" pero el archivo no llegará al servidor.

## Decisiones de arquitectura

1. **SPA de un solo archivo**: todo el frontend vive en `tareas-equipo.html` para simplicidad de despliegue (un solo `cp`). No hay bundlers ni módulos ES.

2. **Modo local / modo servidor con un solo flag**: la constante `API_BASE` en `tareas-equipo.html` decide el modo:
- Si está vacía → la app usa `localStorage` (`STORAGE_KEY = 'cowork_tareas_v4'`), útil para pruebas sin backend.
- Si tiene una URL → todas las operaciones (`load`, `syncTask`, `syncDelete`, `syncEstado`) hablan con `backend/api/tareas.php`.
En producción: `API_BASE = 'https://grupoinnovate.com/gestion/backend/api'` (hardcoded).

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

8. **IDs de tareas**: UUID generado en el frontend (`crypto.randomUUID()` o similar) o con `bin2hex(random_bytes(16))` en el backend si no viene `id`. Columna `CHAR(36)`.

9. **Trazabilidad de cambios de estado**: cada cambio de `estado` en una tarea se registra en `tarea_historial` vía `registrarHistorial()` (no se registra si el estado no cambió).

10. **Tarjeta de tarea simplificada para IT/IF**: el modal "Nueva Tarea"/edición tiene orden de campos fijo (Cliente → Título → Descripción → Equipo asignado → Área/Estado/...) para todas las áreas. Cuando `area` es `it` o `if`, `updateFormForArea()` oculta además `grp-fecha` (fecha límite), `grp-tiempo`, `grp-treal`, `grp-recursos` y `grp-notas` (todos con `id` asignado para poder ocultarlos). El **equipo asignado** ya no usa chips seleccionables tipo toggle: `buildTeamPicker()` ahora renderiza los miembros ya asignados como chips con botón "✕" para quitar (`toggleTeamChip`), más un `<select>` "+ Agregar técnico..." con los miembros disponibles que al elegir uno lo agrega (`addTeamMember`). Esto aplica a todas las áreas, no solo IT/IF.

## Convenciones de código

- **PHP**:
- Endpoints en `backend/api/*.php`, un archivo por recurso, todos los métodos HTTP (GET/POST/PUT/DELETE) en el mismo archivo con `if ($method === 'X') { ... }`.
- Siempre `require_once __DIR__ . '/../db.php'; applyCors();` al inicio.
- Respuestas siempre vía `jsonOut($data, $codigoHttp)` — nunca `echo` directo.
- Usar `strlen()`, no `mb_strlen()` (el host no garantiza `mbstring`).
- Errores de Alegra/HTTP externos se devuelven como `jsonOut(['error' => '...'], 5xx)`, nunca se dejan excepciones sin capturar.
- Nombres de columnas SQL en snake_case; nombres de campos en el JSON del frontend en camelCase (el mapeo vive en `taskToApi`/`apiToTask`).

- **SQL**:
- Migraciones numeradas secuencialmente en `db/NNN_descripcion.sql` (ej. `001_init.sql`, `002_seguimiento.sql`). Cada migración es incremental (usa `ALTER TABLE ... ADD COLUMN`), nunca se reescribe `001_init.sql`.
- Tablas en `InnoDB`, `utf8mb4`, claves foráneas explícitas con `ON DELETE CASCADE`/`SET NULL` donde aplica.

- **JavaScript (frontend)**:
- Todo en `<script>` dentro de `tareas-equipo.html`, sin módulos.
- Constantes de configuración en mayúsculas al inicio del script (`API_BASE`, `STORAGE_KEY`, `TEAM`, `AREAS`, `AREA_FLOWS`).
- Funciones `async` para cualquier llamada a `fetch`; errores se capturan con `try/catch` y se notifican con `alert(...)`.
- `esc()` para escapar HTML al insertar texto dinámico en el DOM (evitar XSS básico).
- Colores de área/usuario definidos como hex en `AREAS`/`TEAM` y reutilizados para badges (`color + '20'` para fondo semi-transparente).

- **Git / deploy**:
- Commits cortos y directos en español ("enviar reporte por wp", "archivadas colapsadas", "fix check-in multi-día"). Claude entrega el mensaje de commit listo al final de cada cambio.
- Para deploys manuales desde GitHub Desktop, usar el summary entregado por Claude directamente.
- Flujo de deploy: commit/push desde GitHub Desktop → cPanel "Git Version Control" → **Update from Remote** (verificar que aparezca el badge "New" con el commit correcto) → **Deploy HEAD Commit**.
- cPanel cachea respuestas; al probar endpoints tras un deploy, usar un parámetro de cache-busting (`?cb=<numero único>`).
- **⚠️ Rollback**: si se necesita hacer rollback al repo del servidor, usar cPanel Terminal → `cd /home/innovate/repos/gestionapp && git reset --hard <sha>` → Deploy HEAD Commit. El repo GitHub no se toca (sigue en el commit más reciente). Para volver a avanzar, crear un nuevo commit normal y hacer el flujo estándar.

## Notas de seguridad pendientes

- `config_alegra.php` (ahora en `backend/config/`) contiene credenciales reales de Alegra (`ALEGRA_EMAIL`, `ALEGRA_TOKEN`). Ya se agregó a `.gitignore` y se quitó del `.cpanel.yml`, igual que `config.php`. **Pendiente**: (1) hacer el deploy de la reorganización de carpetas, creando antes manualmente `backend/config/config.php` y `backend/config/config_alegra.php` en el servidor con las credenciales reales; (2) idealmente rotar el token de Alegra, ya que estuvo expuesto en el repositorio público antes de ser agregado a `.gitignore`. Acción corregida en código; queda pendiente la rotación manual del token.
