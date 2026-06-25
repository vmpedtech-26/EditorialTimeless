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
function renderBooks(books, offlineIds = new Set()) {
  if (!books.length) {
    bookGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--ink-faint);">No se encontraron obras en esta categoría.</div>';
    return;
  }

  bookGrid.innerHTML = books.map((b, i) => {
    const isDownloaded = offlineIds.has(b.id);
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
          ${isDownloaded ? `<div class="book-offline-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:10px;height:10px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Offline
          </div>` : ''}
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
function renderKidsGrid(books, offlineIds = new Set()) {
  const kidsGrid = document.getElementById('kids-grid');
  if (!kidsGrid) return;
  
  if (!books.length) {
    kidsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--ink-faint);">No hay obras infantiles en este momento.</div>';
    return;
  }
  
  kidsGrid.innerHTML = books.map((b, i) => {
    const isDownloaded = offlineIds.has(b.id);
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
          ${isDownloaded ? `<div class="book-offline-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:10px;height:10px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Offline
          </div>` : ''}
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
  if (!navigator.onLine) {
    category = 'descargados';
  }

  bookGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--ink-faint);">Sincronizando biblioteca…</div>';
  
  // 1. Obtener IDs descargados desde IndexedDB para mostrar badges y controlar visibilidad de pill
  let offlineIds = new Set();
  try {
    offlineIds = await getOfflineBookIds();
    const pillDescargados = document.getElementById('pill-descargados');
    if (pillDescargados) {
      if (currentUser && offlineIds.size > 0) {
        pillDescargados.style.display = 'inline-block';
      } else {
        pillDescargados.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn("Error leyendo IndexedDB:", err);
  }

  // 2. Si la categoría es 'descargados', servir directamente desde IndexedDB
  if (category === 'descargados') {
    try {
      const offlineBooks = await getOfflineBooks();
      BOOK_CATALOG = offlineBooks;
      
      const kidsBooks = offlineBooks.filter(b => b.cat === 'kids');
      renderKidsGrid(kidsBooks, offlineIds);
      
      const filtered = offlineBooks.filter(b => b.cat !== 'kids');
      renderBooks(filtered, offlineIds);
      return;
    } catch (err) {
      console.error("Error al cargar biblioteca offline:", err);
      bookGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--ink-faint);">Error al cargar las obras sin conexión.</div>';
      return;
    }
  }

  // 3. Flujo Online Estándar
  try {
    // Cargar fallbacks dinámicamente si los arrays locales están vacíos
    if (FALLBACK_BOOKS.length === 0) {
      try {
        const [fRes, kRes] = await Promise.all([
          fetch('/fallback_catalog.json').then(r => r.json()),
          fetch('/kids_fallback_catalog.json').then(r => r.json())
        ]);
        FALLBACK_BOOKS.push(...fRes);
        KIDS_FALLBACK_BOOKS.push(...kRes);
      } catch (err) {
        console.warn("No se pudieron cargar catálogos fallback desde JSON:", err.message);
      }
    }

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
    
    // Obtener recomendaciones personalizadas si hay usuario logueado (Pilar 3)
    if (currentUser && category === 'all') {
      try {
        const token = await currentUser.getIdToken();
        const recsRes = await fetch('/api/recommendations', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (recsRes.ok) {
          const recsBooks = await recsRes.json();
          if (recsBooks.length > 0) {
            // Prepend recommended books with a custom badge
            const recsWithBadge = recsBooks.map(b => ({ 
              ...b, 
              badge: 'excl', 
              badgeText: 'Recomendado' 
            }));
            const recIds = new Set(recsWithBadge.map(b => b.id));
            books = [...recsWithBadge, ...books.filter(b => !recIds.has(b.id))];
          }
        }
      } catch (err) {
        console.warn("No se pudieron obtener recomendaciones del servidor:", err.message);
      }
    }
    
    BOOK_CATALOG = books;

    // Renderizar sección Kids dinámica
    const kidsBooks = books.filter(b => b.cat === 'kids');
    renderKidsGrid(kidsBooks, offlineIds);

    const filtered = category === 'all' 
      ? books.filter(b => b.cat !== 'kids') 
      : books.filter(b => b.cat === category || b.genre?.toLowerCase().includes(category));
    renderBooks(filtered, offlineIds);

  } catch (error) {
    console.error("Error fetching library, trying local cache:", error);
    if (FALLBACK_BOOKS.length === 0) {
      try {
        const [fRes, kRes] = await Promise.all([
          fetch('/fallback_catalog.json').then(r => r.json()),
          fetch('/kids_fallback_catalog.json').then(r => r.json())
        ]);
        FALLBACK_BOOKS.push(...fRes);
        KIDS_FALLBACK_BOOKS.push(...kRes);
      } catch (e) {}
    }
    BOOK_CATALOG = [...FALLBACK_BOOKS, ...KIDS_FALLBACK_BOOKS];
    const filtered = category === 'all' 
      ? FALLBACK_BOOKS 
      : FALLBACK_BOOKS.filter(b => b.cat === category || b.genre?.toLowerCase().includes(category));
    renderBooks(filtered, offlineIds);
  }
}

const FALLBACK_BOOKS = [];
const KIDS_FALLBACK_BOOKS = [];

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

function saveAuthTokenToIndexedDB(token) {
  return openOfflineDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_keys', 'readwrite');
      tx.objectStore('offline_keys').put({ bookId: '_user_token', license: token, expiresAt: Date.now() + 55 * 60 * 1000 }); // 55 min
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
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
    
    // Guardar token JWT en IndexedDB para Background Sync (Pilar 2)
    try {
      const token = await user.getIdToken();
      await saveAuthTokenToIndexedDB(token);
      console.log("  ✦ [PWA] Token JWT guardado en IndexedDB para Background Sync.");
    } catch (tokenErr) {
      console.warn("No se pudo guardar el token JWT en IndexedDB:", tokenErr.message);
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

// ---- PLAN SELECTION & SECURE CHECKOUT ----
let selectedPlan = {
  id: 'annual',
  title: 'Suscripción Anual Timeless',
  price: 89,
  period: 'año'
};

const planMonthly = document.getElementById('plan-monthly');
const planAnnual = document.getElementById('plan-annual');
const planFamily = document.getElementById('plan-family');
const subCtaBtn = document.getElementById('sub-cta-btn');

function selectPlan(planId, element, title, price, period) {
  [planMonthly, planAnnual, planFamily].forEach(el => {
    if (el) el.classList.remove('selected');
  });
  if (element) element.classList.add('selected');
  selectedPlan = { id: planId, title, price, period };
  if (subCtaBtn) {
    subCtaBtn.textContent = `Iniciar Suscripción ${planId === 'annual' ? 'Anual' : planId === 'monthly' ? 'Mensual' : 'Familiar'} - $${price}`;
  }
}

if (planMonthly) {
  planMonthly.addEventListener('click', () => {
    selectPlan('monthly', planMonthly, 'Suscripción Mensual Timeless', 12, 'mes');
  });
}
if (planAnnual) {
  planAnnual.classList.add('selected');
  planAnnual.addEventListener('click', () => {
    selectPlan('annual', planAnnual, 'Suscripción Anual Timeless', 89, 'año');
  });
}
if (planFamily) {
  planFamily.addEventListener('click', () => {
    selectPlan('family', planFamily, 'Suscripción Familiar Timeless', 18, 'mes');
  });
}

if (subCtaBtn) {
  subCtaBtn.textContent = `Iniciar Suscripción Anual - $89`;
  
  subCtaBtn.addEventListener('click', async () => {
    if (!currentUser) { authModal.classList.add('visible'); return; }
    
    const originalText = subCtaBtn.textContent;
    subCtaBtn.textContent = 'Procesando...';
    subCtaBtn.disabled = true;

    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          items: [{ title: selectedPlan.title, quantity: 1, unit_price: selectedPlan.price }]
        })
      });
      
      const session = await response.json();
      if (response.ok && session.url) {
        window.location.href = session.url;
      } else {
        throw new Error(session.error?.message || 'No se pudo iniciar el checkout');
      }
    } catch (error) {
      console.error("Error de pago:", error);
      alert(error.message || "Hubo un problema al iniciar el pago. Por favor, intenta de nuevo.");
      subCtaBtn.textContent = originalText;
      subCtaBtn.disabled = false;
    }
  });
}


// ── INDEXEDDB OFFLINE STORAGE ───────────────────────────────────────────
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('timeless_offline_db', 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('offline_books')) {
        db.createObjectStore('offline_books', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('offline_keys')) {
        db.createObjectStore('offline_keys', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('telemetry_queue')) {
        db.createObjectStore('telemetry_queue', { autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function saveBookOffline(bookId, bookData, licenseKey) {
  return openOfflineDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['offline_books', 'offline_keys'], 'readwrite');
      tx.objectStore('offline_books').put({ bookId, data: bookData });
      tx.objectStore('offline_keys').put({ bookId, license: licenseKey, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }); // 30 días
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  });
}

function getOfflineBookIds() {
  return openOfflineDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_books', 'readonly');
      const store = tx.objectStore('offline_books');
      const req = store.getAllKeys();
      tx.oncomplete = () => resolve(new Set(req.result || []));
      tx.onerror = (e) => reject(e.target.error);
    });
  });
}

