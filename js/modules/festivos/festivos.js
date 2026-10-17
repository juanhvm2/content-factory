// festivos.js
// Módulo Días Festivos. Muestra feriados y celebraciones del mes.

import * as store from '../../core/store.js?v=52';
import { getFestivosForMonth } from '../../services/festivos-service.js?v=52';
import { getImagesForFestivo } from '../../services/festivos-images.js?v=52';
import { REGIONS, getRegion } from '../../data/categories.js?v=52';
import { addWorkItem } from '../warehouse/warehouse.js?v=52';

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  items: [],
  loading: false,
  error: null,
  filterRegion: 'all',
  filterType: 'all',
  filterToday: false,
  filterDay: null,
  search: '',
  prefixTitles: false,
  selectedImages: {},
  imagesCache: {},
};

export async function initFestivos() {
  console.log('[festivos] Iniciando módulo');
  injectUI();
  bindEvents();
  await loadMonth();
}

function injectUI() {
  const view = document.querySelector('.module-view[data-module-view="festivos"]');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';

  view.innerHTML = `
    <div class="module-header">
      <div>
        <h2>Días Festivos</h2>
        <p class="module-subtitle">Feriados oficiales y celebraciones de Argentina, Latinoamérica y el mundo.</p>
      </div>
      <div class="module-header-actions">
        <span class="badge-count" id="festivos-counter">0</span>
        <button class="btn btn-sm" id="festivos-refresh" title="Refrescar desde las fuentes">🔄 Refrescar</button>
      </div>
    </div>

    <div class="festivos-month-bar">
      <button class="festivos-month-btn" id="festivos-prev" aria-label="Mes anterior">◀</button>
      <div class="festivos-month-label" id="festivos-month-label">Cargando…</div>
      <button class="festivos-month-btn" id="festivos-next" aria-label="Mes siguiente">▶</button>
    </div>

    <div class="forest-toolbar">
      <div class="region-tabs" id="festivos-regions">
        <button class="region-btn is-active" data-region="all">Todas</button>
        ${REGIONS.map((region) => `<button class="region-btn" data-region="${region.id}">${region.flag} ${region.name}</button>`).join('')}
      </div>
      <input type="text" id="festivos-search" class="forest-search" placeholder="Buscar días festivos…" />
      <label class="festivos-prefix-toggle">
        <input type="checkbox" id="festivos-prefix">
        <span>Prefijar con "Día festivo"</span>
      </label>
    </div>

    <div class="festivos-type-bar">
      <div class="festivos-type-tabs" id="festivos-types">
        <button class="festivos-type-btn is-active" data-type="all">Todos</button>
        <button class="festivos-type-btn" data-type="feriado">📌 Feriados</button>
        <button class="festivos-type-btn" data-type="celebración">🎉 Celebraciones</button>
      </div>
      <div class="region-tabs" id="festivos-today-filter">
        <button class="region-btn" id="festivos-today-btn" title="Mostrar solo los del día de hoy">📅 Hoy</button>
      </div>
      <div class="region-tabs" id="festivos-day-filter">
        <label style="display:flex;align-items:center;gap:6px;padding:0 8px;font-size:11px;color:var(--text-3);">
          Día:
          <input type="number" id="festivos-day-input" min="1" max="31" placeholder="--"
            style="width:52px;padding:4px 6px;background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px;color:var(--text-1);font-family:inherit;font-size:11px;">
        </label>
      </div>
    </div>

    <div class="festivos-grid" id="festivos-grid">
      <div class="festivos-empty">Cargando días festivos…</div>
    </div>
  `;

  updateMonthLabel();
}

function updateMonthLabel() {
  const label = document.getElementById('festivos-month-label');
  if (label) label.textContent = `${MONTHS_ES[state.month - 1]} ${state.year}`;
}

