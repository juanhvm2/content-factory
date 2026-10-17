// festivos-images.js
// Servicio de imágenes para festivos.
// Prioridad: Unsplash API → Wikimedia Commons (fallback).

const UNSPLASH_API = 'https://api.unsplash.com/search/photos';
const UNSPLASH_KEY = globalThis.UNSPLASH_ACCESS_KEY || '';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const TIMEOUT_MS = 8000;

const STOP_QUERY = new Set([
  'día', 'dia', 'del', 'de', 'la', 'el', 'los', 'las', 'un', 'una',
  'the', 'of', 'and', 'international', 'internacional',
]);

// Traducciones para mejorar la búsqueda en Unsplash (que funciona mejor en inglés)
const TRANSLATIONS = {
  'día de la madre': 'mother day celebration',
  'día del padre': 'father day celebration',
  'día del niño': 'children day',
  'día del amigo': 'friendship day',
  'navidad': 'christmas celebration',
  'año nuevo': 'new year celebration',
  'fin de año': 'new year eve',
  'san valentín': 'valentine day love',
  'halloween': 'halloween pumpkins',
  'día de la mujer': 'woman day empowerment',
  'día del trabajador': 'labor day workers',
  'día de la independencia': 'independence day',
  'carnaval': 'carnival celebration',
  'pascuas': 'easter celebration',
  'primavera': 'spring season flowers',
  'día de la primavera': 'spring season flowers',
  'día del libro': 'books reading',
  'día del maestro': 'teacher classroom',
  'día de la memoria': 'memory human rights',
  'malvinas': 'malvinas argentina',
  'revolución de mayo': 'may revolution buenos aires',
  'día de la bandera': 'argentina flag',
};

function buildQuery(festivo) {
  const title = String(festivo.title || '').toLowerCase().trim();
  // Buscar traducción exacta o por inclusión
  for (const [es, en] of Object.entries(TRANSLATIONS)) {
    if (title.includes(es)) return en;
  }
  // Si no hay traducción, limpiar el título
  const words = title
    .replace(/[^\wáéíóúñü\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_QUERY.has(w));
  return words.slice(0, 4).join(' ') || festivo.title;
}

async function fetchJson(url, headers = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// --- Unsplash (prioridad) ---
async function searchUnsplash(festivo, limit = 5) {
  if (!UNSPLASH_KEY) return [];
  const q = buildQuery(festivo);
  if (!q) return [];
  const url = `${UNSPLASH_API}?query=${encodeURIComponent(q)}&per_page=${limit}&orientation=landscape`;
  try {
    const data = await fetchJson(url, {
      Authorization: `Client-ID ${UNSPLASH_KEY}`,
      'Accept-Version': 'v1',
    });
    if (!data.results || !Array.isArray(data.results)) return [];
    return data.results.map((r) => ({
      url: r.urls?.regular || r.urls?.small || null,
      thumbnail: r.urls?.small || r.urls?.thumb || null,
      fullUrl: r.urls?.full || r.urls?.regular || null,
      title: r.alt_description || r.description || 'Imagen',
      description: r.alt_description || r.description || 'Imagen de Unsplash',
      author: r.user?.name || 'Autor desconocido',
      authorUrl: r.user?.links?.html || '',
      license: 'Unsplash License',
      source: 'unsplash',
      sourceUrl: r.links?.html || '',
      downloadLocation: r.links?.download_location || null,
    })).filter((img) => img.url);
  } catch (err) {
    console.warn('[festivos-images] Unsplash falló:', err.message);
    return [];
  }
}

// --- Wikimedia Commons (fallback) ---
async function searchCommons(festivo, limit = 5) {
  const q = buildQuery(festivo) || festivo.title;
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
        fullUrl: info.url || null,
        title: p.title || 'Imagen',
        description: cleanHtml(meta.ImageDescription?.value || p.title || '').slice(0, 200),
        author: cleanHtml(meta.Artist?.value || info.user || 'Autor desconocido').slice(0, 100),
        authorUrl: '',
        license: meta.LicenseShortName?.value || 'Ver en Commons',
        source: 'wikimedia',
        sourceUrl: info.descriptionurl || info.url || '',
        downloadLocation: null,
      };
    }).filter(Boolean).filter((img) => img.url);
  } catch (err) {
    console.warn('[festivos-images] Wikimedia falló:', err.message);
    return [];
  }
}

function isValidImage(img) {
  if (!img || !img.url) return false;
  const lower = img.url.toLowerCase();
  if (lower.endsWith('.svg')) return false;
  if (lower.endsWith('.pdf')) return false;
  if (lower.includes('logo')) return false;
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

// --- API pública ---
export async function getImagesForFestivo(festivo, max = 5) {
  // 1. Unsplash primero
  const unsplash = await searchUnsplash(festivo, max);
  const unsplashClean = dedupe(unsplash.filter(isValidImage));

  if (unsplashClean.length >= max) {
    return unsplashClean.slice(0, max);
  }

  // 2. Si faltan, Wikimedia
  const commons = await searchCommons(festivo, max);
  const commonsClean = dedupe(commons.filter(isValidImage));

  return dedupe([...unsplashClean, ...commonsClean]).slice(0, max);
}

// Tracking obligatorio de Unsplash (opcional, pero recomendado)
export async function trackUnsplashDownload(downloadLocation) {
  if (!downloadLocation || !UNSPLASH_KEY) return;
  try {
    await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
    });
  } catch (err) {
    console.warn('[festivos-images] Tracking download falló:', err.message);
  }
}
