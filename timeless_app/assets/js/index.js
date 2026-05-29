import { 
  auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  db, collection, getDocs, query, where 
} from '../../firebase_config.js';

// ---- STATE ----
let currentUser = null;
let currentCat = 'all';
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

  bookGrid.innerHTML = books.map((b, i) => `
    <div class="book-card reveal reveal-delay-${(i % 4) + 1}" data-book-id="${b.id}" onclick="openBookModal('${b.id}')">
      <div class="book-card-cover">
        <div class="book-card-spine"></div>
        <img src="${b.cover || 'assets/cover.png'}" alt="${b.title}" loading="lazy" />
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
  `).join('');

  document.querySelectorAll('.book-card.reveal').forEach(el => observer.observe(el));
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
    id: 'fb1', cat: 'ensayo',
    title: 'El Arte de la Contemplación',
    author: 'Emilio Vargas',
    genre: 'Ensayo', cover: 'assets/cover_contemplacion.png',
    badge: 'excl', badgeText: 'Exclusivo',
    pages: 218, readTime: '5h 40min', chapters: 12,
    tagline: 'En un mundo que corre, aprender a detenerse es el acto más radical.',
    synopsis: 'Emilio Vargas propone en este ensayo una filosofía de la atención como forma de resistencia cultural. A través de doce meditaciones independientes — sobre el silencio, la lentitud, la luz de la tarde, los museos vacíos — construye un argumento que no se enuncia sino que se acumula, como la humedad antes de la lluvia. Una voz que no urge: espera.',
    themes: ['Atención', 'Silencio', 'Cultura contemporánea'],
    openingQuote: '«No se trata de no pensar. Se trata de pensar hacia abajo, en lugar de hacia adelante.»',
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
    openingQuote: '«El agua tiene memoria. Es lo único que no podemos purificar del todo.»',
  },
  {
    id: 'fb3', cat: 'tecnica',
    title: 'El Arquitecto de Sombras',
    author: 'Marcos Delgado',
    genre: 'Técnica narrativa', cover: 'assets/cover_arquitecto.png',
    pages: 280, readTime: '6h 55min', chapters: 15,
    tagline: 'Un manual para construir mundos que el lector habite sin saberlo.',
    synopsis: 'Marcos Delgado, arquitecto de profesionó y escritor por necesidad, expone en este volumen singular la gramática oculta detrás de los espacios narrativos que más nos han habitado. Cómo la luz entra en una escena. Cómo el silencio ocupa espacio en una página. Cómo construir una habitación que el lector recuerde aunque jamás la haya visto. Un libro técnico que se lee como una novela.',
    themes: ['Escritura', 'Arquitectura narrativa', 'Espacio ficcional'],
    openingQuote: '«Todo gran edificio tiene una sombra. Toda gran historia también.»',
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
    openingQuote: '«Había llegado al hotel antes de saber que lo buscaba. Así funcionan los lugares que nos esperan.»',
  }
];

