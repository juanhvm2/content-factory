// rules-engine.js
// Motor editorial determinista (sin IA).
// Portado y reescrito desde Generar Contenidos V10.
// Genera copys, titulares, bajadas, hashtags y contenido
// estructurado para el editor visual.

// --- Diccionarios ---
const STOPWORDS = new Set([
  'de','la','el','en','y','a','los','las','un','una','del','que','por','con','para','es','al','se','su','como','más',
  'pero','o','fue','este','ha','así','lo','ya','no','tiene','sin','sobre','entre','cuando','muy','también','había',
  'hasta','desde','todo','todos','cada','uno','donde','mientras','puede','ser','han','durante','tras','después',
  'antes','esa','eso','esta','estos','estas','ese','esos','esas','aquel','otra','otro','otras','otros','si',
  'porque','cual','cuales','quien','quienes','me','te','le','nos','os','les','mi','tu','mis','tus','sus',
  'yo','tú','él','ella','nosotros','ellos','ellas','usted','ustedes','hay','era','eran','será','fueron','sido',
  'estar','está','están','estaba','estaban','estado','tener','tiene','tienen','tenía','tenían','hacer','hace',
  'hacen','hacía','hecho','ir','voy','vas','va','vamos','van','iba','viene','vienen','debe','deben','querer',
  'quiere','quieren','saber','sabe','saben','decir','dice','dicen','ver','veo','ves','ve','ven','dar','da',
  'dan','llevar','lleva','pasar','pasa','dejar','deja','quedar','queda','seguir','sigue','encontrar','encuentra',
  'llamar','llama','llegar','llega','creer','cree','pensar','piensa','parecer','parece','sentir','siente',
  'quién','quiénes','qué','cuál','cuáles','cómo','dónde','cuándo','cuánto','cuánta','cuántos','cuántas',
]);

const BANNED = new Set([
  'descubrí','no te pierdas','hacé clic','imperdible','sumate','no podés','tenés que',
  'entra ya','hacelo','enterate','suscribite','mirá esto','te va a encantar',
  'no lo vas a creer','increíble','insólito','impactante','sorprendente','alucinante',
]);

