// ============================================================
// ausencias.js — Módulo de Vacaciones, permisos y faltas (solo admin).
//
// Vive dentro del panel de ⚙️ Configuración, junto a Usuarios. Es una
// herramienta de REGISTRO del encargado: no hay autogestión de los
// técnicos (ellos no ven ni solicitan nada desde la app), y el estado
// de "gestión" es puramente administrativo — no afecta el cálculo del
// saldo de vacaciones (backend/api/ausencias.php cuenta los días de
// tipo 'vacaciones' del año esté o no ya gestionada la ausencia).
//
// Cada tipo de ausencia tiene un trámite distinto una vez ocurre, que
// es lo que se registra al "archivarla":
//   vacaciones              -> carta firmada del trabajador recibida
//   permiso_remunerado      -> aprobación de gerencia
//   permiso_no_remunerado   -> descuento en nómina
//   incapacidad             -> reclamo ante la EPS
//   falta / otro            -> nota libre
// ============================================================

const AUSENCIA_TIPO_INFO = {
  vacaciones:             { label: '🏖️ Vacaciones',             gestion: 'Carta firmada del trabajador recibida', placeholder: 'ej: carta recibida el 10/09, firmada por Jorge' },
  permiso_remunerado:     { label: '✅ Permiso remunerado',      gestion: 'Aprobación de gerencia',                placeholder: 'ej: aprobado por Carlos el 10/09' },
  permiso_no_remunerado:  { label: '🚫 Permiso no remunerado',   gestion: 'Descuento en nómina',                   placeholder: 'ej: descontado en la nómina de septiembre' },
  incapacidad:            { label: '🩺 Incapacidad',             gestion: 'Reclamo ante la EPS',                   placeholder: 'ej: radicado ante Nueva EPS #12345' },
  falta:                  { label: '⚠️ Falta',                   gestion: 'Gestión',                               placeholder: 'Nota sobre cómo se manejó' },
  otro:                   { label: '📌 Otro',                    gestion: 'Gestión',                               placeholder: 'Nota sobre cómo se manejó' },
};

let _ausUsuarios       = [];
let _ausAnio           = new Date().getFullYear();
let _ausData           = { items: [], resumen: [] };
let _ausFiltroUsuario  = '';
let _ausEditandoId     = null;

// Mapa 'YYYY-MM-DD' -> nombre, con los festivos colombianos cargados en
// Ginno (tabla `festivos`, ver backend/lib/festivos.php). Se carga una
// vez al abrir el módulo y se usa en _amCalcularDiasLocal() para que la
// vista previa del cálculo de días coincida con la del backend.
let _festivosSet = {};

function _ausFormatFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Vista principal ----

async function renderAusenciasView() {
  const cont = document.getElementById('ausencias-view');
  if (!cont) return;
  if (!currentUser || currentUser.perfil !== 'admin') { cont.innerHTML = ''; return; }

  cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">Cargando...</div>';

  try {
    const token = localStorage.getItem('sesion_token') || '';
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const [resUsuarios, resAusencias, resFestivos] = await Promise.all([
      fetch(`${API_BASE}/usuarios.php`, { headers }),
      fetch(`${API_BASE}/ausencias.php?anio=${_ausAnio}`, { headers }),
      fetch(`${API_BASE}/festivos.php`, { headers }),
    ]);
    const usuarios = await resUsuarios.json();
    _ausUsuarios = (Array.isArray(usuarios) ? usuarios : []).filter(u => u.activo == 1);
    _ausData = await resAusencias.json();
    if (!_ausData || !Array.isArray(_ausData.items)) throw new Error('Respuesta inesperada');
    try {
      const festivosResp = await resFestivos.json();
      _festivosSet = {};
      (festivosResp?.items || []).forEach(f => { _festivosSet[f.fecha] = f.nombre; });
    } catch (e) {
      _festivosSet = {}; // sin festivos no se rompe el módulo, solo pierde precisión la vista previa
    }
  } catch (e) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:#ef4444">No se pudo cargar Vacaciones y permisos.</div>';
    return;
  }

  _renderAusencias();
}

