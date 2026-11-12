'use strict';
// Respaldo completo de Firestore (todas las colecciones y subcolecciones) y de
// los usuarios de Authentication, en un único JSON.
//
//   node scripts/backup_firestore.js salida.json
//
// Credenciales: variable FIREBASE_SERVICE_ACCOUNT (JSON) o ../serviceAccountKey.json.
// El archivo contiene datos personales (correos): cifrarlo antes de guardarlo
// fuera de tu equipo (el workflow de GitHub ya lo hace).
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, GeoPoint } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const out = process.argv[2] || `respaldo-timeless-${new Date().toISOString().slice(0, 10)}.json`;
const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require(path.join(__dirname, '..', 'serviceAccountKey.json'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// Los Timestamp/GeoPoint/referencias no son JSON: se guardan con una marca de tipo.
function plain(v) {
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toDate === 'function') return { __timestamp: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(plain);
  if (v.path && v.firestore) return { __ref: v.path };
  if ('latitude' in v && 'longitude' in v && Object.keys(v).length === 2) return { __geopoint: [v.latitude, v.longitude] };
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
}

// Telemetría: volumen alto y valor bajo; se respalda solo lo más reciente.
const LIMITED = { telemetry_logs: 5000 };

async function dumpCollection(colRef, counts) {
  const limit = LIMITED[colRef.id];
  const snap = limit ? await colRef.orderBy('timestamp', 'desc').limit(limit).get().catch(() => colRef.limit(limit).get()) : await colRef.get();
  const docs = {};
  for (const d of snap.docs) {
    const entry = { data: plain(d.data()) };
    const subs = await d.ref.listCollections();
    if (subs.length) {
      entry.collections = {};
      for (const sub of subs) entry.collections[sub.id] = await dumpCollection(sub, counts);
    }
    docs[d.id] = entry;
    counts[colRef.path.split('/')[0]] = (counts[colRef.path.split('/')[0]] || 0) + 1;
  }
  return docs;
}

(async () => {
  const counts = {};
  const collections = {};
  for (const col of await db.listCollections()) collections[col.id] = await dumpCollection(col, counts);

  const authUsers = [];
  let token;
  do {
    const page = await getAuth().listUsers(1000, token);
    for (const u of page.users) {
      authUsers.push({
        uid: u.uid, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName || null,
        disabled: u.disabled, providers: u.providerData.map(p => p.providerId),
        createdAt: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime
      });
    }
    token = page.pageToken;
  } while (token);

  const payload = { generatedAt: new Date().toISOString(), project: sa.project_id, counts, authUsers, collections };
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log(`Respaldo escrito en ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  console.log('Documentos por colección:', counts, '| usuarios Auth:', authUsers.length);
  process.exit(0);
})().catch(e => { console.error('Fallo el respaldo:', e.message); process.exit(1); });
