// deduplicator.js
// Detección de noticias duplicadas o muy similares.
// Estrategia por capas: link exacto → título idéntico → título similar
// → keywords + categoría.

// Normaliza texto: minúsculas, sin tildes, sin puntuación
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Devuelve un Set de palabras significativas del título
function titleTokens(title) {
  return new Set(
    normalize(title)
      .split(' ')
      .filter((w) => w.length > 3)
  );
}

// Similitud Jaccard entre dos Sets (0 = nada en común, 1 = idénticos)
function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// --- Función principal: busca un duplicado entre los items existentes ---
// Devuelve { item, reason, score } o null si no encuentra nada.
export function findDuplicate(newNews, existingItems) {
  if (!newNews || !existingItems || existingItems.length === 0) return null;

  const newLink = (newNews.link || '').trim().toLowerCase();
  const newTitleSet = titleTokens(newNews.title);
  const newKeywords = new Set(
    (newNews.analysis?.keywords || []).map((k) => String(k).toLowerCase())
  );
  const newCat = newNews.analysis?.detectedCategory || null;

  for (const item of existingItems) {
    // 1. Link exacto (100% duplicado)
    const itemLink = (item.link || '').trim().toLowerCase();
    if (newLink && itemLink && newLink === itemLink) {
      return { item, reason: 'link', score: 1.0 };
    }

    // Comparar títulos
    const itemTitleSet = titleTokens(item.title);
    const titleSim = jaccard(newTitleSet, itemTitleSet);

    // 2. Título casi idéntico
    if (titleSim >= 0.85) {
      return { item, reason: 'title_exact', score: titleSim };
    }

    // 3. Keywords similares + misma categoría
    const itemKeywords = new Set(
      (item.analysis?.keywords || []).map((k) => String(k).toLowerCase())
    );
    const kwSim = jaccard(newKeywords, itemKeywords);
    const itemCat = item.analysis?.detectedCategory || null;
    const sameCat = newCat && itemCat && newCat === itemCat;

    if (kwSim >= 0.5 && sameCat) {
      return { item, reason: 'keywords_category', score: kwSim };
    }

    // 4. Título moderadamente similar (último recurso)
    if (titleSim >= 0.7) {
      return { item, reason: 'title_similar', score: titleSim };
    }
  }

  return null;
}