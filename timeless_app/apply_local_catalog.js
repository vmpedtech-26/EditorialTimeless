'use strict';

const fs = require('fs');
const path = require('path');

// ── High Literature Combinatorial Matrix ────────────────────────────────────
const GENRES = {
  ficcion: [
    { genre: "Realismo Mágico", prefix: "COLECCIÓN REALISMO MÁGICO" },
    { genre: "Ficción Literaria", prefix: "COLECCIÓN FICCIÓN LITERARIA" },
    { genre: "Suspenso Existencial", prefix: "NARRATIVA CONTEMPORÁNEA" },
    { genre: "Ficción Metafísica", prefix: "BIBLIOTECA BORGES" },
    { genre: "Fantasía Nocturna", prefix: "CRÓNICAS DEL LABERINTO" }
  ],
  ensayo: [
    { genre: "Ensayo Filosófico", prefix: "FILOSOFÍA DE LA ATENCIÓN" },
    { genre: "Crítica Cultural", prefix: "ENSAYOS DEL SIGLO XXI" },
    { genre: "Estética Literaria", prefix: "CRÍTICA Y CREACIÓN" },
    { genre: "Ensayo Poético", prefix: "MEDITACIONES INDEPENDIENTES" }
  ],
  biografia: [
    { genre: "Biografía Literaria", prefix: "VIDAS EXCEPCIONALES" },
    { genre: "Memorias", prefix: "BITÁCORAS DE AUTOR" },
    { genre: "Correspondencia", prefix: "CARTAS E HISTORIA" },
    { genre: "Diarios de Viaje", prefix: "CRÓNICAS DE Brighton" }
  ],
  tecnica: [
    { genre: "Técnica Narrativa", prefix: "ARQUITECTURA DE LA NOVELA" },
    { genre: "Gramática Poética", prefix: "EL ARTE DE LA FRASE" },
    { genre: "Manual de Estilo", prefix: "CUADERNO DE TALLER" },
    { genre: "Crítica Teórica", prefix: "MÁQUINAS DE HABITAR" }
  ],
  kids: [
    { genre: "Fantasía Infantil", prefix: "COLECCIÓN FANTASÍA" },
    { genre: "Misterio Familiar", prefix: "COLECCIÓN MISTERIO" },
    { genre: "Realismo Mágico", prefix: "REALISMO MÁGICO KIDS" },
    { genre: "Aventura Ecológica", prefix: "COLECCIÓN AVENTURA" }
  ]
};

const WRITERS = [
  "Arturo Borges", "Clara Márquez", "Julio Cortázar-Ríos", "Virginia Silva", 
  "Francisco Kafka", "José de Sousa", "Roberto Belano", "Haru Murakami", 
  "Ernesto Hemingway", "Simone de Vois", "Humberto Eco", "Alejandra Pozzo",
  "Emilio Vargas", "Claudia Iriarte", "Marcos Delgado", "Isabel Noriega",
  "Alicia M. Gómez", "Javier del Campo", "Clara Domínguez", "Hugo Silva"
];

