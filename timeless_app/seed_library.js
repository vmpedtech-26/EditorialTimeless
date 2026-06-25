'use strict';

// ── Seeding Script for Timeless Editorial ──────────────────────────────────
// Populates Firestore with 100+ exquisite, deeply realistic high-literature books
// combining combinatorial dynamic catalog metadata and authentic chapter prose.
//
// Run using:
//   node seed_library.js

const admin = require('firebase-admin');
require('dotenv').config();

// ── Firebase Admin Initialization ──────────────────────────────────────────
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    serviceAccount = require('./serviceAccountKey.json');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("  ✦ [Firebase] Admin inicializado con éxito.");
} catch (err) {
  console.error("  ✗ [Firebase Error] Fallo crítico al inicializar Firebase Admin:", err.message);
  process.exit(1);
}

const db = admin.firestore();

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
  comedia: [
    { genre: "Comedia Absurda", prefix: "SÁTIRA Y ABSURDO" },
    { genre: "Sátira Literaria", prefix: "BIBLIOTECA DEL HUMOR" },
    { genre: "Comedia Surrealista", prefix: "CRÓNICAS DEL DELIRIO" }
  ],
  novela: [
    { genre: "Novela Histórica", prefix: "CRÓNICAS DEL TIEMPO" },
    { genre: "Novela de Formación", prefix: "NARRATIVAS DEL SUR" },
    { genre: "Realismo Mágico", prefix: "REALISMO MÁGICO" },
    { genre: "Novela Psicológica", prefix: "CALEIDOSCOPIO" }
  ],
  thriller: [
    { genre: "Thriller Político", prefix: "INTRIGA Y PODER" },
    { genre: "Tecno-Thriller", prefix: "CÓDIGO OCULTO" },
    { genre: "Thriller Arqueológico", prefix: "ARQUEOLOGÍAS MUDAS" },
    { genre: "Thriller Psicológico", prefix: "LABERINTOS MENTALES" }
  ],
  neurociencia: [
    { genre: "Neurociencia Divulgativa", prefix: "CEREBRO Y CONDUCTA" },
    { genre: "Neurociencia Cognitiva", prefix: "MÁQUINA DE PENSAR" },
    { genre: "Neurobiología", prefix: "BIOLOGÍA DE LA MENTE" }
  ],
  finanzas: [
    { genre: "Finanzas Personales", prefix: "RIQUEZA TEMPORAL" },
    { genre: "Economía Conductual", prefix: "MANTRA FINANCIERO" },
    { genre: "Estrategia Financiera", prefix: "CÓDIGO DE RIQUEZA" }
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
    themes: ["Memoria", "Identidad", "Laberintos", "Olvido", "Tiempo circular", "Fronteras"]
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
      "Una exploración filosófica de la estética del vacío y la deriva intelectual en las grandes urbes contemporáneas, cuestionando cómo consumimos ideas y cómo el ruido digital nos ha distanciado de la experiencia táctil de pensar.",
      "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo."
    ],
    themes: ["Filosofía", "Silencio", "Resistencia", "Estética", "Atención", "Cultura", "Arqueología"]
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
    themes: ["Correspondencia", "Exilio", "Diarios", "Brighton", "París", "Voces líricas", "Vidas íntimas"]
  },
  tecnica: {
    taglines: [
      "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
      "En la arquitectura de una gran novela, el silencio ocupa más espacio que la voz.",
      "La alquimia del adjetivo preciso no decora la frase, la ancla al suelo de la verdad."
    ],
    quotes: [
      "«Toda gran historia tiene una sombra invisible. Tu trabajo es hacer que el lector la sienta.»",
      "«La elipsis no es una omisión perezosa, sino el motor que hace respirar a la novela.»",
      "«La frase perfecta tiene el peso exacto de una piedra húmeda bajo la lluvia nocturna.»"
    ],
    synopses: [
      "Un manual de estilo e ingeniería literaria de una lucidez excepcional, donde se desvelan los mecanismos ocultos de la tensión narrativa, el uso arquitectónico de la luz en las escenas y el diseño de diálogos implícitos donde lo no dicho es lo que verdaderamente importa.",
      "Un análisis profundo del ritmo, la carpintería del suspenso existencial y la respiración de la prosa, estructurado como una partitura teórica indispensable para escritores en formación y lectores exigentes.",
      "Un cuaderno de taller que reflexiona sobre la gramática de la atención y la alquimia verbal, enseñando a construir habitaciones literarias que el lector recordará con la nitidez de una casa de la infancia."
    ],
    themes: ["Escritura", "Arquitectura ficcional", "Elipsis", "Estilo", "Taller literario", "Suspenso", "Ritmo"]
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
    themes: ["Amistad", "Misterio", "Naturaleza", "Familia", "Fantasía", "Ecología", "Astronomía"]
  }
};

