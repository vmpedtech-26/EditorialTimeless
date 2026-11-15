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
  const { lintProse, lintToEditorNote, checkContinuity } = await L.lint();
  const outlineTxt = L.fs.existsSync(L.path.join(d, 'outline.json')) ? L.fs.readFileSync(L.path.join(d, 'outline.json'), 'utf8') + JSON.stringify(enc) : JSON.stringify(enc);
  const kind = L.formatOf(enc).expository ? 'expository' : 'narrative';
  const [min, max] = L.formatOf(enc).words;
  const caps = L.fs.readdirSync(d).filter(f => /^cap-\d+\.txt$/.test(f)).sort();
  let bad = 0;
  for (const f of caps) {
    const n = parseInt(f.match(/\d+/)[0], 10);
    if (only && n !== parseInt(only, 10)) continue;
    const txt = L.fs.readFileSync(L.path.join(d, f), 'utf8');
    const r = lintProse(txt, { kind });
    const known = outlineTxt + ' ' + caps.filter(x => parseInt(x.match(/\d+/)[0], 10) < n).map(x => L.fs.readFileSync(L.path.join(d, x), 'utf8')).join(' ');
    for (const c of checkContinuity(txt, known)) {
      if (c.level === 'error') r.findings.push({ rule: 'continuidad', detail: c.msg, penalty: 10 }); else console.log(`  ⚠ cap ${n}: ${c.msg}`);
    }
    r.score = Math.max(0, 100 - r.findings.reduce((a, x) => a + x.penalty, 0)); r.pass = r.score >= 80 && !r.findings.some(x => x.rule === 'meta');
    if (r.pass && !L.fs.existsSync(L.path.join(d, `cap-${L.pad(n)}.resumen.txt`))) console.log(`  ⚠ cap ${n}: falta la ficha de continuidad → node scripts/libro_prompt.js ${slug} resumen ${n}`);
    const range = r.wordCount < min * 0.7 || r.wordCount > max * 1.35 ? `  ⚠ largo fuera de rango (${min}-${max})` : '';
    const notaPath = L.path.join(d, `cap-${L.pad(n)}.nota.txt`);
    if (r.pass) { console.log(`✔ cap ${n}: ${r.score}/100 · ${r.wordCount} palabras${range}`); if (L.fs.existsSync(notaPath)) L.fs.unlinkSync(notaPath); }
    else { bad++; console.log(`✘ cap ${n}: ${r.score}/100 · ${r.wordCount} palabras${range}\n${lintToEditorNote(r)}`); L.fs.writeFileSync(notaPath, lintToEditorNote(r)); }
  }
  if (!caps.length) { console.log('Todavía no hay capítulos (cap-01.txt, cap-02.txt…).'); process.exit(1); }
  if (bad) { console.log(`\n${bad} capítulo(s) para reescribir: pedí el encargo de nuevo con libro_prompt.js (incluye la nota de corrección).`); process.exit(1); }
})();