function _renderAusencias() {
  const cont = document.getElementById('ausencias-view');
  if (!cont) return;

  const anioActual = new Date().getFullYear();
  const opcionesAnio = [anioActual - 1, anioActual, anioActual + 1]
    .map(a => `<option value="${a}" ${a === _ausAnio ? 'selected' : ''}>${a}</option>`).join('');

  const opcionesUsuario = `<option value="">Todos los técnicos</option>` +
    _ausUsuarios.map(u => `<option value="${u.id}" ${u.id === _ausFiltroUsuario ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('');

  const resumen = (_ausFiltroUsuario ? _ausData.resumen.filter(r => r.usuarioId === _ausFiltroUsuario) : _ausData.resumen);
  const resumenHtml = resumen.map(r => {
    const colorSaldo = r.saldo < 0 ? '#dc2626' : 'var(--text)';
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;min-width:160px">
      <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.usuarioNombre)}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
        Cuota: ${r.cuota} · Tomados: ${r.tomados}
      </div>
      <div style="font-size:13px;font-weight:700;color:${colorSaldo};margin-top:2px">Saldo: ${r.saldo} días</div>
    </div>`;
  }).join('');

  const items = (_ausFiltroUsuario ? _ausData.items.filter(it => it.usuarioId === _ausFiltroUsuario) : _ausData.items);
  const pendientes = items.filter(it => it.estado === 'pendiente');
  const archivadas  = items.filter(it => it.estado === 'gestionado');

  function filaAusencia(it) {
    const info = AUSENCIA_TIPO_INFO[it.tipo] || { label: it.tipo, gestion: 'Gestión' };
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:13px">${esc(it.usuarioNombre || it.usuarioId)} · ${info.label}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
            ${_ausFormatFecha(it.fechaInicio)} – ${_ausFormatFecha(it.fechaFin)} · ${it.dias} día${it.dias == 1 ? '' : 's'}
          </div>
          ${it.nota ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">"${esc(it.nota)}"</div>` : ''}
          ${it.estado === 'gestionado' ? `<div style="font-size:12px;color:#059669;margin-top:6px">
            ✅ ${esc(info.gestion)}: "${esc(it.notaGestion || '')}"
            <span style="color:var(--text-muted)"> — ${esc(it.gestionadoPor || '')} · ${it.gestionadoEn ? _ausFormatFecha(it.gestionadoEn.split(' ')[0]) : ''}</span>
          </div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start">
          ${it.estado === 'pendiente' ? `
            <button class="btn-save" style="padding:5px 10px;font-size:11px" onclick="abrirModalGestionAusencia(${it.id})">🗄️ Marcar gestionada</button>
            <button class="btn-cancel" style="padding:5px 10px;font-size:11px" onclick="abrirModalAusencia(${it.id})">✏️ Editar</button>
          ` : `
            <button class="btn-cancel" style="padding:5px 10px;font-size:11px" onclick="ausenciaReabrir(${it.id})">↩️ Reabrir</button>
          `}
          <button class="btn-cancel" style="padding:5px 10px;font-size:11px;color:#dc2626" onclick="ausenciaEliminar(${it.id})">🗑️</button>
        </div>
      </div>
    </div>`;
  }

  cont.innerHTML = `
   <div style="max-width:900px">
    <div style="font-weight:700;font-size:16px;margin-bottom:14px">🏖️ Vacaciones y permisos</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      <select id="aus-select-anio" onchange="_ausCambiarAnio(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);font-size:13px">
        ${opcionesAnio}
      </select>
      <select id="aus-select-usuario" onchange="_ausCambiarFiltroUsuario(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);font-size:13px">
        ${opcionesUsuario}
      </select>
      <div style="flex:1"></div>
      <button class="btn-save" onclick="abrirModalAusencia(null)">+ Registrar ausencia</button>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
      ${resumenHtml || '<div style="font-size:12px;color:var(--text-muted)">Sin técnicos activos.</div>'}
    </div>

    <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
      Pendientes de gestión (${pendientes.length})
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
      ${pendientes.length ? pendientes.map(filaAusencia).join('') : '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Ninguna pendiente.</div>'}
    </div>

    <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
      Archivadas (${archivadas.length})
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${archivadas.length ? archivadas.map(filaAusencia).join('') : '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Ninguna archivada todavía.</div>'}
    </div>
   </div>`;
}

function _ausCambiarAnio(valor) {
  _ausAnio = parseInt(valor, 10) || new Date().getFullYear();
  renderAusenciasView();
}

function _ausCambiarFiltroUsuario(valor) {
  _ausFiltroUsuario = valor || '';
  _renderAusencias();
}

// ---- Modal registrar/editar ----

function abrirModalAusencia(id) {
  _ausEditandoId = id;
  const it = id ? _ausData.items.find(x => x.id === id) : null;

  document.getElementById('am-titulo').textContent = id ? 'Editar ausencia' : 'Registrar ausencia';
  document.getElementById('am-id').value = id || '';

  const selUsuario = document.getElementById('am-usuario');
  selUsuario.innerHTML = _ausUsuarios.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('');
  selUsuario.value = it ? it.usuarioId : (_ausFiltroUsuario || _ausUsuarios[0]?.id || '');
  selUsuario.disabled = !!it; // no cambiar el técnico de una ausencia ya registrada

  document.getElementById('am-tipo').value = it ? it.tipo : 'vacaciones';
  document.getElementById('am-fecha-inicio').value = it ? it.fechaInicio : '';
  document.getElementById('am-fecha-fin').value    = it ? it.fechaFin    : '';
  document.getElementById('am-dias').value = it ? it.dias : '';
  document.getElementById('am-nota').value = it ? (it.nota || '') : '';
  document.getElementById('am-dias-info').textContent = 'Calculado automáticamente al elegir las fechas — ajústalo si hace falta.';

  document.getElementById('ausencia-modal').classList.add('open');
}

function cerrarModalAusencia() {
  document.getElementById('ausencia-modal').classList.remove('open');
  _ausEditandoId = null;
}

// Espejo en JS del cálculo del backend (backend/api/ausencias.php ::
// calcularDiasAusencia) — mismo comportamiento, usando _festivosSet
// (cargado en renderAusenciasView). Sirve para mostrar un valor
// sugerido mientras se llena el formulario; el backend vuelve a
// calcularlo si no se manda "dias", y de todos modos el campo queda
// editable.
//
//   - vacaciones: lunes a SÁBADO del rango, sin contar festivos.
//   - permiso_no_remunerado: si falta al menos un día hábil (lun-vie)
//     de una semana, se pierde también sábado, domingo y cualquier
//     festivo de esa semana; los días que sí trabajó esa semana no
//     se cuentan.
//   - el resto: lunes a viernes del rango, igual que antes.
function _fechaYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _amCalcularDiasLocal(tipo, inicioStr, finStr) {
  if (!inicioStr || !finStr) return null;
  const d0 = new Date(inicioStr + 'T00:00:00');
  const d1 = new Date(finStr + 'T00:00:00');
  if (d1 < d0) return null;

  if (tipo === 'vacaciones') {
    let dias = 0;
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // 0=domingo ... 6=sábado
      if (dow >= 1 && dow <= 6 && !_festivosSet[_fechaYmd(d)]) dias++;
    }
    return dias;
  }

  if (tipo === 'permiso_no_remunerado') {
    let total = 0;
    const lunes = new Date(d0);
    const offset = (lunes.getDay() + 6) % 7; // días desde el lunes de esa semana
    lunes.setDate(lunes.getDate() - offset);

    const ultimoLunes = new Date(d1);
    const offsetFin = (ultimoLunes.getDay() + 6) % 7;
    ultimoLunes.setDate(ultimoLunes.getDate() - offsetFin);

    for (let l = new Date(lunes); l <= ultimoLunes; l.setDate(l.getDate() + 7)) {
      const diasSemana = [];
      for (let n = 0; n < 7; n++) {
        const dia = new Date(l); dia.setDate(dia.getDate() + n);
        diasSemana.push(dia);
      }
      const activada = diasSemana.some((dia, i) => i <= 4 && dia >= d0 && dia <= d1);
      if (activada) {
        diasSemana.forEach((dia, i) => {
          const esFestivo = !!_festivosSet[_fechaYmd(dia)];
          if (i <= 4) {
            const dentroDelPermiso = dia >= d0 && dia <= d1;
            if (dentroDelPermiso || esFestivo) total++;
          } else {
            total++;
          }
        });
      }
    }
    return total;
  }

  let dias = 0;
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) dias++;
  }
  return dias;
}