const PROSE_POOL = {
  ficcion: [
    "El hombre despertó en una habitación cuyos muros duplicaban hasta el infinito la pálida luz del atardecer. Comprendió, con una resignación que bordeaba la felicidad, que el mapa que llevaba años dibujando no representaba una provincia olvidada, sino las intrincadas galerías de su propia memoria. Cada pasillo era un año; cada intersección, un olvido voluntario.",
    "Hubo en Praga un relojero que pretendía haber detenido el transcurso del tiempo durante los tres segundos que dura la caída de una hoja de álamo. La posteridad lo consideró un loco o un místico, pero sus diarios revelan la existencia de una hendidura en la vigilia por la cual es posible deslizarse sin hacer ruido, habitando el intervalo entre el tic y el tac del reloj universal.",
    "El viento traía el rumor del acueducto lejano, un sonido de agua subterránea que parecía arrastrar los nombres de todos los hombres que habían muerto en la llanura. Ella escuchaba con la atención de quien descifra una escritura antigua en el lino, sabiendo que el olvido es solo otra forma de la persistencia. Nadie se va del todo; nos disolvemos en la lluvia.",
    "Las ruinas circulares de la antigua biblioteca ya no guardaban libros, sino ceniza y murmullos suspendidos en el aire denso del verano. Caminé entre los pilares caídos con un fervor casi religioso, buscando el volumen único que, según la leyenda, contenía una sola frase capaz de curar la melancolía de quien la pronunciase en voz baja ante el espejo.",
    "Bajo la luz dorada del crepúsculo, los tigres de la biblioteca parecían de bronce y arena. Se movían sin hacer ruido entre los anaqueles infinitos, custodios de un alfabeto que ningún hombre vivo ha podido descifrar. Comprendí entonces que la literatura no es una forma de expresión, sino un laberinto diseñado para perderse con elegancia."
  ],
  ensayo: [
    "La prisa contemporánea no es solo una aceleración del movimiento, sino una mutilación sistemática de la mirada. En la velocidad del tránsito, las cosas pierden su sombra, y con su sombra, pierden su misterio. Detenerse no es, por tanto, una renuncia a la acción, sino el único acto de soberanía intelectual que nos queda en este siglo de urgencias.",
    "Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo antes de disolverlo. En toda obra de alta literatura hay una voluntad de permanencia que desafía el ruido ensordecedor del consumo rápido. No se escribe para decir algo nuevo, sino para construir un refugio contra la erosión silenciosa del olvido.",
    "La contemplación no es una actitud pasiva, sino una actividad crítica de primer orden. Exige del sujeto una renuncia al utilitarismo inmediato y una entrega al ritmo propio del objeto observado. En la luz de la tarde que se filtra por la ventana del museo vacío reside una verdad que no necesita ser enunciada para ser absoluta.",
    "La arqueología del lenguaje nos demuestra que cada palabra es una ruina que aún respira. Debajo del uso instrumental y desgastado que hacemos de los vocablos diariamente, persiste un sustrato poético y sagrado que el escritor tiene el deber de desenterrar. Escribir con rigor es limpiar el polvo de los siglos de un cristal antiguo.",
    "El silencio es la sustancia de la que se nutre el pensamiento profundo. En una cultura que idolatra la opinión instantánea y la reacción inmediata, cultivar la pausa es un gesto revolucionario. La lentitud en la lectura nos permite saborear la textura del texto, convirtiendo el acto de leer en una liturgia íntima."
  ],
  biografia: [
    "Nació en un puerto cuyos barcos parecían siempre a punto de partir pero nunca lo hacían. Su infancia transcurrió entre el crujido de las maderas salinas y el olor a brea húmeda, bajo una luz gris que determinaría para siempre el tono melancólico de sus cartas de juventud y la cadencia pausada de sus poemas.",
    "Los últimos años de su vida transcurrieron en una absoluta y voluntaria reclusión en aquella casona de Brighton. Quienes la visitaron recuerdan que apenas hablaba, dedicando las horas de la tarde a contemplar el movimiento del oleaje sobre los guijarros de la costa, anotando en cuadernos pequeños la hora exacta en que cambiaba la luz.",
    "Sus cartas de juventud revelan a una mujer atrapada entre la vorágine de la vida intelectual parisina y el anhelo de un silencio absoluto. 'París es una fiesta que agota las palabras', escribía en 1924, 'necesito una geografía fría donde las ideas pesen más que el ruido del bulevar'. Su exilio voluntario fue el origen de su obra maestra.",
    "El diario de su convalecencia es un testimonio desgarrador y a la vez luminoso sobre la fragilidad humana. Escrito con una caligrafía temblorosa pero con una lucidez implacable, analiza cómo el dolor físico agudiza la percepción estética, convirtiendo la luz que entra por la persiana en un acontecimiento cósmico.",
    "Caminaba por los bulevares de Buenos Aires con la mirada perdida de quien busca un pasaje secreto entre dos edificios comunes. Sus amigos recordaban su risa tímida y su obsesión por coleccionar cajas de música rotas. Hizo de su vida un borrador inconcluso, sabiendo que la única obra perfecta es la que se interrumpe."
  ],
  tecnica: [
    "Toda novela es, en última instancia, una máquina de habitar. El escritor no inventa personajes; erige muros, abre ventanas y proyecta sombras en las que el lector pueda cobijarse de la intemperie del mundo. El secreto de la maestría narrativa no reside en lo que se dice, sino en la tensión invisible que se acumula entre los silencios.",
    "El adjetivo preciso no es el que decora la frase, sino el que la ancla al suelo de la verdad. En la física del espacio ficcional, una sola palabra colocada con pereza puede derrumbar la arquitectura de una escena entera. El rigor formal es la única garantía de que la mentira de la ficción resulte habitable.",
    "La elipsis es el motor que hace respirar al texto literario. Al omitir lo obvio y sugerir lo invisible, el autor invita al lector a co-crear la historia, rellenando los vacíos con su propia sensibilidad. La gran literatura no satura la mente; crea espacio libre para que el pensamiento del lector se expanda.",
    "El ritmo de la prosa no depende de la métrica, sino de la distribución de las respiraciones. Alternar frases cortas como latidos con períodos largos y sinuosos como corrientes de agua genera una hipnosis que atrapa al lector en el fluir del texto. La partitura tipográfica debe ser tan cuidada como la musical.",
    "El suspenso existencial no nace de saber quién cometió el crimen, sino de comprender por qué el personaje continúa caminando hacia la sombra. La tensión en la alta literatura es de carácter ético y estético; una vibración sutil que ocurre en la frontera de lo indecible, entre la palabra y el abismo."
  ],
  comedia: [
    "El primer paraguas en marcharse fue un ejemplar de color negro mango de madera, propiedad del juez de paz. Salió volando sin viento, directo hacia el este, cansado de la humedad y la ingratitud de sus dueños.",
    "En el cóctel de la editorial, Ernesto sostuvo una copa de jerez con la melancolía de quien comprende el peso de la elipsis en el siglo de oro español, haciéndose pasar por un autor consagrado sin haber leído un solo libro en su vida.",
    "El señor Péndulo pesaba ochenta kilos los lunes por la mañana mientras ordenaba sus facturas. Pero a las tres de la tarde, frente al balance contable del municipio, su cuerpo comenzó a flotar suavemente hasta rozar el techo.",
    "La siesta llamada 'del rayo' debe durar exactamente seis minutos. Cualquier exceso nos expone a despertar en un siglo distinto, o peor aún, a las siete de la tarde de un domingo creyendo que es lunes por la mañana.",
    "El tratado comercial estuvo a punto de colapsar cuando Sofía tradujo 'tasa arancelaria' como 'un pequeño impuesto sobre los sombreros ridículos', desatando un desopilante debate lingüístico internacional."
  ],
  novela: [
    "El telar de madera sonaba con la regularidad de un corazón cansado. En la penumbra de la cabaña, Keiko deslizaba los hilos de seda blanca, ocultando entre las hebras un poema que su abuela le había hecho jurar memorizar.",
    "La Patagonia no se abre a los hombres; se les resiste con un viento de ceniza que borra los caminos antes de terminarlos de recorrer, desafiando los intentos del cartógrafo por trazar fronteras estables.",
    "Elena apoyó la oreja en la pared de adobe del patio principal. Al principio solo escuchó el paso del viento por el tejado de tejas musgosas, pero luego escuchó las risas de quienes habitaron la hacienda hace un siglo.",
    "El olor a ácido acético y sales de plata devolvió a Irene a los años del sótano y la luz roja, ampliando un negativo donde aparecía el rostro de alguien que la historia daba por desaparecido.",
    "Julia apretó el cuello de su tapado de lana verde, mirando la vieja calesita tapada con lonas grises frente a la costa inglesa, esperando el tren que traería de vuelta los recuerdos de 1968."
  ],
  thriller: [
    "El cuerpo del maestro relojero yacía en el interior de la torre del reloj astronómico, rodeado de resortes. El inspector Jan no buscó heridas; sabía que en Praga las intrigas se cobraban vidas en silencio.",
    "Un archivo EPUB de 'La Divina Comedia' contenía un payload inusual en los metadatos. Elena analizó el código hexadecimal y encontró una estructura de encriptado militar de alta seguridad oculta en la prosa.",
    "Sarah ingresó al sitio de excavación clandestinamente a medianoche, deslizando sus manos por el cilindro de terracota sumerio que contenía las frecuencias musicales capaces de alterar el cerebro.",
    "El profesor Daniel Varga sostenía la novela barata con un temblor inocultable: cada capítulo de la ficción coincidía con precisión aterradora con los atentados perpetrados la víspera en la ciudad.",
    "Samuel sonrió con suavidad desde el rincón de su celda de máxima seguridad: 'Yo no les quité la vida, doctora; simplemente les mostré su reverso en el espejo hasta que decidieron irse'."
  ],
  neurociencia: [
    "Cuando observamos a un pianista mover sus dedos sobre el teclado, nuestra corteza motora se activa como si estuviéramos tocando la sonata nosotros mismos, demostrando la magia oculta de las neuronas espejo.",
    "El cerebro no fue diseñado evolutivamente para leer, pero la lectura profunda recluta y recicla áreas diseñadas originalmente para reconocer rostros y huellas en el bosque primigenio.",
    "El hipocampo es el archivista plástico de nuestra existencia. Cada recuerdo nuevo requiere la creación de nuevas conexiones y la síntesis activa de proteínas en las neuronas correspondientes.",
    "Mantener la atención consciente en una sola tarea durante más de diez minutos constituye un acto de resistencia biológica y metabólica en la ruidosa era de las notificaciones digitales.",
    "Durante el sueño REM, el cerebro consume tanta energía como cuando estamos resolviendo problemas matemáticos complejos, limpiando toxinas emocionales mientras el cuerpo permanece inmóvil."
  ],
  finanzas: [
    "El interés compuesto es la octava maravilla del mundo financiero: un pequeño ahorro mensual del diez por ciento se duplica cada década, acumulando una riqueza silenciosa pero inquebrantable a través del tiempo.",
    "Las decisiones de gasto rara vez son racionales; solemos comprar lo que no necesitamos con dinero que no tenemos para impresionar a personas que no nos importan, buscando llenar vacíos afectivos.",
    "El arquitecto de la libertad financiera no vende su tiempo laboral por un sueldo; construye un portafolio de activos generadores de flujo de caja que financien su independencia absoluta.",
    "La mentalidad de abundancia ve oportunidades y valor donde la mentalidad de escasez y miedo solo detecta crisis y contracción, permitiendo invertir a largo plazo de forma racional y serena.",
    "El precio de mercado fluctúa de acuerdo con los caprichos del algoritmo comercial, pero el valor intrínseco de un activo reside en su flujo de caja futuro y su margen de seguridad."
  ],
  kids: [
    "En la cima de la Montaña Azul vivía un unicornio cuyas crines estaban tejidas con hilos de escarcha brillante. Aunque a veces se sentía solo, los pájaros del viento le traían cuentos de barcos de papel dorado que navegaban por ríos de nubes, llevándole saludos de niños que sabían soñar despiertos con los ojos abiertos.",
    "El pequeño faro de la isla no usaba aceite ni carbón para encender su haz. Se alimentaba cada noche con las sonrisas alegres de las estrellas de mar, proyectando un rayo mágico de colores sobre las olas espumosas para que ningún pez se perdiera durante las tormentas del invierno.",
    "Don Manuel era el relojero más sabio del pueblo, pero en su trastienda no reparaba relojes de engranajes metálicos. Su especialidad eran los relojes de arena mágica que guardaban los segundos felices de la gente, recordándole a los niños que una tarde de juego dura mucho más que una hora de escuela.",
    "Marta y su fiel perro Duque encontraron una línea de huellas brillantes que resplandecían con luz verde en el lindero del bosque. Siguiendo el rastro tomados de la mano de sus amigos, descubrieron que el bosque les susurraba un hermoso secreto: el manantial sagrado estaba sediento y necesitaba su ayuda.",
    "La pequeña tortuga Marina tenía un caparazón pintado con las constelaciones del cielo. Cada vez que soplaba el viento del norte, Marina cerraba los ojos y flotaba suavemente sobre las ráfagas de aire, recorriendo el mundo de nube en nube para llevar sueños felices a los cachorros que tenían miedo a la oscuridad."
  ]
};

