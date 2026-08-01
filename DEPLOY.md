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

## Cambios pendientes de deploy (2026-08-01 — informe para cliente con PDF + refinamientos + periodo rápido)

Sin migraciones de BD.

| Archivo | Cambio |
|---|---|
| `backend/api/informe_cliente.php` | **Nuevo**. Endpoint GET `?cliente=&fecha_inicio=&fecha_fin=`. Retorna visitas completadas agrupadas con horas hombre por técnico, campos de texto del reporte (sin fotos), y `modalidad` de la tarea. |
| `backend/api/fuera_sitio.php` | Agrega `t.area AS tarea_area` al SELECT, para poder abrir la tarjeta desde el informe de checks fuera de sitio. |
| `assets/js/informes.js?v=20260801f` | Nueva opción "📄 Informe para cliente": selector cliente autocomplete, toggle contrato, botón 🙈 por visita, botón "🖨️ Guardar PDF". Refinamientos: email→info@innovate.com.co, fix about:blank (`@page{margin:0}`), texto justificado, badge presencial/remoto, checkbox "Redondear horas" (mín 1h+30min para en_sitio), ocultar materiales vacíos. Botones "📅 Este mes" / "⬅️ Mes anterior" para selección rápida del periodo (visibles en todos los informes con fechas). Fix: informe de cliente quedaba vacío al cambiar de cliente por respuestas async fuera de orden (oninput dispara una petición por tecla); ahora `recalcularInforme()` descarta respuestas viejas con un `reqId` de secuencia. Nuevo: en los informes que listan tarjetas (Actividades de un técnico, Tarjetas de un cliente, Reportes de tarjetas operativas, Llegadas tardías, Checks fuera de sitio), la primera columna de cada fila es clickeable y abre la tarjeta (`abrirTarjetaInforme()`) cambiando a su pestaña de área. Nuevo filtro "Estado" en "Reportes de tarjetas operativas": Todos / ⏳ En curso (sin checkout) / 🚫 Sin reporte / ❌ No enviado (en curso + sin reporte) / ✅ Enviado — vía `pasaFiltroEstadoReporte()`. |
| `assets/js/tareas.js?v=20260801a` | Checkbox "Ver archivados" (no hacía nada en el tablero kanban) renombrado a "Incluir archivados": ahora filtra las tarjetas archivadas por el buscador/responsable igual que las activas, y expande automáticamente la sección "Archivadas" cuando hay coincidencias. |
| `assets/js/reportes.js?v=20260801b` | Nueva alerta "Visitas en curso de días anteriores": al abrir sesión (`iniciarApp()`), `revisarVisitasEnCursoAntiguas()` revisa `visitasActivas` en busca de participantes sin checkout cuyo check-in fue en un día anterior a hoy (hora Colombia). Técnico ve solo las suyas; admin ve todas con el nombre del técnico. Cada fila abre la tarjeta con `openModal()` (que ya incluye el botón de finalizar visita) y cambia a la pestaña correspondiente (`irATarjetaVisitaPendiente()`). |
| `assets/js/app.js?v=20260801a` | Llama `revisarVisitasEnCursoAntiguas()` justo después de `cargarVisitasActivas()` en `iniciarApp()`. |
| `tareas-equipo.html` | Bump `informes.js?v=20260801f`, `tareas.js?v=20260801a`, `reportes.js?v=20260801b`, `app.js?v=20260801a`; checkbox `#show-archivado` renombrado a `#incluir-archivados` con label "Incluir archivados"; nuevo modal `#modal-visitas-pendientes` |

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