const CATEGORY_KEYWORDS = {
  politica: ['gobierno','ley','presidente','ministro','congreso','diputado','senador','elecciones',
    'partido','oposición','decreto','estado','nación','provincia','municipio','intendente','gobernador',
    'cámara','senado','diputados','oficialismo','opositor','milei','cristina','macri','massa'],
  sociedad: ['vecinos','barrio','comunidad','manifestación','protesta','reclamo','educación','escuela',
    'hospital','seguridad','violencia','género','derechos','diversidad','migración','vivienda','pobreza'],
  economia: ['inflación','dólar','peso','banco','mercado','acciones','inversión','empresa','negocio',
    'consumo','precio','impuesto','empleo','industria','exportación','importación','pbi','riesgo país',
    'bcra','finanzas','bolsa','recesión','superávit','déficit','tasa','bonos','deuda'],
  negocios: ['startup','emprendimiento','pyme','inversores','capital','ronda','adquisición','fusión',
    'ceo','fundador','corporativo','holding'],
  tecnologia: ['app','software','algoritmo','digital','internet','web','móvil','robot','chip','código',
    'programación','datos','nube','metaverso','chatbot','smartphone','hardware','wifi','5g','blockchain',
    'ciberseguridad','servidor','openai','google','apple','microsoft','meta'],
  ia: ['inteligencia artificial','machine learning','deep learning','gpt','chatgpt','gemini','claude',
    'modelo','entrenamiento','redes neuronales','prompt','llm','openai'],
  ciencia: ['estudio','investigación','investigadores','científicos','universidad','laboratorio',
    'descubrimiento','experimento','molécula','célula','gen','adn','conicet','física','química',
    'biología','astronomía','planeta','galaxia','nasa','satélite','telescopio','vacuna','virus',
    'bacteria','ecosistema','clima','calentamiento'],
  salud: ['médico','paciente','tratamiento','enfermedad','vacuna','mental','terapia','diagnóstico',
    'síntoma','prevención','clínica','cirugía','bienestar','nutrición','ansiedad','depresión','estrés',
    'cáncer','diabetes','cardíaco'],
  deportes: ['club','equipo','campeonato','liga','goleador','gol','partido','entrenador','torneo',
    'mundial','copa','cancha','jugador','técnico','selección','boca','river','racing','fútbol','tenis',
    'básquet','vóley','rugby','f1','boxeo','olimpiadas'],
  arte: ['arte','museo','galería','exposición','obra','artista','pintura','escultura','muestra',
    'curador','teatro','performance','instalación','bienal','malba','bellas artes'],
  libros: ['libro','novela','escritor','autor','editorial','poesía','cuento','ensayo','feria',
    'presentación','lectura','biblioteca','literatura','narrativa','ficción','crónica'],
  historia: ['histórico','siglo','guerra','revolución','independencia','patrimonio','archivo',
    'memoria','colonial','dictadura','antiguo','aniversario'],
  cine_tv: ['película','director','actor','actriz','estreno','festival','cine','film','rodaje','guion',
    'temporada','episodio','serie','elenco','productor','oscar','emmy','hollywood'],
  streaming: ['netflix','hbo','amazon','disney','prime','streaming','plataforma','catalogo',
    'miniserie','temporada'],
  musica: ['banda','músico','álbum','disco','canción','single','gira','recital','concierto','festival',
    'rock','pop','trap','cumbia','tango','folklore','jazz','spotify','vinilo'],
  videojuegos: ['videojuego','gaming','consola','playstation','xbox','nintendo','steam','juego',
    'lanzamiento','estudio','desarrollador','esports'],
  moda: ['diseñador','colección','tendencia','moda','ropa','estilo','pasarela','modelo','marca',
    'boutique','textil','indumentaria','outfit','look','temporada'],
  viajes: ['viaje','destino','hotel','vuelo','playa','montaña','recorrido','tour','paisaje','aventura',
    'turismo','itinerario','patagonia','iguazú','bariloche','mendoza','salta'],
  gastronomia: ['restaurante','chef','receta','plato','cocina','menú','comida','gourmet','bar','café',
    'pastelería','parrilla','asado','pizza','sushi','pasta','postre','merienda'],
  vinos: ['vino','bodega','malbec','cabernet','torrontés','bonarda','syrah','blend','sommelier','cepa',
    'terroir','mendoza','cata','cosecha','enólogo','barrica'],
  espiritual: ['espiritual','meditación','yoga','mindfulness','astrología','tarot','chakra','energía',
    'alma','consciencia','karma','religión','fe'],
  eventos: ['evento','festival','muestra','feria','exposición','congreso','seminario','encuentro',
    'celebración','aniversario','conferencia'],
  marketing: ['marketing','publicidad','campaña','marca','consumidor','tendencia','estrategia',
    'comunicación','redes sociales','engagement'],
};

const URGENCY_WORDS = ['urgente','último momento','última hora','ahora','breaking','alerta','emergencia',
  'evacuación','crisis','catástrofe','accidente','muerto','falleció','derrumbe','incendio','explosión',
  'detenido','arrestado','allanamiento','repentino','inmediato'];

const INTERVIEW_PATTERNS = /entrevist|hablamos con|dialogamos con|nos cuenta|nos contó|conversamos con|en diálogo con|mano a mano con|charlamos con|declaró|dijo a|aseguró a/;

const CONNECTORS = {
  add: ['además', 'también', 'a su vez', 'en paralelo', 'al mismo tiempo', 'por otra parte'],
  contrast: ['pero', 'sin embargo', 'no obstante', 'aunque', 'por el contrario', 'en cambio'],
  cause: ['por eso', 'por esta razón', 'de ahí que', 'en consecuencia', 'como resultado'],
  sequence: ['mientras tanto', 'en ese contexto', 'en este escenario', 'bajo esta lógica', 'en esa línea'],
  close: ['en definitiva', 'en resumen', 'en pocas palabras', 'a grandes rasgos', 'para cerrar'],
};

