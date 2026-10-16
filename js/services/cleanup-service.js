// cleanup-service.js
// Limpieza automática y manual de workItems y pieces viejos.

import * as store from '../core/store.js?v=51';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// --- Reglas de retención (en milisegundos) ---
const RETENTION = {
  // Galpón
  workItemPending:   2 * DAY,   // No enviado a Fábrica
  workItemStarred:   2 * DAY,   // Destacado
  workItemDiscarded: 24 * HOUR, // Descartado

  // Calidad (piezas)
  pieceDraft:         1 * DAY,
  piecePending:       2 * DAY,
  pieceApproved:      2 * DAY,
  pieceReady:         3 * DAY,
  pieceExported:      2 * DAY,
  pieceDiscarded:     24 * HOUR,
};

// --- Evalúa si un workItem debe borrarse ---
function shouldDeleteWorkItem(wi, now, workItemsWithPieces) {
  // Si tiene una pieza asociada en Calidad, NO se borra
  if (workItemsWithPieces.has(wi.id)) return false;

  const age = now - new Date(wi.createdAt || wi.updatedAt).getTime();

  if (wi.isDiscarded) return age > RETENTION.workItemDiscarded;
  if (wi.isStarred) return age > RETENTION.workItemStarred;
  return age > RETENTION.workItemPending;
}

// --- Evalúa si una pieza debe borrarse ---
function shouldDeletePiece(p, now) {
  const age = now - new Date(p.createdAt || p.updatedAt).getTime();
  const state = p.state || 'draft';

  if (p.isDiscarded || state === 'discarded') return age > RETENTION.pieceDiscarded;

  switch (state) {
    case 'draft':          return age > RETENTION.pieceDraft;
    case 'pending_review': return age > RETENTION.piecePending;
    case 'approved':       return age > RETENTION.pieceApproved;
    case 'ready':          return age > RETENTION.pieceReady;
    case 'exported':       return age > RETENTION.pieceExported;
    default:               return age > RETENTION.piecePending;
  }
}

// --- Restaurar noticia al estado "discovered" al borrar un workItem ---
async function restoreNewsForWorkItem(wi) {
  if (!wi || !wi.newsId) return;
  const news = await store.get('news', wi.newsId);
  if (news) {
    await store.set('news', wi.newsId, {
      ...news,
      status: 'discovered',
      workItemId: null,
    });
  }
}

// --- Función principal ---
// dryRun = true → solo cuenta sin borrar (para preview)
export async function cleanupOldItems({ dryRun = false } = {}) {
  const now = Date.now();
  const results = { workItems: 0, pieces: 0, details: { workItems: [], pieces: [] } };

  // 1. Cargar todo
  const allWorkItems = await store.getAll('workItems');
  const allPieces = await store.getAll('pieces');

  // 2. Set de workItemIds referenciados por piezas
  const workItemsWithPieces = new Set(
    allPieces.map((p) => p.workItemId).filter(Boolean)
  );

  // 3. Filtrar workItems viejos
  const workItemsToDelete = allWorkItems.filter((wi) =>
    shouldDeleteWorkItem(wi, now, workItemsWithPieces)
  );

  // 4. Filtrar piezas viejas
  const piecesToDelete = allPieces.filter((p) => shouldDeletePiece(p, now));

  results.workItems = workItemsToDelete.length;
  results.pieces = piecesToDelete.length;
  results.details.workItems = workItemsToDelete.map((w) => ({
    id: w.id,
    title: w.title?.slice(0, 60) || '(sin título)',
    status: w.isStarred ? 'destacado' : w.isDiscarded ? 'descartado' : 'pendiente',
  }));
  results.details.pieces = piecesToDelete.map((p) => ({
    id: p.id,
    title: p.title?.slice(0, 60) || '(sin título)',
    format: p.formatLabel || p.format,
    state: p.state,
  }));

  // 5. Si es dryRun, devolver sin borrar
  if (dryRun) return results;

  // 6. Borrar workItems y restaurar sus noticias
  for (const wi of workItemsToDelete) {
    await restoreNewsForWorkItem(wi);
    await store.remove('workItems', wi.id);
  }

  // 7. Borrar piezas
  for (const p of piecesToDelete) {
    await store.remove('pieces', p.id);
  }

  // 8. Log
  if (results.workItems > 0 || results.pieces > 0) {
    console.log(
      `[cleanup] Borrados ${results.workItems} workItems y ${results.pieces} piezas viejas`
    );
  }

  return results;
}