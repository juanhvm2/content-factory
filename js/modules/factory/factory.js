// factory.js
// Módulo Fábrica de Contenidos. Workspace unificado.

import * as store from '../../core/store.js?v=52';
import { extractRealContent } from '../../services/rules-engine.js?v=52';
import {
  saveWorkingState,
  loadWorkingState,
  listPresets,
  savePreset,
  deletePreset,
} from './factory-persistence.js?v=52';
import { loadAllLogos, saveLogoConfig, clearLogoOverride } from './factory-logos.js?v=52';
import { exportCurrentSlide, exportAllAsZip } from './factory-exporter.js?v=52';
import { savePiecesToQuality } from './factory-quality-bridge.js?v=52';
import { refreshQuality } from '../quality/quality.js?v=52';
import { extractFromLink } from '../../services/link-extractor.js?v=52';

// --- Configuración por defecto de cada formato ---
const DEFAULT_FORMAT_CONFIG = {
  tplFont: 'inter',
  tplHeadColor: '#ffffff',
  tplBodyColor: '#ffffff',
  tplCatColor: '#ffffff',
  tplOverlayColor: '#000000',
  tplHeadSize: 1.00,
  tplBodySize: 1.00,
  tplCatSize: 1.00,
  tplMarginL: 0.12,
  tplMarginR: 0.10,
  tplMarginB: 0.08,
};

// --- Configuración por defecto de imagen (offset, escala, etc.) ---
const DEFAULT_IMG_CONFIG = {
  imgOffsetX: 0,
  imgOffsetY: 0,
  imgScale: 100,
  imgAlign: 'center',
  imgVAlign: 'center',
  imgGray: false,
  imgOpacity: 1,
};

const state = {
  currentWorkItem: null,
  format: 'post',
  activeTool: 'texto',
    currentContent: null,
  currentImage: null,
  selectedImageUrl: null,
    // Config de imagen por formato sin slides (post, story)
  imgConfigs: {
    post: { ...DEFAULT_IMG_CONFIG },
    story: { ...DEFAULT_IMG_CONFIG },
  },
  // Config de plantilla por formato (independiente para cada uno)
  formatConfigs: {
    post: { ...DEFAULT_FORMAT_CONFIG },
    story: { ...DEFAULT_FORMAT_CONFIG },
    stories: { ...DEFAULT_FORMAT_CONFIG },
    carousel: { ...DEFAULT_FORMAT_CONFIG },
  },
    // Preset activo
  activePresetId: null,
  activePresetBrand: null,
  // Logos (imágenes + config por brand)
  logos: {
    random: null,
    express: null,
  },
  // Slides (para Carrusel e Historias)
  // Cada slide: { id, template, content: {category, headline, body}, imageUrl, selectedImageUrl, image: HTMLImageElement|null }
  slides: [],
  currentSlideIdx: 0,
  // Panel Blog
  blogContentLoading: false,
  blogContentError: null,
};

// --- Devuelve la config del formato actual ---
function curTpl() {
  return state.formatConfigs[state.format] || state.formatConfigs.post;
}

// --- Devuelve la config de imagen del contexto activo ---
// Si el formato tiene slides → usa el slide activo
// Si no → usa la config del formato (post/story)
function getActiveImgConfig() {
  const dims = FORMAT_DIMS[state.format];
  if (dims.slides) {
    const slide = state.slides[state.currentSlideIdx];
    if (slide) {
      if (!slide.imgConfig) {
        slide.imgConfig = { ...DEFAULT_IMG_CONFIG };
      }
      return slide.imgConfig;
    }
  }
  // Sin slides: usar imgConfigs[formato]
  if (!state.imgConfigs[state.format]) {
    state.imgConfigs[state.format] = { ...DEFAULT_IMG_CONFIG };
  }
  return state.imgConfigs[state.format];
}

// --- Actualiza la config de imagen del contexto activo ---
function updateActiveImgConfig(partial) {
  const current = getActiveImgConfig();
  const merged = { ...current, ...partial };

  const dims = FORMAT_DIMS[state.format];
  if (dims.slides) {
    const slide = state.slides[state.currentSlideIdx];
    if (slide) {
      slide.imgConfig = merged;
      return;
    }
  }
  state.imgConfigs[state.format] = merged;
}

const FORMAT_DIMS = {
  post: { w: 1080, h: 1350, label: 'Post', slides: false },
  story: { w: 1080, h: 1920, label: 'Historia', slides: false },
  stories: { w: 1080, h: 1920, label: 'Historias', slides: true },
  carousel: { w: 1080, h: 1350, label: 'Carrusel', slides: true },
  frases: { w: 1080, h: 1350, label: 'Frases', slides: false, underConstruction: true },
  grilla: { w: 1080, h: 1920, label: 'Grilla', slides: false, underConstruction: true },
};

// --- Cargar imagen con fallback ---
function tryLoadImg(u, useCors = false) {
  return new Promise((resolve) => {
    const i = new Image();
    if (useCors) i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = u;
  });
}

