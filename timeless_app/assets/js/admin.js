import { auth, onAuthStateChanged } from '../../firebase_config.js';

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
    const mainContainer = $('main-admin-container');
    if (mainContainer) mainContainer.style.display = 'block';
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

// ── Dynamic Kids fields toggle logic ──────────────────────────────────────────
$('book-cat').onchange = () => {
  const isKids = $('book-cat').value === 'kids';
  const kidsFields = $('kids-extra-fields');
  if (kidsFields) kidsFields.style.display = isKids ? 'block' : 'none';
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

// ── Publicar / editar obra (vía servidor) ───────────────────────────────────
// El servidor escribe el doc público y books_full en un solo lote; desde el
// navegador books_full no es escribible (reglas de Firestore).
let editingId = null;

function readForm() {
  const coverType = $('book-cover').value;
  const badge = $('book-badge').value === 'none' ? '' : $('book-badge').value;
  const book = {
    title: $('book-title').value.trim(),
    author: $('book-author').value.trim(),
    cat: $('book-cat').value,
    genre: $('book-genre').value.trim(),
    cover: coverType === 'custom' ? $('book-cover-custom').value.trim() : coverType,
    badge,
    badgeText: badge ? $('book-badge-text').value.trim() : '',
    pages: parseInt($('book-pages').value, 10),
    duration: $('book-duration').value.trim(),
    desc: $('book-desc').value.trim()
  };
  if (book.cat === 'kids') {
    book.ageBadge = $('kids-age-badge').value.trim();
    book.collectionTitle = $('kids-collection-title').value.trim();
    book.coverAccent = $('kids-cover-accent').value;
    book.coverAccentMuted = $('kids-cover-accent-muted').value;
  }
  const chapters = Array.from(chaptersContainer.querySelectorAll('.chapter-block')).map(block => ({
    title: block.querySelector('.ch-title').value.trim(),
    desc: block.querySelector('.ch-desc').value.trim(),
    content: block.querySelector('.ch-content').value
  }));
  return { book, chapters };
}

function resetForm() {
  $('book-upload-form').reset();
  chaptersContainer.innerHTML = '';
  chapterCount = 0;
  createChapterBlock();
  $('book-cover').onchange();
  $('book-cat').onchange();
  setEditing(null, '');
}

function setEditing(id, title) {
  editingId = id;
  const banner = $('edit-banner');
  banner.hidden = !id;
  banner.replaceChildren();
  if (id) {
    banner.append(document.createTextNode(`Editando «${title}» (${id}). Se conservan sus datos no visibles en este formulario. `));
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn-mini'; cancel.textContent = 'Cancelar edición';
    cancel.addEventListener('click', resetForm);
    banner.append(cancel);
  }
  $('btn-publish-submit').textContent = id ? 'Guardar cambios' : 'Publicar en Timeless';
}

$('book-upload-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!auth.currentUser || auth.currentUser.email !== 'matiaseorejas@gmail.com') {
    alert("Operación denegada: Sesión no autorizada.");
    return;
  }
  const btnSubmit = $('btn-publish-submit');
  btnSubmit.disabled = true;
  btnSubmit.textContent = editingId ? "Guardando cambios..." : "Publicando obra en Timeless...";

  try {
    const { book, chapters } = readForm();
    if (chapters.length === 0) throw new Error("La obra debe contener al menos un capítulo.");

    const send = (overwrite) => adminApi('/api/admin/books', {
      method: 'POST',
      body: JSON.stringify({ id: editingId || undefined, book, chapters, overwrite })
    });
    let result;
    try {
      result = await send(false);
    } catch (err) {
      if (!/Ya existe una obra/.test(err.message)) throw err;
      if (!confirm(`${err.message} ¿Querés reemplazarla por esta nueva versión? Esta acción no se puede deshacer.`)) {
        throw new Error("Publicación cancelada: ya existe una obra con ese mismo título/ID.");
      }
      result = await send(true);
    }

    $('btn-go-reader').href = `reader.html?id=${encodeURIComponent(result.id)}`;
    $('success-message').textContent = editingId ? 'Los cambios de la obra se guardaron.' : 'La obra ha sido incorporada al catálogo dinámico de Timeless de forma segura.';
    $('success-overlay').classList.add('visible');
    resetForm();
  } catch (error) {
    console.error("Error al publicar:", error);
    alert(`Error al publicar la obra: ${error.message}`);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = editingId ? "Guardar cambios" : "Publicar en Timeless";
  }
};

