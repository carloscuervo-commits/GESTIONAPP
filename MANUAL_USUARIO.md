# MANUAL DE USUARIO — GINNO
## Asistente de Gestión · Grupo Innovate SAS

> **URL de acceso:** https://grupoinnovate.com/ginno/
> **Última actualización:** 2026-07-01

---

## ¿QUÉ ES GINNO?

Ginno es el asistente de gestión de Grupo Innovate. Centraliza el seguimiento de tareas de los equipos de IT, IF, Administrativo y Comercial. Permite a los técnicos registrar visitas, completar reportes con fotos y generar PDFs firmados; y al administrador coordinar programaciones, revisar historial, controlar transportes, gestionar la bitácora de horas y enviar avisos automáticos a clientes.

---

## ROLES DE USUARIO

Ginno tiene dos perfiles:

| Perfil | ¿Qué ve? | ¿Qué puede hacer? |
|--------|----------|-------------------|
| **Admin** | Todo: IT, IF, Admin, Comercial, Dashboard, Agenda, Bitácora, Transportes, Usuarios, Clientes | Control total: crear, editar, archivar, programar, registrar check-in manual, editar visitas, gestionar transportes y bitácora |
| **Técnico** | Solo IT e IF (sus propias tarjetas) | Iniciar/pausar/finalizar visitas, completar reporte con fotos, ver agenda semanal |

---

## INGRESO A GINNO (LOGIN)

### Para todos los usuarios

1. Abrir https://grupoinnovate.com/ginno/ en el navegador del celular o PC.
2. En la pantalla de inicio aparece una grilla con los nombres del equipo. **Tocar el nombre propio.**
3. Se abre el teclado numérico. **Ingresar el PIN de 4 dígitos** asignado por el administrador.
4. Ginno recuerda la sesión en ese dispositivo. En futuras visitas no es necesario ingresar el PIN de nuevo (a menos que se cierre sesión manualmente).

### Cerrar sesión

Tocar el nombre en la parte superior derecha → **Cerrar sesión**.

> **Nota:** Si el dispositivo no tiene conexión, Ginno puede funcionar en modo offline usando los datos guardados del último acceso.

---

## ÁREAS DE TRABAJO

Ginno organiza las tareas en cuatro áreas:

| Área | ¿Para qué? | Estados del flujo |
|------|-----------|-------------------|
| **IT** | Servicios técnicos en sistemas e infraestructura | Pendientes → En ejecución → Por facturar → Facturado → Archivado |
| **IF** | Servicios técnicos de infraestructura física | Pendientes → En ejecución → Por facturar → Facturado → Archivado |
| **Admin** | Tareas administrativas internas | Pendiente → En progreso → Bloqueada → Por facturar → Archivado |
| **Comercial** | Cotizaciones y seguimiento comercial | Por cotizar → Enviada → Aprobada / Rechazada → Archivado |

Cada área se accede desde las pestañas en la parte superior de la pantalla.

---

## TABLERO KANBAN (VISTA DE TARJETAS)

La vista principal de cada área es un tablero kanban con columnas por estado. Cada tarea aparece como una **tarjeta** que muestra:

- **Cliente** (en teal, arriba del título)
- **Título** de la tarea
- **Equipo asignado** (chips con iniciales de cada técnico)
- **Fecha de programación** y hora (si aplica)
- **Contadores de días** (ej. "⏳ 3 días en pendientes" o "🔧 Día 2 de 3")
- **Alertas** (rojo si hay vencimientos)
- **Número de identificación** (ej. `#MQ9J`)
- **Botón de visita** (Iniciar visita / Continuar reporte / Reporte finalizado)

### Filtros disponibles

En la barra superior se puede filtrar por:
- **Texto**: busca en título, cliente o iniciales del técnico
- **Estado**: filtra una columna específica del kanban
- **Técnico responsable**: muestra solo las tarjetas asignadas a un técnico
- **Mostrar archivadas**: activa/desactiva la visualización de tarjetas archivadas

### Drag & Drop (Admin)

El administrador puede arrastrar tarjetas entre columnas para cambiar el estado directamente, sin abrir el modal.

---

## TARJETAS DE TAREA

### Crear una tarea nueva

