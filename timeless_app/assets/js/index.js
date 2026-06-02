import { 
  auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  db, collection, getDocs, query, where, doc, getDoc
} from '../../firebase_config.js';

// ---- STATE ----
let currentUser = null;
let currentCat = 'all';
let isPremiumUser = false;
const bookGrid = document.getElementById('book-grid');

// ---- SCROLL REVEAL ----
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view'); });
}, { threshold: 0.1 });

// Initialize reveal on static elements
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ---- RENDER BOOKS ----
function renderBooks(books) {
  if (!books.length) {
    bookGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--ink-faint);">No se encontraron obras en esta categoría.</div>';
    return;
  }

  bookGrid.innerHTML = books.map((b, i) => {
    const isEmoji = b.cover && !b.cover.startsWith('assets') && !b.cover.startsWith('http') && !b.cover.includes('/');
    const coverHtml = isEmoji
      ? `<div class="book-cover-placeholder-emoji" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:linear-gradient(135deg, #1E1B18, #141210); border: 1px solid var(--border-dark);">
          <div style="font-size: 56px; line-height: 1; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));">${b.cover}</div>
          <div style="font-family:var(--font-serif); font-size:12px; font-weight:600; color:var(--gold); text-align:center; padding:10px; margin-top:10px; opacity:0.85; max-width:90%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${b.title}</div>
         </div>`
      : `<img src="${b.cover || 'assets/cover.png'}" alt="${b.title}" loading="lazy" />`;

    return `
      <div class="book-card reveal reveal-delay-${(i % 4) + 1}" data-book-id="${b.id}" onclick="openBookModal('${b.id}')">
        <div class="book-card-cover">
          <div class="book-card-spine"></div>
          ${coverHtml}
          <div class="book-card-overlay">
            <div class="book-card-read-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              Ver contraportada
            </div>
          </div>
          ${b.badge === 'excl' ? `<div class="book-excl">${b.badgeText || 'Exclusivo'}</div>` : ''}
          ${b.badge === 'new'  ? `<div class="book-new">${b.badgeText || 'Nuevo'}</div>` : ''}
        </div>
        <div class="book-card-genre">${b.genre}</div>
        <div class="book-card-title">${b.title}</div>
        <div class="book-card-author">${b.author || 'Timeless Agent'}</div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.book-card.reveal').forEach(el => observer.observe(el));
}

// ---- RENDER KIDS GRID ----
function renderKidsGrid(books) {
  const kidsGrid = document.getElementById('kids-grid');
  if (!kidsGrid) return;
  
  if (!books.length) {
    kidsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--ink-faint);">No hay obras infantiles en este momento.</div>';
    return;
  }
  
  kidsGrid.innerHTML = books.map((b, i) => {
    const accent = b.coverAccent || '#d5e3f0';
    const accentMuted = b.coverAccentMuted || '#a4c2db';
    const age = b.ageBadge || '4-8 años';
    const col = b.collectionTitle || 'COLECCIÓN INFANTIL';
    
    const isEmoji = b.cover && !b.cover.startsWith('assets') && !b.cover.startsWith('http') && !b.cover.includes('/');
    const coverHtml = isEmoji
      ? `<div class="kids-card-cover-placeholder" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:linear-gradient(135deg, ${accent}, ${accentMuted});">
          <div style="font-size: 72px; line-height: 1; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));">${b.cover}</div>
         </div>`
      : `<img src="${b.cover}" alt="${b.title}" loading="lazy" />`;
      
    return `
      <div class="kids-card reveal reveal-delay-${(i % 4) + 1}" onclick="openBookModal('${b.id}')">
        <div class="kids-card-cover" style="--cover-accent: ${accent}; --cover-accent-muted: ${accentMuted};">
          <div class="kids-age-badge">${age}</div>
          <div class="book-card-spine"></div>
          ${coverHtml}
          <div class="kids-cover-details">
            <div class="kids-cover-branding">TIMELESS KIDS</div>
            <div class="kids-cover-border-frame"></div>
            <div class="kids-cover-typography">
              <div class="kids-cover-title">${b.title.split(' ').join('<br>')}</div>
              <div class="kids-cover-collection">${col}</div>
              <div class="kids-cover-author">${(b.author || 'Timeless').toUpperCase()}</div>
            </div>
          </div>
          <div class="kids-card-overlay">
            <div class="kids-card-read-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              Ver contraportada
            </div>
          </div>
        </div>
        <div class="kids-card-age">${b.genre || 'Infantil'} · ${age}</div>
        <h3 class="kids-card-title">${b.title}</h3>
        <p class="kids-card-author">de ${b.author || 'Timeless'}</p>
      </div>
    `;
  }).join('');
  
  document.querySelectorAll('.kids-card.reveal').forEach(el => observer.observe(el));
}

async function fetchLibrary(category = 'all') {
  bookGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--ink-faint);">Sincronizando biblioteca…</div>';
  
  try {
    let q = collection(db, 'books');
    const editorialSnap = await getDocs(q);
    let books = editorialSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (currentUser) {
      const uq = query(collection(db, 'obras'), where('userId', '==', currentUser.uid));
      const userSnap = await getDocs(uq);
      const userBooks = userSnap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(), 
        cover: d.data().cover || 'assets/cover.png',
        badge: 'new',
        badgeText: 'Mi Obra'
      }));
      books = [...books, ...userBooks];
    }

    if (books.length === 0) {
      books = [...FALLBACK_BOOKS, ...KIDS_FALLBACK_BOOKS];
    } else {
      books = [...books, ...KIDS_FALLBACK_BOOKS];
    }
    
    BOOK_CATALOG = books;

    // Renderizar sección Kids dinámica
    const kidsBooks = books.filter(b => b.cat === 'kids');
    renderKidsGrid(kidsBooks);

    const filtered = category === 'all' 
      ? books.filter(b => b.cat !== 'kids') 
      : books.filter(b => b.cat === category || b.genre?.toLowerCase().includes(category));
    renderBooks(filtered);

  } catch (error) {
    console.error("Error fetching library:", error);
    BOOK_CATALOG = [...FALLBACK_BOOKS, ...KIDS_FALLBACK_BOOKS];
    renderBooks(FALLBACK_BOOKS);
  }
}

const FALLBACK_BOOKS = [
  {
    "id": "fb1",
    "cat": "ensayo",
    "title": "El Arte de la Contemplación",
    "author": "Emilio Vargas",
    "genre": "Ensayo",
    "cover": "assets/cover_contemplacion.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 218,
    "readTime": "5h 40min",
    "chapters": 12,
    "tagline": "En un mundo que corre, aprender a detenerse es el acto más radical.",
    "synopsis": "Emilio Vargas propone en este ensayo una filosofía de la atención como forma de resistencia cultural. A través de doce meditaciones independientes — sobre el silencio, la lentitud, la luz de la tarde, los museos vacíos — construye un argumento que no se enuncia sino que se acumula, como la humedad antes de la lluvia. Una voz que no urge: espera.",
    "themes": [
      "Atención",
      "Silencio",
      "Cultura contemporánea"
    ],
    "openingQuote": "«No se trata de no pensar. Se trata de pensar hacia abajo, en lugar de hacia adelante.»"
  },
  {
    "id": "fb2",
    "cat": "ficcion",
    "title": "La Memoria del Agua",
    "author": "Claudia Iriarte",
    "genre": "Ficción",
    "cover": "assets/cover_memoria.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 342,
    "readTime": "8h 20min",
    "chapters": 18,
    "tagline": "Los muertos no se van. Se disuelven en el sistema de acueductos.",
    "synopsis": "En una ciudad que comienza a olvidarse a sí misma, una archivista descubre que los recuerdos de los muertos persisten atrapados en el agua que bebe la gente. Cada vez que alguien llora, recuerda algo que no vivió. Claudia Iriarte teje una novela sobre el peso invisible de la memoria colectiva, la violencia silenciosa del olvido institucional y el amor que se filtra entre las grietas del concreto.",
    "themes": [
      "Memoria",
      "Pérdida",
      "Ciudad",
      "Duelo colectivo"
    ],
    "openingQuote": "«El agua tiene memoria. Es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "fb3",
    "cat": "tecnica",
    "title": "El Arquitecto de Sombras",
    "author": "Marcos Delgado",
    "genre": "Técnica narrativa",
    "cover": "assets/cover_arquitecto.png",
    "pages": 280,
    "readTime": "6h 55min",
    "chapters": 15,
    "tagline": "Un manual para construir mundos que el lector habite sin saberlo.",
    "synopsis": "Marcos Delgado, arquitecto de profesión y escritor por necesidad, expone en este volumen singular la gramática oculta detrás de los espacios narrativos que más nos han habitado. Cómo la luz entra en una escena. Cómo el silencio ocupa espacio en una página. Cómo construir una habitación que el lector recuerde aunque jamás la haya visto. Un libro técnico que se lee como una novela.",
    "themes": [
      "Escritura",
      "Arquitectura narrativa",
      "Espacio ficcional"
    ],
    "openingQuote": "«Todo gran edificio tiene una sombra. Toda gran historia también.»"
  },
  {
    "id": "fb4",
    "cat": "ficcion",
    "title": "En el Umbral",
    "author": "Isabel Noriega",
    "genre": "Ficción",
    "cover": "assets/cover_umbral.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 390,
    "readTime": "9h 45min",
    "chapters": 22,
    "tagline": "Entre los vivos y los muertos hay una habitación. Isabel Noriega vive allí.",
    "synopsis": "Cuatro personajes convergen durante una sola noche en un hotel de frontera que no aparece en ningún mapa. Ninguno sabe exactamente cómo llegó. Ninguno recuerda bien su nombre. Isabel Noriega construye una novela donde el suspenso no viene de lo que pasa sino de lo que no termina de resolverse: esa sensación de estar a punto de comprender algo que se retira justo cuando uno se acerca.",
    "themes": [
      "Identidad",
      "Límite",
      "Lo no dicho",
      "Suspenso existencial"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares que nos esperan.»"
  },
  {
    "id": "seeded-ficcion-5",
    "cat": "ficcion",
    "title": "El mapa de los laberintos discretos",
    "author": "Emilio Vargas",
    "genre": "Ficción Metafísica",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 248,
    "readTime": "5h 57min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Olvido",
      "Espejos",
      "Laberintos"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-6",
    "cat": "ficcion",
    "title": "La teología de la arena",
    "author": "Claudia Iriarte",
    "genre": "Fantasía Nocturna",
    "cover": "assets/cover_arquitecto.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 264,
    "readTime": "6h 18min",
    "chapters": 5,
    "tagline": "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Memoria",
      "Identidad",
      "Laberintos"
    ],
    "openingQuote": "«Un espejo no es más que una puerta que se cansó de reflejar la mentira del día.»"
  },
  {
    "id": "seeded-ficcion-7",
    "cat": "ficcion",
    "title": "El jardín de los senderos cruzados",
    "author": "Haru Murakami",
    "genre": "Fantasía Nocturna",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 205,
    "readTime": "4h 55min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Memoria",
      "Laberintos",
      "Olvido"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-8",
    "cat": "ficcion",
    "title": "La sonata del agua inmóvil",
    "author": "Roberto Belano",
    "genre": "Suspenso Existencial",
    "cover": "assets/cover_contemplacion.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 329,
    "readTime": "7h 52min",
    "chapters": 5,
    "tagline": "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Memoria",
      "Identidad",
      "Laberintos"
    ],
    "openingQuote": "«Hubo un día en que el mar olvidó su oleaje, y en ese instante eterno nació la arena.»"
  },
  {
    "id": "seeded-ficcion-9",
    "cat": "ficcion",
    "title": "El ajedrecista de Praga",
    "author": "Clara Domínguez",
    "genre": "Realismo Mágico",
    "cover": "🗝️",
    "badge": "",
    "badgeText": "",
    "pages": 252,
    "readTime": "6h 0min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Tiempo",
      "Olvido",
      "Espejos"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-10",
    "cat": "ficcion",
    "title": "Las ruinas circulares de la memoria",
    "author": "Virginia Silva",
    "genre": "Suspenso Existencial",
    "cover": "🌊",
    "badge": "",
    "badgeText": "",
    "pages": 208,
    "readTime": "4h 60min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Tiempo",
      "Olvido",
      "Espejos"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-11",
    "cat": "ficcion",
    "title": "La biblioteca de los libros no escritos",
    "author": "Clara Domínguez",
    "genre": "Ficción Metafísica",
    "cover": "assets/cover_arquitecto.png",
    "badge": "",
    "badgeText": "",
    "pages": 162,
    "readTime": "3h 54min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Laberintos",
      "Olvido",
      "Memoria"
    ],
    "openingQuote": "«Hubo un día en que el mar olvidó su oleaje, y en ese instante eterno nació la arena.»"
  },
  {
    "id": "seeded-ficcion-12",
    "cat": "ficcion",
    "title": "El coleccionista de crepúsculos",
    "author": "Emilio Vargas",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_arquitecto.png",
    "badge": "",
    "badgeText": "",
    "pages": 331,
    "readTime": "7h 55min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "La historia de un coleccionista de espejos cóncavos en la Praga de entreguerras que jura haber contemplado el rostro del infinito, desatando una conspiración silenciosa de relojeros y filósofos herejes.",
    "themes": [
      "Espejos",
      "Olvido",
      "Laberintos"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-13",
    "cat": "ficcion",
    "title": "El teorema de la lluvia",
    "author": "Clara Domínguez",
    "genre": "Suspenso Existencial",
    "cover": "🎭",
    "badge": "",
    "badgeText": "",
    "pages": 340,
    "readTime": "8h 6min",
    "chapters": 5,
    "tagline": "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Olvido",
      "Espejos",
      "Memoria"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-14",
    "cat": "ficcion",
    "title": "La levedad del viento austral",
    "author": "Arturo Borges",
    "genre": "Ficción Metafísica",
    "cover": "🧭",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 189,
    "readTime": "4h 31min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "La historia de un coleccionista de espejos cóncavos en la Praga de entreguerras que jura haber contemplado el rostro del infinito, desatando una conspiración silenciosa de relojeros y filósofos herejes.",
    "themes": [
      "Olvido",
      "Laberintos",
      "Espejos"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-15",
    "cat": "ficcion",
    "title": "El juego de los espejos cóncavos",
    "author": "Humberto Eco",
    "genre": "Fantasía Nocturna",
    "cover": "assets/cover_arquitecto.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 375,
    "readTime": "8h 58min",
    "chapters": 5,
    "tagline": "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Espejos",
      "Memoria",
      "Laberintos"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-16",
    "cat": "ficcion",
    "title": "La sintaxis del silencio",
    "author": "Arturo Borges",
    "genre": "Suspenso Existencial",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 348,
    "readTime": "8h 18min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "La historia de un coleccionista de espejos cóncavos en la Praga de entreguerras que jura haber contemplado el rostro del infinito, desatando una conspiración silenciosa de relojeros y filósofos herejes.",
    "themes": [
      "Tiempo",
      "Olvido",
      "Espejos"
    ],
    "openingQuote": "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»"
  },
  {
    "id": "seeded-ficcion-17",
    "cat": "ficcion",
    "title": "El faro de las constelaciones perdidas",
    "author": "Clara Domínguez",
    "genre": "Realismo Mágico",
    "cover": "🗝️",
    "badge": "",
    "badgeText": "",
    "pages": 191,
    "readTime": "4h 34min",
    "chapters": 5,
    "tagline": "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río.",
    "synopsis": "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
    "themes": [
      "Memoria",
      "Olvido",
      "Identidad"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-18",
    "cat": "ficcion",
    "title": "La última noche de la vigilia",
    "author": "Francisco Kafka",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_arquitecto.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 201,
    "readTime": "4h 49min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Olvido",
      "Laberintos",
      "Espejos"
    ],
    "openingQuote": "«Un espejo no es más que una puerta que se cansó de reflejar la mentira del día.»"
  },
  {
    "id": "seeded-ficcion-19",
    "cat": "ficcion",
    "title": "El afinador de silencios",
    "author": "Francisco Kafka",
    "genre": "Suspenso Existencial",
    "cover": "assets/cover_umbral.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 226,
    "readTime": "5h 24min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
    "themes": [
      "Memoria",
      "Espejos",
      "Tiempo"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-20",
    "cat": "ficcion",
    "title": "La geometría del olvido",
    "author": "Emilio Vargas",
    "genre": "Suspenso Existencial",
    "cover": "♟️",
    "badge": "",
    "badgeText": "",
    "pages": 331,
    "readTime": "7h 55min",
    "chapters": 5,
    "tagline": "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Olvido",
      "Identidad",
      "Memoria"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-21",
    "cat": "ficcion",
    "title": "El manuscrito de Mombasa",
    "author": "Clara Domínguez",
    "genre": "Ficción Metafísica",
    "cover": "♟️",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 263,
    "readTime": "6h 16min",
    "chapters": 5,
    "tagline": "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Memoria",
      "Olvido",
      "Identidad"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-22",
    "cat": "ficcion",
    "title": "El invierno en los ojos de Virginia",
    "author": "Humberto Eco",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 290,
    "readTime": "6h 57min",
    "chapters": 5,
    "tagline": "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Olvido",
      "Tiempo",
      "Memoria"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-23",
    "cat": "ficcion",
    "title": "La metamorfosis del tiempo",
    "author": "Hugo Silva",
    "genre": "Ficción Metafísica",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 280,
    "readTime": "6h 42min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "La historia de un coleccionista de espejos cóncavos en la Praga de entreguerras que jura haber contemplado el rostro del infinito, desatando una conspiración silenciosa de relojeros y filósofos herejes.",
    "themes": [
      "Olvido",
      "Laberintos",
      "Espejos"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-24",
    "cat": "ficcion",
    "title": "El sastre de las sombras",
    "author": "Hugo Silva",
    "genre": "Suspenso Existencial",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 214,
    "readTime": "5h 6min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Tiempo",
      "Espejos",
      "Memoria"
    ],
    "openingQuote": "«Un espejo no es más que una puerta que se cansó de reflejar la mentira del día.»"
  },
  {
    "id": "seeded-ficcion-25",
    "cat": "ficcion",
    "title": "La conspiración de los relojes",
    "author": "Hugo Silva",
    "genre": "Fantasía Nocturna",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 192,
    "readTime": "4h 36min",
    "chapters": 5,
    "tagline": "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Olvido",
      "Memoria",
      "Identidad"
    ],
    "openingQuote": "«Hubo un día en que el mar olvidó su oleaje, y en ese instante eterno nació la arena.»"
  },
  {
    "id": "seeded-ficcion-26",
    "cat": "ficcion",
    "title": "El traductor de la niebla",
    "author": "Ernesto Hemingway",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_umbral.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 325,
    "readTime": "7h 46min",
    "chapters": 5,
    "tagline": "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Memoria",
      "Identidad",
      "Espejos"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-27",
    "cat": "ficcion",
    "title": "La emperatriz de los laberintos",
    "author": "Marcos Delgado",
    "genre": "Suspenso Existencial",
    "cover": "assets/cover_memoria.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 346,
    "readTime": "8h 15min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
    "themes": [
      "Memoria",
      "Espejos",
      "Identidad"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-28",
    "cat": "ficcion",
    "title": "El puente de los suspiros sordos",
    "author": "Simone de Vois",
    "genre": "Ficción Literaria",
    "cover": "assets/cover_contemplacion.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 216,
    "readTime": "5h 9min",
    "chapters": 5,
    "tagline": "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Memoria",
      "Laberintos",
      "Espejos"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-29",
    "cat": "ficcion",
    "title": "El archivero del viento",
    "author": "Marcos Delgado",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 358,
    "readTime": "8h 33min",
    "chapters": 5,
    "tagline": "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río.",
    "synopsis": "La historia de un coleccionista de espejos cóncavos en la Praga de entreguerras que jura haber contemplado el rostro del infinito, desatando una conspiración silenciosa de relojeros y filósofos herejes.",
    "themes": [
      "Memoria",
      "Espejos",
      "Tiempo"
    ],
    "openingQuote": "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»"
  },
  {
    "id": "seeded-ficcion-30",
    "cat": "ficcion",
    "title": "La anatomía de un instante eterno",
    "author": "Francisco Kafka",
    "genre": "Suspenso Existencial",
    "cover": "🥀",
    "badge": "",
    "badgeText": "",
    "pages": 204,
    "readTime": "4h 54min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Laberintos",
      "Memoria",
      "Identidad"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-31",
    "cat": "ficcion",
    "title": "El pescador de estrellas muertas",
    "author": "Arturo Borges",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 290,
    "readTime": "6h 57min",
    "chapters": 5,
    "tagline": "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Tiempo",
      "Memoria",
      "Espejos"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-32",
    "cat": "ficcion",
    "title": "La balada del gato de medianoche",
    "author": "Haru Murakami",
    "genre": "Ficción Metafísica",
    "cover": "assets/cover_umbral.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 169,
    "readTime": "4h 1min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Olvido",
      "Identidad",
      "Laberintos"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-33",
    "cat": "ficcion",
    "title": "El club de los insomnes de Tokio",
    "author": "Julio Cortázar-Ríos",
    "genre": "Ficción Metafísica",
    "cover": "assets/cover_umbral.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 332,
    "readTime": "7h 57min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Identidad",
      "Memoria",
      "Laberintos"
    ],
    "openingQuote": "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»"
  },
  {
    "id": "seeded-ficcion-34",
    "cat": "ficcion",
    "title": "Las huellas de la arena húmeda",
    "author": "Arturo Borges",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 322,
    "readTime": "7h 42min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Espejos",
      "Tiempo",
      "Olvido"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-35",
    "cat": "ficcion",
    "title": "El enigma del espejo roto",
    "author": "Clara Márquez",
    "genre": "Fantasía Nocturna",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 276,
    "readTime": "6h 36min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
    "themes": [
      "Memoria",
      "Olvido",
      "Identidad"
    ],
    "openingQuote": "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»"
  },
  {
    "id": "seeded-ficcion-36",
    "cat": "ficcion",
    "title": "La sombra del jaguar de obsidiana",
    "author": "José de Sousa",
    "genre": "Ficción Metafísica",
    "cover": "🌊",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 300,
    "readTime": "7h 9min",
    "chapters": 5,
    "tagline": "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Tiempo",
      "Olvido",
      "Laberintos"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-37",
    "cat": "ficcion",
    "title": "Los conspiradores del silencio",
    "author": "José de Sousa",
    "genre": "Ficción Literaria",
    "cover": "assets/cover_umbral.png",
    "badge": "",
    "badgeText": "",
    "pages": 368,
    "readTime": "8h 48min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Espejos",
      "Tiempo",
      "Olvido"
    ],
    "openingQuote": "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»"
  },
  {
    "id": "seeded-ficcion-38",
    "cat": "ficcion",
    "title": "La frontera transparente",
    "author": "Hugo Silva",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 341,
    "readTime": "8h 7min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
    "themes": [
      "Tiempo",
      "Identidad",
      "Olvido"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-39",
    "cat": "ficcion",
    "title": "El manuscrito de Praga",
    "author": "Clara Márquez",
    "genre": "Suspenso Existencial",
    "cover": "🕯️",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 322,
    "readTime": "7h 42min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Olvido",
      "Laberintos",
      "Espejos"
    ],
    "openingQuote": "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»"
  },
  {
    "id": "seeded-ficcion-40",
    "cat": "ficcion",
    "title": "El coleccionista de lluvia",
    "author": "Isabel Noriega",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_memoria.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 370,
    "readTime": "8h 51min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "Una pieza narrativa de alta costura que explora la disolución de la identidad, los límites de la palabra y la belleza melancólica de las fronteras donde el viento del sur borra las huellas de los vivos.",
    "themes": [
      "Olvido",
      "Tiempo",
      "Espejos"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-41",
    "cat": "ficcion",
    "title": "Los laberintos de la noche larga",
    "author": "Arturo Borges",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_umbral.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 226,
    "readTime": "5h 24min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Espejos",
      "Laberintos",
      "Identidad"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-42",
    "cat": "ficcion",
    "title": "El inventor de crepúsculos",
    "author": "Haru Murakami",
    "genre": "Fantasía Nocturna",
    "cover": "✒️",
    "badge": "",
    "badgeText": "",
    "pages": 268,
    "readTime": "6h 24min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
    "themes": [
      "Espejos",
      "Tiempo",
      "Olvido"
    ],
    "openingQuote": "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»"
  },
  {
    "id": "seeded-ficcion-43",
    "cat": "ficcion",
    "title": "La sonata del viento inmóvil",
    "author": "Emilio Vargas",
    "genre": "Fantasía Nocturna",
    "cover": "assets/cover_contemplacion.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 252,
    "readTime": "6h 0min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Memoria",
      "Tiempo",
      "Espejos"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-44",
    "cat": "ficcion",
    "title": "La biblioteca de Alejandría",
    "author": "José de Sousa",
    "genre": "Ficción Metafísica",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 167,
    "readTime": "3h 61min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "La historia de un coleccionista de espejos cóncavos en la Praga de entreguerras que jura haber contemplado el rostro del infinito, desatando una conspiración silenciosa de relojeros y filósofos herejes.",
    "themes": [
      "Tiempo",
      "Espejos",
      "Identidad"
    ],
    "openingQuote": "«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares sagrados.»"
  },
  {
    "id": "seeded-ficcion-45",
    "cat": "ficcion",
    "title": "El espejo cóncavo del Sena",
    "author": "Arturo Borges",
    "genre": "Ficción Metafísica",
    "cover": "🥀",
    "badge": "",
    "badgeText": "",
    "pages": 248,
    "readTime": "5h 57min",
    "chapters": 5,
    "tagline": "Los secretos del pasado persisten disueltos en el murmullo de los acueductos lejanos.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Tiempo",
      "Espejos",
      "Olvido"
    ],
    "openingQuote": "«No se trata de mirar hacia adelante, sino de pensar hacia abajo, donde duerme el silencio.»"
  },
  {
    "id": "seeded-ficcion-46",
    "cat": "ficcion",
    "title": "La conspiración del péndulo",
    "author": "Javier del Campo",
    "genre": "Suspenso Existencial",
    "cover": "assets/cover_memoria.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 371,
    "readTime": "8h 52min",
    "chapters": 5,
    "tagline": "Toda biblioteca contiene, en silencio, los libros que el mundo decidió olvidar.",
    "synopsis": "La historia de un coleccionista de espejos cóncavos en la Praga de entreguerras que jura haber contemplado el rostro del infinito, desatando una conspiración silenciosa de relojeros y filósofos herejes.",
    "themes": [
      "Memoria",
      "Olvido",
      "Identidad"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-47",
    "cat": "ficcion",
    "title": "El sastre de las memorias lejanas",
    "author": "Claudia Iriarte",
    "genre": "Realismo Mágico",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 169,
    "readTime": "4h 1min",
    "chapters": 5,
    "tagline": "El mapa que dibujamos no representa una provincia, sino los laberintos de la memoria.",
    "synopsis": "Una novela extraordinaria sobre el peso invisible de los recuerdos colectivos, la violencia silenciosa del olvido institucional y los laberintos urbanos que recorremos sin saber que ya fuimos olvidados en ellos.",
    "themes": [
      "Memoria",
      "Tiempo",
      "Espejos"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-48",
    "cat": "ficcion",
    "title": "El eco del violín apagado",
    "author": "José de Sousa",
    "genre": "Ficción Metafísica",
    "cover": "⏳",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 356,
    "readTime": "8h 30min",
    "chapters": 5,
    "tagline": "El tiempo es la sustancia de la que estamos hechos; un río que me arrebata, pero yo soy el río.",
    "synopsis": "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
    "themes": [
      "Memoria",
      "Laberintos",
      "Olvido"
    ],
    "openingQuote": "«El tiempo tiene memoria, y es lo único que no podemos purificar del todo.»"
  },
  {
    "id": "seeded-ficcion-49",
    "cat": "ficcion",
    "title": "Los cartógrafos del vacío",
    "author": "Humberto Eco",
    "genre": "Ficción Metafísica",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 191,
    "readTime": "4h 34min",
    "chapters": 5,
    "tagline": "Entre la vigilia y el sueño existe una habitación que no aparece en ningún mapa.",
    "synopsis": "Un relato satírico e hipnótico sobre un archivista que descubre una fisura en el tiempo de tres segundos durante la caída de las hojas en otoño, permitiéndole habitar los recuerdos no vividos de la ciudad.",
    "themes": [
      "Laberintos",
      "Espejos",
      "Identidad"
    ],
    "openingQuote": "«Un espejo no es más que una puerta que se cansó de reflejar la mentira del día.»"
  },
  {
    "id": "seeded-ensayo-50",
    "cat": "ensayo",
    "title": "El elogio de la lentitud",
    "author": "Haru Murakami",
    "genre": "Ensayo Filosófico",
    "cover": "assets/cover_memoria.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 229,
    "readTime": "5h 28min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Silencio",
      "Resistencia",
      "Cultura"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-51",
    "cat": "ensayo",
    "title": "La tiranía de la prisa",
    "author": "Virginia Silva",
    "genre": "Ensayo Filosófico",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 170,
    "readTime": "4h 3min",
    "chapters": 5,
    "tagline": "La gramática de nuestra melancolía revela las grietas invisibles de la modernidad.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Cultura",
      "Silencio",
      "Resistencia"
    ],
    "openingQuote": "«El silencio no es la ausencia de sonido, sino la presencia de una atención absoluta.»"
  },
  {
    "id": "seeded-ensayo-52",
    "cat": "ensayo",
    "title": "La estética del silencio contemporáneo",
    "author": "Alicia M. Gómez",
    "genre": "Ensayo Poético",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 253,
    "readTime": "6h 1min",
    "chapters": 5,
    "tagline": "La gramática de nuestra melancolía revela las grietas invisibles de la modernidad.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Resistencia",
      "Silencio",
      "Filosofía"
    ],
    "openingQuote": "«La prisa contemporánea no acelera el movimiento, simplemente mutila la mirada.»"
  },
  {
    "id": "seeded-ensayo-53",
    "cat": "ensayo",
    "title": "El peso invisible de la memoria",
    "author": "Ernesto Hemingway",
    "genre": "Estética Literaria",
    "cover": "🧭",
    "badge": "",
    "badgeText": "",
    "pages": 227,
    "readTime": "5h 25min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Filosofía",
      "Silencio",
      "Atención"
    ],
    "openingQuote": "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»"
  },
  {
    "id": "seeded-ensayo-54",
    "cat": "ensayo",
    "title": "La ética del lector distraído",
    "author": "Simone de Vois",
    "genre": "Estética Literaria",
    "cover": "assets/cover_contemplacion.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 336,
    "readTime": "8h 0min",
    "chapters": 5,
    "tagline": "La gramática de nuestra melancolía revela las grietas invisibles de la modernidad.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Filosofía",
      "Silencio",
      "Estética"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-55",
    "cat": "ensayo",
    "title": "La arqueología de las palabras",
    "author": "Alicia M. Gómez",
    "genre": "Ensayo Filosófico",
    "cover": "assets/cover_umbral.png",
    "badge": "",
    "badgeText": "",
    "pages": 248,
    "readTime": "5h 57min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Silencio",
      "Cultura",
      "Estética"
    ],
    "openingQuote": "«El silencio no es la ausencia de sonido, sino la presencia de una atención absoluta.»"
  },
  {
    "id": "seeded-ensayo-56",
    "cat": "ensayo",
    "title": "El laberinto de la verdad líquida",
    "author": "Roberto Belano",
    "genre": "Ensayo Filosófico",
    "cover": "assets/cover_umbral.png",
    "badge": "",
    "badgeText": "",
    "pages": 282,
    "readTime": "6h 45min",
    "chapters": 5,
    "tagline": "La palabra escrita no es un espejo de la realidad, sino un refugio contra su erosión.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Filosofía",
      "Silencio",
      "Cultura"
    ],
    "openingQuote": "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»"
  },
  {
    "id": "seeded-ensayo-57",
    "cat": "ensayo",
    "title": "La rebelión de la atención",
    "author": "Ernesto Hemingway",
    "genre": "Ensayo Filosófico",
    "cover": "🧭",
    "badge": "",
    "badgeText": "",
    "pages": 301,
    "readTime": "7h 10min",
    "chapters": 5,
    "tagline": "La contemplación no es una renuncia a la acción, sino la resistencia intelectual más profunda.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Filosofía",
      "Cultura",
      "Silencio"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-58",
    "cat": "ensayo",
    "title": "La contemplación como resistencia",
    "author": "Claudia Iriarte",
    "genre": "Ensayo Poético",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 281,
    "readTime": "6h 43min",
    "chapters": 5,
    "tagline": "La contemplación no es una renuncia a la acción, sino la resistencia intelectual más profunda.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Cultura",
      "Filosofía",
      "Atención"
    ],
    "openingQuote": "«El silencio no es la ausencia de sonido, sino la presencia de una atención absoluta.»"
  },
  {
    "id": "seeded-ensayo-59",
    "cat": "ensayo",
    "title": "El murmullo de las ruinas",
    "author": "Alejandra Pozzo",
    "genre": "Estética Literaria",
    "cover": "🥀",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 264,
    "readTime": "6h 18min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Resistencia",
      "Cultura",
      "Filosofía"
    ],
    "openingQuote": "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»"
  },
  {
    "id": "seeded-ensayo-60",
    "cat": "ensayo",
    "title": "La condición del creador solitario",
    "author": "Claudia Iriarte",
    "genre": "Ensayo Filosófico",
    "cover": "assets/cover_arquitecto.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 190,
    "readTime": "4h 33min",
    "chapters": 5,
    "tagline": "La contemplación no es una renuncia a la acción, sino la resistencia intelectual más profunda.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Filosofía",
      "Silencio",
      "Cultura"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-61",
    "cat": "ensayo",
    "title": "El arte de perder el tiempo",
    "author": "Emilio Vargas",
    "genre": "Ensayo Poético",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 245,
    "readTime": "5h 52min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una exploración filosófica de la estética del vacío y la deriva intelectual en las grandes urbes contemporáneas, cuestionando cómo consumimos ideas y cómo el ruido digital nos ha distanciado de la experiencia de pensar.",
    "themes": [
      "Cultura",
      "Silencio",
      "Resistencia"
    ],
    "openingQuote": "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»"
  },
  {
    "id": "seeded-ensayo-62",
    "cat": "ensayo",
    "title": "La deriva de las ideas",
    "author": "Arturo Borges",
    "genre": "Estética Literaria",
    "cover": "assets/cover_memoria.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 259,
    "readTime": "6h 10min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Cultura",
      "Atención",
      "Estética"
    ],
    "openingQuote": "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»"
  },
  {
    "id": "seeded-ensayo-63",
    "cat": "ensayo",
    "title": "El espejo de la cultura",
    "author": "Clara Domínguez",
    "genre": "Ensayo Filosófico",
    "cover": "🥀",
    "badge": "",
    "badgeText": "",
    "pages": 311,
    "readTime": "7h 25min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una exploración filosófica de la estética del vacío y la deriva intelectual en las grandes urbes contemporáneas, cuestionando cómo consumimos ideas y cómo el ruido digital nos ha distanciado de la experiencia de pensar.",
    "themes": [
      "Resistencia",
      "Atención",
      "Filosofía"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-64",
    "cat": "ensayo",
    "title": "La gramática de la melancolía",
    "author": "Javier del Campo",
    "genre": "Ensayo Filosófico",
    "cover": "📖",
    "badge": "",
    "badgeText": "",
    "pages": 367,
    "readTime": "8h 46min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Silencio",
      "Resistencia",
      "Cultura"
    ],
    "openingQuote": "«El silencio no es la ausencia de sonido, sino la presencia de una atención absoluta.»"
  },
  {
    "id": "seeded-ensayo-65",
    "cat": "ensayo",
    "title": "El horizonte de lo indecible",
    "author": "Haru Murakami",
    "genre": "Ensayo Filosófico",
    "cover": "✒️",
    "badge": "",
    "badgeText": "",
    "pages": 221,
    "readTime": "5h 16min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Atención",
      "Resistencia",
      "Estética"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-66",
    "cat": "ensayo",
    "title": "La mirada suspendida",
    "author": "Humberto Eco",
    "genre": "Estética Literaria",
    "cover": "assets/cover_umbral.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 245,
    "readTime": "5h 52min",
    "chapters": 5,
    "tagline": "La palabra escrita no es un espejo de la realidad, sino un refugio contra su erosión.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Filosofía",
      "Silencio",
      "Cultura"
    ],
    "openingQuote": "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»"
  },
  {
    "id": "seeded-ensayo-67",
    "cat": "ensayo",
    "title": "El eco de los pasos perdidos",
    "author": "Isabel Noriega",
    "genre": "Ensayo Filosófico",
    "cover": "assets/cover_umbral.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 355,
    "readTime": "8h 28min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Atención",
      "Resistencia",
      "Silencio"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-68",
    "cat": "ensayo",
    "title": "La frontera de la vigilia",
    "author": "Isabel Noriega",
    "genre": "Crítica Cultural",
    "cover": "assets/cover_arquitecto.png",
    "badge": "",
    "badgeText": "",
    "pages": 280,
    "readTime": "6h 42min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Filosofía",
      "Atención",
      "Estética"
    ],
    "openingQuote": "«La prisa contemporánea no acelera el movimiento, simplemente mutila la mirada.»"
  },
  {
    "id": "seeded-ensayo-69",
    "cat": "ensayo",
    "title": "La construcción del vacío",
    "author": "Francisco Kafka",
    "genre": "Ensayo Poético",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 269,
    "readTime": "6h 25min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Filosofía",
      "Silencio",
      "Resistencia"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-70",
    "cat": "ensayo",
    "title": "La estética de la renuncia",
    "author": "Humberto Eco",
    "genre": "Estética Literaria",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 344,
    "readTime": "8h 12min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Filosofía",
      "Atención",
      "Cultura"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-71",
    "cat": "ensayo",
    "title": "El laberinto de los signos mudos",
    "author": "Alejandra Pozzo",
    "genre": "Ensayo Filosófico",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 185,
    "readTime": "4h 25min",
    "chapters": 5,
    "tagline": "La palabra escrita no es un espejo de la realidad, sino un refugio contra su erosión.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Atención",
      "Cultura",
      "Silencio"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-72",
    "cat": "ensayo",
    "title": "La paradoja del tiempo suspendido",
    "author": "José de Sousa",
    "genre": "Crítica Cultural",
    "cover": "assets/cover_arquitecto.png",
    "badge": "",
    "badgeText": "",
    "pages": 227,
    "readTime": "5h 25min",
    "chapters": 5,
    "tagline": "La palabra escrita no es un espejo de la realidad, sino un refugio contra su erosión.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Cultura",
      "Silencio",
      "Atención"
    ],
    "openingQuote": "«La arqueología del lenguaje demuestra que cada palabra es una ruina que aún respira.»"
  },
  {
    "id": "seeded-ensayo-73",
    "cat": "ensayo",
    "title": "La ética del fragmento poético",
    "author": "Clara Domínguez",
    "genre": "Estética Literaria",
    "cover": "assets/cover_arquitecto.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 311,
    "readTime": "7h 25min",
    "chapters": 5,
    "tagline": "En un mundo que corre a toda prisa, aprender a detenerse es el único acto de soberanía.",
    "synopsis": "Una meditación honda e indispensable sobre la atención como forma de resistencia cultural frente a la estimulación constante. A través de reflexiones poéticas sobre el silencio y la lentitud, construye un argumento que se acumula como la humedad antes de la tormenta.",
    "themes": [
      "Filosofía",
      "Cultura",
      "Silencio"
    ],
    "openingQuote": "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»"
  },
  {
    "id": "seeded-ensayo-74",
    "cat": "ensayo",
    "title": "El murmullo de los espejos rotos",
    "author": "Francisco Kafka",
    "genre": "Ensayo Filosófico",
    "cover": "assets/cover_arquitecto.png",
    "badge": "",
    "badgeText": "",
    "pages": 325,
    "readTime": "7h 46min",
    "chapters": 5,
    "tagline": "La gramática de nuestra melancolía revela las grietas invisibles de la modernidad.",
    "synopsis": "Una arqueología de las palabras olvidadas y los conceptos extintos que alguna vez definieron la belleza, trazando una línea directa entre la gramática medieval y la soledad del lector contemporáneo.",
    "themes": [
      "Resistencia",
      "Estética",
      "Cultura"
    ],
    "openingQuote": "«Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo.»"
  },
  {
    "id": "seeded-biografia-75",
    "cat": "biografia",
    "title": "La vida breve de las palabras",
    "author": "Alejandra Pozzo",
    "genre": "Biografía Literaria",
    "cover": "assets/cover_arquitecto.png",
    "badge": "",
    "badgeText": "",
    "pages": 222,
    "readTime": "5h 18min",
    "chapters": 5,
    "tagline": "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz.",
    "synopsis": "Un recorrido biográfico y epistolar de una sensibilidad abrumadora que ilumina el exilio voluntario de una creadora solitaria en el Brighton de entreguerras, rescatando sus diarios de convalecencia y sus diálogos silenciados con el oleaje.",
    "themes": [
      "Brighton",
      "Vidas íntimas",
      "Diarios"
    ],
    "openingQuote": "«El rumor de los días idos es la única música que no cansa al alma cansada.»"
  },
  {
    "id": "seeded-biografia-76",
    "cat": "biografia",
    "title": "Diarios de la sombra y la luz",
    "author": "Marcos Delgado",
    "genre": "Biografía Literaria",
    "cover": "♟️",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 203,
    "readTime": "4h 52min",
    "chapters": 5,
    "tagline": "Toda vida es una serie de cartas enviadas a destinatarios que ya han partido.",
    "synopsis": "La bitácora reconstruida de un náufrago urbano que recorrió las calles de París y Buenos Aires coleccionando crepúsculos y palabras mudas, ofreciendo un testimonio único sobre la amistad, la melancolía y el arte de persistir.",
    "themes": [
      "Exilio",
      "París",
      "Brighton"
    ],
    "openingQuote": "«Los pasos sobre el hielo delgado son los únicos que dejan una huella imborrable.»"
  },
  {
    "id": "seeded-biografia-77",
    "cat": "biografia",
    "title": "El exilio voluntario del alma",
    "author": "Roberto Belano",
    "genre": "Memorias",
    "cover": "assets/cover_arquitecto.png",
    "badge": "",
    "badgeText": "",
    "pages": 237,
    "readTime": "5h 40min",
    "chapters": 5,
    "tagline": "Toda vida es una serie de cartas enviadas a destinatarios que ya han partido.",
    "synopsis": "Un recorrido biográfico y epistolar de una sensibilidad abrumadora que ilumina el exilio voluntario de una creadora solitaria en el Brighton de entreguerras, rescatando sus diarios de convalecencia y sus diálogos silenciados con el oleaje.",
    "themes": [
      "París",
      "Diarios",
      "Exilio"
    ],
    "openingQuote": "«No escribo para ser recordada, sino para comprender por qué el agua siempre busca el mar.»"
  },
  {
    "id": "seeded-biografia-78",
    "cat": "biografia",
    "title": "La viajera solitaria del Sena",
    "author": "Arturo Borges",
    "genre": "Correspondencia",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 269,
    "readTime": "6h 25min",
    "chapters": 5,
    "tagline": "Toda vida es una serie de cartas enviadas a destinatarios que ya han partido.",
    "synopsis": "Una semblanza poética sobre los años de juventud de una de las voces líricas más desgarradoras de la literatura hispana, analizando sus cuadernos íntimos y su tormentosa pero brillante relación con el lenguaje.",
    "themes": [
      "Brighton",
      "Diarios",
      "Vidas íntimas"
    ],
    "openingQuote": "«No escribo para ser recordada, sino para comprender por qué el agua siempre busca el mar.»"
  },
  {
    "id": "seeded-biografia-79",
    "cat": "biografia",
    "title": "Las cartas que nunca envié",
    "author": "Francisco Kafka",
    "genre": "Biografía Literaria",
    "cover": "assets/cover_contemplacion.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 305,
    "readTime": "7h 16min",
    "chapters": 5,
    "tagline": "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz.",
    "synopsis": "Un recorrido biográfico y epistolar de una sensibilidad abrumadora que ilumina el exilio voluntario de una creadora solitaria en el Brighton de entreguerras, rescatando sus diarios de convalecencia y sus diálogos silenciados con el oleaje.",
    "themes": [
      "Brighton",
      "Diarios",
      "Vidas íntimas"
    ],
    "openingQuote": "«El rumor de los días idos es la única música que no cansa al alma cansada.»"
  },
  {
    "id": "seeded-biografia-80",
    "cat": "biografia",
    "title": "El rumor de los días idos",
    "author": "Virginia Silva",
    "genre": "Memorias",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 219,
    "readTime": "5h 13min",
    "chapters": 5,
    "tagline": "Toda vida es una serie de cartas enviadas a destinatarios que ya han partido.",
    "synopsis": "Un recorrido biográfico y epistolar de una sensibilidad abrumadora que ilumina el exilio voluntario de una creadora solitaria en el Brighton de entreguerras, rescatando sus diarios de convalecencia y sus diálogos silenciados con el oleaje.",
    "themes": [
      "Correspondencia",
      "Brighton",
      "Exilio"
    ],
    "openingQuote": "«El rumor de los días idos es la única música que no cansa al alma cansada.»"
  },
  {
    "id": "seeded-biografia-81",
    "cat": "biografia",
    "title": "Retrato de un invierno en Brighton",
    "author": "Arturo Borges",
    "genre": "Memorias",
    "cover": "assets/cover_contemplacion.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 261,
    "readTime": "6h 13min",
    "chapters": 5,
    "tagline": "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz.",
    "synopsis": "Una semblanza poética sobre los años de juventud de una de las voces líricas más desgarradoras de la literatura hispana, analizando sus cuadernos íntimos y su tormentosa pero brillante relación con el lenguaje.",
    "themes": [
      "Vidas íntimas",
      "Brighton",
      "Correspondencia"
    ],
    "openingQuote": "«El rumor de los días idos es la única música que no cansa al alma cansada.»"
  },
  {
    "id": "seeded-biografia-82",
    "cat": "biografia",
    "title": "La infancia de los espejos",
    "author": "Arturo Borges",
    "genre": "Memorias",
    "cover": "assets/cover_umbral.png",
    "badge": "",
    "badgeText": "",
    "pages": 353,
    "readTime": "8h 25min",
    "chapters": 5,
    "tagline": "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz.",
    "synopsis": "Un recorrido biográfico y epistolar de una sensibilidad abrumadora que ilumina el exilio voluntario de una creadora solitaria en el Brighton de entreguerras, rescatando sus diarios de convalecencia y sus diálogos silenciados con el oleaje.",
    "themes": [
      "Exilio",
      "Diarios",
      "Brighton"
    ],
    "openingQuote": "«El rumor de los días idos es la única música que no cansa al alma cansada.»"
  },
  {
    "id": "seeded-biografia-83",
    "cat": "biografia",
    "title": "La memoria habitada",
    "author": "Roberto Belano",
    "genre": "Correspondencia",
    "cover": "🥀",
    "badge": "",
    "badgeText": "",
    "pages": 320,
    "readTime": "7h 39min",
    "chapters": 5,
    "tagline": "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz.",
    "synopsis": "Una semblanza poética sobre los años de juventud de una de las voces líricas más desgarradoras de la literatura hispana, analizando sus cuadernos íntimos y su tormentosa pero brillante relación con el lenguaje.",
    "themes": [
      "Diarios",
      "Exilio",
      "Vidas íntimas"
    ],
    "openingQuote": "«Los pasos sobre el hielo delgado son los únicos que dejan una huella imborrable.»"
  },
  {
    "id": "seeded-biografia-84",
    "cat": "biografia",
    "title": "El rastro de una voz herida",
    "author": "Haru Murakami",
    "genre": "Diarios de Viaje",
    "cover": "🌙",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 291,
    "readTime": "6h 58min",
    "chapters": 5,
    "tagline": "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz.",
    "synopsis": "Una semblanza poética sobre los años de juventud de una de las voces líricas más desgarradoras de la literatura hispana, analizando sus cuadernos íntimos y su tormentosa pero brillante relación con el lenguaje.",
    "themes": [
      "Vidas íntimas",
      "Diarios",
      "Exilio"
    ],
    "openingQuote": "«El rumor de los días idos es la única música que no cansa al alma cansada.»"
  },
  {
    "id": "seeded-biografia-85",
    "cat": "biografia",
    "title": "La bitácora del náufrago urbano",
    "author": "Alejandra Pozzo",
    "genre": "Correspondencia",
    "cover": "assets/cover_arquitecto.png",
    "badge": "",
    "badgeText": "",
    "pages": 250,
    "readTime": "5h 60min",
    "chapters": 5,
    "tagline": "Toda vida es una serie de cartas enviadas a destinatarios que ya han partido.",
    "synopsis": "Un recorrido biográfico y epistolar de una sensibilidad abrumadora que ilumina el exilio voluntario de una creadora solitaria en el Brighton de entreguerras, rescatando sus diarios de convalecencia y sus diálogos silenciados con el oleaje.",
    "themes": [
      "Brighton",
      "Correspondencia",
      "Vidas íntimas"
    ],
    "openingQuote": "«Los pasos sobre el hielo delgado son los únicos que dejan una huella imborrable.»"
  },
  {
    "id": "seeded-biografia-86",
    "cat": "biografia",
    "title": "El diario de la convalecencia",
    "author": "Virginia Silva",
    "genre": "Biografía Literaria",
    "cover": "🏺",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 248,
    "readTime": "5h 57min",
    "chapters": 5,
    "tagline": "Toda vida es una serie de cartas enviadas a destinatarios que ya han partido.",
    "synopsis": "Una semblanza poética sobre los años de juventud de una de las voces líricas más desgarradoras de la literatura hispana, analizando sus cuadernos íntimos y su tormentosa pero brillante relación con el lenguaje.",
    "themes": [
      "Diarios",
      "Brighton",
      "Correspondencia"
    ],
    "openingQuote": "«Los pasos sobre el hielo delgado son los únicos que dejan una huella imborrable.»"
  },
  {
    "id": "seeded-biografia-87",
    "cat": "biografia",
    "title": "La sombra del cerezo en flor",
    "author": "Haru Murakami",
    "genre": "Biografía Literaria",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 174,
    "readTime": "4h 9min",
    "chapters": 5,
    "tagline": "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz.",
    "synopsis": "Un recorrido biográfico y epistolar de una sensibilidad abrumadora que ilumina el exilio voluntario de una creadora solitaria en el Brighton de entreguerras, rescatando sus diarios de convalecencia y sus diálogos silenciados con el oleaje.",
    "themes": [
      "Brighton",
      "Correspondencia",
      "Exilio"
    ],
    "openingQuote": "«Los pasos sobre el hielo delgado son los únicos que dejan una huella imborrable.»"
  },
  {
    "id": "seeded-biografia-88",
    "cat": "biografia",
    "title": "El viento en las páginas sueltas",
    "author": "José de Sousa",
    "genre": "Correspondencia",
    "cover": "🧭",
    "badge": "",
    "badgeText": "",
    "pages": 271,
    "readTime": "6h 28min",
    "chapters": 5,
    "tagline": "El exilio no es la pérdida de una geografía, sino la dolorosa ganancia de una memoria.",
    "synopsis": "Una semblanza poética sobre los años de juventud de una de las voces líricas más desgarradoras de la literatura hispana, analizando sus cuadernos íntimos y su tormentosa pero brillante relación con el lenguaje.",
    "themes": [
      "Diarios",
      "Vidas íntimas",
      "Exilio"
    ],
    "openingQuote": "«El rumor de los días idos es la única música que no cansa al alma cansada.»"
  },
  {
    "id": "seeded-biografia-89",
    "cat": "biografia",
    "title": "Los pasos sobre el hielo delgado",
    "author": "Javier del Campo",
    "genre": "Correspondencia",
    "cover": "⏳",
    "badge": "",
    "badgeText": "",
    "pages": 283,
    "readTime": "6h 46min",
    "chapters": 5,
    "tagline": "Retrato íntimo de una escritora que hizo del invierno su estación de máxima luz.",
    "synopsis": "Una semblanza poética sobre los años de juventud de una de las voces líricas más desgarradoras de la literatura hispana, analizando sus cuadernos íntimos y su tormentosa pero brillante relación con el lenguaje.",
    "themes": [
      "Correspondencia",
      "París",
      "Vidas íntimas"
    ],
    "openingQuote": "«Los pasos sobre el hielo delgado son los únicos que dejan una huella imborrable.»"
  },
  {
    "id": "seeded-tecnica-90",
    "cat": "tecnica",
    "title": "El arquitecto de sombras y luces",
    "author": "Arturo Borges",
    "genre": "Técnica Narrativa",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 275,
    "readTime": "6h 34min",
    "chapters": 5,
    "tagline": "La alquimia del adjetivo preciso no decora la frase, la ancla al suelo de la verdad.",
    "synopsis": "Un análisis profundo del ritmo, la carpintería del suspenso existencial y la respiración de la prosa, estructurado como una partitura teórica indispensable para escritores en formación y lectores exigentes.",
    "themes": [
      "Estilo",
      "Elipsis",
      "Suspenso"
    ],
    "openingQuote": "«La elipsis no es una omisión perezosa, sino el motor que hace respirar a la novela.»"
  },
  {
    "id": "seeded-tecnica-91",
    "cat": "tecnica",
    "title": "La carpintería del suspenso",
    "author": "Haru Murakami",
    "genre": "Técnica Narrativa",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 333,
    "readTime": "7h 58min",
    "chapters": 5,
    "tagline": "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
    "synopsis": "Un análisis profundo del ritmo, la carpintería del suspenso existencial y la respiración de la prosa, estructurado como una partitura teórica indispensable para escritores en formación y lectores exigentes.",
    "themes": [
      "Elipsis",
      "Estilo",
      "Taller literario"
    ],
    "openingQuote": "«La frase perfecta tiene el peso exacto de una piedra húmeda bajo la lluvia nocturna.»"
  },
  {
    "id": "seeded-tecnica-92",
    "cat": "tecnica",
    "title": "La respiración de la frase",
    "author": "Marcos Delgado",
    "genre": "Técnica Narrativa",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 216,
    "readTime": "5h 9min",
    "chapters": 5,
    "tagline": "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
    "synopsis": "Un cuaderno de taller que reflexiona sobre la gramática de la atención y la alquimia verbal, enseñando a construir habitaciones literarias que el lector recordará con la nitidez de una casa de la infancia.",
    "themes": [
      "Estilo",
      "Arquitectura",
      "Taller literario"
    ],
    "openingQuote": "«Toda gran historia tiene una sombra invisible. Tu trabajo es hacer que el lector la siente.»"
  },
  {
    "id": "seeded-tecnica-93",
    "cat": "tecnica",
    "title": "La física del espacio ficcional",
    "author": "Ernesto Hemingway",
    "genre": "Manual de Estilo",
    "cover": "assets/cover_memoria.png",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 369,
    "readTime": "8h 49min",
    "chapters": 5,
    "tagline": "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
    "synopsis": "Un cuaderno de taller que reflexiona sobre la gramática de la atención y la alquimia verbal, enseñando a construir habitaciones literarias que el lector recordará con la nitidez de una casa de la infancia.",
    "themes": [
      "Arquitectura",
      "Elipsis",
      "Escritura"
    ],
    "openingQuote": "«Toda gran historia tiene una sombra invisible. Tu trabajo es hacer que el lector la siente.»"
  },
  {
    "id": "seeded-tecnica-94",
    "cat": "tecnica",
    "title": "El ritmo de las palabras mudas",
    "author": "Clara Márquez",
    "genre": "Técnica Narrativa",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 182,
    "readTime": "4h 21min",
    "chapters": 5,
    "tagline": "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
    "synopsis": "Un análisis profundo del ritmo, la carpintería del suspenso existencial y la respiración de la prosa, estructurado como una partitura teórica indispensable para escritores en formación y lectores exigentes.",
    "themes": [
      "Elipsis",
      "Arquitectura",
      "Escritura"
    ],
    "openingQuote": "«La frase perfecta tiene el peso exacto de una piedra húmeda bajo la lluvia nocturna.»"
  },
  {
    "id": "seeded-tecnica-95",
    "cat": "tecnica",
    "title": "La ingeniería del personaje ausente",
    "author": "Hugo Silva",
    "genre": "Técnica Narrativa",
    "cover": "✒️",
    "badge": "",
    "badgeText": "",
    "pages": 317,
    "readTime": "7h 34min",
    "chapters": 5,
    "tagline": "En la arquitectura de una gran novela, el silencio ocupa más espacio que la voz.",
    "synopsis": "Un cuaderno de taller que reflexiona sobre la gramática de la atención y la alquimia verbal, enseñando a construir habitaciones literarias que el lector recordará con la nitidez de una casa de la infancia.",
    "themes": [
      "Arquitectura",
      "Escritura",
      "Elipsis"
    ],
    "openingQuote": "«La frase perfecta tiene el peso exacto de una piedra húmeda bajo la lluvia nocturna.»"
  },
  {
    "id": "seeded-tecnica-96",
    "cat": "tecnica",
    "title": "El arte de la elipsis",
    "author": "Arturo Borges",
    "genre": "Crítica Teórica",
    "cover": "🔮",
    "badge": "",
    "badgeText": "",
    "pages": 216,
    "readTime": "5h 9min",
    "chapters": 5,
    "tagline": "La alquimia del adjetivo preciso no decora la frase, la ancla al suelo de la verdad.",
    "synopsis": "Un análisis profundo del ritmo, la carpintería del suspenso existencial y la respiración de la prosa, estructurado como una partitura teórica indispensable para escritores en formación y lectores exigentes.",
    "themes": [
      "Elipsis",
      "Estilo",
      "Taller literario"
    ],
    "openingQuote": "«La elipsis no es una omisión perezosa, sino el motor que hace respirar a la novela.»"
  },
  {
    "id": "seeded-tecnica-97",
    "cat": "tecnica",
    "title": "La partitura del diálogo implícito",
    "author": "Alejandra Pozzo",
    "genre": "Técnica Narrativa",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 245,
    "readTime": "5h 52min",
    "chapters": 5,
    "tagline": "La alquimia del adjetivo preciso no decora la frase, la ancla al suelo de la verdad.",
    "synopsis": "Un manual de estilo e ingeniería literaria de una lucidez excepcional, donde se desvelan los mecanismos ocultos de la tensión narrativa, el uso arquitectónico de la luz en las escenas y el diseño de diálogos implícitos donde lo no dicho es lo que verdaderamente importa.",
    "themes": [
      "Estilo",
      "Elipsis",
      "Taller literario"
    ],
    "openingQuote": "«Toda gran historia tiene una sombra invisible. Tu trabajo es hacer que el lector la siente.»"
  },
  {
    "id": "seeded-tecnica-98",
    "cat": "tecnica",
    "title": "La alquimia del adjetivo preciso",
    "author": "Virginia Silva",
    "genre": "Crítica Teórica",
    "cover": "assets/cover_contemplacion.png",
    "badge": "",
    "badgeText": "",
    "pages": 379,
    "readTime": "9h 1min",
    "chapters": 5,
    "tagline": "En la arquitectura de una gran novela, el silencio ocupa más espacio que la voz.",
    "synopsis": "Un manual de estilo e ingeniería literaria de una lucidez excepcional, donde se desvelan los mecanismos ocultos de la tensión narrativa, el uso arquitectónico de la luz en las escenas y el diseño de diálogos implícitos donde lo no dicho es lo que verdaderamente importa.",
    "themes": [
      "Escritura",
      "Arquitectura",
      "Taller literario"
    ],
    "openingQuote": "«La frase perfecta tiene el peso exacto de una piedra húmeda bajo la lluvia nocturna.»"
  },
  {
    "id": "seeded-tecnica-99",
    "cat": "tecnica",
    "title": "La estructura invisible de la novela",
    "author": "Isabel Noriega",
    "genre": "Crítica Teórica",
    "cover": "assets/cover_contemplacion.png",
    "badge": "new",
    "badgeText": "Nuevo",
    "pages": 351,
    "readTime": "8h 22min",
    "chapters": 5,
    "tagline": "La alquimia del adjetivo preciso no decora la frase, la ancla al suelo de la verdad.",
    "synopsis": "Un cuaderno de taller que reflexiona sobre la gramática de la atención y la alquimia verbal, enseñando a construir habitaciones literarias que el lector recordará con la nitidez de una casa de la infancia.",
    "themes": [
      "Escritura",
      "Arquitectura",
      "Suspenso"
    ],
    "openingQuote": "«La elipsis no es una omisión perezosa, sino el motor que hace respirar a la novela.»"
  },
  {
    "id": "seeded-tecnica-100",
    "cat": "tecnica",
    "title": "La carpintería del final perfecto",
    "author": "Julio Cortázar-Ríos",
    "genre": "Técnica Narrativa",
    "cover": "🌙",
    "badge": "",
    "badgeText": "",
    "pages": 329,
    "readTime": "7h 52min",
    "chapters": 5,
    "tagline": "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
    "synopsis": "Un manual de estilo e ingeniería literaria de una lucidez excepcional, donde se desvelan los mecanismos ocultos de la tensión narrativa, el uso arquitectónico de la luz en las escenas y el diseño de diálogos implícitos donde lo no dicho es lo que verdaderamente importa.",
    "themes": [
      "Escritura",
      "Estilo",
      "Arquitectura"
    ],
    "openingQuote": "«La frase perfecta tiene el peso exacto de una piedra húmeda bajo la lluvia nocturna.»"
  },
  {
    "id": "seeded-tecnica-101",
    "cat": "tecnica",
    "title": "El arte del subtexto poético",
    "author": "Arturo Borges",
    "genre": "Técnica Narrativa",
    "cover": "✒️",
    "badge": "",
    "badgeText": "",
    "pages": 200,
    "readTime": "4h 48min",
    "chapters": 5,
    "tagline": "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
    "synopsis": "Un análisis profundo del ritmo, la carpintería del suspenso existencial y la respiración de la prosa, estructurado como una partitura teórica indispensable para escritores en formación y lectores exigentes.",
    "themes": [
      "Escritura",
      "Estilo",
      "Taller literario"
    ],
    "openingQuote": "«La frase perfecta tiene el peso exacto de una piedra húmeda bajo la lluvia nocturna.»"
  },
  {
    "id": "seeded-tecnica-102",
    "cat": "tecnica",
    "title": "La ingeniería del ritmo verbal",
    "author": "Roberto Belano",
    "genre": "Manual de Estilo",
    "cover": "🗝️",
    "badge": "excl",
    "badgeText": "Exclusivo",
    "pages": 215,
    "readTime": "5h 7min",
    "chapters": 5,
    "tagline": "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
    "synopsis": "Un manual de estilo e ingeniería literaria de una lucidez excepcional, donde se desvelan los mecanismos ocultos de la tensión narrativa, el uso arquitectónico de la luz en las escenas y el diseño de diálogos implícitos donde lo no dicho es lo que verdaderamente importa.",
    "themes": [
      "Estilo",
      "Elipsis",
      "Arquitectura"
    ],
    "openingQuote": "«Toda gran historia tiene una sombra invisible. Tu trabajo es hacer que el lector la siente.»"
  },
  {
    "id": "seeded-tecnica-103",
    "cat": "tecnica",
    "title": "La física del diálogo implícito",
    "author": "Claudia Iriarte",
    "genre": "Manual de Estilo",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 278,
    "readTime": "6h 39min",
    "chapters": 5,
    "tagline": "En la arquitectura de una gran novela, el silencio ocupa más espacio que la voz.",
    "synopsis": "Un manual de estilo e ingeniería literaria de una lucidez excepcional, donde se desvelan los mecanismos ocultos de la tensión narrativa, el uso arquitectónico de la luz en las escenas y el diseño de diálogos implícitos donde lo no dicho es lo que verdaderamente importa.",
    "themes": [
      "Escritura",
      "Arquitectura",
      "Suspenso"
    ],
    "openingQuote": "«Toda gran historia tiene una sombra invisible. Tu trabajo es hacer que el lector la siente.»"
  },
  {
    "id": "seeded-tecnica-104",
    "cat": "tecnica",
    "title": "La partitura de la novela moderna",
    "author": "Clara Márquez",
    "genre": "Crítica Teórica",
    "cover": "assets/cover_memoria.png",
    "badge": "",
    "badgeText": "",
    "pages": 245,
    "readTime": "5h 52min",
    "chapters": 5,
    "tagline": "El escritor no inventa personajes; erige muros y proyecta sombras para que el lector los habite.",
    "synopsis": "Un cuaderno de taller que reflexiona sobre la gramática de la atención y la alquimia verbal, enseñando a construir habitaciones literarias que el lector recordará con la nitidez de una casa de la infancia.",
    "themes": [
      "Suspenso",
      "Taller literario",
      "Estilo"
    ],
    "openingQuote": "«Toda gran historia tiene una sombra invisible. Tu trabajo es hacer que el lector la siente.»"
  }
];

const KIDS_FALLBACK_BOOKS = [
  {
    "id": "kid1",
    "cat": "kids",
    "title": "El Unicornio de Hielo",
    "author": "Alicia M. Gómez",
    "genre": "Infantil",
    "cover": "https://images.unsplash.com/photo-1553284965-83fd3e82fa52?auto=format&fit=crop&q=80&w=400",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 48,
    "readTime": "15min",
    "chapters": 3,
    "tagline": "Una mágica aventura en las montañas celestes para derretir la soledad.",
    "synopsis": "En la cima de la Montaña Azul vive un unicornio hecho enteramente de escarcha brillante. Aunque tiene el poder de congelar los riachuelos para jugar, se siente muy solo. Un día, una valiente niña llamada Sofía sube la montaña buscando una flor que nunca se marchita y le enseña que el calor más valioso es el del corazón y la amistad verdadera.",
    "themes": [
      "Amistad",
      "Naturaleza",
      "Sentimientos"
    ],
    "openingQuote": "«El hielo brilla con la luna, pero un amigo brilla en cualquier oscuridad.»",
    "ageBadge": "4-8 años",
    "collectionTitle": "COLECCIÓN FANTASÍA",
    "coverAccent": "#d5e3f0",
    "coverAccentMuted": "#a4c2db"
  },
  {
    "id": "kid2",
    "cat": "kids",
    "title": "El Secreto del Faro Austral",
    "author": "Javier del Campo",
    "genre": "Aventura",
    "cover": "https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?auto=format&fit=crop&q=80&w=400",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 112,
    "readTime": "45min",
    "chapters": 8,
    "tagline": "¿Y si las estrellas usaran faros para no perderse en la noche?",
    "synopsis": "Tomás pasa el verano en la isla del faro junto a su abuelo. Una noche de tormenta, descubre un engranaje dorado oculto bajo la escalera de caracol. Al hacerlo girar, el faro deja de proyectar luz blanca y empieza a emitir un haz de luz cósmico de colores que responde a las constelaciones. Tomás se embarca en un misterio estelar para descifrar el mensaje secreto de los navegantes del cielo.",
    "themes": [
      "Misterio",
      "Astronomía",
      "Familia"
    ],
    "openingQuote": "«Los faros no solo miran al mar, a veces le sonríen a las estrellas.»",
    "ageBadge": "9-12 años",
    "collectionTitle": "COLECCIÓN AVENTURA",
    "coverAccent": "#f6d365",
    "coverAccentMuted": "#fda085"
  },
  {
    "id": "kid3",
    "cat": "kids",
    "title": "El Relojero de los Sueños",
    "author": "Clara Domínguez",
    "genre": "Realismo Mágico",
    "cover": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&q=80&w=400",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 76,
    "readTime": "30min",
    "chapters": 5,
    "tagline": "El tiempo de soñar no se mide en minutos, sino en sonrisas.",
    "synopsis": "Don Manuel es el relojero del pueblo, pero en su trastienda no repara relojes comunes. Repara relojes de arena que guardan las horas felices de la gente. Cuando el pequeño Bruno pierde las ganas de jugar porque el tiempo pasa muy rápido, Don Manuel le enseña cómo saborear cada segundo de juego y cómo los recuerdos alegres detienen las manecillas del reloj de la vida.",
    "themes": [
      "Felicidad",
      "El tiempo",
      "Sabiduría"
    ],
    "openingQuote": "«Un minuto de risa dura más que una hora de aburrimiento.»",
    "ageBadge": "6-10 años",
    "collectionTitle": "REALISMO MÁGICO",
    "coverAccent": "#e0a96d",
    "coverAccentMuted": "#e0a96d"
  },
  {
    "id": "kid4",
    "cat": "kids",
    "title": "Las Huellas del Bosque Susurrante",
    "author": "Hugo Silva",
    "genre": "Misterio",
    "cover": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=400",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 94,
    "readTime": "35min",
    "chapters": 6,
    "tagline": "Los animales del bosque tienen una historia que contarte, si sabes escuchar.",
    "synopsis": "Marta y su perro Duque encuentran unas misteriosas huellas que brillan con luz verde al atardecer en el lindero del bosque. Siguiendo el rastro junto a su grupo de amigos, descubren que el bosque está tratando de alertarlos sobre la desaparición de un manantial sagrado. Una hermosa lección de ecología, trabajo en equipo y el maravilloso lenguaje secreto de la naturaleza.",
    "themes": [
      "Ecología",
      "Aventura",
      "Trabajo en equipo"
    ],
    "openingQuote": "«El bosque no habla alto, pero susurra secretos a quienes saben guardar silencio.»",
    "ageBadge": "8-12 años",
    "collectionTitle": "COLECCIÓN MISTERIO",
    "coverAccent": "#84a98c",
    "coverAccentMuted": "#a3b18a"
  },
  {
    "id": "kid_s1",
    "cat": "kids",
    "title": "El Dragón que perdió su Fuego",
    "author": "Alicia M. Gómez",
    "genre": "Infantil",
    "cover": "🐉",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 52,
    "readTime": "24min",
    "chapters": 3,
    "tagline": "El tiempo de soñar no se mide en minutos, sino en la anchura de una sonrisa.",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Amistad",
      "Misterio",
      "Ecología"
    ],
    "openingQuote": "«El bosque no habla alto, pero susurra secretos a quienes saben caminar despacito.»",
    "ageBadge": "4-8 años",
    "collectionTitle": "COLECCIÓN FANTASÍA",
    "coverAccent": "#fecfef",
    "coverAccentMuted": "#ff9a9e"
  },
  {
    "id": "kid_s2",
    "cat": "kids",
    "title": "La Estación de los Trenes de Nubes",
    "author": "Javier del Campo",
    "genre": "Infantil",
    "cover": "🚂",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 59,
    "readTime": "21min",
    "chapters": 3,
    "tagline": "El tiempo de soñar no se mide en minutos, sino en la anchura de una sonrisa.",
    "synopsis": "Una aventura mágica de misterio infantil donde los engranajes dorados de un faro abandonado responden a las constelaciones del cielo, enseñando a los niños la belleza de la astronomía y el trabajo en equipo.",
    "themes": [
      "Fantasía",
      "Naturaleza",
      "Misterio"
    ],
    "openingQuote": "«Un minuto de risa dura más que una hora de aburrimiento.»",
    "ageBadge": "6-10 años",
    "collectionTitle": "COLECCIÓN AVENTURA",
    "coverAccent": "#a6c1ee",
    "coverAccentMuted": "#fbc2eb"
  },
  {
    "id": "kid_s3",
    "cat": "kids",
    "title": "El Gato que sabía contar Estrellas",
    "author": "Clara Domínguez",
    "genre": "Infantil",
    "cover": "🐱",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 54,
    "readTime": "30min",
    "chapters": 3,
    "tagline": "El hielo brilla con la luna, pero un amigo brilla en cualquier oscuridad.",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Familia",
      "Amistad",
      "Ecología"
    ],
    "openingQuote": "«El viento del norte guarda los suspiros de las nubes que querían ser trenes.»",
    "ageBadge": "4-8 años",
    "collectionTitle": "REALISMO MÁGICO KIDS",
    "coverAccent": "#d5e3f0",
    "coverAccentMuted": "#a4c2db"
  },
  {
    "id": "kid_s4",
    "cat": "kids",
    "title": "La Llave del Viento del Norte",
    "author": "Hugo Silva",
    "genre": "Infantil",
    "cover": "🔑",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 84,
    "readTime": "16min",
    "chapters": 3,
    "tagline": "El tiempo de soñar no se mide en minutos, sino en la anchura de una sonrisa.",
    "synopsis": "Un tierno relato de realismo mágico donde un entrañable relojero repara relojes de arena que guardan las horas felices de la gente, recordándonos que el tiempo de juego es el tesoro más grande de la infancia.",
    "themes": [
      "Familia",
      "Amistad",
      "Ecología"
    ],
    "openingQuote": "«El viento del norte guarda los suspiros de las nubes que querían ser trenes.»",
    "ageBadge": "8-12 años",
    "collectionTitle": "COLECCIÓN MISTERIO",
    "coverAccent": "#84a98c",
    "coverAccentMuted": "#a3b18a"
  },
  {
    "id": "kid_s5",
    "cat": "kids",
    "title": "El Oso que coleccionaba Silencios",
    "author": "Alicia M. Gómez",
    "genre": "Infantil",
    "cover": "🐻",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 94,
    "readTime": "24min",
    "chapters": 3,
    "tagline": "¿Y si las estrellas usaran faros de colores para no perderse en la noche?",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Amistad",
      "Misterio",
      "Naturaleza"
    ],
    "openingQuote": "«Los faros no solo miran al mar, le sonríen a las estrellas cuando hay tormenta.»",
    "ageBadge": "6-10 años",
    "collectionTitle": "REALISMO MÁGICO KIDS",
    "coverAccent": "#e0a96d",
    "coverAccentMuted": "#c8945a"
  },
  {
    "id": "kid_s6",
    "cat": "kids",
    "title": "El Duende del Lápiz de Plata",
    "author": "Javier del Campo",
    "genre": "Infantil",
    "cover": "✏️",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 89,
    "readTime": "18min",
    "chapters": 3,
    "tagline": "¿Y si las estrellas usaran faros de colores para no perderse en la noche?",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Ecología",
      "Fantasía",
      "Familia"
    ],
    "openingQuote": "«El bosque no habla alto, pero susurra secretos a quienes saben caminar despacito.»",
    "ageBadge": "4-8 años",
    "collectionTitle": "COLECCIÓN FANTASÍA",
    "coverAccent": "#fbc2eb",
    "coverAccentMuted": "#a6c1ee"
  },
  {
    "id": "kid_s7",
    "cat": "kids",
    "title": "La Niña que pintaba la Lluvia",
    "author": "Clara Domínguez",
    "genre": "Infantil",
    "cover": "🌧️",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 48,
    "readTime": "15min",
    "chapters": 3,
    "tagline": "Los animales del bosque tienen un secreto guardado, si sabes escuchar el silencio.",
    "synopsis": "Una maravillosa lección de ecología y respeto por la naturaleza, donde Marta y su fiel perro Duque siguen huellas brillantes en el bosque para salvar un manantial sagrado de agua cristalina.",
    "themes": [
      "Amistad",
      "Misterio",
      "Familia"
    ],
    "openingQuote": "«El viento del norte guarda los suspiros de las nubes que querían ser trenes.»",
    "ageBadge": "6-10 años",
    "collectionTitle": "COLECCIÓN AVENTURA",
    "coverAccent": "#d5e3f0",
    "coverAccentMuted": "#a4c2db"
  },
  {
    "id": "kid_s8",
    "cat": "kids",
    "title": "El Viaje del Pequeño Velero Dorado",
    "author": "Hugo Silva",
    "genre": "Infantil",
    "cover": "⛵",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 83,
    "readTime": "22min",
    "chapters": 3,
    "tagline": "Los animales del bosque tienen un secreto guardado, si sabes escuchar el silencio.",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Ecología",
      "Fantasía",
      "Familia"
    ],
    "openingQuote": "«El viento del norte guarda los suspiros de las nubes que querían ser trenes.»",
    "ageBadge": "8-12 años",
    "collectionTitle": "COLECCIÓN AVENTURA",
    "coverAccent": "#f6d365",
    "coverAccentMuted": "#fda085"
  },
  {
    "id": "kid_s9",
    "cat": "kids",
    "title": "El Misterio del Reloj de Sol",
    "author": "Alicia M. Gómez",
    "genre": "Infantil",
    "cover": "☀️",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 94,
    "readTime": "21min",
    "chapters": 3,
    "tagline": "El hielo brilla con la luna, pero un amigo brilla en cualquier oscuridad.",
    "synopsis": "Una maravillosa lección de ecología y respeto por la naturaleza, donde Marta y su fiel perro Duque siguen huellas brillantes en el bosque para salvar un manantial sagrado de agua cristalina.",
    "themes": [
      "Familia",
      "Naturaleza",
      "Misterio"
    ],
    "openingQuote": "«El viento del norte guarda los suspiros de las nubes que querían ser trenes.»",
    "ageBadge": "9-12 años",
    "collectionTitle": "COLECCIÓN MISTERIO",
    "coverAccent": "#e0a96d",
    "coverAccentMuted": "#c8945a"
  },
  {
    "id": "kid_s10",
    "cat": "kids",
    "title": "La Tortuga que caminaba sobre el Viento",
    "author": "Javier del Campo",
    "genre": "Infantil",
    "cover": "🐢",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 77,
    "readTime": "29min",
    "chapters": 3,
    "tagline": "¿Y si las estrellas usaran faros de colores para no perderse en la noche?",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Fantasía",
      "Familia",
      "Naturaleza"
    ],
    "openingQuote": "«Los faros no solo miran al mar, le sonríen a las estrellas cuando hay tormenta.»",
    "ageBadge": "6-10 años",
    "collectionTitle": "REALISMO MÁGICO KIDS",
    "coverAccent": "#84a98c",
    "coverAccentMuted": "#a3b18a"
  },
  {
    "id": "kid_s11",
    "cat": "kids",
    "title": "El Bosque de los Libros Mágicos",
    "author": "Clara Domínguez",
    "genre": "Infantil",
    "cover": "🌳",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 85,
    "readTime": "25min",
    "chapters": 3,
    "tagline": "El tiempo de soñar no se mide en minutos, sino en la anchura de una sonrisa.",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Fantasía",
      "Familia",
      "Naturaleza"
    ],
    "openingQuote": "«Un minuto de risa dura más que una hora de aburrimiento.»",
    "ageBadge": "8-12 años",
    "collectionTitle": "COLECCIÓN FANTASÍA",
    "coverAccent": "#84a98c",
    "coverAccentMuted": "#a3b18a"
  },
  {
    "id": "kid_s12",
    "cat": "kids",
    "title": "El Secreto de la Estrella de Mar",
    "author": "Hugo Silva",
    "genre": "Infantil",
    "cover": "⭐",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 73,
    "readTime": "29min",
    "chapters": 3,
    "tagline": "¿Y si las estrellas usaran faros de colores para no perderse en la noche?",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Ecología",
      "Fantasía",
      "Familia"
    ],
    "openingQuote": "«El bosque no habla alto, pero susurra secretos a quienes saben caminar despacito.»",
    "ageBadge": "4-8 años",
    "collectionTitle": "COLECCIÓN MISTERIO",
    "coverAccent": "#fecfef",
    "coverAccentMuted": "#ff9a9e"
  },
  {
    "id": "kid_s13",
    "cat": "kids",
    "title": "La Cueva de los Ecos Felices",
    "author": "Alicia M. Gómez",
    "genre": "Infantil",
    "cover": "🗣️",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 89,
    "readTime": "30min",
    "chapters": 3,
    "tagline": "El hielo brilla con la luna, pero un amigo brilla en cualquier oscuridad.",
    "synopsis": "Una hermosa e inolvidable historia con valores profundos sobre la amistad, la empatía y la magia del invierno en las cumbres montañosas, diseñada para leer en familia antes de dormir y soñar despiertos.",
    "themes": [
      "Misterio",
      "Ecología",
      "Familia"
    ],
    "openingQuote": "«El viento del norte guarda los suspiros de las nubes que querían ser trenes.»",
    "ageBadge": "6-10 años",
    "collectionTitle": "REALISMO MÁGICO KIDS",
    "coverAccent": "#fbc2eb",
    "coverAccentMuted": "#a6c1ee"
  },
  {
    "id": "kid_s14",
    "cat": "kids",
    "title": "El Pingüino que quería Volar",
    "author": "Javier del Campo",
    "genre": "Infantil",
    "cover": "🐧",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 80,
    "readTime": "19min",
    "chapters": 3,
    "tagline": "Los animales del bosque tienen un secreto guardado, si sabes escuchar el silencio.",
    "synopsis": "Una maravillosa lección de ecología y respeto por la naturaleza, donde Marta y su fiel perro Duque siguen huellas brillantes en el bosque para salvar un manantial sagrado de agua cristalina.",
    "themes": [
      "Amistad",
      "Misterio",
      "Naturaleza"
    ],
    "openingQuote": "«El viento del norte guarda los suspiros de las nubes que querían ser trenes.»",
    "ageBadge": "4-8 años",
    "collectionTitle": "COLECCIÓN AVENTURA",
    "coverAccent": "#d5e3f0",
    "coverAccentMuted": "#a4c2db"
  },
  {
    "id": "kid_s15",
    "cat": "kids",
    "title": "El Caballero de la Armadura de Madera",
    "author": "Hugo Silva",
    "genre": "Infantil",
    "cover": "🛡️",
    "badge": "kids",
    "badgeText": "Kids",
    "pages": 77,
    "readTime": "21min",
    "chapters": 3,
    "tagline": "El hielo brilla con la luna, pero un amigo brilla en cualquier oscuridad.",
    "synopsis": "Una maravillosa lección de ecología y respeto por la naturaleza, donde Marta y su fiel perro Duque siguen huellas brillantes en el bosque para salvar un manantial sagrado de agua cristalina.",
    "themes": [
      "Amistad",
      "Misterio",
      "Naturaleza"
    ],
    "openingQuote": "«Un minuto de risa dura más que una hora de aburrimiento.»",
    "ageBadge": "8-12 años",
    "collectionTitle": "COLECCIÓN FANTASÍA",
    "coverAccent": "#e0a96d",
    "coverAccentMuted": "#c8945a"
  }
];

// ---- FILTERS ----
document.querySelectorAll('.cat-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCat = btn.dataset.cat;
    fetchLibrary(currentCat);
  });
});

// ---- TOPNAV HIDE ----
let lastY = 0;
const nav = document.getElementById('topnav');
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y < 80) nav.classList.remove('hidden');
  else if (y > lastY + 8) nav.classList.add('hidden');
  else if (y < lastY - 8) nav.classList.remove('hidden');
  lastY = y;
}, { passive: true });

// ---- TYPING ----
const lines = ['✓ Capítulo I completado', '✓ Capítulo II completado', '→ Capítulo III en progreso...'];
let lIdx = 0;
const tLine = document.getElementById('typing-line');
function typeEffect() {
  if (!tLine) return;
  if (lIdx >= lines.length) { lIdx = 0; tLine.innerHTML = `<span class="t-gold">generar</span>... <span class="cursor"></span>`; setTimeout(typeEffect, 3000); return; }
  const line = lines[lIdx];
  const col = line.startsWith('✓') ? 't-green' : 't-gold';
  tLine.innerHTML = `<span class="${col}">${line} </span><span class="cursor"></span>`;
  lIdx++;
  setTimeout(typeEffect, 2200);
}
typeEffect();

// ---- AUTH & CHECKOUT ----
const authModal = document.getElementById('auth-modal');
const btnLogin = document.getElementById('btn-login');
const btnJoin = document.getElementById('btn-join');
const btnGoogle = document.getElementById('btn-google-auth');
const btnLogout = document.getElementById('btn-logout');
const authBtns = document.getElementById('auth-btns');
const userProf = document.getElementById('user-prof');

const openModal = () => authModal.classList.add('visible');
const closeModal = (e) => {
  if (e.target === authModal) authModal.classList.remove('visible');
};

btnLogin.addEventListener('click', openModal);
btnJoin.addEventListener('click', openModal);
authModal.addEventListener('click', closeModal);

// ---- EMAIL & PASSWORD AUTH FLOW ----
let isSignUp = false;
const authForm = document.getElementById('auth-form');
const btnSwitchAuth = document.getElementById('btn-switch-auth');
const authTitle = document.querySelector('.auth-title');
const authSubtitle = document.querySelector('.auth-subtitle');
const authSubmitBtn = authForm ? authForm.querySelector('button[type="submit"]') : null;
const authFooter = document.querySelector('.auth-footer');

// Create error container dynamically if not exists
let errorContainer = document.getElementById('auth-error');
if (authForm && !errorContainer) {
  errorContainer = document.createElement('div');
  errorContainer.id = 'auth-error';
  errorContainer.style.color = '#FF5F57';
  errorContainer.style.fontSize = '12px';
  errorContainer.style.marginTop = '12px';
  errorContainer.style.textAlign = 'center';
  authForm.appendChild(errorContainer);
}

btnGoogle.addEventListener('click', async () => {
  if (errorContainer) errorContainer.textContent = '';
  try {
    await signInWithPopup(auth, googleProvider);
    authModal.classList.remove('visible');
  } catch (error) {
    console.error("Auth Error:", error);
    let friendlyMessage = 'Error al conectar con Google.';
    if (error.code === 'auth/popup-blocked') {
      friendlyMessage = 'El navegador bloqueó la ventana emergente de Google. Habilita los popups.';
    } else if (error.code === 'auth/operation-not-allowed') {
      friendlyMessage = 'El proveedor de Google no está habilitado en Firebase para este proyecto.';
    } else if (error.code === 'auth/popup-closed-by-user') {
      friendlyMessage = 'Cerraste la ventana de Google antes de iniciar sesión.';
    } else {
      friendlyMessage = `${friendlyMessage} (${error.code || error.message})`;
    }
    if (errorContainer) errorContainer.textContent = friendlyMessage;
  }
});

// Switch between Login and Sign Up mode
if (btnSwitchAuth) {
  btnSwitchAuth.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    if (errorContainer) errorContainer.textContent = ''; // clear errors
    
    if (isSignUp) {
      authTitle.textContent = 'Crear cuenta Timeless';
      authSubtitle.textContent = 'Únete a la experiencia de lectura premium';
      authSubmitBtn.textContent = 'Registrarse';
      authFooter.innerHTML = '¿Ya tienes cuenta? <button id="btn-switch-auth" style="background:none; border:none; color:var(--gold); font-weight:600; cursor:pointer; text-decoration:underline;">Inicia sesión</button>';
      // Re-bind listener to new dynamically created button
      document.getElementById('btn-switch-auth').addEventListener('click', switchModeHandler);
    } else {
      resetToLogin();
    }
  });
}

function switchModeHandler(e) {
  e.preventDefault();
  isSignUp = !isSignUp;
  if (errorContainer) errorContainer.textContent = '';
  if (isSignUp) {
    authTitle.textContent = 'Crear cuenta Timeless';
    authSubtitle.textContent = 'Únete a la experiencia de lectura premium';
    authSubmitBtn.textContent = 'Registrarse';
    authFooter.innerHTML = '¿Ya tienes cuenta? <button id="btn-switch-auth" style="background:none; border:none; color:var(--gold); font-weight:600; cursor:pointer; text-decoration:underline;">Inicia sesión</button>';
    document.getElementById('btn-switch-auth').addEventListener('click', switchModeHandler);
  } else {
    resetToLogin();
  }
}

function resetToLogin() {
  authTitle.textContent = 'Bienvenido a Timeless';
  authSubtitle.textContent = 'Accede a la colección exclusiva';
  authSubmitBtn.textContent = 'Entrar';
  authFooter.innerHTML = '¿No tienes cuenta? <button id="btn-switch-auth" style="background:none; border:none; color:var(--gold); font-weight:600; cursor:pointer; text-decoration:underline;">Regístrate</button>';
  document.getElementById('btn-switch-auth').addEventListener('click', switchModeHandler);
}

// Form Submit: Email & Password Sign-In or Sign-Up
if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorContainer) errorContainer.textContent = '';
    
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-pass').value.trim();
    
    if (!email || !password) {
      if (errorContainer) errorContainer.textContent = 'Por favor, completa todos los campos.';
      return;
    }
    
    const originalText = authSubmitBtn.textContent;
    authSubmitBtn.textContent = 'Procesando...';
    authSubmitBtn.disabled = true;
    
    try {
      if (isSignUp) {
        // Sign Up / Register
        await createUserWithEmailAndPassword(auth, email, password);
        console.log("  ✦ [Auth] Registro de usuario completado");
      } else {
        // Sign In / Login
        await signInWithEmailAndPassword(auth, email, password);
        console.log("  ✦ [Auth] Inicio de sesión completado");
      }
      // Success! Hide Modal
      authModal.classList.remove('visible');
      // Reset inputs
      authForm.reset();
    } catch (error) {
      console.error("Auth Error:", error);
      let friendlyMessage = 'Error en el proceso de autenticación.';
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
          friendlyMessage = 'El correo electrónico o la contraseña son incorrectos.';
          break;
        case 'auth/wrong-password':
          friendlyMessage = 'La contraseña es incorrecta.';
          break;
        case 'auth/invalid-email':
          friendlyMessage = 'El correo electrónico no es válido.';
          break;
        case 'auth/weak-password':
          friendlyMessage = 'La contraseña debe tener al menos 6 caracteres.';
          break;
        case 'auth/email-already-in-use':
          friendlyMessage = 'El correo electrónico ya está registrado.';
          break;
        default:
          friendlyMessage = error.message;
      }
      if (errorContainer) errorContainer.textContent = friendlyMessage;
    } finally {
      authSubmitBtn.textContent = originalText;
      authSubmitBtn.disabled = false;
    }
  });
}

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await signOut(auth);
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isPremiumUser = false;
  const btnAdmin = document.getElementById('btn-admin-console');
  if (user) {
    if(authBtns) authBtns.style.display = 'none';
    if(userProf) userProf.classList.add('visible');
    if (btnAdmin) {
      btnAdmin.style.display = user.email === 'matiaseorejas@gmail.com' ? 'flex' : 'none';
    }
    
    // Verificar si es premium en Firestore
    if (user.email === 'matiaseorejas@gmail.com') {
      isPremiumUser = true;
    } else {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists() && userSnap.data().isPremium === true) {
          isPremiumUser = true;
        }
      } catch (err) {
        console.warn("  ⚠ [Auth] No se pudo verificar el estado premium en Firestore. Sandbox mode: Permitir acceso temporal.");
        isPremiumUser = true; // Fallback tolerante en sandbox local
      }
    }
  } else {
    if(authBtns) authBtns.style.display = 'flex';
    if(userProf) userProf.classList.remove('visible');
    if (btnAdmin) btnAdmin.style.display = 'none';
  }
  fetchLibrary(currentCat);
});

const subCtaBtn = document.getElementById('sub-cta-btn');
if (subCtaBtn) {
  subCtaBtn.addEventListener('click', async () => {
    if (!currentUser) { authModal.classList.add('visible'); return; }
    
    const originalText = subCtaBtn.textContent;
    subCtaBtn.textContent = 'Procesando...';
    subCtaBtn.disabled = true;

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: currentUser.uid,
          items: [{ title: 'Suscripción Anual Timeless', quantity: 1, unit_price: 89 }]
        })
      });
      
      const session = await response.json();
      if (session.url) {
        window.location.href = session.url;
      } else {
        throw new Error('No se pudo iniciar el checkout');
      }
    } catch (error) {
      console.error("Error de pago:", error);
      alert("Hubo un problema al iniciar el pago. Por favor, intenta de nuevo.");
      subCtaBtn.textContent = originalText;
      subCtaBtn.disabled = false;
    }
  });
}

// ── BOOK CATALOG global lookup (fallback + Firestore books merge) ───────
let BOOK_CATALOG = [...FALLBACK_BOOKS, ...KIDS_FALLBACK_BOOKS];

// ── BACK-COVER MODAL ────────────────────────────────────────────────────
window.openBookModal = function(bookId) {
  const book = BOOK_CATALOG.find(b => b.id === bookId);
  if (!book) return;

  document.getElementById('backcover-modal')?.remove();

  const isLoggedIn  = !!currentUser;
  const readUrl     = `reader.html?id=${book.id}`;
  const genreColors = { ficcion:'#C4884A', ensayo:'#6B8E6B', tecnica:'#7A7A9E', biografia:'#8E7BA8', kids:'#5B9E6B' };
  const accent      = genreColors[book.cat] || '#C9A96E';

  const themePills  = (book.themes || []).map(t => `<span class="bm-theme-pill">${t}</span>`).join('');

  const modal = document.createElement('div');
  modal.id = 'backcover-modal';
  modal.innerHTML = `
    <div class="bm-overlay" id="bm-overlay"></div>
    <div class="bm-panel" id="bm-panel">
      <button class="bm-close" id="bm-close" aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="bm-inner">
        <div class="bm-cover-col">
          <div class="bm-cover-wrap" style="--bm-accent:${accent}">
            <div class="bm-cover-spine"></div>
            ${book.cover.startsWith('assets') || book.cover.startsWith('http') || book.cover.includes('/')
              ? `<img src="${book.cover}" alt="${book.title}" />`
              : `<div class="kids-card-cover-placeholder" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:linear-gradient(135deg, #FFF9E6, #FFF0CC);">
                  <div style="font-size: 72px; line-height: 1;">${book.cover}</div>
                  <div style="font-family:var(--font-serif); font-size:14px; font-weight:600; color:#2D5A3D; text-align:center; padding: 10px;">${book.title}</div>
                 </div>`
            }
            ${book.badge === 'excl' ? `<div class="bm-badge bm-badge-excl">${book.badgeText || 'Exclusivo'}</div>` : ''}
            ${book.badge === 'new'  ? `<div class="bm-badge bm-badge-new">${book.badgeText || 'Nuevo'}</div>` : ''}
            ${book.badge === 'kids' ? `<div class="bm-badge bm-badge-kids">${book.badgeText || 'Kids'}</div>` : ''}
          </div>
          <div class="bm-meta-pills">
            ${book.pages    ? `<div class="bm-meta-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>${book.pages} págs.</div>` : ''}
            ${book.readTime ? `<div class="bm-meta-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${book.readTime}</div>` : ''}
            ${book.chapters ? `<div class="bm-meta-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>${book.chapters} caps.</div>` : ''}
          </div>
        </div>
        <div class="bm-content-col">
          <div class="bm-genre" style="color:${accent}">✦ ${book.genre}</div>
          <h2 class="bm-title">${book.title}</h2>
          <div class="bm-author">por ${book.author || 'Timeless Editorial'}</div>
          ${book.openingQuote ? `<blockquote class="bm-quote" style="border-left-color:${accent}">${book.openingQuote}</blockquote>` : ''}
          ${book.tagline  ? `<p class="bm-tagline">${book.tagline}</p>` : ''}
          ${book.synopsis ? `<p class="bm-synopsis">${book.synopsis}</p>` : ''}
          ${themePills    ? `<div class="bm-themes">${themePills}</div>` : ''}
          <div class="bm-cta-row">
            ${isLoggedIn
              ? `<a class="bm-btn-primary" href="${readUrl}" onclick="sessionStorage.setItem('tl_active_book', JSON.stringify(BOOK_CATALOG.find(b => b.id === '${book.id}')))" style="background:${accent};border-color:${accent}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  ${isPremiumUser ? 'Leer ahora' : 'Leer vista previa'}
                </a>`
              : `<button class="bm-btn-primary" id="bm-cta-register" style="background:${accent};border-color:${accent}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  Acceder a esta obra
                </button>`
            }
            <button class="bm-btn-ghost" id="bm-close-bottom">Volver al catálogo</button>
          </div>
          ${!isLoggedIn ? `<p class="bm-access-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            14 días gratis · Sin tarjeta de crédito · Cancela cuando quieras
          </p>` : ''}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => modal.classList.add('bm-visible'));

  const closeModal = () => {
    modal.classList.remove('bm-visible');
    setTimeout(() => { modal.remove(); document.body.style.overflow = ''; }, 350);
  };

  document.getElementById('bm-overlay')?.addEventListener('click', closeModal);
  document.getElementById('bm-close')?.addEventListener('click', closeModal);
  document.getElementById('bm-close-bottom')?.addEventListener('click', closeModal);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onEsc); }
  });

  document.getElementById('bm-cta-register')?.addEventListener('click', () => {
    closeModal();
    setTimeout(() => document.getElementById('auth-modal')?.classList.add('visible'), 380);
  });
}

// ── AUTOMATIC SUBSCRIPTION CONVERSION FUNNEL ────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'subscribe') {
    setTimeout(() => {
      if (currentUser) {
        document.getElementById('sub-cta-btn')?.click();
      } else {
        document.getElementById('auth-modal')?.classList.add('visible');
      }
    }, 800);
  }
});