async function loadImageSmart(u) {
  if (!u) return null;

  // Intento 1: sin CORS (rápido, siempre que el servidor lo permita)
  let img = await tryLoadImg(u, false);
  if (img) {
    console.log('[factory] Imagen OK (sin CORS):', u);
    return img;
  }

  // Intento 2: con CORS (necesario para exportar más adelante)
  img = await tryLoadImg(u, true);
  if (img) {
    console.log('[factory] Imagen OK (con CORS):', u);
    return img;
  }

  // Intento 3: proxys
  const stripped = u.replace(/^https?:\/\//, '');
  img = await tryLoadImg('https://images.weserv.nl/?url=' + encodeURIComponent(stripped), false);
  if (img) {
    console.log('[factory] Imagen OK (weserv):', u);
    return img;
  }

  img = await tryLoadImg('https://corsproxy.io/?url=' + encodeURIComponent(u), false);
  if (img) {
    console.log('[factory] Imagen OK (corsproxy):', u);
    return img;
  }

  console.warn('[factory] No se pudo cargar imagen:', u);
  return null;
}

// --- Utilidades de dibujo ---
function wrapPlain(ctx, text, maxWidth, fontCss, size, weight = 700) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  ctx.font = `${weight} ${size}px ${fontCss}`;
  words.forEach((w) => {
    const test = current ? current + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawCoverImg(ctx, img, W, H, imgRegionRatio = 0.78) {
  const cfg = getActiveImgConfig();

  const regionH = Math.round(H * imgRegionRatio);
  const r = img.width / img.height;
  const R = W / regionH;
  let dw, dh, dx, dy;

  // 1. Ajuste base tipo "cover" según alineación horizontal
  if (r > R) {
    dh = regionH;
    dw = regionH * r;
    if (cfg.imgAlign === 'left') dx = 0;
    else if (cfg.imgAlign === 'right') dx = W - dw;
    else dx = (W - dw) / 2;
    dy = 0;
  } else {
    dw = W;
    dh = W / r;
    dx = 0;
    if (cfg.imgVAlign === 'top') dy = 0;
    else if (cfg.imgVAlign === 'bottom') dy = regionH - dh;
    else dy = (regionH - dh) / 2;
  }

  // 2. Aplicar zoom alrededor del centro de la imagen
  const sf = (cfg.imgScale || 100) / 100;
  const centerX = dx + dw / 2;
  const centerY = dy + dh / 2;
  dw *= sf;
  dh *= sf;
  dx = centerX - dw / 2;
  dy = centerY - dh / 2;

  // 3. Aplicar offset de arrastre (en % del canvas)
  dx += ((cfg.imgOffsetX || 0) / 100) * W;
  dy += ((cfg.imgOffsetY || 0) / 100) * H;

  // 4. Dibujar con opacidad y filtros
  const hf = (typeof ctx.filter !== 'undefined');
  ctx.save();
  ctx.globalAlpha = cfg.imgOpacity || 1;
  if (cfg.imgGray && hf) {
    ctx.filter = 'grayscale(100%) contrast(1.1)';
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  ctx.restore();
}

function drawOverlay(ctx, W, H) {
  // Convierte #RRGGBB a rgb(r,g,b)
  const tpl = curTpl();
  const hex = String(tpl.tplOverlayColor || '#000000').replace('#', '');
  const full = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.30, `rgba(${r},${g},${b},0.1)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.75)`);
  grad.addColorStop(0.70, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.78, `rgba(${r},${g},${b},1)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawFallbackBg(ctx, W, H) {
  const isExpress = state.currentWorkItem?.brand === 'express';

  // Degradado principal según brand
  const g = ctx.createLinearGradient(0, 0, W, H);
  if (isExpress) {
    g.addColorStop(0, '#1a0a0a');
    g.addColorStop(1, '#2b0f0f');
  } else {
    g.addColorStop(0, '#12101c');
    g.addColorStop(1, '#1a1530');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Patrón sutil diagonal
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  for (let i = -H; i < W; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Dibuja el logo del brand activo en el canvas ---
function drawLogo(ctx, W, H) {
  const brand = state.currentWorkItem?.brand === 'express' ? 'express' : 'random';
  const logo = state.logos?.[brand];
  if (!logo) return;

  const cfg = logo.config || {};
  if (cfg.active === false) return;

  // Si hay imagen (override o assets oficiales), dibujarla
  if (logo.image) {
    const scaleFactor = (cfg.scale || 100) / 100;

    // Ancho máximo base de 200px, escalado
    const maxWidth = 200 * scaleFactor;
    const maxHeight = 200 * scaleFactor;

    // Mantener aspecto
    const ratio = logo.image.width / logo.image.height;
    let dw, dh;
    if (ratio > 1) {
      dw = maxWidth;
      dh = maxWidth / ratio;
    } else {
      dh = maxHeight;
      dw = maxHeight * ratio;
    }

    // Posición según % configurado
    const x = ((cfg.x ?? 74) / 100) * W;
    const y = ((cfg.y ?? 5) / 100) * H;

    ctx.save();
    ctx.globalAlpha = cfg.opacity ?? 1;
    ctx.drawImage(logo.image, x, y, dw, dh);
    ctx.restore();
    return;
  }

  // Fallback: texto si no hay imagen
  const brandLabel = brand === 'express' ? 'RANDOM EXPRESS' : 'RANDOM';
  const brandColor = brand === 'express' ? '#f85149' : '#a371f7';

  ctx.save();
  ctx.font = `700 ${Math.round(W * 0.024)}px "Inter", sans-serif`;
  ctx.fillStyle = brandColor;
  ctx.textAlign = 'left';
  const x = ((cfg.x ?? 5) / 100) * W;
  const y = ((cfg.y ?? 5) / 100) * H + Math.round(W * 0.024);
  ctx.fillText(brandLabel, x, y);
  ctx.restore();
}

// --- Render principal ---
async function renderCanvas() {
  const canvas = document.getElementById('factory-canvas');
  if (!canvas) return;

  bindCanvasDrag();

  const dims = FORMAT_DIMS[state.format];
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  const W = dims.w;
  const H = dims.h;

  // Fondo
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Imagen
  if (state.currentImage) {
    drawCoverImg(ctx, state.currentImage, W, H, 0.78);
  } else {
    drawFallbackBg(ctx, W, H);
  }

  // Overlay
  drawOverlay(ctx, W, H);

    // Si no hay contenido, dibujamos solo el logo y terminamos
  if (!state.currentContent) {
    drawLogo(ctx, W, H);
    return;
  }

      const c = state.currentContent;
  const tpl = curTpl();

  // --- Mapa de fuentes ---
  const FONTS = {
    inter:     '"Inter", "Helvetica Neue", Arial, sans-serif',
    helvetica: '"Helvetica Neue", Arial, sans-serif',
    georgia:   'Georgia, "Times New Roman", serif',
    impact:    'Impact, "Arial Black", sans-serif',
    courier:   '"Courier New", monospace',
  };
  const fontCss = FONTS[tpl.tplFont] || FONTS.inter;

  // --- Márgenes y ancho útil ---
  const PADL = W * tpl.tplMarginL;
  const PADR = W * tpl.tplMarginR;
  const maxW = W - PADL - PADR;

  // --- Tamaños con multiplicadores ---
  const catSize = Math.round(W * 0.033 * tpl.tplCatSize);
  const headSize = Math.round(W * 0.089 * tpl.tplHeadSize);
  const bodySize = Math.round(W * 0.031 * tpl.tplBodySize);

  // Calcular bloque total
  const catLines = c.category ? [c.category] : [];
  const headLines = c.headline ? wrapPlain(ctx, c.headline, maxW, fontCss, headSize, 700) : [];
  const bodyLines = c.body ? wrapPlain(ctx, c.body.replace(/\*\*/g, ''), maxW, fontCss, bodySize, 400) : [];

  const catH = catLines.length * (catSize * 1.2);
  const headH = headLines.length * (headSize * 1.1);
  const bodyH = bodyLines.length * (bodySize * 1.5);
  const gapCatHead = catLines.length && headLines.length ? 32 : 0;
  const gapHeadBody = headLines.length && bodyLines.length ? 40 : 0;
  const totalH = catH + gapCatHead + headH + gapHeadBody + bodyH;

  const bottomMargin = H * tpl.tplMarginB;
  let y = H - bottomMargin - totalH;

  ctx.textAlign = 'left';

  // Categoría
  if (catLines.length) {
    ctx.font = `400 ${catSize}px ${fontCss}`;
    ctx.fillStyle = tpl.tplCatColor;
    catLines.forEach((line) => {
      ctx.fillText(line, PADL, y + catSize * 0.9);
      y += catSize * 1.2;
    });
  }

  if (gapCatHead) y += gapCatHead;

  // Headline
  if (headLines.length) {
    ctx.font = `700 ${headSize}px ${fontCss}`;
    ctx.fillStyle = tpl.tplHeadColor;
    headLines.forEach((line) => {
      ctx.fillText(line, PADL, y + headSize * 0.85);
      y += headSize * 1.1;
    });
  }

  if (gapHeadBody) y += gapHeadBody;

  // Body
  if (bodyLines.length) {
    ctx.font = `400 ${bodySize}px ${fontCss}`;
    ctx.fillStyle = tpl.tplBodyColor;
    bodyLines.forEach((line) => {
      ctx.fillText(line, PADL, y + bodySize * 0.9);
      y += bodySize * 1.5;
    });
  }

   // Logo del brand (override / oficial / fallback texto)
  drawLogo(ctx, W, H);
}

// --- UI base ---
function injectFactoryUI() {
  const view = document.querySelector('.module-view[data-module-view="factory"]');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';

  view.innerHTML = `
    <div class="factory-workspace">
      <div class="factory-topbar">
        <div class="factory-topbar-left">
          <div class="factory-mode-selector" id="factory-mode-selector">
            <button class="factory-mode-btn is-active" data-format="post">📸 Post</button>
            <button class="factory-mode-btn" data-format="story">📱 Historia</button>
            <button class="factory-mode-btn" data-format="stories">📚 Historias</button>
            <button class="factory-mode-btn" data-format="carousel">🎠 Carrusel</button>
            <button class="factory-mode-btn" data-format="frases">💬 Frases</button>
            <button class="factory-mode-btn" data-format="grilla">▦ Grilla</button>
          </div>
        </div>
        <div class="factory-topbar-center">
          <div class="factory-workitem-info" id="factory-workitem-info">
            <span class="factory-workitem-empty">Sin trabajo cargado</span>
          </div>
        </div>
               <div class="factory-topbar-actions">
          <button class="btn btn-sm" id="factory-generate" disabled>⚡ Generar</button>
          <button class="btn btn-sm btn-quality" id="factory-send-quality" disabled>📥 Enviar a Calidad</button>
          <button class="btn btn-sm btn-primary" id="factory-export" disabled>⬇️ Exportar</button>
        </div>
      </div>

      <div class="factory-body">
        <aside class="factory-toolbar" id="factory-toolbar">
          <button class="factory-tool-btn is-active" data-tool="texto"><span class="factory-tool-icon">📝</span><span class="factory-tool-label">Texto</span></button>
          <button class="factory-tool-btn" data-tool="imagen"><span class="factory-tool-icon">🖼️</span><span class="factory-tool-label">Imagen</span></button>
          <button class="factory-tool-btn" data-tool="plantilla"><span class="factory-tool-icon">🎨</span><span class="factory-tool-label">Plantilla</span></button>
          <button class="factory-tool-btn" data-tool="logo"><span class="factory-tool-icon">⭐</span><span class="factory-tool-label">Logo</span></button>
          <button class="factory-tool-btn" data-tool="capas"><span class="factory-tool-icon">📚</span><span class="factory-tool-label">Capas</span></button>
        </aside>

        <aside class="factory-tool-panel" id="factory-tool-panel"></aside>

        <main class="factory-canvas-wrap">
          <div class="factory-canvas-container" id="factory-canvas-container">
            <canvas id="factory-canvas" width="1080" height="1350"></canvas>
                        <div class="factory-canvas-placeholder" id="factory-canvas-placeholder">
              <div class="factory-placeholder-content">
                <div class="factory-placeholder-icon">🏭</div>
                <div class="factory-placeholder-title">Bienvenido a la Fábrica</div>
                <div class="factory-placeholder-sub">Cargá un trabajo desde el <strong>Galpón</strong><br>y hacé clic en <strong>⚡ Generar</strong>.</div>
                <div class="factory-placeholder-dims" id="factory-placeholder-dims">1080 × 1350 · Post</div>
              </div>
            </div>
            <div class="factory-under-construction" id="factory-under-construction" style="display:none;">
              <div class="factory-uc-icon" id="factory-uc-icon">💬</div>
              <span class="factory-uc-badge" id="factory-uc-badge">En construcción</span>
              <h2 class="factory-uc-title" id="factory-uc-title">Muy pronto</h2>
              <p class="factory-uc-sub" id="factory-uc-sub"></p>
            </div>
          </div>
        </main>

        <aside class="factory-properties" id="factory-properties">
          <div id="factory-blog-root"></div>
        </aside>
      </div>

      <div class="factory-slides-bar factory-slides-hidden" id="factory-slides-bar">
        <div class="factory-slides-info" id="factory-slides-info">Slides</div>
        <div class="factory-slides-strip" id="factory-slides-strip">
          <div class="factory-slides-empty">Los slides aparecerán cuando cargues un trabajo con formato de Carrusel o Historias</div>
        </div>
      </div>
    </div>
  `;

   bindTopbar();
  bindToolbar();
  bindGenerateButton();
  bindExportButton();
  bindQualityButton();
}

function bindTopbar() {
  const modeSelector = document.getElementById('factory-mode-selector');
  if (!modeSelector) return;
  modeSelector.querySelectorAll('.factory-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setFormat(btn.dataset.format));
  });
}

function bindToolbar() {
  const toolbar = document.getElementById('factory-toolbar');
  if (!toolbar) return;
  toolbar.querySelectorAll('.factory-tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });
}

function bindGenerateButton() {
  const btn = document.getElementById('factory-generate');
  if (!btn) return;
  btn.addEventListener('click', () => generateContent());
}

// --- Botón Exportar ---
function bindExportButton() {
  const btn = document.getElementById('factory-export');
  if (!btn) return;
  btn.addEventListener('click', () => handleExport());
}

// --- Botón Enviar a Calidad ---
function bindQualityButton() {
  const btn = document.getElementById('factory-send-quality');
  if (!btn) return;
  btn.addEventListener('click', () => handleSendToQuality());
}

async function handleSendToQuality() {
  const btn = document.getElementById('factory-send-quality');
  const originalText = btn.innerHTML;

  if (!state.currentWorkItem) {
    alert('No hay trabajo cargado en la Fábrica.');
    return;
  }

  const dims = FORMAT_DIMS[state.format];
  const hasSlides = dims.slides && state.slides.length > 0;

  // Si es carrusel o historias, preguntar si guarda solo el actual o todos
  let mode = 'current';
  if (hasSlides) {
    const ok = confirm(
      `¿Enviar TODOS los ${state.slides.length} slides a Calidad?\n\nAceptar = enviar todos.\nCancelar = enviar solo el slide actual.`
    );
    mode = ok ? 'all' : 'current';
  }

  btn.disabled = true;
  btn.innerHTML = '⏳ Guardando…';

  try {
    const result = await savePiecesToQuality(state, { mode });

    // Actualizar el contador del módulo Calidad en la barra lateral
    await updateQualityBadge();

    btn.innerHTML = `✅ ${result.saved} enviada${result.saved !== 1 ? 's' : ''}`;
    setTimeout(() => (btn.innerHTML = originalText), 2500);

    console.log(`[factory] ${result.saved} piezas enviadas a Calidad`);
  } catch (err) {
    console.error('[factory] Error enviando a Calidad', err);
    alert('Error al enviar a Calidad: ' + err.message);
    btn.innerHTML = '❌ Error';
    setTimeout(() => (btn.innerHTML = originalText), 2500);
  } finally {
    btn.disabled = false;
  }
}

// --- Actualiza el badge del módulo Calidad en la barra lateral ---
async function updateQualityBadge() {
  try {
    const all = await store.getAll('pieces');
    const el = document.querySelector('.module-item[data-module="quality"] .module-count');
    if (el) el.textContent = all.length;
    // Refrescar el tablero de Calidad si está visible
    await refreshQuality();
  } catch (err) {
    console.warn('[factory] No se pudo actualizar badge de Calidad', err);
  }
}

async function handleExport() {
  const btn = document.getElementById('factory-export');
  const originalText = btn.innerHTML;

  const dims = FORMAT_DIMS[state.format];
  const hasSlides = dims.slides && state.slides.length > 0;

  // Confirmación simple si va a exportar varios slides
  if (hasSlides) {
    const ok = confirm(
      `¿Exportar los ${state.slides.length} slides como ZIP?\n\nCancelar = exportar solo el slide actual como JPG.`
    );
    if (!ok) {
      await exportSingle(btn, originalText);
      return;
    }
    await exportZip(btn, originalText);
    return;
  }

  // Formato sin slides: descarga simple
  await exportSingle(btn, originalText);
}

async function exportSingle(btn, originalText) {
  btn.disabled = true;
  btn.innerHTML = '⏳ Generando JPG...';
  try {
    const { blob, usedProxy } = await exportCurrentSlide(state, renderCanvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (state.currentWorkItem?.title || 'pieza')
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñ]+/gi, '_')
      .slice(0, 40);
    const brand = state.currentWorkItem?.brand || 'random';
    a.href = url;
    a.download = `${brand}_${state.format}_${safeName}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    if (usedProxy) {
      console.log('[factory] Exportado usando proxy (imagen recargada con CORS)');
    }
    btn.innerHTML = '✅ Descargado';
    setTimeout(() => (btn.innerHTML = originalText), 2000);
  } catch (err) {
    console.error('[factory] Error exportando JPG', err);
    alert('Error al exportar la imagen. Revisá la consola.');
    btn.innerHTML = '❌ Error';
    setTimeout(() => (btn.innerHTML = originalText), 2500);
  } finally {
    btn.disabled = false;
  }
}

async function exportZip(btn, originalText) {
  btn.disabled = true;
  btn.innerHTML = `⏳ Generando ZIP (${state.slides.length})...`;
  try {
    const baseName = (state.currentWorkItem?.title || 'piezas')
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñ]+/gi, '_')
      .slice(0, 40);
    const brand = state.currentWorkItem?.brand || 'random';
    const folderName = `${brand}_${state.format}_${baseName}`;

    const { blob, total } = await exportAllAsZip(state, renderCanvas, folderName);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = folderName + '.zip';
    a.click();
    URL.revokeObjectURL(url);
    btn.innerHTML = `✅ ${total} slides descargados`;
    setTimeout(() => (btn.innerHTML = originalText), 2500);
  } catch (err) {
    console.error('[factory] Error exportando ZIP', err);
    alert('Error al exportar el ZIP: ' + err.message);
    btn.innerHTML = '❌ Error';
    setTimeout(() => (btn.innerHTML = originalText), 2500);
  } finally {
    btn.disabled = false;
  }
}

// --- Habilitar drag de la imagen en el canvas ---
function bindCanvasDrag() {
  const canvas = document.getElementById('factory-canvas');
  if (!canvas || canvas.dataset.dragBound === '1') return;
  canvas.dataset.dragBound = '1';

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startOX = 0;
  let startOY = 0;
  let raf = null;

  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.currentImage) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
        const cfg = getActiveImgConfig();
    startOX = cfg.imgOffsetX || 0;
    startOY = cfg.imgOffsetY || 0;
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const dxPct = ((e.clientX - startX) * scaleX) / canvas.width * 100;
    const dyPct = ((e.clientY - startY) * scaleY) / canvas.height * 100;

    // rubber band: permitimos hasta ±50% pero con resistencia
    const rawX = startOX + dxPct;
    const rawY = startOY + dyPct;
    const clamp = (v, min, max) => {
      if (v >= min && v <= max) return v;
      const bounded = Math.max(min, Math.min(max, v));
      return bounded + (v - bounded) * 0.3;
    };

          updateActiveImgConfig({
      imgOffsetX: clamp(rawX, -50, 50),
      imgOffsetY: clamp(rawY, -50, 50),
    });

    if (!raf) {
      raf = requestAnimationFrame(async () => {
        raf = null;
        await renderCanvas();
      });
    }
  });

  const endDrag = async () => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
            // Snap final dentro del rango duro
    const finalCfg = getActiveImgConfig();
    updateActiveImgConfig({
      imgOffsetX: Math.max(-50, Math.min(50, finalCfg.imgOffsetX || 0)),
      imgOffsetY: Math.max(-50, Math.min(50, finalCfg.imgOffsetY || 0)),
    });
    await renderCanvas();
    updateImagePanelSliders();
    // Persistir el cambio de arrastre
    saveWorkingState(state).catch((err) => console.warn('[factory] persist falló', err));
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

