// festivos-service.js
// Servicio de días festivos y celebraciones.
// Combina: (1) feriados oficiales de Nager.Date (sin key) y
//          (2) celebraciones comunes (lista interna).

import * as store from '../core/store.js?v=50';

const NAGER_API = 'https://date.nager.at/api/v3/PublicHolidays';
const CACHE_MAX_AGE_DAYS = 30;

// Países por región (Nager.Date usa ISO 3166-1 alpha-2)
const REGION_COUNTRIES = {
  argentina: ['AR'],
  latam: ['MX', 'BR', 'CL', 'CO', 'PE', 'UY', 'PY', 'BO', 'EC', 'VE'],
  mundo: ['US', 'ES', 'FR', 'GB', 'IT', 'DE', 'CA', 'JP'],
};

const COUNTRY_TO_REGION = {};
for (const [region, codes] of Object.entries(REGION_COUNTRIES)) {
  for (const c of codes) COUNTRY_TO_REGION[c] = region;
}

// Celebraciones NO oficiales (formato: día exacto, mes, título, región)
// 'weekdayRule' permite calcular el día (ej: tercer domingo de octubre).
const CELEBRACIONES = [
  // --- Argentina ---
  { month: 1, day: 1, title: 'Año Nuevo', description: 'Primer día del año calendario gregoriano.', region: 'mundo', type: 'celebración' },
  { month: 2, weekday: 0, nth: 2, title: 'Día del Amor y la Amistad', description: 'Celebración internacional del amor y la amistad.', region: 'argentina', type: 'celebración' },
  { month: 2, day: 14, title: 'San Valentín', description: 'Día de los enamorados, tradición de origen anglosajón.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 8, title: 'Día Internacional de la Mujer', description: 'Reconocimiento a la lucha por la igualdad de género.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 24, title: 'Día de la Memoria por la Verdad y la Justicia', description: 'Conmemoración de las víctimas de la última dictadura militar argentina.', region: 'argentina', type: 'feriado' },
  { month: 4, day: 2, title: 'Día del Veterano y los Caídos en Malvinas', description: 'Homenaje a los veteranos de la Guerra de Malvinas.', region: 'argentina', type: 'feriado' },
  { month: 4, day: 23, title: 'Día Mundial del Libro', description: 'Promoción de la lectura y los derechos de autor.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 1, title: 'Día del Trabajador', description: 'Reivindicación de los derechos laborales a nivel mundial.', region: 'mundo', type: 'feriado' },
  { month: 5, day: 25, title: 'Día de la Revolución de Mayo', description: 'Conmemoración de la Revolución de Mayo de 1810 en Argentina.', region: 'argentina', type: 'feriado' },
  { month: 6, weekday: 0, nth: 3, title: 'Día del Padre', description: 'Celebración del Día del Padre en Argentina (tercer domingo de junio).', region: 'argentina', type: 'celebración' },
  { month: 6, day: 20, title: 'Día de la Bandera', description: 'Homenaje al general Manuel Belgrano y a la bandera argentina.', region: 'argentina', type: 'feriado' },
  { month: 7, day: 9, title: 'Día de la Independencia', description: 'Declaración de la Independencia argentina en 1816.', region: 'argentina', type: 'feriado' },
  { month: 7, day: 20, title: 'Día del Amigo', description: 'Celebración de la amistad, popular en Argentina y Latinoamérica.', region: 'argentina', type: 'celebración' },
  { month: 8, weekday: 0, nth: 3, title: 'Día del Niño', description: 'Celebración dedicada a la infancia.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 11, title: 'Día del Maestro', description: 'Homenaje a Domingo Faustino Sarmiento y a los docentes.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 21, title: 'Día de la Primavera y la Juventud', description: 'Celebración de la primavera y de los jóvenes.', region: 'argentina', type: 'celebración' },
  { month: 10, weekday: 0, nth: 3, title: 'Día de la Madre', description: 'Celebración del Día de la Madre en Argentina (tercer domingo de octubre).', region: 'argentina', type: 'celebración' },
  { month: 10, day: 12, title: 'Día del Respeto a la Diversidad Cultural', description: 'Reconocimiento de la diversidad cultural de los pueblos.', region: 'argentina', type: 'feriado' },
  { month: 10, day: 31, title: 'Halloween', description: 'Noche de disfraces y tradición anglosajona.', region: 'mundo', type: 'celebración' },
  { month: 11, day: 20, title: 'Día de la Soberanía Nacional', description: 'Conmemoración de la Batalla de la Vuelta de Obligado.', region: 'argentina', type: 'feriado' },
  { month: 12, day: 8, title: 'Inmaculada Concepción de María', description: 'Feriado religioso católico.', region: 'argentina', type: 'feriado' },
  { month: 12, day: 25, title: 'Navidad', description: 'Celebración del nacimiento de Jesús.', region: 'mundo', type: 'feriado' },
  { month: 12, day: 31, title: 'Fin de Año', description: 'Último día del año calendario.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 24, title: 'Nochebuena', description: 'Víspera de Navidad.', region: 'mundo', type: 'celebración' },
  { month: 1, day: 6, title: 'Día de Reyes', description: 'Día de los Reyes Magos.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 5, title: 'Día Mundial del Medio Ambiente', description: 'Concientización sobre el cuidado del planeta.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 21, title: 'Día Internacional del Yoga', description: 'Promoción del yoga y el bienestar.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 21, title: 'Día Internacional de la Paz', description: 'Jornada dedicada a la paz mundial.', region: 'mundo', type: 'celebración' },
  { month: 11, day: 22, title: 'Día de la Música', description: 'Homenaje a la música y sus intérpretes.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 1, title: 'Día Mundial de la Lucha contra el SIDA', description: 'Concientización sobre el VIH/SIDA.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 16, title: 'Día Mundial de la Alimentación', description: 'Concientización sobre el hambre y la seguridad alimentaria.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 22, title: 'Día Internacional de la Madre Tierra', description: 'Concientización sobre el cuidado del planeta.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 17, title: 'Día Internacional de Internet', description: 'Celebración de las telecomunicaciones y la sociedad digital.', region: 'mundo', type: 'celebración' },
  { month: 7, day: 30, title: 'Día Internacional de la Amistad', description: 'Celebración internacional de la amistad.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 27, title: 'Día Mundial del Turismo', description: 'Reconocimiento al turismo y su aporte cultural.', region: 'mundo', type: 'celebración' },
  { month: 11, day: 19, title: 'Día Internacional del Hombre', description: 'Celebración y concientización sobre la salud masculina.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 15, title: 'Día Mundial del Arte', description: 'Celebración internacional del arte y la creatividad.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 18, title: 'Día Internacional de los Monumentos y Sitios', description: 'Concientización sobre la conservación del patrimonio cultural.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 27, title: 'Día Mundial del Diseño', description: 'Reconocimiento al diseño gráfico e industrial.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 29, title: 'Día Internacional de la Danza', description: 'Celebración de la danza como lenguaje universal.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 30, title: 'Día Internacional del Jazz', description: 'Reconocimiento a este género musical y su aporte cultural.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 18, title: 'Día Internacional de los Museos', description: 'Promoción del rol de los museos en la sociedad.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 21, title: 'Día Mundial de la Diversidad Cultural', description: 'Promoción del diálogo entre culturas.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 2, title: 'Día Nacional del Bombero Voluntario', description: 'Homenaje a los bomberos voluntarios de Argentina.', region: 'argentina', type: 'celebración' },
  { month: 7, day: 13, title: 'Día Mundial del Rock', description: 'Celebración del género musical.', region: 'mundo', type: 'celebración' },
  { month: 8, day: 12, title: 'Día Internacional de la Juventud', description: 'Reconocimiento al aporte de los jóvenes a la sociedad.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 13, title: 'Día del Bibliotecario', description: 'Homenaje a los bibliotecarios argentinos.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 1, title: 'Día Internacional de la Música', description: 'Celebración mundial de la música y sus intérpretes.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 12, title: 'Día de la Hispanidad', description: 'Celebración de la cultura hispánica en el mundo.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 20, title: 'Día Mundial de la Estadística', description: 'Reconocimiento a la estadística como herramienta de análisis.', region: 'mundo', type: 'celebración' },
  { month: 11, day: 10, title: 'Día de la Tradición', description: 'Homenaje a José Hernández y las tradiciones argentinas.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 22, title: 'Día Internacional del Músico', description: 'Celebración de Santa Cecilia, patrona de los músicos.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 28, title: 'Día de los Santos Inocentes', description: 'Jornada de bromas y tradiciones populares.', region: 'mundo', type: 'celebración' },
  { month: 6, weekday: 0, nth: 3, title: 'Día del Padre en Latinoamérica', description: 'Celebración del Día del Padre en varios países latinoamericanos.', region: 'latam', type: 'celebración' },
  { month: 1, day: 4, title: 'Día Mundial del Braille', description: 'Concientización sobre el sistema de lectura para personas ciegas.', region: 'mundo', type: 'celebración' },
  { month: 2, day: 11, title: 'Día Internacional de la Mujer y la Niña en la Ciencia', description: 'Promoción del acceso de las mujeres a la ciencia.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 14, title: 'Día Internacional de las Matemáticas', description: 'Celebración de las matemáticas y su rol en la ciencia.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 22, title: 'Día Mundial del Agua', description: 'Concientización sobre el uso responsable del agua.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 23, title: 'Día Meteorológico Mundial', description: 'Reconocimiento a la meteorología y sus aportes.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 7, title: 'Día Mundial de la Salud', description: 'Concientización sobre temas de salud global.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 12, title: 'Día Internacional de los Vuelos Espaciales Tripulados', description: 'Homenaje al primer vuelo espacial tripulado (Yuri Gagarin, 1961).', region: 'mundo', type: 'celebración' },
  { month: 4, day: 22, title: 'Día Internacional de la Madre Tierra', description: 'Concientización sobre el cuidado del planeta.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 8, title: 'Día Mundial de las Aves Migratorias', description: 'Concientización sobre la conservación de las aves migratorias.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 18, title: 'Día Internacional de la Fascinación por las Plantas', description: 'Divulgación del estudio de las plantas.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 22, title: 'Día Internacional de la Diversidad Biológica', description: 'Concientización sobre la biodiversidad del planeta.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 5, title: 'Día Mundial del Medio Ambiente', description: 'Concientización sobre el cuidado del medio ambiente.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 8, title: 'Día Mundial de los Océanos', description: 'Concientización sobre la importancia de los océanos.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 30, title: 'Día Internacional de los Asteroides', description: 'Concientización sobre los asteroides y su estudio.', region: 'mundo', type: 'celebración' },
  { month: 7, day: 8, title: 'Día Mundial de la Conservación del Suelo', description: 'Concientización sobre el cuidado del suelo.', region: 'mundo', type: 'celebración' },
  { month: 7, day: 20, title: 'Día Internacional de la Luna', description: 'Conmemoración del alunizaje del Apolo 11 (1969).', region: 'mundo', type: 'celebración' },
  { month: 8, day: 12, title: 'Día Internacional de los Elefantes', description: 'Concientización sobre la conservación de los elefantes.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 16, title: 'Día Internacional de la Preservación de la Capa de Ozono', description: 'Concientización sobre el cuidado de la capa de ozono.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 22, title: 'Día Mundial de los Ríos', description: 'Concientización sobre el cuidado de los ríos.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 27, title: 'Día Mundial del Turismo', description: 'Reconocimiento al turismo y su aporte cultural.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 4, title: 'Día Mundial de los Animales', description: 'Concientización sobre el cuidado de los animales.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 5, title: 'Día Mundial de los Docentes', description: 'Reconocimiento a la labor docente.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 9, title: 'Día Mundial del Correo', description: 'Reconocimiento al servicio postal y su historia.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 13, title: 'Día Internacional para la Reducción de los Desastres', description: 'Concientización sobre la prevención de desastres.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 16, title: 'Día Mundial de la Alimentación', description: 'Concientización sobre el hambre y la seguridad alimentaria.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 24, title: 'Día Internacional contra el Cambio Climático', description: 'Concientización sobre la crisis climática.', region: 'mundo', type: 'celebración' },
  { month: 11, day: 10, title: 'Día Mundial de la Ciencia para la Paz y el Desarrollo', description: 'Reconocimiento al rol de la ciencia en la sociedad.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 1, title: 'Día Mundial de la Lucha contra el SIDA', description: 'Concientización sobre el VIH/SIDA.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 10, title: 'Día de los Derechos Humanos', description: 'Conmemoración de la Declaración Universal de Derechos Humanos.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 10, title: 'Día del Investigador Científico', description: 'Homenaje a Bernardo Houssay y a los investigadores argentinos.', region: 'argentina', type: 'celebración' },
  { month: 4, day: 10, title: 'Día de la Ciencia y la Tecnología', description: 'Reconocimiento a la ciencia y la tecnología en Argentina.', region: 'argentina', type: 'celebración' },
  { month: 5, day: 5, title: 'Día del Historiador', description: 'Homenaje a los historiadores argentinos y la fundación del Instituto de Historia.', region: 'argentina', type: 'celebración' },
  { month: 6, day: 15, title: 'Día del Bioquímico', description: 'Reconocimiento a los profesionales de la bioquímica en Argentina.', region: 'argentina', type: 'celebración' },
  { month: 8, day: 30, title: 'Día del Físico', description: 'Reconocimiento a los físicos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 12, title: 'Día del Geólogo', description: 'Reconocimiento a los geólogos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 25, title: 'Día del Biólogo', description: 'Reconocimiento a los biólogos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 6, title: 'Día del Químico', description: 'Reconocimiento a los químicos argentinos.', region: 'argentina', type: 'celebración' },
];

// --- Utilidades ---
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

function extractKeywords(text, max = 8) {
  const stop = new Set(['de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una', 'del', 'que', 'por', 'con', 'para', 'es', 'al', 'se', 'su', 'como', 'the', 'of', 'and', 'in', 'to', 'día', 'dia']);
  const words = String(text || '').toLowerCase()
    .replace(/[^\wáéíóúñü\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

// --- Fetch a Nager.Date ---
async function fetchCountryHolidays(year, countryCode) {
  const url = `${NAGER_API}/${year}/${countryCode}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(t);
  }
}

function normalizeNagerHoliday(h, countryCode) {
  if (!h || !h.date) return null;
  const date = new Date(h.date);
  if (isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const region = COUNTRY_TO_REGION[countryCode] || 'mundo';
  const title = h.localName || h.name || 'Feriado';
  const description = `${h.name} (${countryCode})${h.global ? '' : ' — regional'}`;
  return {
    id: `fe_${month}-${day}_${year}_${countryCode}_${slugify(title)}`,
    date: h.date,
    day, month, year,
    title,
    description,
    region,
    countryCode,
    type: 'feriado',
    isOfficial: true,
    keywords: extractKeywords(`${title} ${description}`),
  };
}

function normalizeCelebration(c, year) {
  let day = c.day;
  if (c.weekday != null && c.nth != null) {
    day = nthWeekdayOfMonth(year, c.month, c.weekday, c.nth);
  }
  if (!day) return null;
  const dateStr = `${year}-${String(c.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    id: `ce_${c.month}-${day}_${year}_${slugify(c.title)}`,
    date: dateStr,
    day, month: c.month, year,
    title: c.title,
    description: c.description,
    region: c.region,
    countryCode: null,
    type: c.type || 'celebración',
    isOfficial: c.type === 'feriado',
    keywords: extractKeywords(`${c.title} ${c.description}`),
  };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

// --- API pública ---
export async function getFestivosForMonth(year, month, { forceRefresh = false, onProgress } = {}) {
  const cacheKey = `${year}-${String(month).padStart(2, '0')}`;

  if (!forceRefresh) {
    const cached = await store.get('festivos', cacheKey);
    if (cached && Array.isArray(cached.items)) {
      const age = (Date.now() - new Date(cached.fetchedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (age < CACHE_MAX_AGE_DAYS) {
        console.log(`[festivos] usando cache de ${cacheKey} (${cached.items.length} items)`);
        return cached.items;
      }
    }
  }

  console.log(`[festivos] consultando API ${cacheKey}...`);
  const allItems = [];
  const countries = Object.values(REGION_COUNTRIES).flat();
  let done = 0;

  for (const code of countries) {
    try {
      const holidays = await fetchCountryHolidays(year, code);
      for (const h of holidays) {
        const n = normalizeNagerHoliday(h, code);
        if (n && n.month === month) allItems.push(n);
      }
    } catch (err) {
      console.warn(`[festivos] fallo ${code}: ${err.message}`);
    }
    done++;
    if (onProgress) onProgress(done, countries.length);
  }

  // Agregar celebraciones del mes
  for (const c of CELEBRACIONES) {
    if (c.month === month) {
      const n = normalizeCelebration(c, year);
      if (n) allItems.push(n);
    }
  }

  const items = dedupe(allItems).sort((a, b) => a.day - b.day);

  await store.set('festivos', cacheKey, {
    year, month,
    fetchedAt: new Date().toISOString(),
    items,
  });

  console.log(`[festivos] ${items.length} festivos guardados (${cacheKey})`);
  return items;
}

export async function clearFestivosCache() {
  const keys = await store.keys('festivos');
  for (const k of keys) await store.remove('festivos', k);
  console.log(`[festivos] cache limpiado (${keys.length} meses)`);
}
