// factory-persistence.js
// Persistencia de la configuración de la Fábrica y de los presets.
// Usa los stores 'settings' y 'presets' de IndexedDB.

import * as store from '../../core/store.js?v=49';

const SETTINGS_KEY = 'factory_working_state';

// --- Guardar el estado de trabajo (formatConfigs + activePresetId) ---
export async function saveWorkingState(state) {
  try {
        const toSave = {
      formatConfigs: state.formatConfigs,
      imgConfigs: state.imgConfigs,
      slides: (state.slides || []).map((s) => ({
        id: s.id,
        template: s.template,
        content: s.content,
        imageUrl: s.imageUrl,
        selectedImageUrl: s.selectedImageUrl || null,
        imgConfig: s.imgConfig || null,
        // No guardamos s.image (HTMLImageElement no es serializable)
      })),
      currentSlideIdx: state.currentSlideIdx || 0,
      activePresetId: state.activePresetId || null,
      activePresetBrand: state.activePresetBrand || null,
      updatedAt: new Date().toISOString(),
    };
    await store.set('settings', SETTINGS_KEY, toSave);
    console.log('[factory-persist] Working state guardado');
    return true;
  } catch (err) {
    console.error('[factory-persist] Error guardando working state', err);
    return false;
  }
}

// --- Cargar el estado de trabajo ---
export async function loadWorkingState() {
  try {
    const saved = await store.get('settings', SETTINGS_KEY);
    if (!saved) {
      console.log('[factory-persist] Sin working state previo');
      return null;
    }
    console.log('[factory-persist] Working state cargado');
    return saved;
  } catch (err) {
    console.error('[factory-persist] Error cargando working state', err);
    return null;
  }
}

// --- Listar todos los presets ---
export async function listPresets() {
  try {
    const all = await store.getAll('presets');
    return all.sort((a, b) => {
      // Primero por brand (random, express, custom), después por fecha
      if (a.brand !== b.brand) {
        const order = { random: 0, express: 1, custom: 2 };
        return (order[a.brand] ?? 3) - (order[b.brand] ?? 3);
      }
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });
  } catch (err) {
    console.error('[factory-persist] Error listando presets', err);
    return [];
  }
}

// --- Guardar (crear o actualizar) un preset ---
export async function savePreset(preset) {
  try {
    if (!preset.id) {
      preset.id = 'preset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }
    if (!preset.createdAt) {
      preset.createdAt = new Date().toISOString();
    }
    preset.updatedAt = new Date().toISOString();
    await store.set('presets', preset.id, preset);
    console.log('[factory-persist] Preset guardado:', preset.name);
    return preset;
  } catch (err) {
    console.error('[factory-persist] Error guardando preset', err);
    return null;
  }
}

// --- Eliminar un preset ---
export async function deletePreset(id) {
  try {
    await store.remove('presets', id);
    console.log('[factory-persist] Preset eliminado:', id);
    return true;
  } catch (err) {
    console.error('[factory-persist] Error eliminando preset', err);
    return false;
  }
}

// --- Obtener un preset por id ---
export async function getPreset(id) {
  try {
    return await store.get('presets', id);
  } catch (err) {
    console.error('[factory-persist] Error obteniendo preset', err);
    return null;
  }
}