1. Clic en el botón **"+ Nueva"** (parte superior derecha).
2. Completar los campos del formulario:
   - **Cliente**: escribir el nombre → Ginno busca en Alegra automáticamente → seleccionar de la lista.
   - **Título**: descripción corta de la tarea.
   - **Descripción**: detalle adicional (opcional).
   - **Equipo asignado**: seleccionar técnicos desde el desplegable "+ Agregar técnico...". Cada técnico queda como chip con botón ✕ para quitar.
   - **Área**: IT, IF, Admin o Comercial.
   - **Estado inicial**: el sistema asigna el primer estado del flujo automáticamente.
   - **Fecha de programación** (IT/IF): fecha de inicio, número de días y hora aproximada.
   - **Avisar al cliente** (IT/IF): checkbox marcado por defecto. Envía correo automático al cliente el día anterior a la visita.
3. Clic en **Guardar**.

> **Código de tarea:** Ginno asigna un ID único. La UI muestra los primeros 4 caracteres en mayúscula con prefijo `#` (ej. `#MQ9J`).

### Editar una tarea existente

Clic en cualquier parte de la tarjeta (excepto los botones de acción) para abrir el modal de edición. Los mismos campos están disponibles para modificar.

### Acciones rápidas en el modal

Al abrir una tarjeta existente, aparece una zona de **Acciones rápidas** con los mismos botones que se ven en la tarjeta (Iniciar visita, Archivar, etc.) para ejecutarlos sin cerrar el modal.

### Archivar una tarea

- **Con factura asignada:** se archiva directamente.
- **Sin factura (IT/IF desde "Por facturar"):** Ginno pide seleccionar un motivo: Garantía, Levantamiento, Contrato, u Otros. El motivo queda visible en la tarjeta archivada como `📋 Sin factura: Garantía`.

---

## IMÁGENES ADJUNTAS EN TAREAS

Dentro del modal de cualquier tarea existe una zona **🖼️ Imágenes** (debajo del campo Descripción).

### Cómo agregar imágenes

| Método | Pasos |
|--------|-------|
| **Clic** | Tocar la zona punteada → seleccionar archivo(s) desde el dispositivo |
| **Arrastrar** | Arrastrar imagen(es) sobre la zona punteada y soltar |
| **Pegar (PC)** | Con el modal abierto, copiar una imagen (ej. captura de pantalla) y presionar `Ctrl+V` |

> La tarea debe estar **guardada** antes de agregar imágenes. Si la tarea es nueva, guardarla primero.

### Ver imágenes (Lightbox)

Tocar cualquier miniatura para abrir la imagen en grande. Si hay varias, navegar con los botones **‹** y **›**.

### Eliminar una imagen

Tocar el botón **✕** en la esquina superior derecha de cada miniatura.

---

## VISITAS TÉCNICAS (IT/IF)

El flujo completo de una visita tiene cuatro pasos: Check-in → (Pausa opcional) → Check-out → Reporte con fotos.

### 1. Iniciar visita (Check-in)

**El técnico** toca el botón **"▶️ Iniciar visita"** en la tarjeta o en el modal.

- Registra la hora de inicio automáticamente (hora del servidor en Bogotá).
- La tarjeta muestra "🟢 EN SITIO" con el nombre del técnico.
- El estado de la tarea cambia a **En ejecución** (si no estaba ya).

**El administrador** puede registrar el check-in manual:
1. Clic en "▶️ Iniciar visita" desde su sesión.
2. Aparece el modal con selector de técnico y campo de hora manual.
3. Seleccionar técnico → ajustar hora → Confirmar.

#### Visitas con múltiples técnicos

Varios técnicos pueden hacer check-in en la misma tarea. Cada uno tiene su propio estado (en sitio / finalizado) y la tarjeta muestra un botón por participante. El reporte solo se completa cuando **todos** los técnicos hacen checkout.

### 2. Pausar visita (opcional)

Durante la visita, el técnico puede tocar **"⏸️ Pausar visita"** para registrar una interrupción.

- Se solicita una **justificación** obligatoria (ej. "Esperando materiales").
- La tarjeta muestra "⏸️ EN PAUSA" con el motivo.
- Para reanudar: tocar **"▶️ Reanudar"**.
- Las pausas se descuentan automáticamente del tiempo neto de la visita.

### 3. Finalizar visita (Check-out)

Tocar **"⏹️ Finalizar visita"** en la tarjeta.

Ginno pregunta **"¿Se terminó la tarea?"**:
- **Sí**: el reporte queda listo para enviar, la tarea avanza a "Por facturar".
- **No, falta continuar**: el reporte queda en borrador, la visita queda registrada para el próximo día.

### 4. Completar el reporte

