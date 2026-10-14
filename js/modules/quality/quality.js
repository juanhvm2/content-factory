// quality.js
// Módulo Control de Calidad y Entrega.
// Tablero kanban con piezas por estado: Borrador, Pendiente, Aprobado, Listo, Exportado.

import * as store from '../../core/store.js?v=48';
import { cleanupOldItems } from '../../services/cleanup-service.js?v=48';

const state = {
  pieces: [],
  filterFormat: 'all',
  filterBrand: 'all',
  search: '',
  selected: new Set(), // IDs de piezas seleccionadas
};

// Estados posibles de una pieza
const PIECE_STATES = [
  { id: 'draft',          label: 'Borrador',  icon: '📝', color: 'var(--text-3)' },
  { id: 'pending_review', label: 'Pendiente', icon: '⏳', color: 'var(--warning)' },
  { id: 'approved',       label: 'Aprobado',  icon: '✅', color: 'var(--info)' },
  { id: 'ready',          label: 'Listo',     icon: '📦', color: 'var(--success)' },
  { id: 'exported',       label: 'Exportado', icon: '📤', color: 'var(--factory)' },
];

// --- Cargar piezas desde la base ---
async function loadPieces() {
  const all = await store.getAll('pieces');
  state.pieces = all.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt).getTime();
    const tb = new Date(b.updatedAt || b.createdAt).getTime();
    return tb - ta;
  });
  console.log(`[quality] ${state.pieces.length} piezas en inventario`);
}

// --- Filtrar ---
function filterPieces() {
  return state.pieces.filter((p) => {
    if (state.filterFormat !== 'all' && p.format !== state.filterFormat) return false;
    if (state.filterBrand !== 'all' && p.brand !== state.filterBrand) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const haystack = (p.newsTitle || '').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// --- Escapar HTML ---
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Fecha relativa ---
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'ahora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

// --- Renderizar el kanban completo ---
function renderKanban() {
  const container = document.getElementById('quality-kanban');
  if (!container) return;

  const filtered = filterPieces();

  // Contar por estado
  const counts = {};
  PIECE_STATES.forEach((s) => (counts[s.id] = 0));
  filtered.forEach((p) => {
    const st = p.state || 'draft';
    if (counts[st] != null) counts[st]++;
  });

  // Actualizar badges del header
  PIECE_STATES.forEach((s) => {
    const el = document.getElementById(`quality-badge-${s.id}`);
    if (el) el.textContent = counts[s.id] || 0;
  });

  const totalEl = document.getElementById('quality-total');
  if (totalEl) totalEl.textContent = `${filtered.length} piezas`;

  // Armar columnas
  container.innerHTML = PIECE_STATES.map((s) => {
    const items = filtered.filter((p) => (p.state || 'draft') === s.id);
    return `
      <div class="quality-column" data-state="${s.id}">
        <div class="quality-column-header" style="--col-color:${s.color}">
          <span class="quality-column-icon">${s.icon}</span>
          <span class="quality-column-title">${s.label}</span>
          <span class="quality-column-count" id="quality-badge-${s.id}">${items.length}</span>
        </div>
        <div class="quality-column-body">
          ${items.length === 0
            ? `<div class="quality-column-empty">Sin piezas</div>`
            : items.map((p) => renderPieceCard(p)).join('')}
        </div>
      </div>
          </div>
    `;
  }).join('');

    // Bindear clicks de las acciones
  container.querySelectorAll('.quality-action-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleAction(btn.dataset.action, btn.dataset.id);
    });
  });

  // Bindear clicks de los checkboxes
  container.querySelectorAll('.quality-card-check').forEach((chk) => {
    chk.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = chk.dataset.id;
      if (chk.checked) {
        state.selected.add(id);
      } else {
        state.selected.delete(id);
      }
      updateSelectionBar();
      // Actualizar la clase is-selected en la tarjeta
      const card = chk.closest('.quality-card');
      if (card) card.classList.toggle('is-selected', chk.checked);
    });
  });

  // Click en la tarjeta (fuera de checkbox y botones) → abrir modal
  container.querySelectorAll('.quality-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.quality-card-check')) return;
      if (e.target.closest('.quality-action-btn')) return;
      openPiecePreview(card.dataset.id);
    });
  });

  // Refrescar barra de selección
  updateSelectionBar();
}

// --- Barra de selección (placeholder por ahora) ---
function updateSelectionBar() {
  const bar = document.getElementById('quality-selection-bar');
  if (!bar) return;

  const count = state.selected.size;
  if (count === 0) {
    bar.classList.remove('is-active');
    return;
  }
  bar.classList.add('is-active');
  bar.querySelector('.quality-selection-count').textContent =
    `${count} ${count === 1 ? 'pieza' : 'piezas'} seleccionada${count === 1 ? '' : 's'}`;
}

// --- Abre el modal de preview de una pieza ---
async function openPiecePreview(pieceId) {
  const piece = await store.get('pieces', pieceId);
  if (!piece) return;

  const modal = document.getElementById('quality-preview-modal');
  if (!modal) return;

  // Guardar el ID actual en el modal para las acciones
  modal.dataset.pieceId = pieceId;

  // Título
  const titleEl = document.getElementById('quality-preview-title');
  if (titleEl) titleEl.textContent = piece.newsTitle || 'Pieza sin título';

  // Imagen
  const imgEl = document.getElementById('quality-preview-image');
  if (imgEl) {
    const src = piece.renderDataUrl || piece.thumbDataUrl || piece.newsImage || '';
    if (src) {
      imgEl.src = src;
      imgEl.style.display = 'block';
    } else {
      imgEl.removeAttribute('src');
      imgEl.style.display = 'none';
    }
  }

  // Info
  const infoEl = document.getElementById('quality-preview-info');
  if (infoEl) {
    const brandLabel = piece.brand === 'express' ? 'Random Express' : 'Random';
    const formatLabel = piece.formatLabel || piece.format || '—';
    const stateLabel = {
      draft: 'Borrador',
      pending_review: 'Pendiente',
      approved: 'Aprobado',
      ready: 'Listo',
      exported: 'Exportado',
      discarded: 'Descartado',
    }[piece.state] || piece.state;
    const createdStr = piece.createdAt
      ? new Date(piece.createdAt).toLocaleString('es-AR', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '—';

    infoEl.innerHTML = `
      <div class="info-item">
        <span class="info-label">Brand</span>
        <span class="info-value">${brandLabel}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Formato</span>
        <span class="info-value">${formatLabel}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Estado</span>
        <span class="info-value">${stateLabel}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Creada</span>
        <span class="info-value">${createdStr}</span>
      </div>
    `;
  }

  // Mostrar el modal
  modal.classList.add('is-active');
}

// --- Cierra el modal de preview ---
function closePiecePreview() {
  const modal = document.getElementById('quality-preview-modal');
  if (modal) {
    modal.classList.remove('is-active');
    delete modal.dataset.pieceId;
  }
}

// --- Botones de acción según estado ---
function getActionsForState(piece) {
  const s = piece.state || 'draft';
  const btns = [];

  if (s === 'draft') {
    btns.push(`<button class="quality-action-btn quality-action-approve" data-action="approve" data-id="${piece.id}">✅ Aprobar</button>`);
    btns.push(`<button class="quality-action-btn quality-action-discard" data-action="discard" data-id="${piece.id}">🗑️ Descartar</button>`);
  } else if (s === 'pending_review') {
    btns.push(`<button class="quality-action-btn quality-action-approve" data-action="approve" data-id="${piece.id}">✅ Aprobar</button>`);
    btns.push(`<button class="quality-action-btn quality-action-back" data-action="back" data-id="${piece.id}">↩️ Devolver</button>`);
    btns.push(`<button class="quality-action-btn quality-action-discard" data-action="discard" data-id="${piece.id}">🗑️</button>`);
  } else if (s === 'approved') {
    btns.push(`<button class="quality-action-btn quality-action-approve" data-action="approve" data-id="${piece.id}">📦 Mover a Listo</button>`);
    btns.push(`<button class="quality-action-btn quality-action-back" data-action="back" data-id="${piece.id}">↩️ Devolver</button>`);
  } else if (s === 'ready') {
    btns.push(`<button class="quality-action-btn quality-action-approve" data-action="download" data-id="${piece.id}">⬇️ Descargar</button>`);
    btns.push(`<button class="quality-action-btn quality-action-back" data-action="back" data-id="${piece.id}">↩️</button>`);
  } else if (s === 'exported') {
    btns.push(`<button class="quality-action-btn quality-action-back" data-action="back" data-id="${piece.id}">↩️ Volver</button>`);
  }

  // Eliminar siempre disponible
  btns.push(`<button class="quality-action-btn quality-action-delete" data-action="delete" data-id="${piece.id}" title="Eliminar">✕</button>`);

  return btns.join('');
}

// --- Tarjeta de pieza ---
function renderPieceCard(piece) {
  const brandLabel = piece.brand === 'express' ? 'Random Express' : 'Random';
  const brandClass = piece.brand === 'express' ? 'quality-brand-express' : 'quality-brand-random';
  const formatLabel = {
    post: 'Post',
    story: 'Historia',
    stories: 'Historias',
    carousel: 'Carrusel',
  }[piece.format] || piece.format;

  const thumbUrl = piece.thumbDataUrl || piece.newsImage || null;
  const thumb = thumbUrl
    ? `<img src="${thumbUrl}" alt="" loading="lazy" onerror="this.style.opacity='0.3';">`
    : `<div class="quality-card-thumb-placeholder">🏭</div>`;

    const actions = getActionsForState(piece);
  const isSelected = state.selected.has(piece.id);

  return `
    <div class="quality-card ${isSelected ? 'is-selected' : ''}" data-id="${piece.id}">
      <div class="quality-card-thumb">
        <input type="checkbox" class="quality-card-check" data-id="${piece.id}" ${isSelected ? 'checked' : ''}>
        ${thumb}
      </div>
      <div class="quality-card-body">
        <div class="quality-card-brand ${brandClass}">${brandLabel}</div>
        <div class="quality-card-title">${escapeHtml((piece.newsTitle || 'Sin título').slice(0, 80))}</div>
        <div class="quality-card-meta">
          <span class="quality-card-format">${formatLabel}</span>
          <span class="quality-card-time">${timeAgo(piece.updatedAt || piece.createdAt)}</span>
        </div>
        <div class="quality-card-actions">${actions}</div>
      </div>
    </div>
  `;
}

// --- UI base ---
function injectQualityUI() {
  const view = document.querySelector('.module-view[data-module-view="quality"]');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';

  view.innerHTML = `
    <div class="module-header">
      <div>
        <h2>Control de Calidad y Entrega</h2>
        <p class="module-subtitle">Inspección, inventario y despacho de piezas terminadas.</p>
      </div>
            <div class="module-header-actions">
        <span class="badge-count" id="quality-total">0 piezas</span>
        <button class="btn btn-sm btn-cleanup" id="quality-cleanup" title="Limpiar piezas viejas">🧹 Limpiar</button>
      </div>
    </div>

    <div class="forest-toolbar">
      <div class="region-tabs" id="quality-formats">
        <button class="region-btn is-active" data-format="all">Todos</button>
        <button class="region-btn" data-format="post">Post</button>
        <button class="region-btn" data-format="story">Historia</button>
        <button class="region-btn" data-format="stories">Historias</button>
        <button class="region-btn" data-format="carousel">Carrusel</button>
      </div>
      <div class="region-tabs" id="quality-brands">
        <button class="region-btn is-active" data-brand="all">Todos</button>
        <button class="region-btn" data-brand="random">Random</button>
        <button class="region-btn" data-brand="express">Random Express</button>
      </div>
      <input type="text" id="quality-search" class="forest-search" placeholder="Buscar por noticia…" />
    </div>

        <div class="quality-kanban" id="quality-kanban">
      <div class="quality-empty">Cargando…</div>
    </div>

        <div class="quality-selection-bar" id="quality-selection-bar">
      <span class="quality-selection-count">0 piezas seleccionadas</span>
      <div class="quality-selection-actions">
        <button class="btn btn-sm btn-primary" id="quality-download-zip">📦 Descargar ZIP</button>
        <button class="btn btn-sm" id="quality-discard-selected">🗑️ Descartar</button>
        <button class="btn btn-sm" id="quality-clear-selection">✕ Cancelar</button>
      </div>
    </div>

    <!-- Modal de preview de pieza -->
    <div class="quality-preview-overlay" id="quality-preview-modal">
      <div class="quality-preview-dialog">
        <div class="quality-preview-header">
          <h3 id="quality-preview-title">Pieza</h3>
          <button class="quality-preview-close" id="quality-preview-close">×</button>
        </div>
        <div class="quality-preview-body">
          <div class="quality-preview-image-wrap">
            <img id="quality-preview-image" src="" alt="">
          </div>
          <div class="quality-preview-info" id="quality-preview-info"></div>
        </div>
        <div class="quality-preview-footer">
          <button class="btn btn-sm" id="quality-preview-back">↩️ Devolver</button>
          <button class="btn btn-sm" id="quality-preview-discard">🗑️ Descartar</button>
          <button class="btn btn-sm quality-action-approve" id="quality-preview-approve">✅ Aprobar</button>
          <button class="btn btn-sm btn-primary" id="quality-preview-download">⬇️ Descargar</button>
        </div>
      </div>
    </div>
  `;

     setupFilters();
  setupCleanupButton();
  setupPreviewModal();
}

// --- Configuración del modal de preview ---
function setupPreviewModal() {
  const modal = document.getElementById('quality-preview-modal');
  if (!modal) return;

  // Cerrar con el botón ×
  document.getElementById('quality-preview-close')?.addEventListener('click', () => {
    closePiecePreview();
  });

  // Cerrar al hacer clic en el fondo (fuera del dialog)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePiecePreview();
  });

    // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-active')) {
      closePiecePreview();
    }
  });

  // Botones de acción
  document.getElementById('quality-preview-approve')?.addEventListener('click', async () => {
    const id = modal.dataset.pieceId;
    if (!id) return;
    await handleAction('approve', id);
    closePiecePreview();
  });

  document.getElementById('quality-preview-back')?.addEventListener('click', async () => {
    const id = modal.dataset.pieceId;
    if (!id) return;
    await handleAction('back', id);
    closePiecePreview();
  });

  document.getElementById('quality-preview-discard')?.addEventListener('click', async () => {
    const id = modal.dataset.pieceId;
    if (!id) return;
    await handleAction('discard', id);
    closePiecePreview();
  });

  document.getElementById('quality-preview-download')?.addEventListener('click', async () => {
    const id = modal.dataset.pieceId;
    if (!id) return;
    await handleDownloadSingle(id);
  });
}

// --- Descargar una pieza individual como JPG ---
async function handleDownloadSingle(pieceId) {
  const piece = await store.get('pieces', pieceId);
  if (!piece) {
    alert('Pieza no encontrada.');
    return;
  }

  // Fuente de la imagen: preferimos thumbDataUrl (render exacto), si no, newsImage
  const imageSrc = piece.renderDataUrl || piece.thumbDataUrl || piece.newsImage || null;

  if (!imageSrc) {
    alert('Esta pieza no tiene imagen asociada para descargar.');
    return;
  }

  // Nombre de archivo seguro
  const brand = piece.brand === 'express' ? 'express' : 'random';
  const format = piece.format || 'pieza';
  const safeName = (piece.newsTitle || 'sin-titulo')
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ]+/gi, '_')
    .slice(0, 40);
  const slideSuffix = piece.totalSlides > 1 ? `_slide${(piece.slideIndex || 0) + 1}` : '';
  const fileName = `${brand}_${format}${slideSuffix}_${safeName}.jpg`;

  try {
    // Descargar la imagen como blob
    let blob;
    if (imageSrc.startsWith('data:')) {
      // Es un data URL (thumbDataUrl) → convertir directo
      blob = dataUrlToBlob(imageSrc);
    } else {
      // Es una URL externa → fetchear como blob
      const res = await fetch(imageSrc, { mode: 'cors' });
      if (!res.ok) throw new Error('No se pudo descargar la imagen');
      blob = await res.blob();
    }

    // Disparar la descarga
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    // Cambiar estado a "exported"
    await store.set('pieces', pieceId, {
      ...piece,
      state: 'exported',
      exportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`[quality] Pieza descargada y marcada como exportada: ${pieceId}`);

    // Refrescar el kanban (la tarjeta se mueve a Exportado)
    await refreshQuality();
    closePiecePreview();
  } catch (err) {
    console.error('[quality] Error descargando pieza', err);
    // Fallback: si falla el fetch por CORS, abrimos la URL en pestaña nueva
    if (!imageSrc.startsWith('data:')) {
      const ok = confirm(
        'No se pudo descargar automáticamente (CORS).\n\n¿Abrir la imagen en una pestaña nueva para descargarla manualmente?'
      );
      if (ok) window.open(imageSrc, '_blank', 'noopener');
    } else {
      alert('Error al descargar: ' + err.message);
    }
  }
}