// --- Generar contenido ---
async function generateContent() {
    if (FORMAT_DIMS[state.format]?.underConstruction) {
    console.log('[factory] Formato en construcción:', state.format);
    return;
  }
  if (!state.currentWorkItem) return;

  const btn = document.getElementById('factory-generate');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generando…';

  try {
    // 1. Generar contenido estructurado con el motor
        const content = extractRealContent({
      title: state.currentWorkItem.title,
      content: state.currentWorkItem.content || '',
      excerpt: state.currentWorkItem.excerpt || '',
      wpCategories: state.currentWorkItem.wpCategories || [],
      categories: state.currentWorkItem.categories || [],
      analysis: state.currentWorkItem.analysis || null,
    });
    state.currentContent = content;

       // 2. Descargar imagen (usar la elegida o la primera disponible)
    const urlToUse =
      state.selectedImageUrl ||
      state.currentWorkItem.imageUrl ||
      (state.currentWorkItem.images || [])[0] ||
      null;

    if (urlToUse) {
      state.currentImage = await loadImageSmart(urlToUse);
    } else {
      state.currentImage = null;
    }

    // 3. Renderizar
    await renderCanvas();

        // 4. Habilitar exportar + enviar a calidad
    const expBtn = document.getElementById('factory-export');
    if (expBtn) expBtn.disabled = false;
    const qualBtn = document.getElementById('factory-send-quality');
    if (qualBtn) qualBtn.disabled = false;

        // 5. Actualizar panel de textos
    renderTextPanel(content);

    // 6. Si el formato actual es Carrusel o Historias y no hay slides, crear uno inicial
    if (FORMAT_DIMS[state.format].slides) {
      await ensureSlidesForFormat();
    }

    console.log('[factory] Contenido generado:', content);
  } catch (err) {
    console.error('[factory] Error generando:', err);
    alert('Error al generar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// --- Panel de textos ---
function renderTextPanel(content) {
  const panel = document.getElementById('factory-tool-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Contenido generado</div>

      <div class="factory-field">
        <label>Categoría</label>
        <input type="text" id="fc-category" class="factory-input" value="${escapeHtml(content.category || '')}">
      </div>

      <div class="factory-field">
        <label>Headline</label>
        <textarea id="fc-headline" class="factory-input" rows="3">${escapeHtml(content.headline || '')}</textarea>
      </div>

      <div class="factory-field">
        <label>Body</label>
        <textarea id="fc-body" class="factory-input" rows="5">${escapeHtml((content.body || '').replace(/\*\*/g, ''))}</textarea>
      </div>


    </div>
  `;

  // Listeners: por ahora solo actualizan state y vuelven a renderizar
  const catInput = panel.querySelector('#fc-category');
  const headInput = panel.querySelector('#fc-headline');
  const bodyInput = panel.querySelector('#fc-body');

  const updateContent = async () => {
    state.currentContent.category = catInput.value;
    state.currentContent.headline = headInput.value;
    state.currentContent.body = bodyInput.value;
    await renderCanvas();
  };

  catInput.addEventListener('input', updateContent);
  headInput.addEventListener('input', updateContent);
  bodyInput.addEventListener('input', updateContent);


}

// ============================================================
// PANEL BLOG — Vista tipo editor de texto con jerarquías
// ============================================================

// Divide un texto largo en párrafos legibles
function splitIntoParagraphs(text) {
  const clean = String(text || '').trim();
  if (!clean) return [];

  // Si tiene dobles saltos de línea, respetarlos
  if (/\n\s*\n/.test(clean)) {
    return clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }

  // Si tiene saltos simples, agrupar de a 2-3 líneas
  if (/\n/.test(clean)) {
    const lines = clean.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const paras = [];
    let buf = '';
    for (const line of lines) {
      buf = buf ? buf + ' ' + line : line;
      if (buf.length > 200) {
        paras.push(buf);
        buf = '';
      }
    }
    if (buf) paras.push(buf);
    return paras;
  }

  // Texto corrido: dividir por oraciones y agrupar de a 3-4
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"«])/);
  const paras = [];
  let buf = '';
  let count = 0;
  for (const s of sentences) {
    buf = buf ? buf + ' ' + s : s;
    count++;
    if (count >= 3 || buf.length > 280) {
      paras.push(buf);
      buf = '';
      count = 0;
    }
  }
  if (buf) paras.push(buf);
  return paras;
}

// Renderiza el panel blog (siempre visible)
function renderBlogPanel() {
  const root = document.getElementById('factory-blog-root');
  if (!root) return;

  const w = state.currentWorkItem;

  // Caso 1: no hay noticia cargada
  if (!w) {
    root.innerHTML = `
      <div class="factory-blog">
        <div class="factory-blog-header">
          <span class="factory-blog-header-icon">📖</span>
          <span>Texto de la noticia</span>
        </div>
        <div class="factory-props-empty" style="padding-top:40px;">
          <div class="factory-props-icon">📝</div>
          <div class="factory-props-text">
            Cargá una noticia desde el <strong>Galpón</strong><br>
            para ver acá el texto completo.
          </div>
        </div>
      </div>
    `;
    return;
  }

  const category = (w.wpCategories && w.wpCategories[0]) ||
                   (w.categories && w.categories[0]) ||
                   (w.analysis && w.analysis.detectedCategory) ||
                   '';
  const title = w.title || '';
  const excerpt = w.excerpt || '';
  const content = w.content || '';
  const link = w.link || '';
  const bodyText = content || excerpt;
  const paragraphs = splitIntoParagraphs(bodyText);

  const loadingBanner = state.blogContentLoading
    ? `<div class="factory-blog-notice" style="background:rgba(88,166,255,0.08);border-color:var(--info);">
         ⏳ <strong style="color:var(--info);">Cargando contenido completo…</strong>
         Estamos bajando el artículo original. Mientras, te mostramos el resumen.
       </div>`
    : '';

  const emptyBanner = (!content && !state.blogContentLoading && state.blogContentError)
    ? `<div class="factory-blog-notice">
         <strong>⚠ No se pudo bajar el texto completo</strong>
         ${escapeHtml(state.blogContentError)}. Mostrando solo el resumen.
       </div>`
    : '';

  root.innerHTML = `
    <div class="factory-blog">
      <div class="factory-blog-header">
        <span class="factory-blog-header-icon">📖</span>
        <span>Texto de la noticia</span>
      </div>

      ${link ? `
        <a class="factory-blog-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">
          🔗 Ver noticia original ↗
        </a>
      ` : ''}

      ${loadingBanner}
      ${emptyBanner}

      <div class="factory-blog-text" id="factory-blog-text">
        ${category ? `
          <div class="factory-blog-category">
            ${escapeHtml(category)}
          </div>
        ` : ''}

        ${title ? `
          <h3>${escapeHtml(title)}</h3>
        ` : ''}

        ${excerpt && content ? `
          <p class="factory-blog-excerpt">
            ${escapeHtml(excerpt)}
          </p>
        ` : ''}

        ${paragraphs.length > 0 ? paragraphs.map((p) => `
          <p>${escapeHtml(p)}</p>
        `).join('') : ''}
      </div>
    </div>
  `;

  setupSelectionToolbar();
}

// --- Botonera flotante al seleccionar texto ---
let selToolbarEl = null;

function setupSelectionToolbar() {
  if (!selToolbarEl) {
    selToolbarEl = document.createElement('div');
    selToolbarEl.className = 'factory-sel-toolbar';
    selToolbarEl.innerHTML = `
      <button class="factory-sel-btn" data-field="category">Categoría</button>
      <button class="factory-sel-btn" data-field="headline">Título</button>
      <button class="factory-sel-btn" data-field="body">Bajada</button>
    `;
    document.body.appendChild(selToolbarEl);

    document.addEventListener('mousedown', (e) => {
      if (selToolbarEl && !selToolbarEl.contains(e.target)) {
        selToolbarEl.classList.remove('is-visible');
      }
    });

    selToolbarEl.querySelectorAll('.factory-sel-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const field = btn.dataset.field;
        const selected = window.getSelection();
        const text = String(selected).trim();
        if (!text || !state.currentContent) {
          selToolbarEl.classList.remove('is-visible');
          return;
        }
        applyTextToCanvas(field, text);
        selToolbarEl.classList.remove('is-visible');
      });
    });
  }

  const container = document.getElementById('factory-blog-text');
  if (!container) return;

  container.addEventListener('mouseup', () => {
    const selection = window.getSelection();
    const text = String(selection).trim();

    if (!text || text.length < 3 || !selection.rangeCount) {
      selToolbarEl.classList.remove('is-visible');
      return;
    }

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      selToolbarEl.classList.remove('is-visible');
      return;
    }

    const rect = range.getBoundingClientRect();
    selToolbarEl.style.left = Math.round(rect.left) + 'px';
    selToolbarEl.style.top = Math.round(rect.bottom + 8) + 'px';
    selToolbarEl.classList.add('is-visible');
  });
}

// Aplica el texto seleccionado a un campo del canvas
async function applyTextToCanvas(field, text) {
  if (!state.currentContent) return;

  const clean = text.replace(/\s+/g, ' ').trim();

  if (field === 'category') {
    state.currentContent.category = clean.toUpperCase();
  } else if (field === 'headline') {
    state.currentContent.headline = clean;
  } else if (field === 'body') {
    state.currentContent.body = clean;
  }

  await renderCanvas();
  saveWorkingState(state).catch((err) => console.warn('[factory] persist falló', err));

  const labels = { category: 'Categoría', headline: 'Título', body: 'Bajada' };
  const container = document.querySelector('.toast-container');
  if (container) {
    const t = document.createElement('div');
    t.className = 'toast toast-success';
    t.textContent = `✓ ${labels[field]} actualizado`;
    container.appendChild(t);
    setTimeout(() => t.classList.add('toast-visible'), 10);
    setTimeout(() => {
      t.classList.remove('toast-visible');
      setTimeout(() => t.remove(), 300);
    }, 2000);
  }
}

// Auto-descarga el contenido completo del artículo si falta
async function autoFetchFullContent() {
  const w = state.currentWorkItem;
  if (!w || !w.link) return;

  if (w.content && w.content.length > 300) {
    state.blogContentError = null;
    return;
  }

  state.blogContentLoading = true;
  state.blogContentError = null;

  try {
    const data = await extractFromLink(w.link);
    if (state.currentWorkItem !== w) return;
    if (data && data.content && data.content.length > (w.content || '').length) {
      w.content = data.content;
      await store.set('workItems', w.id, w);
      console.log(`[factory] Contenido completo bajado: ${data.content.length} chars`);
    }
  } catch (err) {
    if (state.currentWorkItem !== w) return;
    console.warn('[factory] No se pudo bajar el contenido completo:', err.message);
    state.blogContentError = err.message || 'Error desconocido';
  } finally {
    if (state.currentWorkItem === w) {
      state.blogContentLoading = false;
      renderBlogPanel();
    }
  }
}

// --- Cargar un workItem ---
export async function loadWorkItemIntoFactory(workItemId) {
  const workItem = await store.get('workItems', workItemId);
  if (!workItem) return;

  state.currentWorkItem = workItem;
  state.blogContentError = null;
  state.blogContentLoading = false;

  const info = document.getElementById('factory-workitem-info');
  if (info) {
    const brandLabel = workItem.brand === 'express' ? 'Random Express' : 'Random';
    const brandClass = workItem.brand === 'express' ? 'factory-brand-express' : 'factory-brand-random';
    info.innerHTML = `
      <span class="factory-brand-pill ${brandClass}">${brandLabel}</span>
      <span class="factory-workitem-title">${escapeHtml(workItem.title)}</span>
    `;
  }

    const genBtn = document.getElementById('factory-generate');
  const expBtn = document.getElementById('factory-export');
  const qualBtn = document.getElementById('factory-send-quality');
  if (genBtn) genBtn.disabled = false;
  if (expBtn) expBtn.disabled = true;
  if (qualBtn) qualBtn.disabled = false;

  const placeholder = document.getElementById('factory-canvas-placeholder');
  if (placeholder) placeholder.style.display = 'none';

     // Limpiar estado (incluye slides para que no arrastren del workItem anterior)
  state.currentContent = null;
  state.currentImage = null;
  state.slides = [];
  state.currentSlideIdx = 0;
  state.selectedImageUrl = null;

  // Aplicar el preset default para el brand del workItem (si existe)
  await applyDefaultPresetForBrand(workItem.brand);

  // Auto-generar al cargar
  await generateContent();

  // Auto-descargar el contenido completo (no bloquea)
  state.blogContentLoading = Boolean(
    workItem.link && !(workItem.content && workItem.content.length > 300)
  );
  renderBlogPanel();
  autoFetchFullContent();
}

// --- Cambiar formato ---
function setFormat(format) {
  if (!FORMAT_DIMS[format]) return;
  state.format = format;

  document.querySelectorAll('#factory-mode-selector .factory-mode-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.format === format);
  });

  const dims = FORMAT_DIMS[format];
  const canvas = document.getElementById('factory-canvas');
  if (canvas) {
    canvas.width = dims.w;
    canvas.height = dims.h;
  }
  
  // Mostrar / ocultar cartel "en construcción"
  const ucBox = document.getElementById('factory-under-construction');
  const ucIcon = document.getElementById('factory-uc-icon');
  const ucBadge = document.getElementById('factory-uc-badge');
  const ucTitle = document.getElementById('factory-uc-title');
  const ucSub = document.getElementById('factory-uc-sub');
  const placeholder = document.getElementById('factory-canvas-placeholder');
  const canvasEl = document.getElementById('factory-canvas');

  if (dims.underConstruction) {
    const isFrases = format === 'frases';
    if (ucBox) {
      ucBox.style.display = 'flex';
      ucBox.dataset.kind = format;
    }
    if (ucIcon) ucIcon.textContent = isFrases ? '💬' : '▦';
    if (ucBadge) ucBadge.textContent = 'En construcción';
    if (ucTitle) ucTitle.textContent = isFrases ? 'Formato Frases' : 'Formato Grilla';
    if (ucSub) {
      ucSub.textContent = isFrases
        ? 'Acá vas a poder crear piezas con una frase centrada, autor, cargo y logo. Estamos trabajando en el editor.'
        : 'Acá vas a poder combinar 5 noticias (1 principal + 4 secundarias) con imagen y título, en formato Historia. Estamos trabajando en el editor.';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (canvasEl) canvasEl.style.opacity = '0';
  } else {
    if (ucBox) ucBox.style.display = 'none';
    if (canvasEl) canvasEl.style.opacity = '1';
  }

  const dimsLabel = document.getElementById('factory-placeholder-dims');
  if (dimsLabel) dimsLabel.textContent = `${dims.w} × ${dims.h} · ${dims.label}`;

    const slidesBar = document.getElementById('factory-slides-bar');
  if (slidesBar) slidesBar.classList.toggle('factory-slides-hidden', !dims.slides);

  const container = document.getElementById('factory-canvas-container');
  if (container) container.style.aspectRatio = `${dims.w} / ${dims.h}`;

  // Si el nuevo formato usa slides y no hay, crearlos automáticamente
  if (dims.slides && state.slides.length === 0 && state.currentContent) {
    ensureSlidesForFormat().then(() => {
      if (state.slides.length > 0) {
        updateCanvasFromActiveSlide();
        renderCanvas();
      }
    });
  } else if (dims.slides) {
    // Ya hay slides: solo refrescar la barra
    renderSlidesBar();
  } else {
    // Post/Historia: ocultar la barra
    if (slidesBar) slidesBar.classList.add('factory-slides-hidden');
  }

  if (state.currentContent) renderCanvas();
}

function setTool(tool) {
  state.activeTool = tool;
  document.querySelectorAll('#factory-toolbar .factory-tool-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.tool === tool);
  });

  if (tool === 'texto' && state.currentContent) {
    renderTextPanel(state.currentContent);
    return;
  }

    if (tool === 'imagen') {
    renderImagePanel();
    return;
  }
  
  if (tool === 'plantilla') {
    renderTemplatePanel();
    return;
  }
  
  if (tool === 'logo') {
    renderLogoPanel();
    return;
  }

  const panel = document.getElementById('factory-tool-panel');
  if (!panel) return;

  const meta = {
    texto: { icon: '📝', label: 'Herramientas de Texto', sub: 'Generá contenido primero' },
    imagen: { icon: '🖼️', label: 'Imagen', sub: 'Paso 24' },
    plantilla: { icon: '🎨', label: 'Plantillas', sub: 'Paso 25' },
    logo: { icon: '⭐', label: 'Logos', sub: 'Paso 26' },
    capas: { icon: '📚', label: 'Capas', sub: 'Paso 27' },
  }[tool] || { icon: '🎨', label: tool, sub: '' };

  panel.innerHTML = `
    <div class="factory-panel-empty">
      <div class="factory-panel-empty-icon">${meta.icon}</div>
      <div class="factory-panel-empty-text">${meta.label}</div>
      <div class="factory-panel-empty-sub">${meta.sub}</div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Panel de selección de imagen ---
// --- Panel de selección de imagen ---
function renderImagePanel() {
  const panel = document.getElementById('factory-tool-panel');
  if (!panel) return;

  const cfg = getActiveImgConfig();

  const images = state.currentWorkItem?.images || [];
  const current = state.selectedImageUrl || state.currentWorkItem?.imageUrl || null;

  // Helper: guarda el estado de trabajo en IndexedDB
  const persistNow = () => {
    saveWorkingState(state).catch((err) => console.warn('[factory] persist falló', err));
  };

  // --- Cabecera (siempre igual): imágenes o mensaje "sin imágenes" ---
  let headerHtml = '';
  if (images.length === 0) {
    headerHtml = `
      <div class="factory-panel-section">
        <div class="factory-panel-section-title">Imagen del artículo</div>
        <div class="factory-panel-empty" style="height:auto;padding:16px">
          <div class="factory-panel-empty-icon">🖼️</div>
          <div class="factory-panel-empty-text">Sin imágenes disponibles</div>
          <div class="factory-panel-empty-sub">Pegá una URL o usá la imagen actual del canvas.</div>
        </div>
        <button class="btn btn-sm" id="fi-url-btn" style="width:100%;margin-top:8px">🔗 Pegar URL de imagen</button>
      </div>
    `;
  } else {
    headerHtml = `
      <div class="factory-panel-section">
        <div class="factory-panel-section-title">Imagen del artículo (${images.length})</div>
        <div class="factory-image-grid">
          ${images
            .map(
              (u) => `
            <div class="factory-image-thumb ${u === current ? 'is-active' : ''}" data-url="${escapeHtml(u)}">
              <img src="${escapeHtml(u)}" alt="" loading="lazy" onerror="this.style.display='none'">
            </div>
          `
            )
            .join('')}
        </div>
        <button class="btn btn-sm" id="fi-url-btn" style="width:100%;margin-top:10px">🔗 Pegar URL externa</button>
      </div>
    `;
  }

  // --- Ajustes de imagen (siempre igual) ---
  const adjustHtml = `
    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Ajustes de imagen</div>

      <div class="factory-field">
        <label>Zoom <span id="fi-scale-val" style="color:var(--factory)">${cfg.imgScale || 100}%</span></label>
        <input type="range" id="fi-scale" class="factory-input" min="50" max="200" step="5" value="${cfg.imgScale || 100}">
      </div>

      <div class="factory-field">
        <label>Posición X</label>
        <input type="range" id="fi-offx" class="factory-input" min="-50" max="50" step="1" value="${Math.round(cfg.imgOffsetX || 0)}">
      </div>

      <div class="factory-field">
        <label>Posición Y</label>
        <input type="range" id="fi-offy" class="factory-input" min="-50" max="50" step="1" value="${Math.round(cfg.imgOffsetY || 0)}">
      </div>

      <div class="factory-field">
        <label>Alineación horizontal</label>
        <div class="factory-btn-row">
          <button class="factory-mini-btn ${cfg.imgAlign === 'left' ? 'is-active' : ''}" data-align="left">◧ Izq</button>
          <button class="factory-mini-btn ${cfg.imgAlign === 'center' ? 'is-active' : ''}" data-align="center">◫ Centro</button>
          <button class="factory-mini-btn ${cfg.imgAlign === 'right' ? 'is-active' : ''}" data-align="right">◨ Der</button>
        </div>
      </div>

      <div class="factory-field">
        <label>Alineación vertical</label>
        <div class="factory-btn-row">
          <button class="factory-mini-btn ${cfg.imgVAlign === 'top' ? 'is-active' : ''}" data-valign="top">⬒ Arr</button>
          <button class="factory-mini-btn ${cfg.imgVAlign === 'center' ? 'is-active' : ''}" data-valign="center">▣ Medio</button>
          <button class="factory-mini-btn ${cfg.imgVAlign === 'bottom' ? 'is-active' : ''}" data-valign="bottom">⬓ Abj</button>
        </div>
      </div>

      <div class="factory-field">
        <label>Opacidad</label>
        <div class="factory-btn-row">
          <button class="factory-mini-btn ${cfg.imgOpacity === 1 ? 'is-active' : ''}" data-op="1">100</button>
          <button class="factory-mini-btn ${cfg.imgOpacity === 0.9 ? 'is-active' : ''}" data-op="0.9">90</button>
          <button class="factory-mini-btn ${cfg.imgOpacity === 0.8 ? 'is-active' : ''}" data-op="0.8">80</button>
          <button class="factory-mini-btn ${cfg.imgOpacity === 0.7 ? 'is-active' : ''}" data-op="0.7">70</button>
        </div>
      </div>

      <div class="factory-field">
        <label>Estilo</label>
        <div class="factory-btn-row">
          <button class="factory-mini-btn ${cfg.imgGray ? 'is-active' : ''}" id="fi-gray">◐ B/N</button>
          <button class="factory-mini-btn" id="fi-reset">↻ Reset</button>
        </div>
      </div>
    </div>
  `;

  panel.innerHTML = headerHtml + adjustHtml;

  // --- Listeners (siempre se registran, sin importar si hay imágenes o no) ---

  // Botón URL externa
  const urlBtn = panel.querySelector('#fi-url-btn');
  if (urlBtn) {
    urlBtn.addEventListener('click', () => {
      const url = prompt('URL de la imagen:');
      if (url) setImageFromUrl(url.trim());
    });
  }

  // Miniaturas de imágenes
  panel.querySelectorAll('.factory-image-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      setImageFromUrl(thumb.dataset.url);
    });
  });

  // Zoom
  const scaleInput = panel.querySelector('#fi-scale');
  if (scaleInput) {
    scaleInput.addEventListener('input', async (e) => {
      const v = parseInt(e.target.value, 10);
      updateActiveImgConfig({ imgScale: v });
      const label = panel.querySelector('#fi-scale-val');
      if (label) label.textContent = v + '%';
      await renderCanvas();
      persistNow();
    });
  }

  // Offset X
  const offxInput = panel.querySelector('#fi-offx');
  if (offxInput) {
    offxInput.addEventListener('input', async (e) => {
      const v = parseFloat(e.target.value);
      updateActiveImgConfig({ imgOffsetX: v });
      await renderCanvas();
      persistNow();
    });
  }

  // Offset Y
  const offyInput = panel.querySelector('#fi-offy');
  if (offyInput) {
    offyInput.addEventListener('input', async (e) => {
      const v = parseFloat(e.target.value);
      updateActiveImgConfig({ imgOffsetY: v });
      await renderCanvas();
      persistNow();
    });
  }

  // Alineación horizontal
  panel.querySelectorAll('[data-align]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.align;
      updateActiveImgConfig({ imgAlign: v });
      panel.querySelectorAll('[data-align]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.align === v);
      });
      await renderCanvas();
      persistNow();
    });
  });

  // Alineación vertical
  panel.querySelectorAll('[data-valign]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.valign;
      updateActiveImgConfig({ imgVAlign: v });
      panel.querySelectorAll('[data-valign]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.valign === v);
      });
      await renderCanvas();
      persistNow();
    });
  });

  // Opacidad
  panel.querySelectorAll('[data-op]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = parseFloat(btn.dataset.op);
      updateActiveImgConfig({ imgOpacity: v });
      panel.querySelectorAll('[data-op]').forEach((b) => {
        b.classList.toggle('is-active', parseFloat(b.dataset.op) === v);
      });
      await renderCanvas();
      persistNow();
    });
  });

  // B/N
  const grayBtn = panel.querySelector('#fi-gray');
  if (grayBtn) {
    grayBtn.addEventListener('click', async () => {
      const cfgNow = getActiveImgConfig();
      const newValue = !cfgNow.imgGray;
      updateActiveImgConfig({ imgGray: newValue });
      grayBtn.classList.toggle('is-active', newValue);
      await renderCanvas();
      persistNow();
    });
  }

  // Reset
  const resetBtn = panel.querySelector('#fi-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      updateActiveImgConfig({
        imgOffsetX: 0,
        imgOffsetY: 0,
        imgScale: 100,
        imgAlign: 'center',
        imgVAlign: 'center',
        imgGray: false,
        imgOpacity: 1,
      });
      await renderCanvas();
      persistNow();
      renderImagePanel();
    });
  }
}

