// ============================================================
// CARTERA — tablero de gestión de cobro (pestaña "💰 Cartera")
// v20260912g
// ============================================================
// Los datos de facturas vencidas se consultan en vivo a Alegra
// (alegra_cartera_resumen.php) cada vez que se abre la pestaña — ya no hay
// un arreglo quemado en el código que había que actualizar a mano pidiéndole
// a Claude "actualiza mi cartera".
//
// El estado del tablero (columna, responsable, notas, acuerdo, próxima
// fecha de seguimiento) vive en la base de datos (cartera_gestion.php),
// compartido por todo el equipo — ya no es localStorage del navegador de
// quien lo usó.
//
// Envío de cobro: cartera_mensaje.php arma el texto (plantilla según nivel
// de intensidad — cordial/firme/prejurídico), editable antes de enviar por
// correo (cartera_enviar_correo.php) o por WhatsApp (enlace wa.me, se abre
// en una pestaña para revisar y dar enviar manualmente).
//
// Archivado: cada vez que se consulta alegra_cartera_resumen.php (o corre el
// cron), el backend archiva solo (archivado=1, sin borrar nada) a quien ya
// no tenga facturas vencidas en Alegra — es decir, pagó. Esos clientes dejan
// de venir en carteraClientes (Alegra ya no los reporta) pero siguen en
// cartera_gestion.php con su historial, así que la sección "🗄️ Archivados"
// se arma aparte, a partir de carteraGestionMap.

let carteraClientes = [];        // datos vivos de Alegra: [{clienteId, clienteNombre, email, celular, facturas, totalDeuda, fechaMasAntigua}]
let carteraGestionMap = {};      // gestión guardada en BD, indexada por clienteId (cliente_alegra_id)
let carteraActualizado = '';
let carteraSort = 'valor';
let editingCarteraId = null;
let carteraMensajeActual = null; // {asunto} del último mensaje previsualizado (el texto vive en el textarea)
let carteraArchivadosAbierto = false;

const CARTERA_COLS = [
  {id:'por-contactar', label:'Por contactar 📋'},
  {id:'etapa1',        label:'Etapa 1 enviada 📧'},
  {id:'etapa2',        label:'Etapa 2 enviada 💬'},
  {id:'etapa3',        label:'Etapa 3 enviada ⚠️'},
  {id:'acuerdo',       label:'Acuerdo de pago 🤝'},
  {id:'pagado',        label:'Pagado ✅'},
];

const CARTERA_NIVELES = [
  {id:'cordial',     label:'🙂 Cordial — primer aviso'},
  {id:'firme',       label:'😐 Firme — segundo aviso'},
  {id:'prejuridico', label:'⚠️ Prejurídico — última instancia'},
];

const CARTERA_NIVEL_A_ETAPA_LABEL = {
  cordial:     'Etapa 1',
  firme:       'Etapa 2',
  prejuridico: 'Etapa 3',
};

function formatCOP(n) {
  return '$' + Number(n||0).toLocaleString('es-CO');
}

function diasDesde(isoDate) {
  if (!isoDate) return 0;
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
}

function _carteraHoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function _carteraFechaMasDias(dias) {
  const d = new Date(); d.setDate(d.getDate() + (parseInt(dias, 10) || 0));
  return d.toISOString().slice(0, 10);
}

// ── Popup de confirmación al enviar cobro ───────────────────
// Antes de registrar cualquier envío (correo, WhatsApp o copiar texto) se
// confirma si la tarjeta debe avanzar de etapa y en cuántos días recordar
// seguir la gestión (estándar precargado, editable para ese caso puntual).
// accionCallback(avanzar, dias) hace el envío real y el registro en
// cartera_gestion — se dispara de forma síncrona desde el clic en
// "Confirmar" (no desde un await previo) para no perder el gesto del
// usuario, que window.open (WhatsApp) y el portapapeles necesitan.
let carteraConfirmarPendiente = null;

function carteraAbrirConfirmacion(accionCallback) {
  const nivel = document.getElementById('cm-nivel').value;
  const etapaLabel = CARTERA_NIVEL_A_ETAPA_LABEL[nivel] || 'la siguiente etapa';
  document.getElementById('cartera-confirmar-avanzar-label').textContent =
    `Avanzar la tarjeta a "${etapaLabel} enviada"`;
  document.getElementById('cartera-confirmar-avanzar').checked = true;
  document.getElementById('cartera-confirmar-dias').value =
    document.getElementById('cm-dias-seguimiento').value || 7;
  carteraConfirmarPendiente = accionCallback;
  document.getElementById('cartera-confirmar-modal').classList.add('open');
}

