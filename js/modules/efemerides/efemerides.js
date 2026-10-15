// efemerides.js
// Módulo Efemérides. Estado actual: en construcción.
// Cuando se implemente:
//   - Calendario con fechas importantes (Argentina, Latam, Mundo).
//   - Vinculación con categorías de Random.
//   - Envío de efemérides al Galpón o directamente a Fábrica.

export async function initEfemerides() {
  console.log('[efemerides] Iniciando módulo (en construcción)');
  injectEfemeridesUI();
}

function injectEfemeridesUI() {
  const view = document.querySelector('.module-view[data-module-view="efemerides"]');
  if (!view || view.dataset.ready === '1') return;
  view.dataset.ready = '1';

  view.innerHTML = `
    <div class="module-header">
      <div>
        <h2>Efemérides</h2>
        <p class="module-subtitle">Calendario de fechas importantes de Argentina, Latinoamérica y el mundo.</p>
      </div>
    </div>

    <div class="efemerides-construction">
      <div class="efemerides-construction-icon">📅</div>
      <span class="efemerides-construction-badge">En construcción</span>
      <h2 class="efemerides-construction-title">Muy pronto</h2>
      <p class="efemerides-construction-sub">
        Estamos armando un calendario con las fechas clave del año: días históricos,
        culturales, deportivos, tecnológicos y de todo tipo, vinculadas a las categorías
        de la Revista Random.
      </p>
      <div class="efemerides-construction-hint">
        <strong>¿Qué vas a poder hacer acá?</strong><br>
        Explorar efemérides, elegirlas y enviarlas al Galpón o directo a la Fábrica
        para transformarlas en contenido.
      </div>
    </div>
  `;
}