Tras el checkout, se abre el formulario de reporte de la visita con las siguientes secciones:

1. **Fotos del estado inicial** — fotos del lugar/equipo antes de la intervención.
2. **Fotos del estado final** — fotos después de la intervención.
3. **Descripción detallada** — texto libre con las acciones realizadas.
4. **Materiales utilizados** — lista de materiales o equipos empleados.
5. **Pendientes** — actividades que quedaron sin resolver.
6. **Firma del cliente** — firma táctil en el dispositivo.

#### Agregar fotos al reporte

- Tocar el ícono de cámara en cada sección de fotos.
- Opciones: **Tomar foto** con la cámara del celular, **seleccionar de galería**, o desde PC: **pegar con Ctrl+V** o **arrastrar y soltar**.
- Las fotos se comprimen automáticamente (máx. 1920px, JPEG 80%).

#### Generar PDF del reporte

Tocar **"📄 Generar PDF"** para descargar el reporte completo con:
- Encabezado con logo Innovate y datos de la visita
- Tabla de participantes con horarios y duración neta
- Fotos organizadas por sección
- Firma del cliente
- Nombre de archivo: `Innovate-YYYYMMDD-NombreCliente.pdf`

#### Enviar reporte al cliente

Tocar **"📧 Enviar por correo"** para enviar el PDF al cliente por email (requiere que el cliente tenga correo registrado en Ginno).

---

## PROGRAMACIÓN DE VISITAS (Admin)

### Programar una visita

Dentro del modal de tarea IT/IF:

1. **Fecha de inicio**: seleccionar la fecha de la visita.
2. **Duración**: indicar el número de días ("por N día(s)").
   - Si son más de 1 día, Ginno calcula y muestra la fecha de fin (saltando sábados, domingos y festivos colombianos).
3. **Hora aproximada**: hora de inicio de la visita (ej. 08:00).
4. **Equipo asignado**: seleccionar los técnicos que asistirán.
5. **Avisar al cliente**: si está marcado, Ginno envía correo automático al cliente el día anterior.

> ⚠️ La hora indicada es aproximada y puede variar según condiciones de tráfico o clima.

### Copiar programación (función "Copiar")

En la vista de programación técnica, el botón **"📋 Copiar programación"** genera un texto con las visitas del día ordenadas de la más temprana a la más tardía, listo para pegar en WhatsApp u otro medio.

### Aviso automático al cliente

Si la tarea tiene "Avisar al cliente" activo, el cron de Ginno envía un correo HTML al cliente a las 6:00 PM del día anterior con:
- Nombre del servicio y descripción
- Fecha larga en español
- Hora aproximada
- Foto, nombre y cédula de cada técnico asignado
- Contacto para cancelar/reagendar

---

## AGENDA SEMANAL

La pestaña **📅 Agenda** muestra la programación de la semana actual.

### Vista técnico

Lista de lunes a sábado con las tareas asignadas a ese técnico para cada día. Tocar una tarea para abrir su modal.

### Vista admin

- **Un técnico seleccionado o ninguno:** vista en lista con las tareas del día.
- **Dos o más técnicos seleccionados:** vista en grid comparativo con una columna por técnico.
- Chips de selección de técnicos en la parte superior.
- Botones **← Semana anterior** y **Semana siguiente** para navegar.

---

## MÓDULO DE TRANSPORTES (Admin)

La pestaña **🚗 Transportes** permite gestionar los pagos de transporte a técnicos por visitas en sitio.

### ¿Cuándo se genera un transporte?

Automáticamente al **facturar** o **archivar** una tarea IT/IF con:
- Modalidad: **en sitio**
- Cliente con **valor de transporte** configurado (en pesos/trayecto)

Se genera **un registro por día de visita y por técnico** que participó.

### Gestión de transportes

| Estado | Descripción |
|--------|-------------|
| **Pendiente** | Visita registrada, pago por aprobar |
| **Pagado** | El admin aprobó el pago (✅) |
| **No autorizado** | El admin rechazó el pago (❌) |

### Filtros disponibles

- Técnico específico o todos
- Rango de fechas
- Toggle **Pendientes / Archivados**

La vista muestra subtotales por técnico y total general en verde.

---

## BITÁCORA DE TÉCNICOS (Admin)

La pestaña **📋 Bitácora** controla las horas contratadas vs. horas reales de campo de cada técnico.

### Cómo funciona

