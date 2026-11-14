'use strict';
// Revisa los capítulos escritos con el detector de prosa automática.
//
//   node scripts/libro_revisar.js <libro> [n°capítulo]
//
// Si un capítulo no pasa, guarda cap-NN.nota.txt con lo que hay que corregir
// (libro_prompt.js la incluye sola al pedir ese capítulo de nuevo). Devuelve
// código 1 si algún capítulo no aprueba.
const L = require('./libro_lib');
(async () => {
  const [slug, only] = process.argv.slice(2);
  const d = L.dir(slug);
  const enc = L.readJson(d, 'encargo.json');
  const { lintProse, lintToEditorNote } = await L.lint();
  const kind = L.formatOf(enc).expository ? 'expository' : 'narrative';
  const [min, max] = L.formatOf(enc).words;
  const caps = L.fs.readdirSync(d).filter(f => /^cap-\d+\.txt$/.test(f)).sort();
  let bad = 0;
  for (const f of caps) {
    const n = parseInt(f.match(/\d+/)[0], 10);
    if (only && n !== parseInt(only, 10)) continue;
    const r = lintProse(L.fs.readFileSync(L.path.join(d, f), 'utf8'), { kind });
    const range = r.wordCount < min * 0.7 || r.wordCount > max * 1.35 ? `  ⚠ largo fuera de rango (${min}-${max})` : '';
    const notaPath = L.path.join(d, `cap-${L.pad(n)}.nota.txt`);
    if (r.pass) { console.log(`✔ cap ${n}: ${r.score}/100 · ${r.wordCount} palabras${range}`); if (L.fs.existsSync(notaPath)) L.fs.unlinkSync(notaPath); }
    else { bad++; console.log(`✘ cap ${n}: ${r.score}/100 · ${r.wordCount} palabras${range}\n${lintToEditorNote(r)}`); L.fs.writeFileSync(notaPath, lintToEditorNote(r)); }
  }
  if (!caps.length) { console.log('Todavía no hay capítulos (cap-01.txt, cap-02.txt…).'); process.exit(1); }
  if (bad) { console.log(`\n${bad} capítulo(s) para reescribir: pedí el encargo de nuevo con libro_prompt.js (incluye la nota de corrección).`); process.exit(1); }
})();
