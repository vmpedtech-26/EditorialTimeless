'use strict';
// Prueba de punta a punta por roles. Crea cuentas descartables en el Firebase
// REAL del proyecto (usa serviceAccountKey.json), ejercita la API apuntando a
// E2E_BASE (por defecto el servidor local) y borra todo al terminar.
//
//   E2E_CONFIRM=yes npm run test:e2e                          # contra un servidor local (npm start)
//   E2E_CONFIRM=yes E2E_BASE=https://timeless-editorial.onrender.com npm run test:e2e
//   (agregar E2E_PHASE4=yes para exigir que los docs públicos ya no traigan el texto)
//
// Un servidor local usa la misma base de datos de producción, así que correr
// esto SIEMPRE crea y borra datos reales de prueba: por eso exige E2E_CONFIRM.
const crypto = require('crypto');
const path = require('path');
const admin = require('firebase-admin');

if (process.env.E2E_CONFIRM !== 'yes') {
  console.error('Esta prueba crea y borra cuentas en el Firebase real. Reintentá con E2E_CONFIRM=yes');
  process.exit(2);
}

const BASE = (process.env.E2E_BASE || 'http://localhost:3000').replace(/\/$/, '');
const BOOK = process.env.E2E_BOOK || 'fb2';
const OTHER_BOOK = process.env.E2E_OTHER_BOOK || 'fb1';
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const API_KEY = require('fs').readFileSync(path.join(__dirname, '..', 'firebase_config.js'), 'utf8').match(/apiKey:\s*"([^"]+)"/)[1];
const FS = `https://firestore.googleapis.com/v1/projects/${serviceAccount.project_id}/databases/(default)/documents`;
const RUN = Date.now().toString(36);
const NAMES = ['owner', 'free', 'attacker', 'expired', 'famowner', 'member', 'expfamowner', 'expmember', 'editor'];
const U = {};
const results = [];
const created = { obras: [], invites: [], families: [], books: [], tickets: [] };
const { spawn } = require('child_process');

