// sources.js
// Catálogo semilla de fuentes RSS. Se cargan una sola vez al iniciar la app.
// A partir de acá, el usuario puede agregar, editar o desactivar fuentes.

export const SEED_SOURCES = [
  // --- Argentina ---
  { id: 'ar_clarin_ult',    name: 'Clarín Último Momento', url: 'https://www.clarin.com/rss/lo-ultimo/', region: 'argentina', categories: ['general', 'politica', 'sociedad'] },
  { id: 'ar_infobae',       name: 'Infobae Argentina',     url: 'https://www.infobae.com/argentina-footer/infobae/rss/', region: 'argentina', categories: ['general', 'politica'] },
  { id: 'ar_perfil',        name: 'Perfil',                url: 'https://www.perfil.com/feed', region: 'argentina', categories: ['general', 'politica'] },
  { id: 'ar_lavoz',         name: 'La Voz (Córdoba)',      url: 'https://www.lavoz.com.ar/arc/outboundfeeds/rss/', region: 'argentina', categories: ['general', 'sociedad'] },
  { id: 'ar_rionegro',      name: 'Río Negro',             url: 'https://www.rionegro.com.ar/feed/', region: 'argentina', categories: ['general'] },
  { id: 'ar_clarin_eco',    name: 'Clarín Economía',       url: 'https://www.clarin.com/rss/economia/', region: 'argentina', categories: ['economia', 'negocios'] },
  { id: 'ar_clarin_tec',    name: 'Clarín Tecnología',     url: 'https://www.clarin.com/rss/tecnologia/', region: 'argentina', categories: ['tecnologia', 'ia'] },
  { id: 'ar_clarin_dep',    name: 'Clarín Deportes',       url: 'https://www.clarin.com/rss/deportes/', region: 'argentina', categories: ['deportes'] },
  { id: 'ar_clarin_soc',    name: 'Clarín Sociedad',       url: 'https://www.clarin.com/rss/sociedad/', region: 'argentina', categories: ['sociedad', 'salud'] },
  { id: 'ar_clarin_enie',   name: 'Revista Ñ (Clarín)',    url: 'https://www.clarin.com/rss/revista-enie/', region: 'argentina', categories: ['libros', 'arte'] },
  { id: 'ar_p12_cash',      name: 'Página/12 Cash',        url: 'https://www.pagina12.com.ar/rss/suplementos/cash/notas', region: 'argentina', categories: ['economia'] },
  { id: 'ar_p12_radar',     name: 'Página/12 Radar',       url: 'https://www.pagina12.com.ar/rss/suplementos/radar/notas', region: 'argentina', categories: ['arte', 'libros'] },
  { id: 'ar_p12_esp',       name: 'Página/12 Espectáculos',url: 'https://www.pagina12.com.ar/rss/secciones/espectaculos/notas', region: 'argentina', categories: ['cine_tv', 'musica'] },
  { id: 'ar_indiehoy',      name: 'Indie Hoy',             url: 'https://indiehoy.com/feed/', region: 'argentina', categories: ['musica', 'arte'] },
  { id: 'ar_cinesarg',      name: 'Cines Argentinos',      url: 'https://www.cinesargentinos.com.ar/rss/', region: 'argentina', categories: ['cine_tv'] },
  { id: 'ar_escribiendo',   name: 'EscribiendoCine',       url: 'https://www.escribiendocine.com/rss', region: 'argentina', categories: ['cine_tv'] },
  { id: 'ar_lanacion_tec',  name: 'La Nación Tecnología',  url: 'https://www.lanacion.com.ar/rss/tecnologia/', region: 'argentina', categories: ['tecnologia'] },
  { id: 'ar_eleco_tec',     name: 'El Economista Tech',    url: 'https://eleconomista.com.ar/tech/feed/', region: 'argentina', categories: ['tecnologia', 'negocios'] },
  { id: 'ar_perfil_esp',    name: 'Perfil Espectáculos',   url: 'https://www.perfil.com/feed/espectaculos', region: 'argentina', categories: ['cine_tv', 'musica'] },

  // --- Latinoamérica ---
  { id: 'lat_sinc',         name: 'SINC Ciencia',          url: 'https://www.agenciasinc.es/rss/feed/all', region: 'latam', categories: ['ciencia'] },
  { id: 'lat_elpais_cien',  name: 'El País Ciencia',       url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada', region: 'latam', categories: ['ciencia'] },
  { id: 'lat_ncyt',         name: 'NCYT',                  url: 'https://noticiasdelaciencia.com/rss.xml', region: 'latam', categories: ['ciencia', 'tecnologia'] },
  { id: 'lat_gizmodo',      name: 'Gizmodo ES',            url: 'https://es.gizmodo.com/rss', region: 'latam', categories: ['tecnologia'] },
  { id: 'lat_espinof',      name: 'Espinof',               url: 'https://www.espinof.com/index.xml', region: 'latam', categories: ['cine_tv', 'streaming'] },
  { id: 'lat_sensacine',    name: 'Sensacine',             url: 'https://www.sensacine.com/rss/noticias.xml', region: 'latam', categories: ['cine_tv'] },
  { id: 'lat_vidaextra',    name: 'VidaExtra',             url: 'https://www.vidaextra.com/index.xml', region: 'latam', categories: ['videojuegos'] },
  { id: 'lat_ign',          name: 'IGN España',            url: 'https://es.ign.com/feed.xml', region: 'latam', categories: ['videojuegos'] },
  { id: 'lat_mondo',        name: 'MondoSonoro',           url: 'https://www.mondosonoro.com/feed/', region: 'latam', categories: ['musica'] },
  { id: 'lat_bloomberg',    name: 'Bloomberg Línea',       url: 'https://www.bloomberglinea.com/feed/', region: 'latam', categories: ['economia', 'negocios'] },
  { id: 'lat_vinetur',      name: 'Vinetur',               url: 'https://www.vinetur.com/feed', region: 'latam', categories: ['vinos', 'bodegas'] },
  { id: 'lat_mentees',      name: 'La Mente es Maravillosa', url: 'https://lamenteesmaravillosa.com/feed/', region: 'latam', categories: ['espiritual', 'salud'] },

  // --- Mundo ---
  { id: 'mu_scidaily',      name: 'ScienceDaily',          url: 'https://www.sciencedaily.com/rss/all.xml', region: 'mundo', categories: ['ciencia'] },
  { id: 'mu_phys',          name: 'Phys.org',              url: 'https://phys.org/rss-feed/', region: 'mundo', categories: ['ciencia'] },
  { id: 'mu_space',         name: 'Space.com',             url: 'https://www.space.com/feeds/all', region: 'mundo', categories: ['ciencia'] },
  { id: 'mu_nature',        name: 'Nature',                url: 'https://www.nature.com/nature.rss', region: 'mundo', categories: ['ciencia', 'tecnologia'] },
  { id: 'mu_verge',         name: 'The Verge',             url: 'https://www.theverge.com/rss/index.xml', region: 'mundo', categories: ['tecnologia'] },
  { id: 'mu_techcrunch',    name: 'TechCrunch',            url: 'https://techcrunch.com/feed/', region: 'mundo', categories: ['tecnologia', 'negocios'] },
  { id: 'mu_arstechnica',   name: 'Ars Technica',          url: 'https://feeds.arstechnica.com/arstechnica/index', region: 'mundo', categories: ['tecnologia'] },
  { id: 'mu_wired',         name: 'Wired',                 url: 'https://www.wired.com/feed/rss', region: 'mundo', categories: ['tecnologia'] },
  { id: 'mu_engadget',      name: 'Engadget',              url: 'https://www.engadget.com/rss.xml', region: 'mundo', categories: ['tecnologia'] },
  { id: 'mu_variety',       name: 'Variety',               url: 'https://variety.com/v/film/feed/', region: 'mundo', categories: ['cine_tv'] },
  { id: 'mu_pitchfork',     name: 'Pitchfork',             url: 'https://pitchfork.com/feed/feed-news/rss', region: 'mundo', categories: ['musica'] },
  { id: 'mu_atlas',         name: 'Atlas Obscura',         url: 'https://www.atlasobscura.com/feeds/latest', region: 'mundo', categories: ['viajes', 'arte'] },
  // --- Fuente propia (Revista Random) ---
    { id: 'rr_home', name: 'Revista Random', url: 'https://revistarandom.com.ar', region: 'argentina', categories: ['general', 'arte', 'libros'], isOwn: true, method: 'wp_api', daysBack: 7, perPage: 50 },
];