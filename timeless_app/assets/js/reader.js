import { auth, onAuthStateChanged, db, doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, addDoc, query, where, getDocs } from '../../firebase_config.js';
import { CryptoUtils } from './crypto_utils.js';

const $ = id => document.getElementById(id);
const state = {
  book: null,
  bookId: null,
  currentChapter: 0,
  theme: localStorage.getItem('tl_theme') || 'paper',
  fontSize: parseInt(localStorage.getItem('tl_fontSize') || '20'),
  fontFamily: localStorage.getItem('tl_font') || 'serif',
  start: Date.now(),
  lastScroll: 0,
  focusMode: false,
  focusTimeout: null,
  gift: null,
  highlights: []
};

// ── Data Loading ─────────────────────────────────────────────────────────────
async function loadBook() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  const giftToken = urlParams.get('gift');

  if (!id && !giftToken) { 
    const tlfData = sessionStorage.getItem('tlf_import');
    if (tlfData) {
      await handleTLFImport(JSON.parse(tlfData));
      return;
    }
    window.location.href = 'index.html'; 
    return; 
  }
  
  try {
    state.bookId = id;

    // Lógica de Regalo e Invitación
    if (giftToken && !id) {
      const giftSnap = await getDoc(doc(db, "gifts", giftToken));
      if (!giftSnap.exists()) throw new Error("El link de invitación ha expirado.");
      
      const giftData = giftSnap.data();
      state.gift = { id: giftToken, ...giftData };
      state.bookId = giftData.bookId;

      if (!auth.currentUser) {
        state.isPreview = true;
      } else if (!giftData.claimed && giftData.fromUserId !== auth.currentUser.uid) {
        await claimGift(giftToken, giftData);
      }
    }

    let snap = await getDoc(doc(db, "books", state.bookId));
    if (!snap.exists()) snap = await getDoc(doc(db, "obras", state.bookId));
    if (!snap.exists()) throw new Error("Obra no encontrada o acceso restringido.");

    const data = snap.data();
    state.book = formatBookData(data);

    if (state.gift) showInvitationCard(state.gift);

    renderTOC();
    
    // Si no es un regalo/preview, cargar el progreso guardado y los subrayados
    if (!state.isPreview && auth.currentUser) {
      await Promise.all([loadProgress(), loadHighlights()]);
      renderChapter(state.currentChapter);
    } else {
      if (state.isPreview) renderPreview();
      else renderChapter(0);
    }

  } catch (e) {
    showErrorState(e.message);
  }
}

async function handleTLFImport(tlfFile) {
  if (!auth.currentUser) throw new Error("Debes iniciar sesión para abrir un archivo .tlf protegido.");

  try {
    const userId = auth.currentUser.uid;
    const obraId = tlfFile.metadata.id;

    const decrypted = await CryptoUtils.decrypt(tlfFile.payload, userId, obraId);
    
    state.book = {
      title: tlfFile.metadata.title,
      author: tlfFile.metadata.author,
      chapters: decrypted.chapters
    };

    renderTOC();
    renderChapter(0);
    sessionStorage.removeItem('tlf_import'); // Limpiar tras cargar
  } catch (e) {
    showErrorState("Error de DRM: Este archivo está vinculado a otro usuario o la llave es inválida.");
  }
}

function formatBookData(data) {
  if (data.outline) {
    return {
      title: data.title || data.outline.title,
      author: data.author || "Timeless Agent",
      cover: data.cover || 'assets/cover.png',
      chapters: data.chapters.map((c, i) => ({
        id: i + 1,
        title: data.outline.chapters[i]?.title || `Capítulo ${i+1}`,
        desc: data.outline.chapters[i]?.arc || "",
        content: c
      }))
    };
  }
  return data;
}

async function claimGift(token, data) {
  const claimRef = doc(db, "gifts", `gift_${state.bookId}_${auth.currentUser.uid}`);
  await setDoc(claimRef, {
    ...data,
    claimed: true,
    claimedBy: auth.currentUser.uid,
    claimedAt: serverTimestamp()
  });
  await updateDoc(doc(db, "gifts", token), { claimed: true });
}

