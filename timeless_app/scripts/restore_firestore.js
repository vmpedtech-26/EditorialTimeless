'use strict';
// Restaura un respaldo hecho con backup_firestore.js.
//
//   node scripts/restore_firestore.js respaldo.json                      # simulacro: solo cuenta
//   node scripts/restore_firestore.js respaldo.json --apply              # escribe TODO (pisa documentos existentes)
//   node scripts/restore_firestore.js respaldo.json --apply --only=books,books_full
//
// No restaura usuarios de Authentication (el JSON solo los lista como referencia).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, GeoPoint } = require('firebase-admin/firestore');

const file = process.argv[2];
if (!file) { console.error('Uso: node scripts/restore_firestore.js respaldo.json [--apply] [--only=col1,col2]'); process.exit(2); }
const apply = process.argv.includes('--apply');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;

const sa = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require(path.join(__dirname, '..', 'serviceAccountKey.json'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
if (backup.project !== sa.project_id) { console.error(`El respaldo es del proyecto ${backup.project}, no de ${sa.project_id}.`); process.exit(2); }

function revive(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(revive);
  if (v.__timestamp) return Timestamp.fromDate(new Date(v.__timestamp));
  if (v.__ref) return db.doc(v.__ref);
  if (v.__geopoint) return new GeoPoint(v.__geopoint[0], v.__geopoint[1]);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
}

let n = 0;
async function restoreCollection(colRef, docs) {
  for (const [id, entry] of Object.entries(docs)) {
    n++;
    if (apply) await colRef.doc(id).set(revive(entry.data));
    for (const [subId, subDocs] of Object.entries(entry.collections || {})) await restoreCollection(colRef.doc(id).collection(subId), subDocs);
  }
}

(async () => {
  console.log(`Respaldo del ${backup.generatedAt} (${backup.project}) — ${apply ? 'APLICANDO' : 'simulacro'}`);
  for (const [name, docs] of Object.entries(backup.collections)) {
    if (only && !only.includes(name)) continue;
    await restoreCollection(db.collection(name), docs);
    console.log(` · ${name}: ${Object.keys(docs).length} documentos`);
  }
  console.log(apply ? `Listo: ${n} documentos escritos.` : `Simulacro: ${n} documentos se escribirían. Repetí con --apply para restaurar.`);
  process.exit(0);
})().catch(e => { console.error('Fallo la restauración:', e.message); process.exit(1); });