const METADATA_POOL = {
  ficcion: {
    taglines: [
      "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
      "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
      "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
      "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
      "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río."
    ],
    quotes: [
      "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»",
      "«Hubo un día en que el mar olvidó su oleaje, y en ese instante eterno nació la arena.»",
      "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»",
      "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»",
      "«Un espejo no es más que una puerta que se cansó de reflejar la mentira del día.»"
    ],
    synopses: [
      "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
      "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
      "La historia de un coleccionista de espejos cóncavos en la Praga de entreguerras que jura haber contemplado el rostro del infinito, desatando una conspiración silenciosa de relojeros y filósofos herejes.",
      "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos."
    ],
    themes: ["Memoria", "Identidad", "Laberintos", "Olvido", "Tiempo", "Espejos"]
  },
  ensayo: {
    taglines: [
      "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
      "La palabra escrita no es un espejo de la realidad, sino un refugio contra su erosión.",
      "La contemplación no es una renuncia a la acción, sino la resistencia intelectual más profunda.",
      "La gramática de nuestra melancolía revela las grietas invisibles de la modernidad."
    ],
    quotes: [
      "«El silencio no es la ausencia de sonido, sino la presencia de una atención absoluta.»",
      "«La prisa contemporánea no acelera el movimiento, simplemente mutila la mirada.»",
      "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»",
      "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
    ],
    synopses: [
      "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
      "Una exploración filosófica de la estética del vacío y la deriva intelectual en las grandes urbes contemporáneas, cuestionando cómo consumimos ideas y cómo el ruido digital nos ha distanciado de la experiencia de pensar.",
      "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo."
    ],
    themes: ["Filosofía", "Silencio", "Resistencia", "Estética", "Atención", "Cultura"]
  },
  biografia: {
    taglines: [
      "Toda vida es una serie de cartas enviadas a destinatarios que ya han partido.",
      "El exilio no es la pérdida de una geografía, sino la dolorosa ganancia de una memoria.",
      "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz."
    ],
    quotes: [
      "«Los pasos sobre el hielo delgado son los únicos que dejan una huella imborrable.»",
      "«No escribo para ser recordada, sino para comprender por qué el agua siempre busca el mar.»",
      "«El rumor de los días idos es la única música que no cansa al alma cansada.»"
    ],
    synopses: [
      "Un recorrido biográfico y epistolar de una sensibilidad abrumadora que ilumina el exilio voluntario de una creadora solitaria en el Brighton de entreguerras, rescatando sus diarios de convalecencia y sus diálogos silenciados con el oleaje.",
      "La bitácora reconstruida de un náufrago urbano que recorrió las calles de París y Buenos Aires coleccionando crepúsculos y palabras mudas, ofreciendo un testimonio único sobre la amistad, la melancolía y el arte de persistir.",
      "Una semblanza poética sobre los años de juventud de una de las voces líricas más desgarradoras de la literatura hispana, analizando sus cuadernos íntimos y su tormentosa pero brillante relación con el lenguaje."
    ],
    themes: ["Correspondencia", "Exilio", "Diarios", "Brighton", "París", "Vidas íntimas"]
  },
  tecnica: {
    taglines: [
      "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
      "En la arquitectura de una gran novela, el silencio ocupa más espacio que la voz.",
      "La alquimia del adjetivo preciso no decora la frase, la ancla al suelo de la verdad."
    ],
    quotes: [
      "«Toda gran historia tiene una sombra invisible. Tu trabajo es hacer que el lector la siente.»",
      "«La elipsis no es una omisión perezosa, sino el motor que hace respirar a la novela.»",
      "«La frase perfecta tiene el peso exacto de una piedra húmeda bajo la lluvia nocturna.»"
    ],
    synopses: [
      "Un manual de estilo e ingeniería literaria de una lucidez excepcional, donde se desvelan los mecanismos ocultos de la tensión narrativa, el uso arquitectónico de la luz en las escenas y el diseño de diálogos implícitos donde lo no dicho es lo que verdaderamente importa.",
      "Un análisis profundo del ritmo, la carpintería del suspenso existencial y la respiración de la prosa, estructurado como una partitura teórica indispensable para escritores en formación y lectores exigentes.",
      "Un cuaderno de taller que reflexiona sobre la gramática de la atención y la alquimia verbal, enseñando a construir habitaciones literarias que el lector recordará con la nitidez de una casa de la infancia."
    ],
    themes: ["Escritura", "Arquitectura", "Elipsis", "Estilo", "Taller literario", "Suspenso"]
  },
  kids: {
    taglines: [
      "El hielo brilla con la luna, pero un amigo brilla en cualquier oscuridad.",
      "¿Y si las estrellas usaran faros de colores para no perderse en la noche?",
      "El tiempo de soñar no se mide en minutos, sino en la anchura de una sonrisa.",
      "Los animales del bosque tienen un secreto guardado, si sabes escuchar el silencio."
    ],
    quotes: [
      "«Un minuto de risa dura más que una hora de aburrimiento.»",
      "«Los faros no solo miran al mar, le sonríen a las estrellas cuando hay tormenta.»",
      "«El bosque no habla alto, pero susurra secretos a quienes saben caminar despacito.»",
      "«El viento del norte guarda los suspiros de las nubes que querían ser trenes.»"
    ],
    synopses: [
      "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
      "Una aventura mágica de misterio infantil donde los engranajes dorados de un faro abandonado responden a las constelaciones del cielo, enseñando a los niños la belleza de la astronomía y el trabajo en equipo.",
      "Un tierno relato de realismo mágico donde un entrañable relojero repara relojes de arena que guardan las horas felices de la gente, recordándonos que el tiempo de juego es el tesoro más grande de la infancia.",
      "Una maravillosa lección de ecología y respeto por la naturaleza, donde Marta y su fiel perro Duque siguen huellas brillantes en el bosque para salvar un manantial sagrado de agua cristalina."
    ],
    themes: ["Amistad", "Misterio", "Naturaleza", "Familia", "Fantasía", "Ecología"]
  }
};

