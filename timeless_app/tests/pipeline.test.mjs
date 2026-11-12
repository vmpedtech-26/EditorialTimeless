import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { produceChapter, normalizeBsc, averageBsc, CONTINUITY_CHARS } from '../assets/js/chapter_pipeline.js';

const require = createRequire(import.meta.url);
const { TIMELESS_PROMPTS } = require('../prompts.js');

async function collect(gen) { const ev = []; for await (const e of gen) ev.push(e); return ev; }
const streamOf = (...versions) => { const calls = []; let n = 0; const fn = async function* (extra) { calls.push(extra); for (const part of versions[Math.min(n++, versions.length - 1)]) yield part; }; fn.calls = calls; return fn; };
const bsc = (overall, nota = '') => ({ coherencia: overall, originalidad: overall, ritmo: overall, overall, nota_editorial: nota });

test('un primer borrador aprobado no se reescribe', async () => {
  const stream = streamOf(['Hola ', 'mundo']);
  const ev = await collect(produceChapter({ stream, evaluate: async () => bsc(90), previousText: 'x'.repeat(5000) }));
  const done = ev.at(-1);
  assert.equal(done.type, 'done'); assert.equal(done.text, 'Hola mundo'); assert.equal(done.rewrites, 0); assert.equal(done.bsc.overall, 90);
  assert.equal(stream.calls.length, 1);
  assert.equal(stream.calls[0].previousText.length, CONTINUITY_CHARS);
});

test('si reprueba, reescribe con la nota del editor y se queda con la mejor', async () => {
  const stream = streamOf(['borrador flojo'], ['versión mejorada']);
  const scores = [bsc(70, 'Falta subtexto'), bsc(88)];
  const ev = await collect(produceChapter({ stream, evaluate: async () => scores.shift() }));
  const done = ev.at(-1);
  assert.equal(done.text, 'versión mejorada'); assert.equal(done.rewrites, 1); assert.equal(done.bsc.overall, 88);
  assert.equal(stream.calls.length, 2);
  assert.equal(stream.calls[1].editorNote, 'Falta subtexto');
  assert.ok(ev.some(e => e.type === 'rewrite' && e.note === 'Falta subtexto'));
});

test('si la reescritura empeora, conserva la original', async () => {
  const stream = streamOf(['original'], ['peor']);
  const scores = [bsc(75, 'n'), bsc(60)];
  const ev = await collect(produceChapter({ stream, evaluate: async () => scores.shift() }));
  const done = ev.at(-1);
  assert.equal(done.text, 'original'); assert.equal(done.bsc.overall, 75);
  assert.ok(ev.some(e => e.type === 'kept-original'));
});

test('si la reescritura no se puede evaluar, conserva la original', async () => {
  const stream = streamOf(['original'], ['otra']);
  const scores = [bsc(70, 'n'), null];
  const done = (await collect(produceChapter({ stream, evaluate: async () => scores.shift() }))).at(-1);
  assert.equal(done.text, 'original');
});

test('una evaluación fallida no inventa puntaje ni dispara reescrituras', async () => {
  const stream = streamOf(['texto']);
  const done = (await collect(produceChapter({ stream, evaluate: async () => ({ basura: true }) }))).at(-1);
  assert.equal(done.bsc, null); assert.equal(done.rewrites, 0); assert.equal(stream.calls.length, 1);
});

test('calidad standard no evalúa', async () => {
  let evaluated = 0;
  const done = (await collect(produceChapter({ stream: streamOf(['a']), evaluate: async () => { evaluated++; return bsc(10); }, review: false }))).at(-1);
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