function carteraConfirmarEnvioOk() {
  const avanzar = document.getElementById('cartera-confirmar-avanzar').checked;
  const dias = parseInt(document.getElementById('cartera-confirmar-dias').value, 10) || 7;
  document.getElementById('cartera-confirmar-modal').classList.remove('open');
  document.getElementById('cm-dias-seguimiento').value = dias; // por si después guarda a mano
  const cb = carteraConfirmarPendiente;
  carteraConfirmarPendiente = null;
  if (cb) cb(avanzar, dias);
}

// ── Carga de datos ──────────────────────────────────────────

async function fetchCartera() {
  const loadEl   = document.getElementById('cartera-loading');
  const kanbanEl = document.getElementById('cartera-kanban');
  loadEl.style.display   = 'block';
  kanbanEl.style.display = 'none';
  loadEl.innerHTML = '<div style="font-size:24px;margin-bottom:8px">⏳</div>Consultando cartera en Alegra...';

  try {
    const [resResumen, resGestion] = await Promise.all([
      fetch(`${API_BASE}/alegra_cartera_resumen.php`),
      fetch(`${API_BASE}/cartera_gestion.php`),
    ]);
    const dataResumen = await resResumen.json();
    if (dataResumen.error) throw new Error(dataResumen.error);
    const dataGestion = await resGestion.json();

    carteraClientes   = dataResumen.clientes || [];
    carteraActualizado = dataResumen.actualizado || '';
    carteraGestionMap = {};
    (Array.isArray(dataGestion) ? dataGestion : []).forEach(g => { carteraGestionMap[g.cliente_alegra_id] = g; });

    loadEl.style.display   = 'none';
    kanbanEl.style.display = 'flex';
    const actEl = document.getElementById('cartera-actualizado');
    if (actEl) actEl.textContent = carteraActualizado || '-';
    renderCartera();
    renderCarteraArchivados();
  } catch (e) {
    loadEl.innerHTML = `<div style="font-size:24px;margin-bottom:8px">⚠️</div>
      <strong>No se pudo cargar la cartera</strong><br>
      <span style="font-size:12px;color:#94a3b8">${esc(e.message||String(e))}</span><br><br>
      <button class="btn-refresh" onclick="fetchCartera()">Reintentar</button>`;
    loadEl.style.display   = 'block';
    kanbanEl.style.display = 'none';
  }
}

function carteraEstadoDe(clienteId) {
  return (carteraGestionMap[clienteId] && carteraGestionMap[clienteId].estado) || 'por-contactar';
}

// ── Compatibilidad con el arranque de la app ────────────────
// app.js (iniciarApp) llama loadCartera() + updateCarteraCount() apenas
// carga la página, para mostrar el contador en la pestaña 💰 Cartera antes
// de que el usuario la abra. Antes leían de localStorage (síncrono); ahora
// consultan lo mismo que fetchCartera() — solo para administradores, para
// no disparar una consulta a Alegra (y un 403) en cada carga de un técnico.
async function loadCartera() {
  if (typeof currentUser === 'undefined' || !currentUser || currentUser.perfil !== 'admin') return;
  await fetchCartera();
}

function updateCarteraCount() {
  const cntEl = document.getElementById('cnt-cartera');
  if (cntEl) cntEl.textContent = carteraClientes.filter(c => carteraEstadoDe(c.clienteId) !== 'pagado').length;
}

// ── Tablero ──────────────────────────────────────────────────

function setCarteraSort(s) {
  carteraSort = s;
  document.getElementById('sort-valor').classList.toggle('active', s==='valor');
  document.getElementById('sort-antiguedad').classList.toggle('active', s==='antiguedad');
  renderCartera();
}

function sortedCartera(colId) {
  const items = carteraClientes.filter(c => carteraEstadoDe(c.clienteId) === colId);
  if (carteraSort==='valor') return items.sort((a,b)=>b.totalDeuda-a.totalDeuda);
  return items.sort((a,b)=>new Date(a.fechaMasAntigua)-new Date(b.fechaMasAntigua));
}

