// ===================== MÓDULO IMÁGENES =====================
// Gestión de imágenes adjuntas a tareas.
// - Zona de carga en el modal: clic, drag-drop o pegar (Ctrl+V).
// - Thumbnails en miniatura con lightbox al hacer clic.
// - Subida al servidor y eliminación individual.

let _imgTareaId = null;
let _imgData    = [];

// ─── Carga inicial (llamado desde openModal) ─────────────────────────────────

async function _imagenesCargar(tareaId) {
  _imgTareaId = tareaId || null;
  _imgData    = [];
  _imagenesRenderizar();
  if (!tareaId || !API_BASE) return;
  try {
    const res = await fetch(`${API_BASE}/imagenes.php?tarea_id=${encodeURIComponent(tareaId)}`);
    if (!res.ok) return;
    _imgData = await res.json();
    _imagenesRenderizar();
  } catch (e) {
    console.error('[Imágenes] Error cargando:', e);
  }
}

// ─── Render de la zona ───────────────────────────────────────────────────────

function _imagenesRenderizar() {
  const el = document.getElementById('grp-imagenes');
  if (!el) return;

  const hasThumbs = _imgData.length > 0;

  const thumbsHtml = _imgData.map((img, i) => `
    <div style="position:relative;display:inline-block;flex-shrink:0">
      <img src="${API_BASE}/imagenes.php?id=${img.id}&src=1"
           alt="${esc(img.nombre_original)}"
           onclick="_imagenesLightbox(${i})"
           style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;
                  border:1px solid var(--border);display:block">
      <button type="button" onclick="_imagenesEliminar('${img.id}')"
        title="Eliminar imagen"
        style="position:absolute;top:-7px;right:-7px;width:20px;height:20px;
               border-radius:99px;background:#ef4444;color:#fff;border:none;
               cursor:pointer;font-size:11px;font-weight:700;line-height:1;
               display:flex;align-items:center;justify-content:center;
               box-shadow:0 1px 4px rgba(0,0,0,.25)">✕</button>
    </div>
  `).join('');

  el.innerHTML = `
    <label style="font-size:13px;font-weight:600;color:var(--text-muted);
                  margin-bottom:${hasThumbs ? '10px' : '6px'};display:block">
      🖼️ Imágenes
    </label>

    ${hasThumbs ? `
    <div id="img-thumbnails"
         style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      ${thumbsHtml}
    </div>` : ''}

    <div id="img-dropzone"
         role="button"
         tabindex="0"
         onclick="document.getElementById('img-file-input').click()"
         ondragover="event.preventDefault();this.classList.add('img-dz-over')"
         ondragleave="this.classList.remove('img-dz-over')"
         ondrop="_imagenesOnDrop(event)"
         style="border:2px dashed var(--border,#d1d5db);border-radius:10px;
                padding:14px 12px;text-align:center;cursor:pointer;
                color:var(--text-muted);font-size:13px;transition:background .15s,border-color .15s;
                user-select:none">
      📷 Clic, arrastra imágenes aquí o pega (Ctrl+V)
    </div>
    <input type="file" id="img-file-input" accept="image/*" multiple style="display:none"
           onchange="_imagenesDesdeInput(this)">
    <div id="img-upload-progress"
         style="font-size:12px;color:var(--text-muted);margin-top:6px;min-height:16px"></div>
  `;
}

// ─── Fuentes de imágenes: input, drag-drop, portapapeles ─────────────────────

function _imagenesDesdeInput(input) {
  if (!input.files?.length) return;
  _imagenesSubirArchivos(Array.from(input.files));
  input.value = '';
}