function renderPreview() {
  const ch = state.book.chapters[0];
  const container = $('reading-content');
  
  // Tomamos solo los primeros 3 párrafos para el preview
  const previewParagraphs = ch.content.split('\n').filter(p => p.trim()).slice(0, 3);
  const contentHtml = previewParagraphs.map(p => `<p>${p}</p>`).join('');

  container.innerHTML = `
    <div class="chapter-heading">
      <h1 class="chapter-title">${ch.title}</h1>
      <div class="chapter-desc">${ch.desc || ""}</div>
    </div>
    <div class="reading-body font-${state.fontFamily} preview-mode">
      ${contentHtml}
      <div class="preview-fade"></div>
    </div>
    <div class="invitation-cta">
      <div class="cta-card">
        <h3>Continúa la lectura</h3>
        <p>Has llegado al final de la vista previa de cortesía. Acepta la invitación de <strong>${state.gift.fromName}</strong> para añadir esta obra a tu biblioteca y seguir leyendo.</p>
        <button onclick="window.location.href='index.html'" class="btn-accept-invitation">
          Aceptar Invitación y Continuar
        </button>
        <span class="cta-note">Es gratis para invitados. Timeless Editorial.</span>
      </div>
    </div>
  `;
  window.scrollTo(0, 0);
}

function showInvitationCard(gift) {
  const card = document.createElement('div');
  card.id = 'invitation-overlay';
  card.className = 'invitation-overlay visible';
  card.innerHTML = `
    <div class="invitation-card-inner">
      <div class="invitation-header">
        <div class="editorial-logo">TIMELESS</div>
        <div class="invitation-label">Invitación de Cortesía</div>
      </div>
      <div class="invitation-body">
        <img src="${state.book.cover || 'assets/cover.png'}" class="invitation-cover" />
        <h2 class="invitation-book-title">${state.book.title}</h2>
        <p class="invitation-sender">Un obsequio personal de <strong>${gift.fromName}</strong></p>
        ${gift.personalNote ? `<div class="personal-note">&ldquo;${gift.personalNote}&rdquo;</div>` : ''}
      </div>
      <button class="btn-start-reading" onclick="document.getElementById('invitation-overlay').remove()">
        Empezar a leer
      </button>
    </div>
  `;
  document.body.appendChild(card);
}

function showErrorState(msg) {
  $('reading-content').innerHTML = `
    <div style="text-align:center; padding:100px; font-family:var(--font-serif);">
      <div style="font-size: 50px; margin-bottom: 20px;">✉️</div>
      <h2>${msg}</h2><br>
      <p style="color:var(--text-muted); max-width:400px; margin: 0 auto 30px;">
        Esta invitación podría haber expirado o requerir una cuenta de Timeless activa.
      </p>
      <a href="index.html" class="btn-nav">Ir al Inicio</a>
    </div>`;
}