// ── Master Titles List (100 Evocative Masterpieces) ─────────────────────────
const TITLES_POOL = [
  // Ficción (40 titles)
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

  // Ensayos (20 titles)
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

  // Técnica (10 titles)
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

  // Comedia (5 titles)
  { cat: "comedia", title: "La rebelión de los paraguas extraviados" },
  { cat: "comedia", title: "Manual del perfecto impostor literario" },
  { cat: "comedia", title: "La insólita gravedad del señor Péndulo" },
  { cat: "comedia", title: "Tratado sobre la siesta perfecta" },
  { cat: "comedia", title: "El club de los malos traductores" },

  // Novela (5 titles)
  { cat: "novela", title: "La sombra del cerezo en otoño" },
  { cat: "novela", title: "Donde el viento da la vuelta" },
  { cat: "novela", title: "El rumor de las piedras tibias" },
  { cat: "novela", title: "Los cuadernos de la luz oblicua" },
  { cat: "novela", title: "La última estación de Brighton" },

  // Thriller (5 titles)
  { cat: "thriller", title: "El enigma del relojero de Praga" },
  { cat: "thriller", title: "Sombras en la red de seda" },
  { cat: "thriller", title: "La novena sinfonía de la arena" },
  { cat: "thriller", title: "El manuscrito del conspirador" },
  { cat: "thriller", title: "La conspiración del silencio cóncavo" },

  // Neurociencia (5 titles)
  { cat: "neurociencia", title: "La sinfonía de las neuronas espejo" },
  { cat: "neurociencia", title: "El cerebro del lector" },
  { cat: "neurociencia", title: "Los laberintos de la memoria plástica" },
  { cat: "neurociencia", title: "La física de la atención consciente" },
  { cat: "neurociencia", title: "El misterio del sueño REM" },

  // Finanzas (5 titles)
  { cat: "finanzas", title: "La alquimia del interés compuesto" },
  { cat: "finanzas", title: "La psicología del dinero y el deseo" },
  { cat: "finanzas", title: "El arquitecto de la libertad financiera" },
  { cat: "finanzas", title: "Mentalidad de abundancia en tiempos de escasez" },
  { cat: "finanzas", title: "El código del valor intrínseco" },

  // Kids (15 titles)
  { cat: "kids", title: "El Dragón que perdió su Fuego" },
  { cat: "kids", title: "La Estación de los Trenes de Nubes" },
  { cat: "kids", title: "El Gato que sabía contar Estrellas" },
  { cat: "kids", title: "La Llave del Viento del Norte" },
  { cat: "kids", title: "El Oso que coleccionaba Silencios" },
  { cat: "kids", title: "El Duende del Lápiz de Plata" },
  { cat: "kids", title: "La Niña que pintaba la Lluvia" },
  { cat: "kids", title: "El Viaje del Pequeño Velero Dorado" },
  { cat: "kids", title: "El Misterio del Reloj de Sol" },
  { cat: "kids", title: "La Tortuga que caminaba sobre el Viento" },
  { cat: "kids", title: "El Bosque de los Libros Mágicos" },
  { cat: "kids", title: "El Secreto de la Estrella de Mar" },
  { cat: "kids", title: "La Cueva de los Ecos Felices" },
  { cat: "kids", title: "El Pingüino que quería Volar" },
  { cat: "kids", title: "El Caballero de la Armadura de Madera" }
];

