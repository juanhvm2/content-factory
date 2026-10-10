// warehouse.js
// Módulo Galpón de Recolección. Recibe noticias del Bosque
// y las organiza como trabajos en cola de producción.

import * as store from '../../core/store.js??v=33';
import { getRegion, getCategory } from '../../data/categories.js??v=33';
import { analyzeNews } from '../../services/classifier.js??v=33';
import { findDuplicate } from '../../services/deduplicator.js??v=33';

const state = {
  items: [],
  filterBrand: 'all',
  filterStatus: 'active',
  search: '',
};

// --- Cargar items desde la base ---
async function loadItems() {
  const all = await store.getAll('workItems');
  state.items = all.sort((a, b) => {
    // Primero los destacados
    if (!!a.isStarred !== !!b.isStarred) return a.isStarred ? -1 : 1;
    // Después por fecha descendente
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });
  console.log(`[warehouse] ${state.items.length} items en el galpón`);
}

// --- Filtro ---
function filterItems() {
  return state.items.filter((it) => {
    // Filtro de status
    const isDiscarded = it.isDiscarded === true;
    const isStarred = it.isStarred === true;
    if (state.filterStatus === 'active' && isDiscarded) return false;
    if (state.filterStatus === 'starred' && !isStarred) return false;
    if (state.filterStatus === 'discarded' && !isDiscarded) return false;

    // Filtro de brand
    if (state.filterBrand !== 'all' && it.brand !== state.filterBrand) return false;

    // Búsqueda
    if (state.search) {
      const q = state.search.toLowerCase();
      const haystack = (it.title + ' ' + (it.excerpt || '')).toLowerCase();
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

// --- Renderizar lista ---
function renderList() {
  const container = document.getElementById('warehouse-list');
  const counter = document.getElementById('warehouse-counter');
  if (!container) return;

  const filtered = filterItems();

  if (counter) {
    counter.textContent = `${filtered.length} ${filtered.length === 1 ? 'trabajo' : 'trabajos'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="warehouse-empty">
        <div class="warehouse-empty-icon">📦</div>
        <h3>El galpón está vacío</h3>
        <p>Andá al <strong>Bosque</strong> y enviá noticias acá con el botón <strong>→ Galpón</strong>.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map((it) => {
      const region = getRegion(it.region);
      const cats = (it.categories || [])
        .slice(0, 4)
        .map((cid) => {
          const c = getCategory(cid);
          return c ? `<span class="source-cat" style="--cat-color:${c.color}">${c.name}</span>` : '';
        })
        .join('');

      const brandLabel = it.brand === 'express' ? 'Random Express' : 'Random';
      const brandClass = it.brand === 'express' ? 'brand-express' : 'brand-random';

            const a = it.analysis || {};
      const urgencyBadge = a.urgency >= 30
        ? `<span class="work-badge work-badge-urgent">⚡ Urgente</span>` : '';
      const interviewBadge = a.isInterview
        ? `<span class="work-badge work-badge-interview">🎤 Entrevista</span>` : '';
      const quotesBadge = a.hasQuotes
        ? `<span class="work-badge work-badge-quote">💬 Citas</span>` : '';
      const detectedCat = a.detectedCategory ? getCategory(a.detectedCategory) : null;
      const detectedCatBadge = detectedCat
        ? `<span class="work-badge work-badge-cat" style="--cat-color:${detectedCat.color}">${detectedCat.name}</span>` : '';
      const keywords = (a.keywords || []).slice(0, 5)
        .map((k) => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join('');
              const sourcesCount = it.duplicatesCount || 1;
      const sourcesBadge = sourcesCount > 1
        ? `<span class="work-badge work-badge-sources">📰 ${sourcesCount} fuentes</span>` : '';

      const additionalList = (it.additionalSources || [])
        .map((s) => `
          <div class="work-extra-source">
            <span>🔗</span>
            <span>${escapeHtml(s.sourceName || 'Fuente')}</span>
            <a href="${escapeHtml(s.link || '#')}" target="_blank" rel="noopener">abrir ↗</a>
          </div>
        `)
        .join('');

      return `
        <article class="work-item" data-id="${it.id}">
          <div class="work-item-header">
            <span class="work-brand ${brandClass}">${brandLabel}</span>
            <span class="work-time">${timeAgo(it.createdAt)}</span>
          </div>
          <h3 class="work-title">${escapeHtml(it.title)}</h3>
          <p class="work-excerpt">${escapeHtml((it.excerpt || '').slice(0, 180))}</p>

                    <div class="work-badges">
            ${urgencyBadge}
            ${interviewBadge}
            ${quotesBadge}
            ${detectedCatBadge}
            ${sourcesBadge}
          </div>

          ${keywords ? `<div class="work-keywords">${keywords}</div>` : ''}

                    <div class="work-meta">
            <span>${region ? region.flag : '🌐'} ${escapeHtml(it.sourceName || '')}</span>
          </div>

          ${additionalList ? `<div class="work-extra-sources">${additionalList}</div>` : ''}

          <div class="source-cats">${cats}</div>
          <div class="work-actions">
            <button class="btn btn-sm" data-action="open" data-id="${it.id}">Abrir ↗</button>
            <button class="btn btn-sm" data-action="test-engine" data-id="${it.id}">🧪 Motor</button>
            <button class="btn btn-sm btn-factory" data-action="send-to-factory" data-id="${it.id}">🏭 Fábrica</button>
            <button class="btn btn-sm btn-star ${it.isStarred ? 'is-starred' : ''}" data-action="star" data-id="${it.id}">
              ${it.isStarred ? '⭐ Destacado' : '⭐ Destacar'}
            </button>
            <button class="btn btn-sm" data-action="discard" data-id="${it.id}">
              ${it.isDiscarded ? '↩️ Recuperar' : '🗑️ Descartar'}
            </button>
          </div>
                </article>`;
    })
    .join('');

  bindActions();
}

// --- Panel de estadísticas ---
function renderStats() {
  const container = document.getElementById('warehouse-stats');
  if (!container) return;

  const items = state.items;
  const total = items.length;
  const active = items.filter((it) => !it.isDiscarded).length;
  const starred = items.filter((it) => it.isStarred).length;
  const discarded = items.filter((it) => it.isDiscarded).length;
  const urgent = items.filter((it) => it.analysis && it.analysis.urgency >= 30).length;
  const interviews = items.filter((it) => it.analysis && it.analysis.isInterview).length;

  // Distribución por categoría
  const catCount = {};
  items.forEach((it) => {
    const c = it.analysis && it.analysis.detectedCategory;
    if (c) catCount[c] = (catCount[c] || 0) + 1;
  });
  const topCats = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCat = topCats.length > 0 ? topCats[0][1] : 1;

  const statCard = (icon, label, value, color) => `
    <div class="wh-stat-card" style="--stat-color:${color}">
      <div class="wh-stat-icon">${icon}</div>
      <div class="wh-stat-info">
        <div class="wh-stat-value">${value}</div>
        <div class="wh-stat-label">${label}</div>
      </div>
    </div>
  `;

  const catBar = (catId, count) => {
    const cat = getCategory(catId);
    const name = cat ? cat.name : catId;
    const color = cat ? cat.color : 'var(--text-3)';
    const width = Math.max(10, Math.round((count / maxCat) * 100));
    return `
      <div class="wh-cat-row">
        <span class="wh-cat-name">${escapeHtml(name)}</span>
        <div class="wh-cat-bar">
          <div class="wh-cat-fill" style="width:${width}%;background:${color}"></div>
        </div>
        <span class="wh-cat-count">${count}</span>
      </div>
    `;
  };

  container.innerHTML = `
    <div class="wh-stats-row">
      ${statCard('📦', 'Total', total, 'var(--quality)')}
      ${statCard('✅', 'Activos', active, 'var(--success)')}
      ${statCard('⭐', 'Destacados', starred, 'var(--warning)')}
      ${statCard('🗑️', 'Descartados', discarded, 'var(--text-3)')}
      ${statCard('⚡', 'Urgentes', urgent, 'var(--danger)')}
      ${statCard('🎤', 'Entrevistas', interviews, 'var(--info)')}
    </div>
    ${topCats.length > 0 ? `
      <div class="wh-cats">
        <div class="wh-cats-title">Top categorías detectadas</div>
        ${topCats.map(([catId, count]) => catBar(catId, count)).join('')}
      </div>
    ` : ''}
  `;
}

// --- Eventos de cada item ---
function bindActions() {
  const container = document.getElementById('warehouse-list');
  if (!container) return;

  container.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'open') {
        const item = await store.get('workItems', id);
        if (item && item.link) window.open(item.link, '_blank', 'noopener');
      } else if (action === 'remove') {
        await removeItem(id);
      } else if (action === 'star') {
        await toggleFlag(id, 'isStarred');
            } else if (action === 'discard') {
        await toggleFlag(id, 'isDiscarded');
      } else if (action === 'test-engine') {
        await testEngine(id);
      } else if (action === 'send-to-factory') {
        await sendToFactory(id);
      }
    });
  });
}
// --- Destacar / descartar ---
async function toggleFlag(id, flag) {
  const item = await store.get('workItems', id);
  if (!item) return;
  const newValue = !item[flag];
  await store.set('workItems', id, { ...item, [flag]: newValue });
  await refresh();
}
// --- Quitar un item del galpón ---
async function removeItem(id) {
  if (!confirm('¿Quitar este trabajo del galpón? Volverá a estar disponible en el Bosque.')) return;

  const item = await store.get('workItems', id);
  if (!item) return;

  // Marcar la noticia principal como disponible
  if (item.newsId) {
    const news = await store.get('news', item.newsId);
    if (news) {
      await store.set('news', item.newsId, { ...news, status: 'discovered' });
    }
  }

  // Marcar las noticias adicionales (duplicados agrupados)
  for (const s of (item.additionalSources || [])) {
    const n = await store.get('news', s.newsId);
    if (n) {
      await store.set('news', s.newsId, { ...n, status: 'discovered' });
    }
  }

  await store.remove('workItems', id);
  await refresh();
}

// --- Filtros ---
function setupFilters() {
    document.querySelectorAll('#warehouse-status .region-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterStatus = btn.dataset.status;
      document
        .querySelectorAll('#warehouse-status .region-btn')
        .forEach((b) => b.classList.toggle('is-active', b === btn));
      renderList();
    });
  });
  document.querySelectorAll('#warehouse-brands .region-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterBrand = btn.dataset.brand;
      document
        .querySelectorAll('#warehouse-brands .region-btn')
        .forEach((b) => b.classList.toggle('is-active', b === btn));
      renderList();
    });
  });

  document.getElementById('warehouse-search')?.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderList();
  });
}

// --- Refrescar ---
export async function refresh() {
  await loadItems();
  renderStats();
  renderList();
  updateModuleCount();
}

// --- Contador lateral ---
function updateModuleCount() {
  const countEl = document.querySelector('.module-item[data-module="warehouse"] .module-count');
  if (countEl) countEl.textContent = state.items.length;
}

// --- UI base ---
function injectWarehouseUI() {
  const view = document.querySelector('.module-view[data-module-view="warehouse"]');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';

  view.innerHTML = `
    <div class="module-header">
      <div>
        <h2>Galpón de Recolección</h2>
        <p class="module-subtitle">Centro de abastecimiento inteligente. Trabajos en cola de producción.</p>
      </div>
      <span class="badge-count" id="warehouse-counter">0 trabajos</span>
    </div>

    <!-- Panel de estadísticas -->
    <div class="warehouse-stats" id="warehouse-stats"></div>

    <div class="forest-toolbar">
      <div class="region-tabs" id="warehouse-status">
        <button class="region-btn is-active" data-status="active">Activos</button>
        <button class="region-btn" data-status="starred">⭐ Destacados</button>
        <button class="region-btn" data-status="discarded">🗑️ Descartados</button>
        <button class="region-btn" data-status="all">Todos</button>
      </div>
      <div class="region-tabs" id="warehouse-brands">
        <button class="region-btn is-active" data-brand="all">Todos</button>
        <button class="region-btn" data-brand="random">Random</button>
        <button class="region-btn" data-brand="express">Random Express</button>
      </div>
      <input
        type="text"
        id="warehouse-search"
        class="forest-search"
        placeholder="Buscar trabajos…"
      />
    </div>

    <div class="warehouse-list" id="warehouse-list">
      <div class="warehouse-empty"><p>Cargando…</p></div>
    </div>
  `;
}

// --- Init ---
export async function initWarehouse() {
  console.log('[warehouse] Iniciando módulo');
  injectWarehouseUI();
  setupFilters();
  await refresh();
}

// --- Probar el motor determinista ---
async function testEngine(id) {
  const { generateCopys } = await import('../../services/rules-engine.js??v=33');
  const item = await store.get('workItems', id);
  if (!item) return;

  const copys = generateCopys({
    title: item.title,
    content: item.content || '',
    excerpt: item.excerpt || '',
    link: item.link || '',
  });

  showCopyModal(copys, item.title);
}

function showCopyModal(copys, title) {
  let modal = document.getElementById('copy-engine-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'copy-engine-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:760px">
        <div class="modal-header">
          <h3>🧪 Motor determinista · Resultado</h3>
          <button class="modal-close" id="copy-engine-close">×</button>
        </div>
        <div class="modal-body" id="copy-engine-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#copy-engine-close').addEventListener('click', () => modal.classList.remove('is-open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('is-open');
    });
  }

  const labels = {
    ig_post: '📸 Instagram Post',
    ig_story: '📲 Instagram Story',
    facebook: '📘 Facebook',
    twitter: '🐦 X (Twitter)',
    tiktok: '🎵 TikTok',
    canal_difusion: '📢 Canal de difusión',
    spotify: '🎙️ Spotify / Podcast',
    youtube: '▶️ YouTube',
    random_express: '📄 Random Express',
    frases_destacadas: '💬 Frase destacada',
    carrusel_ig: '🖼️ Carrusel',
  };

  const body = modal.querySelector('#copy-engine-body');
  body.innerHTML = `
    <div style="padding:8px 0 16px;border-bottom:1px solid var(--border-1);margin-bottom:16px">
      <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px">Noticia origen</div>
      <div style="font-size:14px;font-weight:600;color:var(--text-1);margin-top:4px">${escapeHtml(title)}</div>
    </div>
    ${Object.entries(copys)
      .map(
        ([key, text]) => `
        <div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:12px;font-weight:700;color:var(--quality)">${labels[key] || key}</div>
            <button class="btn btn-sm" data-copy="${key}">Copiar</button>
          </div>
          <pre style="white-space:pre-wrap;font-family:var(--font-sans);font-size:12px;line-height:1.6;background:var(--bg-2);border:1px solid var(--border-1);border-radius:6px;padding:10px;color:var(--text-2);margin:0">${escapeHtml(text)}</pre>
        </div>
      `
      )
      .join('')}
  `;

  body.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.copy;
      navigator.clipboard.writeText(copys[key]).then(() => {
        btn.textContent = '¡Copiado!';
        setTimeout(() => (btn.textContent = 'Copiar'), 1500);
      });
    });
  });

  modal.classList.add('is-open');
}

async function sendToFactory(id) {
  const { loadWorkItemIntoFactory } = await import('../factory/factory.js??v=33');
  // Cambiar de módulo visualmente
  document.querySelectorAll('.module-item').forEach((i) => {
    i.classList.toggle('is-active', i.dataset.module === 'factory');
  });
  document.querySelectorAll('.module-view').forEach((v) => {
    v.classList.toggle('is-active', v.dataset.moduleView === 'factory');
  });
  // Cargar el trabajo
  await loadWorkItemIntoFactory(id);
}

export function getWarehouseState() {
  return state;
}

// --- API pública para que el Bosque envíe noticias acá ---
export async function addWorkItem(news, brand = 'express') {
  const existing = await store.getAll('workItems');
  const duplicate = findDuplicate(news, existing);

  if (duplicate) {
    // Hay duplicado: agrupar con el item existente
    const target = duplicate.item;
    const additional = target.additionalSources || [];

    // Evitar agregar la misma noticia dos veces
    if (additional.some((s) => s.newsId === news.id) || target.newsId === news.id) {
      return { ...target, _wasDuplicate: true, _reason: 'already_in_group' };
    }

    const updated = {
      ...target,
      additionalSources: [
        ...additional,
        {
          newsId: news.id,
          sourceId: news.sourceId,
          sourceName: news.sourceName,
          link: news.link,
          addedAt: new Date().toISOString(),
        },
      ],
      duplicatesCount: (target.duplicatesCount || 1) + 1,
    };

    await store.set('workItems', target.id, updated);
    await store.set('news', news.id, {
      ...news,
      status: 'selected',
      workItemId: target.id,
      isDuplicate: true,
    });

    await refresh();
    return { ...updated, _wasDuplicate: true, _reason: duplicate.reason };
  }

  // No hay duplicado: análisis + nuevo item
  const analysis = analyzeNews(news);

  const workItem = {
    id: 'wi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    newsId: news.id,
    title: news.title,
    excerpt: news.excerpt,
    link: news.link,
    imageUrl: news.imageUrl,
    images: news.images || (news.imageUrl ? [news.imageUrl] : []),
    content: news.content || '',
    wpCategories: news.wpCategories || [],
    sourceId: news.sourceId,
    sourceName: news.sourceName,
    region: news.region,
    categories: news.categories || [],
    brand,
    status: 'pending',
    createdAt: new Date().toISOString(),
    proposals: {},
    analysis,
    additionalSources: [],
    duplicatesCount: 1,
  };

  await store.set('workItems', workItem.id, workItem);

  const updatedNews = { ...news, status: 'selected', workItemId: workItem.id };
  await store.set('news', news.id, updatedNews);

  await refresh();
  return workItem;
}

// --- Consultar si una noticia ya está en el galpón ---
export async function isNewsInWarehouse(newsId) {
  const all = await store.getAll('workItems');
  return all.find((it) => it.newsId === newsId) || null;
}