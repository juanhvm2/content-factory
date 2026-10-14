// forest.js
// Módulo Bosque de Fuentes. Catálogo + consulta RSS + noticias.

import * as store from '../../core/store.js?v=47';
import { SEED_SOURCES } from '../../data/sources.js?v=47';
import { REGIONS, getRegion, getCategory } from '../../data/categories.js?v=47';
import { openSourceEditor, setupSourceEditor } from './source-editor.js?v=47';
import { fetchSourceNews } from '../../services/rss-service.js?v=47';
import { addWorkItem } from '../warehouse/warehouse.js?v=47';
import { detectBrand, getBrand, BRANDS } from '../../data/brands.js?v=47';
import { fetchWPSource } from '../../services/wp-service.js?v=47';
import { extractFromLink } from '../../services/link-extractor.js?v=47';

const state = {
  sources: [],
  news: [],
  filterRegion: 'all',
  newsFilterRegion: 'all',
  search: '',
  newsSearch: '',
  isFetching: false,
  sourceOffset: parseInt(localStorage.getItem('forest_source_offset') || '0', 10),
  fetchProgress: {
    current: 0,
    total: 0,
    startedAt: null,
    newsCount: 0,
  },
};

const MAX_SOURCES_PER_FETCH = 15;
const MAX_NEWS_AGE_HOURS = 48; // Solo noticias de las últimas 48 horas

// --- Cargar fuentes (sembrar si es la primera vez) ---
async function loadSources() {
  const existing = await store.getAll('sources');
  const existingMap = new Map(existing.map((s) => [s.id, s]));

  let added = 0;
  let synced = 0;
  for (const seed of SEED_SOURCES) {
    const current = existingMap.get(seed.id);

    if (!current) {
      const enriched = {
        ...seed,
        type: 'rss',
        method: seed.method || 'rss',
        frequency: 'manual',
        status: 'idle',
        lastFetch: null,
        activityLog: [],
        createdAt: new Date().toISOString(),
      };
      await store.set('sources', seed.id, enriched);
      added++;
    } else if (seed.isOwn) {
      const merged = {
        ...current,
        url: seed.url,
        method: seed.method || current.method || 'rss',
        daysBack: seed.daysBack != null ? seed.daysBack : current.daysBack,
        perPage: seed.perPage != null ? seed.perPage : current.perPage,
      };
      await store.set('sources', seed.id, merged);
      synced++;
    }
  }

  if (added > 0) console.log(`[forest] ${added} fuentes nuevas agregadas`);
  if (synced > 0) console.log(`[forest] ${synced} fuentes propias sincronizadas`);

  state.sources = await store.getAll('sources');
  console.log(`[forest] ${state.sources.length} fuentes cargadas`);
}

// --- Cargar noticias desde la base ---
async function loadNewsFromDb() {
  const all = await store.getAll('news');

  // Separar frescas de viejas
  const fresh = [];
  const stale = [];
  all.forEach((n) => {
    if (isNewsFresh(n)) fresh.push(n);
    else stale.push(n);
  });

  // Borrar las viejas de IndexedDB
  if (stale.length > 0) {
    console.log(`[forest] Limpiando ${stale.length} noticias viejas de la base`);
    for (const n of stale) {
      await store.remove('news', n.id);
    }
  }

  // Ordenar frescas por fecha descendente
  state.news = fresh.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const dbb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return dbb - da;
  });

  console.log(`[forest] ${state.news.length} noticias frescas en base (${stale.length} viejas eliminadas)`);
}

