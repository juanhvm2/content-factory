# 📓 BITÁCORA — Content Factory

> **Última actualización:** 18/10/2026
> **Último commit relevante:** `f7fd355` — Festivos: ampliar CELEBRACIONES a 164 entradas
> **Versión de caché actual:** `?v=53`
> **DB_VERSION (IndexedDB):** 4

Este archivo es la **fuente de verdad** del proyecto. Si sos una IA o un
desarrollador nuevo, leé esto ANTES de tocar nada. Si hacés cambios,
**actualizá este archivo** (hay una sección al final "Cómo actualizar").

---

## 🎯 ¿Qué es Content Factory?

App web interna de **Revista Random** (empresa de marketing argentina) para
gestionar el ciclo completo de producción de contenidos:

1. **Recolectar** noticias de fuentes RSS (módulo Bosque).
2. **Clasificar** y aprobar noticias (módulo Galpón).
3. **Producir** piezas para Instagram con editor visual (módulo Fábrica).
4. **Aprobar** y exportar (módulo Calidad).

Además tiene dos módulos de **inspiración diaria**:
- **Efemérides** (qué pasó un día como hoy).
- **Días Festivos** (feriados + celebraciones).

### URLs y accesos
- **Repo GitHub:** https://github.com/juanhvm2/content-factory
- **Web pública:** https://juanhvm2.github.io/content-factory/
- **Usuario GitHub:** juanhvm2
- **Email GitHub:** juanvegamaza2@gmail.com
- **Ubicación local:** `C:\Proyectos\content-factory`

---

## ⚠️ REGLAS DE TRABAJO CON EL USUARIO (críticas)

El usuario **NO sabe programar**. Respetá estas reglas siempre:

1. Explicá todo como si fuera la primera vez. Sin jerga técnica.
2. **Un paso a la vez.** No des 5 pasos juntos. Esperá confirmación.
3. Mostrá siempre: (a) ubicación exacta del archivo + Ctrl+F, (b) qué
   reemplazar exactamente, (c) qué verificar después.
4. Numerá los pasos X/N.
5. Avisá de errores esperados (CORS en consola, etc.) ANTES de que aparezcan.
6. Avisá si hay código duplicado o repetido.
7. Estimados honestos. Nada de "5 minutos" si no es real.
8. **No podés ver el repo ni los archivos.** Pedí el archivo antes de guiar.
9. **Antes de modificar, avisá si el cambio puede romper algo.**
10. **La IA de VS Code integrada** es la que aplica los cambios. El usuario
    copia/pega prompts. Vos verificás los reportes.

---

## 🏗️ Stack técnico

- **HTML/CSS/JS vanilla** (sin frameworks, sin build).
- **Módulos ES6** (`import`/`export`) con caché-busting `?v=53`.
- **IndexedDB** (DB_VERSION = 4) — 13 tablas.
- **Canvas 2D** para renderizar piezas.
- **JSZip** para exportar ZIP.
- **Live Server** (VS Code) para servir local.
- **GitHub Pages** para la versión online.
- **GitHub Action** cada 30 min: baja RSS y actualiza `js/data/news.json`.

### APIs externas (todas sin key, excepto Unsplash)
- `api.wikimedia.org` — Efemérides (español).
- `date.nager.at` — Feriados oficiales (Nager.Date).
- `commons.wikimedia.org` — Imágenes.
- `api.openverse.org` — Imágenes.
- `images.unsplash.com` — CDN de imágenes (Unsplash).
- **Unsplash Access Key** hardcodeada en `js/config.js`:
  `[CLAVE OMITIDA POR SEGURIDAD]` (modo demo, 50 req/h).

---

## 📁 Estructura del proyecto

