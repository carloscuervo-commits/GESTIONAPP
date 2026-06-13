# CONTEXTO.md — Gestión App (Innovate)

Tablero de gestión de tareas para el equipo de Innovate (IT, IF, Administrativo, Comercial/Cartera), con integración a Alegra.

URL pública: https://grupoinnovate.com/gestion/tareas-equipo.html

## Estado actual (última actualización: 2026-06-12)

- Último cambio desplegado: rediseño de la tarjeta de tarea para IT/IF (orden Cliente → Título → Descripción → Equipo asignado; equipo asignado con `<select>` "+ Agregar técnico..." + chips removibles; ocultos fecha límite, tiempo estimado, tiempo real, recursos y notas para IT/IF). Ver decisión #10 más abajo.
- **Cambios pendientes de deploy**:
  1. `alertaFacturacion(t)` ahora devuelve `{dias, vencido}` (antes devolvía `días` solo si > 2, o `null`). Se muestra en el dashboard ("🚨 Realizados sin facturar") apenas la tarea IT/IF/Admin queda "por facturar" (ya no espera 3 días), con el contador de días hábiles transcurridos al lado (igual que seguimiento comercial). El plazo máximo para facturar bajó de 3 a 2 días hábiles (`vencido = dias >= 2`); al llegarlo, el renglón del dashboard y el borde/fondo de la tarjeta en kanban se pintan en rojo.
  2. **Reorganización de carpetas (preparación para crecimiento, ver sección "Roadmap / arquitectura objetivo")**: `backend/config.php` y `backend/config_alegra.php` se movieron a `backend/config/`; `backend/db.php` se movió a `backend/lib/`. Se creó `assets/css/app.css` (CSS extraído del `<style>` embebido de `tareas-equipo.html`, que ahora lo enlaza con `<link>`). Se creó `backend/uploads/` (vacía, para futuras fotos de reportes). `.gitignore` y `.cpanel.yml` actualizados acorde. **Acción manual pendiente en el servidor antes de este deploy**: copiar el `config.php` y `config_alegra.php` actuales (en `backend/`) a `backend/config/` (con el mismo contenido/credenciales), ya que estos archivos no se suben por git/deploy.
- Deploy ya hecho y verificado en producción.
- **Importante: el deploy ya NO se hace automáticamente.** Cuando se necesite desplegar, usar la conversación "deploy" (con `DEPLOY.md` adjunto), no hacerlo en esta conversación.
- Pendiente conocido: tarea #14, recordatorio diario de seguimientos comerciales (ver sección "Pendientes conocidos"), aplazada por el usuario.
- Nota de seguridad resuelta en código (pendiente de deploy + acción manual en servidor): `backend/config_alegra.php` ya no se sube a git ni se copia por deploy (ver punto 2 arriba y "Notas de seguridad pendientes").
- Instrucción permanente: mantener este archivo (`CONTEXTO.md`) actualizado con cada cambio (arquitectura, convenciones, estructura, pendientes).

## Roadmap / arquitectura objetivo

La app va a crecer para cubrir gestión integral de la empresa: reportes de visitas técnicas con fotos, comunicación con clientes/técnicos por correo y WhatsApp, y manejo de usuarios con login por técnico. Decisiones para cuando se construya cada pieza (aún no implementadas):

- **Frontend modular**: migrar `tareas-equipo.html` de un único `<script>` a `<script type="module">` dividido por dominio (`assets/js/core.js`, `auth.js`, `tareas.js`, `reportes.js`, `comunicaciones.js`, `usuarios.js`), sin build step. El HTML queda como shell. (CSS ya se extrajo a `assets/css/app.css` como primer paso.)
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

- `config_alegra.php` (ahora en `backend/config/`) contiene credenciales reales de Alegra (`ALEGRA_EMAIL`, `ALEGRA_TOKEN`). Ya se agregó a `.gitignore` y se quitó del `.cpanel.yml`, igual que `config.php`. **Pendiente**: (1) hacer el deploy de la reorganización de carpetas, creando antes manualmente `backend/config/config.php` y `backend/config/config_alegra.php` en el servidor con las credenciales reales; (2) idealmente rotar el token de Alegra, ya que quedó expuesto en el historial de git de versiones anteriores.

## Pendientes conocidos

- **Recordatorio diario de seguimientos** (tarea #14): Cron Job en cPanel que ejecute un script PHP (`backend/cron/recordatorio_seguimiento.php`), consulte tareas comerciales en estado `enviada`, replique `alertaSeguimiento()` en PHP, y envíe un correo (fase 1) / WhatsApp (fase 2) con las cotizaciones que necesitan seguimiento ese día. Aplazado por el usuario ("por ahora no").
