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
  setInterval(_chequearAlarma, 20000); // revisa cada 20s
}

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
