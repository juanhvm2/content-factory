// rss-service.js
// Servicio de consulta de feeds RSS.
// Estrategia: rss2json → allorigins → fallback null.

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

// Extrae la primera imagen encontrada en un bloque HTML
function extractImageFromHtml(html) {
  const match = String(html || '').match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}


// Extrae TODAS las imágenes de un HTML
function extractAllImagesFromHtml(html) {
  const text = String(html || '');
  const images = [];
  for (const m of text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    if (m[1]) images.push(m[1]);
  }
  return [...new Set(images)].filter(
    (u) => u && !u.endsWith('.svg') && !u.includes('pixel') && !u.includes('1x1') && !u.includes('blank.gif')
  ).slice(0, 10);
}

// Normaliza un item (de rss2json o de un DOM node) a un objeto de noticia
function normalizeItem(raw, source, imageUrl = null) {
  const title = stripHtml(raw.title || '');
  const description = stripHtml(raw.description || raw.content || '');
  const excerpt = description.slice(0, 220) + (description.length > 220 ? '…' : '');
  const link = raw.link || raw.guid || '';
  const pubDate = raw.pubDate || raw.pubdate || raw.isoDate || null;

  // Recolectar TODAS las imágenes disponibles
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
  };
}

// Intento 1: usar rss2json (devuelve JSON limpio)
async function fetchViaRss2Json(source) {
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
    source.url
  )}&count=20`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`rss2json HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.items)) {
    throw new Error('rss2json respondió sin items');
  }
  return data.items.map((item) => normalizeItem(item, source, item.thumbnail || null));
}

// Intento 2: allorigins + DOMParser (más lento pero más compatible)
async function fetchViaAllOrigins(source) {
  const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(source.url)}`;
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

    // Enclosure / media:content como imagen principal
    const enclosure = node.querySelector('enclosure, media\\:content');
    const enclosureUrl = enclosure ? enclosure.getAttribute('url') : null;

    // Combina description + content:encoded para que normalizeItem extraiga todas las imágenes del HTML
    const description = getText('description');
    const contentEncoded = node.getElementsByTagName('content:encoded')[0]?.textContent || '';
    const contentCombined = description + ' ' + contentEncoded;

    return normalizeItem(
      {
        title: getText('title'),
        description,
        content: contentCombined,
        link,
        pubDate: getText('pubDate') || getText('published') || getText('updated'),
      },
      source,
      enclosureUrl
    );
  });
}

// API pública del servicio
export async function fetchSourceNews(source) {
  // Intento 1: rss2json
  try {
    const items = await fetchViaRss2Json(source);
    if (items.length > 0) {
      console.log(`[rss] ${source.id} → ${items.length} items (rss2json)`);
      return items;
    }
  } catch (e) {
    console.warn(`[rss] rss2json falló para ${source.id}: ${e.message}`);
  }

  // Intento 2: allorigins
  try {
    const items = await fetchViaAllOrigins(source);
    if (items.length > 0) {
      console.log(`[rss] ${source.id} → ${items.length} items (allorigins)`);
      return items;
    }
  } catch (e) {
    console.warn(`[rss] allorigins falló para ${source.id}: ${e.message}`);
  }

  // Falla total
  throw new Error('No se pudo obtener el feed');
}