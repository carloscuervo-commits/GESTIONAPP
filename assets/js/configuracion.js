// ============================================================
// configuracion.js  —  Módulo de configuración del sistema (solo admin)
// v20260807a
// ============================================================

(function () {
  // ── Estado local ───────────────────────────────────────────
  let _config = {};         // { clave: '0'|'1'|texto }
  let _guardando = false;

  // ── Entradas del panel Avisos a técnicos (correo + Telegram) ─
  const AVISOS_TECNICOS = [
    {
      claveCorreo: 'aviso_asignacion_tarea', claveTelegram: 'aviso_asignacion_tarea_tg',
      label: '📋 Asignación de tarea',
      desc: 'Avisa al técnico cuando se le asigna una tarea nueva, con toda la información de la tarjeta.',
    },
    {
      claveCorreo: 'aviso_cambio_programacion', claveTelegram: 'aviso_cambio_programacion_tg',
      label: '📅 Cambio de programación',
      desc: 'Avisa cuando cambia la fecha o la hora programada de una tarea ya asignada.',
    },
    {
      claveCorreo: 'aviso_cambio_descripcion', claveTelegram: 'aviso_cambio_descripcion_tg',
      label: '✏️ Cambio de título o descripción',
      desc: 'Avisa cuando se edita el título o la descripción de una tarea asignada al técnico.',
    },
    {
      claveCorreo: 'aviso_dia_anterior', claveTelegram: 'aviso_dia_anterior_tg',
      label: '🌙 Resumen del día siguiente (5 p.m.)',
      desc: 'Cada día a las 5 p.m., envía al técnico un resumen de sus tareas programadas para el día siguiente. Requiere cron <code>avisos_dia_anterior.php</code> a las 17:00.',
    },
    {
      claveCorreo: 'aviso_30min_antes', claveTelegram: 'aviso_30min_antes_tg',
      label: '⏰ Recordatorio 30 min antes',
      desc: '30 minutos antes de la hora programada de cada tarea, si el técnico aún no ha hecho check-in. Requiere cron <code>avisos_tiempo.php</code> cada 10 min.',
    },
    {
      claveCorreo: 'aviso_10min_sin_checkin', claveTelegram: 'aviso_10min_sin_checkin_tg',
      label: '⚠️ Sin check-in 10 min después',
      desc: 'Si el técnico no ha registrado llegada 10 minutos después de la hora programada. Requiere cron <code>avisos_tiempo.php</code> cada 10 min.',
    },
    {
      claveCorreo: 'aviso_retraso_admin', claveTelegram: 'aviso_retraso_admin_tg',
      label: '🚨 Técnico tardío (a administradores)',
      desc: 'Aviso en tiempo real a administradores cuando un técnico no ha hecho check-in pasada la hora programada. El correo viene activo por defecto (ya existía antes de este panel).',
    },
    {
      claveCorreo: 'aviso_sin_reporte', claveTelegram: 'aviso_sin_reporte_tg',
      label: '🚫 Visita sin reporte enviado',
      desc: 'Avisa al técnico cuando cierra una visita sin enviar el reporte.',
    },
    {
      claveCorreo: 'aviso_fuera_sitio', claveTelegram: 'aviso_fuera_sitio_tg',
      label: '📍 Check fuera del radio del cliente',
      desc: 'Avisa a administradores cuando un técnico hace check-in o checkout fuera del radio permitido del cliente.',
    },
    {
      claveCorreo: 'aviso_bitacora_deficit', claveTelegram: 'aviso_bitacora_deficit_tg',
      label: '⏱ Déficit de horario (bitácora)',
      desc: 'Avisa al técnico cuando el día anterior no cumplió su horario esperado. Requiere cron <code>bitacora_deficit.php</code> a las 23:00.',
    },
    {
      claveCorreo: 'aviso_visitas_colgadas', claveTelegram: 'aviso_visitas_colgadas_tg',
      label: '🕓 Visitas en curso de días anteriores',
      desc: 'Avisa a cada técnico (y a administradores con el listado completo) de visitas que quedaron sin checkout el mismo día. Requiere cron <code>avisos_visitas_colgadas.php</code> por la mañana.',
    },
    {
      claveCorreo: 'aviso_horas_contrato', claveTelegram: 'aviso_horas_contrato_tg',
      label: '📉 Horas de contrato por agotarse',
      desc: 'Avisa a administradores cuando a un cliente con contrato le quedan pocas horas disponibles en el mes (umbral configurable abajo).',
    },
    {
      claveCorreo: 'aviso_checkout_auto', claveTelegram: 'aviso_checkout_auto_tg',
      label: '⏰ Aviso antes del checkout automático',
      desc: 'Avisa al técnico ~1h antes de la hora de corte (configurable abajo) si tiene visitas sin cerrar hoy. Requiere cron <code>aviso_checkout_automatico.php</code>. El checkout automático en sí (cron <code>checkout_automatico.php</code>) y el resumen a administradores siempre corren, sin importar este interruptor.',
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

  async function saveTexto(clave, valor) {
    try {
      await fetch('backend/api/configuracion.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [clave]: valor }),
      });
      _config[clave] = valor;
    } catch (e) {
      console.error('Error guardando config:', e);
    }
  }

  // ── Render principal ──────────────────────────────────────
  async function renderConfiguracion() {
    const el = document.getElementById('configuracion-view');
    if (!el) return;

    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Cargando configuración…</div>';

    await fetchConfig();

    const umbralHoras   = _config['horas_contrato_umbral'] ?? '2';
    const horaCorteAuto = _config['checkout_auto_hora']    ?? '18:30';

    el.innerHTML = `
      <div style="max-width:760px">
        <div style="font-size:20px;font-weight:700;color:var(--teal,#0D3B40);margin-bottom:4px">⚙️ Configuración</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:24px">Solo los administradores pueden ver y modificar esta sección.</div>

        <!-- Sección: Avisos a técnicos -->
        <div style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:10px;overflow:hidden;margin-bottom:20px">
          <div style="padding:16px 20px;border-bottom:1px solid var(--border,#e5e7eb);background:var(--bg,#f8fafc)">
            <div style="font-weight:700;font-size:15px;color:var(--teal,#0D3B40)">🔔 Avisos a técnicos</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              Activa o desactiva cada aviso por canal. El correo se envía al email del perfil; Telegram requiere que el técnico (o administrador) tenga configurado su "Telegram Chat ID" en Usuarios.
            </div>
          </div>
          <div style="padding:10px 20px;display:flex;align-items:center;border-bottom:1px solid var(--border,#e5e7eb);background:var(--bg,#f8fafc)">
            <div style="flex:1"></div>
            <div style="width:64px;text-align:center;font-size:11px;font-weight:700;color:var(--text-muted)">📧 Correo</div>
            <div style="width:64px;text-align:center;font-size:11px;font-weight:700;color:var(--text-muted)">✈️ Telegram</div>
          </div>
          <div id="cfg-avisos-lista"></div>
          <div style="padding:14px 20px;border-top:1px solid var(--border,#e5e7eb);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:220px">
              <div style="font-weight:600;font-size:13px;color:var(--text,#1e293b)">🔢 Umbral de horas de contrato</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Se avisa cuando a un cliente le quedan estas horas o menos disponibles en el mes. Aplica igual a todos los contratos.</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="number" id="cfg-horas-umbral" min="0" step="0.5" value="${esc(String(umbralHoras))}"
                style="width:70px;padding:7px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;text-align:center"
                onchange="cfgGuardarUmbralHoras(this.value)">
              <span style="font-size:13px;color:var(--text-muted)">horas</span>
            </div>
          </div>
          <div style="padding:14px 20px;border-top:1px solid var(--border,#e5e7eb);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:220px">
              <div style="font-weight:600;font-size:13px;color:var(--text,#1e293b)">🤖 Hora de corte — checkout automático</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">A esta hora, Ginno cierra automáticamente cualquier visita del día que siga sin checkout (tomando 1h después del check-in como hora trabajada). Este campo solo controla el texto del aviso previo — para cambiar la hora real de ejecución hay que ajustar también el cron <code>checkout_automatico.php</code> en cPanel.</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="time" id="cfg-hora-corte-auto" value="${esc(horaCorteAuto)}"
                style="padding:7px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;text-align:center"
                onchange="cfgGuardarHoraCorteAuto(this.value)">
            </div>
          </div>
        </div>

        <div style="font-size:11px;color:var(--text-muted);padding:0 4px">
          Los cambios se guardan inmediatamente al activar o desactivar cada interruptor, o al salir del campo de horas.
        </div>
      </div>
    `;

    _renderAvisosList();
  }

  function _renderAvisosList() {
    const lista = document.getElementById('cfg-avisos-lista');
    if (!lista) return;

    lista.innerHTML = AVISOS_TECNICOS.map((item, i) => {
      const activoCorreo = (_config[item.claveCorreo] ?? '0') === '1';
      const activoTg     = (_config[item.claveTelegram] ?? '0') === '1';
      const borde  = i < AVISOS_TECNICOS.length - 1
        ? 'border-bottom:1px solid var(--border,#e5e7eb);'
        : '';
      return `
        <div style="padding:14px 20px;${borde}display:flex;gap:10px;align-items:center">
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px;color:var(--text,#1e293b);margin-bottom:2px">${item.label}</div>
            <div style="font-size:12px;color:var(--text-muted,#64748b);line-height:1.5">${item.desc}</div>
          </div>
          <div style="width:64px;display:flex;justify-content:center">
            ${_toggleHtml(item.claveCorreo, activoCorreo)}
          </div>
          <div style="width:64px;display:flex;justify-content:center">
            ${_toggleHtml(item.claveTelegram, activoTg)}
          </div>
        </div>
      `;
    }).join('');
  }

  function _toggleHtml(clave, activo) {
    const on  = activo ? '#169BBC' : '#cbd5e1';
    const tx  = '#ffffff';
    const pos = activo ? '22px' : '2px';
    return `
      <button
        id="toggle-${clave}"
        onclick="cfgToggle('${clave}')"
        role="switch"
        aria-checked="${activo}"
        title="${activo ? 'Activo' : 'Inactivo'}"
        style="
          width:40px;height:24px;border-radius:12px;border:none;cursor:pointer;
          background:${on};position:relative;transition:background .2s;
          outline:none;flex-shrink:0;
        ">
        <span style="
          position:absolute;top:2px;left:${pos};
          width:20px;height:20px;border-radius:50%;background:${tx};
          transition:left .2s;display:block;box-shadow:0 1px 3px rgba(0,0,0,.2);
        "></span>
      </button>
    `;
  }

  function _actualizarEstadoToggle(clave, valor) {
    const activo = valor === '1';
    const btn = document.getElementById(`toggle-${clave}`);
    if (!btn) return;

    btn.style.background = activo ? '#169BBC' : '#cbd5e1';
    btn.setAttribute('aria-checked', String(activo));
    btn.title = activo ? 'Activo' : 'Inactivo';
    const knob = btn.querySelector('span');
    if (knob) knob.style.left = activo ? '22px' : '2px';
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

  window.cfgGuardarUmbralHoras = function (valor) {
    const num = parseFloat(valor);
    const final = isNaN(num) || num < 0 ? '2' : String(num);
    saveTexto('horas_contrato_umbral', final);
  };

  window.cfgGuardarHoraCorteAuto = function (valor) {
    const final = /^\d{2}:\d{2}$/.test(valor) ? valor : '18:30';
    saveTexto('checkout_auto_hora', final);
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