function _amRecalcularDias() {
  const tipo    = document.getElementById('am-tipo').value;
  const inicio  = document.getElementById('am-fecha-inicio').value;
  const fin     = document.getElementById('am-fecha-fin').value;
  const dias = _amCalcularDiasLocal(tipo, inicio, fin);
  if (dias !== null) document.getElementById('am-dias').value = dias;
}

async function guardarAusencia() {
  const id = document.getElementById('am-id').value || null;
  const usuarioId = document.getElementById('am-usuario').value;
  const tipo       = document.getElementById('am-tipo').value;
  const fechaInicio = document.getElementById('am-fecha-inicio').value;
  const fechaFin    = document.getElementById('am-fecha-fin').value;
  const dias        = document.getElementById('am-dias').value;
  const nota        = document.getElementById('am-nota').value.trim();

  if (!usuarioId)   { alert('Elige el técnico'); return; }
  if (!fechaInicio || !fechaFin) { alert('Las fechas de inicio y fin son obligatorias'); return; }
  if (fechaFin < fechaInicio) { alert('La fecha fin no puede ser anterior a la fecha inicio'); return; }
  if (!dias || parseFloat(dias) <= 0) { alert('Los días deben ser mayores a 0'); return; }

  const payload = { usuario_id: usuarioId, tipo, fecha_inicio: fechaInicio, fecha_fin: fechaFin, dias: parseFloat(dias), nota: nota || null };
  const token = localStorage.getItem('sesion_token') || '';
  const url = id ? `${API_BASE}/ausencias.php?id=${id}` : `${API_BASE}/ausencias.php`;

  try {
    const res = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    cerrarModalAusencia();
    await renderAusenciasView();
  } catch (e) {
    console.error(e);
    alert('No se pudo guardar. Revisa la conexión.');
  }
}

