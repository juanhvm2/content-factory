// efemerides-service.js
// Servicio de efemérides históricas.
// Fuente: API oficial de Wikimedia ("On this day") en español.
// Sin cuenta, sin API key.

import * as store from '../core/store.js?v=50';

const API_BASE = 'https://api.wikimedia.org/feed/v1/wikipedia/es/onthisday/events';
const CONCURRENCY = 6;
const CACHE_MAX_AGE_DAYS = 30;
const USER_AGENT = 'ContentFactory/1.0 (https://github.com/juanhvm2/content-factory)';

const CATEGORY_RULES = {
  politica: ['presidente', 'ministro', 'gobierno', 'constitución', 'congreso',
    'parlamento', 'senado', 'diputado', 'golpe de estado', 'independencia',
    'revolución', 'tratado', 'asesinato', 'asesinado', 'primer ministro',
    'canciller', 'embajador', 'reina', 'rey', 'emperador', 'político'],
  sociedad: ['manifestación', 'protesta', 'sufragio', 'derechos', 'voto femenino',
    'trabajador', 'obrero', 'sindicato', 'huelga', 'abolición', 'esclavitud',
    'inmigración', 'refugiado', 'social'],
  deportes: ['mundial', 'olimpiada', 'olímpico', 'copa', 'fútbol', 'boxeo',
    'tenis', 'maratón', 'medalla', 'torneo', 'campeonato', 'rugby', 'básquet',
    'atletismo', 'fórmula 1', 'deportiv', 'futbolista', 'jugador'],
  ciencia: ['descubrimiento', 'invento', 'científico', 'nasa', 'satélite',
    'espacio', 'planeta', 'luna', 'física', 'química', 'medicina', 'vacuna',
    'adn', 'telescopio', 'átomo', 'teoría', 'experimento', 'especie',
    'investigador', 'matemático', 'astrónomo', 'biólogo', 'físico', 'químico'],
  tecnologia: ['computadora', 'internet', 'software', 'patente', 'radio',
    'televisión', 'teléfono', 'satélite', 'primer vuelo', 'avión', 'automóvil',
    'electricidad', 'imprenta', 'inventor', 'tecnolog'],
  arte: ['pintor', 'artista', 'obra', 'museo', 'cuadro', 'escultura',
    'arquitecto', 'fotógrafo', 'pintura', 'bellas artes'],
  musica: ['músico', 'banda', 'álbum', 'concierto', 'ópera', 'sinfonía',
    'rock', 'compositor', 'cantante', 'música'],
  cine_tv: ['película', 'cine', 'actor', 'actriz', 'director', 'film',
    'estreno', 'hollywood', 'cineasta', 'largometraje'],
  libros: ['escritor', 'libro', 'novela', 'poeta', 'literatura', 'publicó',
    'editorial', 'premio nobel de literatura', 'escritora', 'poesía'],
  historia: ['nació', 'murió', 'falleció', 'fundó', 'inauguró', 'batalla',
    'guerra', 'revolución', 'tratado', 'independencia', 'conquista', 'descubrió',
    'histórico', 'historiador'],
  economia: ['banco', 'bolsa', 'crisis', 'moneda', 'economía', 'dólar',
    'inflación', 'mercado', 'economista', 'empresario'],
  gastronomia: ['restaurante', 'chef', 'cocina', 'plato', 'gastronomía',
    'cocinero', 'receta'],
  salud: ['hospital', 'enfermedad', 'vacuna', 'epidemia', 'pandemia',
    'virus', 'médico', 'medicina', 'cirujano'],
  eventos: ['festival', 'feria', 'exposición', 'conferencia', 'congreso',
    'celebración'],
};

const ARGENTINA_HINTS = ['argentina', 'buenos aires', 'córdoba', 'rosario',
  'san martín', 'belgrano', 'sarmiento', 'rivadavia', 'perón', 'evita',
  'mendoza', 'tucumán', 'patagonia', 'argentino', 'la plata',
  'mar del plata', 'salta', 'jujuy', 'san lorenzo', 'rosas', 'mitre',
  'yrigoyen', 'almirante brown'];