- Cada técnico tiene un **horario contratado** configurado (horas por día, vigente desde cierta fecha).
- Cada noche a las 11 PM, un cron calcula las horas reales del día anterior y las compara con el horario.
- Si hay déficit, el estado del día queda como **"Déficit sin nota"**.

### Dashboard de alertas

Si hay días con déficit sin nota, aparece un banner en el dashboard para el admin: **"X días pendientes"** hasta que justifique todos.

### Justificar un déficit

1. En la vista Bitácora, seleccionar el rango de fechas y el técnico.
2. Los días con déficit aparecen destacados en rojo.
3. Clic en el campo de la celda → escribir la justificación → Guardar.
4. El estado cambia a **"Déficit con nota"** (ya no genera alerta).
5. Si se quiere borrar la nota: clic en el ícono de borrar (el estado vuelve a "Déficit sin nota").

### Tolerancia

Se acepta una diferencia de hasta **3 minutos** (0.05 h) por debajo del horario contratado como "ok".

---

## CONTRATOS DE HORAS (IT/IF)

Si un cliente tiene un **contrato de horas** configurado (IT o IF), Ginno descuenta automáticamente las horas al hacer checkout.

### Regla de descuento

- Se toma la duración neta de la visita (checkout − checkin, descontando pausas).
- Se redondea a la media hora más cercana con gracia de 10 minutos (ej: 40 min → 1 h, 25 min → 0.5 h).
- Mínimo: 0.5 h por visita.

### Si se agotan las horas

- Ginno muestra una alerta al técnico.
- Crea automáticamente una nueva tarea **"Visita de contrato adicional"** para el mismo cliente y área.

### Ver horas disponibles

En la tarjeta de una tarea tipo "contrato", se muestra en verde o rojo cuántas horas quedan disponibles en el mes.

El admin puede editar las horas descontadas de cada participante desde el **historial de visitas** del modal.

---

## FACTURACIÓN (Admin)

### Registrar una factura

**Desde la tarjeta (vista kanban):**
- En tarjetas IT/IF "Por facturar" o Admin "Por facturar", aparece el botón naranja **"🧾 Registrar factura"**.
- Clic → ingresar número de factura → Enter o clic en el botón. La tarea pasa automáticamente a "Facturado".

**Desde el modal:**
- Dentro de la tarea, botón **"✓ Marcar como Facturado"** (visible en estado "Por facturar").

### Generar factura desde cotización (Alegra)

1. En la pestaña **🧾 Facturación**, subir el `.docx` de la cotización.
2. Ginno extrae automáticamente: cliente, CTINN, fecha, ítems y montos.
3. Revisar y editar en el formulario.
4. Confirmar → Ginno crea la factura directamente en **Alegra** y la vincula a la tarea.

---

## INFORMES (Admin)

La pestaña **📊 Informes** ofrece reportes exportables a Excel:

| Informe | ¿Qué muestra? |
|---------|---------------|
| **Actividades por técnico** | Tarjetas + visitas de un técnico en un rango de fechas |
| **Llegadas tardías** | Visitas donde el check-in fue posterior a la hora programada. Badge rojo "🕐 Tardía" |

Los informes se pueden filtrar por técnico y rango de fechas, y exportar a Excel.

---

## DASHBOARD (Admin)

La vista **Dashboard** (botón 📊 en la barra superior) muestra un resumen ejecutivo:

### Contadores por área

Número de tareas activas en cada área.

### Zona de alertas

| Alerta | Condición |
|--------|-----------|
| **🚨 Realizados sin facturar** | Tareas IT/IF/Admin en "Por facturar". Se pinta en rojo después de 2 días hábiles. |
| **📞 Cotizaciones sin seguimiento** | Cotizaciones enviadas sin contacto registrado. Rojo a los 2 días hábiles. |
| **⚠️ Pendientes sin programar** | Tareas IT/IF en "Pendientes" sin fecha de programación. |

Clic en cualquier alerta → va directamente al área correspondiente.

---

## HISTORIAL DE VISITAS EN EL MODAL (Admin)

Al abrir una tarjeta IT/IF, el admin ve el **historial completo de visitas** con:

- Cada visita: fecha, técnico(s), hora de entrada y salida, duración neta (descontando pausas).
- **Edición inline**: seleccionar técnico, ajustar hora de check-in y check-out → 💾 Guardar.

---

## GESTIÓN DE USUARIOS (Admin)

La pestaña **👤 Usuarios** permite al administrador:

