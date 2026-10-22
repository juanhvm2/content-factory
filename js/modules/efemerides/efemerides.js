// efemerides.js
// Módulo Efemérides. Muestra las efemérides históricas del mes en curso.

import * as store from '../../core/store.js?v=53';
import { getEfemeridesForMonth } from '../../services/efemerides-service.js?v=53';
import { REGIONS, getRegion, getCategory, CATEGORIES } from '../../data/categories.js?v=53';
import { addWorkItem } from '../warehouse/warehouse.js?v=53';
import { getImagesForEfemeride } from '../../services/efemerides-images.js?v=50';

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  items: [],
  loading: false,
  error: null,
  filterCategory: 'all',
  filterToday: false,
  filterDay: null,
  filterRegion: 'all',
  search: '',
  prefixTitles: false,
  selectedImages: {},   // { efemerideId: imageUrl }
  imagesCache: {},      // { efemerideId: [ ...imágenes ] }
};

export async function initEfemerides() {
  console.log('[efemerides] Iniciando módulo');
  injectUI();
  bindEvents();
  await loadMonth();
}

function injectUI() {
  const view = document.querySelector('.module-view[data-module-view="efemerides"]');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';

  view.innerHTML = `
    <div class="module-header">
      <div>
        <h2>Efemérides</h2>
        <p class="module-subtitle">Calendario de fechas importantes de Argentina, Latinoamérica y el mundo.</p>
      </div>
      <div class="module-header-actions">
        <span class="badge-count" id="efemerides-counter">0</span>
        <button class="btn btn-sm" id="efemerides-refresh" title="Refrescar desde la API">🔄 Refrescar</button>
      </div>
    </div>

    <div class="efemerides-month-bar">
      <button class="efemerides-month-btn" id="efemerides-prev" aria-label="Mes anterior">◀</button>
      <div class="efemerides-month-label" id="efemerides-month-label">Cargando…</div>
      <button class="efemerides-month-btn" id="efemerides-next" aria-label="Mes siguiente">▶</button>
    </div>

    <div class="forest-toolbar">
      <div class="region-tabs" id="efemerides-regions">
        <button class="region-btn is-active" data-region="all">Todas</button>
        ${REGIONS.map((r) => `<button class="region-btn" data-region="${r.id}">${r.flag} ${r.name}</button>`).join('')}
      </div>
      <div class="region-tabs" id="efemerides-today-filter">
        <button class="region-btn" id="efemerides-today-btn" title="Mostrar solo las del día de hoy">📅 Hoy</button>
      </div>
      <div class="region-tabs" id="efemerides-day-filter">
        <label style="display:flex;align-items:center;gap:6px;padding:0 8px;font-size:11px;color:var(--text-3);">
          Día:
          <input type="number" id="efemerides-day-input" min="1" max="31" placeholder="--"
            style="width:52px;padding:4px 6px;background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px;color:var(--text-1);font-family:inherit;font-size:11px;">
        </label>
      </div>
      <input type="text" id="efemerides-search" class="forest-search" placeholder="Buscar efemérides…" />
      <label class="efemerides-prefix-toggle">
        <input type="checkbox" id="efemerides-prefix">
        <span>Prefijar con "Un día como hoy"</span>
      </label>
    </div>

    <div class="efemerides-category-bar">
      <div class="category-tabs" id="efemerides-categories">
        <button class="category-btn is-active" data-category="all">Todas las categorías</button>
        ${CATEGORIES.map((c) => `<button class="category-btn" data-category="${c.id}" style="--cat-color:${c.color}">${c.name}</button>`).join('')}
      </div>
    </div>

    <div class="efemerides-grid" id="efemerides-grid">
      <div class="efemerides-empty">Cargando efemérides…</div>
    </div>
  `;

  updateMonthLabel();
}

function updateMonthLabel() {
  const label = document.getElementById('efemerides-month-label');
  if (label) label.textContent = `${MONTHS_ES[state.month - 1]} ${state.year}`;
}

