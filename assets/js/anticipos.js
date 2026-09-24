// ============================================================
// anticipos.js — Anticipos recibidos y entregados (dos pestañas).
//
// Muestra, para cada dirección, los CLIENTES/PROVEEDORES que en Alegra
// todavía tienen saldo pendiente en la cuenta de anticipos (no un pago
// individual: Alegra no modifica el pago original al "aplicar" un anticipo,
// crea aparte un comprobante contable — por eso hay que comparar lo recibido
// contra lo ya aplicado, y agrupar por contacto es lo que de verdad refleja
// si queda algo pendiente). Es solo de consulta + seguimiento (nota +
// próxima revisión, guardado en Ginno, ahora por contacto): "matar" el
// anticipo siempre se hace en Alegra.
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
let anticiposBusqueda = { recibido: '', entregado: '' }; // texto del buscador de cada pestaña (ya en minúsculas)

// Verificación "perezosa" del saldo por contacto: en vez de que el servidor
// le pregunte a Alegra por decenas de clientes seguidos en una sola petición
// (eso era lo que colgaba "Escaneo completo"), el navegador va verificando
// uno por uno, solo los que se están mostrando y llevan rato sin chequearse
// — espaciados para no ametrallar ni Alegra ni el servidor.
const ANTICIPOS_VENCIDO_MS = 12 * 60 * 60 * 1000; // 12 horas
let _anticiposVerificando = { recibido: false, entregado: false };

function _anticiposSaldoVencido(saldoVerificadoEn) {
  if (!saldoVerificadoEn) return true;
  const t = new Date(String(saldoVerificadoEn).replace(' ', 'T')).getTime();
  if (isNaN(t)) return true;
  return (Date.now() - t) > ANTICIPOS_VENCIDO_MS;
}

function setAnticiposBusqueda(direccion, val) {
  anticiposBusqueda[direccion] = (val || '').trim().toLowerCase();
  renderAnticipos(direccion);
}

// Link directo al pago en Alegra, para abrirlo y resolver el anticipo allá.
// Confirmado con Carlos: "recibido" -> https://app.alegra.com/income-payments/view/id/27392
//                        "entregado" -> https://app.alegra.com/payment/view/id/25803
function _anticiposUrlAlegra(direccion, id) {
  if (direccion === 'recibido')  return `https://app.alegra.com/income-payments/view/id/${id}`;
  if (direccion === 'entregado') return `https://app.alegra.com/payment/view/id/${id}`;
  return null;
}

// contacto_id no siempre es un ID "limpio" para usar en un id de HTML —
// se usa un índice de la lista en vez del id real, más simple y sin riesgo.
function _anticiposClave(direccion, idx) { return `${direccion}-${idx}`; }

