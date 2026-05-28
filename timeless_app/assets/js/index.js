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
    <a class="book-card reveal reveal-delay-${(i % 4) + 1}" href="reader.html?id=${b.id}">
      <div class="book-card-cover">
        <div class="book-card-spine"></div>
        <img src="${b.cover || 'assets/cover.png'}" alt="${b.title}" loading="lazy" />
        <div class="book-card-overlay">
          <div class="book-card-read-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            Leer ahora
          </div>
        </div>
        ${b.badge === 'excl' ? `<div class="book-excl">${b.badgeText || 'Exclusivo'}</div>` : ''}
        ${b.badge === 'new'  ? `<div class="book-new">${b.badgeText || 'Nuevo'}</div>` : ''}
      </div>
      <div class="book-card-genre">${b.genre}</div>
      <div class="book-card-title">${b.title}</div>
      <div class="book-card-author">${b.author || 'Timeless Agent'}</div>
    </a>
  `).join('');

  // Observe newly added books
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

    if (books.length === 0) books = FALLBACK_BOOKS;

    const filtered = category === 'all' ? books : books.filter(b => b.cat === category || b.genre?.toLowerCase().includes(category));
    renderBooks(filtered);

  } catch (error) {
    console.error("Error fetching library:", error);
    renderBooks(FALLBACK_BOOKS);
  }
}

const FALLBACK_BOOKS = [
  { id: 'fb1', cat: 'ensayo', title: 'El Arte de la Contemplación', author: 'Emilio Vargas', genre: 'Ensayo', cover: 'assets/cover_contemplacion.png', badge: 'excl', badgeText: 'Exclusivo' },
  { id: 'fb2', cat: 'ficcion', title: 'La Memoria del Agua', author: 'Claudia Iriarte', genre: 'Ficción', cover: 'assets/cover_memoria.png', badge: 'new', badgeText: 'Nuevo' },
  { id: 'fb3', cat: 'tecnica', title: 'El Arquitecto de Sombras', author: 'Marcos Delgado', genre: 'Técnica', cover: 'assets/cover_arquitecto.png' },
  { id: 'fb4', cat: 'ficcion', title: 'En el Umbral', author: 'Isabel Noriega', genre: 'Ficción', cover: 'assets/cover_umbral.png', badge: 'excl', badgeText: 'Exclusivo' }
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
  if (user) {
    if(authBtns) authBtns.style.display = 'none';
    if(userProf) userProf.classList.add('visible');
  } else {
    if(authBtns) authBtns.style.display = 'flex';
    if(userProf) userProf.classList.remove('visible');
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
