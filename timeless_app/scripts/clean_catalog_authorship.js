'use strict';
// Limpieza de autoría del catálogo: firma las obras de la casa como
// "Timeless Editorial" y quita el campo interno `generatedBy` de los
// documentos públicos de `books`. No toca prosa ni ids.
//
//   node scripts/clean_catalog_authorship.js            (simulacro: no escribe)
//   node scripts/clean_catalog_authorship.js --apply    (escribe; guarda antes un respaldo de `books`)
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const sa = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require(path.join(__dirname, '..', 'serviceAccountKey.json'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');
const HOUSE = 'Timeless Editorial';
// Firmas inventadas que usaba la siembra anterior (varias imitan nombres de escritores reales).
const OLD = new Set(['Arturo Borges','Clara Márquez','Julio Cortázar-Ríos','Virginia Silva','Francisco Kafka','José de Sousa','Roberto Belano','Haru Murakami','Ernesto Hemingway','Simone de Vois','Humberto Eco','Alejandra Pozzo','Emilio Vargas','Claudia Iriarte','Marcos Delgado','Isabel Noriega','Alicia M. Gómez','Javier del Campo','Clara Domínguez','Hugo Silva']);

(async () => {
  const snap = await db.collection('books').get();
  const todo = snap.docs.filter(d => { const x = d.data(); return x.generatedBy !== undefined || OLD.has(x.author); });
  console.log(`Libros: ${snap.size} · a limpiar: ${todo.length}`);
  const sample = todo.slice(0, 5).map(d => `${d.id} | ${d.data().author} | ${d.data().generatedBy || '-'}`);
  console.log(sample.join('\n'));
  if (!APPLY) return console.log('Simulacro: no se escribió nada. Usá --apply.');
  const backup = path.join(__dirname, '..', '..', 'Backups', `books-antes-de-limpiar-autoria-${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.writeFileSync(backup, JSON.stringify(Object.fromEntries(todo.map(d => [d.id, { author: d.data().author ?? null, generatedBy: d.data().generatedBy ?? null }])), null, 1));
  console.log('Respaldo de los campos a cambiar:', backup);
  let n = 0;
  for (let i = 0; i < todo.length; i += 400) {
    const batch = db.batch();
    todo.slice(i, i + 400).forEach(d => { batch.update(d.ref, { author: HOUSE, generatedBy: FieldValue.delete() }); n++; });
    await batch.commit();
  }
  console.log(`Actualizados: ${n}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
