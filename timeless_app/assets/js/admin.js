import { 
  auth, onAuthStateChanged, db, doc, setDoc, serverTimestamp 
} from '../../firebase_config.js';

const $ = id => document.getElementById(id);

// ── Auth & Security Restriction ──────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) {
    showAccessDenied("Acceso Denegado: Debes iniciar sesión en tu cuenta editorial.");
  } else if (user.email !== 'matiaseorejas@gmail.com') {
    showAccessDenied("Acceso Denegado: Esta consola es de uso exclusivo para el Editor.");
  } else {
    // Authorized! Hide lock screen with transitions
    const overlay = $('auth-check-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }
});

function showAccessDenied(msg) {
  $('auth-message').textContent = msg;
  $('auth-message').style.color = '#FF5F57';
  const spinner = document.querySelector('.spinner');
  if (spinner) spinner.style.borderColor = '#FF5F57';
  
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 2500);
}

// ── Custom Cover display logic ────────────────────────────────────────────────
$('book-cover').onchange = () => {
  const customInput = $('book-cover-custom');
  if ($('book-cover').value === 'custom') {
    customInput.style.display = 'block';
    customInput.required = true;
  } else {
    customInput.style.display = 'none';
    customInput.required = false;
  }
};

// ── Dynamic Chapters Management ──────────────────────────────────────────────
const chaptersContainer = $('chapters-container');
const btnAddChapter = $('btn-add-chapter-ui');
let chapterCount = 0;

function createChapterBlock() {
  chapterCount++;
  const div = document.createElement('div');
  div.className = 'chapter-block';
  div.id = `chapter-block-${chapterCount}`;
  div.innerHTML = `
    <div class="chapter-header-row">
      <span class="chapter-number-label">Capítulo ${chapterCount}</span>
      <button type="button" class="btn-remove-ch" data-id="${chapterCount}">Remover</button>
    </div>
    
    <div class="form-group">
      <label>Título del Capítulo</label>
      <input type="text" class="ch-title" placeholder="Ej: I. La grieta del acueducto" required />
    </div>
    
    <div class="form-group">
      <label>Arco Narrativo / Descripción del Capítulo (Opcional)</label>
      <input type="text" class="ch-desc" placeholder="Ej: Breve descripción de la atmósfera o de los acontecimientos clave..." />
    </div>
    
    <div class="form-group">
      <label>Contenido del Manuscrito</label>
      <textarea class="ch-content" placeholder="Escribe o pega el texto completo del capítulo aquí. Los saltos de párrafo se mantendrán automáticamente..." required style="min-height: 250px;"></textarea>
    </div>
  `;
  
  chaptersContainer.appendChild(div);
  
  // Bind remove listener
  div.querySelector('.btn-remove-ch').onclick = () => {
    div.remove();
    recalculateChapterNumbers();
  };
}

function recalculateChapterNumbers() {
  const blocks = chaptersContainer.querySelectorAll('.chapter-block');
  chapterCount = 0;
  blocks.forEach(block => {
    chapterCount++;
    block.id = `chapter-block-${chapterCount}`;
    block.querySelector('.chapter-number-label').textContent = `Capítulo ${chapterCount}`;
    block.querySelector('.btn-remove-ch').dataset.id = chapterCount;
  });
}

// Add first chapter block automatically on load
createChapterBlock();
btnAddChapter.onclick = createChapterBlock;

// ── Form Submission to Firestore ────────────────────────────────────────────
$('book-upload-form').onsubmit = async (e) => {
  e.preventDefault();
  
  if (!auth.currentUser || auth.currentUser.email !== 'matiaseorejas@gmail.com') {
    alert("Operación denegada: Sesión no autorizada.");
    return;
  }

  const btnSubmit = $('btn-publish-submit');
  btnSubmit.disabled = true;
  btnSubmit.textContent = "Publicando obra en Timeless...";

  try {
    const title = $('book-title').value.trim();
    const author = $('book-author').value.trim();
    const cat = $('book-cat').value;
    const genre = $('book-genre').value.trim();
    const coverType = $('book-cover').value;
    const cover = coverType === 'custom' ? $('book-cover-custom').value.trim() : coverType;
    
    const badgeType = $('book-badge').value;
    const badge = badgeType === 'none' ? '' : badgeType;
    const badgeText = badge ? $('book-badge-text').value.trim() : '';
    
    const pages = parseInt($('book-pages').value, 10);
    const duration = $('book-duration').value.trim();
    const desc = $('book-desc').value.trim();

    // 1. Recopilar y procesar capítulos
    const chBlocks = chaptersContainer.querySelectorAll('.chapter-block');
    if (chBlocks.length === 0) {
      throw new Error("La obra debe contener al menos un capítulo.");
    }

    const chapters = [];
    chBlocks.forEach((block, idx) => {
      const chTitle = block.querySelector('.ch-title').value.trim();
      const chDesc = block.querySelector('.ch-desc').value.trim();
      const chRawContent = block.querySelector('.ch-content').value.trim();
      
      // Formatear párrafos convirtiendo \n en <p> de lujo
      const formattedContent = chRawContent
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => `<p>${p}</p>`)
        .join('\n');

      chapters.push({
        id: idx + 1,
        title: chTitle,
        desc: chDesc,
        content: formattedContent
      });
    });

    // 2. Generar identificador único (Slug legible)
    const bookId = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remover acentos
      .replace(/[^a-z0-9\s-]/g, "") // remover caracteres especiales
      .trim()
      .replace(/\s+/g, "-"); // reemplazar espacios con guiones

    // 3. Escribir documento en la colección 'books' de Firestore
    const bookData = {
      title,
      author,
      cat,
      genre,
      cover,
      badge,
      badgeText,
      pages,
      duration,
      desc,
      chapters: chapters.map(c => c.content), // Formato para indexación rápida
      outline: {
        title,
        chapters: chapters.map(c => ({ title: c.title, arc: c.desc }))
      },
      createdAt: serverTimestamp()
    };

    await setDoc(doc(db, "books", bookId), bookData);

    // 4. Mostrar Éxito
    $('btn-go-reader').href = `reader.html?id=${bookId}`;
    $('success-overlay').classList.add('visible');
    
    // Resetear formulario
    $('book-upload-form').reset();
    chaptersContainer.innerHTML = '';
    chapterCount = 0;
    createChapterBlock();

  } catch (error) {
    console.error("Error al publicar:", error);
    alert(`Error al publicar la obra: ${error.message}`);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Publicar en Timeless";
  }
};

// ── Close Success Modal ──────────────────────────────────────────────────────
$('btn-close-success-ui').onclick = () => {
  $('success-overlay').classList.remove('visible');
};
