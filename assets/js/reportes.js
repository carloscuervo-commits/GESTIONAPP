// ===================== REPORTES DE VISITA (check-in/out + plantillas) =====================
// Diseño: un reporte se crea al "Iniciar visita" (check_in) y se completa
// al "Finalizar visita" (check_out + formulario). El campo "datos" del
// reporte guarda en JSON los campos propios de cada plantilla, así que
// agregar plantillas nuevas en el futuro no requiere cambios de backend,
// solo agregar una entrada aquí en PLANTILLAS_REPORTE.

const PLANTILLAS_REPORTE = {
  evento: {
    id: 'evento',
    nombre: 'Reporte de evento (mantenimiento / instalación)',
    secciones: [
      { id: 'fotos_inicial',        tipo: 'fotos',       label: '1) Estado inicial del evento (Foto)' },
      { id: 'fotos_final',          tipo: 'fotos',       label: '2) Estado final del evento (Foto)' },
      { id: 'descripcion_acciones', tipo: 'texto_largo', label: '3) Describa de forma detallada las acciones llevadas a cabo durante el evento.' },
      { id: 'materiales',           tipo: 'texto_largo', label: '4) Indique los materiales o equipos utilizados durante el evento.' },
      { id: 'pendientes',           tipo: 'texto_largo', label: '5) Describa cualquier actividad o requerimiento pendiente que deba resolverse post-evento.' },
      { id: 'firma_cliente',        tipo: 'firma',       label: '6) Firma de Conformidad del Cliente' },
    ],
  },
};

let visitasActivas = {};   // tareaId -> reporte en estado 'en_visita'
let borradoresActivos = {}; // tareaId -> reporte en estado 'borrador' (finalizado, sin enviar)
let reporteActual = null;  // reporte abierto en el formulario

// ----------------- Carga inicial -----------------
async function cargarVisitasActivas() {
  if (!API_BASE) return;
  try {
    const [enVisita, borradores] = await Promise.all([
      fetch(`${API_BASE}/reportes.php?estado=en_visita`).then(r => r.json()),
      fetch(`${API_BASE}/reportes.php?estado=borrador`).then(r => r.json()),
    ]);
    visitasActivas = {};
    (Array.isArray(enVisita) ? enVisita : []).forEach(r => { visitasActivas[r.tarea_id] = r; });
    borradoresActivos = {};
    (Array.isArray(borradores) ? borradores : []).forEach(r => { borradoresActivos[r.tarea_id] = r; });
    render();
  } catch (e) { console.error('Error cargando visitas activas', e); }
}

// ----------------- Botón en la tarjeta -----------------
function renderVisitaBoton(t) {
  const visita = visitasActivas[t.id];
  if (visita) {
    return `<div class="task-date" style="color:#16a34a;font-weight:700">🟢 En sitio desde ${formatHora(visita.check_in)}</div>
      <button class="btn-archivar" style="background:#f59e0b;color:#fff" onclick="finalizarVisita('${t.id}',event)">🏁 Finalizar visita</button>`;
  }
  const borrador = borradoresActivos[t.id];
  if (borrador) {
    return `<button class="btn-archivar" style="background:#6366f1;color:#fff" onclick="continuarReporte('${borrador.id}',event)">📝 Continuar reporte</button>`;
  }
  return `<button class="btn-archivar" style="background:#16a34a;color:#fff" onclick="iniciarVisita('${t.id}',event)">🚀 Iniciar visita</button>`;
}

