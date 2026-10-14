// factory-logos.js
// Persistencia y carga de logos para la Fábrica.
//
// Estrategia híbrida:
//  1. Logos oficiales viven en: assets/logos/random.png y assets/logos/express.png
//  2. Si el usuario sube un PNG desde la UI, ese "override" se guarda en IndexedDB
//  3. Si hay override → se usa ese
//  4. Si no → se carga el PNG oficial desde assets/
//  5. Si no existe el PNG oficial → se dibuja el texto "RANDOM" como fallback

import * as store from '../../core/store.js?v=48';

const DEFAULT_LOGO_CONFIG = {
  scale: 100,
  x: 5,           // % del ancho
  y: 5,           // % del alto
  opacity: 1,
  active: true,
  overrideDataUrl: null,   // base64 si el usuario subió uno
};

// --- Carga una imagen desde una URL (con manejo de errores) ---
function tryLoadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// --- Carga el logo oficial desde assets/logos/ ---
async function loadOfficialLogo(brand) {
  return await tryLoadImage(`assets/logos/${brand}.png`);
}

// --- Carga la config guardada en IndexedDB ---
async function loadLogoConfig(brand) {
  try {
    const saved = await store.get('logos', brand);
    return { ...DEFAULT_LOGO_CONFIG, ...(saved || {}) };
  } catch (err) {
    console.error(`[factory-logos] Error leyendo config de ${brand}`, err);
    return { ...DEFAULT_LOGO_CONFIG };
  }
}

// --- Guarda la config en IndexedDB ---
export async function saveLogoConfig(brand, config) {
  try {
    const merged = { ...DEFAULT_LOGO_CONFIG, ...config };
    await store.set('logos', brand, merged);
    console.log(`[factory-logos] Config ${brand} guardada`);
    return merged;
  } catch (err) {
    console.error(`[factory-logos] Error guardando config ${brand}`, err);
    return null;
  }
}

// --- Elimina el override (vuelve al logo oficial) ---
export async function clearLogoOverride(brand) {
  try {
    const current = await loadLogoConfig(brand);
    current.overrideDataUrl = null;
    await store.set('logos', brand, current);
    console.log(`[factory-logos] Override de ${brand} eliminado`);
    return current;
  } catch (err) {
    console.error(`[factory-logos] Error eliminando override ${brand}`, err);
    return null;
  }
}

// --- Carga un logo completo (imagen + config) listo para usar ---
export async function loadLogo(brand) {
  const config = await loadLogoConfig(brand);
  let image = null;
  let source = 'none';

  // 1. Intentar con override (base64 del usuario)
  if (config.overrideDataUrl) {
    image = await tryLoadImage(config.overrideDataUrl);
    if (image) {
      source = 'override';
    } else {
      console.warn(`[factory-logos] Override de ${brand} no cargó, probando oficial`);
    }
  }

  // 2. Si no hay override, usar el oficial
  if (!image) {
    image = await loadOfficialLogo(brand);
    if (image) source = 'official';
  }

  return { image, config, source };
}

// --- Carga los 2 logos en paralelo ---
export async function loadAllLogos() {
  const [random, express] = await Promise.all([
    loadLogo('random'),
    loadLogo('express'),
  ]);
  return { random, express };
}