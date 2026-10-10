// brands.js
// Definición de las marcas editoriales y detección automática.

export const BRANDS = [
  { id: 'express', name: 'Random Express', short: 'E', color: '#f85149' },
  { id: 'random',  name: 'Random',         short: 'R', color: '#a371f7' },
];

const RANDOM_SOURCE_URL = 'revistarandom.com.ar';

// Solo las noticias de revistarandom.com.ar van a Random.
// Todo el resto va a Express por defecto.
export function detectBrand(news) {
  const url = (news.link || '').toLowerCase();
  const sourceUrl = (news.sourceUrl || '').toLowerCase();
  const sourceName = (news.sourceName || '').toLowerCase();

  if (
    url.includes(RANDOM_SOURCE_URL) ||
    sourceUrl.includes(RANDOM_SOURCE_URL) ||
    sourceName.includes('revista random') ||
    sourceName.includes('revistarandom')
  ) {
    return 'random';
  }
  return 'express';
}

export function getBrand(id) {
  return BRANDS.find((b) => b.id === id) || BRANDS[0];
}