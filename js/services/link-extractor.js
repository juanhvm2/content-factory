// link-extractor.js
// Extrae contenido de un artículo desde su URL.
// Usa OG tags cuando están disponibles y el DOM cuando no.

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getMeta(doc, name) {
  const el =
    doc.querySelector(`meta[property="${name}"]`) ||
    doc.querySelector(`meta[name="${name}"]`);
  return el ? (el.getAttribute('content') || '').trim() : '';
}

async function fetchHtml(url) {
  // Intento 1: directo
  try {
    const r = await fetch(url);
    if (r.ok) return await r.text();
  } catch (e) {}

  // Intento 2: allorigins
  try {
    const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
    if (r.ok) return await r.text();
  } catch (e) {}

  // Intento 3: corsproxy.io
  try {
    const r = await fetch('https://corsproxy.io/?url=' + encodeURIComponent(url));
    if (r.ok) return await r.text();
  } catch (e) {}

  throw new Error('No se pudo descargar la página');
}

export async function extractFromLink(url) {
  const html = await fetchHtml(url);
  if (!html) throw new Error('No se obtuvo HTML');

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,iframe,nav,footer,header,aside')
    .forEach((n) => n.remove());

  const ogTitle = getMeta(doc, 'og:title') || doc.querySelector('title')?.textContent || '';
  const ogImage = getMeta(doc, 'og:image');
  const ogDescription = getMeta(doc, 'og:description');
  const metaDescription = getMeta(doc, 'description');
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || url;

  const title = stripHtml(ogTitle).slice(0, 200);
  const excerpt = stripHtml(ogDescription || metaDescription).slice(0, 300);

  // Buscar el contenedor principal del artículo
  const candidates = [
    'article', '.entry-content', '.post-content', '.article-body',
    '.article-content', 'main', '[role="main"]',
  ];
  let bodyNode = null;
  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length > 200) {
      bodyNode = el;
      break;
    }
  }

  let content = '';
  if (bodyNode) {
    content = bodyNode.innerText.replace(/\s+/g, ' ').trim().slice(0, 6000);
  } else {
    content = excerpt;
  }

  if (!title) throw new Error('No se encontró título en la página');

  // Imagen: OG si existe, sino la primera imagen dentro del body
  let imageUrl = ogImage || null;
  if (!imageUrl && bodyNode) {
    const img = bodyNode.querySelector('img');
    if (img) imageUrl = img.getAttribute('src') || null;
  }

  return {
    title,
    excerpt,
    content,
    imageUrl,
    link: canonical,
    detectedFrom: 'link',
  };
}