content-factory/
├── .github/
│   ├── scripts/fetch-news.mjs        # Script RSS del bot
│   └── workflows/fetch-news.yml      # Workflow GitHub Action
├── assets/logos/
│   ├── random.png
│   └── express.png
├── docs/
│   └── BITACORA.md                   # ESTE ARCHIVO
├── js/
│   ├── core/store.js                 # IndexedDB wrapper (DB_VERSION = 4)
│   ├── config.js                     # Unsplash Access Key
│   ├── data/
│   │   ├── brands.js
│   │   ├── categories.js             # 25 categorías
│   │   ├── news.json                 # Generado por GitHub Action
│   │   └── sources.js                # 242 fuentes RSS
│   ├── modules/
│   │   ├── forest/forest_v2.js       # Bosque
│   │   ├── forest/source-editor.js
│   │   ├── warehouse/warehouse.js    # Galpón
│   │   ├── factory/                  # Fábrica (~2500 líneas)
│   │   │   ├── factory.js
│   │   │   ├── factory-persistence.js
│   │   │   ├── factory-logos.js
│   │   │   ├── factory-exporter.js
│   │   │   └── factory-quality-bridge.js
│   │   ├── quality/quality.js        # Calidad (kanban)
│   │   ├── efemerides/efemerides.js  # Efemérides
│   │   └── festivos/festivos.js      # Días Festivos
│   ├── services/
│   │   ├── classifier.js
│   │   ├── cleanup-service.js
│   │   ├── deduplicator.js
│   │   ├── link-extractor.js
│   │   ├── rss-service.js            # Híbrido: directo → news.json → allorigins
│   │   ├── rules-engine.js
│   │   ├── wp-service.js
│   │   ├── efemerides-service.js
│   │   ├── efemerides-images.js
│   │   ├── festivos-service.js       # Incluye CELEBRACIONES (164 entradas)
│   │   └── festivos-images.js
│   └── app.js
├── styles/
│   ├── tokens.css
│   ├── main.css
│   └── modules/
│       ├── forest.css
│       ├── warehouse.css
│       ├── factory.css
│       ├── quality.css
│       ├── efemerides.css
│       └── festivos.css
├── index.html
└── README.md

---

## 🎯 Módulos de la navegación (orden actual)

1. 🎉 **Días Festivos** — Feriados + celebraciones.
2. 📅 **Efemérides** — Qué pasó un día como hoy.
3. 🌲 **Bosque** — Fuentes RSS + noticias.
4. 📦 **Galpón** — Clasificación + triage.
5. 🏭 **Fábrica** — Editor visual de piezas.
6. ✅ **Calidad** — Kanban + export.

---

## ✅ Estado de cada módulo (al 17/10/2026)

### 1. 🎉 Días Festivos — 🟢 100% (verificado en producción)
- Se verificó en GitHub Pages que las 164 celebraciones cargan bien, Día de la Madre en octubre y filtro por día funcionan.
- **Fuentes:** Nager.Date (feriados oficiales) + lista interna
  `CELEBRACIONES` en `js/services/festivos-service.js` (**164 entradas**).
- **Países:** AR + Latam (MX, BR, CL, CO, PE, UY, PY, BO, EC, VE) +
  Mundo (US, ES, FR, GB, IT, DE, CA, JP).
- **Categorías cubiertas en celebraciones:** Tradicionales/patrios (29) +
  Cultura y arte (15) + Ciencia (15) + Tecnología e IA (15) + Deportes (15) +
  Gastronomía y vinos (15) + Salud (15) + Economía y negocios (15) +
  Marketing (15) + Política internacional (15). Total: **164**.
- **UI:** selector de mes, filtros región + tipo, buscador, botón "📅 Hoy",
  input "Día: [__]", checkbox "Prefijar con 'Día festivo'".
- **Modal:** descripción + 5 imágenes (Unsplash prioridad + Wikimedia fallback).
- **Al Galpón:** brand `'express'`.
- **Caché IndexedDB:** 30 días. **Al cambiar la lista de celebraciones,
  usar el botón 🔄 de refrescar para invalidar caché.**
- **Formato de entrada:**
  { month, day, title, description, region, type }
  Fechas variables: { month, weekday: 0, nth: 3, ... } (0=domingo, nth=3er).

### 2. 📅 Efemérides — 🟢 100%
- **Fuente:** API oficial Wikimedia ES (`api.wikimedia.org/feed/v1/.../onthisday/events`).
- **2096 efemérides** por mes.
- Selector de mes, filtros región + categoría (25), botón "📅 Hoy",
  input "Día: [__]", buscador, checkbox "Un día como hoy en {año}".
- Modal con 5 imágenes (Wikimedia + Openverse) + autor + descripción.
- Al Galpón → brand `'express'`.
- Caché IndexedDB 30 días.

### 3. 🌲 Bosque — 🟢 100%
- **242 fuentes RSS** (216 OK = 89%).
- Botón "Actualizar todo" en paralelo (~8 s).
- Filtros: región + categoría + búsqueda + 24hs.
- Imágenes HD auto-descargadas (og:image, 88%).
- Ingreso manual: por link + por texto pegado.
- **GitHub Action** baja RSS cada 30 min → `js/data/news.json`.