function getOfflineBooks() {
  return openOfflineDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_books', 'readonly');
      const store = tx.objectStore('offline_books');
      const req = store.getAll();
      tx.oncomplete = () => resolve(req.result ? req.result.map(item => item.data) : []);
      tx.onerror = (e) => reject(e.target.error);
    });
  });
}

// ── BOOK CATALOG global lookup (fallback + Firestore books merge) ───────
let BOOK_CATALOG = [...FALLBACK_BOOKS, ...KIDS_FALLBACK_BOOKS];

// ── BACK-COVER MODAL ────────────────────────────────────────────────────
window.openBookModal = function(bookId) {
  const book = BOOK_CATALOG.find(b => b.id === bookId);
  if (!book) return;

  // Si el libro tiene una variante de portada (Test A/B), registramos el click para medir conversión (Pilar 3)
  if (book.coverVariant && currentUser) {
    currentUser.getIdToken().then(token => {
      fetch('/api/experiment/click', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bookId: book.id,
          variant: book.coverVariant
        })
      }).catch(err => console.warn("Error al registrar click del experimento A/B:", err));
    }).catch(e => console.warn(e));
  }

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
              ? `<div style="display:flex; gap:10px; flex-wrap:wrap; width:100%; margin-bottom:10px;">
                  <a class="bm-btn-primary" href="${readUrl}" onclick="sessionStorage.setItem('tl_active_book', JSON.stringify(BOOK_CATALOG.find(b => b.id === '${book.id}')))" style="background:${accent};border-color:${accent};flex:1;min-width:120px;text-align:center;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    ${isPremiumUser ? 'Leer ahora' : 'Leer vista previa'}
                  </a>
                  ${isPremiumUser ? `
                    <button class="bm-btn-ghost" id="btn-download-offline" style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      <span id="dl-text">Descargar offline</span>
                    </button>
                  ` : ''}
                 </div>`
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

  const dlBtn = document.getElementById('btn-download-offline');
  if (dlBtn) {
    dlBtn.addEventListener('click', async () => {
      const dlText = document.getElementById('dl-text');
      dlBtn.disabled = true;
      if (dlText) dlText.textContent = 'Descargando...';
      
      try {
        const token = await currentUser.getIdToken();
        const chaptersCount = book.chapters ? (Array.isArray(book.chapters) ? book.chapters.length : Number(book.chapters)) : 5;
        const downloadedChapters = [];
        const outlineChapters = book.outline?.chapters || book.chapters || [];
        
        for (let idx = 0; idx < chaptersCount; idx++) {
          const res = await fetch(`/api/book/${book.id}/chunk/${idx}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error(`Fallo en el capítulo ${idx+1}`);
          const chunk = await res.json();
          
          downloadedChapters.push({
            id: idx + 1,
            title: (outlineChapters[idx] && outlineChapters[idx].title) || `Capítulo ${idx + 1}`,
            desc: (outlineChapters[idx] && (outlineChapters[idx].desc || outlineChapters[idx].arc)) || "",
            content: "",
            encryptedContent: chunk.data,
            iv: chunk.iv
          });
          
          if (dlText) {
            dlText.textContent = `Descargando... ${Math.round(((idx + 1) / chaptersCount) * 100)}%`;
          }
        }
        
        const offlineBookData = {
          id: book.id,
          title: book.title,
          author: book.author,
          cover: book.cover,
          cat: book.cat,
          genre: book.genre,
          chapters: downloadedChapters
        };
        
        await saveBookOffline(book.id, offlineBookData, "offline_license_token_valid");
        
        if (dlText) dlText.textContent = '✓ Guardado Offline';
        dlBtn.style.background = '#5CB88A';
        dlBtn.style.borderColor = '#5CB88A';
        dlBtn.style.color = '#fff';
      } catch (err) {
        console.error("Error al descargar libro:", err);
        if (dlText) dlText.textContent = 'Fallo de descarga';
        dlBtn.disabled = false;
      }
    });
  }
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

  // PWA Offline Status Handler
  function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (navigator.onLine) {
      document.body.classList.remove('is-offline');
      if (banner) banner.style.display = 'none';
      
      // Si la categoría era 'descargados' y volvimos online, restablecer a 'all'
      if (currentCat === 'descargados') {
        const pillAll = document.querySelector('.cat-pill[data-cat="all"]');
        if (pillAll) pillAll.click();
      } else {
        fetchLibrary(currentCat);
      }
    } else {
      document.body.classList.add('is-offline');
      if (banner) banner.style.display = 'flex';
      
      // Forzar visualización de descargados
      const pillDescargados = document.getElementById('pill-descargados');
      if (pillDescargados) {
        pillDescargados.style.display = 'inline-block';
        pillDescargados.click();
      }
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Botón de Arrepentimiento Integration (Gobernanza)
  const btnArrepentimiento = document.getElementById('btn-arrepentimiento');
  const modalArrepentimiento = document.getElementById('arrepentimiento-modal');
  const closeArrepentimiento = document.getElementById('close-arrepentimiento');
  const formArrepentimiento = document.getElementById('arrepentimiento-form');
  const successArrepentimiento = document.getElementById('arre-success-msg');

  if (btnArrepentimiento && modalArrepentimiento && closeArrepentimiento) {
    btnArrepentimiento.onclick = (e) => {
      e.preventDefault();
      modalArrepentimiento.style.display = 'flex';
      if (formArrepentimiento) formArrepentimiento.style.display = 'block';
      if (successArrepentimiento) successArrepentimiento.style.display = 'none';

      // Pre-llenar campos si el usuario está autenticado
      if (currentUser) {
        const inputEmail = document.getElementById('arre-email');
        const inputName = document.getElementById('arre-name');
        if (inputEmail) inputEmail.value = currentUser.email || '';
        if (inputName) inputName.value = currentUser.displayName || '';
      }
    };

    closeArrepentimiento.onclick = () => {
      modalArrepentimiento.style.display = 'none';
    };

    modalArrepentimiento.onclick = (e) => {
      if (e.target === modalArrepentimiento) modalArrepentimiento.style.display = 'none';
    };

    if (formArrepentimiento) {
      formArrepentimiento.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('arre-email').value;
        const name = document.getElementById('arre-name').value;
        const reason = document.getElementById('arre-reason').value;

        const btnSubmit = formArrepentimiento.querySelector('button[type="submit"]');
        if (btnSubmit) {
          btnSubmit.disabled = true;
          btnSubmit.textContent = 'Enviando...';
        }

        try {
          const res = await fetch('/api/arrepentimiento', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, name, reason })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error?.message || 'Error al procesar revocación');

          console.log("  ✦ [Gobernanza] Solicitud de arrepentimiento procesada con éxito:", data);
          formArrepentimiento.style.display = 'none';
          if (successArrepentimiento) successArrepentimiento.style.display = 'block';
        } catch (err) {
          console.error("  ✗ [Gobernanza] Error al enviar arrepentimiento:", err);
          alert(`Error: ${err.message}`);
        } finally {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Confirmar Revocación';
          }
        }
      };
    }
  }

  // Ejecutar verificación inicial después de un breve delay para permitir el setup de auth
  setTimeout(updateOnlineStatus, 500);
});
