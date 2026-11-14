'use strict';
// Imprime el encargo exacto (instrucciones de oficio + pedido) para escribir
// el plan de un libro o uno de sus capítulos.
//
//   node scripts/libro_prompt.js <libro> plan
//   node scripts/libro_prompt.js <libro> <n°capítulo>
//
// Para un capítulo usa el final real del capítulo anterior (cap-NN.txt) y, si
// existe cap-NN.nota.txt (generada por libro_revisar.js), la nota de corrección.
const L = require('./libro_lib');
const [slug, what] = process.argv.slice(2);
const d = L.dir(slug);
const enc = L.readJson(d, 'encargo.json');
const fmt = L.TIMELESS_FORMAT_FOR[enc.cat] || 'novela';
const system = L.TIMELESS_PROMPTS.buildSystem(enc.writerId || 'libre', fmt);

if (what === 'plan') {
  const user = L.TIMELESS_PROMPTS.buildOutline(enc.premise, enc.cat, enc.chapters, enc.tone, enc.writerId || 'libre');
  console.log(`=== INSTRUCCIONES (system) ===\n${system}\n\n=== ENCARGO ===\n${user}\n\n=== ENTREGA ===\nGuardá SOLO el JSON en libros/${slug}/outline.json`);
} else if (/^\d+$/.test(what || '')) {
  const n = parseInt(what, 10), i = n - 1;
  const outline = L.readJson(d, 'outline.json');
  if (!outline.chapters || !outline.chapters[i]) { console.error(`El plan no tiene capítulo ${n}.`); process.exit(2); }
  const prev = i > 0 && L.fs.existsSync(L.capFile(d, n - 1)) ? L.fs.readFileSync(L.capFile(d, n - 1), 'utf8').slice(-1800) : '';
  if (i > 0 && !prev) { console.error(`Primero escribí el capítulo ${n - 1} (libros/${slug}/cap-${L.pad(n - 1)}.txt).`); process.exit(2); }
  const notaPath = L.path.join(d, `cap-${L.pad(n)}.nota.txt`);
  const editorNote = L.fs.existsSync(notaPath) ? L.fs.readFileSync(notaPath, 'utf8') : '';
  const user = L.TIMELESS_PROMPTS.buildChapter(outline, i, { genre: enc.cat, tone: enc.tone, writerId: enc.writerId || 'libre', previousText: prev, editorNote });
  console.log(`=== INSTRUCCIONES (system) ===\n${system}\n\n=== ENCARGO ===\n${user}\n\n=== ENTREGA ===\nGuardá SOLO la prosa en libros/${slug}/cap-${L.pad(n)}.txt (sin título, sin markdown, sin comentarios)`);
} else {
  console.error('Uso: node scripts/libro_prompt.js <libro> plan | <n° de capítulo>'); process.exit(2);
}
