'use strict';
// Publica un libro terminado en la biblioteca (Firestore).
//
//   node scripts/libro_publicar.js <libro>            simulacro: valida y muestra qué se escribiría
//   node scripts/libro_publicar.js <libro> --apply    escribe books/<id> y books_full/<id>
//
// Exige: plan (outline.json), todos los capítulos y que cada uno apruebe el
// detector de prosa. La firma es siempre "Timeless Editorial".
const L = require('./libro_lib');
(async () => {
  const [slug, flag] = process.argv.slice(2);
  const d = L.dir(slug);
  const enc = L.readJson(d, 'encargo.json');
  const outline = L.readJson(d, 'outline.json');
  const { lintProse } = await L.lint();
  const fmt = L.formatOf(enc);
  const kind = fmt.expository ? 'expository' : 'narrative';
  const total = outline.chapters.length;
  const raw = [];
  const problems = [];
  for (let n = 1; n <= total; n++) {
    const p = L.capFile(d, n);
    if (!L.fs.existsSync(p)) { problems.push(`falta el capítulo ${n}`); continue; }
    const text = L.fs.readFileSync(p, 'utf8').trim();
    const r = lintProse(text, { kind });
    if (!r.pass) problems.push(`el capítulo ${n} no aprueba el detector (${r.score}/100): corregilo con libro_revisar.js`);
    raw.push(text);
  }
  // Control editorial: corrección, legal, arte y aprobación del comité (ficha.json).
  const fichaPath = L.path.join(d, 'ficha.json');
  if (!L.fs.existsSync(fichaPath)) problems.push('falta ficha.json (copiala desde libros/_plantilla/ficha.json y completala tras la revisión)');
  else {
    const f = JSON.parse(L.fs.readFileSync(fichaPath, 'utf8'));
    const open = (obj, pre) => Object.entries(obj).flatMap(([k, v]) => typeof v === 'object' ? open(v, pre + k + '.') : (v === false || v === '') ? [pre + k] : []);
    const pend = open(f, '');
    if (pend.length) problems.push('ficha editorial incompleta: ' + pend.join(', '));
  }
  if (problems.length) { console.error('✘ No se puede publicar:\n - ' + problems.join('\n - ')); process.exit(1); }

  const html = raw.map(t => t.split('\n').map(p => p.trim()).filter(Boolean).map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('\n'));
  const totalWords = raw.join(' ').split(/\s+/).filter(Boolean).length;
  const pages = Math.max(32, Math.round(totalWords / 260));
  const minutes = Math.round(totalWords / 200);
  const idx = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0);
  const pick = (arr) => arr[idx % arr.length];
  const isKids = enc.cat === 'kids';
  const accents = [{ p: '#e0a96d', s: '#c8945a' }, { p: '#84a98c', s: '#a3b18a' }, { p: '#fbc2eb', s: '#a6c1ee' }, { p: '#84c7d0', s: '#5a9ba6' }];
  const accent = pick(accents);
  const doc = {
    title: outline.title,
    author: 'Timeless Editorial',
    cat: enc.cat,
    genre: enc.genreLabel,
    cover: isKids ? pick(['🦊', '🐉', '🌙', '🦁', '🐢', '🦉', '🌊', '🍄', '🐋', '⭐']) : pick(['assets/cover_memoria.png', 'assets/cover_umbral.png', 'assets/cover_arquitecto.png', 'assets/cover_contemplacion.png']),
    badge: 'new', badgeText: 'Nuevo',
    pages,
    duration: isKids ? `${minutes}min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`,
    desc: outline.premise,
    tagline: outline.premise.split('.')[0] + '.',
    themes: outline.themes || [],
    previewChapter: html[0].split('\n').slice(0, 3).join('\n'),
    outline: { title: outline.title, chapters: outline.chapters.map(c => ({ title: c.title, arc: c.arc })) },
    ...(isKids ? { ageBadge: pick(['4-8 años', '6-10 años', '8-12 años']), collectionTitle: enc.genreLabel.toUpperCase(), coverAccent: accent.p, coverAccentMuted: accent.s } : {}),
  };
  const id = `tl-${enc.cat}-${slug.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  console.log(`✔ Validado: "${outline.title}" · ${total} capítulos · ${totalWords} palabras · ${pages} págs · id ${id}`);
  if (flag !== '--apply') return console.log('Simulacro: no se escribió nada. Revisá y corré de nuevo con --apply.');

  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require('../serviceAccountKey.json');
  initializeApp({ credential: cert(sa) });
  const db = getFirestore();
  if ((await db.collection('books').doc(id).get()).exists) { console.error(`✘ Ya existe books/${id}. Cambiá el nombre de la carpeta o borralo desde el panel de administración.`); process.exit(1); }
  await db.collection('books').doc(id).set({ ...doc, createdAt: FieldValue.serverTimestamp() });
  await db.collection('books_full').doc(id).set({ chapters: html, production: { voice: enc.writerId || 'libre', format: L.TIMELESS_FORMAT_FOR[enc.cat] || 'novela' } });
  console.log(`✔ Publicado: books/${id} y books_full/${id}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
