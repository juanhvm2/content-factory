// categories.js
// Categorías temáticas del sistema. Cada fuente puede pertenecer a varias.

export const CATEGORIES = [
  // General
  { id: 'general',     group: 'General',           name: 'General',            color: '#8b949e' },
  { id: 'politica',    group: 'General',           name: 'Política',           color: '#f85149' },
  { id: 'sociedad',    group: 'General',           name: 'Sociedad',           color: '#d29922' },

  // Cultura
  { id: 'arte',        group: 'Cultura',           name: 'Arte',               color: '#58a6ff' },
  { id: 'historia',    group: 'Cultura',           name: 'Historia',           color: '#fbbf24' },
  { id: 'libros',      group: 'Cultura',           name: 'Libros',             color: '#fbbf24' },

  // Entretenimiento
  { id: 'cine_tv',     group: 'Entretenimiento',   name: 'Cine y TV',          color: '#f472b6' },
  { id: 'streaming',   group: 'Entretenimiento',   name: 'Streaming',          color: '#f472b6' },
  { id: 'musica',      group: 'Entretenimiento',   name: 'Música',             color: '#f472b6' },
  { id: 'videojuegos', group: 'Entretenimiento',   name: 'Videojuegos',        color: '#22d3ee' },
  { id: 'eventos',     group: 'Entretenimiento',   name: 'Eventos',            color: '#f472b6' },

  // Vida y Estilo
  { id: 'deportes',    group: 'Vida y Estilo',     name: 'Deportes',           color: '#22d3ee' },
  { id: 'moda',        group: 'Vida y Estilo',     name: 'Moda',               color: '#22d3ee' },
  { id: 'salud',       group: 'Vida y Estilo',     name: 'Salud',              color: '#22d3ee' },
  { id: 'viajes',      group: 'Vida y Estilo',     name: 'Viajes',             color: '#22d3ee' },
  { id: 'espiritual',  group: 'Vida y Estilo',     name: 'Espiritualidad',     color: '#a78bfa' },

  // Tecno & Tendencias
  { id: 'ciencia',     group: 'Tecno & Tendencias', name: 'Ciencia',           color: '#58a6ff' },
  { id: 'tecnologia',  group: 'Tecno & Tendencias', name: 'Tecnología',        color: '#58a6ff' },
  { id: 'ia',          group: 'Tecno & Tendencias', name: 'Inteligencia Artificial', color: '#58a6ff' },
  { id: 'economia',    group: 'Tecno & Tendencias', name: 'Economía',          color: '#58a6ff' },
  { id: 'negocios',    group: 'Tecno & Tendencias', name: 'Negocios',          color: '#58a6ff' },
  { id: 'marketing',   group: 'Tecno & Tendencias', name: 'Marketing',         color: '#58a6ff' },

  // Gastronomía
  { id: 'gastronomia', group: 'Gastronomía',       name: 'Gastronomía',        color: '#3fb950' },
  { id: 'vinos',       group: 'Gastronomía',       name: 'Vinos',              color: '#3fb950' },
  { id: 'bodegas',     group: 'Gastronomía',       name: 'Bodegas',            color: '#3fb950' },
  { id: 'cocteleria',  group: 'Gastronomía',       name: 'Coctelería',         color: '#3fb950' },
  { id: 'restaurantes',group: 'Gastronomía',       name: 'Restaurantes',       color: '#3fb950' },
];

export const REGIONS = [
  { id: 'argentina',   name: 'Argentina',    flag: '🇦🇷' },
  { id: 'latam',       name: 'Latinoamérica',flag: '🌎' },
  { id: 'mundo',       name: 'Mundo',        flag: '🌍' },
];

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id);
}

export function getRegion(id) {
  return REGIONS.find((r) => r.id === id);
}