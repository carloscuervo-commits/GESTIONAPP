// ============================================================
// configuracion.js  —  Módulo de configuración del sistema (solo admin)
// v20260704k
// ============================================================

(function () {
  // ── Estado local ───────────────────────────────────────────
  let _config = {};         // { clave: '0'|'1' }
  let _guardando = false;

  // ── Entradas del panel Avisos a técnicos ──────────────────
  const AVISOS_TECNICOS = [
    {
      clave: 'aviso_asignacion_tarea',
      label: '📋 Asignación de tarea',
      desc: 'Envía un correo al técnico cuando se le asigna una tarea nueva, con toda la información de la tarjeta.',
    },
    {
      clave: 'aviso_cambio_programacion',
      label: '📅 Cambio de programación',
      desc: 'Envía un correo cuando cambia la fecha o la hora programada de una tarea ya asignada.',
    },
    {
      clave: 'aviso_cambio_descripcion',
      label: '✏️ Cambio de título o descripción',
      desc: 'Envía un correo cuando se edita el título o la descripción de una tarea asignada al técnico.',
    },
    {
      clave: 'aviso_dia_anterior',
      label: '🌙 Resumen del día anterior (5 p.m.)',
      desc: 'Cada día a las 5 p.m., envía al técnico un resumen de sus tareas programadas para el día siguiente. Requiere configurar el cron <code>avisos_dia_anterior.php</code> a las 17:00.',
    },
    {
      clave: 'aviso_30min_antes',
      label: '⏰ Recordatorio 30 min antes',
      desc: 'Envía un correo 30 minutos antes de la hora programada de cada tarea, si el técnico aún no ha hecho check-in. Requiere cron <code>avisos_tiempo.php</code> cada 10 min.',
    },
    {
      clave: 'aviso_10min_sin_checkin',
      label: '⚠️ Sin check-in 10 min después',
      desc: 'Envía un aviso si el técnico no ha registrado llegada 10 minutos después de la hora programada. Requiere cron <code>avisos_tiempo.php</code> cada 10 min.',
    },
  ];

  // ── API ───────────────────────────────────────────────────
  async function fetchConfig() {
    try {
      const res = await fetch('backend/api/configuracion.php');
      _config = await res.json();
    } catch (e) {
      _config = {};
    }
  }

  async function saveToggle(clave, valor) {
    if (_guardando) return;
    _guardando = true;
    try {
      await fetch('backend/api/configuracion.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [clave]: valor }),
      });
      _config[clave] = valor;
      _actualizarEstadoToggle(clave, valor);
    } catch (e) {
      console.error('Error guardando config:', e);
      // Revertir visualmente
      _actualizarEstadoToggle(clave, valor === '1' ? '0' : '1');
    } finally {
      _guardando = false;
    }
  }

  // ── Render principal ──────────────────────────────────────
  async function renderConfiguracion() {
    const el = document.getElementById('configuracion-view');
    if (!el) return;

    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Cargando configuración…</div>';

    await fetchConfig();

    el.innerHTML = `
      <div style="max-width:720px">
        <div style="font-size:20px;font-weight:700;color:var(--teal,#0D3B40);margin-bottom:4px">⚙️ Configuración</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:24px">Solo los administradores pueden ver y modificar esta sección.</div>

        <!-- Sección: Avisos a técnicos -->
        <div style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:10px;overflow:hidden;margin-bottom:20px">
          <div style="padding:16px 20px;border-bottom:1px solid var(--border,#e5e7eb);background:var(--bg,#f8fafc)">
            <div style="font-weight:700;font-size:15px;color:var(--teal,#0D3B40)">📧 Avisos a técnicos</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              Activa o desactiva cada tipo de correo. Los correos se envían al email registrado en el perfil de cada técnico.
            </div>
          </div>
          <div id="cfg-avisos-lista"></div>
        </div>

        <div style="font-size:11px;color:var(--text-muted);padding:0 4px">
          Los cambios se guardan inmediatamente al activar o desactivar cada interruptor.
        </div>
      </div>
    `;

    _renderAvisosList();
  }

  function _renderAvisosList() {
    const lista = document.getElementById('cfg-avisos-lista');
    if (!lista) return;

    lista.innerHTML = AVISOS_TECNICOS.map((item, i) => {
      const activo = (_config[item.clave] ?? '0') === '1';
      const borde  = i < AVISOS_TECNICOS.length - 1
        ? 'border-bottom:1px solid var(--border,#e5e7eb);'
        : '';
      return `
        <div style="padding:14px 20px;${borde}display:flex;gap:14px;align-items:flex-start">
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px;color:var(--text,#1e293b);margin-bottom:2px">${item.label}</div>
            <div style="font-size:12px;color:var(--text-muted,#64748b);line-height:1.5">${item.desc}</div>
          </div>
          <div style="flex-shrink:0;padding-top:2px">
            ${_toggleHtml(item.clave, activo)}
          </div>
        </div>
      `;
    }).join('');
  }

  function _toggleHtml(clave, activo) {
    const on  = activo ? '#169BBC' : '#cbd5e1';
    const tx  = '#ffffff';
    const pos = activo ? '22px' : '2px';
    const label = activo ? 'Activo' : 'Inactivo';
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:60px">
        <button
          id="toggle-${clave}"
          onclick="cfgToggle('${clave}')"
          role="switch"
          aria-checked="${activo}"
          title="${label}"
          style="
            width:46px;height:26px;border-radius:13px;border:none;cursor:pointer;
            background:${on};position:relative;transition:background .2s;
            outline:none;flex-shrink:0;
          ">
          <span style="
            position:absolute;top:${pos === '2px' ? '3px' : '3px'};left:${pos};
            width:20px;height:20px;border-radius:50%;background:${tx};
            transition:left .2s;display:block;box-shadow:0 1px 3px rgba(0,0,0,.2);
          "></span>
        </button>
        <span id="toggle-label-${clave}" style="font-size:10px;color:${activo ? '#169BBC' : 'var(--text-muted)'};font-weight:600">${label}</span>
      </div>
    `;
  }

  function _actualizarEstadoToggle(clave, valor) {
    const activo = valor === '1';
    const btn = document.getElementById(`toggle-${clave}`);
    const lbl = document.getElementById(`toggle-label-${clave}`);
    if (!btn) return;

    btn.style.background = activo ? '#169BBC' : '#cbd5e1';
    btn.setAttribute('aria-checked', String(activo));
    const knob = btn.querySelector('span');
    if (knob) knob.style.left = activo ? '22px' : '2px';
    if (lbl) {
      lbl.textContent = activo ? 'Activo' : 'Inactivo';
      lbl.style.color = activo ? '#169BBC' : 'var(--text-muted)';
    }
  }

  // ── API global para el onclick del HTML ──────────────────
  window.cfgToggle = function (clave) {
    const actual = (_config[clave] ?? '0') === '1';
    const nuevo  = actual ? '0' : '1';
    // Actualizar optimistamente
    _config[clave] = nuevo;
    _actualizarEstadoToggle(clave, nuevo);
    saveToggle(clave, nuevo);
  };

  window.renderConfiguracion = renderConfiguracion;

})();

// ── Panel de Configuración (accessible desde botón ⚙️ del header) ────────────

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    abrirSettings();
  } else {
    cerrarSettings();
  }
}

function abrirSettings() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  panel.style.display = 'block';
  // Renderizar ambas secciones
  if (typeof renderConfiguracion === 'function') renderConfiguracion();
  if (typeof renderUsuariosView  === 'function') renderUsuariosView();
}

function cerrarSettings() {
  const panel = document.getElementById('settings-panel');
  if (panel) panel.style.display = 'none';
}