function bindEvents() {
  document.getElementById('efemerides-prev')?.addEventListener('click', () => changeMonth(-1));
  document.getElementById('efemerides-next')?.addEventListener('click', () => changeMonth(1));
  document.getElementById('efemerides-refresh')?.addEventListener('click', () => loadMonth(true));

  document.querySelectorAll('#efemerides-regions .region-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterRegion = btn.dataset.region;
      document.querySelectorAll('#efemerides-regions .region-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderGrid();
    });
  });

  document.querySelectorAll('#efemerides-categories .category-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterCategory = btn.dataset.category;
      document.querySelectorAll('#efemerides-categories .category-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderGrid();
    });
  });

  document.getElementById('efemerides-today-btn')?.addEventListener('click', () => {
    state.filterToday = !state.filterToday;
    document.getElementById('efemerides-today-btn')
      .classList.toggle('is-active', state.filterToday);
    renderGrid();
  });

  document.getElementById('efemerides-day-input')?.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    state.filterDay = (isNaN(v) || v < 1 || v > 31) ? null : v;
    renderGrid();
  });

  document.getElementById('efemerides-search')?.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderGrid();
  });

  document.getElementById('efemerides-prefix')?.addEventListener('change', (e) => {
    state.prefixTitles = e.target.checked;
    renderGrid();
  });
}

async function changeMonth(delta) {
  let month = state.month + delta;
  let year = state.year;
  if (month < 1) {
    month = 12;
    year--;
  }
  if (month > 12) {
    month = 1;
    year++;
  }
  state.month = month;
  state.year = year;
  updateMonthLabel();
  await loadMonth();
}

async function loadMonth(forceRefresh = false) {
  state.loading = true;
  state.error = null;
  renderGrid();

  const requestedYear = state.year;
  const requestedMonth = state.month;
  try {
    const items = await getEfemeridesForMonth(requestedYear, requestedMonth, {
      forceRefresh,
      onProgress: (done, total) => {
        if (state.year !== requestedYear || state.month !== requestedMonth) return;
        const counter = document.getElementById('efemerides-counter');
        if (counter) counter.textContent = `Cargando… ${done}/${total}`;
      },
    });
    if (state.year !== requestedYear || state.month !== requestedMonth) return;
    state.items = items;
    console.log(`[efemerides] ${items.length} efemérides cargadas`);
  } catch (err) {
    if (state.year !== requestedYear || state.month !== requestedMonth) return;
    console.error('[efemerides] Error cargando mes:', err);
    state.error = err.message;
    state.items = [];
  } finally {
    if (state.year === requestedYear && state.month === requestedMonth) {
      state.loading = false;
      renderGrid();
    }
  }
}

