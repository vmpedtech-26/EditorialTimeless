'use strict';
// Oculta del catálogo (sin borrar) los libros cuya prosa no llega a la extensión de su formato.
//   node scripts/catalogo_ocultar.js                        (simulacro)
//   node scripts/catalogo_ocultar.js --apply [--excepto id1,id2]
//   node scripts/catalogo_ocultar.js --mostrar id1,id2 --apply   (los vuelve a mostrar)
// Pone `hidden: true` en books/<id>; la prosa y los ids no se tocan.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const L = require('./libro_lib');
const sa = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require(path.join(__dirname, '..', 'serviceAccountKey.json'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? (process.argv[i + 1] || '').split(',').filter(Boolean) : []; };
const APPLY = process.argv.includes('--apply');
const strip = h => String(h).replace(/<[^>]+>/g, ' ');
(async () => {
  const [b, f] = await Promise.all([db.collection('books').get(), db.collection('books_full').get()]);
  const full = Object.fromEntries(f.docs.map(d => [d.id, d.data().chapters || []]));
  const show = arg('--mostrar');
  if (show.length) {
    console.log(`Se volverán a mostrar: ${show.join(', ')}`);
    if (APPLY) for (const id of show) await db.collection('books').doc(id).update({ hidden: false });
    return console.log(APPLY ? '✔ Hecho.' : 'Simulacro: agregá --apply.');
  }
  const except = new Set(arg('--excepto'));
  const targets = [];
  for (const d of b.docs) {
    if (d.data().hidden || except.has(d.id)) continue;
    const m = d.data(), words = L.TIMELESS_FORMATS[L.TIMELESS_FORMAT_FOR[m.cat] || 'novela'].words;
    const chs = full[d.id] || [];
    const avg = chs.length ? chs.reduce((n, h) => n + strip(h).split(/\s+/).filter(Boolean).length, 0) / chs.length : 0;
    if (avg < words[0] * 0.6) targets.push(d.id);
  }
  console.log(`Libros a ocultar: ${targets.length} de ${b.size}${except.size ? ` (excepto ${[...except].join(', ')})` : ''}`);
  if (!APPLY) return console.log('Simulacro: no se escribió nada. Corré de nuevo con --apply.');
  const bdir = path.join(__dirname, '..', '..', 'Backups'); L.fs.mkdirSync(bdir, { recursive: true });
  L.fs.writeFileSync(path.join(bdir, `ocultados-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(targets));
  for (let i = 0; i < targets.length; i += 400) {
    const batch = db.batch();
    targets.slice(i, i + 400).forEach(id => batch.update(db.collection('books').doc(id), { hidden: true, hiddenAt: FieldValue.serverTimestamp() }));
    await batch.commit();
  }
  console.log(`✔ Ocultados ${targets.length}. Lista guardada en Backups/. Para mostrarlos de nuevo: --mostrar <ids> --apply`);
})().catch(e => { console.error(e.message); process.exit(1); });
