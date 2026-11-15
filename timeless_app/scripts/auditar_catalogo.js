'use strict';
// Auditoría de solo lectura: pasa la prosa de books_full por el detector actual.
//   node scripts/auditar_catalogo.js
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const L = require('./libro_lib');
const sa = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require(path.join(__dirname, '..', 'serviceAccountKey.json'));
initializeApp({ credential: cert(sa) });
(async () => {
  const { lintProse } = await L.lint();
  const db = getFirestore();
  const [books, full] = await Promise.all([db.collection('books').get(), db.collection('books_full').get()]);
  const meta = Object.fromEntries(books.docs.map(d => [d.id, d.data()]));
  const rows = [], byRule = {};
  let chapTotal = 0, chapFail = 0;
  for (const d of full.docs) {
    const m = meta[d.id]; if (!m) continue;
    const kind = ['ensayo', 'tecnica', 'neurociencia', 'finanzas', 'biografia'].includes(m.cat) ? 'expository' : 'narrative';
    const chs = d.data().chapters || [];
    let sum = 0, fail = 0;
    chs.forEach(h => { const r = lintProse(h, { kind, words: L.TIMELESS_FORMATS[L.TIMELESS_FORMAT_FOR[m.cat] || 'novela'].words }); sum += r.score; chapTotal++; if (!r.pass) { fail++; chapFail++; } r.findings.forEach(f => byRule[f.rule] = (byRule[f.rule] || 0) + 1); });
    rows.push({ id: d.id, cat: m.cat, caps: chs.length, media: chs.length ? Math.round(sum / chs.length) : 0, fallan: fail });
  }
  rows.sort((a, b) => a.media - b.media);
  const ok = rows.filter(r => r.fallan === 0);
  console.log(`Libros con prosa: ${rows.length} · capítulos: ${chapTotal} · capítulos que NO aprueban: ${chapFail} (${Math.round(chapFail / chapTotal * 100)}%)`);
  console.log(`Libros donde todos los capítulos aprueban: ${ok.length}`);
  console.log('Hallazgos por regla:', Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · '));
  console.log('Mejores 8:', rows.slice(-8).reverse().map(r => `${r.id} (${r.media})`).join(', '));
  console.log('Peores 5:', rows.slice(0, 5).map(r => `${r.id} (${r.media})`).join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });
