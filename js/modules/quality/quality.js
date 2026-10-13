// quality.js
// Módulo Control de Calidad y Entrega.
// Tablero kanban con piezas por estado: Borrador, Pendiente, Aprobado, Listo, Exportado.

import * as store from '../../core/store.js?v=42';
import { cleanupOldItems } from '../../services/cleanup-service.js?v=42';

const state = {
  pieces: [],
  filterFormat: 'all',
  filterBrand: 'all',
  search: '',
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

  return `
    <div class="quality-card" data-id="${piece.id}">
      <div class="quality-card-thumb">${thumb}</div>
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
  `;

   setupFilters();
  setupCleanupButton();
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
      const warehouseMod = await import('../warehouse/warehouse.js?v=42');
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