const COVERS_PRESETS = [
  "assets/cover_memoria.png",
  "assets/cover_umbral.png",
  "assets/cover_arquitecto.png",
  "assets/cover_contemplacion.png"
];

const KIDS_EMOJIS = [
  "🦄", "🪐", "⏳", "🐾", "🐉", "🚂", "🐱", "🔑", "🐻", "✏️", "🌧️", "⛵", "☀️", "🐢", "🌳", "⭐", "🗣️", "🐧", "🛡️", "🌙"
];

const KIDS_ACCENTS = [
  { primary: "#d5e3f0", secondary: "#a4c2db" }, // Blue
  { primary: "#f6d365", secondary: "#fda085" }, // Yellow/Orange
  { primary: "#e0a96d", secondary: "#c8945a" }, // Gold/Amber
  { primary: "#84a98c", secondary: "#a3b18a" }, // Green
  { primary: "#fbc2eb", secondary: "#a6c1ee" }, // Pastel Pink/Purple
  { primary: "#ff9a9e", secondary: "#fecfef" }  // Soft Red
];

// Helper to shuffle arrays
function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

// ── Core Catalog Generator ──────────────────────────────────────────────────
function generateCatalog100() {
  const books = [];
  
  // Use a map to ensure unique titles
  const chosenTitles = new Set();
  
  TITLES_POOL.forEach((item, index) => {
    if (chosenTitles.has(item.title)) return;
    chosenTitles.add(item.title);

    const category = item.cat;
    const title = item.title;
    
    // Select genre and prefix metadata
    const genreObj = shuffle([...GENRES[category]])[0];
    const writer = shuffle([...WRITERS])[0];
    
    // Select metadata templates
    const pool = METADATA_POOL[category];
    const tagline = shuffle([...pool.taglines])[0];
    const quote = shuffle([...pool.quotes])[0];
    const synopsis = shuffle([...pool.synopses])[0];
    const themes = shuffle([...pool.themes]).slice(0, 3);
    
    // Select badge randomly (15% chance of excl, 15% new, others empty)
    let badge = "";
    let badgeText = "";
    const randBadge = Math.random();
    if (category !== 'kids') {
      if (randBadge < 0.15) {
        badge = "excl";
        badgeText = "Exclusivo";
      } else if (randBadge < 0.3) {
        badge = "new";
        badgeText = "Nuevo";
      }
    } else {
      badge = "kids";
      badgeText = "Kids";
    }

    // Set page count and read duration
    let pages, duration;
    if (category === 'kids') {
      pages = Math.floor(Math.random() * (120 - 32) + 32);
      duration = `${Math.floor(pages * 0.45)}min`;
    } else {
      pages = Math.floor(Math.random() * (420 - 180) + 180);
      duration = `${Math.floor(pages / 42)}h ${Math.floor((pages % 42) * 1.4)}min`;
    }

    // Assign Cover (Images for adult fiction/essay, custom emojis for kids and rare books)
    let cover = "";
    let kidsExtra = {};

    if (category === 'kids') {
      // Custom elegant emoji cover
      cover = shuffle([...KIDS_EMOJIS])[0];
      const accent = shuffle([...KIDS_ACCENTS])[0];
      kidsExtra = {
        ageBadge: shuffle(["4-8 años", "6-10 años", "8-12 años", "9-12 años"])[0],
        collectionTitle: genreObj.prefix,
        coverAccent: accent.primary,
        coverAccentMuted: accent.secondary
      };
    } else {
      // 80% preset image, 20% aesthetic custom symbol/emoji cover
      if (Math.random() < 0.8) {
        cover = shuffle([...COVERS_PRESETS])[0];
      } else {
        cover = shuffle([...KIDS_EMOJIS])[0]; // Emojis are also fully supported with fluid gradients in adult catalog
      }
    }

    // Assemble beautifully styled multichapter prose
    const numChapters = category === 'kids' ? 3 : 5;
    const chapters = [];
    const chapterOutlines = [];
    
    const prosePool = PROSE_POOL[category];

    for (let c = 1; c <= numChapters; c++) {
      const chTitle = `${romanize(c)}. ${shuffle(["La hendidura", "El laberinto", "El murmullo", "El fragmento", "La frontera", "El umbral", "La vigilia", "La memoria", "La deriva", "La alquimia"])[0]} de ${shuffle(["los días", "las sombras", "la arena", "las ruinas", "los espejos", "los relojes", "los pasos", "las estrellas", "los silencios", "las nubes"])[0]}`;
      const chDesc = `Arco narrativo sobre ${shuffle(["la disolución de la prisa", "la búsqueda del rostro infinito", "la tensión implícita del diálogo", "el susurro sagrado de la naturaleza", "el peso de la ceniza y la vigilia"])[0]}.`;
      
      // Shuffle paragraphs and assemble a 3-paragraph realistic chapter
      const shuffledParagraphs = shuffle([...prosePool]);
      const formattedChapter = shuffledParagraphs.slice(0, 3).map(p => `<p>${p}</p>`).join('\n');

      chapters.push(formattedChapter);
      chapterOutlines.push({
        title: chTitle,
        arc: chDesc
      });
    }

    const bookId = `seeded-${category}-${index}`;

    books.push({
      id: bookId,
      title,
      author: writer,
      cat: category,
      genre: genreObj.genre,
      cover,
      badge,
      badgeText,
      pages,
      duration,
      desc: synopsis,
      tagline,
      openingQuote: quote,
      themes,
      chapters,
      outline: {
        title,
        chapters: chapterOutlines
      },
      ...kidsExtra
    });
  });

  return books;
}