### 4. 📦 Galpón — 🟢 100%
- Clasificación automática (categoría, keywords, entidades, urgencia,
  entrevista, citas).
- Deduplicación.
- Acciones: ⭐ destacar, 🗑️ descartar, 🏭 enviar a Fábrica.
- Limpieza automática + botón manual.
- Botón "🧪 Motor" que prueba el motor determinista.

### 5. 🏭 Fábrica — 🟡 90%
- **4 formatos funcionales:** Post (1080×1350), Historia (1080×1920),
  Historias, Carrusel.
- **1 formato con cartel "EN CONSTRUCCIÓN":** Grilla.
- **Frases:** base creada como clon de Post con comillas violetas. Falta pulir herramientas (quitar las que no van) y selector de logo Randomizate.
- **Editor visual:** drag, zoom, posición X/Y, alineación H/V, opacidad,
  B/N, reset.
- **Paneles:** Texto (Categoría/Headline/Body), Imagen (miniaturas, URL,
  archivo local), Plantilla (fuente, colores, tamaños, márgenes, presets),
  Logo (Random/Express, escala, posición, opacidad, Reset a 74/5).
- **Panel Blog:** muestra el texto completo de la noticia (auto-descargado
  del artículo original) con botonera flotante al seleccionar texto →
  Categoría / Título / Bajada.
- **Panel Capas:** hoy placeholder ("Paso 27").
- **Exportar:** JPG individual o ZIP.
- **Enviar a Calidad.**

### 6. ✅ Calidad — 🟢 100%
- **Kanban 5 columnas:** Borrador → Pendiente → Aprobado → Listo → Exportado.
- Tarjetas con miniatura, brand, título, formato, tiempo.
- Acciones: Aprobar, Devolver, Descartar, Eliminar.
- Selección múltiple + barra flotante.
- Modal de preview.
- Descarga individual JPG / masiva ZIP.

---

## 🔜 Lo que falta (roadmap completo)

### 🟡 Corto plazo
1. **Probar en prod** que Día de la Madre sale en octubre, filtro día OK,
   imágenes Unsplash OK (Festivos).
2. Terminar Formato Frases: quitar herramientas sobrantes (como Categoría/Body si no van), ajustar comillas, agregar selector de logo Randomizate y ajustar tipografía.
3. **Formato Grilla** (reemplazar "en construcción"): 5 noticias
   (1 principal + 4 secundarias) con imagen, formato Historia 1080×1920.
4. **Panel Capas funcional** (hoy placeholder).
5. **Sumar NASA + Met Museum** como fuentes de imágenes para Efemérides
   y Festivos.
6. **Favicon** (elimina el 404 cosmético).
7. **Recuperar ~15 fuentes RSS rotas** del Bosque.
8. **skipLive** para fuentes Google News (evita CORS en consola).

### 🟠 Mediano plazo
9. **Fase 6 — Aprendizaje supervisado.** ActionLog, patrones, hipótesis,
   reglas con condición/acción, versionado, aplicación, reversión.
   **La IA NO modifica código: todo es configuración.**
10. **Fase 7 — Automatización.** Cola background, paralelización, cuellos
    de botella, alertas.

### ⚪ Ya resuelto
- ✅ Módulo Efemérides.
- ✅ Módulo Días Festivos (base + 164 celebraciones).
- ✅ Panel Blog interactivo.
- ✅ Filtro por día en Efemérides y Festivos.

---

## 🚨 Bugs conocidos / limitaciones (esperadas)

1. **CORS en consola** al cargar RSS — normal, hay fallback a news.json.
2. **Wikipedia bloquea CORS** al bajar artículos — cae al excerpt. No rompe.
3. **Imágenes pixeladas** — algunas fuentes solo dan 300×200.
4. **Favicon 404** — cosmético, pendiente.
5. **~15 fuentes RSS rotas** — pendiente recuperar.
6. **Unsplash en GitHub Pages** — funciona porque la key está hardcodeada
   en `js/config.js`. Si se revoca, se genera otra.
7. **Caché de 30 días** en Efemérides/Festivos — al cambiar la lista hay
   que forzar refresco (botón 🔄).

---

## 🔢 Versionado de caché

Todos los `import` llevan `?v=NN` al final. **Actual: `?v=53`.**

Cuando se hacen cambios grandes:
1. `Ctrl + Shift + H` en VS Code.
2. Buscar `v=53` → reemplazar por `v=53`.
3. Guardar todos los archivos.