async function setImageFromUrl(url) {
  state.selectedImageUrl = url;
  state.currentImage = await loadImageSmart(url);
  await renderCanvas();
  renderImagePanel();
}

// --- Actualiza los valores visibles de los sliders (sin re-renderizar) ---
function updateImagePanelSliders() {
  const cfg = getActiveImgConfig();
  const zx = document.getElementById('fi-offx');
  const zy = document.getElementById('fi-offy');
  const zs = document.getElementById('fi-scale');
  const zsv = document.getElementById('fi-scale-val');
  if (zx) zx.value = Math.round(cfg.imgOffsetX || 0);
  if (zy) zy.value = Math.round(cfg.imgOffsetY || 0);
  if (zs) zs.value = cfg.imgScale || 100;
  if (zsv) zsv.textContent = (cfg.imgScale || 100) + '%';
}

// --- Crea slides iniciales si el formato activo los requiere y no existen ---
async function ensureSlidesForFormat() {
  const dims = FORMAT_DIMS[state.format];
  if (!dims.slides) return;

  // Si ya hay slides, no hacemos nada
  if (state.slides.length > 0) return;

  // Cantidad por defecto: 4 para carrusel, 3 para historias
  const count = state.format === 'stories' ? 3 : 4;

  // Usamos el contenido actual como base (o vacío si no hay)
  const baseContent = state.currentContent || {
    category: '',
    headline: '',
    body: '',
  };

  // Imágenes disponibles
  const images = state.currentWorkItem?.images || [];
  const mainImage = state.selectedImageUrl || state.currentWorkItem?.imageUrl || images[0] || null;

  // Template por posición
  const slides = [];
  for (let i = 0; i < count; i++) {
    const isFirst = i === 0;
    const isLast = i === count - 1;

    let template = 'content';
    if (isFirst) template = 'cover';
    else if (isLast) template = 'cta';

    let content;
    if (template === 'cover') {
      content = { ...baseContent };
    } else if (template === 'cta') {
      content = {
        category: baseContent.category || '',
        headline: 'Leé la nota completa',
        body: 'Todo esto y mucho más en revistarrandom.com.ar',
      };
    } else {
      content = {
        category: baseContent.category || '',
        headline: baseContent.headline || '',
        body: baseContent.body || '',
      };
    }

    // Imagen: primera slide con la principal, las demás rotan entre las disponibles
    const imageUrl = images.length > 0
      ? images[i % images.length]
      : mainImage;

        slides.push({
      id: 'slide_' + Date.now() + '_' + i,
      template,
      content,
      imageUrl,
      selectedImageUrl: null,
      image: null,
      imgConfig: { ...DEFAULT_IMG_CONFIG },
    });
  }

  state.slides = slides;
  state.currentSlideIdx = 0;

  // Cargar las imágenes de cada slide en paralelo
  await Promise.all(
    state.slides.map(async (s) => {
      if (s.imageUrl) {
        s.image = await loadImageSmart(s.imageUrl);
      }
    })
  );

  // Actualizar UI de slides
  renderSlidesBar();
  console.log(`[factory] ${state.slides.length} slides creados para formato ${state.format}`);
}