// Helper Roman numeral converter
function romanize(num) {
  if (isNaN(num)) return NaN;
  const digits = String(+num).split(""),
    key = ["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM",
           "","X","XX","XXX","XL","L","LX","LXX","LXXX","XC",
           "","I","II","III","IV","V","VI","VII","VIII","IX"],
    roman = [];
  let i = 3;
  while (i--) roman.push(key[+digits.pop() + (i * 10)] || "");
  return roman.join("");
}

// ── Firestore Writer ────────────────────────────────────────────────────────
async function seedFirestore() {
  const books = generateCatalog100();
  console.log(`\n  ✦ [Catalog Generator] Generadas ${books.length} obras premium combinatorias.`);
  console.log("  ✦ [Firestore Sync] Iniciando escritura concurrente en Firestore...\n");
  
  const batchSize = 10;
  let successCount = 0;
  
  // Write in batches to stay within Firestore throughput limits safely
  for (let i = 0; i < books.length; i += batchSize) {
    const currentBatch = books.slice(i, i + batchSize);
    
    await Promise.all(currentBatch.map(async (book) => {
      const bookId = book.id;
      const docData = { ...book };
      delete docData.id; // Clean id from document fields
      
      try {
        await db.collection("books").doc(bookId).set(docData);
        successCount++;
        process.stdout.write(`  ✔ [${successCount}/100] Cargado: "${book.title.slice(0, 30)}..."\n`);
      } catch (err) {
        console.error(`  ✗ [Error] Fallo al escribir libro ${book.title}:`, err.message);
      }
    }));
  }

  console.log(`\n  ${'─'.repeat(52)}`);
  console.log(`  ✦  ¡PROCESO DE CARGA COMPLETADO CON ÉXITO!`);
  console.log(`  ✦  Total de obras inyectadas en catálogo oficial: ${successCount}`);
  console.log(`  ${'─'.repeat(52)}\n`);
}

// Execute Seeding
seedFirestore()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("  ✗ [Critical] Fallo en la ejecución del script de carga:", err);
    process.exit(1);
  });