const TITLES_POOL = [
  // Ficción (45 titles)
  { cat: "ficcion", title: "El mapa de los laberintos discretos" },
  { cat: "ficcion", title: "La teología de la arena" },
  { cat: "ficcion", title: "El jardín de los senderos cruzados" },
  { cat: "ficcion", title: "La sonata del agua inmóvil" },
  { cat: "ficcion", title: "El ajedrecista de Praga" },
  { cat: "ficcion", title: "Las ruinas circulares de la memoria" },
  { cat: "ficcion", title: "La biblioteca de los libros no escritos" },
  { cat: "ficcion", title: "El coleccionista de crepúsculos" },
  { cat: "ficcion", title: "El teorema de la lluvia" },
  { cat: "ficcion", title: "La levedad del viento austral" },
  { cat: "ficcion", title: "El juego de los espejos cóncavos" },
  { cat: "ficcion", title: "La sintaxis del silencio" },
  { cat: "ficcion", title: "El faro de las constelaciones perdidas" },
  { cat: "ficcion", title: "La última noche de la vigilia" },
  { cat: "ficcion", title: "El afinador de silencios" },
  { cat: "ficcion", title: "La geometría del olvido" },
  { cat: "ficcion", title: "El manuscrito de Mombasa" },
  { cat: "ficcion", title: "El invierno en los ojos de Virginia" },
  { cat: "ficcion", title: "La metamorfosis del tiempo" },
  { cat: "ficcion", title: "El sastre de las sombras" },
  { cat: "ficcion", title: "La conspiración de los relojes" },
  { cat: "ficcion", title: "El traductor de la niebla" },
  { cat: "ficcion", title: "La emperatriz de los laberintos" },
  { cat: "ficcion", title: "El puente de los suspiros sordos" },
  { cat: "ficcion", title: "El archivero del viento" },
  { cat: "ficcion", title: "La anatomía de un instante eterno" },
  { cat: "ficcion", title: "El pescador de estrellas muertas" },
  { cat: "ficcion", title: "La balada del gato de medianoche" },
  { cat: "ficcion", title: "El club de los insomnes de Tokio" },
  { cat: "ficcion", title: "Las huellas de la arena húmeda" },
  { cat: "ficcion", title: "El enigma del espejo roto" },
  { cat: "ficcion", title: "La sombra del jaguar de obsidiana" },
  { cat: "ficcion", title: "Los conspiradores del silencio" },
  { cat: "ficcion", title: "La frontera transparente" },
  { cat: "ficcion", title: "El manuscrito de Praga" },
  { cat: "ficcion", title: "El coleccionista de lluvia" },
  { cat: "ficcion", title: "Los laberintos de la noche larga" },
  { cat: "ficcion", title: "El inventor de crepúsculos" },
  { cat: "ficcion", title: "La sonata del viento inmóvil" },
  { cat: "ficcion", title: "La biblioteca de Alejandría" },
  { cat: "ficcion", title: "El espejo cóncavo del Sena" },
  { cat: "ficcion", title: "La conspiración del péndulo" },
  { cat: "ficcion", title: "El sastre de las memorias lejanas" },
  { cat: "ficcion", title: "El eco del violín apagado" },
  { cat: "ficcion", title: "Los cartógrafos del vacío" },

  // Ensayos (25 titles)
  { cat: "ensayo", title: "El elogio de la lentitud" },
  { cat: "ensayo", title: "La tiranía de la prisa" },
  { cat: "ensayo", title: "La estética del silencio contemporáneo" },
  { cat: "ensayo", title: "El peso invisible de la memoria" },
  { cat: "ensayo", title: "La ética del lector distraído" },
  { cat: "ensayo", title: "La arqueología de las palabras" },
  { cat: "ensayo", title: "El laberinto de la verdad líquida" },
  { cat: "ensayo", title: "La rebelión de la atención" },
  { cat: "ensayo", title: "La contemplación como resistencia" },
  { cat: "ensayo", title: "El murmullo de las ruinas" },
  { cat: "ensayo", title: "La condición del creador solitario" },
  { cat: "ensayo", title: "El arte de perder el tiempo" },
  { cat: "ensayo", title: "La deriva de las ideas" },
  { cat: "ensayo", title: "El espejo de la cultura" },
  { cat: "ensayo", title: "La gramática de la melancolía" },
  { cat: "ensayo", title: "El horizonte de lo indecible" },
  { cat: "ensayo", title: "La mirada suspendida" },
  { cat: "ensayo", title: "El eco de los pasos perdidos" },
  { cat: "ensayo", title: "La frontera de la vigilia" },
  { cat: "ensayo", title: "La construcción del vacío" },
  { cat: "ensayo", title: "La estética de la renuncia" },
  { cat: "ensayo", title: "El laberinto de los signos mudos" },
  { cat: "ensayo", title: "La paradoja del tiempo suspendido" },
  { cat: "ensayo", title: "La ética del fragmento poético" },
  { cat: "ensayo", title: "El murmullo de los espejos rotos" },

  // Biografía & Memorias (15 titles)
  { cat: "biografia", title: "La vida breve de las palabras" },
  { cat: "biografia", title: "Diarios de la sombra y la luz" },
  { cat: "biografia", title: "El exilio voluntario del alma" },
  { cat: "biografia", title: "La viajera solitaria del Sena" },
  { cat: "biografia", title: "Las cartas que nunca envié" },
  { cat: "biografia", title: "El rumor de los días idos" },
  { cat: "biografia", title: "Retrato de un invierno en Brighton" },
  { cat: "biografia", title: "La infancia de los espejos" },
  { cat: "biografia", title: "La memoria habitada" },
  { cat: "biografia", title: "El rastro de una voz herida" },
  { cat: "biografia", title: "La bitácora del náufrago urbano" },
  { cat: "biografia", title: "El diario de la convalecencia" },
  { cat: "biografia", title: "La sombra del cerezo en flor" },
  { cat: "biografia", title: "El viento en las páginas sueltas" },
  { cat: "biografia", title: "Los pasos sobre el hielo delgado" },

  // Técnica (15 titles)
  { cat: "tecnica", title: "El arquitecto de sombras y luces" },
  { cat: "tecnica", title: "La carpintería del suspenso" },
  { cat: "tecnica", title: "La respiración de la frase" },
  { cat: "tecnica", title: "La física del espacio ficcional" },
  { cat: "tecnica", title: "El ritmo de las palabras mudas" },
  { cat: "tecnica", title: "La ingeniería del personaje ausente" },
  { cat: "tecnica", title: "El arte de la elipsis" },
  { cat: "tecnica", title: "La partitura del diálogo implícito" },
  { cat: "tecnica", title: "La alquimia del adjetivo preciso" },
  { cat: "tecnica", title: "La estructura invisible de la novela" },
  { cat: "tecnica", title: "La carpintería del final perfecto" },
  { cat: "tecnica", title: "El arte del subtexto poético" },
  { cat: "tecnica", title: "La ingeniería del ritmo verbal" },
  { cat: "tecnica", title: "La física del diálogo implícito" },
  { cat: "tecnica", title: "La partitura de la novela moderna" }
];