// --- Renderiza la barra inferior de slides ---
function renderSlidesBar() {
  const bar = document.getElementById('factory-slides-bar');
  const strip = document.getElementById('factory-slides-strip');
  const info = document.getElementById('factory-slides-info');
  if (!bar || !strip) return;

  const dims = FORMAT_DIMS[state.format];

  // Si el formato no soporta slides, ocultar
  if (!dims.slides) {
    bar.classList.add('factory-slides-hidden');
    return;
  }

  bar.classList.remove('factory-slides-hidden');

  // Info
  if (info) {
    info.textContent = `${state.slides.length} ${state.slides.length === 1 ? 'slide' : 'slides'}`;
  }

  // Si no hay slides, mensaje
  if (state.slides.length === 0) {
    strip.innerHTML = `<div class="factory-slides-empty">Sin slides. Generá contenido o hacé clic en "+ Slide".</div>`;
    return;
  }

  // Renderizar cada slide como una miniatura
  const thumbs = state.slides
    .map((s, i) => {
      const isActive = i === state.currentSlideIdx;
      const label = s.template === 'cover'
        ? 'Portada'
        : s.template === 'cta'
        ? 'Cierre'
        : `Slide ${i + 1}`;
      const thumbImg = s.image
        ? `<img src="${s.image.src}" alt="">`
        : `<div class="factory-slide-thumb-placeholder">📄</div>`;

      return `
        <div class="factory-slide-item ${isActive ? 'is-active' : ''}" data-idx="${i}">
          <div class="factory-slide-thumb">${thumbImg}</div>
          <div class="factory-slide-label">${label}</div>
        </div>
      `;
    })
    .join('');

  // Botón "+" al final
  const addBtn = `<button class="factory-slide-add" id="factory-slide-add">+ Slide</button>`;

  strip.innerHTML = thumbs + addBtn;

  // Click en cada slide
  strip.querySelectorAll('.factory-slide-item').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      if (idx === state.currentSlideIdx) return;
      state.currentSlideIdx = idx;
      renderSlidesBar();
      updateCanvasFromActiveSlide();
      renderCanvas();
    });
  });

  // Botón agregar
  const addButton = strip.querySelector('#factory-slide-add');
  if (addButton) {
    addButton.addEventListener('click', () => {
      addSlide();
    });
  }
}

