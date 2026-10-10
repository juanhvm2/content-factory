// classifier.js
// Motor de clasificación automática de noticias.
// Analiza título y texto, detecta categoría, keywords, entidades,
// urgencia y sugiere formatos de contenido.

import { CATEGORIES } from '../data/categories.js??v=33';

// Palabras vacías en español (no aportan significado)
const STOPWORDS = new Set([
  'de','la','el','en','y','a','los','las','un','una','del','que','por','con','para','es','al','se','su','como','más',
  'pero','o','fue','este','ha','así','lo','ya','no','tiene','sin','sobre','entre','cuando','muy','también','había',
  'hasta','desde','todo','todos','cada','uno','donde','mientras','puede','ser','han','durante','tras','después',
  'antes','esa','eso','esta','estos','estas','ese','esos','esas','aquel','otra','otro','otras','otros','si',
  'porque','cual','cuales','quien','quienes','me','te','le','nos','os','les','mi','tu','mis','tus','sus',
  'yo','tú','él','ella','nosotros','ellos','ellas','usted','ustedes','hay','era','eran','será','fueron','sido',
  'estar','está','están','estaba','estaban','estado','tener','tiene','tienen','tenía','tenían','hacer','hace',
  'hacen','hacía','hecho','ir','voy','vas','va','vamos','van','iba','viene','vienen','puede','pueden','debe',
  'deben','querer','quiere','quieren','saber','sabe','saben','decir','dice','dicen','ver','veo','ves','ve',
  'ven','dar','da','dan','llevar','lleva','pasar','pasa','dejar','deja','quedar','queda','seguir','sigue',
  'encontrar','encuentra','llamar','llama','llegar','llega','creer','cree','pensar','piensa','parecer',
  'parece','sentir','siente','considerar','considera','convertir','convierte','tratar','trata','contar',
  'cuenta','explicar','explica','mostrar','muestra','presentar','presenta','permitir','permite','ofrecer',
  'ofrece','producir','produce','existir','existe','resultar','resulta','suponer','supone','representar',
  'representa','implicar','implica','incluir','incluye','mantener','mantiene','formar','forma','cumplir',
  'cumple','afectar','afecta','desarrollar','desarrolla','quién','quiénes','qué','cuál','cuáles','cómo','dónde','cuándo','cuánto','cuánta','cuántos','cuántas',
]);

// Keywords específicas por categoría (para scoring)
const CATEGORY_KEYWORDS = {
  politica: ['gobierno','ley','presidente','ministro','congreso','diputado','senador','elecciones','voto',
    'partido','oposición','decreto','estado','nación','provincia','municipio','intendente','gobernador',
    'cámara','senado','diputados','oficialismo','opositor'],
  sociedad: ['vecinos','barrio','comunidad','manifestación','protesta','reclamo','educación','escuela',
    'hospital','seguridad','violencia','género','derechos','diversidad','migración','vivienda','pobreza'],
  economia: ['inflación','dólar','peso','banco','mercado','acciones','inversión','empresa','negocio',
    'consumo','precio','impuesto','empleo','industria','exportación','importación','pbi','riesgo país',
    'fondo','bcra','finanzas','bolsa','recesión','superávit','déficit','tasa','bonos','deuda'],
  negocios: ['startup','emprendimiento','pyme','inversores','capital','ronda','adquisición','fusión',
    'ceo','fundador','empresa','corporativo','holding'],
  tecnologia: ['app','software','algoritmo','digital','internet','web','móvil','robot','chip','código',
    'programación','datos','nube','metaverso','chatbot','smartphone','hardware','wifi','5g','blockchain',
    'ciberseguridad','servidor','openai','google','apple','microsoft','meta'],
  ia: ['inteligencia artificial',' ia ','machine learning','deep learning','gpt','chatgpt','gemini',
    'claude','modelo','entrenamiento','redes neuronales','prompt','llm'],
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
  streaming: ['netflix','hbo','amazon','disney','prime','streaming','plataforma','estreno','catalogo',
    'serie','documental','miniserie'],
  musica: ['banda','músico','álbum','disco','canción','single','gira','recital','concierto','festival',
    'rock','pop','trap','cumbia','tango','folklore','jazz','spotify','vinilo'],
  videojuegos: ['videojuego','gaming','consola','playstation','xbox','nintendo','pc','steam','juego',
    'lanzamiento','estudio','desarrollador','esports'],
  moda: ['diseñador','colección','tendencia','moda','ropa','estilo','pasarela','modelo','marca',
    'boutique','textil','indumentaria','outfit','look','temporada'],
  viajes: ['viaje','destino','hotel','vuelo','playa','montaña','recorrido','tour','paisaje','aventura',
    'turismo','itinerario','ciudad','pueblo','patagonia','iguazú','bariloche'],
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

// Palabras que sugieren urgencia
const URGENCY_WORDS = ['urgente','último momento','última hora','ahora','breaking','alerta','emergencia',
  'evacuación','crisis','catástrofe','accidente','muerto','falleció','derrumbe','incendio','explosión',
  'detenido','arrestado','allanamiento','repentino','inmediato'];

// Palabras que sugieren entrevista
const INTERVIEW_PATTERNS = /entrevist|hablamos con|dialogamos con|nos cuenta|nos contó|conversamos con|en diálogo con|mano a mano con|charlamos con|declaró|dijo a|aseguró a/;

// --- Tokeniza y filtra stopwords ---
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\wáéíóúñü\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

// --- Detecta la categoría principal ---
export function detectCategory(title, excerpt) {
  const text = ((title || '') + ' ' + (excerpt || '')).toLowerCase();
  const scores = {};

  for (const [catId, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of kws) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const matches = text.match(regex);
      if (matches) score += matches.length * (kw.length > 6 ? 2 : 1);
    }
    scores[catId] = score;
  }

  let best = null;
  let bestScore = 0;
  for (const [cat, sc] of Object.entries(scores)) {
    if (sc > bestScore) {
      bestScore = sc;
      best = cat;
    }
  }

  return { category: best, score: bestScore, allScores: scores };
}

