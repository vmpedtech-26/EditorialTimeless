'use strict';
// Exporta un libro del catálogo al taller para reescribirlo (solo lectura en Firestore).
//   node scripts/catalogo_exportar.js <id>            (ej.: seeded-ficcion-35)
//   node scripts/catalogo_exportar.js --lista         (lista los libros y su extensión actual)
// Crea libros/rev-<id>/ con encargo.json (modo reemplazo), original/cap-NN.txt y la ficha vacía.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const L = require('./libro_lib');
const sa = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require(path.join(__dirname, '..', 'serviceAccountKey.json'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const strip = h => String(h).replace(/<\/p>\s*<p>/g, '\n').replace(/<[^>]+>/g, '').trim();
(async () => {
  const arg = process.argv[2];
  if (!arg) { console.error('Uso: catalogo_exportar.js <id> | --lista'); process.exit(2); }
  if (arg === '--lista') {
    const [b, f] = await Promise.all([db.collection('books').get(), db.collection('books_full').get()]);
    const full = Object.fromEntries(f.docs.map(d => [d.id, d.data().chapters || []]));
    b.docs.sort((x, y) => x.id.localeCompare(y.id)).forEach(d => { const c = full[d.id] || []; console.log(`${d.id}\t${d.data().cat}\t${d.data().title}\t${c.length} cap · ${c.reduce((n, h) => n + strip(h).split(/\s+/).length, 0)} palabras`); });
    return;
  }
  const [m, f] = await Promise.all([db.collection('books').doc(arg).get(), db.collection('books_full').doc(arg).get()]);
  if (!m.exists || !f.exists) { console.error('No existe ese libro (books/books_full).'); process.exit(1); }
  const b = m.data(), caps = f.data().chapters || [];
  const slug = ('rev-' + arg).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const d = path.join(L.ROOT, slug);
  if (L.fs.existsSync(d)) { console.error(`Ya existe libros/${slug}/`); process.exit(1); }
  L.fs.mkdirSync(path.join(d, 'original'), { recursive: true });
  const fmt = L.TIMELESS_FORMATS[L.TIMELESS_FORMAT_FOR[b.cat] || 'novela'];
  const nCaps = Math.max(6, (b.outline && b.outline.chapters ? b.outline.chapters.length : 0));
  L.fs.writeFileSync(path.join(d, 'encargo.json'), JSON.stringify({
    reemplaza: arg, cat: b.cat, genreLabel: b.genre || fmt.label,
    premise: b.desc || '', tone: '', chapters: nCaps, writerId: 'libre',
    nota: 'REESCRITURA: el texto actual (carpeta original/) es un esbozo de ~170 palabras por capítulo. Usá solo el título y la idea como punto de partida; escribí capítulos completos nuevos. Definí el tono antes del plan.'
  }, null, 2));
  caps.forEach((h, i) => L.fs.writeFileSync(path.join(d, 'original', `cap-${L.pad(i + 1)}.txt`), strip(h)));
  L.fs.writeFileSync(path.join(d, 'original', 'titulo.txt'), `${b.title}\n${b.desc || ''}\n`);
  L.fs.copyFileSync(path.join(L.ROOT, '_plantilla', 'ficha.json'), path.join(d, 'ficha.json'));
  console.log(`✔ Exportado a libros/${slug}/ (${caps.length} capítulos originales). Seguí libros/LEEME_ANTIGRAVITY.md; al publicar se reemplaza books/${arg} con respaldo.`);
})().catch(e => { console.error(e.message); process.exit(1); });
