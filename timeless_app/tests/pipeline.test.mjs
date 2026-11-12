import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { produceChapter, normalizeBsc, averageBsc, CONTINUITY_CHARS } from '../assets/js/chapter_pipeline.js';

const require = createRequire(import.meta.url);
const { TIMELESS_PROMPTS } = require('../prompts.js');

async function collect(gen) { const ev = []; for await (const e of gen) ev.push(e); return ev; }
const streamOf = (...versions) => { const calls = []; let n = 0; const fn = async function* (extra) { calls.push(extra); for (const part of versions[Math.min(n++, versions.length - 1)]) yield part; }; fn.calls = calls; return fn; };
// Texto limpio de ~70 palabras con ritmo variado (pasa el detector de prosa).
const CLEAN = (tag = '') => `Frenaron frente al almacén. ${tag} Nadie bajó. Ramón se rascó la nuca y dijo que el tasador venía mañana, que mejor no tocara nada, que la llave del ropero la tenía la Ofelia desde marzo. Marta lo miró. —¿Desde marzo? —Desde que se cayó. —¿Y quién te dijo a vos que yo iba a venir? Él se encogió de hombros y encendió la radio. Afuera ladró un perro, dos veces, y se calló. Ella abrió la puerta del coche y bajó el bolso.`;
const bsc = (overall, nota = '') => ({ coherencia: overall, originalidad: overall, ritmo: overall, overall, nota_editorial: nota });

test('un primer borrador aprobado no se reescribe', async () => {
  const stream = streamOf([CLEAN('A '), CLEAN('B')]);
  const ev = await collect(produceChapter({ stream, evaluate: async () => bsc(90), previousText: 'x'.repeat(5000) }));
  const done = ev.at(-1);
  assert.equal(done.type, 'done'); assert.equal(done.text, CLEAN('A ') + CLEAN('B')); assert.equal(done.rewrites, 0); assert.equal(done.bsc.overall, 90);
  assert.equal(stream.calls.length, 1);
  assert.equal(stream.calls[0].previousText.length, CONTINUITY_CHARS);
});

test('si reprueba, reescribe con la nota del editor y se queda con la mejor', async () => {
  const stream = streamOf([CLEAN('flojo')], [CLEAN('mejor')]);
  const scores = [bsc(70, 'Falta subtexto'), bsc(88)];
  const ev = await collect(produceChapter({ stream, evaluate: async () => scores.shift() }));
  const done = ev.at(-1);
  assert.equal(done.text, CLEAN('mejor')); assert.equal(done.rewrites, 1); assert.equal(done.bsc.overall, 88);
  assert.equal(stream.calls.length, 2);
  assert.ok(stream.calls[1].editorNote.includes('Falta subtexto'));
  assert.ok(ev.some(e => e.type === 'rewrite' && e.note.includes('Falta subtexto')));
});

test('si la reescritura empeora, conserva la original', async () => {
  const stream = streamOf([CLEAN('original')], [CLEAN('peor')]);
  const scores = [bsc(75, 'n'), bsc(60)];
  const ev = await collect(produceChapter({ stream, evaluate: async () => scores.shift() }));
  const done = ev.at(-1);
  assert.equal(done.text, CLEAN('original')); assert.equal(done.bsc.overall, 75);
  assert.ok(ev.some(e => e.type === 'kept-original'));
});

test('si la reescritura no se puede evaluar, conserva la original', async () => {
  const stream = streamOf([CLEAN('original')], [CLEAN('otra')]);
  const scores = [bsc(70, 'n'), null];
  const done = (await collect(produceChapter({ stream, evaluate: async () => scores.shift() }))).at(-1);
  assert.equal(done.text, CLEAN('original'));
});

test('una evaluación fallida no inventa puntaje ni dispara reescrituras', async () => {
  const stream = streamOf([CLEAN('texto')]);
  const done = (await collect(produceChapter({ stream, evaluate: async () => ({ basura: true }) }))).at(-1);
  assert.equal(done.bsc, null); assert.equal(done.rewrites, 0); assert.equal(stream.calls.length, 1);
});