const rec = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  — ' + detail : ''}`); };
const api = async (p, token, opts = {}) => {
  const res = await fetch(BASE + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) } });
  let body = null; try { body = await res.json(); } catch (e) { /* sin cuerpo JSON */ }
  return { status: res.status, body };
};
const post = (p, token, obj) => api(p, token, { method: 'POST', body: JSON.stringify(obj || {}) });
const fsGet = async (p, token) => (await fetch(`${FS}/${p}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).status;
const fsForgeGift = async (docId, token) => (await fetch(`${FS}/gifts/${docId}`, {
  method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { claimed: { booleanValue: true }, bookId: { stringValue: BOOK } } })
})).status;
const days = n => admin.firestore.Timestamp.fromMillis(Date.now() + n * 86400000);

async function mkUser(name) {
  const email = `claude-e2e-${RUN}-${name}@example.com`;
  const u = await admin.auth().createUser({ email, password: crypto.randomBytes(12).toString('hex') + 'Aa1!', emailVerified: true });
  const ct = await admin.auth().createCustomToken(u.uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true })
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`sin idToken para ${name}: ${JSON.stringify(j)}`);
  U[name] = { uid: u.uid, token: j.idToken, email };
}

function decrypt(chunk, uid, salt) {
  const key = crypto.createHash('sha256').update(salt + uid + BOOK).digest();
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(chunk.iv, 'hex'));
  return d.update(chunk.data, 'hex', 'utf8') + d.final('utf8');
}


// ── Consola del editor: se levanta un servidor LOCAL donde la cuenta "editor"
// descartable hace de editor (ADMIN_EMAIL), así no se usan credenciales reales.
async function adminSuite() {
  const port = 3199, ABASE = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), stdio: 'ignore',
    env: { ...process.env, PORT: String(port), ADMIN_EMAIL: U.editor.email, TIMELESS_DEV: '' }
  });
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 500)); try { up = (await fetch(`${ABASE}/api/health`)).ok; } catch (e) { /* aún no */ } }
    rec('Servidor local del editor arrancó', up);
    if (!up) return;
    const E = U.editor.token;
    const ap = async (p, token, opts = {}) => {
      const res = await fetch(ABASE + p, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
      let body = null; try { body = await res.json(); } catch (e) { /* sin JSON */ }
      return { status: res.status, body };
    };

    let r = await ap('/api/admin/overview', U.owner.token);
    rec('Un premium sigue sin acceder a la consola (403)', r.status === 403, r.status);
    r = await ap('/api/admin/overview', E);
    rec('El editor ve el resumen del sistema', r.status === 200 && typeof r.body.books === 'number' && typeof r.body.dlocalConfigured === 'boolean', JSON.stringify(r.body));

    // Usuarios y premium
    r = await ap(`/api/admin/users/lookup?email=${encodeURIComponent(U.free.email)}`, E);
    rec('Buscar usuario por email', r.status === 200 && r.body.uid === U.free.uid && r.body.active === false, r.status);
    r = await ap('/api/admin/users/lookup?email=nadie-' + RUN + '@example.com', E);
    rec('Usuario inexistente (404)', r.status === 404, r.status);
    r = await ap('/api/admin/users/premium', E, { method: 'POST', body: JSON.stringify({ uid: U.attacker.uid, planId: 'courtesy', days: 5 }) });
    rec('El editor otorga premium de cortesía', r.status === 200 && !!r.body.premiumUntil, r.status);
    r = await ap(`/api/book/${BOOK}/chunk/0`, U.attacker.token);
    rec('Con premium otorgado la cuenta lee', r.status === 200, r.status);
    r = await ap('/api/admin/users/premium', E, { method: 'POST', body: JSON.stringify({ uid: U.attacker.uid, revoke: true }) });
    rec('El editor revoca el premium', r.status === 200, r.status);
    r = await ap(`/api/book/${BOOK}/chunk/0`, U.attacker.token);
    rec('Tras revocar, la cuenta ya no lee (403)', r.status === 403, r.status);
    r = await ap('/api/admin/users/premium', E, { method: 'POST', body: JSON.stringify({ uid: U.free.uid, planId: 'hack' }) });
    rec('Plan inválido al otorgar (400)', r.status === 400, r.status);

    // Publicar, editar y borrar una obra
    const slugTitle = 'E2E Libro ' + RUN;
    const goodBook = { title: slugTitle, author: 'Autor E2E', cat: 'ficcion', genre: 'Ficción de prueba', cover: 'assets/cover_memoria.png', badge: 'new', badgeText: 'Nuevo', pages: 10, duration: '1h', desc: 'Sinopsis de prueba.' };
    const chs = [{ title: 'Uno', desc: 'arco', content: 'Primer párrafo.\n\nSegundo párrafo con <em>énfasis</em>.\nTercero.\nCuarto.' }, { title: 'Dos', desc: '', content: 'Solo un párrafo.' }];
    r = await ap('/api/admin/books', E, { method: 'POST', body: JSON.stringify({ book: { ...goodBook, cat: 'inventada' }, chapters: chs }) });
    rec('Publicar con categoría inválida (400)', r.status === 400, r.status);
    r = await ap('/api/admin/books', E, { method: 'POST', body: JSON.stringify({ book: goodBook, chapters: [] }) });
    rec('Publicar sin capítulos (400)', r.status === 400, r.status);
    r = await ap('/api/admin/books', E, { method: 'POST', body: JSON.stringify({ book: goodBook, chapters: chs }) });
    const bookId = r.body && r.body.id; if (bookId) created.books.push(bookId);
    rec('El editor publica una obra', r.status === 200 && !!bookId, r.status + ' ' + bookId);
    r = await ap('/api/admin/books', E, { method: 'POST', body: JSON.stringify({ book: goodBook, chapters: chs }) });
    rec('Publicar con el mismo título pide confirmar (409)', r.status === 409 && r.body.error.exists === true, r.status);

    const pubDoc = (await db.collection('books').doc(bookId).get()).data();
    const fullDoc = (await db.collection('books_full').doc(bookId).get()).data();
    rec('El doc público no lleva el texto completo y sí el preview', pubDoc && pubDoc.chapters === undefined && pubDoc.previewChapter.split('\n').length === 3, pubDoc && Object.keys(pubDoc).join(','));
    rec('books_full guarda los capítulos con formato de párrafos', fullDoc && fullDoc.chapters.length === 2 && fullDoc.chapters[0].startsWith('<p>Primer párrafo.</p>') && fullDoc.chapters[0].includes('<em>énfasis</em>'));
    r = await ap(`/api/book/${bookId}/chunk/1`, U.owner.token);
    rec('La obra recién publicada se lee de inmediato (premium)', r.status === 200, r.status);

    await db.collection('books').doc(bookId).set({ tagline: 'Se conserva al editar', themes: ['x'] }, { merge: true });
    const created0 = (await db.collection('books').doc(bookId).get()).data().createdAt;
    r = await ap(`/api/admin/books/${bookId}`, E);
    rec('El editor lee la obra completa para editarla', r.status === 200 && r.body.chapters.length === 2 && r.body.book.chapters === undefined && r.body.book.title === slugTitle);
    r = await ap('/api/admin/books', E, { method: 'POST', body: JSON.stringify({ id: bookId, book: { ...goodBook, title: slugTitle + ' (editado)', pages: 11 }, chapters: [chs[0], chs[1], { title: 'Tres', desc: '', content: 'Capítulo nuevo.' }] }) });
    rec('El editor guarda los cambios (mismo ID)', r.status === 200 && r.body.id === bookId, r.status);
    const after = (await db.collection('books').doc(bookId).get()).data();
    const afterFull = (await db.collection('books_full').doc(bookId).get()).data();
    rec('Editar conserva campos ocultos y fecha de creación', after.tagline === 'Se conserva al editar' && after.themes[0] === 'x' && after.createdAt.isEqual(created0));
    rec('Editar actualiza título, capítulos y outline', after.title.endsWith('(editado)') && afterFull.chapters.length === 3 && after.outline.chapters.length === 3);
    r = await ap('/api/admin/books', E, { method: 'POST', body: JSON.stringify({ id: 'no-existe-' + RUN, book: goodBook, chapters: chs }) });
    rec('Editar una obra inexistente (404)', r.status === 404, r.status);

    r = await ap('/api/admin/books', E);
    rec('El catálogo del editor lista la obra', r.status === 200 && r.body.books.some(b => b.id === bookId));
    r = await ap(`/api/admin/books/${bookId}`, E, { method: 'DELETE' });
    rec('El editor elimina la obra', r.status === 200, r.status);
    rec('Eliminar borra el doc público y el texto completo', !(await db.collection('books').doc(bookId).get()).exists && !(await db.collection('books_full').doc(bookId).get()).exists);

    // Arrepentimientos
    r = await fetch(`${ABASE}/api/arrepentimiento`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Prueba E2E', email: `e2e-${RUN}@example.com`, reason: '<b>prueba</b>' }) });
    const tk = await r.json(); if (tk.ticketId) created.tickets.push(tk.ticketId);
    rec('Se registra una solicitud de arrepentimiento', r.status === 200 && !!tk.ticketId, r.status);
    r = await ap('/api/admin/tickets', E);
    const mine = r.body && r.body.tickets && r.body.tickets.find(t => t.ticketId === tk.ticketId);
    rec('El editor ve el ticket pendiente', r.status === 200 && mine && mine.status === 'pending');
    r = await ap(`/api/admin/tickets/${tk.ticketId}`, E, { method: 'POST', body: JSON.stringify({ status: 'resolved' }) });
    rec('El editor resuelve el ticket', r.status === 200 && (await db.collection('arrepentimiento_tickets').doc(tk.ticketId).get()).data().status === 'resolved');
    const audit = await db.collection('admin_audit').where('by', '==', U.editor.email).get();
    rec('Cada acción del editor queda en la auditoría', audit.size >= 6, audit.size + ' registros');
    created.audit = audit.docs.map(d => d.ref);
  } finally {
    child.kill();
  }
}

async function run() {
  console.log(`E2E contra ${BASE} (libro ${BOOK})\n`);
  for (const n of NAMES) await mkUser(n);
  const A = U.owner, B = U.free, C = U.attacker;

  await db.collection('users').doc(A.uid).set({ isPremium: true, premiumUntil: days(31), plan: 'e2e' });
  await db.collection('users').doc(U.expired.uid).set({ isPremium: true, premiumUntil: days(-1), plan: 'e2e' });
  for (const [owner, until] of [['famowner', days(31)], ['expfamowner', days(-1)]]) {
    const fref = db.collection('families').doc(); created.families.push(fref.id);
    await fref.set({ ownerId: U[owner].uid, memberIds: [U[owner].uid], ownerEmail: U[owner].email });
    await db.collection('users').doc(U[owner].uid).set({ isPremium: true, premiumUntil: until, familyId: fref.id, plan: 'e2e_family' });
  }

  // ── Lectura
  let r = await api(`/api/book/${BOOK}/chunk/0`);
  rec('Visitante sin token no lee capítulos (401)', r.status === 401, r.status);
  r = await api(`/api/book/${BOOK}/chunk/0`, B.token);
  rec('Cuenta gratuita no lee capítulos (403)', r.status === 403, r.status);
  r = await api(`/api/book/${BOOK}/chunk/0`, A.token);
  rec('Premium lee el capítulo (200)', r.status === 200 && r.body && r.body.data, r.status);
  const cfg = await api('/api/config', A.token), cfgAnon = await api('/api/config');
  rec('drmSalt solo con sesión', !!cfg.body.drmSalt && !cfgAnon.body.drmSalt);
  if (r.status === 200 && cfg.body.drmSalt) {
    const full = (await db.collection('books_full').doc(BOOK).get()).data().chapters[0];
    rec('El capítulo descifrado coincide con books_full', decrypt(r.body, A.uid, cfg.body.drmSalt) === full);
  }
  r = await api(`/api/book/${BOOK}/chunk/99`, A.token);
  rec('Capítulo inexistente da 404', r.status === 404, r.status);

  // ── Suscripción
  r = await api('/api/subscription/status');
  rec('Estado de suscripción exige sesión (401)', r.status === 401, r.status);
  r = await api('/api/subscription/status', A.token);
  rec('Estado de suscripción del premium', r.status === 200 && r.body.active === true && !!r.body.premiumUntil && r.body.daysLeft >= 30, JSON.stringify(r.body));
  r = await api('/api/subscription/status', B.token);
  rec('Estado de suscripción de la cuenta gratuita', r.status === 200 && r.body.active === false, JSON.stringify(r.body));
  r = await api(`/api/book/${BOOK}/chunk/0`, U.expired.token);
  rec('Suscripción vencida no lee (403)', r.status === 403, r.status);
  await new Promise(s => setTimeout(s, 1500));
  rec('El flag isPremium se baja al detectar el vencimiento', (await db.collection('users').doc(U.expired.uid).get()).data().isPremium === false);
  r = await api('/api/subscription/status', U.expired.token);
  rec('Estado de una suscripción vencida', r.status === 200 && r.body.active === false && r.body.expired === true, JSON.stringify(r.body));

  // ── Regalos de libros
  r = await post('/api/gift/create', B.token, { bookId: BOOK, note: 'x' });
  rec('Cuenta gratuita no puede regalar (403)', r.status === 403, r.status);
  r = await post('/api/gift/create', A.token, { bookId: 'no-existe-' + RUN });
  rec('Regalar una obra inexistente da 404', r.status === 404, r.status);
  r = await post('/api/gift/create', A.token, { bookId: BOOK, note: '<img src=x onerror=alert(1)>' });
  const token = r.body && r.body.token;
  rec('Premium crea regalo', r.status === 200 && new RegExp(`^gift_${BOOK}_[a-f0-9]{10}$`).test(token || ''), token);
  r = await post('/api/gift/claim', A.token, { token });
  rec('No se puede reclamar el propio regalo (400)', r.status === 400, r.status);
  r = await api(`/api/book/${BOOK}/chunk/0`, B.token);
  rec('Antes de reclamar, el destinatario no lee (403)', r.status === 403, r.status);
  r = await post('/api/gift/claim', B.token, { token });
  rec('El destinatario reclama el regalo (200)', r.status === 200 && r.body.bookId === BOOK, r.status);
  r = await api(`/api/book/${BOOK}/chunk/0`, B.token);
  rec('Con el regalo reclamado el destinatario lee (200)', r.status === 200, r.status);
  r = await api(`/api/book/${OTHER_BOOK}/chunk/0`, B.token);
  rec('El regalo no abre OTRA obra (403)', r.status === 403, r.status);
  r = await post('/api/gift/claim', B.token, { token });
  rec('Reclamar dos veces es idempotente (200)', r.status === 200, r.status);
  r = await post('/api/gift/claim', C.token, { token });
  rec('Otro usuario no reclama un regalo ya usado (409)', r.status === 409, r.status);
  r = await post('/api/gift/claim', C.token, { token: `gift_${BOOK}_zzzzzzzzzz` });
  rec('Token de regalo inexistente (404/400)', [400, 404].includes(r.status), r.status);

  // ── Reglas de Firestore como cliente autenticado
  rec('Atacante no escribe gifts directo (403)', (await fsForgeGift(`gift_${BOOK}_${C.uid}`, C.token)) === 403);
  rec('Ningún cliente escribe el catálogo directo (403)', (await fetch(`${FS}/books/${BOOK}`, { method: 'PATCH', headers: { Authorization: `Bearer ${C.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { title: { stringValue: 'hack' } } }) })).status === 403);
  rec('Atacante no lee books_full (403)', (await fsGet(`books_full/${BOOK}`, C.token)) === 403);
  rec('Atacante no lista gifts (403)', (await fsGet('gifts?pageSize=1', C.token)) === 403);
  rec('Un token de regalo se lee individualmente (200)', (await fsGet(`gifts/${token}`, C.token)) === 200);
  const pub = await (await fetch(`${FS}/books/${BOOK}`, { headers: { Authorization: `Bearer ${C.token}` } })).json();
  const leaks = !!(pub.fields && pub.fields.chapters);
  if (process.env.E2E_PHASE4 === 'yes') rec('El doc público del libro NO expone el texto completo (campo chapters)', !leaks);
  else if (leaks) console.log('WARN  El doc público aún expone el texto completo (Fase 4 pendiente; E2E_PHASE4=yes lo exige)');

  // ── Borradores (obras)
  const obraId = 'e2e_obra_' + RUN; created.obras.push(obraId);
  await db.collection('obras').doc(obraId).set({ userId: A.uid, title: 'Borrador e2e', chapters: [] });
  rec('Atacante no lee un borrador ajeno (403)', (await fsGet(`obras/${obraId}`, C.token)) === 403);
  rec('El dueño lee su borrador (200)', (await fsGet(`obras/${obraId}`, A.token)) === 200);
  r = await post('/api/gift/create', B.token, { bookId: obraId });
  rec('Un no-dueño no regala un borrador ajeno (403/404)', [403, 404].includes(r.status), r.status);
  r = await post('/api/gift/create', A.token, { bookId: obraId });
  const otoken = r.body && r.body.token;
  rec('El dueño regala su borrador', r.status === 200 && !!otoken, r.status);
  rec('Antes de reclamar, el destinatario no lee el borrador (403)', (await fsGet(`obras/${obraId}`, C.token)) === 403);
  r = await post('/api/gift/claim', C.token, { token: otoken });
  rec('El destinatario reclama el borrador', r.status === 200, r.status);
  rec('Tras reclamar, el destinatario lee el borrador (200)', (await fsGet(`obras/${obraId}`, C.token)) === 200);

  // ── Plan familiar
  r = await post('/api/family/invite', U.famowner.token);
  const inv = r.body && r.body.inviteId; if (inv) created.invites.push(inv);
  rec('Titular familiar genera invitación', r.status === 200 && !!inv, r.status);
  r = await post('/api/family/join', U.member.token, { inviteId: inv });
  rec('Miembro se une a la familia', r.status === 200, r.status);
  r = await api(`/api/book/${BOOK}/chunk/0`, U.member.token);
  rec('Miembro con titular vigente lee (200)', r.status === 200, r.status);
  r = await api('/api/subscription/status', U.member.token);
  rec('Estado del miembro indica acceso por familia', r.status === 200 && r.body.active === true && r.body.viaFamily === true, JSON.stringify(r.body));
  r = await post('/api/family/invite', B.token);
  rec('Quien no es titular no puede invitar (403)', r.status === 403, r.status);
  r = await post('/api/family/invite', U.expfamowner.token);
  const inv2 = r.body && r.body.inviteId; if (inv2) created.invites.push(inv2);
  await post('/api/family/join', U.expmember.token, { inviteId: inv2 });
  r = await api(`/api/book/${BOOK}/chunk/0`, U.expmember.token);
  rec('Miembro de una familia con titular VENCIDO no lee (403)', r.status === 403, r.status);

  // ── Telemetría
  r = await post('/api/telemetry', A.token, { bookId: 'a/b', chapterIndex: 1 });
  rec('Telemetría con bookId inválido (400)', r.status === 400, r.status);
  r = await post('/api/telemetry', A.token, { bookId: BOOK, chapterIndex: 1, timeSpent: 5, scrollDepth: 0.4 });
  rec('Telemetría válida (200)', r.status === 200, r.status);
  const evs = Array.from({ length: 150 }, (_, i) => ({ bookId: BOOK, chapterIndex: i % 5, timeSpent: 1, scrollDepth: 0.1 }));
  r = await post('/api/telemetry/bulk', A.token, { events: evs.concat([{ bookId: 'x/y' }]) });
  rec('Telemetría masiva acotada a 100 eventos', r.status === 200 && r.body.count === 100, JSON.stringify(r.body));

  // ── Administración (un premium NO es editor)
  for (const p of ['/api/admin/overview', '/api/admin/tickets', '/api/admin/books', `/api/admin/books/${BOOK}`]) {
    r = await api(p, A.token);
    rec(`Premium no accede a ${p} (403)`, r.status === 403, r.status);
  }
  r = await post('/api/admin/users/premium', A.token, { uid: B.uid });
  rec('Premium no otorga premium a otros (403)', r.status === 403, r.status);
  r = await api(`/api/admin/books/${BOOK}`, A.token, { method: 'DELETE' });
  rec('Premium no borra libros (403)', r.status === 403, r.status);

  // ── Pagos
  r = await post('/api/create-checkout-session', B.token, { planId: 'hack', items: [{ unit_price: 0.01, quantity: 1 }] });
  rec('Checkout rechaza un plan inexistente o falla cerrado (400/500)', [400, 500].includes(r.status), r.status);
  r = await fetch(BASE + '/api/webhook/dlocal', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'V2-HMAC-SHA256, Signature: 00', 'X-Date': new Date().toISOString() },
    body: JSON.stringify({ status: 'PAID', order_id: `${B.uid}_annual_1`, id: 'e2e', amount: 89 })
  });
  const u2 = (await db.collection('users').doc(B.uid).get()).data() || {};
  rec('Webhook con firma falsa no otorga premium', r.status !== 200 && !u2.isPremium, 'status ' + r.status);

  await adminSuite();
}