const KIDS_POOL = [
  { id: "kid_s1", title: "El Dragón que perdió su Fuego", author: "Alicia M. Gómez", age: "4-8 años", col: "COLECCIÓN FANTASÍA", cover: "🐉", pri: "#fecfef", sec: "#ff9a9e" },
  { id: "kid_s2", title: "La Estación de los Trenes de Nubes", author: "Javier del Campo", age: "6-10 años", col: "COLECCIÓN AVENTURA", cover: "🚂", pri: "#a6c1ee", sec: "#fbc2eb" },
  { id: "kid_s3", title: "El Gato que sabía contar Estrellas", author: "Clara Domínguez", age: "4-8 años", col: "REALISMO MÁGICO KIDS", cover: "🐱", pri: "#d5e3f0", sec: "#a4c2db" },
  { id: "kid_s4", title: "La Llave del Viento del Norte", author: "Hugo Silva", age: "8-12 años", col: "COLECCIÓN MISTERIO", cover: "🔑", pri: "#84a98c", sec: "#a3b18a" },
  { id: "kid_s5", title: "El Oso que coleccionaba Silencios", author: "Alicia M. Gómez", age: "6-10 años", col: "REALISMO MÁGICO KIDS", cover: "🐻", pri: "#e0a96d", sec: "#c8945a" },
  { id: "kid_s6", title: "El Duende del Lápiz de Plata", author: "Javier del Campo", age: "4-8 años", col: "COLECCIÓN FANTASÍA", cover: "✏️", pri: "#fbc2eb", sec: "#a6c1ee" },
  { id: "kid_s7", title: "La Niña que pintaba la Lluvia", author: "Clara Domínguez", age: "6-10 años", col: "COLECCIÓN AVENTURA", cover: "🌧️", pri: "#d5e3f0", sec: "#a4c2db" },
  { id: "kid_s8", title: "El Viaje del Pequeño Velero Dorado", author: "Hugo Silva", age: "8-12 años", col: "COLECCIÓN AVENTURA", cover: "⛵", pri: "#f6d365", sec: "#fda085" },
  { id: "kid_s9", title: "El Misterio del Reloj de Sol", author: "Alicia M. Gómez", age: "9-12 años", col: "COLECCIÓN MISTERIO", cover: "☀️", pri: "#e0a96d", sec: "#c8945a" },
  { id: "kid_s10", title: "La Tortuga que caminaba sobre el Viento", author: "Javier del Campo", age: "6-10 años", col: "REALISMO MÁGICO KIDS", cover: "🐢", pri: "#84a98c", sec: "#a3b18a" },
  { id: "kid_s11", title: "El Bosque de los Libros Mágicos", author: "Clara Domínguez", age: "8-12 años", col: "COLECCIÓN FANTASÍA", cover: "🌳", pri: "#84a98c", sec: "#a3b18a" },
  { id: "kid_s12", title: "El Secreto de la Estrella de Mar", author: "Hugo Silva", age: "4-8 años", col: "COLECCIÓN MISTERIO", cover: "⭐", pri: "#fecfef", sec: "#ff9a9e" },
  { id: "kid_s13", title: "La Cueva de los Ecos Felices", author: "Alicia M. Gómez", age: "6-10 años", col: "REALISMO MÁGICO KIDS", cover: "🗣️", pri: "#fbc2eb", sec: "#a6c1ee" },
  { id: "kid_s14", title: "El Pingüino que quería Volar", author: "Javier del Campo", age: "4-8 años", col: "COLECCIÓN AVENTURA", cover: "🐧", pri: "#d5e3f0", sec: "#a4c2db" },
  { id: "kid_s15", title: "El Caballero de la Armadura de Madera", author: "Hugo Silva", age: "8-12 años", col: "COLECCIÓN FANTASÍA", cover: "🛡️", pri: "#e0a96d", sec: "#c8945a" }
];