// ── Rendering ────────────────────────────────────────────────────────────────
function renderChapter(idx) {
  state.currentChapter = idx;
  const ch = state.book.chapters[idx];
  
  // Update Header/UI
  $('top-title').textContent = state.book.title;
  $('top-ch').textContent = `Capítulo ${ch.id}`;
  $('nav-info').textContent = `Capítulo ${ch.id} de ${state.book.chapters.length}`;
  $('nav-title').textContent = ch.title;
  $('btn-prev').disabled = idx === 0;
  $('btn-next').disabled = idx === state.book.chapters.length - 1;

  // Content with Animation
  const container = $('reading-content');
  container.style.opacity = '0';
  
  setTimeout(() => {
    container.innerHTML = `
      <div class="chapter-heading">
        <h1 class="chapter-title">${ch.title}</h1>
        <div class="chapter-desc">${ch.desc || ""}</div>
      </div>
      <div class="reading-body font-${state.fontFamily}">
        ${ch.content}
      </div>
    `;
    container.style.opacity = '1';
    
    // Restaurar scroll si estamos cargando el capítulo guardado por primera vez en la sesión
    if (state.restoringScroll && state.savedScrollY) {
      window.scrollTo({ top: state.savedScrollY, behavior: 'instant' });
      state.restoringScroll = false;
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    
    applyHighlightsToDOM();
    updateProgress();
  }, 300);
}

function renderTOC() {
  $('chapter-list').innerHTML = state.book.chapters.map((ch, i) => `
    <div class="chapter-item" data-idx="${i}">
      <div class="chapter-num">${ch.id}</div>
      <div class="chapter-name">${ch.title}</div>
    </div>
  `).join('');
  
  document.querySelectorAll('.chapter-item').forEach(el => {
    el.onclick = () => {
      renderChapter(parseInt(el.dataset.idx));
      closeAll();
    };
  });
}

// ── UI Controls ──────────────────────────────────────────────────────────────
const closeAll = () => {
  document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
  $('panel-overlay').classList.remove('visible');
};

$('btn-toc').onclick = () => {
  $('toc-panel').classList.add('open');
  $('panel-overlay').classList.add('visible');
};

$('btn-notes').onclick = () => {
  $('notes-panel').classList.add('open');
  $('panel-overlay').classList.add('visible');
};

$('btn-settings').onclick = () => {
  $('settings-panel').classList.add('open');
  $('panel-overlay').classList.add('visible');
};

$('panel-overlay').onclick = closeAll;
$('btn-back').onclick = () => window.location.href = 'index.html';
$('btn-prev').onclick = () => {
  renderChapter(state.currentChapter - 1);
  saveProgressDebounced();
};
$('btn-next').onclick = () => {
  renderChapter(state.currentChapter + 1);
  saveProgressDebounced();
};

// ── Progress & Focus Mode ────────────────────────────────────────────────────
function updateProgress() {
  const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
  const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrolled = (winScroll / height) * 100;
  $('progress-bar').style.width = scrolled + "%";
}

function handleScroll() {
  updateProgress();
  
  const currentScroll = window.pageYOffset;
  if (currentScroll > 100) {
    if (currentScroll > state.lastScroll) {
      // Scrolling down -> Focus Mode (Hide UI)
      document.querySelector('header').classList.add('hidden');
      document.querySelector('.nav-bottom').classList.add('hidden');
    } else {
      // Scrolling up -> Show UI
      document.querySelector('header').classList.remove('hidden');
      document.querySelector('.nav-bottom').classList.remove('hidden');
    }
  }
  state.lastScroll = currentScroll;
  saveProgressDebounced();
}

window.addEventListener('scroll', handleScroll);

// ── Cloud Sync & Highlights ──────────────────────────────────────────────────
let progressTimeout = null;
function saveProgressDebounced() {
  if (!auth.currentUser || state.isPreview) return;
  clearTimeout(progressTimeout);
  progressTimeout = setTimeout(async () => {
    try {
      const ref = doc(db, 'users', auth.currentUser.uid, 'progress', state.bookId);
      await setDoc(ref, {
        chapter: state.currentChapter,
        scrollY: window.pageYOffset,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch(e) { console.warn("No se pudo guardar progreso", e); }
  }, 1000);
}

async function loadProgress() {
  try {
    const ref = doc(db, 'users', auth.currentUser.uid, 'progress', state.bookId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const p = snap.data();
      state.currentChapter = p.chapter || 0;
      state.savedScrollY = p.scrollY || 0;
      state.restoringScroll = true;
    }
  } catch(e) {}
}

async function loadHighlights() {
  try {
    const q = query(
      collection(db, 'users', auth.currentUser.uid, 'highlights'),
      where('bookId', '==', state.bookId)
    );
    const snap = await getDocs(q);
    state.highlights = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNotesPanel();
  } catch (e) {}
}

function renderNotesPanel() {
  const list = $('notes-list');
  if (state.highlights.length === 0) {
    list.innerHTML = '<div style="color:var(--ink-faint); font-size:13px; text-align:center;">Aún no tienes notas. Selecciona texto en el lector para destacar.</div>';
    return;
  }
  
  list.innerHTML = state.highlights.map(h => `
    <div class="note-item">
      <div style="font-family:var(--font-serif); font-style:italic; font-size:15px; margin-bottom:8px; line-height:1.4;">&ldquo;${h.text}&rdquo;</div>
      <div class="note-footer">
        <div class="note-meta">Capítulo ${h.chapter + 1}</div>
        <button class="btn-share-quote" data-id="${h.id}">Compartir</button>
      </div>
    </div>
  `).join('');
  
  // Vincular click en botones de compartir
  list.querySelectorAll('.btn-share-quote').forEach(btn => {
    btn.onclick = () => {
      const hlId = btn.dataset.id;
      const hl = state.highlights.find(x => x.id === hlId);
      if (hl) {
        shareQuoteCard(hl);
      }
    };
  });
}

// ── Quote Sharing Card (Canvas & Native Share) ────────────────────────────────
function drawQuoteCard(canvas, text, bookTitle, chapterNum) {
  const ctx = canvas.getContext('2d');
  
  // 1. Fondo de papel premium
  ctx.fillStyle = '#F5F1EB'; 
  ctx.fillRect(0, 0, 1080, 1920);
  
  // 2. Bordes ornamentales de lujo
  ctx.strokeStyle = '#C9A96E'; // Borde dorado
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, 1080 - 80, 1920 - 80);
  
  ctx.strokeStyle = '#1C1C1A'; // Delgada línea oscura interna
  ctx.lineWidth = 1;
  ctx.strokeRect(55, 55, 1080 - 110, 1920 - 110);
  
  // 3. Encabezado de Marca
  ctx.fillStyle = '#1C1C1A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.font = "28px 'Inter', sans-serif";
  const headerText = "T I M E L E S S   E D I T O R I A L";
  ctx.fillText(headerText, 1080 / 2, 160);
  
  ctx.fillStyle = '#C9A96E';
  ctx.font = "24px 'EB Garamond', serif";
  ctx.fillText("♦   ♦   ♦", 1080 / 2, 210);
  
  // 4. Comilla gigante dorada translúcida detrás de la cita
  ctx.fillStyle = 'rgba(201, 169, 110, 0.1)';
  ctx.font = "360px 'Playfair Display', 'EB Garamond', serif";
  ctx.fillText("“", 1080 / 2, 600);
  
  // 5. Ajuste y renderizado del texto (WrapText centrado)
  ctx.fillStyle = '#1C1C1A';
  ctx.font = "italic 44px 'Lora', 'EB Garamond', Georgia, serif";
  
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  const maxWidth = 800; // Margen amplio para móviles
  
  for (let n = 0; n < words.length; n++) {
    const testLine = currentLine + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(currentLine.trim());
      currentLine = words[n] + ' ';
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine.trim());
  
  const lineHeight = 65;
  const totalTextHeight = lines.length * lineHeight;
  let startY = 960 - (totalTextHeight / 2); // Centrado vertical absoluto
  
  ctx.font = "italic 44px 'Lora', 'EB Garamond', Georgia, serif";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(`“${lines[i]}”`, 1080 / 2, startY + (i * lineHeight));
  }
  
  // 6. Pie de Página Literario
  ctx.fillStyle = '#C9A96E';
  ctx.font = "20px 'EB Garamond', serif";
  ctx.fillText("♦", 1080 / 2, startY + totalTextHeight + 100);
  
  ctx.fillStyle = '#1C1C1A';
  ctx.font = "bold 32px 'Playfair Display', 'EB Garamond', serif";
  ctx.fillText(bookTitle.toUpperCase(), 1080 / 2, startY + totalTextHeight + 160);
  
  ctx.fillStyle = '#C9A96E';
  ctx.font = "italic 26px 'EB Garamond', Georgia, serif";
  ctx.fillText(`Capítulo ${chapterNum}`, 1080 / 2, startY + totalTextHeight + 210);
  
  // Enlace Web discreto de ultra lujo
  ctx.fillStyle = 'rgba(28, 28, 26, 0.4)';
  ctx.font = "22px 'Inter', sans-serif";
  ctx.fillText("timeless-editorial.onrender.com", 1080 / 2, 1780);
}

function shareQuoteCard(hl) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  
  // Esperar a que las fuentes estén listas antes de dibujar
  document.fonts.ready.then(() => {
    drawQuoteCard(canvas, hl.text, state.book.title, hl.chapter + 1);
    
    const dataUrl = canvas.toDataURL('image/png');
    
    // Crear y mostrar modal
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'modal-overlay visible';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 420px; padding: 25px;">
        <h3 style="font-family: var(--font-serif); font-size: 20px; margin-bottom: 5px;">Comparte tu frase favorita</h3>
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 15px;">Guarda la imagen premium para subirla a tu Historia de Instagram.</p>
        
        <img src="${dataUrl}" class="share-preview-img" style="max-height: 48vh; border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.15);" />
        
        <div class="share-actions" style="margin-top: 15px; display: flex; gap: 10px; justify-content: center;">
          <button id="btn-share-native" class="btn-gift-premium" style="margin: 0; padding: 10px 20px; font-size: 13px; border-radius: 8px;">Compartir</button>
          <a href="${dataUrl}" download="Timeless_Frase_${hl.id}.png" id="btn-download-img" class="btn-nav" style="margin: 0; padding: 10px 20px; font-size: 13px; border-radius: 8px; text-decoration: none; display: inline-block; line-height: 1.4; border: 1px solid var(--border); color: var(--text-primary);">Descargar</a>
        </div>
        
        <button class="btn-close-modal" id="btn-close-share" style="margin-top: 15px; font-size: 12px; opacity: 0.6; background: none; border: none; cursor: pointer; color: var(--text-primary);">Cerrar</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Acción de compartir nativa (iOS/Android)
    $('btn-share-native').onclick = async () => {
      try {
        const file = dataURLtoFile(dataUrl, `Timeless_Frase_${hl.id}.png`);
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Timeless Frase Compartida',
            text: `"${hl.text}" — Leído en Timeless Editorial`
          });
        } else {
          // Fallback si no admite compartir archivos directamente
          await navigator.share({
            title: 'Timeless Frase Compartida',
            text: `"${hl.text}" — Leído en Timeless Editorial: ${window.location.origin}`,
            url: window.location.origin
          });
        }
      } catch (err) {
        // Si el usuario cancela o no se admite
        console.warn("Fallo al compartir:", err);
      }
    };
    
    $('btn-close-share').onclick = () => {
      modal.remove();
    };
  });
}

