# DEPLOY.md — Instrucciones de despliegue GESTIONAPP

Este archivo se adjunta en la conversación "deploy" para que Claude haga el deploy cuando se le pida.

## Contexto del proyecto

- Repo local: `D:\OneDrive\INNOVATE\GESTIONAPP`
- Repo remoto: `https://github.com/carloscuervo-commits/GESTIONAPP.git` (rama `main`)
- Servidor: cPanel en `https://grupoinnovate.com:2083`, cuenta `innovate`
- App en producción: `https://grupoinnovate.com/gestion/tareas-equipo.html`
- El deploy copia archivos según `.cpanel.yml` a `/home/innovate/public_html/gestion/`

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
   - Abrir/recargar `https://grupoinnovate.com/gestion/tareas-equipo.html?cb=<numero único>` (usar un parámetro de cache-busting nuevo cada vez, cPanel/navegador cachea).
   - Verificar visualmente que el cambio esperado esté presente (ej. abrir "Nueva Tarea", revisar campos, etc.)

## Notas importantes

- ⚠️ **NO hacer deploy automáticamente.** Solo ejecutar estos pasos cuando el usuario lo pida explícitamente en esta conversación ("deploy").
- `backend/config.php` NO está en git (se crea manualmente en el servidor, contiene credenciales reales de BD).
- Cualquier archivo nuevo de backend que deba llegar a producción tiene que estar listado en `.cpanel.yml`, si no, el deploy "tendrá éxito" pero el archivo no se copiará.
- ⚠️ **Caché de `assets/js/*.js` (7 días)**: estos archivos se sirven con `Cache-Control: public, max-age=604800`. Si un deploy modifica cualquier archivo en `assets/js/`, hay que actualizar el query param `?v=YYYYMMDD` en los 5 `<script src="assets/js/...?v=...">` de `tareas-equipo.html` (subirlo a una fecha nueva), o los navegadores seguirán usando el JS viejo hasta una semana después del deploy.
- Para más detalle de arquitectura/estructura del proyecto, ver `CONTEXTO.md`.