// --- Extrae keywords relevantes ---
export function extractKeywords(title, excerpt, max = 8) {
  const tokens = tokenize((title || '') + ' ' + (excerpt || ''));
  const freq = {};
  tokens.forEach((t) => {
    freq[t] = (freq[t] || 0) + 1;
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

// --- Extrae entidades (nombres propios simples) ---
export function extractEntities(title, excerpt, max = 6) {
  const text = (title || '') + '. ' + (excerpt || '');
  const matches = text.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}){0,2}/g) || [];
  const freq = {};
  matches.forEach((m) => {
    const trimmed = m.trim();
    if (trimmed.length < 4) return;
    // Descartar nombres de meses, días y palabras comunes
    if (/^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/i.test(trimmed)) return;
    freq[trimmed] = (freq[trimmed] || 0) + 1;
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([e]) => e);
}

// --- Detecta si es entrevista ---
export function isInterview(title, excerpt) {
  return INTERVIEW_PATTERNS.test((title || '') + ' ' + (excerpt || ''));
}

// --- Detecta si tiene citas ---
export function hasQuotes(text) {
  return /[""«][^""»]{15,}[""»]/.test(text || '');
}

// --- Calcula urgencia (0-100) ---
export function estimateUrgency(title, excerpt) {
  const text = ((title || '') + ' ' + (excerpt || '')).toLowerCase();
  let score = 0;
  URGENCY_WORDS.forEach((word) => {
    if (text.includes(word)) score += 15;
  });
  if (/último momento|última hora|breaking/.test(text)) score += 30;
  return Math.min(100, score);
}

// --- Sugiere formatos según el contenido ---
export function suggestFormats(analysis) {
  const formats = [];
  const { isInterview, hasQuotes, urgency, excerptLength } = analysis;

  // Post: siempre válido como base
  formats.push({ format: 'post', priority: 5, reason: 'Pieza universal' });

  // Carrusel: si hay mucho contenido o citas
  if (excerptLength > 200 || hasQuotes) {
    formats.push({
      format: 'carousel',
      priority: 8,
      reason: hasQuotes ? 'Citas textuales' : 'Contenido extenso',
    });
  } else {
    formats.push({ format: 'carousel', priority: 4, reason: 'Desarrollo en slides' });
  }

  // Historia: si es urgente o entrevista
  if (urgency > 30) {
    formats.push({ format: 'story', priority: 9, reason: 'Urgente' });
    formats.push({ format: 'stories', priority: 7, reason: 'Cobertura en secuencia' });
  } else if (isInterview) {
    formats.push({ format: 'story', priority: 7, reason: 'Entrevista' });
    formats.push({ format: 'stories', priority: 8, reason: 'Cita destacada' });
  } else {
    formats.push({ format: 'story', priority: 3, reason: 'Aviso rápido' });
    formats.push({ format: 'stories', priority: 4, reason: 'Secuencia corta' });
  }

  return formats.sort((a, b) => b.priority - a.priority);
}

// --- Función principal: analiza una noticia completa ---
export function analyzeNews(news) {
  const title = news.title || '';
  const excerpt = news.excerpt || '';

  const catDetection = detectCategory(title, excerpt);
  const keywords = extractKeywords(title, excerpt, 8);
  const entities = extractEntities(title, excerpt, 6);
  const interview = isInterview(title, excerpt);
  const quotes = hasQuotes(excerpt);
  const urgency = estimateUrgency(title, excerpt);

  const analysis = {
    detectedCategory: catDetection.category,
    categoryScore: catDetection.score,
    keywords,
    entities,
    isInterview: interview,
    hasQuotes: quotes,
    urgency,
    excerptLength: excerpt.length,
  };

  analysis.suggestedFormats = suggestFormats(analysis);
  return analysis;
}