// --- Convierte un data URL a Blob ---
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mime });
}

// --- Botón de limpieza manual ---
function setupCleanupButton() {
  const btn = document.getElementById('quality-cleanup');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await handleCleanupClick();
  });
}

async function handleCleanupClick() {
  const btn = document.getElementById('quality-cleanup');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Analizando…';

  try {
    const preview = await cleanupOldItems({ dryRun: true });

    btn.disabled = false;
    btn.innerHTML = originalText;

    if (preview.workItems === 0 && preview.pieces === 0) {
      alert('No hay elementos viejos para limpiar. Todo está al día.');
      return;
    }

    const lines = [];
    if (preview.pieces > 0) lines.push(`• ${preview.pieces} piezas de Calidad`);
    if (preview.workItems > 0) lines.push(`• ${preview.workItems} trabajos del Galpón`);

    const msg = `🧹 Limpieza automática\n\nSe van a borrar:\n${lines.join('\n')}\n\n¿Confirmás?`;

    if (!confirm(msg)) return;

    btn.disabled = true;
    btn.innerHTML = '⏳ Limpiando…';
    const result = await cleanupOldItems({ dryRun: false });

    // Refrescar este módulo
    await refreshQuality();

    // Refrescar Galpón también (por si borró workItems)
    try {
      const warehouseMod = await import('../warehouse/warehouse.js?v=48');
      await warehouseMod.refresh();
    } catch (e) {
      console.warn('[quality] No se pudo refrescar Galpón', e);
    }

    const parts = [];
    if (result.pieces > 0) parts.push(`${result.pieces} piezas`);
    if (result.workItems > 0) parts.push(`${result.workItems} trabajos`);
    alert(`✅ Limpieza completa.\n\nBorrados: ${parts.join(' y ')}`);

    btn.innerHTML = '✅ Listo';
    setTimeout(() => (btn.innerHTML = originalText), 2000);
  } catch (err) {
    console.error('[quality] Error en limpieza', err);
    alert('Error al limpiar: ' + err.message);
    btn.innerHTML = '❌ Error';
    setTimeout(() => (btn.innerHTML = originalText), 2000);
  } finally {
    btn.disabled = false;
  }
}