// --- Filtros ---
function filterSources() {
  return state.sources.filter((s) => {
    if (state.filterRegion !== 'all' && s.region !== state.filterRegion) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const haystack = (s.name + ' ' + s.url).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function filterNews() {
  return state.news.filter((n) => {
    // Filtrar por antigüedad (solo noticias frescas)
    if (!isNewsFresh(n)) return false;

    if (state.newsFilterRegion !== 'all' && n.region !== state.newsFilterRegion) return false;
    if (state.newsSearch) {
      const q = state.newsSearch.toLowerCase();
      const haystack = (n.title + ' ' + n.excerpt).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// --- Helpers ---
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hashLink(link) {
  let hash = 0;
  const str = String(link || '');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'n_' + Math.abs(hash).toString(36);
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'recién';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'ahora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

// --- ¿La noticia es más nueva que MAX_NEWS_AGE_HOURS? ---
function isNewsFresh(item) {
  const dateStr = item.pubDate || item.timestamp;
  if (!dateStr) return false; // sin fecha → descartar

  const pubTime = new Date(dateStr).getTime();
  if (isNaN(pubTime)) return false;

  const ageHours = (Date.now() - pubTime) / (1000 * 60 * 60);
  return ageHours >= 0 && ageHours <= MAX_NEWS_AGE_HOURS;
}

// --- Renderizar fuentes ---
function renderSourceList() {
  const container = document.getElementById('forest-list');
  if (!container) return;

  const filtered = filterSources();
  if (filtered.length === 0) {
    container.innerHTML = `<div class="forest-empty"><p>No hay fuentes que coincidan con el filtro.</p></div>`;
    return;
  }

  container.innerHTML = filtered
    .map((s) => {
      const region = getRegion(s.region);
      const cats = (s.categories || [])
        .map((id) => {
          const c = getCategory(id);
          return c ? `<span class="source-cat" style="--cat-color:${c.color}">${c.name}</span>` : '';
        })
        .join('');

      const statusLabel = {
        idle: 'Sin consultar',
        active: 'Activa',
        error: 'Error',
        paused: 'Pausada',
      }[s.status] || s.status;

      const pauseIcon = s.status === 'paused' ? '▶' : '⏸';
      const pauseTitle = s.status === 'paused' ? 'Reanudar' : 'Pausar';
      const isOwn = s.isOwn === true;

      return `
        <article class="source-card ${isOwn ? 'source-card-own' : ''}" data-id="${s.id}">
          <header class="source-card-header">
            <div class="source-region">${region ? region.flag : '🌐'}</div>
            <div class="source-info">
              <h3 class="source-name">
                ${escapeHtml(s.name)}
                ${isOwn ? '<span class="source-own-badge">PROPIA</span>' : ''}
              </h3>
              <p class="source-url">${escapeHtml(s.url.replace(/^https?:\/\//, '').slice(0, 60))}</p>
            </div>
            <div class="source-card-actions">
              <button class="icon-btn fetch-btn" data-id="${s.id}" title="Consultar esta fuente">🔄</button>
              <button class="icon-btn pause-btn" data-id="${s.id}" title="${pauseTitle}">${pauseIcon}</button>
              <button class="icon-btn edit-btn" data-id="${s.id}" title="Editar">✏️</button>
            </div>
          </header>
          <div class="source-cats">${cats || '<span class="source-cat-none">Sin categorías</span>'}</div>
          <div class="source-footer">
            <span class="source-status source-status-${s.status}">${statusLabel}</span>
          </div>
        </article>`;
    })
    .join('');

  bindCardEvents();
}

// --- Renderizar noticias ---
function renderNewsList() {
  const container = document.getElementById('forest-news-list');
  if (!container) return;

  const filtered = filterNews();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="forest-empty">
        <p>Todavía no hay noticias. Hacé clic en <strong>🔄 Actualizar</strong> arriba o en el botón de una fuente para traerlas.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .slice(0, 120)
    .map((n) => {
      const img = n.imageUrl
        ? `<img class="news-thumb" src="${escapeHtml(n.imageUrl)}" alt="" loading="lazy"
            onerror="this.style.display='none'">`
        : `<div class="news-thumb news-thumb-placeholder">📰</div>`;
      const region = getRegion(n.region);
      const alreadySent = n.status === 'selected';
      const currentBrand = n.brand || detectBrand(n);

      return `
        <article class="news-card" data-id="${n.id}">
          ${img}
          <div class="news-body">
            <div class="news-meta">
              <span>${region ? region.flag : '🌐'} ${escapeHtml(n.sourceName || '')}</span>
              <span class="news-time">${timeAgo(n.pubDate)}</span>
            </div>
            <h3 class="news-title">${escapeHtml(n.title)}</h3>
            <p class="news-excerpt">${escapeHtml(n.excerpt)}</p>
            <div class="news-brand-selector" data-id="${n.id}">
              <span class="brand-label">Va a:</span>
              ${BRANDS.map(
                (b) => `<button class="brand-pill ${b.id === currentBrand ? 'is-active' : ''}" data-brand="${b.id}" data-id="${n.id}" style="--brand-color:${b.color};" ${alreadySent ? 'disabled' : ''}>${b.name}</button>`
              ).join('')}
            </div>
            <div class="news-card-actions">
              <button class="btn btn-sm btn-forest" data-action="send" data-id="${n.id}" ${alreadySent ? 'disabled' : ''}>
                ${alreadySent ? '✓ En el Galpón' : '→ Galpón'}
              </button>
            </div>
          </div>
        </article>`;
    })
    .join('');

  // Click en la tarjeta (abre el modal)
  container.querySelectorAll('.news-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      if (e.target.closest('.brand-pill')) return;
      openNewsModal(card.dataset.id);
    });
  });

  // Botón "→ Galpón"
  container.querySelectorAll('[data-action="send"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendToWarehouse(btn.dataset.id);
    });
  });

  // Pills de brand
  container.querySelectorAll('.brand-pill').forEach((pill) => {
    pill.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (pill.disabled) return;
      await setNewsBrand(pill.dataset.id, pill.dataset.brand);
    });
  });
}