const COVERS_PRESETS = [
  "assets/cover_memoria.png",
  "assets/cover_umbral.png",
  "assets/cover_arquitecto.png",
  "assets/cover_contemplacion.png"
];

const ADULT_EMOJIS = [
  "⏳", "📖", "🗝️", "♟️", "🏺", "🧭", "🕯️", "✒️", "🕸️", "🥀", "🌙", "🌊", "🔮", "🎭"
];

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

// Helper to convert number to roman numerals
function romanize(num) {
  const digits = String(+num).split(""),
    key = ["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM",
           "","X","XX","XXX","XL","L","LX","LXX","LXXX","XC",
           "","I","II","III","IV","V","VI","VII","VIII","IX"],
    roman = [];
  let i = 3;
  while (i--) roman.push(key[+digits.pop() + (i * 10)] || "");
  return roman.join("");
}

// Generate the array string
function compileFallbackCatalog() {
  const books = [];
  
  // 1. Inyectar las 4 obras destacadas fundacionales idénticas
  const featured = [
    {
      id: 'fb1', cat: 'ensayo',
      title: 'El Arte de la Contemplación',
      author: 'Emilio Vargas',
      genre: 'Ensayo', cover: 'assets/cover_contemplacion.png',
      badge: 'excl', badgeText: 'Exclusivo',
      pages: 218, readTime: '5h 40min', chapters: 12,
      tagline: 'En un mundo que corre, aprender a detenerse es el acto más radical.',
      synopsis: 'Emilio Vargas propone en este ensayo una filosofía de la atención como forma de resistencia cultural. A través de doce meditaciones independientes — sobre el silencio, la lentitud, la luz de la tarde, los museos vacíos — construye un argumento que no se enuncia sino que se acumula, como la humedad antes de la lluvia. Una voz que no urge: espera.',
      themes: ['Atención', 'Silencio', 'Cultura contemporánea'],
      openingQuote: '«No se trata de no pensar. Se trata de pensar hacia abajo, en lugar de hacia adelante.»'
    },
    {
      id: 'fb2', cat: 'ficcion',
      title: 'La Memoria del Agua',
      author: 'Claudia Iriarte',
      genre: 'Ficción', cover: 'assets/cover_memoria.png',
      badge: 'new', badgeText: 'Nuevo',
      pages: 342, readTime: '8h 20min', chapters: 18,
      tagline: 'Los muertos no se van. Se disuelven en el sistema de acueductos.',
      synopsis: 'En una ciudad que comienza a olvidarse a sí misma, una archivista descubre que los recuerdos de los muertos persisten atrapados en el agua que bebe la gente. Cada vez que alguien llora, recuerda algo que no vivió. Claudia Iriarte teje una novela sobre el peso invisible de la memoria colectiva, la violencia silenciosa del olvido institucional y el amor que se filtra entre las grietas del concreto.',
      themes: ['Memoria', 'Pérdida', 'Ciudad', 'Duelo colectivo'],
      openingQuote: '«El agua tiene memoria. Es lo único que no podemos purificar del todo.»'
    },
    {
      id: 'fb3', cat: 'tecnica',
      title: 'El Arquitecto de Sombras',
      author: 'Marcos Delgado',
      genre: 'Técnica narrativa', cover: 'assets/cover_arquitecto.png',
      pages: 280, readTime: '6h 55min', chapters: 15,
      tagline: 'Un manual para construir mundos que el lector habite sin saberlo.',
      synopsis: 'Marcos Delgado, arquitecto de profesión y escritor por necesidad, expone en este volumen singular la gramática oculta detrás de los espacios narrativos que más nos han habitado. Cómo la luz entra en una escena. Cómo el silencio ocupa espacio en una página. Cómo construir una habitación que el lector recuerde aunque jamás la haya visto. Un libro técnico que se lee como una novela.',
      themes: ['Escritura', 'Arquitectura narrativa', 'Espacio ficcional'],
      openingQuote: '«Todo gran edificio tiene una sombra. Toda gran historia también.»'
    },
    {
      id: 'fb4', cat: 'ficcion',
      title: 'En el Umbral',
      author: 'Isabel Noriega',
      genre: 'Ficción', cover: 'assets/cover_umbral.png',
      badge: 'excl', badgeText: 'Exclusivo',
      pages: 390, readTime: '9h 45min', chapters: 22,
      tagline: 'Entre los vivos y los muertos hay una habitación. Isabel Noriega vive allí.',
      synopsis: 'Cuatro personajes convergen durante una sola noche en un hotel de frontera que no aparece en ningún mapa. Ninguno sabe exactamente cómo llegó. Ninguno recuerda bien su nombre. Isabel Noriega construye una novela donde el suspenso no viene de lo que pasa sino de lo que no termina de resolverse: esa sensación de estar a punto de comprender algo que se retira justo cuando uno se acerca.',
      themes: ['Identidad', 'Límite', 'Lo no dicho', 'Suspenso existencial'],
      openingQuote: '«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares que nos esperan.»'
    }
  ];

  featured.forEach(f => books.push(f));

  // 2. Inyectar los otros 96 libros combinatorios de alta calidad literaria
  const usedTitles = new Set(featured.map(f => f.title));
  let count = 5;

  TITLES_POOL.forEach((item) => {
    if (usedTitles.has(item.title)) return;
    usedTitles.add(item.title);

    const category = item.cat;
    const title = item.title;
    
    const genreObj = shuffle([...GENRES[category]])[0];
    const writer = shuffle([...WRITERS])[0];
    const pool = METADATA_POOL[category];
    const tagline = shuffle([...pool.taglines])[0];
    const quote = shuffle([...pool.quotes])[0];
    const synopsis = shuffle([...pool.synopses])[0];
    const themes = shuffle([...pool.themes]).slice(0, 3);
    
    let badge = "";
    let badgeText = "";
    const randBadge = Math.random();
    if (randBadge < 0.15) {
      badge = "excl";
      badgeText = "Exclusivo";
    } else if (randBadge < 0.3) {
      badge = "new";
      badgeText = "Nuevo";
    }

    const pages = Math.floor(Math.random() * (380 - 160) + 160);
    const duration = `${Math.floor(pages / 42)}h ${Math.floor((pages % 42) * 1.5)}min`;
    
    // Cover image (80% preset cover image, 20% custom elegant emoji)
    let cover = "";
    if (Math.random() < 0.8) {
      cover = shuffle([...COVERS_PRESETS])[0];
    } else {
      cover = shuffle([...ADULT_EMOJIS])[0];
    }

    books.push({
      id: `seeded-${category}-${count}`,
      cat: category,
      title: title,
      author: writer,
      genre: genreObj.genre,
      cover: cover,
      badge: badge,
      badgeText: badgeText,
      pages: pages,
      readTime: duration,
      chapters: 5,
      tagline: tagline,
      synopsis: synopsis,
      themes: themes,
      openingQuote: quote
    });

    count++;
  });

  return books;
}

