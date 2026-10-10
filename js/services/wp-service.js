// wp-service.js
// Consulta fuentes WordPress vía REST API.
// Trae hasta N artículos de los últimos D días.

export function hashLink(link) {
  let hash = 0;
  const str = String(link || '');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return 'n_' + Math.abs(hash).toString(36);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8211;|&#8212;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchWPSource(source) {
  const baseUrl = String(source.url || '').replace(/\/+$/, '');
  const daysBack = source.daysBack || 7;
  const perPage = source.perPage || 50;

  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - daysBack);
  const afterIso = afterDate.toISOString().split('.')[0];

  const params = new URLSearchParams({
    per_page: String(perPage),
    _embed: '1',
    after: afterIso,
    orderby: 'date',
    order: 'desc',
  });

  const url = `${baseUrl}/wp-json/wp/v2/posts?${params.toString()}`;
  console.log(`[wp] Consultando ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WP API HTTP ${res.status}`);

  const posts = await res.json();
  if (!Array.isArray(posts)) throw new Error('WP API no devolvió un array');

  return posts
    .map((post) => {
      const title = stripHtml(post.title?.rendered || '');
      const contentRaw = stripHtml(post.content?.rendered || '');
      const excerptRaw = stripHtml(post.excerpt?.rendered || '') || contentRaw;
      const excerpt = excerptRaw.slice(0, 240) + (excerptRaw.length > 240 ? '…' : '');
      const link = post.link || '';

      let imageUrl = null;
      const media = post._embedded?.['wp:featuredmedia']?.[0];
      if (media && media.source_url) imageUrl = media.source_url;

      
      // Extraer todas las imágenes del contenido HTML
      const contentHtml = post.content?.rendered || '';
      const contentImages = [];
      for (const m of contentHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
        if (m[1]) contentImages.push(m[1]);
      }
      const featured = imageUrl ? [imageUrl] : [];
      const allImages = [...new Set([...featured, ...contentImages])].filter(
        (u) => u && !u.endsWith('.svg') && !u.includes('pixel') && !u.includes('1x1')
      ).slice(0, 10);

      const wpCategories = [];
      const terms = post._embedded?.['wp:term'];
      if (Array.isArray(terms)) {
        terms.forEach((group) => {
          if (Array.isArray(group)) {
            group.forEach((term) => {
              if (term && term.name && term.taxonomy === 'category') {
                wpCategories.push(term.name);
              }
            });
          }
        });
      }

      // Fecha UTC: WP devuelve date_gmt como "YYYY-MM-DDTHH:MM:SS"
      let pubDate = null;
      if (post.date_gmt) pubDate = new Date(post.date_gmt + 'Z').toISOString();
      else if (post.date) pubDate = new Date(post.date).toISOString();

      return {
        id: hashLink(link),
        sourceId: source.id,
        sourceName: source.name,
        region: source.region,
        categories: source.categories || [],
        wpCategories,
        title,
        excerpt,
        content: contentRaw.slice(0, 4000),
        link,
        imageUrl: allImages[0] || null,
        images: allImages,
        pubDate,
        fetchedAt: new Date().toISOString(),
        method: 'wp_api',
      };
    })
    .filter((n) => n.title && n.link);
}