function carteraCard(c) {
  const g = carteraGestionMap[c.clienteId] || {};
  const dias = diasDesde(c.fechaMasAntigua);
  const grave = dias > 60;
  const montoClass = c.totalDeuda > 1000000 ? 'alta' : '';
  const diasLabel = dias > 0 ? `Vencida hace ${dias} días` : 'Al día';
  const resp = TEAM.find(m=>m.id===g.responsable_id);
  const seguimiento = g.fecha_proximo_seguimiento;
  const seguimientoVencido = !!seguimiento && seguimiento <= _carteraHoyISO();
  return `<div class="cartera-card${grave?' vencida-grave':''}" onclick="openCarteraModal('${c.clienteId}')">
    <div class="cartera-nombre">${esc(c.clienteNombre)}</div>
    <div class="cartera-monto ${montoClass}">${formatCOP(c.totalDeuda)}</div>
    <div class="cartera-meta">📅 Fact. más antigua: ${c.fechaMasAntigua||'-'}</div>
    <div class="cartera-meta">⏱ ${diasLabel}</div>
    <div class="cartera-meta">🧾 ${c.facturas?.length||0} factura(s) pendiente(s)</div>
    ${resp?`<div class="cartera-meta" style="margin-top:5px"><div class="avatar" style="width:18px;height:18px;background:${resp.color};font-size:8px;display:inline-flex">${resp.initials}</div> ${esc(resp.name.split(' ')[0])}</div>`:''}
    ${g.fecha_acuerdo?`<div class="cartera-meta" style="color:#d97706;font-weight:600">🤝 Acuerdo: ${g.fecha_acuerdo}</div>`:''}
    ${seguimiento?`<div class="cartera-meta" style="${seguimientoVencido?'color:#dc2626;font-weight:600':''}">🔔 Seguimiento: ${seguimiento}</div>`:''}
    ${g.notas?`<div class="cartera-meta" style="margin-top:4px;font-style:italic">"${esc(g.notas.slice(0,50))}${g.notas.length>50?'...':''}"</div>`:''}
  </div>`;
}

function renderCartera() {
  const cntEl = document.getElementById('cnt-cartera');
  if (cntEl) cntEl.textContent = carteraClientes.filter(c => carteraEstadoDe(c.clienteId) !== 'pagado').length;

  if (!carteraClientes.length) {
    document.getElementById('cartera-kanban').innerHTML = '<div class="cartera-loading"><div style="font-size:32px;margin-bottom:8px">✅</div>No hay facturas vencidas en Alegra.</div>';
    return;
  }
  document.getElementById('cartera-kanban').innerHTML = CARTERA_COLS.map(col=>{
    const items = sortedCartera(col.id);
    return `<div class="kanban-col col-${col.id}">
      <div class="col-header">${col.label} <span class="count">${items.length}</span></div>
      <div class="col-body">${items.length?items.map(carteraCard).join(''):'<div class="empty">Sin clientes</div>'}</div>
    </div>`;
  }).join('');
}

// ── Sección "Archivados" (histórico de clientes que ya pagaron) ─────────
// No son tarjetas clicables (openCarteraModal necesita el dato vivo de
// Alegra, que un archivado ya no tiene) — es solo un registro de consulta.

function carteraArchivadoCard(g) {
  const fecha = g.archivado_en ? g.archivado_en.slice(0, 10) : '-';
  const monto = g.ultimo_total_deuda != null ? formatCOP(g.ultimo_total_deuda) : '-';
  return `<div class="cartera-card cartera-card-archivada">
    <div class="cartera-nombre">${esc(g.cliente_nombre)}</div>
    <div class="cartera-monto">${monto}</div>
    <div class="cartera-meta">✅ Archivado el ${fecha}</div>
    ${g.notas ? `<div class="cartera-meta" style="margin-top:4px;font-style:italic">"${esc(g.notas.slice(0,50))}${g.notas.length>50?'...':''}"</div>` : ''}
  </div>`;
}

function renderCarteraArchivados() {
  const wrap = document.getElementById('cartera-archivados-section');
  if (!wrap) return;
  const archivados = Object.values(carteraGestionMap)
    .filter(g => Number(g.archivado) === 1)
    .sort((a, b) => (b.archivado_en || '').localeCompare(a.archivado_en || ''));

  const cntEl = document.getElementById('cartera-archivados-count');
  if (cntEl) cntEl.textContent = archivados.length;

  const listaEl = document.getElementById('cartera-archivados-lista');
  if (!listaEl) return;
  if (!carteraArchivadosAbierto) { listaEl.style.display = 'none'; return; }
  listaEl.style.display = 'flex';
  listaEl.innerHTML = archivados.length
    ? archivados.map(carteraArchivadoCard).join('')
    : '<div class="empty">Sin clientes archivados todavía.</div>';
}