async function ausenciaEliminar(id) {
  if (!confirm('¿Eliminar este registro de ausencia? Esta acción no se puede deshacer.')) return;
  const token = localStorage.getItem('sesion_token') || '';
  try {
    await fetch(`${API_BASE}/ausencias.php?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await renderAusenciasView();
  } catch (e) { alert('No se pudo eliminar.'); }
}

async function ausenciaReabrir(id) {
  const token = localStorage.getItem('sesion_token') || '';
  try {
    await fetch(`${API_BASE}/ausencias.php?id=${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'reabrir' }),
    });
    await renderAusenciasView();
  } catch (e) { alert('No se pudo reabrir.'); }
}

// ---- Modal marcar como gestionada ----

function abrirModalGestionAusencia(id) {
  const it = _ausData.items.find(x => x.id === id);
  if (!it) return;
  const info = AUSENCIA_TIPO_INFO[it.tipo] || { gestion: 'Gestión', placeholder: '' };

  document.getElementById('ag-id').value = id;
  document.getElementById('ag-info').innerHTML =
    `${esc(it.usuarioNombre || it.usuarioId)} · ${AUSENCIA_TIPO_INFO[it.tipo]?.label || it.tipo}<br>
     ${_ausFormatFecha(it.fechaInicio)} – ${_ausFormatFecha(it.fechaFin)} · ${it.dias} día${it.dias == 1 ? '' : 's'}`;
  document.getElementById('ag-nota-label').textContent = info.gestion + ' *';
  document.getElementById('ag-nota').placeholder = info.placeholder || '';
  document.getElementById('ag-nota').value = '';

  document.getElementById('ausencia-gestion-modal').classList.add('open');
}

function cerrarModalGestionAusencia() {
  document.getElementById('ausencia-gestion-modal').classList.remove('open');
}

async function guardarGestionAusencia() {
  const id = document.getElementById('ag-id').value;
  const notaGestion = document.getElementById('ag-nota').value.trim();
  if (!notaGestion) { alert('Escribe la nota de gestión'); return; }

  const token = localStorage.getItem('sesion_token') || '';
  try {
    const res = await fetch(`${API_BASE}/ausencias.php?id=${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'gestionar', nota_gestion: notaGestion }),
    });
    const data = await res.json();
    if (data.error) { alert('⚠️ ' + data.error); return; }
    cerrarModalGestionAusencia();
    await renderAusenciasView();
  } catch (e) {
    console.error(e);
    alert('No se pudo guardar. Revisa la conexión.');
  }
}

// Cierre con clic en backdrop
document.addEventListener('DOMContentLoaded', () => {
  const m1 = document.getElementById('ausencia-modal');
  if (m1) m1.addEventListener('click', e => { if (e.target === m1) cerrarModalAusencia(); });
  const m2 = document.getElementById('ausencia-gestion-modal');
  if (m2) m2.addEventListener('click', e => { if (e.target === m2) cerrarModalGestionAusencia(); });
});
// ===================== FIN MÓDULO AUSENCIAS =====================
