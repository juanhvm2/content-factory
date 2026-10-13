// factory-quality-bridge.js
// Puente entre la Fábrica y el módulo Calidad.
// Guarda una pieza (o varias) en el store 'pieces' de IndexedDB.

import * as store from '../../core/store.js?v=42';
import { recargarImagenesConCors } from './factory-exporter.js?v=42';

// --- Genera un ID único para la pieza ---
function generatePieceId() {
  return 'piece_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// --- Genera una miniatura en base64 a partir del canvas ---
function getCanvasThumbnail(canvas, maxSize = 300) {
  if (!canvas) return null;
  try {
    const tmp = document.createElement('canvas');
    const ratio = canvas.width / canvas.height;
    let w, h;
    if (ratio > 1) {
      w = maxSize;
      h = Math.round(maxSize / ratio);
    } else {
      h = maxSize;
      w = Math.round(maxSize * ratio);
    }
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(canvas, 0, 0, w, h);
    return tmp.toDataURL('image/jpeg', 0.7);
  } catch (err) {
    console.warn('[bridge] No se pudo generar thumbnail (canvas tainted)', err.message);
    return null;
  }
}

// --- Fallback: si el canvas está tainted, usamos la imagen de la noticia ---
function getFallbackThumbnail(workItem) {
  if (!workItem) return null;
  // Preferimos la imagen principal de la noticia
  return workItem.imageUrl || (workItem.images && workItem.images[0]) || null;
}

// --- Guarda una pieza en la base ---
// Recibe el state completo de la Fábrica y opciones de qué guardar.
export async function savePiecesToQuality(factoryState, options = {}) {
  const { mode = 'current' } = options;
  const canvas = document.getElementById('factory-canvas');
  if (!canvas) throw new Error('Canvas no encontrado');

  const workItem = factoryState.currentWorkItem;
  if (!workItem) throw new Error('No hay trabajo cargado en la Fábrica');

   // Recargar imágenes con CORS para poder exportar el canvas
  console.log('[bridge] Recargando imágenes con CORS…');
  try {
    await recargarImagenesConCors(factoryState);
  } catch (err) {
    console.warn('[bridge] Falló recarga con CORS, sigo con lo que haya', err);
  }

  // Importar renderCanvas dinámicamente y redibujar (para limpiar el canvas tainted)
  const factoryModule = await import('./factory.js?v=42');
  const renderCanvas = factoryModule.__renderCanvasForBridge;
  if (!renderCanvas) throw new Error('No se pudo acceder a renderCanvas');

  await renderCanvas();
  // Pequeña espera para que se complete el repintado antes de generar el thumb
  await new Promise((r) => setTimeout(r, 50));

  const format = factoryState.format;
  const brand = workItem.brand || 'random';
  const formatLabel = {
    post: 'Post',
    story: 'Historia',
    stories: 'Historias',
    carousel: 'Carrusel',
  }[format] || format;

  // --- Modo actual: guarda solo el slide visible ---
  if (mode === 'current' || !['carousel', 'stories'].includes(format)) {
    const piece = buildPiece({
      format,
      brand,
      formatLabel,
      workItem,
      content: factoryState.currentContent,
      slideIndex: factoryState.currentSlideIdx || 0,
      thumbDataUrl: getCanvasThumbnail(canvas) || getFallbackThumbnail(workItem),
      templateConfig: factoryState.formatConfigs[format] || null,
      imgConfig: factoryState.imgConfigs[format] || null,
    });

    await store.set('pieces', piece.id, piece);
    console.log('[bridge] Pieza guardada en Calidad:', piece.id);
    return { saved: 1, pieces: [piece] };
  }

  // --- Modo all: recorre todos los slides ---
  const slides = factoryState.slides || [];
  if (slides.length === 0) {
    throw new Error('No hay slides para exportar');
  }

  const savedPieces = [];

  // Guardar el estado actual para restaurarlo después
  const origIdx = factoryState.currentSlideIdx;
  const origContent = factoryState.currentContent;
  const origImage = factoryState.currentImage;

  
  for (let i = 0; i < slides.length; i++) {
    factoryState.currentSlideIdx = i;
    factoryState.currentContent = slides[i].content;
    factoryState.currentImage = slides[i].image;

    await renderCanvas();

    const piece = buildPiece({
      format,
      brand,
      formatLabel,
      workItem,
      content: slides[i].content,
      slideIndex: i,
      totalSlides: slides.length,
      thumbDataUrl: getCanvasThumbnail(canvas) || getFallbackThumbnail(workItem),
      templateConfig: factoryState.formatConfigs[format] || null,
      imgConfig: slides[i].imgConfig || null,
    });

    await store.set('pieces', piece.id, piece);
    savedPieces.push(piece);
  }

  // Restaurar state
  factoryState.currentSlideIdx = origIdx;
  factoryState.currentContent = origContent;
  factoryState.currentImage = origImage;
  await renderCanvas();

  console.log(`[bridge] ${savedPieces.length} piezas guardadas en Calidad`);
  return { saved: savedPieces.length, pieces: savedPieces };
}

// --- Construye el objeto pieza ---
function buildPiece({ format, brand, formatLabel, workItem, content, slideIndex, totalSlides, thumbDataUrl, templateConfig, imgConfig }) {
  const now = new Date().toISOString();
  const isMultiSlide = ['carousel', 'stories'].includes(format);
  const title = isMultiSlide
    ? `${workItem.title} (${slideIndex + 1}/${totalSlides || '?'})`
    : workItem.title;

  return {
    id: generatePieceId(),
    format,
    formatLabel,
    brand,
    state: 'pending_review', // Recién enviado a Calidad

    // Datos de origen
    workItemId: workItem.id,
    newsId: workItem.newsId,
    newsTitle: workItem.title,
    newsLink: workItem.link,
    newsImage: workItem.imageUrl,

    // Contenido de la pieza
    title: title.slice(0, 200),
    content: content || null,
    slideIndex: slideIndex,
    totalSlides: totalSlides || 1,

    // Configuración (para reproducción futura)
    templateConfig: templateConfig,
    imgConfig: imgConfig,

    // Presentación
    thumbDataUrl: thumbDataUrl,

    // Metadata
    createdAt: now,
    updatedAt: now,
    validations: [],   // se llena en Paso 30
    notes: '',         // comentarios del revisor
  };
}