const OPENERS = [
  'Lo cierto es que', 'Lo interesante acá es que', 'Lejos de lo obvio', 'Contra todos los pronósticos',
  'Lo que nadie esperaba', 'En criollo', 'Sin hacer mucho ruido', 'A contramano de lo que se cree',
];

const VERBOS_RIOPLATENSES = {
  'tienes': 'tenés', 'puedes': 'podés', 'debes': 'debés', 'vienes': 'venís', 'sabes': 'sabés',
  'quieres': 'querés', 'haces': 'hacés', 'haz': 'hacé', 'mira': 'mirá', 'lee': 'leé',
  'escucha': 'escuchá', 'piensa': 'pensá', 'encuentra': 'encontrá', 'descubre': 'descubrí',
  'prueba': 'probá', 'comparte': 'compartí', 'sigue': 'seguí', 'visita': 'visitá', 'conoce': 'conocé',
  'disfruta': 'disfrutá', 'elige': 'elegí', 'vive': 'viví', 'aprende': 'aprendé', 'crea': 'creá',
  'juega': 'jugá', 'trabaja': 'trabajá', 'estudia': 'estudiá', 'corre': 'corré', 'camina': 'caminá',
  'habla': 'hablá', 'come': 'comé', 'bebe': 'bebé', 'escribe': 'escribí', 'canta': 'cantá',
  'baila': 'bailá', 'viaja': 'viajá', 'compra': 'comprá', 'vende': 'vendé', 'cocina': 'cociná',
  'llama': 'llamá', 'cuenta': 'contá', 'explica': 'explicá',
};

// --- Utilidades ---
function normalizeText(s) {
  if (!s) return '';
  let out = String(s);
  out = out.replace(/[""]/g, '"').replace(/['']/g, "'").replace(/[«»]/g, '"');
  out = out.replace(/—|–/g, '-');
  out = out.replace(/[\u00A0\u200B\uFEFF]/g, ' ');
  out = out.replace(/\s+/g, ' ');
  out = out.replace(/\.\.+/g, '.').replace(/,,+/g, ',').replace(/;;+/g, ';');
  out = out.replace(/\s+([.,;:!?])/g, '$1');
  out = out.replace(/([.,;:!?])([A-ZÁÉÍÓÚÑa-záéíóúñ])/g, '$1 $2');
  return out.trim();
}

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,;:!?¿¡"«»""''()\[\]{}\-—–]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function countWords(s) {
  return (String(s || '').trim().match(/\S+/g) || []).length;
}

function trimWords(s, n) {
  const w = String(s || '').split(/\s+/).filter(Boolean);
  if (w.length <= n) return s;
  let r = w.slice(0, n);
  while (r.length > 0 && /^[,;:]$/.test(r[r.length - 1])) r.pop();
  return r.join(' ');
}

function capitalize(s) {
  if (!s) return '';
  s = String(s).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function finalPunct(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (/[.!?]$/.test(s)) return s;
  return s + '.';
}

function cleanSentence(s) {
  s = normalizeText(s);
  s = s.replace(/^["']|["']$/g, '');
  s = s.replace(/^[-–—]\s*/, '');
  return capitalize(finalPunct(s));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Análisis ---
function detectCategory(title, content) {
  const text = ((title || '') + ' ' + (content || '')).toLowerCase();
  const scores = {};
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of kws) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const matches = text.match(regex);
      if (matches) score += matches.length * (kw.length > 5 ? 2 : 1);
    }
    scores[cat] = score;
  }
  let best = null, bestScore = 0;
  for (const [cat, sc] of Object.entries(scores)) {
    if (sc > bestScore) { bestScore = sc; best = cat; }
  }
  return best || 'sociedad';
}

function isInterview(title, content) {
  return INTERVIEW_PATTERNS.test(((title || '') + ' ' + (content || '')).toLowerCase());
}

function extractQuotes(content) {
  const s = String(content || '');
  const quotes = [];
  const re = /[""«]([^""»\n]{20,250})[""»]/g;
  let m;
  while ((m = re.exec(s))) quotes.push(m[1].trim());
  const seen = new Set();
  return quotes
    .map((q) => normalizeText(q))
    .filter((q) => {
      if (!q || seen.has(q)) return false;
      if (q.length < 20 || q.length > 250) return false;
      seen.add(q);
      return true;
    })
    .slice(0, 6);
}

function extractProperNouns(text) {
  const tokens = String(text || '').match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}){0,2}/g) || [];
  const freq = {};
  tokens.forEach((t) => {
    const lower = t.toLowerCase();
    if (STOPWORDS.has(lower.split(' ')[0]) || t.length < 4) return;
    if (/^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/i.test(t)) return;
    freq[t] = (freq[t] || 0) + 1;
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]);
}