Esto rompe el caché del navegador y fuerza recarga.

---

## 🗄️ Modelo de datos (IndexedDB, DB_VERSION = 4)

**Tablas:** `system`, `settings`, `sources`, `news`, `workItems`, `pieces`,
`templates`, `logos`, `rules`, `actionLog`, `presets`, `efemerides`, `festivos`.

**Estados de pieza (`pieces.state`):**
`draft`, `pending_review`, `approved`, `ready`, `exported`, `discarded`.

**WorkItem:**
{ id, newsId, title, excerpt, link, imageUrl, images, content,
  wpCategories, sourceId, sourceName, region, categories,
  brand: 'random'|'express', status, createdAt, proposals, analysis,
  additionalSources, duplicatesCount }

**Efeméride:**
{ id, month, day, year, title, description, category, region, keywords,
  link, wikipediaTitle, imageUrl, images, fetchedAt }

**Festivo:**
{ id, date, day, month, year, title, description, region, countryCode,
  type: 'feriado'|'celebración', isOfficial, keywords }

---

## 🎨 Estética

Debe sentirse como **juego de gestión empresarial + software profesional**
(tipo Photoshop/Figma). Paneles oscuros, colores por módulo:

- Bosque: verde `--forest: #3fb950`
- Galpón: amarillo `--warehouse: #d29922`
- Fábrica: violeta `--factory: #a371f7`
- Calidad: azul `--quality: #58a6ff`
- Efemérides: rosa `--efemerides: #f472b6`
- Festivos: naranja `--festivos: #fb923c`

---

## 🚀 Flujo de actualización a GitHub

Después de cada fase aprobada:

git add .
git commit -m "Descripción corta"
git pull --rebase     # Trae los commits del bot (news.json cada 30 min)
git push

**⚠️ Aviso:** el bot de GitHub Action commitea `news.json` cada 30 min →
suele haber conflictos. El `git pull --rebase` antes del `push` lo resuelve.

**Si en algún momento falla `git push` con `! [rejected]`:**
1. `git pull --rebase`
2. `git push` de nuevo.

### Método selectivo (recomendado cuando se toca 1 solo archivo)
git add ruta/al/archivo.js
git commit -m "mensaje"
git pull --rebase
git push

---

## 🤖 Cómo trabajar con la IA de VS Code

El usuario trabaja con la IA integrada de VS Code. El flujo es:

1. El asistente (chat principal) le da al usuario un **prompt largo**.
2. El usuario lo pega en la IA de VS Code.
3. La IA hace los cambios y devuelve un reporte + diff.
4. El usuario pega el reporte acá.
5. El asistente verifica y da el próximo prompt.

**Formato estándar de los prompts para la IA de VS Code:**

Sos un asistente trabajando en "Content Factory", app web vanilla
(HTML/CSS/JS, módulos ES6, sin build).

TAREA: ...

ARCHIVO A MODIFICAR: ...

REGLA CRÍTICA: NO modifiques ningún otro archivo.

CAMBIOS EXACTOS:
1) Buscar: ...
   Reemplazar por: ...

VERIFICACIÓN:
1) Confirmar que...

REPORTE:
✅ Cambio 1: ...
📄 Diff: (pegar fragmento cambiado)

**Nota:** la IA de VS Code a veces se resiste a hardcodear API keys
(le parece mala práctica). Cuando eso pase, el usuario puede hacer el
cambio a mano en VS Code.

---

## 📋 Historial de hitos importantes

- **2026-09:** Arranca el proyecto. Base de navegación + IndexedDB + 4 módulos.
- **2026-09/10:** Bosque + Galpón + Fábrica + Calidad completos.
- **2026-10 (mediados):** Módulo Efemérides (API Wikimedia, 2096 items/mes,
  5 imágenes por modal, filtro día).
- **2026-10 (mediados):** Módulo Días Festivos (Nager.Date + celebraciones
  internas, Unsplash + Wikimedia, filtro día).
- **2026-10-17:** Ampliación de `CELEBRACIONES` de 91 a **164 entradas**
  (limpieza de 5 duplicados). Commit `f7fd355`.
- **2026-10-17:** Se crea este archivo (`docs/BITACORA.md`).
- **2026-10-18:** Base del formato Frases en Fábrica (clon de Post con comillas violetas + logo Randomizate). Se aisló el código para no romper Post/Historia/Carrusel.

---

## 🔄 Cómo actualizar este archivo

**Cada vez que se complete una tarea significativa:**