async function fetchAnticipos(direccion) {
  if (!currentUser || currentUser.perfil !== 'admin' || !API_BASE) return;
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
  const todos = anticiposCache[direccion] || [];

  // El total y "última actualización" siempre reflejan TODO lo pendiente,
  // no solo lo que coincide con el buscador (el buscador solo filtra la
  // lista de tarjetas de abajo).
  const totalEl = document.getElementById(`anticipos-${direccion}-total`);
  if (totalEl) {
    const total = todos.reduce((s, it) => s + (Number(it.saldoPendiente) || 0), 0);
    totalEl.innerHTML = todos.length
      ? `${todos.length} cliente${todos.length === 1 ? '' : 's'}/proveedor${todos.length === 1 ? '' : 'es'} con anticipo ${ANTICIPOS_LABEL[direccion]} pendiente — <strong>${formatCOP(total)}</strong>`
      : `✅ Sin anticipos ${ANTICIPOS_LABEL[direccion]} pendientes`;
  }

  const meta = anticiposMeta[direccion] || {};
  const actEl = document.getElementById(`anticipos-${direccion}-actualizado`);
  if (actEl) {
    actEl.textContent = meta.ultimaCorridaEn
      ? new Date(meta.ultimaCorridaEn.replace(' ', 'T')).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
      : 'nunca';
  }

  if (!todos.length) {
    lista.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">✅ No hay anticipos ${ANTICIPOS_LABEL[direccion]} pendientes.</div>`;
    return;
  }

  // Se filtra manteniendo el índice ORIGINAL de anticiposCache[direccion] en
  // cada item (idx) — anticiposGuardarNota() y _anticiposClave() dependen de
  // que ese índice siga apuntando al item correcto dentro del arreglo
  // completo, no al de la lista ya filtrada por el buscador.
  const busq = anticiposBusqueda[direccion];
  const items = todos
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => !busq || (it.contactoNombre || '').toLowerCase().includes(busq));

  if (!items.length) {
    lista.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Sin resultados para "${esc(anticiposBusqueda[direccion])}".</div>`;
    return;
  }

  lista.innerHTML = items.map(({ it, idx }) => {
    const clave = _anticiposClave(direccion, idx);
    const dias = diasDesde(it.fechaMasAntigua);
    const urgente = dias > 60;
    const sinVerificar = it.contactoId && _anticiposSaldoVencido(it.saldoVerificadoEn);
    const pagosHtml = it.pagos.map(p => {
      const urlAlegra = _anticiposUrlAlegra(direccion, p.alegra_payment_id);
      return `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--border,#e5e7eb);font-size:12px">
        <div style="color:var(--text-muted)">
          📅 ${p.fecha} · Pago #${esc(p.numero || p.alegra_payment_id)} · ${esc(p.cuenta_nombre)}
          ${p.anotacion ? `<br>"${esc(p.anotacion)}"` : ''}
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div>${formatCOP(p.valor)}</div>
          ${urlAlegra ? `<a href="${urlAlegra}" target="_blank" rel="noopener" style="color:var(--primary,#14a8bd);text-decoration:none">🔗 Alegra</a>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="anticipo-card" style="background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:var(--radius);padding:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700;font-size:14px">${it.contactoNombre ? esc(it.contactoNombre) : '❔ Sin identificar'}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
            Desde ${it.fechaMasAntigua} · hace ${dias} día${dias === 1 ? '' : 's'} · ${it.pagos.length} pago${it.pagos.length === 1 ? '' : 's'}
            ${it.totalRecibido !== it.saldoPendiente ? ` · ${formatCOP(it.totalRecibido)} en total, ya aplicó parte` : ''}
            ${sinVerificar ? ' · ⏳ saldo sin verificar contra Alegra todavía' : ''}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:16px;color:${urgente ? '#e63946' : 'var(--text)'};white-space:nowrap">${formatCOP(it.saldoPendiente)}</div>
          <div style="font-size:11px;color:var(--text-muted)">saldo pendiente</div>
        </div>
      </div>
      <details style="margin-top:8px">
        <summary style="cursor:pointer;font-size:12px;color:var(--primary,#14a8bd)">Ver pago${it.pagos.length === 1 ? '' : 's'} (${it.pagos.length})</summary>
        ${pagosHtml}
      </details>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:200px">
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px">Nota (¿por qué sigue abierto? ¿quién lo resuelve?)</label>
          <input type="text" id="nota-${clave}" value="${esc(it.nota || '')}"
            style="width:100%;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:12px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px">Próxima revisión</label>
          <input type="date" id="revision-${clave}" value="${it.fechaProximaRevision || ''}"
            style="padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:12px">
        </div>
        <button class="btn-save" style="padding:7px 14px;font-size:12px" onclick="anticiposGuardarNota('${direccion}',${idx})">Guardar</button>
      </div>
    </div>`;
  }).join('');

  // Dispara (sin esperar) la verificación perezosa de los que se están
  // mostrando y llevan rato sin chequearse contra Alegra.
  _anticiposVerificarPendientes(direccion, items);
}

