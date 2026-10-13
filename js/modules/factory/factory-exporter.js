// factory-exporter.js
// Exportación de piezas de la Fábrica.
// - Imagen individual (JPG)
// - ZIP con todos los slides
//
// Maneja el problema de CORS: si una imagen fue cargada sin CORS,
// el canvas queda "contaminado" y no se puede exportar.
// En ese caso, la recargamos vía proxy que sí manda CORS.

// Carga una imagen forzando CORS. Si falla, intenta vía proxy.
async function loadImageWithCORS(url) {
  if (!url) return null;

  // Intento 1: directo con CORS
  const tryWithCORS = (u) =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = u;
    });

  let img = await tryWithCORS(url);
  if (img) {
    console.log('[exporter] Imagen con CORS (directo):', url);
    return img;
  }

  // Intento 2: weserv
  const stripped = url.replace(/^https?:\/\//, '');
  let img2 = await tryWithCORS('https://images.weserv.nl/?url=' + encodeURIComponent(stripped));
  if (img2) {
    console.log('[exporter] Imagen con CORS (weserv):', url);
    return img2;
  }

  // Intento 3: weserv con ancho forzado (evita algunos bloqueos)
  img2 = await tryWithCORS(
    'https://images.weserv.nl/?url=' + encodeURIComponent(stripped) + '&w=1200'
  );
  if (img2) {
    console.log('[exporter] Imagen con CORS (weserv w1200):', url);
    return img2;
  }

  // Intento 4: corsproxy.io
  img2 = await tryWithCORS('https://corsproxy.io/?url=' + encodeURIComponent(url));
  if (img2) {
    console.log('[exporter] Imagen con CORS (corsproxy):', url);
    return img2;
  }

  console.warn('[exporter] No se pudo cargar con CORS:', url);
  return null;
}

// Convierte un canvas a Blob JPG
function canvasToJpegBlob(canvas, quality = 0.95) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('toBlob devolvió null'));
        },
        'image/jpeg',
        quality
      );
    } catch (err) {
      reject(err);
    }
  });
}

// --- Exportar el slide actual ---
// Recibe:
//   - el state actual (con currentContent, currentImage, format, currentSlideIdx)
//   - la función renderCanvas
// Devuelve Blob JPG.
export async function exportCurrentSlide(state, renderCanvas) {
  const canvas = document.getElementById('factory-canvas');
  if (!canvas) throw new Error('No se encontró el canvas');

  // Intento 1: directo (funciona si todas las imágenes tienen CORS)
  try {
    const blob = await canvasToJpegBlob(canvas);
    return { blob, usedProxy: false };
  } catch (err) {
    console.warn('[exporter] Export directo falló, recargando con CORS', err);
  }

  // Intento 2: recargar todas las imágenes con CORS y reintentar
  await recargarImagenesConCors(state);
  await renderCanvas();

  const blob = await canvasToJpegBlob(canvas);
  return { blob, usedProxy: true };
}

// --- Exportar TODOS los slides (ZIP) ---
// Recibe:
//   - el state actual
//   - la función renderCanvas
//   - un nombre base para los archivos
export async function exportAllAsZip(state, renderCanvas, baseName = 'piezas') {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip no está cargado. Verificá el index.html.');
  }

  const dims = state.slides.length > 0 ? state.slides.length : 1;
  const originalSlideIdx = state.currentSlideIdx;
  const originalContent = state.currentContent;
  const originalImage = state.currentImage;

  // 1. Recargar todas las imágenes con CORS
  await recargarImagenesConCors(state);

  // 2. Por cada slide: seleccionar, renderizar y exportar
  const zip = new JSZip();
  const folder = zip.folder(baseName);

  for (let i = 0; i < dims; i++) {
    // Seleccionar slide i
    if (state.slides.length > 0) {
      state.currentSlideIdx = i;
      const slide = state.slides[i];
      state.currentContent = slide.content;
      state.currentImage = slide.image;
    }

    await renderCanvas();

    const canvas = document.getElementById('factory-canvas');
    const blob = await canvasToJpegBlob(canvas);
    const fileName = `slide_${String(i + 1).padStart(2, '0')}.jpg`;

    // Convertir blob a base64 para JSZip
    const base64 = await blobToBase64(blob);
    folder.file(fileName, base64, { base64: true });
  }

  // 3. Agregar un archivo con metadata
  const meta = {
    generado: new Date().toISOString(),
    formato: state.format,
    total: dims,
    brand: state.currentWorkItem?.brand || null,
    noticia: state.currentWorkItem?.title || null,
  };
  folder.file('metadata.json', JSON.stringify(meta, null, 2));

  // 4. Generar ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  // 5. Restaurar state
  state.currentSlideIdx = originalSlideIdx;
  state.currentContent = originalContent;
  state.currentImage = originalImage;
  await renderCanvas();

  return { blob: zipBlob, total: dims };
}

// --- Recarga todas las imágenes con CORS ---
export async function recargarImagenesConCors(state) {
  // Imagen del slide actual (o del formato sin slides)
  if (state.currentImage && state.selectedImageUrl) {
    const reloaded = await loadImageWithCORS(state.selectedImageUrl);
    if (reloaded) state.currentImage = reloaded;
  } else if (state.currentWorkItem?.imageUrl) {
    const url = state.selectedImageUrl || state.currentWorkItem.imageUrl;
    const reloaded = await loadImageWithCORS(url);
    if (reloaded) state.currentImage = reloaded;
  }

  // Imágenes de cada slide
  for (const slide of state.slides || []) {
    const url = slide.selectedImageUrl || slide.imageUrl;
    if (url) {
      const reloaded = await loadImageWithCORS(url);
      if (reloaded) slide.image = reloaded;
    }
  }

  // Logos
  if (state.logos?.random?.image && state.logos.random.config?.overrideDataUrl) {
    // Los logos en base64 no necesitan CORS, no hacemos nada
  }
}

// --- Convertir Blob a Base64 (sin el prefijo data:) ---
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}