test('calidad standard no evalúa', async () => {
  let evaluated = 0;
  const done = (await collect(produceChapter({ stream: streamOf([CLEAN('a')]), evaluate: async () => { evaluated++; return bsc(10); }, review: false }))).at(-1);
  assert.equal(evaluated, 0); assert.equal(done.bsc, null);
});

test('normalizeBsc calcula overall, acota y rechaza basura', () => {
  assert.equal(normalizeBsc({ coherencia: 80, originalidad: 90, ritmo: 70 }).overall, 81);
  assert.equal(normalizeBsc({ overall: 250 }).overall, 100);
  assert.equal(normalizeBsc({ overall: -5 }).overall, 0);
  assert.equal(normalizeBsc(null), null);
  assert.equal(normalizeBsc({ coherencia: 'alto' }), null);
});

test('averageBsc ignora capítulos sin evaluar', () => {
  const avg = averageBsc([bsc(80), null, bsc(90)]);
  assert.equal(avg.overall, 85); assert.equal(avg.chapters, 2);
  assert.equal(averageBsc([null, null]), null);
});

test('buildChapter incluye el final real del capítulo anterior y la nota del editor', () => {
  const outline = { title: 'T', premise: 'P', themes: ['a'], chapters: [{ index: 1, title: 'Uno', arc: 'x', key_events: ['e'], narrative_function: 'f' }, { index: 2, title: 'Dos', arc: 'y', key_events: ['e'], narrative_function: 'f' }] };
  const base = { genre: 'ficcion', tone: 'lirico', writerId: 'libre' };
  const plain = TIMELESS_PROMPTS.buildChapter(outline, 1, base);
  assert.ok(!plain.includes('FINAL DEL CAPÍTULO ANTERIOR')); assert.ok(!plain.includes('NOTA DEL EDITOR'));
  const full = TIMELESS_PROMPTS.buildChapter(outline, 1, { ...base, previousText: 'ULTIMAS LINEAS', editorNote: 'MAS SUBTEXTO' });
  assert.ok(full.includes('ULTIMAS LINEAS')); assert.ok(full.includes('MAS SUBTEXTO'));
});

const TICS = `Marta bajó del coche. No era miedo. Era otra cosa. El silencio se instaló en la cocina, como si la casa respirara, como si el tiempo se detuviera, como si los muertos escucharan. Había un susurro en el tapiz, un entramado palpable, una sinfonía ancestral de sombras etéreas. Sintió un nudo en la garganta. No era tristeza. Era memoria. Fue como si algo dentro de ella se rompiera. Por primera vez en años comprendió que todo estaba perdonado.`;

test('el detector de prosa fuerza una reescritura aunque el BSC apruebe', async () => {
  const stream = streamOf([TICS], [CLEAN('limpio')]);
  const ev = await collect(produceChapter({ stream, evaluate: async () => bsc(95) }));
  const done = ev.at(-1);
  assert.equal(done.rewrites, 1); assert.equal(done.text, CLEAN('limpio')); assert.ok(done.lint.pass);
  assert.ok(stream.calls[1].editorNote.includes('como si'));
});

test('la prosa limpia no dispara reescritura en calidad standard', async () => {
  const stream = streamOf([CLEAN('x')]);
  const done = (await collect(produceChapter({ stream, evaluate: async () => null, review: false }))).at(-1);
  assert.equal(done.rewrites, 0); assert.equal(stream.calls.length, 1); assert.ok(done.lint.pass);
});

test('un texto que habla de su propia producción nunca pasa el detector', async () => {
  const { lintProse } = await import('../assets/js/prose_lint.js');
  const r = lintProse(CLEAN('') + ' Aquí tienes el capítulo, espero que te guste. Como modelo de lenguaje, no puedo continuar.');
  assert.equal(r.pass, false); assert.ok(r.findings.some(f => f.rule === 'meta'));
});

test('el detector puntúa más bajo la prosa de piloto automático que la humana', async () => {
  const { lintProse } = await import('../assets/js/prose_lint.js');
  assert.ok(lintProse(CLEAN('')).score >= 90);
  assert.ok(lintProse(TICS).score < 60);
});