1. Actualizá el encabezado: fecha + último commit + versión de caché.
2. En la sección del módulo correspondiente, cambiá el estado (🟢/🟡/🔴)
   y la descripción.
3. Si se agregó un módulo nuevo, agregalo a "Módulos de la navegación"
   y a la "Estructura del proyecto".
4. Si se resolvió un bug conocido, borralo de esa sección.
5. Si aparece un bug nuevo, agregalo.
6. Agregá una línea al final del "Historial de hitos importantes".
7. Si cambia `DB_VERSION` o `?v=NN`, actualizalo en el encabezado.

**Regla de oro:** si tocaste código, actualizá este archivo en el mismo
commit. Si no, la próxima IA va a trabajar con información vieja.

---

## 📌 Inconsistencias entre handoffs viejos y este archivo

Existían dos handoffs previos:
- `HANDOFF-content-factory-16-10-2026.txt` (detallado, muy actualizado).
- Un handoff viejo (el que tenía "Fase 6" como próximo paso).

**Este archivo (`BITACORA.md`) prevalece sobre ambos.** Si encontrás
discrepancias (cantidad de fuentes, versión de caché, tablas, estados de
fases), **este archivo manda**.

Ejemplos de inconsistencias resueltas:
- Handoff viejo decía "243 fuentes RSS", real son **242**.
- Handoff viejo decía "?v=46", real es **?v=53**.
- Handoff viejo decía "11 tablas IndexedDB", real son **13**.
- Handoff viejo decía "Próximo paso = Fase 6", real el próximo paso era
  completar la lista de Festivos (ya hecho) y luego Frases/Grilla/Capas.

---

## 🔄 Protocolo de handoff a chat nuevo

**Cuándo aplica:** cuando el usuario diga "me paso a otro chat", "cierro y arranco en uno nuevo" o similar.

**Qué debe hacer el asistente actual:**

1. **Generar un mensaje de handoff completo** que incluya:
   - Referencia a `docs/BITACORA.md` (el archivo manda).
   - Último commit relevante (hash + mensaje).
   - Qué se acaba de hacer en esta sesión (2-5 líneas).
   - Tareas pendientes inmediatas (próximos 2-3 pasos concretos, con orden).
   - Cambios recientes que NO estén en la bitácora (si los hay, avisarlo).
   - Bugs conocidos nuevos (si surgieron).
   - Instrucciones para el próximo asistente (cómo arrancar).

2. **Estructura exacta del mensaje de handoff:**

# HANDOFF — Content Factory

Leé `docs/BITACORA.md` COMPLETO antes de hacer nada. Ahí está todo el contexto.

## Último commit
- Hash: ...
- Mensaje: ...

## Qué se acaba de hacer (sesión del YYYY-MM-DD)
- ...

## Tareas pendientes inmediatas (en orden)
1. ...
2. ...
3. ...

## Cambios recientes NO documentados en bitácora
- (Si no hay, decir "ninguno")

## Bugs conocidos nuevos
- (Si no hay, decir "ninguno")

## Instrucciones para el próximo asistente
1. Leer `docs/BITACORA.md` completo.
2. Confirmar que entendió el contexto.
3. Arrancar por la tarea pendiente #1.
4. Respetar las REGLAS DE TRABAJO (sección al inicio de la bitácora).

## Reglas de trabajo (recordatorio rápido)
- El usuario NO sabe programar. Explicar todo paso a paso.
- Un paso a la vez. Numerar X/N. Esperar confirmación.
- Mostrar ubicación exacta + Ctrl+F + qué reemplazar + qué verificar.
- Avisar de errores esperados ANTES de que aparezcan.
- No tocar archivos sin pedirlos primero.
- La IA de VS Code integrada aplica los cambios vía prompts largos.

3. **Checklist antes de cerrar el chat:**
   - [ ] El handoff referencia a la bitácora.
   - [ ] Incluye el último commit.
   - [ ] Incluye qué se hizo hoy.
   - [ ] Incluye próximos pasos concretos.
   - [ ] Incluye recordatorio de reglas.

**Qué debe hacer el usuario:**

1. Copia el mensaje de handoff que le dio el asistente.
2. Abre un chat nuevo.
3. Pega el mensaje como primer mensaje.
4. El próximo asistente lee la bitácora, confirma, y arranca.

**Regla de oro:** este protocolo NO es opcional. Siempre que cambie el chat, se aplica.

--- FIN DEL BLOQUE ---