function dataURLtoFile(dataurl, filename) {
  var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
  bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, {type:mime});
}

function applyHighlightsToDOM() {} // TODO: Regex highlighting logic for advanced view

// Tooltip logic
const tooltip = $('highlight-tooltip');
const btnAdd = $('btn-add-highlight');
let currentSelection = '';

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (sel.isCollapsed || sel.toString().trim() === '') {
    tooltip.classList.remove('visible');
    return;
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  tooltip.style.left = `${rect.left + (rect.width / 2)}px`;
  tooltip.style.top = `${rect.top - 40 + window.scrollY}px`;
  tooltip.classList.add('visible');
  currentSelection = sel.toString().trim();
});

btnAdd.onclick = async () => {
  if (!currentSelection || !auth.currentUser) return;
  tooltip.classList.remove('visible');
  
  try {
    const hl = {
      bookId: state.bookId,
      chapter: state.currentChapter,
      text: currentSelection,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, 'users', auth.currentUser.uid, 'highlights'), hl);
    state.highlights.push({ id: docRef.id, ...hl });
    renderNotesPanel();
    
    // Quick visual feedback
    const sel = window.getSelection();
    if (!sel.isCollapsed) {
      const span = document.createElement('span');
      span.className = 'highlighted-text';
      span.textContent = currentSelection;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(span);
      sel.removeAllRanges();
    }
  } catch (e) {
    alert("Error al guardar subrayado");
  }
};

