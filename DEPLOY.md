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