async function setNewsBrand(newsId, brand) {
  const news = await store.get('news', newsId);
  if (!news) return;
  await store.set('news', newsId, { ...news, brand });
  await refresh();
}

// --- Eventos de tarjetas de fuente ---
function bindCardEvents() {
  const container = document.getElementById('forest-list');
  if (!container) return;

  container.querySelectorAll('.source-card').forEach((card) => {
    const id = card.dataset.id;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return;
      openSourceEditor(id, refresh);
    });

    card.querySelector('.fetch-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetchOneSource(id);
    });

    card.querySelector('.pause-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await togglePause(id);
    });

    card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openSourceEditor(id, refresh);
    });
  });
}

// --- Router de fetch según método de fuente ---
async function fetchNews(source) {
  if (source.method === 'wp_api') {
    return fetchWPSource(source);
  }
  return fetchSourceNews(source);
}

// --- Pausar / reanudar ---
async function togglePause(id) {
  const source = await store.get('sources', id);
  if (!source) return;
  const newStatus = source.status === 'paused' ? 'idle' : 'paused';
  await store.set('sources', id, { ...source, status: newStatus });
  await refresh();
}

// --- Consultar UNA fuente ---
async function fetchOneSource(id) {
  const source = await store.get('sources', id);
  if (!source) return;

  setSourceStatus(id, 'active', 'Consultando…');

  try {
        const items = await fetchNews(source);
    let saved = 0;
    for (const item of items) {
      // Filtrar: solo noticias de las últimas N horas
      if (!isNewsFresh(item)) continue;
      const existing = await store.get('news', item.id);
      if (!existing) {
        await store.set('news', item.id, item);
        saved++;
      }
    }
    setSourceStatus(id, 'active', `${saved} nuevas`);
    await store.set('sources', id, {
      ...source,
      lastFetch: new Date().toISOString(),
      status: 'active',
    });
    await refresh();
  } catch (error) {
    console.error(`[forest] Error consultando ${source.name}`, error);
    setSourceStatus(id, 'error', 'Error');
    await store.set('sources', id, { ...source, status: 'error' });
    await refresh();
  }
}