const KIDS_FALLBACK_BOOKS = [
  {
    id: 'kid1', cat: 'kids',
    title: 'El Unicornio de Hielo',
    author: 'Alicia M. Gómez',
    genre: 'Infantil (4-8 años)', cover: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa52?auto=format&fit=crop&q=80&w=400',
    badge: 'kids', badgeText: 'Kids',
    pages: 48, readTime: '15min', chapters: 3,
    tagline: 'Una mágica aventura en las montañas celestes para derretir la soledad.',
    synopsis: 'En la cima de la Montaña Azul vive un unicornio hecho enteramente de escarcha brillante. Aunque tiene el poder de congelar los riachuelos para jugar, se siente muy solo. Un día, una valiente niña llamada Sofía sube la montaña buscando una flor que nunca se marchita y le enseña que el calor más valioso es el del corazón y la amistad verdadera.',
    themes: ['Amistad', 'Naturaleza', 'Sentimientos'],
    openingQuote: '«El hielo brilla con la luna, pero un amigo brilla en cualquier oscuridad.»',
  },
  {
    id: 'kid2', cat: 'kids',
    title: 'El Secreto del Faro Austral',
    author: 'Javier del Campo',
    genre: 'Aventura (9-12 años)', cover: 'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?auto=format&fit=crop&q=80&w=400',
    badge: 'kids', badgeText: 'Kids',
    pages: 112, readTime: '45min', chapters: 8,
    tagline: '¿Y si las estrellas usaran faros para no perderse en la noche?',
    synopsis: 'Tomás pasa el verano en la isla del faro junto a su abuelo. Una noche de tormenta, descubre un engranaje dorado oculto bajo la escalera de caracol. Al hacerlo girar, el faro deja de proyectar luz blanca y empieza a emitir un haz de luz cósmico de colores que responde a las constelaciones. Tomás se embarca en un misterio estelar para descifrar el mensaje secreto de los navegantes del cielo.',
    themes: ['Misterio', 'Astronomía', 'Familia'],
    openingQuote: '«Los faros no solo miran al mar, a veces le sonríen a las estrellas.»',
  },
  {
    id: 'kid3', cat: 'kids',
    title: 'El Relojero de los Sueños',
    author: 'Clara Domínguez',
    genre: 'Realismo Mágico (6-10 años)', cover: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&q=80&w=400',
    badge: 'kids', badgeText: 'Kids',
    pages: 76, readTime: '30min', chapters: 5,
    tagline: 'El tiempo de soñar no se mide en minutos, sino en sonrisas.',
    synopsis: 'Don Manuel es el relojero del pueblo, pero en su trastienda no repara relojes comunes. Repara relojes de arena que guardan las horas felices de la gente. Cuando el pequeño Bruno pierde las ganas de jugar porque el tiempo pasa muy rápido, Don Manuel le enseña cómo saborear cada segundo de juego y cómo los recuerdos alegres detienen las manecillas del reloj de la vida.',
    themes: ['Felicidad', 'El tiempo', 'Sabiduría'],
    openingQuote: '«Un minuto de risa dura más que una hora de aburrimiento.»',
  },
  {
    id: 'kid4', cat: 'kids',
    title: 'Las Huellas del Bosque Susurrante',
    author: 'Hugo Silva',
    genre: 'Misterio (8-12 años)', cover: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=400',
    badge: 'kids', badgeText: 'Kids',
    pages: 94, readTime: '35min', chapters: 6,
    tagline: 'Los animales del bosque tienen una historia que contarte, si sabes escuchar.',
    synopsis: 'Marta y su perro Duque encuentran unas misteriosas huellas que brillan con luz verde al atardecer en el lindero del bosque. Siguiendo el rastro junto a su grupo de amigos, descubren que el bosque está tratando de alertarlos sobre la desaparición de un manantial sagrado. Una hermosa lección de ecología, trabajo en equipo y el maravilloso lenguaje secreto de la naturaleza.',
    themes: ['Ecología', 'Aventura', 'Trabajo en equipo'],
    openingQuote: '«El bosque no habla alto, pero susurra secretos a quienes saben guardar silencio.»',
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

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const btnAdmin = document.getElementById('btn-admin-console');
  if (user) {
    if(authBtns) authBtns.style.display = 'none';
    if(userProf) userProf.classList.add('visible');
    if (btnAdmin) {
      btnAdmin.style.display = user.email === 'matiaseorejas@gmail.com' ? 'flex' : 'none';
    }
  } else {
    if(authBtns) authBtns.style.display = 'flex';
    if(userProf) userProf.classList.remove('visible');
    if (btnAdmin) btnAdmin.style.display = 'none';
  }
  initKidsCovers();
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
              ? `<a class="bm-btn-primary" href="${readUrl}" style="background:${accent};border-color:${accent}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  Leer ahora
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
};

function initKidsCovers() {
  const coverTemplates = {
    kid1: {
      bg: "https://images.unsplash.com/photo-1553284965-83fd3e82fa52?auto=format&fit=crop&q=80&w=600",
      accent: "#d5e3f0",
      accentMuted: "#a4c2db",
      titleLine1: "El Unicornio",
      titleLine2: "de Hielo",
      collection: "COLECCIÓN FANTASÍA",
      author: "ALICIA M. GÓMEZ",
      gradient: `
        <linearGradient id="overlayGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0a121a" stop-opacity="0.5"/>
          <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#080e15" stop-opacity="0.8"/>
        </linearGradient>
      `,
      gradientId: "overlayGrad1"
    },
    kid2: {
      bg: "https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?auto=format&fit=crop&q=80&w=600",
      accent: "#f6d365",
      accentMuted: "#fda085",
      titleLine1: "El Secreto del",
      titleLine2: "Faro Austral",
      collection: "COLECCIÓN AVENTURA",
      author: "JAVIER DEL CAMPO",
      gradient: `
        <linearGradient id="overlayGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#050a12" stop-opacity="0.6"/>
          <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#03060c" stop-opacity="0.85"/>
        </linearGradient>
      `,
      gradientId: "overlayGrad2"
    },
    kid3: {
      bg: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&q=80&w=600",
      accent: "#e0a96d",
      accentMuted: "#e0a96d",
      titleLine1: "El Relojero",
      titleLine2: "de los Sueños",
      collection: "REALISMO MÁGICO",
      author: "CLARA DOMÍNGUEZ",
      gradient: `
        <linearGradient id="overlayGrad3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#140a05" stop-opacity="0.6"/>
          <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#0f0502" stop-opacity="0.85"/>
        </linearGradient>
      `,
      gradientId: "overlayGrad3"
    },
    kid4: {
      bg: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=600",
      accent: "#84a98c",
      accentMuted: "#a3b18a",
      titleLine1: "Las Huellas",
      titleLine2: "del Bosque",
      collection: "COLECCIÓN MISTERIO",
      author: "HUGO SILVA",
      gradient: `
        <linearGradient id="overlayGrad4" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#020805" stop-opacity="0.6"/>
          <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#010603" stop-opacity="0.85"/>
        </linearGradient>
      `,
      gradientId: "overlayGrad4"
    }
  };

  Object.keys(coverTemplates).forEach(id => {
    const t = coverTemplates[id];
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="100%" height="100%">
        <defs>
          ${t.gradient}
        </defs>
        <image href="${t.bg}" x="0" y="0" width="400" height="600" preserveAspectRatio="xMidYMid slice" />
        <rect width="400" height="600" fill="url(#${t.gradientId})" />
        <rect x="20" y="20" width="360" height="560" fill="none" stroke="${t.accent}" stroke-width="2.5" opacity="0.8" />
        <rect x="26" y="26" width="348" height="548" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.3" />
        
        <text x="200" y="70" font-family="'Inter', sans-serif" font-size="9" font-weight="800" fill="${t.accent}" letter-spacing="4.5" text-anchor="middle" opacity="0.9">TIMELESS EDITORIAL</text>
        <line x1="160" y1="80" x2="240" y2="80" stroke="${t.accent}" stroke-width="0.5" opacity="0.5" />

        <text x="200" y="445" font-family="'Playfair Display', 'Georgia', serif" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle" font-style="italic" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))">
          ${t.titleLine1}
        </text>
        <text x="200" y="482" font-family="'Playfair Display', 'Georgia', serif" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle" font-style="italic" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))">
          ${t.titleLine2}
        </text>
        
        <text x="200" y="520" font-family="'Inter', sans-serif" font-size="9.5" font-weight="600" fill="${t.accentMuted}" letter-spacing="2.5" text-anchor="middle">
          ${t.collection}
        </text>
        <text x="200" y="550" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#ffffff" letter-spacing="1.5" text-anchor="middle" opacity="0.9">
          ${t.author}
        </text>
      </svg>
    `;
    const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    
    // 1. Inyectar en cards estáticos de index.html
    const imgEl = document.getElementById(`kid-cover-${id.replace('kid', '')}`);
    if (imgEl) imgEl.src = dataUri;

    // 2. Inyectar en KIDS_FALLBACK_BOOKS en tiempo de ejecución
    const book = KIDS_FALLBACK_BOOKS.find(b => b.id === id);
    if (book) book.cover = dataUri;
  });
}
