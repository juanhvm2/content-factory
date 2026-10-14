// rss-service.js
// Servicio de consulta de feeds RSS.
// Estrategia híbrida:
//   1) Fetch directo (rápido) — funciona en las fuentes que permiten CORS.
//   2) Fallback: news.json generado por GitHub Action cada 30min.
//   3) Último recurso: allorigins (proxy público, lento).
//
// El news.json se carga UNA VEZ por sesión y se cachea en memoria.

// URL del news.json (relativa al módulo actual)
const NEWS_JSON_URL = new URL('../data/news.json', import.meta.url).href;

// Cache en memoria
let newsCache = null;
let newsLoadPromise = null;

// Hash estable a partir del link (para deduplicar noticias)
export function hashLink(link) {
  let hash = 0;
  const str = String(link || '');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'n_' + Math.abs(hash).toString(36);
}

// Limpia HTML y devuelve texto plano
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrae TODAS las imágenes de un HTML
function extractAllImagesFromHtml(html) {
  const text = String(html || '');
  const images = [];
  for (const m of text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    if (m[1]) images.push(m[1]);
  }
  return [...new Set(images)]
    .filter(
      (u) =>
        u &&
        !u.endsWith('.svg') &&
        !u.includes('pixel') &&
        !u.includes('1x1') &&
        !u.includes('blank.gif')
    )
    .slice(0, 10);
}

// Normaliza un item crudo a un objeto de noticia
function normalizeItem(raw, source, imageUrl = null) {
  const title = stripHtml(raw.title || '');
  const description = stripHtml(raw.description || raw.content || '');
  const excerpt =
    description.slice(0, 220) + (description.length > 220 ? '…' : '');
  const link = raw.link || raw.guid || '';
  const pubDate = raw.pubDate || raw.pubdate || raw.isoDate || null;

  const htmlBlob = (raw.description || '') + ' ' + (raw.content || '');
  const allFromHtml = extractAllImagesFromHtml(htmlBlob);

  const candidates = [];
  if (imageUrl) candidates.push(imageUrl);
  candidates.push(...allFromHtml);

  const uniqueImages = [...new Set(candidates)].filter(Boolean);
  const mainImage = uniqueImages[0] || null;

  return {
    id: hashLink(link || title),
    sourceId: source.id,
    sourceName: source.name,
    region: source.region,
    categories: source.categories || [],
    title,
    excerpt,
    link,
    imageUrl: mainImage,
    images: uniqueImages,
    pubDate: pubDate ? new Date(pubDate).toISOString() : null,
    fetchedAt: new Date().toISOString(),
    _via: 'directo',
  };
}

// ---------------------------------------------------------------------------
// Carga y cacheo de news.json
// ---------------------------------------------------------------------------
async function loadNewsJson() {
  if (newsCache) return newsCache;
  if (newsLoadPromise) return newsLoadPromise;

  newsLoadPromise = (async () => {
    try {
      const res = await fetch(NEWS_JSON_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      newsCache = data;
      console.log(
        `[rss] ✅ news.json cargado: ${data.totalNews} noticias de ${data.okSources} fuentes (generado ${data.generatedAt})`
      );
      return data;
    } catch (e) {
      console.warn(`[rss] ⚠️ No se pudo cargar news.json: ${e.message}`);
      newsLoadPromise = null; // permite reintentar en la próxima llamada
      return null;
    }
  })();

  return newsLoadPromise;
}

// Devuelve las noticias de news.json para una fuente concreta
function newsFromCache(source) {
  if (!newsCache) return [];
  const arr = newsCache.news || [];
  return arr
    .filter((n) => n.sourceId === source.id)
    .map((n) => ({
      ...n,
      // El JSON no tiene imágenes — mantenemos compatibilidad con la app
      images: n.images || [],
      imageUrl: n.imageUrl || null,
      _via: 'news.json',
    }));
}

// ---------------------------------------------------------------------------
// Estrategias de fetch en vivo
// ---------------------------------------------------------------------------

// Intento 1: fetch directo (sin proxy)
async function fetchDirect(source) {
  const res = await fetch(source.url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  if (xml.querySelector('parsererror')) throw new Error('XML inválido');

  const items = Array.from(xml.querySelectorAll('item, entry')).slice(0, 20);
  if (items.length === 0) throw new Error('Sin items en el feed');

  return items.map((node) => {
    const getText = (tag) => node.querySelector(tag)?.textContent || '';
    let link = getText('link');
    if (!link) {
      const linkEl = node.querySelector('link[href]');
      link = linkEl ? linkEl.getAttribute('href') : '';
    }

    const enclosure = node.querySelector('enclosure, media\\:content');
    const enclosureUrl = enclosure ? enclosure.getAttribute('url') : null;

    const description = getText('description') || getText('summary') || '';
    const contentEncoded =
      node.getElementsByTagName('content:encoded')[0]?.textContent || '';
    const contentCombined = description + ' ' + contentEncoded;

    return normalizeItem(
      {
        title: getText('title'),
        description,
        content: contentCombined,
        link,
        pubDate:
          getText('pubDate') || getText('published') || getText('updated'),
      },
      source,
      enclosureUrl
    );
  });
}

// Intento 2 (último recurso): allorigins
async function fetchViaAllOrigins(source) {
  const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(
    source.url
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`allorigins HTTP ${res.status}`);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  if (xml.querySelector('parsererror')) throw new Error('XML inválido');

  const items = Array.from(xml.querySelectorAll('item, entry')).slice(0, 20);
  if (items.length === 0) throw new Error('Sin items en el feed');

  return items.map((node) => {
    const getText = (tag) => node.querySelector(tag)?.textContent || '';
    let link = getText('link');
    if (!link) {
      const linkEl = node.querySelector('link[href]');
      link = linkEl ? linkEl.getAttribute('href') : '';
    }

    const enclosure = node.querySelector('enclosure, media\\:content');
    const enclosureUrl = enclosure ? enclosure.getAttribute('url') : null;

    const description = getText('description') || getText('summary') || '';
    const contentEncoded =
      node.getElementsByTagName('content:encoded')[0]?.textContent || '';
    const contentCombined = description + ' ' + contentEncoded;

    return normalizeItem(
      {
        title: getText('title'),
        description,
        content: contentCombined,
        link,
        pubDate:
          getText('pubDate') || getText('published') || getText('updated'),
      },
      source,
      enclosureUrl
    );
  });
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export async function fetchSourceNews(source) {
  const errors = [];

  // 1) Fetch directo
  try {
    const items = await fetchDirect(source);
    if (items.length > 0) {
      console.log(`[rss] ${source.id} → ${items.length} items (directo)`);
      return items;
    }
  } catch (e) {
    errors.push(`directo: ${e.message}`);
  }

  // 2) news.json (cacheado)
  await loadNewsJson();
  const cached = newsFromCache(source);
  if (cached.length > 0) {
    console.log(`[rss] ${source.id} → ${cached.length} items (news.json)`);
    return cached;
  }

  // 3) allorigins (último recurso)
  try {
    const items = await fetchViaAllOrigins(source);
    if (items.length > 0) {
      console.log(`[rss] ${source.id} → ${items.length} items (allorigins)`);
      return items;
    }
  } catch (e) {
    errors.push(`allorigins: ${e.message}`);
  }

  throw new Error(`Sin noticias disponibles → ${errors.join(' | ')}`);
}

// Precalienta el cache (opcional, para llamar desde app.js al arrancar)
export async function preloadNewsJson() {
  await loadNewsJson();
}