const LATAM_HINTS = ['méxico', 'brasil', 'chile', 'perú', 'colombia',
  'venezuela', 'uruguay', 'paraguay', 'bolivia', 'ecuador', 'cuba', 'guatemala',
  'honduras', 'nicaragua', 'panamá', 'costa rica', 'república dominicana',
  'latinoamérica', 'latinoamericano', 'mexicano', 'brasileño', 'chileno',
  'peruano', 'colombiano', 'venezolano', 'uruguayo', 'paraguayo', 'boliviano',
  'ecuatoriano', 'cubano', 'bolívar', 'martí', 'allende'];

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function inferCategory(text) {
  const lower = String(text || '').toLowerCase();
  let best = 'historia';
  let bestScore = 0;
  for (const [cat, kws] of Object.entries(CATEGORY_RULES)) {
    let score = 0;
    for (const kw of kws) {
      if (lower.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

function inferRegion(text) {
  const lower = String(text || '').toLowerCase();
  for (const hint of ARGENTINA_HINTS) {
    if (lower.includes(hint)) return 'argentina';
  }
  for (const hint of LATAM_HINTS) {
    if (lower.includes(hint)) return 'latam';
  }
  return 'mundo';
}

function extractKeywords(text, max = 8) {
  const stop = new Set(['de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un',
    'una', 'del', 'que', 'por', 'con', 'para', 'es', 'al', 'se', 'su', 'como',
    'the', 'of', 'and', 'in', 'to', 'más', 'muy', 'sin', 'sobre', 'entre',
    'este', 'esta', 'fue', 'son', 'sus']);
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^\wáéíóúñü\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4 && !stop.has(w));
  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

async function fetchDay(month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const url = `${API_BASE}/${mm}/${dd}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Api-User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.events) ? data.events : [];
  } finally {
    clearTimeout(timer);
  }
}

function normalizeEvent(event, month, day) {
  const description = String(event.text || '').trim();
  const year = Number(event.year) || null;
  if (!description || !year) return null;

  const firstDot = description.indexOf('. ');
  const rawTitle = firstDot > 20 ? description.slice(0, firstDot) : description.slice(0, 100);
  const title = rawTitle.trim().replace(/[.,;:]$/, '');

  const category = inferCategory(description);
  const region = inferRegion(description);
  const keywords = extractKeywords(description);

  const pages = Array.isArray(event.pages) ? event.pages : [];
  const mainPage = pages.find((p) => p && p.title) || null;

  const link = mainPage?.content_urls?.desktop?.page || '';
  const wikipediaTitle = mainPage?.title || '';
  const thumbnail = mainPage?.thumbnail?.source || null;

  const id = `ef_${month}-${day}_${year}_${slugify(title)}`;

  return {
    id,
    month,
    day,
    year,
    title,
    description,
    category,
    region,
    keywords,
    link,
    wikipediaTitle,
    imageUrl: thumbnail,
    images: thumbnail ? [thumbnail] : [],
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchMonthFromApi(year, month, onProgress) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const queue = [...days];
  const allEvents = [];
  let done = 0;

  async function worker() {
    while (queue.length > 0) {
      const day = queue.shift();
      try {
        const events = await fetchDay(month, day);
        for (const ev of events) {
          const norm = normalizeEvent(ev, month, day);
          if (norm) allEvents.push(norm);
        }
      } catch (err) {
        console.warn(`[efemerides] fallo en ${month}/${day}:`, err.message);
      }
      done++;
      if (onProgress) onProgress(done, daysInMonth);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return allEvents;
}

export async function getEfemeridesForMonth(year, month, { forceRefresh = false, onProgress } = {}) {
  const cacheKey = `${year}-${String(month).padStart(2, '0')}`;

  if (!forceRefresh) {
    const cached = await store.get('efemerides', cacheKey);
    if (cached && Array.isArray(cached.items)) {
      const age = (Date.now() - new Date(cached.fetchedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (age < CACHE_MAX_AGE_DAYS) {
        console.log(`[efemerides] usando cache de ${cacheKey} (${cached.items.length} items)`);
        return cached.items;
      }
    }
  }

  console.log(`[efemerides] consultando API Wikimedia ES ${cacheKey}...`);
  const items = await fetchMonthFromApi(year, month, onProgress);

  await store.set('efemerides', cacheKey, {
    year,
    month,
    fetchedAt: new Date().toISOString(),
    items,
  });

  console.log(`[efemerides] ${items.length} efemérides guardadas en cache (${cacheKey})`);
  return items;
}

export async function clearEfemeridesCache() {
  const keys = await store.keys('efemerides');
  for (const k of keys) {
    await store.remove('efemerides', k);
  }
  console.log(`[efemerides] cache limpiado (${keys.length} meses)`);
}