// --- Consultar TODAS las fuentes activas (hasta un máximo) ---
async function fetchAllActive() {
  if (state.isFetching) return;
  state.isFetching = true;

  const btn = document.getElementById('forest-fetch-all');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Consultando…';
  }

  // Fuentes activas (excluye pausadas)
  const allActive = state.sources.filter((s) => s.status !== 'paused');
  if (allActive.length === 0) {
    console.log('[forest] No hay fuentes activas para consultar');
    state.isFetching = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Actualizar todo';
    }
    return;
  }

  // Rotación: empezar desde donde quedamos la vez anterior
  const total = allActive.length;
  const offset = state.sourceOffset % total;
  const sliceSize = Math.min(MAX_SOURCES_PER_FETCH, total);
  const toFetch = [];
  for (let i = 0; i < sliceSize; i++) {
    toFetch.push(allActive[(offset + i) % total]);
  }

  console.log(
    `[forest] Consultando ${toFetch.length} fuentes (bloque ${offset + 1}-${offset + sliceSize} de ${total})`
  );

  // Inicializar progreso
  state.fetchProgress.current = 0;
  state.fetchProgress.total = toFetch.length;
  state.fetchProgress.startedAt = Date.now();
  state.fetchProgress.newsCount = 0;
  renderFetchProgress();

  let totalNew = 0;
  for (const source of toFetch) {
    try {
      const items = await fetchNews(source);
      let saved = 0;
      for (const item of items) {
        if (!isNewsFresh(item)) continue;
        const existing = await store.get('news', item.id);
        if (!existing) {
          await store.set('news', item.id, item);
          saved++;
        }
      }
      totalNew += saved;
      state.fetchProgress.newsCount = totalNew;
      await store.set('sources', source.id, {
        ...source,
        lastFetch: new Date().toISOString(),
        status: 'active',
      });
    } catch (error) {
      console.warn(`[forest] Falla en ${source.name}:`, error.message);
      await store.set('sources', source.id, { ...source, status: 'error' });
    }

    state.fetchProgress.current++;
    renderFetchProgress();
  }

  // Avanzar el offset para la próxima consulta
  state.sourceOffset = (offset + sliceSize) % total;
  localStorage.setItem('forest_source_offset', String(state.sourceOffset));

  console.log(`[forest] ${totalNew} noticias nuevas (offset avanzado a ${state.sourceOffset})`);

  // Ocultar la barra de progreso después de un delay
  setTimeout(() => {
    state.fetchProgress.startedAt = null;
    renderFetchProgress();
  }, 2500);

  if (btn) {
    btn.disabled = false;
    btn.textContent = `🔄 Actualizar (${totalNew} nuevas)`;
    setTimeout(() => {
      btn.textContent = '🔄 Actualizar todo';
    }, 4000);
  }

  state.isFetching = false;
  await refresh();
}

// --- Estado visual temporal ---
function setSourceStatus(id, status, label) {
  const card = document.querySelector(`.source-card[data-id="${id}"]`);
  if (!card) return;
  const statusEl = card.querySelector('.source-status');
  if (statusEl) {
    statusEl.className = `source-status source-status-${status}`;
    statusEl.textContent = label;
  }
}