// --- Cambia el contenido del canvas según el slide activo ---
function updateCanvasFromActiveSlide() {
  const slide = state.slides[state.currentSlideIdx];
  if (!slide) return;
  state.currentContent = slide.content;
  state.currentImage = slide.image;
  state.selectedImageUrl = slide.selectedImageUrl || null;
}

// --- Agregar un slide nuevo ---
async function addSlide() {
  const images = state.currentWorkItem?.images || [];
  const idx = state.slides.length;

  // Contenido vacío o basado en la noticia
  const baseContent = state.slides[0]?.content || state.currentContent || {
    category: '',
    headline: '',
    body: '',
  };

  const imageUrl = images.length > 0 ? images[idx % images.length] : null;
  const image = imageUrl ? await loadImageSmart(imageUrl) : null;

   // Heredar la config de imagen del último slide (o la del slide activo)
  const lastSlide = state.slides[state.slides.length - 1];
  const inheritedImgConfig = lastSlide?.imgConfig
    ? { ...lastSlide.imgConfig }
    : { ...DEFAULT_IMG_CONFIG };

  state.slides.push({
    id: 'slide_' + Date.now() + '_' + idx,
    template: 'content',
    content: {
      category: baseContent.category || '',
      headline: baseContent.headline || '',
      body: baseContent.body || '',
    },
    imageUrl,
    selectedImageUrl: null,
    image,
    imgConfig: inheritedImgConfig,
  });

  state.currentSlideIdx = state.slides.length - 1;
  renderSlidesBar();
  updateCanvasFromActiveSlide();
  await renderCanvas();
  console.log(`[factory] Slide agregado. Total: ${state.slides.length}`);
}