async function cleanup() {
  console.log('\nLimpieza…');
  await new Promise(s => setTimeout(s, 4000));
  const uids = Object.values(U).map(x => x.uid);
  try {
    for (const uid of uids) {
      await db.recursiveDelete(db.collection('users').doc(uid)).catch(() => {});
      await admin.auth().deleteUser(uid).catch(() => {});
      for (const f of ['fromUserId', 'claimedBy']) {
        const s = await db.collection('gifts').where(f, '==', uid).get(); for (const d of s.docs) await d.ref.delete();
      }
      const t = await db.collection('telemetry_logs').where('userId', '==', uid).get(); for (const d of t.docs) await d.ref.delete();
    }
    for (const id of created.obras) {
      await db.collection('obras').doc(id).delete();
      const g = await db.collection('gifts').where('bookId', '==', id).get(); for (const d of g.docs) await d.ref.delete();
    }
    for (const id of created.invites) await db.collection('family_invites').doc(id).delete();
    for (const id of created.families) await db.collection('families').doc(id).delete();
    for (const id of created.books) { await db.collection('books').doc(id).delete(); await db.collection('books_full').doc(id).delete(); }
    for (const id of created.tickets) await db.collection('arrepentimiento_tickets').doc(id).delete();
    for (const ref of created.audit || []) await ref.delete();
    console.log('Cuentas y datos de prueba eliminados.');
  } catch (e) { console.error('Error en limpieza:', e.message); }
}

run().catch(e => { console.error('ERROR DE EJECUCIÓN:', e); results.push({ name: 'ejecución', ok: false }); }).finally(async () => {
  await cleanup();
  const fails = results.filter(x => !x.ok);
  console.log(`\nResultado: ${results.length - fails.length}/${results.length} pruebas OK`);
  if (fails.length) console.log('Fallaron:\n - ' + fails.map(f => f.name).join('\n - '));
  process.exit(fails.length ? 1 : 0);
});