function formatHora(fechaSQL) {
  if (!fechaSQL) return '';
  const d = new Date(fechaSQL.replace(' ', 'T'));
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatFechaHoraCorta(fechaSQL) {
  if (!fechaSQL) return '-';
  const d = new Date(fechaSQL.replace(' ', 'T'));
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function calcularDuracion(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '-';
  const a = new Date(checkIn.replace(' ', 'T'));
  const b = new Date(checkOut.replace(' ', 'T'));
  const totalMin = Math.max(0, Math.round((b - a) / 60000));
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return `${h}h ${m}min`;
}

// ----------------- Selector rápido de técnico (sin login todavía) -----------------
let _visitaTecnicoCallback = null;

function abrirSelectorTecnico(tareaId, titulo, callback) {
  const t = tasks.find(x => x.id === tareaId);
  const candidatos = (t?.team && t.team.length) ? t.team.map(id => getMember(id)).filter(Boolean) : TEAM;
  document.getElementById('visita-tecnico-titulo').textContent = titulo;
  document.getElementById('visita-tecnico-lista').innerHTML = candidatos.map(m =>
    `<button class="btn-save" style="width:100%" onclick="resolverSelectorTecnico('${m.id}')">${esc(m.name)}</button>`
  ).join('');
  _visitaTecnicoCallback = callback;
  document.getElementById('visita-tecnico-modal').classList.add('open');
}
function resolverSelectorTecnico(tecnicoId) {
  document.getElementById('visita-tecnico-modal').classList.remove('open');
  const cb = _visitaTecnicoCallback; _visitaTecnicoCallback = null;
  if (cb) cb(tecnicoId);
}
function closeVisitaTecnicoModal() {
  document.getElementById('visita-tecnico-modal').classList.remove('open');
  _visitaTecnicoCallback = null;
}

// ----------------- Iniciar / Finalizar visita -----------------
async function iniciarVisita(tareaId, event) {
  if (event) event.stopPropagation();
  if (!API_BASE) { alert('Esta función requiere conexión al servidor (no disponible en modo local).'); return; }

  const ejecutar = async (tecnicoId) => {
    try {
      const res = await fetch(`${API_BASE}/reportes.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tareaId, tecnicoCheckinId: tecnicoId }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      visitasActivas[tareaId] = data;
      render();
    } catch (e) { console.error(e); alert('No se pudo iniciar la visita. Revisa tu conexión.'); }
  };

  // Con login activo, el usuario que inicia la visita ya se conoce (currentUser).
  // Si por algún motivo no hay sesión, se pregunta como respaldo.
  if (currentUser && currentUser.id) ejecutar(currentUser.id);
  else abrirSelectorTecnico(tareaId, '🚀 ¿Quién inicia la visita?', ejecutar);
}

async function finalizarVisita(tareaId, event) {
  if (event) event.stopPropagation();
  const visita = visitasActivas[tareaId];
  if (!visita) { alert('No hay una visita en curso para esta tarea.'); return; }

  const ejecutar = async (tecnicoId) => {
    try {
      const res = await fetch(`${API_BASE}/reportes.php?id=${visita.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'checkout', tecnicoCheckoutId: tecnicoId }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      delete visitasActivas[tareaId];
      borradoresActivos[tareaId] = data;
      render();
      abrirFormularioReporte(data);
    } catch (e) { console.error(e); alert('No se pudo finalizar la visita. Revisa tu conexión.'); }
  };

  if (currentUser && currentUser.id) ejecutar(currentUser.id);
  else abrirSelectorTecnico(tareaId, '🏁 ¿Quién finaliza la visita?', ejecutar);
}

async function continuarReporte(reporteId, event) {
  if (event) event.stopPropagation();
  try {
    const res = await fetch(`${API_BASE}/reportes.php?id=${reporteId}`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    abrirFormularioReporte(data);
  } catch (e) { console.error(e); alert('No se pudo abrir el reporte.'); }
}

// ----------------- Formulario de reporte -----------------
function abrirFormularioReporte(reporte) {
  reporteActual = reporte;
  if (!reporteActual.plantilla) reporteActual.plantilla = 'evento'; // única disponible por ahora
  renderFormularioReporte();
  document.getElementById('reporte-modal').classList.add('open');
}

function cerrarFormularioReporte() {
  document.getElementById('reporte-modal').classList.remove('open');
  reporteActual = null;
  cargarVisitasActivas();
}

function fotoUrl(archivo) { return `${API_BASE}/reporte_foto.php?archivo=${encodeURIComponent(archivo)}`; }

function fotoThumbHtml(f) {
  return `<div style="position:relative;width:84px;height:84px">
    <img src="${fotoUrl(f.archivo)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
    <button type="button" onclick="eliminarFoto(${f.id})" style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;border:none;border-radius:99px;width:20px;height:20px;font-size:12px;cursor:pointer;line-height:1">✕</button>
  </div>`;
}

function renderSeccion(sec, r) {
  const datos = r.datos || {};
  if (sec.tipo === 'fotos') {
    const fotos = (r.fotos || []).filter(f => f.seccion_id === sec.id);
    return `<div class="form-group full" style="margin-bottom:16px">
      <label>${esc(sec.label)}</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">
        ${fotos.map(fotoThumbHtml).join('')}
      </div>
      <input type="file" id="foto-input-${sec.id}" accept="image/*" capture="environment" multiple style="display:none" onchange="subirFotos('${sec.id}', this.files)">
      <button type="button" class="btn-cancel" onclick="document.getElementById('foto-input-${sec.id}').click()">📷 Agregar fotos</button>
    </div>`;
  }
  if (sec.tipo === 'texto_largo') {
    return `<div class="form-group full" style="margin-bottom:16px">
      <label>${esc(sec.label)}</label>
      <textarea id="campo-${sec.id}" style="min-height:80px" onblur="guardarCamposReporte()">${esc(datos[sec.id] || '')}</textarea>
    </div>`;
  }
  if (sec.tipo === 'firma') {
    const firmaFoto = (r.fotos || []).find(f => f.seccion_id === sec.id);
    return `<div class="form-group full" style="margin-bottom:16px">
      <label>${esc(sec.label)}</label>
      ${firmaFoto
        ? `<div style="margin:8px 0"><img src="${fotoUrl(firmaFoto.archivo)}" style="max-width:260px;border:1px solid var(--border);border-radius:8px;background:#fff"></div>
           <button type="button" class="btn-cancel" onclick="rehacerFirma('${sec.id}')">✏️ Volver a firmar</button>`
        : `<canvas id="firma-canvas-${sec.id}" width="320" height="150" style="border:1px solid var(--border);border-radius:8px;background:#fff;touch-action:none;max-width:100%"></canvas>
           <div style="display:flex;gap:8px;margin-top:6px">
             <button type="button" class="btn-cancel" onclick="limpiarFirma('${sec.id}')">Limpiar</button>
             <button type="button" class="btn-save" onclick="guardarFirma('${sec.id}')">Guardar firma</button>
           </div>`}
    </div>`;
  }
  return '';
}

function renderFormularioReporte() {
  const r = reporteActual;
  const t = tasks.find(x => x.id === r.tarea_id) || {};
  const plantilla = PLANTILLAS_REPORTE[r.plantilla] || PLANTILLAS_REPORTE.evento;
  const tecnicoIn = getMember(r.tecnico_checkin_id)?.name || '-';
  const tecnicoOut = getMember(r.tecnico_checkout_id)?.name || '-';

  const seccionesHtml = plantilla.secciones.map(sec => renderSeccion(sec, r)).join('');
  const yaGenerado = !!r.pdf_archivo;

  document.getElementById('reporte-body').innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:16px">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px">${esc(t.cliente || 'Sin cliente')}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">${esc(t.titulo || '')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--text-muted)">
        <span>👷 Inició: ${esc(tecnicoIn)}</span>
        <span>🏁 Finalizó: ${esc(tecnicoOut)}</span>
        <span>🕐 ${formatHora(r.check_in)} – ${formatHora(r.check_out)}</span>
        <span>⏱ ${calcularDuracion(r.check_in, r.check_out)}</span>
      </div>
    </div>
    ${seccionesHtml}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
      <button class="btn-save" id="btn-generar-pdf" onclick="generarPDFReporte(this)">📄 ${yaGenerado ? 'Regenerar PDF' : 'Generar PDF'}</button>
      <div id="reporte-pdf-status" style="font-size:13px">${yaGenerado ? `✅ PDF generado. <a href="${API_BASE}/reporte_pdf.php?id=${r.id}" target="_blank">Ver PDF</a>` : ''}</div>
      <div id="reporte-envio" style="${yaGenerado ? '' : 'display:none;'}border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
        <label style="font-size:12px;color:var(--text-muted)">Correo adicional del cliente (siempre se envía copia a administrativo@innovate.com.co)</label>
        <input type="email" id="reporte-correo-cliente" placeholder="cliente@correo.com" style="width:100%;margin:6px 0 10px">
        <button class="btn-save" id="btn-enviar-correo" onclick="enviarCorreoReporte(this)">📧 Enviar por correo</button>
        <div id="reporte-envio-status" style="font-size:13px;margin-top:6px">${r.estado === 'enviado' ? `✅ Enviado a: ${esc(r.enviado_a || '')}` : ''}</div>
      </div>
    </div>
  `;

  plantilla.secciones.filter(s => s.tipo === 'firma').forEach(s => initFirmaCanvas(s.id));
  precargarCorreoCliente();
}

// ----------------- Fotos -----------------
async function subirFotos(seccionId, files) {
  if (!files || !files.length) return;
  for (const file of files) {
    const fd = new FormData();
    fd.append('reporteId', reporteActual.id);
    fd.append('seccionId', seccionId);
    fd.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/reporte_foto.php`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) { alert(data.error); continue; }
      if (!reporteActual.fotos) reporteActual.fotos = [];
      reporteActual.fotos.push({ id: data.id, seccion_id: seccionId, archivo: data.archivo, orden: 0 });
    } catch (e) { console.error(e); alert('No se pudo subir una foto.'); }
  }
  renderFormularioReporte();
}

async function eliminarFoto(fotoId) {
  if (!confirm('¿Eliminar esta foto?')) return;
  try {
    await fetch(`${API_BASE}/reporte_foto.php?id=${fotoId}`, { method: 'DELETE' });
    reporteActual.fotos = (reporteActual.fotos || []).filter(f => f.id !== fotoId);
    renderFormularioReporte();
  } catch (e) { console.error(e); alert('No se pudo eliminar la foto.'); }
}

// ----------------- Campos de texto -----------------
function guardarCamposReporte() {
  const plantilla = PLANTILLAS_REPORTE[reporteActual.plantilla] || PLANTILLAS_REPORTE.evento;
  const datos = {};
  plantilla.secciones.filter(s => s.tipo === 'texto_largo').forEach(s => {
    const el = document.getElementById(`campo-${s.id}`);
    if (el) datos[s.id] = el.value;
  });
  reporteActual.datos = { ...(reporteActual.datos || {}), ...datos };
  fetch(`${API_BASE}/reportes.php?id=${reporteActual.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plantilla: reporteActual.plantilla, datos }),
  }).catch(e => console.error('No se pudo guardar el reporte', e));
}

// ----------------- Firma (canvas táctil) -----------------
const _firmaCtx = {};
function initFirmaCanvas(seccionId) {
  const canvas = document.getElementById(`firma-canvas-${seccionId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e293b';
  _firmaCtx[seccionId] = ctx;
  let dibujando = false;
  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) * (canvas.width / rect.width), y: (p.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function start(e) { dibujando = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e) { if (!dibujando) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function end() { dibujando = false; }
  canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
}
function limpiarFirma(seccionId) {
  const canvas = document.getElementById(`firma-canvas-${seccionId}`);
  const ctx = _firmaCtx[seccionId];
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
function guardarFirma(seccionId) {
  const canvas = document.getElementById(`firma-canvas-${seccionId}`);
  if (!canvas) return;
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const fd = new FormData();
    fd.append('reporteId', reporteActual.id);
    fd.append('seccionId', seccionId);
    fd.append('file', blob, 'firma.png');
    try {
      const res = await fetch(`${API_BASE}/reporte_foto.php`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      if (!reporteActual.fotos) reporteActual.fotos = [];
      reporteActual.fotos.push({ id: data.id, seccion_id: seccionId, archivo: data.archivo, orden: 0 });
      renderFormularioReporte();
    } catch (e) { console.error(e); alert('No se pudo guardar la firma.'); }
  }, 'image/png');
}
function rehacerFirma(seccionId) {
  const firmaFoto = (reporteActual.fotos || []).find(f => f.seccion_id === seccionId);
  if (firmaFoto) eliminarFoto(firmaFoto.id);
}

// ----------------- Generación de PDF (jsPDF, sin dependencias en el servidor) -----------------
async function cargarImagenDataURL(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

let _generandoPDF = false;

async function generarPDFReporte(btn) {
  if (_generandoPDF) return; // evita doble clic mientras se genera
  _generandoPDF = true;

  const statusEl = document.getElementById('reporte-pdf-status');
  const botonEl = btn || document.getElementById('btn-generar-pdf');
  const textoOriginalBoton = botonEl ? botonEl.innerHTML : '';
  if (botonEl) {
    botonEl.disabled = true;
    botonEl.style.opacity = '0.7';
    botonEl.style.cursor = 'wait';
    botonEl.innerHTML = '⏳ Generando PDF... espera un momento';
  }
  statusEl.innerHTML = '⏳ Generando PDF, esto puede tardar unos segundos...';
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210, marginX = 15;
    let y = 18;

    try {
      const logoData = await cargarImagenDataURL('assets/img/logo-innovate.png');
      doc.addImage(logoData, 'PNG', pageW - 15 - 42, 12, 42, 42 * (250 / 775));
    } catch (e) { /* continúa sin logo si falla */ }

    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    doc.text('Reporte de visita técnica', marginX, y); y += 8;
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(90);
    doc.text('Grupo Innovate · Tel: 3176452811 · NIT: 900460263 · administrativo@innovate.com.co', marginX, y); y += 4;
    doc.text('Cra. 30 # 6-06 Ofic 501, Cali Valle del Cauca, Colombia', marginX, y); y += 8;
    doc.setDrawColor(220); doc.line(marginX, y, pageW - marginX, y); y += 6;
    doc.setTextColor(20);

    const r = reporteActual;
    const t = tasks.find(x => x.id === r.tarea_id) || {};
    const tecnicoIn = getMember(r.tecnico_checkin_id)?.name || '-';
    const tecnicoOut = getMember(r.tecnico_checkout_id)?.name || '-';

    const filas = [
      ['Cliente', t.cliente || '-'],
      ['Tarea', t.titulo || '-'],
      ['Técnico', tecnicoIn === tecnicoOut ? tecnicoIn : `${tecnicoIn} / ${tecnicoOut}`],
      ['Check-in', formatFechaHoraCorta(r.check_in)],
      ['Check-out', formatFechaHoraCorta(r.check_out)],
      ['Duración', calcularDuracion(r.check_in, r.check_out)],
    ];
    doc.setFontSize(10);
    filas.forEach(([label, val]) => {
      doc.setFont(undefined, 'bold'); doc.text(label + ':', marginX, y);
      doc.setFont(undefined, 'normal'); doc.text(String(val), marginX + 32, y);
      y += 6;
    });
    y += 4;

    const plantilla = PLANTILLAS_REPORTE[r.plantilla] || PLANTILLAS_REPORTE.evento;
    function asegurarEspacio(necesario) { if (y + necesario > 280) { doc.addPage(); y = 18; } }

    for (const sec of plantilla.secciones) {
      asegurarEspacio(12);
      doc.setFontSize(11); doc.setFont(undefined, 'bold');
      doc.text(sec.label, marginX, y); y += 6;
      doc.setFont(undefined, 'normal'); doc.setFontSize(10);

      if (sec.tipo === 'fotos') {
        const fotos = (r.fotos || []).filter(f => f.seccion_id === sec.id);
        if (!fotos.length) {
          doc.setTextColor(150); doc.text('(sin fotos)', marginX, y); doc.setTextColor(20); y += 8; continue;
        }
        const colW = 55, colH = 40, gap = 5;
        let col = 0;
        for (const f of fotos) {
          asegurarEspacio(colH + 5);
          try {
            const dataUrl = await cargarImagenDataURL(fotoUrl(f.archivo));
            const x = marginX + col * (colW + gap);
            doc.addImage(dataUrl, x, y, colW, colH);
          } catch (e) { /* se omite si la foto no carga */ }
          col++;
          if (col >= 3) { col = 0; y += colH + gap; }
        }
        if (col !== 0) y += colH + gap;
        y += 4;
      } else if (sec.tipo === 'texto_largo') {
        const texto = (r.datos && r.datos[sec.id]) || '(sin información)';
        const lineas = doc.splitTextToSize(texto, pageW - marginX * 2);
        asegurarEspacio(lineas.length * 5 + 4);
        doc.text(lineas, marginX, y);
        y += lineas.length * 5 + 6;
      } else if (sec.tipo === 'firma') {
        const firmaFoto = (r.fotos || []).find(f => f.seccion_id === sec.id);
        if (firmaFoto) {
          asegurarEspacio(35);
          try {
            const dataUrl = await cargarImagenDataURL(fotoUrl(firmaFoto.archivo));
            doc.addImage(dataUrl, marginX, y, 60, 30);
            y += 32;
          } catch (e) { y += 4; }
          doc.setDrawColor(180); doc.line(marginX, y, marginX + 70, y); y += 5;
          doc.setFontSize(9); doc.text(`Firmado por: ${t.cliente || 'Cliente'}`, marginX, y); y += 8;
        } else {
          doc.setTextColor(150); doc.text('(sin firma)', marginX, y); doc.setTextColor(20); y += 8;
        }
      }
    }

    const totalPaginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Página ${p} de ${totalPaginas}`, pageW - marginX - 25, 292);
    }

    const blobPdf = doc.output('blob');
    const fd = new FormData();
    fd.append('reporteId', r.id);
    fd.append('file', blobPdf, `reporte-${r.id}.pdf`);
    const res = await fetch(`${API_BASE}/reporte_pdf.php`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) {
      statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`;
      if (botonEl) botonEl.innerHTML = textoOriginalBoton;
      return;
    }

    reporteActual.pdf_archivo = data.archivo;
    statusEl.innerHTML = `✅ PDF generado. <a href="${API_BASE}/reporte_pdf.php?id=${r.id}" target="_blank">Ver PDF</a>`;
    document.getElementById('reporte-envio').style.display = 'block';
    if (botonEl) botonEl.innerHTML = '📄 Regenerar PDF';
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo generar el PDF. Verifica tu conexión e intenta de nuevo.</span>';
    if (botonEl) botonEl.innerHTML = textoOriginalBoton;
  } finally {
    _generandoPDF = false;
    if (botonEl) {
      botonEl.disabled = false;
      botonEl.style.opacity = '';
      botonEl.style.cursor = '';
    }
  }
}

// ----------------- Envío de correo -----------------
async function precargarCorreoCliente() {
  try {
    const res = await fetch(`${API_BASE}/reporte_enviar_correo.php?reporteId=${reporteActual.id}`);
    const data = await res.json();
    const input = document.getElementById('reporte-correo-cliente');
    if (input && data.cliente_email_alegra) input.value = data.cliente_email_alegra;
  } catch (e) { /* silencioso: si Alegra no responde, el técnico escribe el correo a mano */ }
}

let _enviandoCorreo = false;

async function enviarCorreoReporte(btn) {
  if (_enviandoCorreo) return; // evita doble clic mientras se envía
  _enviandoCorreo = true;

  const statusEl = document.getElementById('reporte-envio-status');
  const correoCliente = document.getElementById('reporte-correo-cliente').value.trim();
  const botonEl = btn || document.getElementById('btn-enviar-correo');
  const textoOriginalBoton = botonEl ? botonEl.innerHTML : '';
  if (botonEl) {
    botonEl.disabled = true;
    botonEl.style.opacity = '0.7';
    botonEl.style.cursor = 'wait';
    botonEl.innerHTML = '⏳ Enviando...';
  }
  statusEl.innerHTML = '⏳ Enviando correo, espera un momento...';
  try {
    const res = await fetch(`${API_BASE}/reporte_enviar_correo.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporteId: reporteActual.id, correos: correoCliente ? [correoCliente] : [] }),
    });
    const data = await res.json();
    if (data.error) { statusEl.innerHTML = `<span style="color:#ef4444">⚠️ ${esc(data.error)}</span>`; return; }
    statusEl.innerHTML = `✅ Enviado a: ${esc(data.enviado_a.join(', '))}`;
  } catch (e) {
    console.error(e);
    statusEl.innerHTML = '<span style="color:#ef4444">⚠️ No se pudo enviar el correo. Verifica tu conexión e intenta de nuevo.</span>';
  } finally {
    _enviandoCorreo = false;
    if (botonEl) {
      botonEl.disabled = false;
      botonEl.style.opacity = '';
      botonEl.style.cursor = '';
      botonEl.innerHTML = textoOriginalBoton;
    }
  }
}
// ===================== FIN REPORTES DE VISITA =====================