function _imagenesOnDrop(e) {
  e.preventDefault();
  const dz = document.getElementById('img-dropzone');
  if (dz) dz.classList.remove('img-dz-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) _imagenesSubirArchivos(files);
}

// Pegar desde portapapeles (Ctrl+V) mientras el modal de tarea esté abierto
document.addEventListener('paste', function (e) {
  const modal = document.getElementById('modal');
  if (!modal || !modal.classList.contains('open')) return;
  // Para imágenes pegadas desde el portapapeles, incluso en el campo descripción
  const items = Array.from(e.clipboardData?.items || []);
  const imageFiles = items
    .filter(item => item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter(Boolean);
  if (imageFiles.length) {
    e.preventDefault();
    _imagenesSubirArchivos(imageFiles);
  }
});

// ─── Subida ──────────────────────────────────────────────────────────────────

async function _imagenesSubirArchivos(files) {
  if (!_imgTareaId || !API_BASE) {
    alert('Primero guarda la tarea antes de agregar imágenes.');
    return;
  }
  const prog = document.getElementById('img-upload-progress');
  if (prog) prog.textContent = `Subiendo ${files.length} imagen${files.length !== 1 ? 'es' : ''}…`;

  let subidas = 0;
  let primerError = '';
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append('tarea_id', _imgTareaId);
      fd.append('file', file);
      const res  = await fetch(`${API_BASE}/imagenes.php`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.imagen) {
        _imgData.push(data.imagen);
        subidas++;
      } else if (data.error) {
        if (!primerError) primerError = data.error;
        console.error('[Imágenes] Error del servidor:', data.error);
      }
    } catch (e) {
      if (!primerError) primerError = e.message;
      console.error('[Imágenes] Error subiendo archivo:', e);
    }
  }

  // Re-render primero para tener el nuevo DOM
  _imagenesRenderizar();

  // Luego mostrar mensaje en el elemento recién creado
  const progNuevo = document.getElementById('img-upload-progress');
  if (progNuevo) {
    if (subidas > 0) {
      progNuevo.textContent = `✓ ${subidas} imagen${subidas !== 1 ? 'es' : ''} agregada${subidas !== 1 ? 's' : ''}`;
      progNuevo.style.color = '';
    } else {
      progNuevo.textContent = primerError ? `⚠ Error: ${primerError}` : '⚠ No se pudo subir la imagen';
      progNuevo.style.color = '#ef4444';
    }
    setTimeout(() => {
      const p = document.getElementById('img-upload-progress');
      if (p) { p.textContent = ''; p.style.color = ''; }
    }, 5000);
  }
}

// ─── Eliminar ─────────────────────────────────────────────────────────────────

async function _imagenesEliminar(id) {
  if (!API_BASE) return;
  if (!confirm('¿Eliminar esta imagen?')) return;
  try {
    await fetch(`${API_BASE}/imagenes.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    _imgData = _imgData.filter(img => img.id !== id);
    _imagenesRenderizar();
  } catch (e) {
    console.error('[Imágenes] Error eliminando:', e);
  }
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function _imagenesLightbox(idx) {
  const prev = document.getElementById('img-lightbox');
  if (prev) prev.remove();

  const img   = _imgData[idx];
  const total = _imgData.length;

  const box = document.createElement('div');
  box.id = 'img-lightbox';
  box.style.cssText = [
    'position:fixed;inset:0;z-index:950',
    'background:rgba(0,0,0,.88)',
    'display:flex;align-items:center;justify-content:center',
  ].join(';');
  box.addEventListener('click', e => { if (e.target === box) box.remove(); });

  const navPrev = total > 1
    ? `<button type="button" onclick="_imagenesLightbox(${(idx - 1 + total) % total})"
         style="position:absolute;left:12px;top:50%;transform:translateY(-50%);
                width:38px;height:38px;border-radius:99px;background:rgba(255,255,255,.15);
                color:#fff;border:none;cursor:pointer;font-size:22px;
                display:flex;align-items:center;justify-content:center">‹</button>`
    : '';
  const navNext = total > 1
    ? `<button type="button" onclick="_imagenesLightbox(${(idx + 1) % total})"
         style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                width:38px;height:38px;border-radius:99px;background:rgba(255,255,255,.15);
                color:#fff;border:none;cursor:pointer;font-size:22px;
                display:flex;align-items:center;justify-content:center">›</button>`
    : '';

  box.innerHTML = `
    <div style="position:relative;max-width:94vw;max-height:92vh;display:flex;flex-direction:column;align-items:center">
      <img src="${API_BASE}/imagenes.php?id=${img.id}&src=1"
           alt="${esc(img.nombre_original)}"
           style="max-width:90vw;max-height:84vh;object-fit:contain;border-radius:8px;display:block;
                  box-shadow:0 8px 40px rgba(0,0,0,.5)">
      <div style="color:rgba(255,255,255,.65);font-size:12px;margin-top:10px;text-align:center">
        ${esc(img.nombre_original)}${total > 1 ? ` &nbsp;·&nbsp; ${idx + 1} / ${total}` : ''}
      </div>
      <button type="button" onclick="document.getElementById('img-lightbox').remove()"
        style="position:absolute;top:-16px;right:-16px;width:32px;height:32px;
               border-radius:99px;background:#ef4444;color:#fff;border:none;
               cursor:pointer;font-size:15px;font-weight:700;
               display:flex;align-items:center;justify-content:center;
               box-shadow:0 2px 8px rgba(0,0,0,.4)">✕</button>
      ${navPrev}
      ${navNext}
    </div>`;

  document.body.appendChild(box);
}
// ===================== FIN MÓDULO IMÁGENES =====================