function bindEvents() {
  document.getElementById('festivos-prev')?.addEventListener('click', () => changeMonth(-1));
  document.getElementById('festivos-next')?.addEventListener('click', () => changeMonth(1));
  document.getElementById('festivos-refresh')?.addEventListener('click', () => loadMonth(true));

  document.querySelectorAll('#festivos-regions .region-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.filterRegion = button.dataset.region;
      document.querySelectorAll('#festivos-regions .region-btn').forEach((regionButton) => {
        regionButton.classList.toggle('is-active', regionButton === button);
      });
      renderGrid();
    });
  });

  document.querySelectorAll('#festivos-types .festivos-type-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.filterType = button.dataset.type;
      document.querySelectorAll('#festivos-types .festivos-type-btn').forEach((typeButton) => {
        typeButton.classList.toggle('is-active', typeButton === button);
      });
      renderGrid();
    });
  });

  document.getElementById('festivos-today-btn')?.addEventListener('click', () => {
    state.filterToday = !state.filterToday;
    document.getElementById('festivos-today-btn')
      .classList.toggle('is-active', state.filterToday);
    renderGrid();
  });

  document.getElementById('festivos-day-input')?.addEventListener('input', (event) => {
    const value = parseInt(event.target.value, 10);
    state.filterDay = (isNaN(value) || value < 1 || value > 31) ? null : value;
    renderGrid();
  });

  document.getElementById('festivos-search')?.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderGrid();
  });

  document.getElementById('festivos-prefix')?.addEventListener('change', (event) => {
    state.prefixTitles = event.target.checked;
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
    const items = await getFestivosForMonth(requestedYear, requestedMonth, {
      forceRefresh,
      onProgress: (done, total) => {
        if (state.year !== requestedYear || state.month !== requestedMonth) return;
        const counter = document.getElementById('festivos-counter');
        if (counter) counter.textContent = `Cargando… ${done}/${total}`;
      },
    });
    if (state.year !== requestedYear || state.month !== requestedMonth) return;
    state.items = items;
    console.log(`[festivos] ${items.length} días festivos cargados`);
  } catch (err) {
    if (state.year !== requestedYear || state.month !== requestedMonth) return;
    console.error('[festivos] Error cargando mes:', err);
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
    if (state.filterType !== 'all' && item.type !== state.filterType) return false;
    if (state.search) {
      const query = state.search.toLowerCase();
      const haystack = `${item.title} ${item.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function prefixTitle(item) {
  return state.prefixTitles ? `Día festivo: ${item.title}` : item.title;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function typeDetails(item) {
  const isCelebration = item.type === 'celebración';
  return {
    icon: isCelebration ? '🎉' : '📌',
    label: isCelebration ? 'Celebración' : 'Feriado oficial',
    className: isCelebration ? 'is-celebration' : 'is-holiday',
  };
}

function renderGrid() {
  const grid = document.getElementById('festivos-grid');
  const counter = document.getElementById('festivos-counter');
  if (!grid) return;

  if (state.loading) {
    grid.innerHTML = '<div class="festivos-empty">⏳ Cargando días festivos del mes…</div>';
    if (counter && !counter.textContent.startsWith('Cargando…')) counter.textContent = 'Cargando…';
    return;
  }

  if (state.error) {
    grid.innerHTML = `<div class="festivos-empty festivos-error">
      ⚠️ ${escapeHtml(state.error)}<br>
      <small>Probá apretar "🔄 Refrescar" en unos segundos.</small>
    </div>`;
    if (counter) counter.textContent = 'Error';
    return;
  }

  const filtered = filterItems();
  if (counter) counter.textContent = `${filtered.length} ${filtered.length === 1 ? 'fecha' : 'fechas'}`;

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="festivos-empty">No hay días festivos que coincidan con los filtros.</div>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => a.day - b.day || a.title.localeCompare(b.title));
  grid.innerHTML = sorted.map((item) => {
    const region = getRegion(item.region);
    const details = typeDetails(item);
    const regionFlag = region ? region.flag : '🌐';
    const description = item.description || '';

    return `
      <article class="festivos-card" data-id="${escapeHtml(item.id)}" tabindex="0" aria-label="Ver: ${escapeHtml(prefixTitle(item))}">
        <div class="festivos-card-date">
          <div class="festivos-day">${item.day}</div>
          <div class="festivos-month">${MONTHS_ES[item.month - 1].slice(0, 3)}</div>
        </div>
        <div class="festivos-card-body">
          <div class="festivos-card-meta">
            <span class="festivos-type-chip ${details.className}">${details.icon} ${details.label}</span>
            <span class="festivos-card-year">${regionFlag} ${item.year}</span>
          </div>
          <h3 class="festivos-card-title">${escapeHtml(prefixTitle(item))}</h3>
          <p class="festivos-card-desc">${escapeHtml(description.slice(0, 160))}${description.length > 160 ? '…' : ''}</p>
        </div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.festivos-card').forEach((card) => {
    card.addEventListener('click', () => openModal(card.dataset.id));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(card.dataset.id);
      }
    });
  });
}

