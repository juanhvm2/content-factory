// source-editor.js
// Editor de fuentes: alta, edición y eliminación.
// Maneja el modal dedicado del Bosque.

import * as store from '../../core/store.js?v=52';
import { CATEGORIES, REGIONS } from '../../data/categories.js?v=52';

let currentEditingId = null;
let onSaveCallback = null;

// --- Abrir el editor (con o sin id existente) ---
export async function openSourceEditor(sourceId, onSave) {
  currentEditingId = sourceId || null;
  onSaveCallback = onSave;

  const modal = document.getElementById('source-editor-modal');
  const title = document.getElementById('source-editor-title');
  const deleteBtn = document.getElementById('source-editor-delete');

  renderCategoryCheckboxes();
  renderRegionOptions();

  if (sourceId) {
    title.textContent = 'Editar fuente';
    deleteBtn.style.display = 'inline-block';
    await loadSourceData(sourceId);
  } else {
    title.textContent = 'Nueva fuente';
    deleteBtn.style.display = 'none';
    clearForm();
  }

  modal.classList.add('is-open');
}

// --- Cargar datos de una fuente existente ---
async function loadSourceData(id) {
  const source = await store.get('sources', id);
  if (!source) return;

  document.getElementById('se-name').value = source.name || '';
  document.getElementById('se-url').value = source.url || '';
  document.getElementById('se-region').value = source.region || 'argentina';

  document.querySelectorAll('#se-categories input[type="checkbox"]').forEach((cb) => {
    cb.checked = (source.categories || []).includes(cb.value);
  });
}

// --- Limpiar el formulario ---
function clearForm() {
  document.getElementById('se-name').value = '';
  document.getElementById('se-url').value = '';
  document.getElementById('se-region').value = 'argentina';
  document.querySelectorAll('#se-categories input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
}

// --- Renderizar el selector de categorías ---
function renderCategoryCheckboxes() {
  const container = document.getElementById('se-categories');
  if (!container) return;

  // Agrupar por "group"
  const groups = {};
  CATEGORIES.forEach((c) => {
    if (!groups[c.group]) groups[c.group] = [];
    groups[c.group].push(c);
  });

  container.innerHTML = Object.entries(groups)
    .map(
      ([groupName, cats]) => `
      <div class="cat-group">
        <div class="cat-group-title">${groupName}</div>
        <div class="cat-group-items">
          ${cats
            .map(
              (c) => `
            <label class="cat-checkbox">
              <input type="checkbox" value="${c.id}">
              <span style="color:${c.color}">${c.name}</span>
            </label>`
            )
            .join('')}
        </div>
      </div>`
    )
    .join('');
}

// --- Renderizar el dropdown de regiones ---
function renderRegionOptions() {
  const select = document.getElementById('se-region');
  if (!select) return;
  select.innerHTML = REGIONS.map(
    (r) => `<option value="${r.id}">${r.flag} ${r.name}</option>`
  ).join('');
}

// --- Conectar los listeners del modal (se llama una sola vez) ---
export function setupSourceEditor() {
  const modal = document.getElementById('source-editor-modal');
  if (!modal || modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';

  const form = document.getElementById('source-editor-form');
  const cancelBtn = document.getElementById('source-editor-cancel');
  const deleteBtn = document.getElementById('source-editor-delete');
  const closeBtn = modal.querySelector('.modal-close');

  const close = () => {
    modal.classList.remove('is-open');
    currentEditingId = null;
  };

  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  // Guardar
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('se-name').value.trim();
    const url = document.getElementById('se-url').value.trim();
    const region = document.getElementById('se-region').value;
    const categories = Array.from(
      document.querySelectorAll('#se-categories input[type="checkbox"]:checked')
    ).map((cb) => cb.value);

    if (!name || !url) {
      alert('Nombre y URL son obligatorios.');
      return;
    }

    // Validar URL
    try {
      new URL(url);
    } catch {
      alert('La URL no es válida. Asegurate de incluir http:// o https://');
      return;
    }

    if (currentEditingId) {
      const existing = await store.get('sources', currentEditingId);
      const updated = {
        ...existing,
        name,
        url,
        region,
        categories,
        updatedAt: new Date().toISOString(),
      };
      await store.set('sources', currentEditingId, updated);
    } else {
      const id = 'src_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const newSource = {
        id,
        name,
        url,
        region,
        categories,
        type: 'rss',
        method: 'rss',
        frequency: 'manual',
        status: 'idle',
        lastFetch: null,
        activityLog: [],
        createdAt: new Date().toISOString(),
        isCustom: true,
      };
      await store.set('sources', id, newSource);
    }

    close();
    if (onSaveCallback) await onSaveCallback();
  });

  // Eliminar
  deleteBtn.addEventListener('click', async () => {
    if (!currentEditingId) return;
    if (!confirm('¿Eliminar esta fuente? Esta acción no se puede deshacer.')) return;

    await store.remove('sources', currentEditingId);
    close();
    if (onSaveCallback) await onSaveCallback();
  });
}