function toggleCarteraArchivados() {
  carteraArchivadosAbierto = !carteraArchivadosAbierto;
  const icon = document.getElementById('cartera-archivados-toggle-icon');
  if (icon) icon.textContent = carteraArchivadosAbierto ? '▲' : '▼';
  renderCarteraArchivados();
}

// ── Modal "Gestión de cobro" ────────────────────────────────

async function openCarteraModal(clienteId) {
  editingCarteraId = clienteId;
  const c = carteraClientes.find(x=>x.clienteId===clienteId);
  if (!c) return;
  const g = carteraGestionMap[clienteId] || {};

  document.getElementById('cm-titulo').textContent = c.clienteNombre;
  document.getElementById('cm-resumen').innerHTML = `
    <div style="font-size:20px;font-weight:800;color:#0f766e">${formatCOP(c.totalDeuda)}</div>
    <div style="color:var(--text-muted);font-size:12px;margin-top:3px">Fact. más antigua: ${c.fechaMasAntigua||'-'} · ${c.facturas?.length||0} factura(s)</div>
    ${c.facturas?.map(f=>`<div style="font-size:11px;color:var(--text-muted)">${esc(f.num)}: ${formatCOP(f.balance)} — venció ${f.dueDate}</div>`).join('')||''}
  `;
  document.getElementById('cm-estado').value = g.estado || 'por-contactar';
  const rSel = document.getElementById('cm-responsable');
  rSel.innerHTML = '<option value="">Sin asignar</option>' + TEAM.map(m=>`<option value="${m.id}">${m.initials} — ${m.name}</option>`).join('');
  rSel.value = g.responsable_id || '';
  document.getElementById('cm-fecha-acuerdo').value = g.fecha_acuerdo || '';
  document.getElementById('cm-monto-acuerdo').value = g.monto_acuerdo || '';
  document.getElementById('cm-notas').value = g.notas || '';
  document.getElementById('cm-celular').value = c.celular || '';
  document.getElementById('cm-email').value = c.email || '';
  document.getElementById('cm-nivel').value = g.plantilla_nivel || 'cordial';
  document.getElementById('cm-nombre-contacto').value = '';

  // Días para recordar seguir la gestión: si ya hay una fecha de seguimiento
  // guardada, se muestran los días que faltan desde hoy; si no hay ninguna
  // (cliente nuevo), se usa el estándar configurado. Editable para este caso
  // puntual, tanto aquí como en el popup de confirmación al enviar.
  let dias = 7;
  try {
    const cfg = await fetch(`${API_BASE}/configuracion.php`).then(r=>r.json());
    dias = parseInt(cfg.cartera_dias_recordatorio, 10) || 7;
  } catch(e) {}
  if (g.fecha_proximo_seguimiento) {
    const diff = Math.round((new Date(g.fecha_proximo_seguimiento) - new Date(_carteraHoyISO())) / 86400000);
    if (diff > 0) dias = diff;
  }
  document.getElementById('cm-dias-seguimiento').value = dias;

  carteraMensajeActual = null;
  document.getElementById('cm-mensaje-preview').style.display = 'none';
  document.getElementById('cm-mensaje-texto').value = '';

  toggleCarteraAcuerdo(g.estado || 'por-contactar');
  document.getElementById('cm-estado').onchange = e => toggleCarteraAcuerdo(e.target.value);
  carteraToggleNivelUI();
  document.getElementById('cm-nivel').onchange = () => carteraToggleNivelUI();
  document.getElementById('cartera-modal').classList.add('open');
}

function toggleCarteraAcuerdo(estado) {
  const show = estado==='acuerdo';
  document.getElementById('cm-g-fecha-acuerdo').style.display = show?'flex':'none';
  document.getElementById('cm-g-monto-acuerdo').style.display = show?'flex':'none';
}

// Etapa 2 (nivel 'firme') es deliberadamente corta y va por WhatsApp o
// llamada, no por correo — se pide el nombre del contacto (para el saludo)
// y se oculta "Enviar por correo" para que no se mande por ahí por error.
function carteraToggleNivelUI() {
  const esFirme = document.getElementById('cm-nivel').value === 'firme';
  const gContacto = document.getElementById('cm-g-nombre-contacto');
  if (gContacto) gContacto.style.display = esFirme ? 'flex' : 'none';
  const btnCorreo = document.getElementById('cm-btn-correo');
  if (btnCorreo) btnCorreo.style.display = esFirme ? 'none' : '';
}