// --- Barra de progreso del fetch ---
function renderFetchProgress() {
  const container = document.getElementById('forest-fetch-progress');
  if (!container) return;

  const p = state.fetchProgress;

  // Sin fetch activo: ocultar
  if (!p.startedAt || p.total === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  const pct = Math.round((p.current / p.total) * 100);
  const elapsed = (Date.now() - p.startedAt) / 1000;

  // Estimación de tiempo restante (lineal)
  let remainingSec = 0;
  if (p.current > 0) {
    const perSource = elapsed / p.current;
    remainingSec = Math.round(perSource * (p.total - p.current));
  } else {
    // Estimación inicial conservadora: ~2.5s por fuente
    remainingSec = Math.round(2.5 * p.total);
  }

  const formatTime = (sec) => {
    if (sec <= 0) return '0s';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const finished = p.current >= p.total;

  container.innerHTML = `
    <div class="forest-fetch-bar">
      <div class="forest-fetch-bar-info">
        <span class="forest-fetch-bar-label">
          ${finished ? '✅ Completado' : '🔄 Consultando fuentes'}
        </span>
        <span class="forest-fetch-bar-stats">
          ${p.current}/${p.total} fuentes
          ${!finished ? ` · ~${formatTime(remainingSec)} restantes` : ''}
          ${p.newsCount > 0 ? ` · ${p.newsCount} noticias nuevas` : ''}
        </span>
      </div>
      <div class="forest-fetch-bar-track">
        <div class="forest-fetch-bar-fill" style="width: ${pct}%"></div>
      </div>
      <div class="forest-fetch-bar-pct">${pct}%</div>
    </div>
  `;
}

// --- Enviar al Galpón ---
async function sendToWarehouse(id) {
  const news = await store.get('news', id);
  if (!news) return;

  const brand = news.brand || detectBrand(news);
  const result = await addWorkItem(news, brand);

  if (result && result._wasDuplicate) {
    if (result._reason === 'already_in_group') {
      showToast('Esta noticia ya está agrupada en el Galpón', 'info');
    } else {
      showToast('Agrupada con un trabajo existente', 'info');
    }
  } else {
    const brandLabel = brand === 'express' ? 'Random Express' : 'Random';
    showToast(`Enviada a ${brandLabel}`, 'success');
  }

  await refresh();
}

// --- Toast ---
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

// --- Modal de noticia ---
async function openNewsModal(id) {
  const news = await store.get('news', id);
  if (!news) return;

  const modal = document.getElementById('news-modal');
  const region = getRegion(news.region);
  const cats = (news.categories || [])
    .map((cid) => {
      const c = getCategory(cid);
      return c ? `<span class="source-cat" style="--cat-color:${c.color}">${c.name}</span>` : '';
    })
    .join('');

  document.getElementById('news-modal-title').textContent = news.title;
  document.getElementById('news-modal-body').innerHTML = `
    ${news.imageUrl ? `<img class="news-modal-img" src="${escapeHtml(news.imageUrl)}" alt="" onerror="this.style.display='none'">` : ''}
    <div class="news-modal-meta">
      <span>${region ? region.flag : '🌐'} ${escapeHtml(news.sourceName || '')}</span>
      <span>${timeAgo(news.pubDate)}</span>
    </div>
    <div class="source-cats" style="margin: var(--space-3) 0;">${cats}</div>
    <p class="news-modal-excerpt">${escapeHtml(news.excerpt)}</p>
  `;
  document.getElementById('news-modal-link').href = news.link || '#';

  modal.classList.add('is-open');
}

// --- Refrescar ---
async function refresh() {
  state.sources = await store.getAll('sources');
  await loadNewsFromDb();
  renderSourceList();
  renderNewsList();
  updateModuleCounts();
}

// --- Contadores laterales ---
function updateModuleCounts() {
  const sourceCount = document.querySelector('.module-item[data-module="forest"] .module-count');
  if (sourceCount) sourceCount.textContent = state.sources.length;

  const newsCountEl = document.getElementById('forest-news-count');
  if (newsCountEl) newsCountEl.textContent = state.news.length;

  const sourcesBadge = document.getElementById('forest-sources-count');
  if (sourcesBadge) sourcesBadge.textContent = state.sources.length;
}

// --- Filtros de UI ---
function setupFilters() {
  document.querySelectorAll('#forest-regions .region-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterRegion = btn.dataset.region;
      document
        .querySelectorAll('#forest-regions .region-btn')
        .forEach((b) => b.classList.toggle('is-active', b === btn));
      renderSourceList();
    });
  });

  document.getElementById('forest-search')?.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderSourceList();
  });

  document.querySelectorAll('#forest-news-regions .region-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.newsFilterRegion = btn.dataset.region;
      document
        .querySelectorAll('#forest-news-regions .region-btn')
        .forEach((b) => b.classList.toggle('is-active', b === btn));
      renderNewsList();
    });
  });

  document.getElementById('forest-news-search')?.addEventListener('input', (e) => {
    state.newsSearch = e.target.value;
    renderNewsList();
  });
}

// --- Botones globales ---
function setupGlobalButtons() {
  const addBtn = document.getElementById('forest-add-source');
  if (addBtn) {
    addBtn.addEventListener('click', () => openSourceEditor(null, refresh));
  }
  const fetchAllBtn = document.getElementById('forest-fetch-all');
  if (fetchAllBtn) {
    fetchAllBtn.addEventListener('click', fetchAllActive);
  }
}