// Cargar una obra existente en el formulario para editarla.
async function startEdit(id) {
  const { book, chapters } = await adminApi(`/api/admin/books/${encodeURIComponent(id)}`);
  resetForm();
  const setSelect = (sel, value, label) => {
    if (![...sel.options].some(o => o.value === value)) { const o = document.createElement('option'); o.value = value; o.textContent = label || value; sel.append(o); }
    sel.value = value;
  };
  $('book-title').value = book.title || '';
  $('book-author').value = book.author || '';
  setSelect($('book-cat'), book.cat || 'ficcion');
  $('book-cat').onchange();
  $('book-genre').value = book.genre || '';
  const knownCover = [...$('book-cover').options].some(o => o.value === book.cover);
  $('book-cover').value = knownCover ? book.cover : 'custom';
  $('book-cover').onchange();
  if (!knownCover) $('book-cover-custom').value = book.cover || '';
  $('book-badge').value = book.badge === 'new' || book.badge === 'excl' ? book.badge : 'none';
  $('book-badge-text').value = book.badgeText || '';
  $('book-pages').value = book.pages || '';
  $('book-duration').value = book.duration || '';
  $('book-desc').value = book.desc || '';
  if (book.cat === 'kids') {
    $('kids-age-badge').value = book.ageBadge || '';
    $('kids-collection-title').value = book.collectionTitle || '';
    if (book.coverAccent) $('kids-cover-accent').value = book.coverAccent;
    if (book.coverAccentMuted) $('kids-cover-accent-muted').value = book.coverAccentMuted;
  }

  chaptersContainer.innerHTML = '';
  chapterCount = 0;
  const outline = (book.outline && book.outline.chapters) || [];
  const count = Math.max(chapters.length, outline.length, 1);
  for (let i = 0; i < count; i++) {
    createChapterBlock();
    const block = chaptersContainer.lastElementChild;
    block.querySelector('.ch-title').value = (outline[i] && outline[i].title) || `Capítulo ${i + 1}`;
    block.querySelector('.ch-desc').value = (outline[i] && (outline[i].arc || outline[i].desc)) || '';
    const html = typeof chapters[i] === 'string' ? chapters[i] : '';
    // Se quitan solo las etiquetas de párrafo: el formato en línea (cursivas, etc.) se conserva.
    block.querySelector('.ch-content').value = html.split(/<\/p>\s*/i).map(p => p.replace(/^\s*<p>/i, '').trim()).filter(Boolean).join('\n');
  }
  setEditing(id, book.title || id);
  document.querySelector('.admin-tab[data-panel="panel-publish"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Close Success Modal ──────────────────────────────────────────────────────
$('btn-close-success-ui').onclick = () => {
  $('success-overlay').classList.remove('visible');
};

// ── Operación del negocio (pestañas) ─────────────────────────────────────────
// Todo se pinta con textContent/createElement: los datos (tickets, nombres)
// vienen de usuarios y nunca deben interpretarse como HTML.
async function adminApi(path, options = {}) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Error ${res.status}`);
  return data;
}

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
const fmtDate = iso => iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const loaders = { 'panel-overview': loadOverview, 'panel-catalog': loadCatalog, 'panel-tickets': loadTickets };

document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === tab.dataset.panel));
    loaders[tab.dataset.panel]?.();
  });
});

async function loadOverview() {
  const list = $('health-list');
  try {
    const o = await adminApi('/api/admin/overview');
    $('st-books').textContent = o.books;
    $('st-premium').textContent = o.premiumUsers;
    $('st-tickets').textContent = o.pendingTickets;
    const rows = [
      [o.dlocalConfigured ? 'ok' : 'bad', o.dlocalConfigured ? 'Pagos (dLocal Go): credenciales cargadas' : 'Pagos (dLocal Go): FALTAN credenciales — nadie puede pagar'],
      [o.dlocalSandbox ? 'warn' : 'ok', o.dlocalSandbox ? 'Pagos en modo SANDBOX (definí DLOCAL_SANDBOX=false al usar credenciales reales)' : 'Pagos en modo producción'],
      [o.geminiConfigured ? 'ok' : 'bad', o.geminiConfigured ? 'IA (Gemini): clave cargada' : 'IA (Gemini): FALTA la clave — el Agente Escritor no funciona'],
      [o.devMode ? 'bad' : 'ok', o.devMode ? 'MODO DESARROLLO ACTIVO (TIMELESS_DEV): quitar en producción' : 'Modo desarrollo desactivado'],
      [o.pendingTickets > 0 ? 'warn' : 'ok', o.pendingTickets > 0 ? `${o.pendingTickets} solicitud(es) de arrepentimiento sin resolver` : 'Sin arrepentimientos pendientes']
    ];
    list.replaceChildren(...rows.map(([cls, txt]) => el('li', (cls === 'ok' ? '✓ ' : cls === 'warn' ? '! ' : '✗ ') + txt, cls)));
  } catch (e) {
    list.replaceChildren(el('li', 'No se pudo cargar el resumen: ' + e.message, 'bad'));
  }
}

async function loadCatalog() {
  const body = $('catalog-body'); const msg = $('catalog-msg');
  msg.textContent = 'Cargando…';
  try {
    const { books } = await adminApi('/api/admin/books');
    msg.textContent = `${books.length} obras`;
    body.replaceChildren(...books.sort((a, b) => a.title.localeCompare(b.title)).map(b => {
      const tr = document.createElement('tr');
      const actions = el('td'); const wrap = el('div', null, 'row-actions');
      const read = el('a', 'Abrir', 'btn-mini'); read.href = `reader.html?id=${encodeURIComponent(b.id)}`; read.style.textDecoration = 'none';
      const edit = el('button', 'Editar', 'btn-mini'); edit.type = 'button';
      edit.addEventListener('click', async () => { try { await startEdit(b.id); } catch (e) { alert(e.message); } });
      const del = el('button', 'Eliminar', 'btn-mini danger'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm(`¿Eliminar "${b.title}" del catálogo? Esta acción no se puede deshacer.`)) return;
        try { await adminApi(`/api/admin/books/${encodeURIComponent(b.id)}`, { method: 'DELETE' }); tr.remove(); }
        catch (e) { alert(e.message); }
      });
      wrap.append(read, edit, del); actions.append(wrap);
      tr.append(el('td', b.title), el('td', b.author), el('td', b.cat), actions);
      return tr;
    }));
  } catch (e) { msg.textContent = 'Error: ' + e.message; }
}

async function loadTickets() {
  const body = $('tickets-body'); const msg = $('tickets-msg');
  msg.textContent = 'Cargando…';
  try {
    const { tickets } = await adminApi('/api/admin/tickets');
    msg.textContent = tickets.length ? '' : 'No hay solicitudes registradas.';
    body.replaceChildren(...tickets.map(t => {
      const tr = document.createElement('tr');
      const pill = el('span', t.status === 'resolved' ? 'Resuelto' : 'Pendiente', `badge-pill ${t.status === 'resolved' ? 'resolved' : 'pending'}`);
      const who = el('td'); who.append(el('div', t.name), el('div', t.email, 'admin-msg'));
      const act = el('td'); const btn = el('button', t.status === 'resolved' ? 'Reabrir' : 'Marcar resuelto', 'btn-mini'); btn.type = 'button';
      btn.addEventListener('click', async () => {
        try { await adminApi(`/api/admin/tickets/${encodeURIComponent(t.ticketId)}`, { method: 'POST', body: JSON.stringify({ status: t.status === 'resolved' ? 'pending' : 'resolved' }) }); loadTickets(); }
        catch (e) { alert(e.message); }
      });
      act.append(btn);
      const status = el('td'); status.append(pill);
      tr.append(el('td', fmtDate(t.timestamp)), who, el('td', t.reason || '—'), status, act);
      return tr;
    }));
  } catch (e) { msg.textContent = 'Error: ' + e.message; }
}

$('user-lookup-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('user-msg'); const out = $('user-result');
  msg.textContent = 'Buscando…'; out.replaceChildren();
  try {
    const u = await adminApi('/api/admin/users/lookup?email=' + encodeURIComponent($('user-email').value.trim()));
    msg.textContent = '';
    const card = el('table', null, 'admin-table'); const tb = document.createElement('tbody');
    [['Email', u.email], ['UID', u.uid], ['Nombre', u.displayName || '—'], ['Acceso', u.providers.join(', ') || '—'],
     ['Alta', fmtDate(u.createdAt)], ['Último ingreso', fmtDate(u.lastSignIn)],
     ['Premium', u.active ? 'Activo' : (u.isPremium ? 'Vencido' : 'No')], ['Plan', u.plan || '—'],
     ['Vence', u.premiumUntil ? fmtDate(u.premiumUntil) : (u.active ? 'Sin vencimiento (anterior al control)' : '—')]
    ].forEach(([k, v]) => { const tr = document.createElement('tr'); tr.append(el('td', k), el('td', v)); tb.append(tr); });
    card.append(tb); out.append(card);

    const form = el('div', null, 'inline-form'); form.style.marginTop = '20px';
    const plan = document.createElement('select');
    [['courtesy', 'Cortesía (días a elegir)'], ['monthly', 'Plan Mensual (31 días)'], ['annual', 'Plan Anual (366 días)'], ['family', 'Plan Familiar (31 días)']]
      .forEach(([v, t]) => { const o = el('option', t); o.value = v; plan.append(o); });
    const days = document.createElement('input'); days.type = 'number'; days.min = 1; days.max = 366; days.value = 30; days.style.minWidth = '90px';
    plan.addEventListener('change', () => { days.style.display = plan.value === 'courtesy' ? '' : 'none'; });
    const grant = el('button', 'Otorgar / extender premium', 'btn-mini'); grant.type = 'button';
    const revoke = el('button', 'Revocar premium', 'btn-mini danger'); revoke.type = 'button';
    const run = async (payload, okText) => {
      try { await adminApi('/api/admin/users/premium', { method: 'POST', body: JSON.stringify({ uid: u.uid, ...payload }) }); msg.textContent = okText; $('user-lookup-form').requestSubmit(); }
      catch (e) { msg.textContent = 'Error: ' + e.message; }
    };
    grant.addEventListener('click', () => run({ planId: plan.value, days: parseInt(days.value, 10) }, 'Premium actualizado.'));
    revoke.addEventListener('click', () => { if (confirm(`¿Revocar el acceso premium de ${u.email}?`)) run({ revoke: true }, 'Premium revocado.'); });
    form.append(plan, days, grant, revoke); out.append(form);
  } catch (e) { msg.textContent = e.message; }
});

onAuthStateChanged(auth, user => { if (user && user.email === 'matiaseorejas@gmail.com') loadOverview(); });