// --- Panel de plantillas ---
function renderTemplatePanel() {
  const panel = document.getElementById('factory-tool-panel');
  if (!panel) return;

  const tpl = curTpl();

  const FONT_OPTIONS = [
    { id: 'inter',     label: 'Inter (moderna)' },
    { id: 'helvetica', label: 'Helvetica' },
    { id: 'georgia',   label: 'Georgia (serif)' },
    { id: 'impact',    label: 'Impact (condensada)' },
    { id: 'courier',   label: 'Courier (monoespaciada)' },
  ];
  

  panel.innerHTML = `
    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Formato activo: ${state.format.toUpperCase()}</div>
    </div>

    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Tipografía</div>

      <div class="factory-field">
        <label>Fuente</label>
        <select id="ft-font" class="factory-input">
          ${FONT_OPTIONS.map(
            (f) => `<option value="${f.id}" ${tpl.tplFont === f.id ? 'selected' : ''}>${f.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Colores</div>

      <div class="factory-field">
        <label>Categoría</label>
        <div class="factory-color-row">
          <input type="color" id="ft-cat-color" class="factory-color-input" value="${tpl.tplCatColor}">
          <span class="factory-color-hex">${tpl.tplCatColor}</span>
        </div>
      </div>

      <div class="factory-field">
        <label>Headline</label>
        <div class="factory-color-row">
          <input type="color" id="ft-head-color" class="factory-color-input" value="${tpl.tplHeadColor}">
          <span class="factory-color-hex">${tpl.tplHeadColor}</span>
        </div>
      </div>

      <div class="factory-field">
        <label>Body</label>
        <div class="factory-color-row">
          <input type="color" id="ft-body-color" class="factory-color-input" value="${tpl.tplBodyColor}">
          <span class="factory-color-hex">${tpl.tplBodyColor}</span>
        </div>
      </div>

      <div class="factory-field">
        <label>Overlay</label>
        <div class="factory-color-row">
          <input type="color" id="ft-overlay-color" class="factory-color-input" value="${tpl.tplOverlayColor}">
          <span class="factory-color-hex">${tpl.tplOverlayColor}</span>
        </div>
      </div>
    </div>

    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Tamaños</div>

      <div class="factory-field">
        <label>Headline <span id="ft-head-size-val" style="color:var(--factory)">${Math.round(tpl.tplHeadSize * 100)}%</span></label>
        <input type="range" id="ft-head-size" class="factory-input" min="60" max="180" step="5" value="${Math.round(tpl.tplHeadSize * 100)}">
      </div>

      <div class="factory-field">
        <label>Body <span id="ft-body-size-val" style="color:var(--factory)">${Math.round(tpl.tplBodySize * 100)}%</span></label>
        <input type="range" id="ft-body-size" class="factory-input" min="60" max="180" step="5" value="${Math.round(tpl.tplBodySize * 100)}">
      </div>

      <div class="factory-field">
        <label>Categoría <span id="ft-cat-size-val" style="color:var(--factory)">${Math.round(tpl.tplCatSize * 100)}%</span></label>
        <input type="range" id="ft-cat-size" class="factory-input" min="60" max="180" step="5" value="${Math.round(tpl.tplCatSize * 100)}">
      </div>
    </div>

    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Márgenes del texto</div>

      <div class="factory-field">
        <label>Izquierdo <span id="ft-mgl-val" style="color:var(--factory)">${Math.round(tpl.tplMarginL * 100)}%</span></label>
        <input type="range" id="ft-mgl" class="factory-input" min="2" max="30" step="1" value="${Math.round(tpl.tplMarginL * 100)}">
      </div>

      <div class="factory-field">
        <label>Derecho <span id="ft-mgr-val" style="color:var(--factory)">${Math.round(tpl.tplMarginR * 100)}%</span></label>
        <input type="range" id="ft-mgr" class="factory-input" min="2" max="30" step="1" value="${Math.round(tpl.tplMarginR * 100)}">
      </div>

      <div class="factory-field">
        <label>Inferior <span id="ft-mgb-val" style="color:var(--factory)">${Math.round(tpl.tplMarginB * 100)}%</span></label>
        <input type="range" id="ft-mgb" class="factory-input" min="2" max="30" step="1" value="${Math.round(tpl.tplMarginB * 100)}">
      </div>
    </div>

        <div class="factory-panel-section">
      <button class="btn btn-sm" id="ft-reset" style="width:100%">↻ Reset de este formato</button>
    </div>

    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Presets guardados</div>
      <div id="ft-presets-list" class="ft-presets-list"></div>
      <button class="btn btn-sm btn-primary" id="ft-preset-save-btn" style="width:100%;margin-top:8px">💾 Guardar como preset</button>
    </div>
  `;

  // Helper: guarda el estado de trabajo en IndexedDB
  const persistNow = () => {
    saveWorkingState(state).catch((err) => console.warn('[factory] persist falló', err));
  };

  // Fuente
  panel.querySelector('#ft-font').addEventListener('change', async (e) => {
    curTpl().tplFont = e.target.value;
    await renderCanvas();
    persistNow();
  });

  // Colores
  const bindColor = (id, key) => {
    const input = panel.querySelector(id);
    if (!input) return;
    input.addEventListener('input', async (e) => {
      curTpl()[key] = e.target.value;
      const label = input.parentElement.querySelector('.factory-color-hex');
      if (label) label.textContent = e.target.value;
      await renderCanvas();
      persistNow();
    });
  };
  bindColor('#ft-cat-color', 'tplCatColor');
  bindColor('#ft-head-color', 'tplHeadColor');
  bindColor('#ft-body-color', 'tplBodyColor');
  bindColor('#ft-overlay-color', 'tplOverlayColor');

  // Tamaños
  const bindSize = (id, key, valId) => {
    const input = panel.querySelector(id);
    const valEl = panel.querySelector(valId);
    if (!input) return;
    input.addEventListener('input', async (e) => {
      curTpl()[key] = parseInt(e.target.value, 10) / 100;
      if (valEl) valEl.textContent = e.target.value + '%';
      await renderCanvas();
      persistNow();
    });
  };
  bindSize('#ft-head-size', 'tplHeadSize', '#ft-head-size-val');
  bindSize('#ft-body-size', 'tplBodySize', '#ft-body-size-val');
  bindSize('#ft-cat-size', 'tplCatSize', '#ft-cat-size-val');

  // Márgenes
  const bindMargin = (id, key, valId) => {
    const input = panel.querySelector(id);
    const valEl = panel.querySelector(valId);
    if (!input) return;
    input.addEventListener('input', async (e) => {
      curTpl()[key] = parseInt(e.target.value, 10) / 100;
      if (valEl) valEl.textContent = e.target.value + '%';
      await renderCanvas();
      persistNow();
    });
  };
  bindMargin('#ft-mgl', 'tplMarginL', '#ft-mgl-val');
  bindMargin('#ft-mgr', 'tplMarginR', '#ft-mgr-val');
  bindMargin('#ft-mgb', 'tplMarginB', '#ft-mgb-val');

    // Reset (solo del formato actual)
  panel.querySelector('#ft-reset').addEventListener('click', async () => {
    state.formatConfigs[state.format] = { ...DEFAULT_FORMAT_CONFIG };
    await renderCanvas();
    persistNow();
    renderTemplatePanel();
  });

  // Presets: renderizar lista y conectar botón de guardar
  renderPresetsList();
  panel.querySelector('#ft-preset-save-btn').addEventListener('click', () => {
    promptSavePreset();
  });
}

// --- Renderizar la lista de presets en el panel ---
async function renderPresetsList() {
  const container = document.getElementById('ft-presets-list');
  if (!container) return;

  const presets = await listPresets();

  if (presets.length === 0) {
    container.innerHTML = `<div class="ft-preset-empty">Sin presets guardados</div>`;
    return;
  }

  const brandLabel = (b) => {
    if (b === 'random') return 'Random';
    if (b === 'express') return 'Express';
    return 'Personalizado';
  };
  const brandClass = (b) => {
    if (b === 'random') return 'ft-preset-brand-random';
    if (b === 'express') return 'ft-preset-brand-express';
    return 'ft-preset-brand-custom';
  };

  container.innerHTML = presets
    .map(
      (p) => `
      <div class="ft-preset-item ${p.id === state.activePresetId ? 'is-active' : ''}" data-id="${p.id}">
        <div class="ft-preset-item-top">
          <span class="ft-preset-brand ${brandClass(p.brand)}">${brandLabel(p.brand)}</span>
          <span class="ft-preset-name">${escapeHtml(p.name)}</span>
        </div>
        <div class="ft-preset-item-actions">
          <button class="ft-preset-btn ft-preset-apply" data-id="${p.id}">Aplicar</button>
          <button class="ft-preset-btn ft-preset-default" data-id="${p.id}" title="Marcar como preset por defecto de este brand">★</button>
          <button class="ft-preset-btn ft-preset-delete" data-id="${p.id}">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  container.querySelectorAll('.ft-preset-apply').forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.id));
  });
  container.querySelectorAll('.ft-preset-default').forEach((btn) => {
    btn.addEventListener('click', () => markPresetAsDefault(btn.dataset.id));
  });
  container.querySelectorAll('.ft-preset-delete').forEach((btn) => {
    btn.addEventListener('click', () => promptDeletePreset(btn.dataset.id));
  });
}

// --- Prompt para guardar un preset nuevo ---
async function promptSavePreset() {
  const name = prompt('Nombre del preset (ej: Random por defecto):');
  if (!name || !name.trim()) return;

  const brand = prompt(
    '¿Para qué brand es este preset?\nEscribí: random / express / custom',
    state.activePresetBrand || 'custom'
  );

  const cleanBrand = ['random', 'express', 'custom'].includes(brand) ? brand : 'custom';

  const preset = await savePreset({
    name: name.trim(),
    brand: cleanBrand,
    design: {
      post: { ...state.formatConfigs.post },
      story: { ...state.formatConfigs.story },
      stories: { ...state.formatConfigs.stories },
      carousel: { ...state.formatConfigs.carousel },
    },
  });

  if (preset) {
    state.activePresetId = preset.id;
    state.activePresetBrand = preset.brand;
    await saveWorkingState(state);
    renderPresetsList();
    console.log('[factory] Preset guardado:', preset.name);
  } else {
    alert('Error al guardar el preset. Revisá la consola.');
  }
}

// --- Aplicar un preset: copia sus valores a todos los formatConfigs ---
async function applyPreset(presetId) {
  const presets = await listPresets();
  const preset = presets.find((p) => p.id === presetId);
  if (!preset || !preset.design) return;

  // Copia cada formato del preset al state actual
  ['post', 'story', 'stories', 'carousel'].forEach((fmt) => {
    if (preset.design[fmt]) {
      state.formatConfigs[fmt] = { ...preset.design[fmt] };
    }
  });

  state.activePresetId = preset.id;
  state.activePresetBrand = preset.brand;

  await renderCanvas();
  await saveWorkingState(state);
  renderTemplatePanel();
  console.log('[factory] Preset aplicado:', preset.name);
}

// --- Marcar preset como default de su brand ---
async function markPresetAsDefault(presetId) {
  const presets = await listPresets();
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) return;

  // Desmarcar todos los del mismo brand
  for (const p of presets) {
    if (p.brand === preset.brand && p.isDefault) {
      p.isDefault = false;
      await savePreset(p);
    }
  }

  preset.isDefault = true;
  await savePreset(preset);
  renderPresetsList();
  console.log(`[factory] Preset "${preset.name}" marcado como default de ${preset.brand}`);
}

// --- Eliminar preset con confirmación ---
async function promptDeletePreset(presetId) {
  if (!confirm('¿Eliminar este preset? Esta acción no se puede deshacer.')) return;
  await deletePreset(presetId);
  if (state.activePresetId === presetId) {
    state.activePresetId = null;
    state.activePresetBrand = null;
    await saveWorkingState(state);
  }
  renderPresetsList();
}