- Ver la lista de todos los usuarios del sistema.
- **Crear usuario**: nombre, iniciales, color, PIN, perfil (admin/técnico), cédula.
- **Editar usuario**: modificar cualquier dato, cambiar PIN.
- **Foto del técnico**: subir foto que aparece en los correos de aviso al cliente (formatos: JPG, PNG, WebP).
- **Horario contratado**: configurar las horas por día de la semana y la fecha de vigencia (para la Bitácora).
- **Eliminar usuario**.

---

## GESTIÓN DE CLIENTES (Admin)

La pestaña **👥 Clientes** permite al administrador:

- Ver lista de clientes.
- **Crear/editar cliente**: nombre, régimen tributario, plazo de factura, valor de transporte (por trayecto), contrato de horas (área + horas/mes), correo electrónico.
- El correo del cliente se usa para el aviso automático de visita y para enviar reportes.

---

## NOTIFICACIONES PUSH

Ginno puede enviar notificaciones automáticas al celular del técnico **45 minutos antes** de una visita programada.

### Activar notificaciones (cada técnico, una sola vez)

1. Abrir Ginno en el celular.
2. Ginno muestra un banner de activación al iniciar sesión.
3. Tocar **"Activar notificaciones"** y aceptar el permiso del navegador.
4. Listo. Las notificaciones funcionan aunque la pestaña esté cerrada.

---

## ALARMA DIARIA (Admin)

A las **4:00 PM de lunes a viernes**, Ginno emite una alarma sonora y muestra un modal recordando al admin que programe a los técnicos para el día siguiente.

- Tocar **"Entendido, gracias Ginno"** para detenerla.
- Solo aparece si la pestaña de Ginno está abierta.

---

## BÚSQUEDA

En la barra de búsqueda (parte superior de cada vista kanban):

- Busca en **título**, **cliente** e **iniciales del técnico**.
- El campo tiene un botón `×` nativo para limpiar rápidamente.
- Al cambiar de área (IT → IF → Admin → Comercial), la búsqueda se limpia automáticamente.

---

## PREGUNTAS FRECUENTES

**¿Qué pasa si cierro el navegador mientras hay una visita activa?**
La visita sigue registrada en el servidor. Al volver a abrir Ginno, el botón "Continuar reporte" aparece en la tarjeta.

**¿Puedo registrar el check-in desde la oficina (admin)?**
Sí. El admin puede iniciar una visita en nombre de cualquier técnico, seleccionarlo y ajustar la hora manualmente.

**¿Cómo sé si el correo de aviso al cliente se envió?**
El cron lo ejecuta automáticamente a las 6 PM del día anterior. Si el checkbox "Avisar al cliente" estaba activo y el cliente tiene correo registrado, el correo se envió.

**¿Qué significan los códigos como #MQ9J?**
Son los primeros 4 caracteres del ID único de la tarea (en mayúscula). Sirven para identificar la tarea rápidamente en conversaciones o soporte.

**¿Puedo ver las tareas de mis compañeros técnicos?**
No. Cada técnico solo ve las tarjetas a las que está asignado. El admin ve todas.

**¿Las imágenes que pego en el PC las ven los técnicos en el celular?**
Sí. Las imágenes se guardan en el servidor y son visibles para cualquier usuario que abra esa tarea, independientemente del dispositivo. Si no se ven, limpiar la caché del navegador.

---

## GLOSARIO

| Término | Significado |
|---------|-------------|
| **IT** | Área de tecnología / sistemas |
| **IF** | Área de infraestructura física |
| **Check-in** | Registro de llegada al sitio del cliente |
| **Check-out** | Registro de salida del sitio del cliente |
| **Pausa** | Interrupción justificada durante la visita |
| **Reporte** | Documento de la visita con fotos, descripción y firma del cliente |
| **Kanban** | Vista de tarjetas organizadas por estado (columnas) |
| **Drag & drop** | Arrastrar una tarjeta de una columna a otra |
| **CTINN** | Código interno de cotización de Innovate |
| **Alegra** | Software de facturación integrado con Ginno |
| **ULID / ID** | Identificador único de la tarea (~19 caracteres alfanuméricos) |
| **Bitácora** | Registro diario de horas de campo vs. horas contratadas |
| **Déficit** | Diferencia negativa entre horas trabajadas y horas contratadas |
| **Cron** | Tarea automática programada en el servidor (sin intervención manual) |

---

*Manual generado por Ginno · Grupo Innovate SAS · carlos.cuervo@innovate.com.co*
