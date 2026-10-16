// store.js
// Capa de persistencia del proyecto. Usa IndexedDB para guardar
// fuentes, noticias, piezas, plantillas, reglas y todo lo que la app necesite.

const DB_NAME = 'content-factory';
const DB_VERSION = 3;

// Todas las "tablas" del sistema.
// Cada una guarda un tipo de dato distinto.
export const STORES = [
  'system',      // metadatos de la app (arranques, configuraciones internas)
  'settings',    // preferencias del usuario
  'sources',     // fuentes del Bosque
  'news',        // noticias recolectadas
  'workItems',   // noticias aprobadas que entran a la Fábrica
  'pieces',      // piezas de contenido (post, story, carrusel)
  'templates',   // plantillas de diseño
  'logos',       // logos cargados (Random / Express)
  'rules',       // reglas aprendidas
  'actionLog',   // registro de acciones para el aprendizaje
  'presets',     // presets de diseño
  'efemerides',  // efemérides históricas (cache de API)
];

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[store] Error al abrir IndexedDB', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[store] IndexedDB abierta (versión', DB_VERSION + ')');
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('[store] Actualizando estructura de la base');
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
          console.log('[store]   + store creado:', name);
        }
      });
    };
  });

  return dbPromise;
}

// Guarda un valor bajo una clave en un store
export async function set(storeName, key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Lee un valor por su clave
export async function get(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Elimina un valor por su clave
export async function remove(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Devuelve todas las claves de un store
export async function keys(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Devuelve todos los valores de un store
export async function getAll(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Cuenta cuántos elementos hay en un store
export async function count(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Borra todo un store
export async function clear(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Borra TODOS los stores (reset de desarrollo)
export async function clearAll() {
  for (const name of STORES) {
    await clear(name);
  }
  console.log('[store] Base de datos reseteada');
}

// Devuelve información de cada store (nombre + cantidad de registros)
export async function info() {
  const result = [];
  for (const name of STORES) {
    try {
      const c = await count(name);
      result.push({ name, count: c });
    } catch (error) {
      result.push({ name, count: null, error: error.message });
    }
  }
  return result;
}

// Exporta toda la base como objeto JSON (para backup)
export async function exportAll() {
  const result = {};
  for (const name of STORES) {
    result[name] = await getAll(name);
  }
  return result;
}