// Verifica, uno por uno y espaciados, el saldo real en Alegra de los
// contactos visibles que nunca se han verificado o llevan más de 12 horas
// sin hacerlo — así el servidor nunca tiene que preguntarle a Alegra por
// decenas de contactos seguidos en una sola petición (eso era lo que
// colgaba el escaneo). Si un contacto queda en $0 (ya se aplicó del todo en
// Alegra), se saca de la lista en caliente, sin esperar a la próxima carga.
async function _anticiposVerificarPendientes(direccion, items) {
  if (_anticiposVerificando[direccion]) return; // ya hay una tanda corriendo
  const pendientes = items
    .map(({ it }) => it)
    .filter(it => it.contactoId && _anticiposSaldoVencido(it.saldoVerificadoEn));
  if (!pendientes.length) return;

  _anticiposVerificando[direccion] = true;
  try {
    for (const it of pendientes) {
      try {
        const res = await fetch(`${API_BASE}/anticipos.php?accion=verificar_saldo&direccion=${direccion}&contacto_id=${encodeURIComponent(it.contactoId)}`, {
          method: 'POST',
        });
        const data = await res.json();
        if (data && !data.error && typeof data.saldo === 'number') {
          if (data.saldo <= 0.5) {
            const pos = anticiposCache[direccion].indexOf(it);
            if (pos !== -1) anticiposCache[direccion].splice(pos, 1);
          } else {
            it.saldoPendiente = data.saldo;
            it.saldoVerificadoEn = new Date().toISOString();
          }
        }
      } catch (e) { /* este contacto se reintenta la próxima vez que se muestre */ }
      await new Promise(r => setTimeout(r, 400)); // espaciado — no ametrallar Alegra ni el servidor
    }
    renderAnticipos(direccion); // ya con los saldos verificados reflejados
  } finally {
    _anticiposVerificando[direccion] = false;
  }
}

async function anticiposGuardarNota(direccion, idx) {
  const it = (anticiposCache[direccion] || [])[idx];
  if (!it || !it.contactoId) return; // sin identificar: no hay contacto al que guardarle nota
  const clave = _anticiposClave(direccion, idx);
  const notaEl = document.getElementById(`nota-${clave}`);
  const revisionEl = document.getElementById(`revision-${clave}`);
  const body = { nota: notaEl ? notaEl.value : '', fechaProximaRevision: revisionEl ? revisionEl.value : '' };
  try {
    const res = await fetch(`${API_BASE}/anticipos.php?contacto_id=${encodeURIComponent(it.contactoId)}&direccion=${direccion}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const saved = await res.json();
    it.nota = saved.nota; it.fechaProximaRevision = saved.fecha_proxima_revision;
  } catch (e) { /* silencioso */ }
}

async function anticiposActualizar(direccion, completo) {
  const btn = document.getElementById(`anticipos-${direccion}-btn-actualizar`);
  if (btn) btn.disabled = true;
  try {
    if (completo) {
      // El historial completo de Alegra se recorre en lotes (ver
      // backend/lib/alegra_anticipos.php) — el navegador va pidiendo el
      // siguiente lote hasta que el servidor avisa que ya terminó, en vez de
      // una sola petición gigante que el hosting termina cortando a la
      // mitad. Mientras tanto se ve el progreso real, no un spinner fijo.
      let pagina = 0;
      let lote = 1;
      while (true) {
        if (btn) btn.textContent = `⏳ Escaneando Alegra... (lote ${lote})`;
        const res = await fetch(`${API_BASE}/anticipos.php?accion=escaneo_completo&direccion=${direccion}&pagina=${pagina}`, {
          method: 'POST',
        });
        const data = await res.json();
        if (data && data.error) break; // silencioso — se reintenta con el botón
        if (data && data.siguientePagina !== null && data.siguientePagina !== undefined) {
          pagina = data.siguientePagina;
          lote++;
        } else {
          break; // terminó
        }
      }
    } else {
      if (btn) btn.textContent = '⏳ Consultando Alegra...';
      await fetch(`${API_BASE}/anticipos.php?accion=actualizar&direccion=${direccion}`, { method: 'POST' });
    }
  } catch (e) { /* silencioso */ }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Actualizar ahora'; }
  await fetchAnticipos(direccion);
}