// --- Guardar noticia custom (link o texto) ---
async function saveCustomNews({ title, excerpt, content, imageUrl, link, sourceId, sourceName }) {
  const id = hashLink(link || ('manual_' + Date.now() + '_' + Math.random()));
  const news = {
    id,
    sourceId,
    sourceName,
    region: 'argentina',
    categories: [],
    title,
    excerpt: (excerpt || content || '').slice(0, 240),
    content: content || '',
    link: link || '',
    imageUrl: imageUrl || null,
    pubDate: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    method: 'manual',
  };
  await store.set('news', id, news);
  await refresh();
  return news;
}

// --- Botones de ingreso manual ---
function setupIngestButtons() {
  const linkBtn = document.getElementById('forest-add-link');
  const textBtn = document.getElementById('forest-add-text');
  const linkModal = document.getElementById('link-modal');
  const textModal = document.getElementById('text-modal');
  if (!linkBtn || !textBtn || !linkModal || !textModal) return;

  linkModal.querySelectorAll('[data-close-modal]').forEach((b) =>
    b.addEventListener('click', () => linkModal.classList.remove('is-open'))
  );
  textModal.querySelectorAll('[data-close-modal]').forEach((b) =>
    b.addEventListener('click', () => textModal.classList.remove('is-open'))
  );
  [linkModal, textModal].forEach((m) =>
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('is-open');
    })
  );

  linkBtn.addEventListener('click', () => {
    document.getElementById('link-input').value = '';
    document.getElementById('link-status').textContent = '';
    linkModal.classList.add('is-open');
  });
  textBtn.addEventListener('click', () => {
    document.getElementById('manual-title').value = '';
    document.getElementById('manual-body').value = '';
    document.getElementById('manual-image').value = '';
    textModal.classList.add('is-open');
  });

  document.getElementById('link-confirm').addEventListener('click', async () => {
    const url = document.getElementById('link-input').value.trim();
    const status = document.getElementById('link-status');
    const btn = document.getElementById('link-confirm');
    if (!url) {
      status.textContent = 'Pegá una URL válida.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Extrayendo...';
    status.textContent = 'Descargando y parseando el artículo...';
    try {
      const data = await extractFromLink(url);
      const news = await saveCustomNews({
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        imageUrl: data.imageUrl,
        link: data.link || url,
        sourceId: 'custom_link',
        sourceName: 'Link ingresado',
      });
      status.textContent = `✅ Cargado: "${news.title.slice(0, 60)}..."`;
      showToast('Artículo agregado al Bosque', 'success');
      setTimeout(() => linkModal.classList.remove('is-open'), 1200);
    } catch (err) {
      status.textContent = '❌ ' + err.message;
      console.error('[forest] Error extrayendo link', err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Extraer y cargar';
    }
  });

  document.getElementById('manual-confirm').addEventListener('click', async () => {
    const title = document.getElementById('manual-title').value.trim();
    const body = document.getElementById('manual-body').value.trim();
    const img = document.getElementById('manual-image').value.trim();
    const btn = document.getElementById('manual-confirm');
    if (!body) {
      alert('El cuerpo del texto está vacío.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
      const finalTitle = title || body.split(/\n/)[0].slice(0, 120) || 'Texto sin título';
      await saveCustomNews({
        title: finalTitle,
        excerpt: body.slice(0, 240),
        content: body,
        imageUrl: img || null,
        link: '',
        sourceId: 'manual_text',
        sourceName: 'Texto manual',
      });
      showToast('Texto agregado al Bosque', 'success');
      textModal.classList.remove('is-open');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cargar texto';
    }
  });
}

// --- UI base ---
function injectForestUI() {
  const view = document.querySelector('.module-view[data-module-view="forest"]');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';

  view.innerHTML = `
    <div class="module-header">
      <div>
        <h2>Bosque de Fuentes</h2>
        <p class="module-subtitle">Exploración y catálogo de fuentes de información.</p>
      </div>
      <div class="module-header-actions">
        <button class="btn" id="forest-fetch-all">🔄 Actualizar todo</button>
        <button class="btn" id="forest-add-link">🔗 Ingresar link</button>
        <button class="btn" id="forest-add-text">📝 Ingresar texto</button>
        <button class="btn btn-primary" id="forest-add-source">+ Fuente</button>
      </div>
    </div>

    <div id="forest-fetch-progress" class="forest-fetch-progress" style="display:none;"></div>

    <section class="forest-sources-section" id="forest-sources-section">
      <div class="forest-section-header" id="forest-sources-toggle">
        <div class="forest-section-title">
          <span class="forest-section-icon">🌲</span>
          <span>Fuentes</span>
          <span class="forest-section-badge" id="forest-sources-count">0</span>
        </div>
        <button class="forest-toggle-btn" aria-label="Mostrar/ocultar fuentes">
          <span id="forest-toggle-chevron">▼</span>
        </button>
      </div>

      <div class="forest-sources-body" id="forest-sources-body">
        <div class="forest-toolbar">
          <div class="region-tabs" id="forest-regions">
            <button class="region-btn is-active" data-region="all">Todas</button>
            ${REGIONS.map(
              (r) => `<button class="region-btn" data-region="${r.id}">${r.flag} ${r.name}</button>`
            ).join('')}
          </div>
          <input type="text" id="forest-search" class="forest-search" placeholder="Buscar fuentes…" />
        </div>

        <div class="forest-list" id="forest-list">
          <div class="forest-empty"><p>Cargando fuentes…</p></div>
        </div>
      </div>
    </section>

    <section class="forest-news-section">
      <div class="module-header">
        <div>
          <h3 class="section-title">Noticias recientes <span class="badge-count" id="forest-news-count">0</span></h3>
        </div>
      </div>
      <div class="forest-toolbar">
        <div class="region-tabs" id="forest-news-regions">
          <button class="region-btn is-active" data-region="all">Todas</button>
          ${REGIONS.map(
            (r) => `<button class="region-btn" data-region="${r.id}">${r.flag} ${r.name}</button>`
          ).join('')}
        </div>
        <input type="text" id="forest-news-search" class="forest-search" placeholder="Buscar noticias…" />
      </div>
      <div class="forest-news-grid" id="forest-news-list">
        <div class="forest-empty"><p>Todavía no hay noticias cargadas.</p></div>
      </div>
    </section>
  `;

  setupSourcesToggle();
}

// --- Toggle del panel de fuentes (colapsable) ---
function setupSourcesToggle() {
  const section = document.getElementById('forest-sources-section');
  const toggle = document.getElementById('forest-sources-toggle');
  if (!section || !toggle) return;

  // Estado inicial: PLEGADO (a menos que el usuario lo haya dejado abierto)
  const savedState = localStorage.getItem('forest_sources_open');
  const isOpen = savedState === 'true';
  section.classList.toggle('is-open', isOpen);

  toggle.addEventListener('click', () => {
    const nowOpen = !section.classList.contains('is-open');
    section.classList.toggle('is-open', nowOpen);
    localStorage.setItem('forest_sources_open', String(nowOpen));
  });
}

// --- Init ---
export async function initForest() {
  console.log('[forest] Iniciando módulo');
  await loadSources();
  await loadNewsFromDb();
  injectForestUI();
  setupSourceEditor();
  setupFilters();
  setupGlobalButtons();
  setupIngestButtons();

  const newsModal = document.getElementById('news-modal');
  if (newsModal && newsModal.dataset.bound !== '1') {
    newsModal.dataset.bound = '1';
    newsModal.querySelector('.modal-close')?.addEventListener('click', () => {
      newsModal.classList.remove('is-open');
    });
    newsModal.addEventListener('click', (e) => {
      if (e.target === newsModal) newsModal.classList.remove('is-open');
    });
  }

  renderSourceList();
  renderNewsList();
  updateModuleCounts();
}

export function getForestState() {
  return state;
}