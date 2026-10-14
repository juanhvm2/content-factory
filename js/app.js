// app.js
// Punto de entrada de la aplicación.

import * as store from './core/store.js?v=46';
import { initForest } from './modules/forest/forest_v2.js?v=46';
import { initWarehouse } from './modules/warehouse/warehouse.js?v=46';
import { initFactory } from './modules/factory/factory.js?v=46';
import { initQuality } from './modules/quality/quality.js?v=46';
import { cleanupOldItems } from './services/cleanup-service.js?v=46';

// --- Navegación entre módulos ---
function setupNavigation() {
  const items = document.querySelectorAll('.module-item');
  const views = document.querySelectorAll('.module-view');

  items.forEach((item) => {
    item.addEventListener('click', async () => {
      const target = item.dataset.module;
      items.forEach((i) => i.classList.toggle('is-active', i === item));
      views.forEach((v) =>
        v.classList.toggle('is-active', v.dataset.moduleView === target)
      );

      // Refrescar Calidad cuando entrás a ese módulo
      if (target === 'quality') {
        try {
          const mod = await import('./modules/quality/quality.js?v=46');
          await mod.refreshQuality();
        } catch (err) {
          console.warn('[app] No se pudo refrescar Calidad', err);
        }
      }
    });
  });
}

// --- Contador de arranques (prueba de persistencia) ---
async function testPersistence() {
  const el = document.getElementById('boot-counter');
  if (!el) return;

  try {
    const previous = (await store.get('system', 'bootCount')) || 0;
    const current = previous + 1;

    await store.set('system', 'bootCount', current);
    await store.set('system', 'lastBoot', new Date().toISOString());

    el.textContent = `Arranques: ${current}`;
    el.classList.add('status-ok');
    console.log(`[app] IndexedDB funciona. Arranque #${current}`);
  } catch (error) {
    console.error('[app] Error en la prueba de persistencia', error);
    el.textContent = 'Error de persistencia';
  }
}

// --- Modales ---
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('is-open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('is-open');
}

function setupModals() {
  // Cerrar con los botones "×" o "Cerrar"
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.closeModal);
    });
  });

  // Cerrar al hacer clic en el fondo (fuera del .modal)
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('is-open');
      }
    });
  });

  // Cerrar con tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.is-open').forEach((m) => {
        m.classList.remove('is-open');
      });
    }
  });
}

// --- Panel de estado de la base ---
async function refreshDbInfo() {
  const tbody = document.getElementById('db-info-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="2" class="db-empty">Cargando…</td></tr>';

  try {
    const info = await store.info();
    tbody.innerHTML = info
      .map(
        (s) => `
      <tr>
        <td class="db-store-name">${s.name}</td>
        <td class="db-store-count">${s.count === null ? '—' : s.count}</td>
      </tr>`
      )
      .join('');
  } catch (error) {
    console.error('[app] Error al leer info de la base', error);
    tbody.innerHTML =
      '<tr><td colspan="2" class="db-empty">Error al leer la base</td></tr>';
  }
}

function setupDbInfoButton() {
  const btn = document.getElementById('db-info-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    openModal('db-info-modal');
    await refreshDbInfo();
  });
}

// --- Reset de la base ---
function setupDbResetButton() {
  const btn = document.getElementById('db-reset-btn');
  const confirm = document.getElementById('db-reset-confirm');
  if (!btn || !confirm) return;

  btn.addEventListener('click', () => {
    openModal('db-reset-modal');
  });

  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    confirm.textContent = 'Borrando…';
    try {
      await store.clearAll();
      closeModal('db-reset-modal');
      // Recargamos la página para que el contador arranque desde 0
      window.location.reload();
    } catch (error) {
      console.error('[app] Error al resetear', error);
      confirm.textContent = 'Error';
      confirm.disabled = false;
    }
  });
}

// --- Inicio ---
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupModals();
  setupDbInfoButton();
  setupDbResetButton();
  await testPersistence();

  // Auto-limpieza de elementos viejos (silenciosa)
  try {
    const result = await cleanupOldItems({ dryRun: false });
    if (result.workItems > 0 || result.pieces > 0) {
      // Avisar al usuario después de un delay para no pisar otros toasts
      setTimeout(() => {
        const parts = [];
        if (result.workItems > 0) parts.push(`${result.workItems} workItems del Galpón`);
        if (result.pieces > 0) parts.push(`${result.pieces} piezas de Calidad`);
        showCleanupToast(`🧹 Se limpiaron ${parts.join(' y ')} viejos`);
      }, 1500);
    }
  } catch (err) {
    console.warn('[app] Auto-limpieza falló:', err);
  }

  await initForest();
  await initWarehouse();
  await initFactory();
  await initQuality();
});

// --- Toast de limpieza (reutiliza el estilo de toasts existente) ---
function showCleanupToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) {
    console.warn('[app] toastContainer no encontrado, log limpio:', message);
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast toast-success';
  toast.innerHTML = `<i class="fas fa-broom"></i><div class="toast-text">${message}</div>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}