// --- Panel de Logos ---
function renderLogoPanel() {
  const panel = document.getElementById('factory-tool-panel');
  if (!panel) return;

  const brand = state.currentWorkItem?.brand === 'express' ? 'express' : 'random';
  const brandLabel = brand === 'express' ? 'Random Express' : 'Random';
  const brandClass = brand === 'express' ? 'factory-brand-express' : 'factory-brand-random';
  const logo = state.logos?.[brand];

  if (!logo) {
    panel.innerHTML = `
      <div class="factory-panel-empty">
        <div class="factory-panel-empty-icon">⭐</div>
        <div class="factory-panel-empty-text">Cargando logo...</div>
      </div>
    `;
    return;
  }

  const cfg = logo.config || {};
  const sourceLabel = {
    override: 'Personalizado (subido por vos)',
    official: 'Oficial (assets/logos/)',
    none: 'Sin imagen (texto fallback)',
  }[logo.source] || 'Desconocido';

  const hasImage = !!logo.image;

  panel.innerHTML = `
    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Logo activo</div>
      <div class="factory-logo-current">
        <span class="factory-brand-pill ${brandClass}">${brandLabel}</span>
        <span class="factory-logo-source">${sourceLabel}</span>
      </div>
    </div>

    <div class="factory-panel-section">
      <div class="factory-logo-preview-wrap">
        ${hasImage
          ? `<img src="${logo.image.src}" class="factory-logo-preview-img" alt="Preview">`
          : `<div class="factory-logo-preview-empty">Sin imagen</div>`}
      </div>

      <div class="factory-btn-row" style="margin-top:10px">
        <button class="factory-mini-btn" id="lg-upload">📁 Subir PNG</button>
        <button class="factory-mini-btn" id="lg-clear" ${cfg.overrideDataUrl ? '' : 'disabled'}>↻ Restaurar oficial</button>
      </div>
      <input type="file" id="lg-file" accept="image/png,image/svg+xml,image/jpeg" style="display:none">
    </div>

    <div class="factory-panel-section">
      <div class="factory-panel-section-title">Ajustes</div>

      <div class="factory-field">
        <label>Visible</label>
        <div class="factory-btn-row">
          <button class="factory-mini-btn ${cfg.active !== false ? 'is-active' : ''}" id="lg-active-on">👁️ Activado</button>
          <button class="factory-mini-btn ${cfg.active === false ? 'is-active' : ''}" id="lg-active-off">🚫 Oculto</button>
        </div>
      </div>

      <div class="factory-field">
        <label>Escala <span id="lg-scale-val" style="color:var(--factory)">${cfg.scale || 100}%</span></label>
        <input type="range" id="lg-scale" class="factory-input" min="20" max="300" step="5" value="${cfg.scale || 100}">
      </div>

      <div class="factory-field">
        <label>Posición X <span id="lg-x-val" style="color:var(--factory)">${Math.round(cfg.x ?? 74)}%</span></label>
        <input type="range" id="lg-x" class="factory-input" min="0" max="95" step="1" value="${Math.round(cfg.x ?? 74)}">
      </div>

      <div class="factory-field">
        <label>Posición Y <span id="lg-y-val" style="color:var(--factory)">${Math.round(cfg.y ?? 5)}%</span></label>
        <input type="range" id="lg-y" class="factory-input" min="0" max="95" step="1" value="${Math.round(cfg.y ?? 5)}">
      </div>

      <div class="factory-field">
        <label>Opacidad <span id="lg-opacity-val" style="color:var(--factory)">${Math.round((cfg.opacity ?? 1) * 100)}%</span></label>
        <input type="range" id="lg-opacity" class="factory-input" min="10" max="100" step="5" value="${Math.round((cfg.opacity ?? 1) * 100)}">
      </div>
            <div class="factory-field">
        <label>Posición por defecto</label>
        <button class="factory-mini-btn" id="lg-reset-pos" style="width:100%">↻ Reset a X=74, Y=5</button>
      </div>
    </div>
  `;

  // Helper: guarda config + redibuja
  const persistAndRedraw = async (partial) => {
    const current = state.logos[brand].config || {};
    const merged = { ...current, ...partial };
    await saveLogoConfig(brand, merged);
    state.logos[brand].config = merged;
    await renderCanvas();
  };

  // Subir PNG
  panel.querySelector('#lg-upload').addEventListener('click', () => {
    panel.querySelector('#lg-file').click();
  });

  panel.querySelector('#lg-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      await persistAndRedraw({ overrideDataUrl: dataUrl });
      // Recargar imagen
      const { image } = await loadAllLogos().then((l) => l[brand]);
      if (state.logos[brand]) state.logos[brand].image = image;
      await renderCanvas();
      renderLogoPanel();
      console.log(`[factory] Logo override de ${brand} aplicado`);
    };
    reader.readAsDataURL(file);
  });

  // Restaurar oficial
  panel.querySelector('#lg-clear').addEventListener('click', async () => {
    if (!confirm('¿Volver al logo oficial de assets/logos/?')) return;
    await clearLogoOverride(brand);
    const logos = await loadAllLogos();
    state.logos = logos;
    await renderCanvas();
    renderLogoPanel();
  });

  // Activar / ocultar
  panel.querySelector('#lg-active-on').addEventListener('click', async () => {
    await persistAndRedraw({ active: true });
    renderLogoPanel();
  });
  panel.querySelector('#lg-active-off').addEventListener('click', async () => {
    await persistAndRedraw({ active: false });
    renderLogoPanel();
  });

  // Escala
  const scaleInput = panel.querySelector('#lg-scale');
  scaleInput.addEventListener('input', async (e) => {
    const v = parseInt(e.target.value, 10);
    panel.querySelector('#lg-scale-val').textContent = v + '%';
    await persistAndRedraw({ scale: v });
  });

  // X
  const xInput = panel.querySelector('#lg-x');
  xInput.addEventListener('input', async (e) => {
    const v = parseInt(e.target.value, 10);
    panel.querySelector('#lg-x-val').textContent = v + '%';
    await persistAndRedraw({ x: v });
  });

  // Y
  const yInput = panel.querySelector('#lg-y');
  yInput.addEventListener('input', async (e) => {
    const v = parseInt(e.target.value, 10);
    panel.querySelector('#lg-y-val').textContent = v + '%';
    await persistAndRedraw({ y: v });
  });

  // Opacidad
  const opInput = panel.querySelector('#lg-opacity');
  opInput.addEventListener('input', async (e) => {
    const v = parseInt(e.target.value, 10);
    panel.querySelector('#lg-opacity-val').textContent = v + '%';
    await persistAndRedraw({ opacity: v / 100 });
  });
  
  // Reset posición a 74/5
  const resetPosBtn = panel.querySelector('#lg-reset-pos');
  if (resetPosBtn) {
    resetPosBtn.addEventListener('click', async () => {
      await persistAndRedraw({ x: 74, y: 5 });
      renderLogoPanel();
    });
  }
}

// --- Aplica el preset marcado como default para un brand ---
async function applyDefaultPresetForBrand(brand) {
  if (!brand) return false;

  const presets = await listPresets();
  const defaultPreset = presets.find((p) => p.brand === brand && p.isDefault === true);

  if (!defaultPreset || !defaultPreset.design) {
    console.log(`[factory] Sin preset default para brand: ${brand}`);
    return false;
  }

  ['post', 'story', 'stories', 'carousel'].forEach((fmt) => {
    if (defaultPreset.design[fmt]) {
      state.formatConfigs[fmt] = { ...defaultPreset.design[fmt] };
    }
  });

  state.activePresetId = defaultPreset.id;
  state.activePresetBrand = defaultPreset.brand;
  console.log(`[factory] Preset default aplicado para ${brand}: "${defaultPreset.name}"`);
  return true;
}

export async function initFactory() {
  console.log('[factory] Iniciando módulo');
  injectFactoryUI();

  // Intentar restaurar la config previa desde IndexedDB
  const saved = await loadWorkingState();
  if (saved) {
    // Restaurar formatConfigs
    if (saved.formatConfigs) {
      const keys = Object.keys(DEFAULT_FORMAT_CONFIG);
      ['post', 'story', 'stories', 'carousel'].forEach((fmt) => {
        if (saved.formatConfigs[fmt]) {
          const clean = {};
          keys.forEach((k) => {
            clean[k] = saved.formatConfigs[fmt][k] ?? DEFAULT_FORMAT_CONFIG[k];
          });
          state.formatConfigs[fmt] = clean;
        }
      });
    }

    // Restaurar imgConfigs (post y story)
    if (saved.imgConfigs) {
      ['post', 'story'].forEach((fmt) => {
        if (saved.imgConfigs[fmt]) {
          state.imgConfigs[fmt] = { ...DEFAULT_IMG_CONFIG, ...saved.imgConfigs[fmt] };
        }
      });
    }

    // Restaurar slides (solo si eran parte de un formato con slides)
    if (Array.isArray(saved.slides) && saved.slides.length > 0) {
      state.slides = saved.slides.map((s) => ({
        id: s.id,
        template: s.template || 'content',
        content: s.content || { category: '', headline: '', body: '' },
        imageUrl: s.imageUrl || null,
        selectedImageUrl: s.selectedImageUrl || null,
        image: null,   // se recarga abajo
        imgConfig: s.imgConfig
          ? { ...DEFAULT_IMG_CONFIG, ...s.imgConfig }
          : { ...DEFAULT_IMG_CONFIG },
      }));
      state.currentSlideIdx = saved.currentSlideIdx || 0;

      // Recargar las imágenes de cada slide
      await Promise.all(
        state.slides.map(async (s) => {
          if (s.imageUrl) {
            s.image = await loadImageSmart(s.imageUrl);
          }
        })
      );
    }

    state.activePresetId = saved.activePresetId || null;
    state.activePresetBrand = saved.activePresetBrand || null;
    console.log('[factory] Configuración restaurada desde IndexedDB');
  }

  // Cargar los logos (override o assets oficiales)
  await reloadLogos();

  setFormat('post');
  setTool('texto');

  // Panel Blog: mostrar estado inicial (vacío)
  renderBlogPanel();
}

// --- Cargar los logos desde IndexedDB o assets/logos/ ---
async function reloadLogos() {
  try {
    const logos = await loadAllLogos();
    state.logos = logos;
    console.log('[factory] Logos cargados:', {
      random: logos.random?.source,
      express: logos.express?.source,
    });
  } catch (err) {
    console.error('[factory] Error cargando logos', err);
    state.logos = { random: null, express: null };
  }
}

export function getFactoryState() {
  return state;
}

// --- Exponer renderCanvas para uso externo (bridge con Calidad) ---
export const __renderCanvasForBridge = renderCanvas;