function filterItems() {
  return state.items.filter((item) => {
    if (state.filterDay && item.day !== state.filterDay) return false;
    if (state.filterToday) {
      const now = new Date();
      if (item.day !== now.getDate() || item.month !== (now.getMonth() + 1) || item.year !== now.getFullYear()) {
        return false;
      }
    }
    if (state.filterRegion !== 'all' && item.region !== state.filterRegion) return false;
    if (state.filterCategory !== 'all' && item.category !== state.filterCategory) return false;
    if (state.search) {
      const query = state.search.toLowerCase();
      const haystack = `${item.title} ${item.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function prefixTitle(item) {
  if (!state.prefixTitles) return item.title;
  return `Un día como hoy en ${item.year}: ${item.title}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderGrid() {
  const grid = document.getElementById('efemerides-grid');
  const counter = document.getElementById('efemerides-counter');
  if (!grid) return;

  if (state.loading) {
    grid.innerHTML = '<div class="efemerides-empty">⏳ Cargando efemérides del mes…</div>';
    if (counter && !counter.textContent.startsWith('Cargando…')) counter.textContent = 'Cargando…';
    return;
  }

  if (state.error) {
    grid.innerHTML = `<div class="efemerides-empty efemerides-error">
      ⚠️ ${escapeHtml(state.error)}<br>
      <small>Probá apretar "🔄 Refrescar" en unos segundos.</small>
    </div>`;
    if (counter) counter.textContent = 'Error';
    return;
  }

  const filtered = filterItems();
  if (counter) counter.textContent = `${filtered.length} ${filtered.length === 1 ? 'efeméride' : 'efemérides'}`;

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="efemerides-empty">No hay efemérides que coincidan con los filtros.</div>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => a.day - b.day);
  grid.innerHTML = sorted.map((item) => {
    const category = getCategory(item.category);
    const region = getRegion(item.region);
    const categoryName = category ? category.name : item.category;
    const categoryColor = category ? category.color : '#8b949e';
    const regionFlag = region ? region.flag : '🌐';
    const description = item.description || '';

    return `
      <article class="efemerides-card" data-id="${escapeHtml(item.id)}" tabindex="0" aria-label="Ver efeméride: ${escapeHtml(item.title)}">
        <div class="efemerides-card-date">
          <div class="efemerides-day">${item.day}</div>
          <div class="efemerides-month">${MONTHS_ES[state.month - 1].slice(0, 3)}</div>
        </div>
        <div class="efemerides-card-body">
          <div class="efemerides-card-year">${regionFlag} ${item.year}</div>
          <h3 class="efemerides-card-title">${escapeHtml(prefixTitle(item))}</h3>
          <p class="efemerides-card-desc">${escapeHtml(description.slice(0, 160))}${description.length > 160 ? '…' : ''}</p>
          <span class="efemerides-cat" style="--cat-color:${categoryColor}">${escapeHtml(categoryName)}</span>
        </div>
        <div class="efemerides-card-actions">
          <button class="btn btn-sm" data-action="open" data-id="${escapeHtml(item.id)}">Ver más</button>
          <button class="btn btn-sm btn-efemerides-send" data-action="send" data-id="${escapeHtml(item.id)}">→ Galpón</button>
        </div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.efemerides-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      openModal(card.dataset.id);
    });
    card.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
        event.preventDefault();
        openModal(card.dataset.id);
      }
    });
  });

  grid.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const { id, action } = button.dataset;
      if (action === 'open') openModal(id);
      if (action === 'send') sendToWarehouse(id);
    });
  });
}

function openModal(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  let modal = document.getElementById('efemerides-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'efemerides-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal efemerides-modal">
        <div class="modal-header">
          <h3 id="efemerides-modal-title">—</h3>
          <button class="modal-close" id="efemerides-modal-close" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body" id="efemerides-modal-body"></div>
        <div class="modal-footer">
          <a href="#" target="_blank" rel="noopener noreferrer" class="btn" id="efemerides-modal-link">Ver en Wikipedia ↗</a>
          <button class="btn btn-primary" id="efemerides-modal-send">→ Enviar al Galpón</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#efemerides-modal-close').addEventListener('click', () => modal.classList.remove('is-open'));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.remove('is-open');
    });
    modal.querySelector('#efemerides-modal-send').addEventListener('click', () => {
      if (modal.dataset.itemId) sendToWarehouse(modal.dataset.itemId);
    });
  }

  const category = getCategory(item.category);
  const region = getRegion(item.region);
  const categoryName = category ? category.name : item.category;
  const regionName = region ? region.name : 'Mundo';
  const regionFlag = region ? region.flag : '🌐';

  modal.dataset.itemId = item.id;
  modal.querySelector('#efemerides-modal-title').textContent =
    `${item.day} de ${MONTHS_ES[state.month - 1]} de ${item.year}`;
  modal.querySelector('#efemerides-modal-body').innerHTML = `
    <h2 class="efemerides-modal-title">${escapeHtml(prefixTitle(item))}</h2>
    <div class="efemerides-modal-chips">
      <span class="efemerides-cat" style="--cat-color:${category ? category.color : '#8b949e'}">${escapeHtml(categoryName)}</span>
      <span class="efemerides-cat efemerides-region-chip">${regionFlag} ${escapeHtml(regionName)}</span>
      <span class="efemerides-cat efemerides-date-chip">${item.day} de ${MONTHS_ES[state.month - 1]} de ${item.year}</span>
    </div>
    <p class="efemerides-modal-description">${escapeHtml(item.description)}</p>

    <div class="efemerides-images-section">
      <div class="efemerides-images-title">Elegí una imagen (5 opciones)</div>
      <div class="efemerides-images-grid" id="efemerides-images-grid">
        <div class="efemerides-images-loading">⏳ Buscando imágenes…</div>
      </div>
    </div>
  `;

  const linkElement = modal.querySelector('#efemerides-modal-link');
  linkElement.href = item.link || '#';
  linkElement.style.display = item.link ? 'inline-flex' : 'none';
  modal.classList.add('is-open');
  loadImagesForModal(item);
}

async function loadImagesForModal(item) {
  const grid = document.getElementById('efemerides-images-grid');
  if (!grid) return;

  let images = state.imagesCache[item.id];
  if (!images) {
    try {
      images = await getImagesForEfemeride(item, 5);
      state.imagesCache[item.id] = images;
    } catch (err) {
      console.warn('[efemerides] Error buscando imágenes:', err);
      images = [];
    }
  }

  const modal = document.getElementById('efemerides-modal');
  if (!grid.isConnected || !modal || modal.dataset.itemId !== item.id) return;

  if (images.length === 0) {
    grid.innerHTML = '<div class="efemerides-images-empty">No se encontraron imágenes para esta efeméride.</div>';
    return;
  }

  const current = state.selectedImages[item.id] || null;

  grid.innerHTML = images.map((img, i) => {
    const thumb = img.thumbnail || img.url;
    const isActive = current === img.url;
    return `
      <button class="efemerides-img-option ${isActive ? 'is-active' : ''}" data-idx="${i}" type="button">
        <div class="efemerides-img-thumb-wrap">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(img.description || img.title)}" loading="lazy" onerror="this.style.opacity=0.2">
        </div>
        <div class="efemerides-img-meta">
          <div class="efemerides-img-desc">${escapeHtml((img.description || img.title || 'Imagen').slice(0, 80))}</div>
          <div class="efemerides-img-credit">${escapeHtml((img.author || '').slice(0, 40))}</div>
        </div>
      </button>
    `;
  }).join('');

  grid.querySelectorAll('.efemerides-img-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const img = images[idx];
      if (!img) return;
      state.selectedImages[item.id] = img.url;
      grid.querySelectorAll('.efemerides-img-option').forEach((button) => button.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });
}

async function sendToWarehouse(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  const chosenImage = state.selectedImages[item.id] || item.imageUrl || null;
  const newsLikeItem = {
    id: item.id,
    sourceId: 'efemerides',
    sourceName: 'Efemérides',
    region: item.region,
    categories: [item.category],
    title: prefixTitle(item),
    excerpt: item.description.slice(0, 220),
    content: item.description,
    link: item.link || '',
    imageUrl: chosenImage,
    images: chosenImage ? [chosenImage] : [],
    pubDate: null,
    fetchedAt: new Date().toISOString(),
  };

  try {
    const result = await addWorkItem(newsLikeItem, 'express');
    const isDuplicate = result && result._wasDuplicate;

    const modal = document.getElementById('efemerides-modal');
    if (modal) modal.classList.remove('is-open');

    showToast(
      isDuplicate ? 'Esa efeméride ya está en el Galpón' : 'Efeméride enviada al Galpón (Random Express)',
      isDuplicate ? 'info' : 'success'
    );

    const countElement = document.querySelector('.module-item[data-module="warehouse"] .module-count');
    if (countElement) {
      const all = await store.getAll('workItems');
      countElement.textContent = all.length;
    }
  } catch (err) {
    console.error('[efemerides] Error enviando al Galpón:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
