// efemerides-images.js
// Servicio de imágenes para efemérides. Consulta Wikimedia Commons y Openverse
// (sin cuenta, sin API key) y devuelve hasta 5 opciones relevantes.

const OPENVERSE_API = 'https://api.openverse.org/v1/images/';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const TIMEOUT_MS = 8000;

// Palabras que NO aportan al query (genéricas / verbos comunes)
const STOP_QUERY = new Set([
  'nace', 'nació', 'muere', 'murió', 'fallece', 'falleció', 'nacer', 'morir',
  'the', 'of', 'and', 'in', 'to', 'de', 'la', 'el', 'en', 'y', 'a', 'los',
  'las', 'un', 'una', 'del', 'que', 'por', 'con', 'para', 'es', 'al', 'se',
  'su', 'como', 'más', 'muy', 'sin', 'sobre', 'entre', 'este', 'esta',
]);

// Palabras válidas para el filtro de relevancia
function cleanWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\wáéíóúñü\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_QUERY.has(w));
}

// ---------------------------------------------------------------------------
// Query: prioridad wikipediaTitle > título > keywords
// ---------------------------------------------------------------------------
function buildQuery(efemeride) {
  // 1) Si tenemos wikipediaTitle, es lo más preciso
  if (efemeride.wikipediaTitle && efemeride.wikipediaTitle.length > 2) {
    return efemeride.wikipediaTitle;
  }

  // 2) Si no, usar el título, limpiando las palabras genéricas
  const titleWords = cleanWords(efemeride.title);
  if (titleWords.length > 0) {
    return titleWords.slice(0, 4).join(' ');
  }

  // 3) Último recurso: las keywords
  const kws = (efemeride.keywords || []).filter((k) => !STOP_QUERY.has(k));
  return kws.slice(0, 3).join(' ');
}

// ---------------------------------------------------------------------------
// Relevancia: al menos 1 palabra del título/query debe aparecer en la
// descripción o el título de la imagen
// ---------------------------------------------------------------------------
function isRelevant(img, efemeride) {
  const haystack = String(
    (img.title || '') + ' ' + (img.description || '') + ' ' + (img.author || '')
  ).toLowerCase();

  const needles = cleanWords(
    (efemeride.wikipediaTitle || '') + ' ' + (efemeride.title || '')
  );
  if (needles.length === 0) return true;

  return needles.some((n) => haystack.includes(n));
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
async function fetchJson(url, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Wikimedia Commons (prioridad: imágenes históricas reales)
// ---------------------------------------------------------------------------
async function searchCommons(efemeride, limit = 8) {
  const q = buildQuery(efemeride);
  if (!q) return [];

  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: q,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|user',
    iiurlwidth: '800',
    format: 'json',
    origin: '*',
  });

  try {
    const data = await fetchJson(COMMONS_API + '?' + params.toString());
    const pages = data.query?.pages || {};
    const results = Object.values(pages);

    return results.map((p) => {
      const info = p.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata || {};
      const cleanHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').trim();
      return {
        url: info.thumburl || info.url || null,
        thumbnail: info.thumburl || info.url || null,
        title: p.title || 'Imagen',
        description: cleanHtml(meta.ImageDescription?.value || p.title || '').slice(0, 200),
        author: cleanHtml(meta.Artist?.value || info.user || 'Autor desconocido').slice(0, 100),
        license: meta.LicenseShortName?.value || 'Ver en Commons',
        source: 'wikimedia',
        sourceUrl: info.descriptionurl || info.url || '',
      };
    }).filter(Boolean).filter((img) => img.url);
  } catch (err) {
    console.warn('[efemerides-images] Wikimedia falló:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Openverse (fuente secundaria, por si Commons no alcanza)
// ---------------------------------------------------------------------------
async function searchOpenverse(efemeride, limit = 5) {
  const q = buildQuery(efemeride);
  if (!q) return [];

  const url = OPENVERSE_API + '?q=' + encodeURIComponent(q) + '&page_size=' + limit + '&mature=false';

  try {
    const data = await fetchJson(url);
    if (!Array.isArray(data.results)) return [];
    return data.results.map((r) => ({
      url: r.url || r.thumbnail || null,
      thumbnail: r.thumbnail || r.url || null,
      title: r.title || 'Imagen',
      description: r.title || 'Imagen de Openverse',
      author: r.creator || 'Autor desconocido',
      license: r.license ? (r.license + ' ' + (r.license_version || '')).trim() : 'Sin licencia',
      source: 'openverse',
      sourceUrl: r.foreign_landing_url || r.url || '',
    })).filter((img) => img.url);
  } catch (err) {
    console.warn('[efemerides-images] Openverse falló:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------
function isValidImage(img) {
  if (!img || !img.url) return false;
  const lower = img.url.toLowerCase();
  if (lower.endsWith('.svg')) return false;
  if (lower.endsWith('.pdf')) return false;
  if (lower.endsWith('.tiff')) return false;
  if (lower.includes('pixel')) return false;
  if (lower.includes('1x1')) return false;
  if (lower.includes('logo')) return false;
  if (lower.includes('icon')) return false;
  return true;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((img) => {
    const key = (img.url || '').split('?')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export async function getImagesForEfemeride(efemeride, max = 5) {
  // Commons primero (más histórico y específico)
  const wiki = await searchCommons(efemeride, 10);

  // Si con Commons ya tenemos 5 relevantes, no llamamos a Openverse
  const wikiFiltered = wiki.filter((img) => isValidImage(img) && isRelevant(img, efemeride));
  const wikiUnique = dedupe(wikiFiltered);

  if (wikiUnique.length >= max) {
    return wikiUnique.slice(0, max);
  }

  // Si faltan, pedimos a Openverse
  const open = await searchOpenverse(efemeride, 8);
  const openFiltered = open.filter((img) => isValidImage(img) && isRelevant(img, efemeride));
  const openUnique = dedupe(openFiltered);

  const combined = dedupe([...wikiUnique, ...openUnique]);
  return combined.slice(0, max);
}