// Compile the Kids Fallback catalog
function compileKidsCatalog() {
  const kidsList = [
    {
      id: 'kid1', cat: 'kids',
      title: 'El Unicornio de Hielo',
      author: 'Alicia M. Gómez',
      genre: 'Infantil', cover: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa52?auto=format&fit=crop&q=80&w=400',
      badge: 'kids', badgeText: 'Kids',
      pages: 48, readTime: '15min', chapters: 3,
      tagline: 'Una mágica aventura en las montañas celestes para derretir la soledad.',
      synopsis: 'En la cima de la Montaña Azul vive un unicornio hecho enteramente de escarcha brillante. Aunque tiene el poder de congelar los riachuelos para jugar, se siente muy solo. Un día, una valiente niña llamada Sofía sube la montaña buscando una flor que nunca se marchita y le enseña que el calor más valioso es el del corazón y la amistad verdadera.',
      themes: ['Amistad', 'Naturaleza', 'Sentimientos'],
      openingQuote: '«El hielo brilla con la luna, pero un amigo brilla en cualquier oscuridad.»',
      ageBadge: '4-8 años',
      collectionTitle: 'COLECCIÓN FANTASÍA',
      coverAccent: '#d5e3f0',
      coverAccentMuted: '#a4c2db'
    },
    {
      id: 'kid2', cat: 'kids',
      title: 'El Secreto del Faro Austral',
      author: 'Javier del Campo',
      genre: 'Aventura', cover: 'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?auto=format&fit=crop&q=80&w=400',
      badge: 'kids', badgeText: 'Kids',
      pages: 112, readTime: '45min', chapters: 8,
      tagline: '¿Y si las estrellas usaran faros para no perderse en la noche?',
      synopsis: 'Tomás pasa el verano en la isla del faro junto a su abuelo. Una noche de tormenta, descubre un engranaje dorado oculto bajo la escalera de caracol. Al hacerlo girar, el faro deja de proyectar luz blanca y empieza a emitir un haz de luz cósmico de colores que responde a las constelaciones. Tomás se embarca en un misterio estelar para descifrar el mensaje secreto de los navegantes del cielo.',
      themes: ['Misterio', 'Astronomía', 'Familia'],
      openingQuote: '«Los faros no solo miran al mar, a veces le sonríen a las estrellas.»',
      ageBadge: '9-12 años',
      collectionTitle: 'COLECCIÓN AVENTURA',
      coverAccent: '#f6d365',
      coverAccentMuted: '#fda085'
    },
    {
      id: 'kid3', cat: 'kids',
      title: 'El Relojero de los Sueños',
      author: 'Clara Domínguez',
      genre: 'Realismo Mágico', cover: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&q=80&w=400',
      badge: 'kids', badgeText: 'Kids',
      pages: 76, readTime: '30min', chapters: 5,
      tagline: 'El tiempo de soñar no se mide en minutos, sino en sonrisas.',
      synopsis: 'Don Manuel es el relojero del pueblo, pero en su trastienda no repara relojes comunes. Repara relojes de arena que guardan las horas felices de la gente. Cuando el pequeño Bruno pierde las ganas de jugar porque el tiempo pasa muy rápido, Don Manuel le enseña cómo saborear cada segundo de juego y cómo los recuerdos alegres detienen las manecillas del reloj de la vida.',
      themes: ['Felicidad', 'El tiempo', 'Sabiduría'],
      openingQuote: '«Un minuto de risa dura más que una hora de aburrimiento.»',
      ageBadge: '6-10 años',
      collectionTitle: 'REALISMO MÁGICO',
      coverAccent: '#e0a96d',
      coverAccentMuted: '#e0a96d'
    },
    {
      id: 'kid4', cat: 'kids',
      title: 'Las Huellas del Bosque Susurrante',
      author: 'Hugo Silva',
      genre: 'Misterio', cover: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=400',
      badge: 'kids', badgeText: 'Kids',
      pages: 94, readTime: '35min', chapters: 6,
      tagline: 'Los animales del bosque tienen una historia que contarte, si sabes escuchar.',
      synopsis: 'Marta y su perro Duque encuentran unas misteriosas huellas que brillan con luz verde al atardecer en el lindero del bosque. Siguiendo el rastro junto a su grupo de amigos, descubren que el bosque está tratando de alertarlos sobre la desaparición de un manantial sagrado. Una hermosa lección de ecología, trabajo en equipo y el maravilloso lenguaje secreto de la naturaleza.',
      themes: ['Ecología', 'Aventura', 'Trabajo en equipo'],
      openingQuote: '«El bosque no habla alto, pero susurra secretos a quienes saben guardar silencio.»',
      ageBadge: '8-12 años',
      collectionTitle: 'COLECCIÓN MISTERIO',
      coverAccent: '#84a98c',
      coverAccentMuted: '#a3b18a'
    }
  ];

  // Inyectar 15 libros kids combinatorios
  KIDS_POOL.forEach((kp, idx) => {
    kidsList.push({
      id: kp.id,
      cat: "kids",
      title: kp.title,
      author: kp.author,
      genre: "Infantil",
      cover: kp.cover,
      badge: "kids",
      badgeText: "Kids",
      pages: Math.floor(Math.random() * (110 - 45) + 45),
      readTime: `${Math.floor(Math.random() * (35 - 15) + 15)}min`,
      chapters: 3,
      tagline: shuffle([...METADATA_POOL.kids.taglines])[0],
      synopsis: shuffle([...METADATA_POOL.kids.synopses])[0],
      themes: shuffle([...METADATA_POOL.kids.themes]).slice(0, 3),
      openingQuote: shuffle([...METADATA_POOL.kids.quotes])[0],
      ageBadge: kp.age,
      collectionTitle: kp.col,
      coverAccent: kp.pri,
      coverAccentMuted: kp.sec
    });
  });

  return kidsList;
}

