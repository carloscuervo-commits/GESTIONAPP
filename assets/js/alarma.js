// ===================== ALARMA DIARIA (solo admin) =====================
// Recordatorio con sonido + mensaje en pantalla para el administrador,
// de lunes a viernes a una hora fija (hora de Bogotá). Pensado para un PC
// con la app abierta (aunque la pestaña esté en segundo plano).
//
// Nota sobre autoplay: los navegadores bloquean sonido iniciado por
// JavaScript si la página nunca tuvo una interacción del usuario. Como el
// login por PIN ya requiere clics/taps, esa interacción "habilita" el
// audio para el resto de la sesión y el beep debería sonar sin problema.

const ALARMA_HORA = '16:00'; // HH:MM en formato 24h, hora de Bogotá
let _alarmaIniciada = false;
let _alarmaUltimoDisparo = null; // 'YYYY-MM-DD HH:MM' del último disparo (evita repetir en el mismo minuto)
let _alarmaSonidoTimer = null;

function _horaBogota() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const get = tipo => partes.find(p => p.type === tipo)?.value;
  return {
    fecha: `${get('year')}-${get('month')}-${get('day')}`,
    hora: `${get('hour')}:${get('minute')}`,
    diaSemana: get('weekday'), // 'Mon' .. 'Sun'
  };
}

function _esDiaHabilAlarma(diaSemana) {
  return !['Sat', 'Sun'].includes(diaSemana);
}

function _chequearAlarma() {
  if (!currentUser || currentUser.perfil !== 'admin') return;
  const { fecha, hora, diaSemana } = _horaBogota();
  if (hora !== ALARMA_HORA || !_esDiaHabilAlarma(diaSemana)) return;
  const clave = `${fecha} ${hora}`;
  if (_alarmaUltimoDisparo === clave) return; // ya sonó en este minuto
  _alarmaUltimoDisparo = clave;
  dispararAlarma();
}

function iniciarAlarmaChecker() {
  if (_alarmaIniciada) return; // evita duplicar el setInterval si iniciarApp() se llama más de una vez
  _alarmaIniciada = true;
  _chequearAlarma();
  _chequearRetrasoTecnicos(true); // skipFetch=true: usa visitasActivas ya cargado por iniciarApp()
  setInterval(_chequearAlarma, 20000);          // revisión de alarma diaria cada 20s
  setInterval(_chequearRetrasoTecnicos, 60000); // revisión de retrasos cada 60s
}

// ===================== ALERTA DE RETRASO DE TÉCNICOS =====================
// Detecta tarjetas IT/IF programadas para hoy donde la hora de inicio ya
// pasó y el técnico no ha registrado check-in. Dispara sonido urgente,
// muestra modal y envía correo a administrativo (una vez por tarea/sesión).

let _retrasoAlertadas = new Set(); // IDs de tareas ya alertadas en esta sesión

async function _chequearRetrasoTecnicos(skipFetch = false) {
  if (!currentUser || currentUser.perfil !== 'admin') return;
  if (typeof visitasActivas === 'undefined' || typeof tasks === 'undefined') return;

  // Refrescar visitasActivas desde el backend para captar check-ins de otros dispositivos.
  // skipFetch=true en la llamada inicial (evita fetch duplicado al arrancar).
  if (!skipFetch && typeof API_BASE !== 'undefined' && API_BASE) {
    try {
      const enVisita = await fetch(`${API_BASE}/reportes.php?estado=en_visita`).then(r => r.json());
      visitasActivas = {};
      (Array.isArray(enVisita) ? enVisita : []).forEach(r => { visitasActivas[r.tarea_id] = r; });
    } catch(e) { /* silencioso: usa estado anterior */ }
  }

  const { fecha: hoy, hora: horaActual } = _horaBogota();

  const tardias = tasks.filter(t =>
    ['it','if'].includes(t.area) &&
    t.estado === 'programado' &&
    (typeof enRangoProg === 'function' ? enRangoProg(t, hoy) : t.fechaProg === hoy) &&
    t.horaProg &&
    horaActual >= t.horaProg &&
    !visitasActivas[t.id] &&
    !(borradoresActivos[t.id] || []).some(b => (b.check_in || '').substring(0, 10) === hoy)
  );

  // Actualizar banner aunque no haya nuevas alertas
  if (typeof renderAlertasRetraso === 'function') renderAlertasRetraso();

  for (const t of tardias) {
    if (_retrasoAlertadas.has(t.id)) continue; // ya alertada esta sesión
    _retrasoAlertadas.add(t.id);

    _reproducirBeepRetraso();
    _mostrarModalRetraso(t);
    _enviarAlertaRetraso(t.id);
  }
}

