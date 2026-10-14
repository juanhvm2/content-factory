// .github/scripts/fetch-news.mjs
// Descarga las fuentes RSS, filtra por 48hs, y genera js/data/news.json.
// Corre en GitHub Actions cada 30 minutos (ver ../workflows/fetch-news.yml).

import { SEED_SOURCES } from '../../js/data/sources.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TIMEOUT_MS = 12000;
const HOURS_BACK = 24;
const CONCURRENCY = 16;
const OUTPUT_PATH = join(process.cwd(), 'js', 'data', 'news.json');
const USER_AGENT = 'Mozilla/5.0 (compatible; ContentFactory/1.0; +https://github.com/juanhvm2/content-factory)';
const MAX_PER_SOURCE = 60;

// ---------------------------------------------------------------------------
// Parser XML minimalista
// ---------------------------------------------------------------------------
function extractTag(xml, tag) {
  const safeTag = tag.replace(':', '\\:');
  const re = new RegExp(`<${safeTag}[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  let text = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  text = text.replace(/<[^>]*>/g, ' ');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8211;|&#8212;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function extractLink(block) {
  const m1 = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (m1) {
    const t = m1[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    if (t && !t.includes('<')) return t;
  }
  const m2 = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (m2) return m2[1];
  const m3 = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  if (m3) return m3[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  return '';
}

function parseXmlItems(xmlText) {
  const items = [];
  const itemRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = itemRegex.exec(xmlText)) !== null) {
    const block = m[2];
    items.push({
      title: extractTag(block, 'title'),
      link: extractLink(block),
      description: extractTag(block, 'description') || extractTag(block, 'summary') || '',
      pubDate:
        extractTag(block, 'pubDate') ||
        extractTag(block, 'published') ||
        extractTag(block, 'updated') ||
        extractTag(block, 'date') ||
        '',
      _rawBlock: block, // guardamos el bloque crudo para extraer la imagen
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Extracción de imagen del item
// ---------------------------------------------------------------------------
function isImageUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.endsWith('.svg')) return false;
  if (lower.includes('pixel')) return false;
  if (lower.includes('1x1')) return false;
  if (lower.includes('blank.gif')) return false;
  if (lower.startsWith('data:')) return false;
  return true;
}

function extractImageFromItem(item) {
  const block = item._rawBlock || '';
  const candidates = [];

  // 1. <media:content url="..." /> — suele ser la imagen grande
  for (const m of block.matchAll(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/gi)) {
    if (isImageUrl(m[1])) candidates.push({ url: m[1], priority: 1 });
  }

  // 2. <enclosure url="..." /> — imagen destacada oficial
  for (const m of block.matchAll(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/gi)) {
    if (isImageUrl(m[1])) candidates.push({ url: m[1], priority: 2 });
  }

  // 3. <media:thumbnail url="..." /> — miniatura (menos prioridad)
  for (const m of block.matchAll(/<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*>/gi)) {
    if (isImageUrl(m[1])) candidates.push({ url: m[1], priority: 4 });
  }

  // 4. <img src="..." /> en description/content — varía mucho la calidad
  for (const m of block.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    if (isImageUrl(m[1])) candidates.push({ url: m[1], priority: 3 });
  }

  if (candidates.length === 0) return null;

  // Ordenar por prioridad y elegir el primero
  candidates.sort((a, b) => a.priority - b.priority);

  // Entre los de igual prioridad, preferir URLs que sugieran "grande"
  const best = candidates[0];
  return best.url;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function isWithinHours(dateStr, hours) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const diffHours = (Date.now() - d.getTime()) / 1000 / 3600;
  return diffHours >= 0 && diffHours <= hours;
}

function hashLink(link) {
  let hash = 0;
  const str = String(link || '');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'n_' + Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Procesar una fuente
// ---------------------------------------------------------------------------
async function processSource(source) {
  const t0 = Date.now();
  const result = {
    id: source.id,
    ok: false,
    ms: 0,
    rawCount: 0,
    recentCount: 0,
    error: null,
    news: [],
  };

  try {
    const xmlText = await fetchWithTimeout(source.url, TIMEOUT_MS);
    const items = parseXmlItems(xmlText);
    result.rawCount = items.length;
    if (items.length === 0) throw new Error('Sin items en el feed');

    const recent = items
      .filter((it) => isWithinHours(it.pubDate, HOURS_BACK))
      .slice(0, MAX_PER_SOURCE);
    result.recentCount = recent.length;

    result.news = recent.map((it) => ({
      id: hashLink(it.link || it.title),
      sourceId: source.id,
      sourceName: source.name,
      region: source.region,
      categories: source.categories || [],
      title: it.title,
      link: it.link,
      excerpt: (it.description || '').slice(0, 220),
      imageUrl: extractImageFromItem(it),
      pubDate: it.pubDate || null,
      fetchedAt: new Date().toISOString(),
    }));

    result.ok = true;
  } catch (e) {
    result.error = e.message || String(e);
  }

  result.ms = Date.now() - t0;
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] 🚀 Inicio — ${SEED_SOURCES.length} fuentes`);

  const sources = SEED_SOURCES.filter((s) => !s.isOwn);
  const queue = [...sources];
  const results = [];
  let done = 0;

  async function worker() {
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) break;
      const r = await processSource(source);
      results.push(r);
      done++;
      if (done % 20 === 0) console.log(`   ... ${done}/${sources.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const allNews = results.flatMap((r) => r.news);

  const seen = new Set();
  const uniqueNews = allNews.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  uniqueNews.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  const withImage = uniqueNews.filter((n) => n.imageUrl).length;
  const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`⏱️  Tiempo:       ${elapsed}s`);
  console.log(`✅ OK:            ${ok.length}/${sources.length} (${Math.round((ok.length / sources.length) * 100)}%)`);
  console.log(`❌ Fallidas:     ${failed.length}`);
  console.log(`🎯 Noticias:     ${uniqueNews.length}`);
  console.log(`🖼️  Con imagen:   ${withImage} (${Math.round((withImage / uniqueNews.length) * 100)}%)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const output = {
    generatedAt: startTime.toISOString(),
    hoursBack: HOURS_BACK,
    totalSources: sources.length,
    okSources: ok.length,
    failedSources: failed.length,
    totalNews: uniqueNews.length,
    news: uniqueNews,
    failedIds: failed.map((r) => r.id),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output), 'utf-8');
  console.log(`💾 Guardado en: ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error('💥 Error fatal:', e);
  process.exit(1);
});