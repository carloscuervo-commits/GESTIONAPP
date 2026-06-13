# CONTEXTO.md — Gestión App (Innovate)

Tablero de gestión de tareas para el equipo de Innovate (IT, IF, Administrativo, Comercial/Cartera), con integración a Alegra.

URL pública: https://grupoinnovate.com/gestion/tareas-equipo.html

## Stack y versiones

- **Frontend**: HTML + JavaScript vanilla, todo en un único archivo `tareas-equipo.html` (~1700 líneas). Sin frameworks, sin build step. CSS embebido en el mismo archivo.
- **Backend**: PHP plano (sin frameworks), expuesto como endpoints REST sencillos bajo `backend/api/`.
- **Base de datos**: MySQL (InnoDB, charset `utf8mb4`), acceso vía PDO.
- **Hosting**: cPanel (`grupoinnovate.com`), cuenta `innovate`.
- **Control de versiones / deploy**: GitHub (`carloscuervo-commits/GESTIONAPP`) + cPanel **Git™ Version Control**, que hace `pull` y ejecuta `.cpanel.yml` para copiar archivos a producción.
- **Integración externa**: API REST de Alegra (`https://api.alegra.com/api/v1/...`), autenticación Basic Auth (base64 `email:token`).
- **Zona horaria**: `America/Bogota` (definida en `backend/config.php`).

No hay `package.json`, `composer.json` ni gestor de dependencias — todo es código directo.

## Estructura de carpetas

```
GESTIONAPP/
├── .cpanel.yml                  # Script de deploy: qué archivos se copian a producción y a dónde
├── .gitignore                   # Ignora backend/config.php y migrar-datos.html
├── tareas-equipo.html           # Frontend completo (HTML+CSS+JS, SPA de una sola página)
├── migrar-datos.html            # Herramienta de migración inicial (ya no se usa, ignorada en git)
├── backend/
│   ├── config.php               # Credenciales de BD (NO está en git, debe crearse manualmente en el servidor)
│   ├── config_alegra.php        # Credenciales API de Alegra (define ALEGRA_EMAIL / ALEGRA_TOKEN)
│   ├── db.php                   # Helpers comunes: getDB(), jsonOut(), jsonInput(), applyCors()
│   ├── migracion_admin_comercial.sql
│   └── api/
│       ├── tareas.php           # CRUD de tareas (GET/POST/PUT/DELETE)
│       ├── usuarios.php         # Lista de usuarios/equipo
│       └── alegra_contactos.php # Proxy de búsqueda de contactos en Alegra (para autocomplete de Cliente)
└── db/
    ├── 001_init.sql             # Esquema inicial: usuarios, tareas, tarea_equipo, tarea_historial
    └── 002_seguimiento.sql      # Migración: columnas seguimiento_fecha y seguimiento_historial
```

### `.cpanel.yml` — qué se despliega

```yaml
DEPLOYPATH=/home/innovate/public_html/gestion/
- tareas-equipo.html          -> DEPLOYPATH
- backend/db.php              -> DEPLOYPATH/backend/
- backend/config_alegra.php   -> DEPLOYPATH/backend/
- backend/api/*                -> DEPLOYPATH/backend/api/
- db/*                          -> DEPLOYPATH/db/
```

⚠️ `backend/config.php` **no** se copia por deploy (está en `.gitignore` y no existe en el repo); debe existir manualmente en el servidor con las credenciales reales de la BD. Cualquier archivo nuevo de backend que se necesite en producción debe agregarse explícitamente aquí, o el deploy "tendrá éxito" pero el archivo no llegará al servidor.

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

7. **Helpers backend centralizados en `db.php`**: `applyCors()` (CORS abierto `*` + maneja `OPTIONS`), `jsonOut($data, $code)` (responde JSON y `exit`), `jsonInput()` (lee body JSON), `getDB()` (PDO singleton con `ERRMODE_EXCEPTION`, `FETCH_ASSOC`, `EMULATE_PREPARES=false`). Todos los endpoints nuevos deben `require_once __DIR__ . '/../db.php'` y empezar con `applyCors()`.

8. **IDs de tareas**: UUID generado en el frontend (`crypto.randomUUID()` o similar) o con `bin2hex(random_bytes(16))` en el backend si no viene `id`. Columna `CHAR(36)`.

9. **Trazabilidad de cambios de estado**: cada cambio de `estado` en una tarea se registra en `tarea_historial` vía `registrarHistorial()` (no se registra si el estado no cambió).

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

- `backend/config_alegra.php` contiene credenciales reales de Alegra (`ALEGRA_EMAIL`, `ALEGRA_TOKEN`) y **está versionado en git** (no está en `.gitignore`). Idealmente debería tratarse igual que `backend/config.php` (ignorado, creado manualmente en el servidor). Pendiente de resolver.

## Pendientes conocidos

- **Recordatorio diario de seguimientos** (tarea #14): Cron Job en cPanel que ejecute un script PHP (`backend/cron/recordatorio_seguimiento.php`), consulte tareas comerciales en estado `enviada`, replique `alertaSeguimiento()` en PHP, y envíe un correo (fase 1) / WhatsApp (fase 2) con las cotizaciones que necesitan seguimiento ese día. Aplazado por el usuario ("por ahora no").