// ── Settings Management ──────────────────────────────────────────────────────
const updateUI = () => {
  document.body.setAttribute('data-theme', state.theme);
  document.documentElement.style.setProperty('--font-size', state.fontSize + 'px');
  $('fs-val').textContent = state.fontSize + 'px';
  
  // Update Reading Body Class
  const body = document.querySelector('.reading-body');
  if (body) {
    body.className = `reading-body font-${state.fontFamily}`;
  }

  // Active States in Settings
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === state.theme);
  });
  document.querySelectorAll('.font-option').forEach(b => {
    b.classList.toggle('active', b.dataset.font === state.fontFamily);
  });
};

// Event Listeners for Settings
document.querySelectorAll('.theme-btn').forEach(b => {
  b.onclick = () => {
    state.theme = b.dataset.theme;
    localStorage.setItem('tl_theme', state.theme);
    updateUI();
  };
});

document.querySelectorAll('.font-option').forEach(b => {
  b.onclick = () => {
    state.fontFamily = b.dataset.font;
    localStorage.setItem('tl_font', state.fontFamily);
    updateUI();
  };
});

$('btn-fs-dec').onclick = () => {
  if (state.fontSize > 12) {
    state.fontSize--;
    localStorage.setItem('tl_fontSize', state.fontSize);
    updateUI();
  }
};