function closeCarteraModal() {
  document.getElementById('cartera-modal').classList.remove('open');
  editingCarteraId = null;
  carteraMensajeActual = null;
}

// Guarda el celular en la ficha del cliente (tabla clientes) solo si cambió
// respecto al que ya traía Alegra/Ginno — no bloquea el resto del guardado
// si falla, es un dato auxiliar para WhatsApp.
async function _carteraGuardarContactoSiCambio(c) {
  const celularInput = (document.getElementById('cm-celular').value || '').trim();
  if (celularInput === (c.celular || '')) return;
  try {
    const existente = await fetch(`${API_BASE}/clientes.php?alegra_id=${encodeURIComponent(c.clienteId)}`).then(r=>r.json());
    if (existente && existente.id) {
      await fetch(`${API_BASE}/clientes.php?id=${existente.id}`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ celular: celularInput }),
      });
    } else {
      await fetch(`${API_BASE}/clientes.php`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ nombre: c.clienteNombre, alegra_id: c.clienteId, celular: celularInput, email: c.email || null }),
      });
    }
    c.celular = celularInput;
  } catch (e) { /* silencioso */ }
}

async function saveCarteraItem() {
  const c = carteraClientes.find(x=>x.clienteId===editingCarteraId);
  if (!c) return;
  const body = {
    clienteNombre: c.clienteNombre,
    estado: document.getElementById('cm-estado').value,
    responsableId: document.getElementById('cm-responsable').value,
    fechaAcuerdo: document.getElementById('cm-fecha-acuerdo').value,
    montoAcuerdo: document.getElementById('cm-monto-acuerdo').value,
    notas: document.getElementById('cm-notas').value.trim(),
    fechaProximoSeguimiento: _carteraFechaMasDias(document.getElementById('cm-dias-seguimiento').value || 7),
  };
  try {
    const res = await fetch(`${API_BASE}/cartera_gestion.php?cliente_alegra_id=${encodeURIComponent(editingCarteraId)}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body),
    });
    const g = await res.json();
    if (g.error) { alert('⚠️ ' + g.error); return; }
    carteraGestionMap[editingCarteraId] = g;
    await _carteraGuardarContactoSiCambio(c);
    closeCarteraModal();
    renderCartera();
  } catch (e) {
    alert('No se pudo guardar la gestión.');
  }
}

// ── Envío de cobro (correo / WhatsApp) ──────────────────────

async function carteraPrevisualizarMensaje() {
  const c = carteraClientes.find(x=>x.clienteId===editingCarteraId);
  if (!c) return;
  const nivel = document.getElementById('cm-nivel').value;
  const btn = document.getElementById('cm-btn-previsualizar');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const nombreContacto = (document.getElementById('cm-nombre-contacto').value || '').trim();
    const res = await fetch(`${API_BASE}/cartera_mensaje.php`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ clienteNombre: c.clienteNombre, facturas: c.facturas, nivel, clienteAlegraId: editingCarteraId, nombreContacto }),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    carteraMensajeActual = { asunto: data.asunto };
    document.getElementById('cm-mensaje-texto').value = data.texto;
    document.getElementById('cm-mensaje-preview').style.display = 'block';
  } catch (e) {
    alert('No se pudo generar el mensaje.');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function carteraEnviarCorreo() {
  const c = carteraClientes.find(x=>x.clienteId===editingCarteraId);
  if (!c || !carteraMensajeActual) { alert('Primero genera la vista previa del mensaje.'); return; }
  if (document.getElementById('cm-nivel').value === 'firme') {
    alert('La Etapa 2 es para WhatsApp o llamada, no se envía por correo.');
    return;
  }
  const destinatarios = (document.getElementById('cm-email').value || '').trim();
  if (!destinatarios) { alert('Falta el correo del cliente.'); return; }

  carteraAbrirConfirmacion((avanzar, dias) => {
    _carteraEnviarCorreoConfirmado(c, destinatarios, avanzar, dias);
  });
}

async function _carteraEnviarCorreoConfirmado(c, destinatarios, avanzar, dias) {
  const cuerpoTexto = document.getElementById('cm-mensaje-texto').value;
  const nivel = document.getElementById('cm-nivel').value;
  const fechaProximoSeguimiento = _carteraFechaMasDias(dias);

  const btn = document.getElementById('cm-btn-correo');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Enviando...';
  try {
    const res = await fetch(`${API_BASE}/cartera_enviar_correo.php`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        clienteAlegraId: editingCarteraId, clienteNombre: c.clienteNombre,
        destinatarios, asunto: carteraMensajeActual.asunto, cuerpoTexto, nivel, avanzar, fechaProximoSeguimiento,
      }),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    carteraGestionMap[editingCarteraId] = {
      ...(carteraGestionMap[editingCarteraId]||{}),
      cliente_alegra_id: editingCarteraId, cliente_nombre: c.clienteNombre,
      estado: data.estado, plantilla_nivel: nivel,
      fecha_ultimo_contacto: _carteraHoyISO(), fecha_proximo_seguimiento: data.fechaProximoSeguimiento,
    };
    await _carteraGuardarContactoSiCambio(c);
    alert('✅ Correo enviado.');
    closeCarteraModal();
    renderCartera();
  } catch (e) {
    alert('No se pudo enviar el correo.');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

// Copiar el texto del mensaje al portapapeles — para cuando Carlos prefiere
// pegarlo a mano (SMS, otro correo, etc.) en vez de usar los botones de
// envío directo. Cuenta como "mensaje enviado" para todos los efectos: pasa
// por el mismo popup de confirmación (avanzar etapa + días) que correo/WhatsApp.
function carteraCopiarTexto() {
  const c = carteraClientes.find(x=>x.clienteId===editingCarteraId);
  if (!carteraMensajeActual) { alert('Primero genera la vista previa del mensaje.'); return; }

  carteraAbrirConfirmacion(async (avanzar, dias) => {
    const texto = document.getElementById('cm-mensaje-texto').value;
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      alert('No se pudo copiar el texto al portapapeles.');
      return;
    }
    const btn = document.getElementById('cm-btn-copiar');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✅ Copiado';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }

    const nivel = document.getElementById('cm-nivel').value;
    const fechaProximoSeguimiento = _carteraFechaMasDias(dias);
    const body = {
      clienteNombre: c ? c.clienteNombre : document.getElementById('cm-titulo').textContent,
      plantillaNivel: nivel,
      fechaUltimoContacto: _carteraHoyISO(),
      fechaProximoSeguimiento,
    };
    if (avanzar) body.nivelEnviado = nivel; // el backend avanza el estado a la etapa de este nivel, sin retroceder
    fetch(`${API_BASE}/cartera_gestion.php?cliente_alegra_id=${encodeURIComponent(editingCarteraId)}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    }).then(r=>r.json()).then(g=>{
      carteraGestionMap[editingCarteraId] = g;
      if (c) _carteraGuardarContactoSiCambio(c);
      renderCartera();
    }).catch(()=>{});
  });
}

