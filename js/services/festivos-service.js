// festivos-service.js
// Servicio de días festivos y celebraciones.
// Combina: (1) feriados oficiales de Nager.Date (sin key) y
//          (2) celebraciones comunes (lista interna).

import * as store from '../core/store.js?v=50';

const NAGER_API = 'https://date.nager.at/api/v3/PublicHolidays';
const CACHE_MAX_AGE_DAYS = 30;

// Países por región (Nager.Date usa ISO 3166-1 alpha-2)
const REGION_COUNTRIES = {
  argentina: ['AR'],
  latam: ['MX', 'BR', 'CL', 'CO', 'PE', 'UY', 'PY', 'BO', 'EC', 'VE'],
  mundo: ['US', 'ES', 'FR', 'GB', 'IT', 'DE', 'CA', 'JP'],
};

const COUNTRY_TO_REGION = {};
for (const [region, codes] of Object.entries(REGION_COUNTRIES)) {
  for (const c of codes) COUNTRY_TO_REGION[c] = region;
}

// Celebraciones NO oficiales (formato: día exacto, mes, título, región)
// 'weekdayRule' permite calcular el día (ej: tercer domingo de octubre).
const CELEBRACIONES = [
  // ===================================================================
  // BLOQUE 1: TRADICIONALES Y PATRIOS (29 entradas, sin duplicados)
  // ===================================================================
  { month: 1, day: 1, title: 'Año Nuevo', description: 'Primer día del año calendario gregoriano.', region: 'mundo', type: 'celebración' },
  { month: 1, day: 6, title: 'Día de Reyes', description: 'Día de los Reyes Magos.', region: 'mundo', type: 'celebración' },
  { month: 2, weekday: 0, nth: 2, title: 'Día del Amor y la Amistad', description: 'Celebración internacional del amor y la amistad.', region: 'argentina', type: 'celebración' },
  { month: 2, day: 14, title: 'San Valentín', description: 'Día de los enamorados, tradición de origen anglosajón.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 8, title: 'Día Internacional de la Mujer', description: 'Reconocimiento a la lucha por la igualdad de género.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 24, title: 'Día de la Memoria por la Verdad y la Justicia', description: 'Conmemoración de las víctimas de la última dictadura militar argentina.', region: 'argentina', type: 'feriado' },
  { month: 4, day: 2, title: 'Día del Veterano y los Caídos en Malvinas', description: 'Homenaje a los veteranos de la Guerra de Malvinas.', region: 'argentina', type: 'feriado' },
  { month: 5, day: 1, title: 'Día del Trabajador', description: 'Reivindicación de los derechos laborales a nivel mundial.', region: 'mundo', type: 'feriado' },
  { month: 5, day: 25, title: 'Día de la Revolución de Mayo', description: 'Conmemoración de la Revolución de Mayo de 1810 en Argentina.', region: 'argentina', type: 'feriado' },
  { month: 6, day: 2, title: 'Día Nacional del Bombero Voluntario', description: 'Homenaje a los bomberos voluntarios de Argentina.', region: 'argentina', type: 'celebración' },
  { month: 6, weekday: 0, nth: 3, title: 'Día del Padre', description: 'Celebración del Día del Padre en Argentina (tercer domingo de junio).', region: 'argentina', type: 'celebración' },
  { month: 6, weekday: 0, nth: 3, title: 'Día del Padre en Latinoamérica', description: 'Celebración del Día del Padre en varios países latinoamericanos.', region: 'latam', type: 'celebración' },
  { month: 6, day: 20, title: 'Día de la Bandera', description: 'Homenaje al general Manuel Belgrano y a la bandera argentina.', region: 'argentina', type: 'feriado' },
  { month: 7, day: 9, title: 'Día de la Independencia', description: 'Declaración de la Independencia argentina en 1816.', region: 'argentina', type: 'feriado' },
  { month: 7, day: 20, title: 'Día del Amigo', description: 'Celebración de la amistad, popular en Argentina y Latinoamérica.', region: 'argentina', type: 'celebración' },
  { month: 8, weekday: 0, nth: 3, title: 'Día del Niño', description: 'Celebración dedicada a la infancia.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 11, title: 'Día del Maestro', description: 'Homenaje a Domingo Faustino Sarmiento y a los docentes.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 13, title: 'Día del Bibliotecario', description: 'Homenaje a los bibliotecarios argentinos.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 21, title: 'Día de la Primavera y la Juventud', description: 'Celebración de la primavera y de los jóvenes.', region: 'argentina', type: 'celebración' },
  { month: 10, weekday: 0, nth: 3, title: 'Día de la Madre', description: 'Celebración del Día de la Madre en Argentina (tercer domingo de octubre).', region: 'argentina', type: 'celebración' },
  { month: 10, day: 12, title: 'Día del Respeto a la Diversidad Cultural', description: 'Reconocimiento de la diversidad cultural de los pueblos.', region: 'argentina', type: 'feriado' },
  { month: 10, day: 31, title: 'Halloween', description: 'Noche de disfraces y tradición anglosajona.', region: 'mundo', type: 'celebración' },
  { month: 11, day: 10, title: 'Día de la Tradición', description: 'Homenaje a José Hernández y las tradiciones argentinas.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 20, title: 'Día de la Soberanía Nacional', description: 'Conmemoración de la Batalla de la Vuelta de Obligado.', region: 'argentina', type: 'feriado' },
  { month: 12, day: 8, title: 'Inmaculada Concepción de María', description: 'Feriado religioso católico.', region: 'argentina', type: 'feriado' },
  { month: 12, day: 24, title: 'Nochebuena', description: 'Víspera de Navidad.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 25, title: 'Navidad', description: 'Celebración del nacimiento de Jesús.', region: 'mundo', type: 'feriado' },
  { month: 12, day: 28, title: 'Día de los Santos Inocentes', description: 'Jornada de bromas y tradiciones populares.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 31, title: 'Fin de Año', description: 'Último día del año calendario.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 2: CULTURA Y ARTE (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 5, day: 23, title: 'Día del Cine Nacional', description: 'Homenaje al cine argentino.', region: 'argentina', type: 'celebración' },
  { month: 6, day: 13, title: 'Día del Escritor', description: 'Homenaje a Leopoldo Lugones y a los escritores argentinos.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 24, title: 'Día del Artista Plástico', description: 'Reconocimiento a los artistas visuales argentinos.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 30, title: 'Día del Teatro Nacional', description: 'Homenaje al teatro argentino.', region: 'argentina', type: 'celebración' },
  { month: 12, day: 11, title: 'Día Nacional del Tango', description: 'Homenaje a Carlos Gardel y Julio de Caro, íconos del tango.', region: 'argentina', type: 'celebración' },
  { month: 1, day: 21, title: 'Día del Mariachi', description: 'Celebración del mariachi, género tradicional mexicano.', region: 'latam', type: 'celebración' },
  { month: 8, day: 22, title: 'Día del Folclore', description: 'Celebración de las tradiciones folclóricas latinoamericanas.', region: 'latam', type: 'celebración' },
  { month: 9, day: 17, title: 'Día de la Cueca', description: 'Celebración de la cueca, danza nacional de Chile.', region: 'latam', type: 'celebración' },
  { month: 10, day: 20, title: 'Día de la Cultura Cubana', description: 'Conmemoración del himno nacional cubano.', region: 'latam', type: 'celebración' },
  { month: 11, day: 1, title: 'Día del Artesano Latinoamericano', description: 'Reconocimiento al trabajo artesanal de la región.', region: 'latam', type: 'celebración' },
  { month: 4, day: 15, title: 'Día Mundial del Arte', description: 'Celebración internacional del arte y la creatividad.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 29, title: 'Día Internacional de la Danza', description: 'Celebración de la danza como lenguaje universal.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 30, title: 'Día Internacional del Jazz', description: 'Reconocimiento a este género musical y su aporte cultural.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 18, title: 'Día Internacional de los Museos', description: 'Promoción del rol de los museos en la sociedad.', region: 'mundo', type: 'celebración' },
  { month: 7, day: 13, title: 'Día Mundial del Rock', description: 'Celebración del género musical.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 3: CIENCIA (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 4, day: 10, title: 'Día del Investigador Científico', description: 'Homenaje a Bernardo Houssay y a los investigadores argentinos.', region: 'argentina', type: 'celebración' },
  { month: 8, day: 30, title: 'Día del Físico', description: 'Reconocimiento a los físicos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 12, title: 'Día del Geólogo', description: 'Reconocimiento a los geólogos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 25, title: 'Día del Biólogo', description: 'Reconocimiento a los biólogos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 6, title: 'Día del Químico', description: 'Reconocimiento a los químicos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 1, day: 25, title: 'Día del Biólogo en México', description: 'Reconocimiento a los biólogos mexicanos.', region: 'latam', type: 'celebración' },
  { month: 12, day: 1, title: 'Día del Químico en México', description: 'Reconocimiento a los químicos mexicanos.', region: 'latam', type: 'celebración' },
  { month: 7, day: 1, title: 'Día del Ingeniero', description: 'Celebración de los ingenieros en varios países latinoamericanos.', region: 'latam', type: 'celebración' },
  { month: 1, day: 15, title: 'Día de la Ciencia Cubana', description: 'Celebración de la ciencia en Cuba.', region: 'latam', type: 'celebración' },
  { month: 12, day: 14, title: 'Día del Geógrafo', description: 'Reconocimiento a los geógrafos latinoamericanos.', region: 'latam', type: 'celebración' },
  { month: 2, day: 11, title: 'Día Internacional de la Mujer y la Niña en la Ciencia', description: 'Promoción del acceso de las mujeres a la ciencia.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 14, title: 'Día Internacional de las Matemáticas', description: 'Celebración de las matemáticas y su rol en la ciencia.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 23, title: 'Día Meteorológico Mundial', description: 'Reconocimiento a la meteorología y sus aportes.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 12, title: 'Día Internacional de los Vuelos Espaciales Tripulados', description: 'Homenaje al primer vuelo espacial tripulado (Yuri Gagarin, 1961).', region: 'mundo', type: 'celebración' },
  { month: 11, day: 10, title: 'Día Mundial de la Ciencia para la Paz y el Desarrollo', description: 'Reconocimiento al rol de la ciencia en la sociedad.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 4: TECNOLOGÍA E IA (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 9, day: 13, title: 'Día del Programador', description: 'Celebración del día 256 del año, dedicado a los programadores.', region: 'argentina', type: 'celebración' },
  { month: 12, day: 4, title: 'Día de la Informática', description: 'Reconocimiento a la informática en Argentina.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 30, title: 'Día de la Ciberseguridad', description: 'Concientización sobre seguridad informática.', region: 'argentina', type: 'celebración' },
  { month: 12, day: 3, title: 'Día del Técnico en Sistemas', description: 'Reconocimiento a los técnicos en sistemas argentinos.', region: 'argentina', type: 'celebración' },
  { month: 8, day: 29, title: 'Día del Gamer', description: 'Celebración de la comunidad gamer.', region: 'argentina', type: 'celebración' },
  { month: 12, day: 3, title: 'Día del Informático en Chile', description: 'Reconocimiento a los informáticos chilenos.', region: 'latam', type: 'celebración' },
  { month: 12, day: 4, title: 'Día del Ingeniero de Sistemas en Perú', description: 'Reconocimiento a los ingenieros de sistemas peruanos.', region: 'latam', type: 'celebración' },
  { month: 11, day: 20, title: 'Día de la Ciencia de Datos', description: 'Celebración de la ciencia de datos en Latinoamérica.', region: 'latam', type: 'celebración' },
  { month: 8, day: 29, title: 'Día del Gamer Latinoamericano', description: 'Celebración de la comunidad gamer de la región.', region: 'latam', type: 'celebración' },
  { month: 5, day: 17, title: 'Día de Internet en Latinoamérica', description: 'Celebración de Internet en la región.', region: 'latam', type: 'celebración' },
  { month: 5, day: 17, title: 'Día Internacional de Internet', description: 'Celebración de las telecomunicaciones y la sociedad digital.', region: 'mundo', type: 'celebración' },
  { month: 11, day: 30, title: 'Día Internacional de la Seguridad Informática', description: 'Concientización global sobre ciberseguridad.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 26, title: 'Día Mundial de la Propiedad Intelectual', description: 'Reconocimiento a la innovación y la creatividad.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 31, title: 'Día Mundial del Backup', description: 'Concientización sobre la importancia de los respaldos.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 20, title: 'Día Internacional del Software Libre', description: 'Celebración del software libre y de código abierto.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 5: DEPORTES (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 5, day: 14, title: 'Día del Futbolista Argentino', description: 'Homenaje a los futbolistas argentinos.', region: 'argentina', type: 'celebración' },
  { month: 12, day: 12, title: 'Día del Hincha de Boca', description: 'Celebración de la hinchada de Boca Juniors.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 28, title: 'Día del Hincha de River', description: 'Celebración de la hinchada de River Plate.', region: 'argentina', type: 'celebración' },
  { month: 6, day: 5, title: 'Día del Deportista', description: 'Reconocimiento a los deportistas argentinos.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 7, title: 'Día del Periodista Deportivo', description: 'Homenaje a los periodistas deportivos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 7, day: 19, title: 'Día del Fútbol Brasileño', description: 'Celebración del fútbol en Brasil.', region: 'latam', type: 'celebración' },
  { month: 12, day: 4, title: 'Día del Futbolista Chileno', description: 'Reconocimiento a los futbolistas chilenos.', region: 'latam', type: 'celebración' },
  { month: 8, day: 30, title: 'Día del Fútbol Peruano', description: 'Celebración del fútbol en Perú.', region: 'latam', type: 'celebración' },
  { month: 9, day: 19, title: 'Día del Fútbol Mexicano', description: 'Celebración del fútbol en México.', region: 'latam', type: 'celebración' },
  { month: 7, day: 20, title: 'Día del Fútbol Colombiano', description: 'Celebración del fútbol en Colombia.', region: 'latam', type: 'celebración' },
  { month: 4, day: 6, title: 'Día Internacional del Deporte para el Desarrollo y la Paz', description: 'Reconocimiento al deporte como herramienta de paz.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 3, title: 'Día Mundial de la Bicicleta', description: 'Promoción del uso de la bicicleta.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 21, title: 'Día Internacional del Yoga', description: 'Promoción del yoga y el bienestar.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 20, title: 'Día Internacional del Deporte Universitario', description: 'Celebración del deporte en el ámbito universitario.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 21, title: 'Día Mundial del Baloncesto', description: 'Celebración del básquetbol a nivel global.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 6: GASTRONOMÍA Y VINOS (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 11, day: 24, title: 'Día del Vino Argentino', description: 'Celebración del vino argentino y su industria.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 30, title: 'Día Nacional del Mate', description: 'Homenaje al mate, infusión tradicional argentina.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 11, title: 'Día del Dulce de Leche', description: 'Celebración del dulce de leche argentino.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 11, title: 'Día del Asado', description: 'Celebración del asado, plato típico argentino.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 20, title: 'Día del Chef', description: 'Reconocimiento a los chefs argentinos.', region: 'argentina', type: 'celebración' },
  { month: 3, day: 31, title: 'Día del Taco', description: 'Celebración del taco, plato tradicional mexicano.', region: 'latam', type: 'celebración' },
  { month: 6, day: 28, title: 'Día del Ceviche', description: 'Celebración del ceviche, plato tradicional peruano.', region: 'latam', type: 'celebración' },
  { month: 7, day: 24, title: 'Día del Tequila', description: 'Celebración del tequila, bebida tradicional mexicana.', region: 'latam', type: 'celebración' },
  { month: 10, day: 1, title: 'Día del Café Latinoamericano', description: 'Reconocimiento al café de la región.', region: 'latam', type: 'celebración' },
  { month: 11, day: 2, title: 'Día del Pan de Muerto', description: 'Celebración del pan tradicional del Día de Muertos.', region: 'latam', type: 'celebración' },
  { month: 2, day: 9, title: 'Día Mundial de la Pizza', description: 'Celebración mundial de la pizza.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 16, title: 'Día Mundial del Pan', description: 'Celebración del pan a nivel global.', region: 'mundo', type: 'celebración' },
  { month: 7, day: 7, title: 'Día Mundial del Chocolate', description: 'Celebración del chocolate en todo el mundo.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 20, title: 'Día Internacional del Chef', description: 'Reconocimiento global a los chefs.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 12, title: 'Día Mundial del Helado', description: 'Celebración del helado a nivel global.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 7: SALUD (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 12, day: 3, title: 'Día del Médico', description: 'Reconocimiento a los médicos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 5, day: 12, title: 'Día del Enfermero', description: 'Reconocimiento a los enfermeros argentinos.', region: 'argentina', type: 'celebración' },
  { month: 8, day: 11, title: 'Día del Nutricionista', description: 'Reconocimiento a los nutricionistas argentinos.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 3, title: 'Día del Odontólogo', description: 'Reconocimiento a los odontólogos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 17, title: 'Día del Farmacéutico', description: 'Reconocimiento a los farmacéuticos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 23, title: 'Día del Médico en México', description: 'Reconocimiento a los médicos mexicanos.', region: 'latam', type: 'celebración' },
  { month: 1, day: 6, title: 'Día del Enfermero en México', description: 'Reconocimiento a los enfermeros mexicanos.', region: 'latam', type: 'celebración' },
  { month: 1, day: 27, title: 'Día del Nutriólogo en México', description: 'Reconocimiento a los nutriólogos mexicanos.', region: 'latam', type: 'celebración' },
  { month: 2, day: 9, title: 'Día del Odontólogo en México', description: 'Reconocimiento a los odontólogos mexicanos.', region: 'latam', type: 'celebración' },
  { month: 9, day: 24, title: 'Día del Farmacéutico en México', description: 'Reconocimiento a los farmacéuticos mexicanos.', region: 'latam', type: 'celebración' },
  { month: 4, day: 7, title: 'Día Mundial de la Salud', description: 'Concientización sobre temas de salud global.', region: 'mundo', type: 'celebración' },
  { month: 2, day: 4, title: 'Día Mundial contra el Cáncer', description: 'Concientización sobre la prevención del cáncer.', region: 'mundo', type: 'celebración' },
  { month: 11, day: 14, title: 'Día Mundial de la Diabetes', description: 'Concientización sobre la diabetes.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 10, title: 'Día Mundial de la Salud Mental', description: 'Concientización sobre la salud mental.', region: 'mundo', type: 'celebración' },
  { month: 3, day: 4, title: 'Día Mundial de la Obesidad', description: 'Concientización sobre la obesidad y el sobrepeso.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 8: ECONOMÍA Y NEGOCIOS (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 12, day: 17, title: 'Día del Contador', description: 'Reconocimiento a los contadores argentinos.', region: 'argentina', type: 'celebración' },
  { month: 11, day: 23, title: 'Día del Economista', description: 'Reconocimiento a los economistas argentinos.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 5, title: 'Día del Empresario', description: 'Reconocimiento a los empresarios argentinos.', region: 'argentina', type: 'celebración' },
  { month: 12, day: 2, title: 'Día del Administrador', description: 'Reconocimiento a los administradores argentinos.', region: 'argentina', type: 'celebración' },
  { month: 6, day: 27, title: 'Día del Emprendedor Argentino', description: 'Reconocimiento a los emprendedores argentinos.', region: 'argentina', type: 'celebración' },
  { month: 5, day: 25, title: 'Día del Contador en México', description: 'Reconocimiento a los contadores mexicanos.', region: 'latam', type: 'celebración' },
  { month: 7, day: 12, title: 'Día del Economista en México', description: 'Reconocimiento a los economistas mexicanos.', region: 'latam', type: 'celebración' },
  { month: 7, day: 8, title: 'Día del Administrador en México', description: 'Reconocimiento a los administradores mexicanos.', region: 'latam', type: 'celebración' },
  { month: 4, day: 16, title: 'Día del Emprendedor en México', description: 'Reconocimiento a los emprendedores mexicanos.', region: 'latam', type: 'celebración' },
  { month: 9, day: 4, title: 'Día del Empresario en Chile', description: 'Reconocimiento a los empresarios chilenos.', region: 'latam', type: 'celebración' },
  { month: 4, day: 16, title: 'Día Mundial del Emprendimiento', description: 'Celebración global del espíritu emprendedor.', region: 'mundo', type: 'celebración' },
  { month: 5, day: 10, title: 'Día Mundial del Comercio Justo', description: 'Promoción de prácticas comerciales justas.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 27, title: 'Día Internacional de las Pymes', description: 'Reconocimiento a las pequeñas y medianas empresas.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 31, title: 'Día Mundial del Ahorro', description: 'Promoción del ahorro a nivel global.', region: 'mundo', type: 'celebración' },
  { month: 7, day: 15, title: 'Día Mundial del Dinero', description: 'Educación financiera a nivel global.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 9: MARKETING (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 12, day: 4, title: 'Día del Publicista', description: 'Reconocimiento a los publicistas argentinos.', region: 'argentina', type: 'celebración' },
  { month: 5, day: 17, title: 'Día del Community Manager', description: 'Reconocimiento a los community managers argentinos.', region: 'argentina', type: 'celebración' },
  { month: 10, day: 24, title: 'Día del Diseñador Gráfico', description: 'Reconocimiento a los diseñadores gráficos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 5, day: 27, title: 'Día del Marketing', description: 'Reconocimiento a los profesionales del marketing en Argentina.', region: 'argentina', type: 'celebración' },
  { month: 6, day: 7, title: 'Día del Periodista', description: 'Homenaje a los periodistas argentinos.', region: 'argentina', type: 'celebración' },
  { month: 12, day: 1, title: 'Día del Publicista en México', description: 'Reconocimiento a los publicistas mexicanos.', region: 'latam', type: 'celebración' },
  { month: 10, day: 13, title: 'Día del Diseñador en México', description: 'Reconocimiento a los diseñadores mexicanos.', region: 'latam', type: 'celebración' },
  { month: 9, day: 1, title: 'Día del Publicista en Colombia', description: 'Reconocimiento a los publicistas colombianos.', region: 'latam', type: 'celebración' },
  { month: 4, day: 2, title: 'Día del Mercadólogo en Colombia', description: 'Reconocimiento a los mercadólogos colombianos.', region: 'latam', type: 'celebración' },
  { month: 11, day: 15, title: 'Día del Marketing en Chile', description: 'Reconocimiento a los profesionales del marketing chilenos.', region: 'latam', type: 'celebración' },
  { month: 5, day: 27, title: 'Día Mundial del Marketing', description: 'Reconocimiento global a la disciplina del marketing.', region: 'mundo', type: 'celebración' },
  { month: 6, day: 30, title: 'Día Internacional de las Redes Sociales', description: 'Celebración del impacto de las redes sociales.', region: 'mundo', type: 'celebración' },
  { month: 4, day: 27, title: 'Día Mundial del Diseño Gráfico', description: 'Reconocimiento al diseño gráfico a nivel global.', region: 'mundo', type: 'celebración' },
  { month: 7, day: 17, title: 'Día Mundial del Emoji', description: 'Celebración de los emojis y su impacto comunicacional.', region: 'mundo', type: 'celebración' },
  { month: 1, day: 24, title: 'Día Internacional del Community Manager', description: 'Reconocimiento global a los community managers.', region: 'mundo', type: 'celebración' },

  // ===================================================================
  // BLOQUE 10: POLÍTICA INTERNACIONAL (15: 5 AR + 5 Latam + 5 Mundo)
  // ===================================================================
  { month: 10, day: 30, title: 'Día de la Democracia Argentina', description: 'Conmemoración del regreso de la democracia en 1983.', region: 'argentina', type: 'celebración' },
  { month: 8, day: 26, title: 'Día del Diplomático Argentino', description: 'Reconocimiento a los diplomáticos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 23, title: 'Día del Voto Femenino', description: 'Conmemoración del voto femenino en Argentina (1947).', region: 'argentina', type: 'celebración' },
  { month: 2, day: 14, title: 'Día del Politólogo', description: 'Reconocimiento a los politólogos argentinos.', region: 'argentina', type: 'celebración' },
  { month: 6, day: 15, title: 'Día de la Reforma Universitaria', description: 'Conmemoración de la Reforma Universitaria de 1918.', region: 'argentina', type: 'celebración' },
  { month: 9, day: 11, title: 'Día de la Democracia en Chile', description: 'Conmemoración del plebiscito de 1980 en Chile.', region: 'latam', type: 'celebración' },
  { month: 9, day: 16, title: 'Día de la Independencia de México', description: 'Conmemoración de la independencia mexicana.', region: 'latam', type: 'feriado' },
  { month: 9, day: 7, title: 'Día de la Independencia de Brasil', description: 'Conmemoración de la independencia brasileña.', region: 'latam', type: 'feriado' },
  { month: 7, day: 20, title: 'Día de la Independencia de Colombia', description: 'Conmemoración de la independencia colombiana.', region: 'latam', type: 'feriado' },
  { month: 7, day: 28, title: 'Día de la Independencia de Perú', description: 'Conmemoración de la independencia peruana.', region: 'latam', type: 'feriado' },
  { month: 9, day: 15, title: 'Día Internacional de la Democracia', description: 'Promoción de los valores democráticos a nivel global.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 10, title: 'Día de los Derechos Humanos', description: 'Conmemoración de la Declaración Universal de Derechos Humanos.', region: 'mundo', type: 'celebración' },
  { month: 9, day: 21, title: 'Día Internacional de la Paz', description: 'Jornada dedicada a la paz mundial.', region: 'mundo', type: 'celebración' },
  { month: 10, day: 24, title: 'Día de las Naciones Unidas', description: 'Conmemoración de la fundación de la ONU.', region: 'mundo', type: 'celebración' },
  { month: 12, day: 9, title: 'Día Internacional contra la Corrupción', description: 'Concientización sobre la lucha contra la corrupción.', region: 'mundo', type: 'celebración' },
];

// --- Utilidades ---
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

function extractKeywords(text, max = 8) {
  const stop = new Set(['de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una', 'del', 'que', 'por', 'con', 'para', 'es', 'al', 'se', 'su', 'como', 'the', 'of', 'and', 'in', 'to', 'día', 'dia']);
  const words = String(text || '').toLowerCase()
    .replace(/[^\wáéíóúñü\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

// --- Fetch a Nager.Date ---
async function fetchCountryHolidays(year, countryCode) {
  const url = `${NAGER_API}/${year}/${countryCode}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(t);
  }
}

function normalizeNagerHoliday(h, countryCode) {
  if (!h || !h.date) return null;
  const date = new Date(h.date);
  if (isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const region = COUNTRY_TO_REGION[countryCode] || 'mundo';
  const title = h.localName || h.name || 'Feriado';
  const description = `${h.name} (${countryCode})${h.global ? '' : ' — regional'}`;
  return {
    id: `fe_${month}-${day}_${year}_${countryCode}_${slugify(title)}`,
    date: h.date,
    day, month, year,
    title,
    description,
    region,
    countryCode,
    type: 'feriado',
    isOfficial: true,
    keywords: extractKeywords(`${title} ${description}`),
  };
}

function normalizeCelebration(c, year) {
  let day = c.day;
  if (c.weekday != null && c.nth != null) {
    day = nthWeekdayOfMonth(year, c.month, c.weekday, c.nth);
  }
  if (!day) return null;
  const dateStr = `${year}-${String(c.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    id: `ce_${c.month}-${day}_${year}_${slugify(c.title)}`,
    date: dateStr,
    day, month: c.month, year,
    title: c.title,
    description: c.description,
    region: c.region,
    countryCode: null,
    type: c.type || 'celebración',
    isOfficial: c.type === 'feriado',
    keywords: extractKeywords(`${c.title} ${c.description}`),
  };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

// --- API pública ---
export async function getFestivosForMonth(year, month, { forceRefresh = false, onProgress } = {}) {
  const cacheKey = `${year}-${String(month).padStart(2, '0')}`;

  if (!forceRefresh) {
    const cached = await store.get('festivos', cacheKey);
    if (cached && Array.isArray(cached.items)) {
      const age = (Date.now() - new Date(cached.fetchedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (age < CACHE_MAX_AGE_DAYS) {
        console.log(`[festivos] usando cache de ${cacheKey} (${cached.items.length} items)`);
        return cached.items;
      }
    }
  }

  console.log(`[festivos] consultando API ${cacheKey}...`);
  const allItems = [];
  const countries = Object.values(REGION_COUNTRIES).flat();
  let done = 0;

  for (const code of countries) {
    try {
      const holidays = await fetchCountryHolidays(year, code);
      for (const h of holidays) {
        const n = normalizeNagerHoliday(h, code);
        if (n && n.month === month) allItems.push(n);
      }
    } catch (err) {
      console.warn(`[festivos] fallo ${code}: ${err.message}`);
    }
    done++;
    if (onProgress) onProgress(done, countries.length);
  }

  // Agregar celebraciones del mes
  for (const c of CELEBRACIONES) {
    if (c.month === month) {
      const n = normalizeCelebration(c, year);
      if (n) allItems.push(n);
    }
  }

  const items = dedupe(allItems).sort((a, b) => a.day - b.day);

  await store.set('festivos', cacheKey, {
    year, month,
    fetchedAt: new Date().toISOString(),
    items,
  });

  console.log(`[festivos] ${items.length} festivos guardados (${cacheKey})`);
  return items;
}

export async function clearFestivosCache() {
  const keys = await store.keys('festivos');
  for (const k of keys) await store.remove('festivos', k);
  console.log(`[festivos] cache limpiado (${keys.length} meses)`);
}