function _reproducirBeepRetraso() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Patrón urgente: 5 beeps alternando frecuencia alta/baja
    const tono = (inicio, freq) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.25);
    };
    [0, 0.3, 0.6, 0.9, 1.2].forEach((t, i) => tono(t, i % 2 === 0 ? 1047 : 698));
    setTimeout(() => ctx.close(), 2500);
  } catch (e) { console.error('No se pudo reproducir alarma de retraso', e); }
}

function _mostrarModalRetraso(t) {
  const overlay = document.getElementById('retraso-modal');
  const content = document.getElementById('retraso-modal-content');
  if (!overlay || !content) return;

  const team = (t.team||[]).map(id => getMember(id)?.name || id).join(', ') || 'Sin asignar';
  const item = document.createElement('div');
  item.style.cssText = 'padding:10px 12px;background:#fff5f5;border:1px solid #fecaca;border-radius:8px;font-size:13px';
  item.innerHTML = `${t.cliente ? `<div style="font-size:11px;font-weight:700;color:#169BBC;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:2px">${esc(t.cliente)}</div>` : ''}<strong>${esc(t.titulo)}</strong><br>
    <span style="color:#64748b">👤 ${esc(team)} · 🕗 Programado ${t.horaProg} · 📍 ${t.fechaProg}</span>`;
  content.appendChild(item);
  overlay.classList.add('open');

  // Repetir beep cada 30s mientras el modal esté abierto
  const beepInterval = setInterval(() => {
    if (overlay.classList.contains('open')) _reproducirBeepRetraso();
    else clearInterval(beepInterval);
  }, 30000);
}

async function _enviarAlertaRetraso(tareaId) {
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}/alertas.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tareaId }),
    });
  } catch (e) {
    console.error('Error enviando alerta de retraso:', e);
  }
}

function cerrarRetrasoModal() {
  const overlay = document.getElementById('retraso-modal');
  if (overlay) {
    overlay.classList.remove('open');
    // Limpiar contenido para la siguiente vez
    const content = document.getElementById('retraso-modal-content');
    if (content) content.innerHTML = '';
  }
}
// ===================== FIN ALERTA DE RETRASO =====================

// --------------- Sonido (beep generado con Web Audio API, sin archivos externos) ---------------
function _reproducirBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tono = (inicio) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.4);
    };
    [0, 0.5, 1].forEach(tono); // 3 beeps cortos
    setTimeout(() => ctx.close(), 2000);
  } catch (e) { console.error('No se pudo reproducir la alarma', e); }
}

function dispararAlarma() {
  _reproducirBeep();
  const overlay = document.getElementById('alarma-modal');
  const msg = document.getElementById('alarma-mensaje');
  if (msg) msg.textContent = 'Programar técnicos para mañana';
  if (overlay) overlay.classList.add('open');
  // Repite el beep mientras el aviso siga abierto, hasta que el admin lo cierre
  if (_alarmaSonidoTimer) clearInterval(_alarmaSonidoTimer);
  _alarmaSonidoTimer = setInterval(() => {
    const ov = document.getElementById('alarma-modal');
    if (ov && ov.classList.contains('open')) _reproducirBeep();
    else { clearInterval(_alarmaSonidoTimer); _alarmaSonidoTimer = null; }
  }, 8000);
}

function cerrarAlarma() {
  const overlay = document.getElementById('alarma-modal');
  if (overlay) overlay.classList.remove('open');
  if (_alarmaSonidoTimer) { clearInterval(_alarmaSonidoTimer); _alarmaSonidoTimer = null; }
}
// ===================== FIN ALARMA DIARIA =====================