function openModal(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  let modal = document.getElementById('festivos-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'festivos-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal festivos-modal">
        <div class="modal-header">
          <h3 id="festivos-modal-title">—</h3>
          <button class="modal-close" id="festivos-modal-close" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body" id="festivos-modal-body"></div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="festivos-modal-send">→ Enviar al Galpón</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#festivos-modal-close').addEventListener('click', () => modal.classList.remove('is-open'));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.remove('is-open');
    });
    modal.querySelector('#festivos-modal-send').addEventListener('click', () => {
      if (modal.dataset.itemId) sendToWarehouse(modal.dataset.itemId);
    });
  }

  const region = getRegion(item.region);
  const details = typeDetails(item);
  const regionName = region ? region.name : 'Mundo';
  const regionFlag = region ? region.flag : '🌐';
  const monthName = MONTHS_ES[item.month - 1];

  modal.dataset.itemId = item.id;
  modal.querySelector('#festivos-modal-title').textContent =
    `${item.day} de ${monthName} de ${item.year}`;
  modal.querySelector('#festivos-modal-body').innerHTML = `
    <h2 class="festivos-modal-title">${escapeHtml(prefixTitle(item))}</h2>
    <div class="festivos-modal-chips">
      <span class="festivos-type-chip ${details.className}">${details.icon} ${details.label}</span>
      <span class="festivos-chip festivos-region-chip">${regionFlag} ${escapeHtml(regionName)}</span>
      <span class="festivos-chip festivos-date-chip">${item.day} de ${monthName} de ${item.year}</span>
    </div>
    <p class="festivos-modal-description">${escapeHtml(item.description)}</p>
    <div class="festivos-images-section">
      <div class="festivos-images-title">Elegí una imagen (5 opciones)</div>
      <div class="festivos-images-grid" id="festivos-images-grid">
        <div class="festivos-images-loading">⏳ Buscando imágenes…</div>
      </div>
    </div>
  `;
  modal.classList.add('is-open');
  loadImagesForModal(item);
}

async function loadImagesForModal(item) {
  const grid = document.getElementById('festivos-images-grid');
  if (!grid) return;

  let images = state.imagesCache[item.id];
  if (!images) {
    try {
      images = await getImagesForFestivo(item, 5);
      state.imagesCache[item.id] = images;
    } catch (err) {
      console.warn('[festivos] Error buscando imágenes:', err);
      images = [];
    }
  }

  const modal = document.getElementById('festivos-modal');
  if (!grid.isConnected || !modal || modal.dataset.itemId !== item.id) return;

  if (images.length === 0) {
    grid.innerHTML = '<div class="festivos-images-empty">No se encontraron imágenes para este día festivo.</div>';
    return;
  }

  const current = state.selectedImages[item.id] || null;
  grid.innerHTML = images.map((image, index) => {
    const thumbnail = image.thumbnail || image.url;
    const isActive = current === image.url;
    const description = image.description || image.title || 'Imagen';
    return `
      <button class="festivos-img-option ${isActive ? 'is-active' : ''}" data-idx="${index}" type="button" aria-pressed="${isActive}">
        <div class="festivos-img-thumb-wrap">
          <img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(description)}" loading="lazy" onerror="this.style.opacity=0.2">
        </div>
        <div class="festivos-img-meta">
          <div class="festivos-img-desc">${escapeHtml(description.slice(0, 80))}</div>
          <div class="festivos-img-credit">${escapeHtml((image.author || 'Autor desconocido').slice(0, 40))}</div>
          <div class="festivos-img-license">${escapeHtml(image.license || 'Licencia no especificada')}</div>
        </div>
      </button>
    `;
  }).join('');

  grid.querySelectorAll('.festivos-img-option').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number.parseInt(button.dataset.idx, 10);
      const image = images[index];
      if (!image) return;
      state.selectedImages[item.id] = image.url;
      grid.querySelectorAll('.festivos-img-option').forEach((option) => {
        option.classList.remove('is-active');
        option.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
    });
  });
}

async function sendToWarehouse(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  const chosenImage = state.selectedImages[item.id] || item.imageUrl || null;
  const description = item.description || '';
  const newsLikeItem = {
    id: item.id,
    sourceId: 'festivos',
    sourceName: 'Días Festivos',
    region: item.region,
    categories: [item.type],
    title: prefixTitle(item),
    excerpt: description.slice(0, 220),
    content: description,
    link: '',
    imageUrl: chosenImage,
    images: chosenImage ? [chosenImage] : [],
    pubDate: item.date || null,
    fetchedAt: new Date().toISOString(),
  };

  try {
    const result = await addWorkItem(newsLikeItem, 'express');
    const isDuplicate = result && result._wasDuplicate;
    const modal = document.getElementById('festivos-modal');
    if (modal) modal.classList.remove('is-open');

    showToast(
      isDuplicate ? 'Ese día festivo ya está en el Galpón' : 'Día festivo enviado al Galpón (Random Express)',
      isDuplicate ? 'info' : 'success'
    );

    const countElement = document.querySelector('.module-item[data-module="warehouse"] .module-count');
    if (countElement) {
      const all = await store.getAll('workItems');
      countElement.textContent = all.length;
    }
  } catch (err) {
    console.error('[festivos] Error enviando al Galpón:', err);
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
