// ============================================================
// anticipos.js — Anticipos recibidos y entregados (dos pestañas).
//
// Muestra, para cada dirección, los pagos que en Alegra quedaron
// codificados a la cuenta de anticipos en vez de a una factura/compra
// (así es como Grupo Innovate los registra hoy — no se usa la función
// nativa "aplicar anticipo" de Alegra). Es solo de consulta + seguimiento
// (nota + próxima revisión, guardado en Ginno): "matar" el anticipo
// (aplicarlo a la factura con sus retenciones) siempre se hace en Alegra.
//
// La lista viene de una caché en la BD de Ginno (backend/lib/alegra_anticipos.php),
// refrescada por un cron nocturno o por el botón "🔄 Actualizar ahora" — no
// se recorre Alegra en vivo cada vez que se abre la pestaña.
//
// Reutiliza formatCOP() y diasDesde() de cartera.js (carga antes en el HTML).
// ============================================================

const ANTICIPOS_LABEL = { recibido: 'recibidos', entregado: 'entregados' };
let anticiposCache = { recibido: [], entregado: [] };
let anticiposMeta  = { recibido: {}, entregado: {} };

// Link directo al pago en Alegra, para abrirlo y resolver el anticipo allá.
// Confirmado con Carlos: "recibido" -> https://app.alegra.com/income-payments/view/id/27392
//                        "entregado" -> https://app.alegra.com/payment/view/id/25803
function _anticiposUrlAlegra(direccion, id) {
  if (direccion === 'recibido')  return `https://app.alegra.com/income-payments/view/id/${id}`;
  if (direccion === 'entregado') return `https://app.alegra.com/payment/view/id/${id}`;
  return null;
}

async function fetchAnticipos(direccion) {
  if (!currentUser || currentUser.perfil !== 'admin' || !API_BASE) return;
  const lista = document.getElementById(`anticipos-${direccion}-lista`);
  const loading = document.getElementById(`anticipos-${direccion}-loading`);
  if (loading) loading.style.display = 'block';
  try {
    const res = await fetch(`${API_BASE}/anticipos.php?direccion=${direccion}`);
    const data = await res.json();
    anticiposCache[direccion] = Array.isArray(data.items) ? data.items : [];
    anticiposMeta[direccion]  = { ultimaCorridaEn: data.ultimaCorridaEn, escaneoCompletoHecho: data.escaneoCompletoHecho };
  } catch (e) {
    anticiposCache[direccion] = anticiposCache[direccion] || [];
  }
  if (loading) loading.style.display = 'none';
  renderAnticipos(direccion);
}

function renderAnticipos(direccion) {
  const lista = document.getElementById(`anticipos-${direccion}-lista`);
  if (!lista) return;
  const items = anticiposCache[direccion] || [];

  const totalEl = document.getElementById(`anticipos-${direccion}-total`);
  if (totalEl) {
    const total = items.reduce((s, it) => s + (Number(it.valor) || 0), 0);
    totalEl.innerHTML = items.length
      ? `${items.length} anticipo${items.length === 1 ? '' : 's'} ${ANTICIPOS_LABEL[direccion]} abierto${items.length === 1 ? '' : 's'} — <strong>${formatCOP(total)}</strong>`
      : `✅ Sin anticipos ${ANTICIPOS_LABEL[direccion]} abiertos`;
  }

  const meta = anticiposMeta[direccion] || {};
  const actEl = document.getElementById(`anticipos-${direccion}-actualizado`);
  if (actEl) {
    actEl.textContent = meta.ultimaCorridaEn
      ? new Date(meta.ultimaCorridaEn.replace(' ', 'T')).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
      : 'nunca';
  }

  if (!items.length) {
    lista.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">✅ No hay anticipos ${ANTICIPOS_LABEL[direccion]} pendientes.</div>`;
    return;
  }

  lista.innerHTML = items.map(it => {
    const dias = diasDesde(it.fecha);
    const urgente = dias > 60;
    const urlAlegra = _anticiposUrlAlegra(direccion, it.alegra_payment_id);
    return `<div class="anticipo-card" style="background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:var(--radius);padding:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700;font-size:14px">${it.contacto_nombre ? esc(it.contacto_nombre) : '❔ Sin identificar'}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">📅 ${it.fecha} · hace ${dias} día${dias === 1 ? '' : 's'} · Pago #${esc(it.numero || it.alegra_payment_id)} · ${esc(it.cuenta_nombre)}</div>
          ${it.anotacion ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">"${esc(it.anotacion)}"</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:16px;color:${urgente ? '#e63946' : 'var(--text)'};white-space:nowrap">${formatCOP(it.valor)}</div>
          ${urlAlegra ? `<a href="${urlAlegra}" target="_blank" rel="noopener" style="font-size:11px;color:var(--primary,#14a8bd);text-decoration:none;white-space:nowrap">🔗 Abrir en Alegra</a>` : ''}
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:200px">
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px">Nota (¿por qué sigue abierto? ¿quién lo resuelve?)</label>
          <input type="text" id="nota-${direccion}-${it.alegra_payment_id}" value="${esc(it.nota || '')}"
            style="width:100%;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:12px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px">Próxima revisión</label>
          <input type="date" id="revision-${direccion}-${it.alegra_payment_id}" value="${it.fecha_proxima_revision || ''}"
            style="padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:12px">
        </div>
        <button class="btn-save" style="padding:7px 14px;font-size:12px" onclick="anticiposGuardarNota('${direccion}','${it.alegra_payment_id}')">Guardar</button>
      </div>
    </div>`;
  }).join('');
}

async function anticiposGuardarNota(direccion, alegraId) {
  const notaEl = document.getElementById(`nota-${direccion}-${alegraId}`);
  const revisionEl = document.getElementById(`revision-${direccion}-${alegraId}`);
  const body = { nota: notaEl ? notaEl.value : '', fechaProximaRevision: revisionEl ? revisionEl.value : '' };
  try {
    const res = await fetch(`${API_BASE}/anticipos.php?alegra_payment_id=${encodeURIComponent(alegraId)}&direccion=${direccion}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const saved = await res.json();
    const item = (anticiposCache[direccion] || []).find(it => it.alegra_payment_id === alegraId);
    if (item) { item.nota = saved.nota; item.fecha_proxima_revision = saved.fecha_proxima_revision; }
  } catch (e) { /* silencioso */ }
}

async function anticiposActualizar(direccion, completo) {
  const btn = document.getElementById(`anticipos-${direccion}-btn-actualizar`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Consultando Alegra...'; }
  try {
    await fetch(`${API_BASE}/anticipos.php?accion=${completo ? 'escaneo_completo' : 'actualizar'}&direccion=${direccion}`, {
      method: 'POST',
    });
  } catch (e) { /* silencioso */ }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Actualizar ahora'; }
  await fetchAnticipos(direccion);
}