// --- Filtros ---
function setupFilters() {
  document.querySelectorAll('#quality-formats .region-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterFormat = btn.dataset.format;
      document.querySelectorAll('#quality-formats .region-btn').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      renderKanban();
    });
  });

  document.querySelectorAll('#quality-brands .region-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterBrand = btn.dataset.brand;
      document.querySelectorAll('#quality-brands .region-btn').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      renderKanban();
    });
  });

    document.getElementById('quality-search')?.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderKanban();
  });

    // Barra de selección: botón Cancelar
  document.getElementById('quality-clear-selection')?.addEventListener('click', () => {
    state.selected.clear();
    updateSelectionBar();
    renderKanban();
  });

    // Barra de selección: botón Descartar
  document.getElementById('quality-discard-selected')?.addEventListener('click', async () => {
    await handleDiscardSelected();
  });

  // Barra de selección: botón Descargar ZIP
  document.getElementById('quality-download-zip')?.addEventListener('click', async () => {
    await handleDownloadSelected();
  });
}

// --- Descargar piezas seleccionadas en ZIP ---
async function handleDownloadSelected() {
  const ids = Array.from(state.selected);
  if (ids.length === 0) return;

  // Verificar que JSZip esté cargado
  if (typeof JSZip === 'undefined') {
    alert('JSZip no está cargado. Verificá que index.html lo incluya.');
    return;
  }

  const ok = confirm(
    `¿Descargar ${ids.length} pieza${ids.length === 1 ? '' : 's'} como ZIP?\n\nAl descargar, pasarán al estado "Exportado".`
  );
  if (!ok) return;

  const btn = document.getElementById('quality-download-zip');
  const originalText = btn ? btn.innerHTML : '📦 Descargar ZIP';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ Generando ZIP (0/${ids.length})…`;
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder('revista_random_piezas');
    const summary = { downloaded: 0, failed: 0, exported: [] };
    const usedNames = new Set(); // para evitar colisiones

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const piece = await store.get('pieces', id);
      if (!piece) {
        summary.failed++;
        continue;
      }

      // Actualizar progreso
      if (btn) btn.innerHTML = `⏳ Generando ZIP (${i + 1}/${ids.length})…`;

      // Fuente de la imagen: renderDataUrl > thumbDataUrl > newsImage
      const imageSrc =
        piece.renderDataUrl || piece.thumbDataUrl || piece.newsImage || null;

      if (!imageSrc) {
        summary.failed++;
        console.warn(`[quality] Pieza sin imagen, se omite: ${id}`);
        continue;
      }

      try {
        // Nombre de archivo seguro
        const brand = piece.brand === 'express' ? 'express' : 'random';
        const format = piece.format || 'pieza';
        const safeName = (piece.newsTitle || 'sin-titulo')
          .toLowerCase()
          .replace(/[^a-z0-9áéíóúñ]+/gi, '_')
          .slice(0, 40);
        const slideSuffix =
          piece.totalSlides > 1 ? `_slide${(piece.slideIndex || 0) + 1}` : '';
        let baseName = `${brand}_${format}${slideSuffix}_${safeName}`;

        // Evitar colisiones agregando un sufijo numérico
        let finalName = baseName + '.jpg';
        let counter = 2;
        while (usedNames.has(finalName)) {
          finalName = `${baseName}_${counter}.jpg`;
          counter++;
        }
        usedNames.add(finalName);

        // Obtener base64 (JSZip acepta base64 directo)
        let base64;
        if (imageSrc.startsWith('data:')) {
          base64 = imageSrc.split(',')[1];
        } else {
          // Es una URL externa → fetchear
          const res = await fetch(imageSrc, { mode: 'cors' });
          if (!res.ok) throw new Error('fetch HTTP ' + res.status);
          const blob = await res.blob();
          base64 = await blobToBase64(blob);
        }

        folder.file(finalName, base64, { base64: true });
        summary.downloaded++;

        // Marcar como exportada
        await store.set('pieces', id, {
          ...piece,
          state: 'exported',
          exportedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        summary.exported.push(id);
      } catch (err) {
        console.warn(`[quality] Error procesando ${id}:`, err);
        summary.failed++;
      }
    }

    if (summary.downloaded === 0) {
      throw new Error('No se pudo procesar ninguna pieza.');
    }

    // Metadata
    folder.file(
      'metadata.json',
      JSON.stringify(
        {
          generado: new Date().toISOString(),
          total: summary.downloaded,
          fallidos: summary.failed,
          piezas: summary.exported,
        },
        null,
        2
      )
    );

    // Generar el ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Disparar la descarga
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revista_random_${summary.downloaded}_piezas_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    console.log(
      `[quality] ZIP generado: ${summary.downloaded} piezas, ${summary.failed} fallidas`
    );

    // Limpiar selección y refrescar
    state.selected.clear();
    await refreshQuality();

    if (summary.failed > 0) {
      alert(
        `✅ ZIP generado con ${summary.downloaded} piezas.\n\n⚠️ ${summary.failed} piezas no se pudieron descargar (ver consola).`
      );
    }
  } catch (err) {
    console.error('[quality] Error generando ZIP', err);
    alert('Error al generar el ZIP: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
    updateSelectionBar();
  }
}

// --- Convierte un Blob a Base64 (sin el prefijo data:) ---
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// --- Descartar todas las piezas seleccionadas ---
async function handleDiscardSelected() {
  const ids = Array.from(state.selected);
  if (ids.length === 0) return;

  const ok = confirm(
    `¿Descartar ${ids.length} pieza${ids.length === 1 ? '' : 's'}?\n\nSe moverán al estado "Descartado".`
  );
  if (!ok) return;

  const now = new Date().toISOString();
  for (const id of ids) {
    const piece = await store.get('pieces', id);
    if (!piece) continue;
    await store.set('pieces', id, {
      ...piece,
      state: 'discarded',
      isDiscarded: true,
      updatedAt: now,
    });
  }

  console.log(`[quality] ${ids.length} piezas descartadas`);
  state.selected.clear();
  await refreshQuality();
}

// --- Manejo de acciones sobre piezas ---
async function handleAction(action, pieceId) {
  const piece = await store.get('pieces', pieceId);
  if (!piece) {
    console.warn('[quality] Pieza no encontrada:', pieceId);
    return;
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    // Aprobar → mueve directo a "ready" (Listo)
    await store.set('pieces', pieceId, { ...piece, state: 'ready', updatedAt: now });
    console.log('[quality] Pieza aprobada:', pieceId);
  } else if (action === 'back') {
    // Devolver → vuelve a "draft" (Borrador)
    await store.set('pieces', pieceId, { ...piece, state: 'draft', updatedAt: now });
    console.log('[quality] Pieza devuelta a borrador:', pieceId);
  } else if (action === 'discard') {
    if (!confirm('¿Descartar esta pieza? Se moverá a "descartado".')) return;
    await store.set('pieces', pieceId, {
      ...piece,
      state: 'discarded',
      isDiscarded: true,
      updatedAt: now,
    });
    console.log('[quality] Pieza descartada:', pieceId);
  } else if (action === 'delete') {
    if (!confirm('¿Eliminar esta pieza definitivamente? No se puede deshacer.')) return;
    await store.remove('pieces', pieceId);
    console.log('[quality] Pieza eliminada:', pieceId);
  } else if (action === 'download') {
    alert('La descarga desde Calidad estará disponible en el próximo paso.');
    return;
  }

  // Refrescar el kanban
  await refreshQuality();
}

// --- Refrescar ---
export async function refreshQuality() {
  await loadPieces();
  renderKanban();
  updateModuleCount();
}

function updateModuleCount() {
  const el = document.querySelector('.module-item[data-module="quality"] .module-count');
  if (el) el.textContent = state.pieces.length;
}

// --- Init ---
export async function initQuality() {
  console.log('[quality] Iniciando módulo');
  injectQualityUI();
  await refreshQuality();
}

export function getQualityState() {
  return state;
}