function carteraEnviarWhatsApp() {
  const c = carteraClientes.find(x=>x.clienteId===editingCarteraId);
  if (!carteraMensajeActual) { alert('Primero genera la vista previa del mensaje.'); return; }
  const celularRaw = (document.getElementById('cm-celular').value || '').trim().replace(/[^\d+]/g,'');
  if (!celularRaw) { alert('Falta el celular del cliente.'); return; }

  carteraAbrirConfirmacion((avanzar, dias) => {
    const texto = document.getElementById('cm-mensaje-texto').value;

    // Enlace wa.me: requiere el número con indicativo de país, sin "+". Para
    // celulares colombianos de 10 dígitos se antepone 57; si ya trae
    // indicativo (más de 10 dígitos) se respeta tal cual. Se abre aquí, ya
    // dentro del clic en "Confirmar" del popup, para que el navegador no lo
    // bloquee por no venir de un gesto directo del usuario.
    let numero = celularRaw.replace(/^\+/, '');
    if (numero.length <= 10) numero = '57' + numero.replace(/^0+/, '');
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank');

    const nivel = document.getElementById('cm-nivel').value;
    const fechaProximoSeguimiento = _carteraFechaMasDias(dias);
    const body = {
      clienteNombre: c ? c.clienteNombre : document.getElementById('cm-titulo').textContent,
      plantillaNivel: nivel,
      fechaUltimoContacto: _carteraHoyISO(),
      fechaProximoSeguimiento,
    };
    if (avanzar) body.nivelEnviado = nivel; // el backend avanza el estado a la etapa de este nivel, sin retroceder
    fetch(`${API_BASE}/cartera_gestion.php?cliente_alegra_id=${encodeURIComponent(editingCarteraId)}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    }).then(r=>r.json()).then(g=>{
      carteraGestionMap[editingCarteraId] = g;
      if (c) _carteraGuardarContactoSiCambio(c);
      renderCartera();
    }).catch(()=>{});
  });
}
// ===================== FIN CARTERA =====================