// ── Inyeccion en assets/js/index.js ──────────────────────────────────────────
function injectIndexJS() {
  const filePath = path.join(__dirname, 'assets', 'js', 'index.js');
  
  if (!fs.existsSync(filePath)) {
    console.error("  ✗ [Compiler Error] No se encontró assets/js/index.js en la ruta:", filePath);
    process.exit(1);
  }

  let indexContent = fs.readFileSync(filePath, 'utf8');

  // Generar las constantes compiled
  const compiledFallback = compileFallbackCatalog();
  const compiledKids = compileKidsCatalog();

  const fallbackStr = `const FALLBACK_BOOKS = ${JSON.stringify(compiledFallback, null, 2)};`;
  const kidsStr = `const KIDS_FALLBACK_BOOKS = ${JSON.stringify(compiledKids, null, 2)};`;

  // Encontrar y reemplazar FALLBACK_BOOKS en index.js
  const fallbackRegex = /const FALLBACK_BOOKS\s*=\s*\[[\s\S]*?\];/;
  const kidsRegex = /const KIDS_FALLBACK_BOOKS\s*=\s*\[[\s\S]*?\];/;

  if (!fallbackRegex.test(indexContent)) {
    console.error("  ✗ [Compiler Error] No se pudo encontrar el patrón FALLBACK_BOOKS en index.js");
    process.exit(1);
  }

  if (!kidsRegex.test(indexContent)) {
    console.error("  ✗ [Compiler Error] No se pudo encontrar el patrón KIDS_FALLBACK_BOOKS en index.js");
    process.exit(1);
  }

  indexContent = indexContent.replace(fallbackRegex, fallbackStr);
  indexContent = indexContent.replace(kidsRegex, kidsStr);

  fs.writeFileSync(filePath, indexContent, 'utf8');
  console.log(`\n  ${'─'.repeat(52)}`);
  console.log("  ✦ [Compiler Success] ¡Compilación e inyección local exitosa!");
  console.log(`  ✦ Catálogo general compilado: ${compiledFallback.length} obras premium.`);
  console.log(`  ✦ Catálogo Kids compilado:    ${compiledKids.length} obras mágicas.`);
  console.log(`  ${'─'.repeat(52)}\n`);
}

injectIndexJS();
process.exit(0);
