# CONTEXTO.md — Gestión App (Innovate)

Tablero de gestión de tareas para el equipo de Innovate (IT, IF, Administrativo, Comercial/Cartera), con integración a Alegra.

URL pública: https://grupoinnovate.com/gestion/tareas-equipo.html

## Estado actual (última actualización: 2026-06-22 — segunda sesión)

- **Cambios pendientes de deploy (2026-06-22, segunda sesión)**: programación multi-día (`diasProg`). Ver detalle en "Pendientes conocidos". Migración: `backend/migracion_dias_programacion.sql`. Cache-busting: `core.js?v=20260622c`, `tareas.js?v=20260622c`.
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

## Pendientes conocidos / Próximas tareas

- **Tarea #14**: recordatorio diario de seguimientos comerciales. Aplazada por el usuario.
- ✅ **Programación multi-día para tarjetas operativas (2026-06-22 → implementado 2026-06-22)**: campo `diasProg` (frontend) / `dias_programacion` (BD, `TINYINT UNSIGNED DEFAULT 1`). El formulario muestra "por N día(s)" junto a la fecha de inicio, y una etiqueta "Hasta: YYYY-MM-DD" cuando N > 1. `generarProgramacion()` usa `enRangoProg(t, fechaISO)` en lugar de igualdad exacta. Las tarjetas IT/IF en "En ejecución" con `diasProg > 1` muestran "🔧 Día X de N · Y días restantes". **Acción pendiente en deploy**: ejecutar `backend/migracion_dias_programacion.sql` antes de publicar.
- ✅ **Bug técnico asignado en tarjetas multi-día (resuelto preventivamente)**: el flujo `openModal → buildTeamPicker(t?.team||[])` ya carga el equipo desde la tarea guardada. `closeModal` resetea `selectedTeam=[]` pero el siguiente `openModal` lo recarga correctamente. No se agregó ningún atajo que evite ese flujo, por lo que el bug no aplica en la implementación actual.

## Roadmap / arquitectura objetivo

La app va a crecer para cubrir gestión integral de la empresa: reportes de visitas técnicas con fotos, comunicación con clientes/técnicos por correo y WhatsApp, y manejo de usuarios con login por técnico. Decisiones para cuando se construya cada pieza (aún no implementadas):

- **Frontend modular**: ✅ primer paso hecho (ver punto -1 arriba) — `assets/js/core.js`, `tareas.js`, `cartera.js`, `facturacion.js`, `app.js` (scripts clásicos, scope global compartido). Pendiente: si se agregan dominios nuevos (`auth.js`, `reportes.js`, `comunicaciones.js`, `usuarios.js`), seguir el mismo patrón; evaluar más adelante migrar a `type="module"` con imports/exports explícitos si el scope global compartido empieza a generar conflictos. (CSS ya se extrajo a `assets/css/app.css`.)
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
├── .cpanel.yml                  # Script de deploy: qué archivos se copian a producción y a dónde
├── .gitignore                   # Ignora backend/config/*.php, migrar-datos.html y backend/uploads/*
├── tareas-equipo.html           # Frontend (HTML+JS, SPA de una sola página). CSS vive en assets/css/app.css
├── migrar-datos.html            # Herramienta de migración inicial (ya no se usa, ignorada en git)
├── assets/
│   └── css/
│       └── app.css              # CSS extraído de tareas-equipo.html
├── backend/
│   ├── config/
│   │   ├── config.php           # Credenciales de BD (NO está en git, debe crearse manualmente en el servidor)
│   │   └── config_alegra.php    # Credenciales API de Alegra (NO está en git, debe crearse manualmente en el servidor)
│   ├── lib/
│   │   └── db.php                # Helpers comunes: getDB(), jsonOut(), jsonInput(), applyCors()
│   ├── uploads/                   # Archivos subidos por la app (fotos de reportes, etc.) — gitignored
│   ├── migracion_admin_comercial.sql
│   └── api/
│       ├── tareas.php           # CRUD de tareas (GET/POST/PUT/DELETE)
│       ├── usuarios.php         # Lista de usuarios/equipo
│       └── alegra_contactos.php # Proxy de búsqueda de contactos en Alegra (para autocomplete de Cliente)
└── db/
    ├── 001_init.sql             # Esquema inicial: usuarios, tareas, tarea_equipo, tarea_historial
    └── 002_seguimiento.sql      # Migración: columnas seguimiento_fecha y seguimiento_historial
```

Ver sección "Roadmap / arquitectura objetivo" para la estructura destino conforme se agreguen autenticación, reportes y mensajería.

### `.cpanel.yml` — qué se despliega

```yaml
DEPLOYPATH=/home/innovate/public_html/gestion/
- tareas-equipo.html          -> DEPLOYPATH
- assets/css/*                 -> DEPLOYPATH/assets/css/
- backend/lib/*                -> DEPLOYPATH/backend/lib/
- backend/api/*                -> DEPLOYPATH/backend/api/
- (mkdir) backend/uploads/      -> DEPLOYPATH/backend/uploads/
- db/*                          -> DEPLOYPATH/db/
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
  - Commits descriptivos en español, en imperativo o sustantivo ("Agregar...", "Fix: ...", "Actualizar...").
  - Flujo de deploy: commit/push desde GitHub Desktop → cPanel "Git Version Control" → **Update from Remote** (verificar que aparezca el badge "New" con el commit correcto) → **Deploy HEAD Commit**.
  - cPanel cachea respuestas; al probar endpoints tras un deploy, usar un parámetro de cache-busting (`?cb=<numero único>`).

## Notas de seguridad pendientes

- `config_alegra.php` (ahora en `backend/config/`) contiene credenciales reales de Alegra (`ALEGRA_EMAIL`, `ALEGRA_TOKEN`). Ya se agregó a `.gitignore` y se quitó del `.cpanel.yml`, igual que `config.php`. **Pendiente**: (1) hacer el deploy de la reorganización de carpetas, creando antes manualmente `backend/config/config.php` y `backend/config/config_alegra.php` en el servidor con las credenciales reales; (2) idealmente rotar el token de Alegra, ya q