$('btn-fs-inc').onclick = () => {
  if (state.fontSize < 40) {
    state.fontSize++;
    localStorage.setItem('tl_fontSize', state.fontSize);
    updateUI();
  }
};

// ── Gift Generation ──────────────────────────────────────────────────────────
async function generateGift() {
  if (!auth.currentUser) {
    alert("Debes iniciar sesión para regalar una obra.");
    return;
  }

  const note = prompt("Añade una nota personal para tu invitado (opcional):", "Leí esto y pensé en ti.");
  
  const btn = $('btn-gift-action');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generando obsequio...";
  }

  try {
    const giftId = `gift_${state.bookId}_${Math.random().toString(36).substring(2, 9)}`;
    const giftRef = doc(db, "gifts", giftId);
    
    await setDoc(giftRef, {
      bookId: state.bookId,
      bookTitle: state.book.title,
      fromUserId: auth.currentUser.uid,
      fromName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
      personalNote: note,
      claimed: false,
      createdAt: serverTimestamp()
    });

    const giftUrl = `${window.location.origin}${window.location.pathname}?gift=${giftId}`;
    
    // Mostrar modal con el link
    showGiftModal(giftUrl);

  } catch (e) {
    console.error("Error generating gift:", e);
    alert("No se pudo generar el regalo. Inténtalo de nuevo.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Regalar esta obra";
    }
  }
}

function showGiftModal(url) {
  const modal = document.createElement('div');
  modal.id = 'gift-modal';
  modal.className = 'modal-overlay visible';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="gift-modal-header">
        <span class="gift-icon-large">🎁</span>
        <h2>¡Gesto literario completado!</h2>
        <p>Comparte este link con alguien especial para que pueda leer esta obra gratuitamente.</p>
      </div>
      <div class="gift-link-wrap">
        <input type="text" id="gift-url-input" value="${url}" readonly />
        <button id="btn-copy-gift">Copiar</button>
      </div>
      <p class="gift-hint">Recuerda: El destinatario podrá leer la obra completa una vez iniciada su sesión.</p>
      <button class="btn-close-modal" id="btn-close-gift">Cerrar</button>
    </div>
  `;
  document.body.appendChild(modal);

  $('btn-copy-gift').onclick = () => {
    $('gift-url-input').select();
    document.execCommand('copy');
    $('btn-copy-gift').textContent = "¡Copiado!";
    setTimeout(() => $('btn-copy-gift').textContent = "Copiar", 2000);
  };

  $('btn-close-gift').onclick = () => {
    modal.remove();
  };
}

// ── Timer & Auth ─────────────────────────────────────────────────────────────
setInterval(() => {
  const elapsed = Math.floor((Date.now() - state.start) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = (elapsed % 60).toString().padStart(2, '0');
  $('timer-val').textContent = `${mins}:${secs}`;
  $('reading-timer').classList.toggle('visible', elapsed > 10);
  
  // Mostrar botón de regalo al final del libro o después de un tiempo de lectura
  if (state.currentChapter === state.book.chapters.length - 1 && elapsed > 30) {
    showGiftCTA();
  }
}, 1000);

function showGiftCTA() {
  if ($('gift-cta')) return;
  const cta = document.createElement('div');
  cta.id = 'gift-cta';
  cta.className = 'gift-cta-container reveal';
  cta.innerHTML = `
    <div class="gift-cta-content">
      <h3>¿Disfrutaste la lectura?</h3>
      <p>Comparte la magia de Timeless regalando una invitación de lectura a un amigo.</p>
      <button id="btn-gift-action" class="btn-gift-premium">
        <span class="gift-icon">🎁</span> Regalar esta obra
      </button>
    </div>
  `;
  $('reading-content').appendChild(cta);
  setTimeout(() => cta.classList.add('in-view'), 100);
  
  $('btn-gift-action').onclick = generateGift;
}

onAuthStateChanged(auth, u => {
  if (u || new URLSearchParams(window.location.search).get('gift')) loadBook();
  else window.location.href = 'index.html';
});

// Init
updateUI();