function extractNumbers(text) {
  const matches = String(text || '').match(/\b\d{1,4}(?:[.,]\d+)?%?\b/g) || [];
  return [...new Set(matches)].slice(0, 6);
}

function getTopWords(title, content, n = 15) {
  const full = (title || '') + ' ' + (content || '');
  const tokens = tokenize(full).filter((x) => !STOPWORDS.has(x) && x.length > 3);
  const freq = {};
  tokens.forEach((t) => (freq[t] = (freq[t] || 0) + 1));
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
}

function splitSentences(s) {
  return normalizeText(String(s || ''))
    .replace(/([.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"0-9])/g, '$1|')
    .split('|')
    .map((x) => x.trim())
    .filter((x) => x.length > 15 && /[.!?]$/.test(x));
}

function applyRioplatense(text) {
  let out = String(text || '');
  for (const [src, dst] of Object.entries(VERBOS_RIOPLATENSES)) {
    const re = new RegExp('\\b' + src + '\\b', 'gi');
    out = out.replace(re, dst);
  }
  return out;
}

function sanitize(text, maxWords = 100) {
  let out = applyRioplatense(String(text || ''));
  for (const b of BANNED) {
    out = out.replace(new RegExp('\\b' + b + '\\b', 'gi'), '');
  }
  out = normalizeText(out);
  if (countWords(out) > maxWords) out = trimWords(out, maxWords);
  out = finalPunct(out);
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}

// --- Generación ---
const HEADLINE_FORMULAS = [
  (a) => a.properNouns[0] ? `${a.properNouns[0]}: ${trimWords(a.keySentence || a.title, 8)}` : null,
  (a) => `${capitalize(a.category)} · ${trimWords(sanitize(a.title, 100), 9)}`,
  (a) => a.numbers.length ? `${a.numbers[0]} ${a.topWords[0] || 'datos'} que cambiaron ${trimWords(sanitize(a.title, 100), 6)}` : null,
  (a) => `${trimWords(sanitize(a.title, 100), 7)}: lo que hay que saber`,
  (a) => a.properNouns[0] && a.properNouns[1] ? `${a.properNouns[0]} y ${a.properNouns[1]}: la historia completa` : null,
  (a) => `${trimWords(sanitize(a.title, 100), 7)}: por qué importa`,
  (a) => `La historia detrás de ${trimWords(sanitize(a.title, 100), 6)}`,
  (a) => a.quotes.length ? `"${trimWords(a.quotes[0], 12)}"` : null,
  (a) => `¿Qué pasa con ${trimWords(sanitize(a.title, 100), 6)}?`,
  (a) => a.numbers.length ? `${a.numbers[0]} claves para entender ${trimWords(sanitize(a.title, 100), 5)}` : null,
  (a) => a.properNouns[0] ? `Lo que ${a.properNouns[0]} no te contó` : null,
  (a) => `${trimWords(sanitize(a.title, 100), 6)}: datos que sorprenden`,
];

const BODY_FORMULAS = [
  (a) => a.lead ? sanitize(`${a.lead} ${pick(CONNECTORS.add)}, ${(a.keySentence || '').toLowerCase()}`, 100) : null,
  (a) => a.sentences.length >= 2 ? sanitize(`${a.sentences[0]} ${pick(CONNECTORS.sequence)}, ${a.sentences[1].toLowerCase()}`, 100) : null,
  (a) => a.quotes.length ? sanitize(`"${a.quotes[0]}", sostuvo ${a.properNouns[0] || 'el protagonista'}. ${a.sentences[1] || a.lead || ''}`, 100) : null,
  (a) => a.numbers.length ? sanitize(`${a.numbers[0]} ${a.topWords[0] || 'elementos'} marcan la diferencia. ${a.sentences[0] || a.title}`, 100) : null,
  (a) => a.properNouns[0] ? sanitize(`${a.properNouns[0]} es el centro de la historia. ${a.keySentence || a.lead || ''}`, 100) : null,
  (a) => sanitize(`${a.sentences[0] || a.lead || a.title} ${pick(CONNECTORS.cause)}, las consecuencias ya se sienten.`, 100),
];

function generateHeadline(a, maxWords = 10) {
  const tries = [...HEADLINE_FORMULAS].sort(() => Math.random() - 0.5);
  for (const f of tries) {
    try {
      const h = f(a);
      if (!h) continue;
      const clean = sanitize(capitalize(h), 100);
      const c = countWords(clean);
      if (c >= 3 && c <= maxWords) return clean;
    } catch (e) {}
  }
  return sanitize(capitalize(trimWords(a.title, maxWords)), 100);
}

function generateBody(a, minWords = 22, maxWords = 38) {
  const tries = [...BODY_FORMULAS].sort(() => Math.random() - 0.5);
  for (const f of tries) {
    try {
      const b = f(a);
      if (!b) continue;
      const clean = sanitize(b, 100);
      const c = countWords(clean);
      if (c >= minWords && c <= maxWords) return clean;
      if (c > maxWords) return trimWords(clean, maxWords);
    } catch (e) {}
  }
  return sanitize(a.lead || a.keySentence || a.title, 100);
}

function generateHashtags(category, topic, n = 4) {
  const base = ['#RevistaRandom'];
  const catTag = '#' + category.replace(/\s+/g, '').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '');
  const topicWords = tokenize(topic)
    .filter((x) => x.length > 4 && !STOPWORDS.has(x))
    .slice(0, 3)
    .map((x) => '#' + capitalize(x.replace(/[^a-záéíóúñ]/gi, '')));
  const pool = [...new Set([catTag, ...topicWords])].filter((x) => x.length > 2).slice(0, n - 1);
  return [...base, ...pool].join(' ');
}

function addBold(s) {
  const words = s.split(/\s+/);
  if (words.length < 6) return s;
  const idx = Math.floor(words.length / 2);
  const phrase = words.slice(idx, idx + Math.min(3, words.length - idx)).join(' ');
  if (phrase.length < 5) return s;
  return s.replace(phrase, '**' + phrase + '**');
}

// --- Análisis completo ---
function analyze(title, content) {
  const full = (title || '') + ' ' + (content || '');
  const sentences = splitSentences(content).slice(0, 8).map(cleanSentence);
  const analysis = {
    title: capitalize(normalizeText(title || '')),
    content: normalizeText(content || ''),
    category: detectCategory(title, content),
    interview: isInterview(title, content),
    quotes: extractQuotes(content),
    properNouns: extractProperNouns(full),
    numbers: extractNumbers(full),
    topWords: getTopWords(title, content, 15),
    sentences,
    lead: sentences[0] || '',
    keySentence: sentences[1] || sentences[0] || '',
  };
  return analysis;
}

// --- Generación de copys ---
// --- Detectar tipo de contenido ---
function detectContentType(analysis, news) {
  const text = (
    (news.title || '') + ' ' +
    (news.excerpt || '') + ' ' +
    (news.content || '')
  ).toLowerCase();

  // Entrevista (solo si el detector lo confirma)
  if (analysis.interview) return 'entrevista';

  // Estreno (películas, series, temporadas)
  if (/\b(estrena|estrenó|estreno|se estrena|próximo lanzamiento|nueva temporada|premiere|llega a los cines|llega al streaming|nuevo disco|nuevo álbum|nuevo libro|nueva novela)\b/.test(text)) {
    return 'estreno';
  }

  // Evento
  if (/\b(evento|festival|muestra|feria|concierto|recital|presentación|exposición|celebración|encuentro|seminario|congreso)\b/.test(text)) {
    return 'evento';
  }

  return 'noticia';
}

// --- Prefijo según tipo ---
function getPrefixForType(type) {
  const prefixes = {
    entrevista: '🎤 ENTREVISTA EXCLUSIVA',
    estreno: '🎬 ESTRENO',
    evento: '📅 EVENTO',
    noticia: '',
  };
  return prefixes[type] || '';
}

// --- Hashtags inteligentes basados en datos reales ---
function generateSmartHashtags(analysis, news) {
  const tags = ['#RevistaRandom'];

  // Categoría principal (ej: #Cine, #Libros, #Politica)
  const catTag = '#' + analysis.category.replace(/\s+/g, '').replace(/[^a-zA-Z0-9áéíóúñ]/gi, '');
  if (catTag.length > 2) tags.push(catTag);

  // Personas / lugares / obras mencionados (proper nouns)
  analysis.properNouns.slice(0, 4).forEach((p) => {
    // Limpiar: quitar espacios, tildes opcionales y caracteres raros
    const clean = p
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '');
    const tag = '#' + clean;
    if (tag.length > 3) tags.push(tag);
  });

  // Fuente como tag de contexto (si es de Revista Random, no lo duplicamos)
  if (news.sourceName && !/revista\s*random/i.test(news.sourceName)) {
    // Solo si es fuente custom o manual
    if (news.sourceId === 'custom_link' || news.sourceId === 'manual_text') {
      // no agregamos nada, ya tenemos el título
    }
  }

  // Dedupe y máximo 6
  return [...new Set(tags)].slice(0, 6).join(' ');
}

// --- Generación de copys (basada en datos reales) ---
export function generateCopys(news) {
  const a = analyze(news.title, news.excerpt || news.content || '');
  const type = detectContentType(a, news);
  const prefix = getPrefixForType(type);
  const hashtags = generateSmartHashtags(a, news);

  // Datos reales, sin cortes ni inventos
  const title = (news.title || '').trim();
  const bajada = (news.excerpt || news.content || '').trim().slice(0, 280);
  const link = news.link || '';

  // Bloque común: prefijo (si existe) + título + bajada
  const headBlock = prefix
    ? `${prefix}\n\n${title}`
    : title;

  const fullBlock = bajada
    ? `${headBlock}\n\n${bajada}`
    : headBlock;

  return {
    ig_post: `${fullBlock}\n\n${hashtags}`,

    ig_story: `${headBlock}\n\n${hashtags}`,

    facebook: `${fullBlock}${link ? `\n\n${link}` : ''}\n\n${hashtags}`,

    twitter: `${headBlock}${link ? `\n\n${link}` : ''}\n\n${hashtags}`,

    tiktok: `${headBlock}\n\n${hashtags}`,

    canal_difusion: `${fullBlock}${link ? `\n\n${link}` : ''}\n\n${hashtags}`,

    spotify: `TÍTULO: ${title}\n\nDESCRIPCIÓN:\n${bajada}`,

    youtube: `TÍTULO: ${title}\n\nDESCRIPCIÓN:\n${bajada}`,

    random_express: `CATEGORIA: ${a.category.toUpperCase()}\nTÍTULO: ${title}\nCOPETE: ${bajada}`,

    frases_destacadas: a.quotes.length > 0
      ? `"${a.quotes[0]}"`
      : bajada,

    carrusel_ig: `${fullBlock}\n\n${hashtags}`,
  };
}

// --- Contenido estructurado para el editor visual ---
export function generateStructuredContent(news, template = 'cover') {
  const a = analyze(news.title, news.content || news.excerpt || '');

  if (template === 'cover') {
    return {
      category: a.category.toUpperCase(),
      headline: generateHeadline(a, 8),
      body: addBold(generateBody(a, 18, 28)),
      quote: '',
      caption: '',
      ctaHead: '',
      ctaBody: '',
    };
  }

  if (template === 'quote') {
    return {
      category: a.category.toUpperCase(),
      headline: '',
      body: '',
      quote: a.quotes[0] || a.keySentence,
      caption: trimWords(a.lead || 'Así lo contó.', 14),
      ctaHead: '',
      ctaBody: '',
    };
  }

  if (template === 'cta') {
    return {
      category: a.category.toUpperCase(),
      headline: 'Leé la nota completa',
      body: 'Todo esto y mucho más en **revistarandom.com.ar**. Seguinos para más historias como esta.',
      quote: '',
      caption: '',
      ctaHead: '',
      ctaBody: '',
    };
  }

  // content (default)
  return {
    category: a.category.toUpperCase(),
    headline: generateHeadline(a, 8),
    body: addBold(generateBody(a, 26, 40)),
    quote: '',
    caption: '',
    ctaHead: '',
    ctaBody: '',
  };
}

// --- Generar un carrusel completo (varios slides) ---
export function generateCarouselSlides(news, numSlides = 4) {
  const a = analyze(news.title, news.content || news.excerpt || '');
  const slides = [];
  for (let i = 0; i < numSlides; i++) {
    const isFirst = i === 0;
    const isLast = i === numSlides - 1;
    let template = 'content';
    if (isFirst) template = 'cover';
    else if (isLast) template = 'cta';
    else if (numSlides >= 5 && i === Math.floor(numSlides / 2) && a.quotes.length) template = 'quote';

    let content;
    if (template === 'cover') {
      content = generateStructuredContent(news, 'cover');
    } else if (template === 'quote') {
      content = {
        category: a.category.toUpperCase(),
        headline: '',
        body: '',
        quote: a.quotes[0],
        caption: trimWords(a.sentences[i] || 'Así lo contó.', 14),
        ctaHead: '',
        ctaBody: '',
      };
    } else if (template === 'cta') {
      content = generateStructuredContent(news, 'cta');
    } else {
      content = generateStructuredContent(news, 'content');
    }

    slides.push({
      slideNumber: i + 1,
      template,
      grayscale: isLast,
      showArrow: !isLast,
      content,
    });
  }
  return slides;
}

// --- Contenido real (sin invención) ---
// Devuelve los datos tal cual vienen de la noticia.
export function extractRealContent(news) {
  const title = (news.title || '').trim();

  // Bajada: primer párrafo del content hasta el primer punto
  // Si no hay content, usamos el excerpt
  const rawSource = (news.content || '').trim() || (news.excerpt || '').trim();
  const bajada = extractFirstParagraph(rawSource);

  // Categoría: mejor candidata disponible
  let category = '';
  if (Array.isArray(news.wpCategories) && news.wpCategories.length > 0) {
    category = news.wpCategories[0];
  } else if (news.analysis && news.analysis.detectedCategory) {
    category = news.analysis.detectedCategory;
  } else if (Array.isArray(news.categories) && news.categories.length > 0) {
    category = news.categories[0];
  }

  return {
    category: (category || '').toUpperCase(),
    headline: title,
    body: bajada,
    quote: '',
    caption: '',
    ctaHead: '',
    ctaBody: '',
  };
}

// --- Extrae el primer párrafo hasta el primer punto ---
function extractFirstParagraph(text) {
  const clean = normalizeText(text || '');
  if (!clean) return '';

  // Cortar en el primer punto seguido de mayúscula o fin de texto.
  // Sin límite de longitud: queremos el párrafo COMPLETO hasta el primer punto.
  const match = clean.match(/^(.+?[.!?])(?:\s+[A-ZÁÉÍÓÚÑ¿¡]|$)/);
  if (match) {
    return match[1].trim();
  }

  // Si no hay ningún punto, devolvemos el texto completo
  return clean;
}