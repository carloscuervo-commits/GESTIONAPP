// ===================== ACTIVIDADES INHOUSE (informe admin) =====================
// Informe "🏠 Actividades InHouse" dentro de la pestaña Informes (ver
// informes.js → INFORMES.actividades_inhouse): muestra lo que los técnicos
// in-house fueron reportando día a día (hora de inicio/fin + actividades),
// y permite al admin reabrir un reporte cerrado o borrar una actividad
// puntual o el reporte completo de un día. El técnico mismo llena esto
// desde reporte-diario.html (página aparte, no desde aquí).
//
// Antes vivía en su propia pestaña ("📅 Reportes diarios"); ahora es un
// informe más, para no competir por espacio en la barra de pestañas y
// quedar junto a los demás informes de uso diario.

let _rdaReportes = []; // cache del último fetch, usada por reabrir/eliminar para no repetir la llamada

// Punto de entrada: informes.js llama esto como customAsync(filtros) cuando
// el admin elige "Actividades InHouse" en el dropdown, o cambia los filtros
// de técnico/fecha. Debe devolver el HTML final (string) o una Promise de él.
async function renderActividadesInhouseHTML(filtros) {
  const tablaEl = document.getElementById('informe-tabla');
  if (tablaEl) tablaEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">⏳ Cargando...</div>';

  // Si todavía no se ha elegido rango de fechas (primera vez que se entra a
  // este informe), se usa la última semana por defecto y se refleja en los
  // inputs de fecha compartidos del panel de Informes.
  let desde = filtros.desde, hasta = filtros.hasta;
  if (!desde || !hasta) {
    hasta = hasta || new Date().toISOString().slice(0, 10);
    desde = desde || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const elD = document.getElementById('informe-desde');
    const elH = document.getElementById('informe-hasta');
    if (elD && !elD.value) elD.value = desde;
    if (elH && !elH.value) elH.value = hasta;
  }

  const params = new URLSearchParams({ admin: 1, desde, hasta });
  if (filtros.tecnico) params.set('tecnico_id', filtros.tecnico);

  let data = [];
  try {
    const res = await fetch(`${API_BASE}/reporte_diario.php?${params}`);
    data = await res.json();
  } catch (e) {
    return '<div style="padding:24px;text-align:center;color:#dc2626;font-size:13px">Error cargando datos. Revisa tu conexión.</div>';
  }
  if (data && data.error) {
    return `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">${esc(data.error)}</div>`;
  }

  _rdaReportes = Array.isArray(data) ? data : [];
  return _rdaRenderCardsHTML();
}

function _rdaRenderCardsHTML() {
  if (!_rdaReportes.length) {
    return '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No hay reportes en este rango.</div>';
  }

  return _rdaReportes.map(r => {
    const cerrado = !!Number(r.cerrado);
    const acts = r.actividades || [];
    const actsHtml = acts.length
      ? acts.map(a => `
          <div style="padding:6px 0;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div>
              <div style="font-size:13px">${esc(a.descripcion)}</div>
              <div style="font-size:11px;color:var(--text-muted)">
                ${a.hora_inicio ? `${a.hora_inicio.slice(0,5)} – ${a.hora_fin ? a.hora_fin.slice(0,5) : '?'}` : 'General'}
              </div>
            </div>
            <button class="btn-cancel" style="padding:2px 8px;font-size:11px;flex-shrink:0;color:#c0392b" onclick="_rdaEliminarActividad('${a.id}')" title="Eliminar esta actividad">🗑</button>
          </div>`).join('')
      : '<div style="font-size:12px;color:var(--text-muted);padding:6px 0">Sin actividades registradas.</div>';

    return `
      <div class="card" style="margin:12px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <strong>${esc(r.tecnico_nombre)}</strong>
            <span style="color:var(--text-muted);font-size:13px"> · ${esc(r.cliente_nombre)} · ${r.fecha}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:12px;background:${cerrado ? '#FFF4E0' : '#D6F3F4'};color:${cerrado ? '#8a5a00' : '#0D3B40'};padding:3px 8px;border-radius:99px">
              ${cerrado ? '🔒 Cerrado' : '🟢 En curso'}
            </span>
            ${cerrado ? `<button class="btn-cancel" style="padding:4px 10px;font-size:12px" onclick="_rdaReabrir('${r.tecnico_id}','${r.fecha}')">Reabrir</button>` : ''}
            <button class="btn-cancel" style="padding:4px 10px;font-size:12px;color:#c0392b" onclick="_rdaEliminarReporte('${r.id}')" title="Eliminar todo el reporte de este día">🗑 Eliminar día</button>
          </div>
        </div>
        <div style="margin-top:8px;font-size:13px;color:var(--text-muted)">
          Inicio: <strong>${r.hora_inicio ? r.hora_inicio.slice(0,5) : '—'}</strong>
          &nbsp;·&nbsp; Fin: <strong>${r.hora_fin ? r.hora_fin.slice(0,5) : '—'}</strong>
        </div>
        <div style="margin-top:6px">${actsHtml}</div>
      </div>
    `;
  }).join('');
}

async function _rdaReabrir(tecnicoId, fecha) {
  if (!confirm('¿Reabrir este reporte? El técnico podrá volver a editarlo.')) return;
  try {
    const res = await fetch(`${API_BASE}/reporte_diario.php`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'reabrir', tecnico_id: tecnicoId, fecha }),
    });
    const data = await res.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    recalcularInforme();
  } catch (e) { alert('No se pudo reabrir. Revisa tu conexión.'); }
}

// Borra una actividad puntual, sin importar si el reporte está cerrado
// (el admin puede corregir un dato mal ingresado en cualquier momento).
async function _rdaEliminarActividad(actividadId) {
  if (!confirm('¿Eliminar esta actividad? No se puede deshacer.')) return;
  try {
    const res = await fetch(`${API_BASE}/reporte_diario.php`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar_actividad', actividad_id: actividadId }),
    });
    const data = await res.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    recalcularInforme();
  } catch (e) { alert('No se pudo eliminar. Revisa tu conexión.'); }
}

// Borra el reporte del día completo (jornada + todas sus actividades).
async function _rdaEliminarReporte(reporteId) {
  const r = _rdaReportes.find(x => x.id === reporteId);
  const etiqueta = r ? `${r.tecnico_nombre} del ${r.fecha}` : 'este reporte';
  if (!confirm(`¿Eliminar TODO el reporte de ${etiqueta}? Se borrará la jornada y todas sus actividades. No se puede deshacer.`)) return;
  try {
    const res = await fetch(`${API_BASE}/reporte_diario.php`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar_reporte', reporte_diario_id: reporteId }),
    });
    const data = await res.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    recalcularInforme();
  } catch (e) { alert('No se pudo eliminar. Revisa tu conexión.'); }
}
// ===================== FIN ACTIVIDADES INHOUSE (informe admin) =====================
