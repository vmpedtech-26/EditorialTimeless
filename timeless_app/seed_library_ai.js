'use strict';

// ── Timeless Editorial · Siembra de catálogo con IA real ────────────────────
// Reemplaza a seed_library.js (que armaba "libros" mezclando párrafos fijos
// de bancos de texto prerredactados — no había ningún modelo de lenguaje
// involucrado). Este script genera cada obra de punta a punta con el mismo
// motor de prompts del Agente Escritor (prompts.js): outline real, capítulos
// redactados por Gemini, y una pasada de control de calidad (BSC) que si
// reprueba el primer capítulo, lo reescribe una vez con la crítica como
// feedback — el "loop" que en el Agente del sitio hoy es solo decorativo.
//
// Requiere una GEMINI_API_KEY válida en .env (o FIREBASE_SERVICE_ACCOUNT +
// GEMINI_API_KEY en el entorno). Uso:
//
//   node seed_library_ai.js            → genera todo el plan (ver BOOK_PLANS)
//   node seed_library_ai.js 5          → genera solo los primeros 5 libros
//                                          (para probar antes de correr todo)
//   node seed_library_ai.js 1 10       → genera los libros del índice 1 al 10
//
// Cada libro cuesta ~1 llamada de outline + 1 llamada por capítulo + hasta
// 2 llamadas de BSC/reescritura. Con 5 capítulos eso son ~7-8 llamadas a
// Gemini por libro — tenlo en cuenta para el volumen total que generes.

require('dotenv').config();
const admin = require('firebase-admin');
const { TIMELESS_WRITERS, TIMELESS_PROMPTS } = require('./prompts.js');

// ── Firebase Admin Init ──────────────────────────────────────────────────
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    serviceAccount = require('./serviceAccountKey.json');
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('  ✦ [Firebase] Admin inicializado con éxito.');
} catch (err) {
  console.error('  ✗ [Firebase Error] Fallo crítico al inicializar Firebase Admin:', err.message);
  process.exit(1);
}
const db = admin.firestore();

// ── Gemini config ────────────────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_SEED_MODEL || 'gemini-2.5-flash';
const GEMINI = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`;

if (!GEMINI_KEY || GEMINI_KEY === 'pega_tu_api_key_aqui') {
  console.error('\n  ✗  ERROR: GEMINI_API_KEY no configurada o inválida en .env.');
  console.error('     Generá una en https://aistudio.google.com/apikey y pegala en .env antes de correr esto.\n');
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callGemini(systemPrompt, userPrompt, cfg = {}) {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: cfg.temperature ?? 0.85,
      maxOutputTokens: cfg.maxTokens ?? 4096,
      topP: cfg.topP ?? 0.95,
    },
  };

  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${GEMINI}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error?.message || `HTTP ${res.status}`;
        // 429 (cuota) y 503 (sobrecarga) ameritan reintento con backoff; el resto, no.
        if ((res.status === 429 || res.status === 503) && attempt < 4) {
          const wait = 2000 * attempt;
          console.warn(`  ⚠ [Gemini] ${msg} — reintentando en ${wait}ms (intento ${attempt}/4)...`);
          await sleep(wait);
          continue;
        }
        throw new Error(msg);
      }
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
      lastErr = err;
      if (attempt < 4) {
        await sleep(1500 * attempt);
        continue;
      }
    }
  }
  throw lastErr;
}

function extractJson(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('El modelo no devolvió JSON válido: ' + raw.slice(0, 200));
  return JSON.parse(match[0]);
}

function toParagraphHtml(rawText) {
  return rawText
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p}</p>`)
    .join('\n');
}

function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Pseudónimos ficticios para la ficha del libro. El estilo real puede estar
// inspirado en una de las 12 voces de prompts.js (guía interna del modelo),
// pero la autoría que se muestra al lector siempre es un nombre inventado:
// nunca se le atribuye la obra generada a un escritor real.
const FICTIONAL_PSEUDONYMS = [
  'Arturo Borges', 'Clara Márquez', 'Julio Cortázar-Ríos', 'Virginia Silva',
  'Francisco Kafka', 'José de Sousa', 'Roberto Belano', 'Haru Murakami',
  'Ernesto Hemingway', 'Simone de Vois', 'Humberto Eco', 'Alejandra Pozzo',
  'Emilio Vargas', 'Claudia Iriarte', 'Marcos Delgado', 'Isabel Noriega',
  'Alicia M. Gómez', 'Javier del Campo', 'Clara Domínguez', 'Hugo Silva',
];

const COVER_PRESETS = ['assets/cover_memoria.png', 'assets/cover_umbral.png', 'assets/cover_arquitecto.png', 'assets/cover_contemplacion.png'];
const KIDS_EMOJIS = ['🦊', '🐉', '🌙', '🦁', '🐢', '🦉', '🌊', '🍄', '🐋', '⭐'];
const KIDS_ACCENTS = [
  { primary: '#e0a96d', secondary: '#c8945a' },
  { primary: '#84a98c', secondary: '#a3b18a' },
  { primary: '#fbc2eb', secondary: '#a6c1ee' },
  { primary: '#84c7d0', secondary: '#5a9ba6' },
];

function pick(arr, i) { return arr[i % arr.length]; }

// ── Plan de generación ───────────────────────────────────────────────────
// Cada entrada es una SEMILLA de premisa, no el libro en sí: el título real,
// la trama, los personajes y toda la prosa los inventa el modelo a partir de
// esto. Cubre las mismas categorías que tenía el catálogo combinatorio viejo,
// con variedad de tono y, para dar textura estilística distinta entre libros,
// rotando por algunas de las 12 voces de referencia de prompts.js.
const BOOK_PLANS = [];

function addPlans(cat, genreLabel, premises, opts = {}) {
  premises.forEach((premise, i) => {
    BOOK_PLANS.push({
      cat,
      genreLabel,
      premise,
      tone: opts.tones ? pick(opts.tones, i) : 'contemplativo',
      chapters: opts.chapters || 5,
      writerId: opts.writerIds ? pick(opts.writerIds, i) : 'libre',
    });
  });
}

addPlans('ficcion', 'Realismo Mágico', [
  'Un pueblo entero comparte el mismo sueño cada noche, y una mujer descubre que puede editarlo.',
  'En una familia, cada generación nace sabiendo la fecha exacta de su propia muerte, menos el hijo menor.',
  'Un río empieza a fluir hacia atrás el día que muere el último testigo de una masacre olvidada.',
], { tones: ['lirico', 'epico'], writerIds: ['garcia_marquez', 'cortazar'] });

addPlans('ficcion', 'Ficción Metafísica', [
  'Un bibliotecario descubre que catalogar cierto libro reescribe, letra por letra, la realidad de quien lo lee.',
  'Un hombre recibe cartas de sí mismo desde versiones de su vida que nunca vivió.',
], { tones: ['contemplativo'], writerIds: ['borges', 'nabokov'] });

addPlans('ficcion', 'Suspenso Existencial', [
  'Una traductora empieza a encontrar, en cada libro que traduce, un mismo mensaje cifrado dirigido a ella.',
  'Un hombre despierta cada mañana en la casa de un desconocido distinto, siempre a mitad de una conversación.',
], { tones: ['ironico'], writerIds: ['kafka', 'bolaño'] });

addPlans('novela', 'Novela Histórica', [
  'Durante la construcción de un canal en el siglo XIX, un ingeniero descubre que los planos originales fueron alterados para ocultar una ciudad entera.',
  'La última carta de un soldado nunca llegó a destino: cien años después, su descendiente la recibe.',
], { tones: ['epico'], chapters: 6 });

addPlans('novela', 'Novela Psicológica', [
  'Una terapeuta empieza a soñar con los pacientes de su predecesora, muerta hace veinte años.',
], { tones: ['contemplativo'], writerIds: ['woolf'] });

addPlans('ensayo', 'Ensayo Filosófico', [
  'Un ensayo sobre por qué recordamos mejor lo que no terminó que lo que se resolvió.',
  'Una meditación sobre el silencio como la forma más antigua de lenguaje.',
], { tones: ['contemplativo'], chapters: 4, writerIds: ['camus'] });

addPlans('ensayo', 'Crítica Cultural', [
  'Un ensayo sobre cómo las ciudades olvidan a propósito, calle por calle.',
], { tones: ['ironico'], chapters: 4 });

addPlans('biografia', 'Biografía Literaria', [
  'La biografía novelada de una escritora que publicó bajo el nombre de su hermano durante treinta años.',
  'La vida de un relojero que se volvió cartógrafo del tiempo que la gente perdía sin darse cuenta.',
], { tones: ['contemplativo'], chapters: 5, writerIds: ['proust'] });

addPlans('tecnica', 'Técnica Narrativa', [
  'Un manual sobre cómo construir el silencio dentro de un diálogo.',
], { tones: ['contemplativo'], chapters: 4 });

addPlans('comedia', 'Comedia Absurda', [
  'Una oficina de reclamos donde la gente va a quejarse de sus propios recuerdos.',
  'Un pueblo que decide, por votación, dejar de creer en la gravedad los martes.',
], { tones: ['ironico'], chapters: 4, writerIds: ['cortazar'] });

addPlans('thriller', 'Thriller Psicológico', [
  'Una restauradora de arte descubre un mensaje oculto bajo las capas de una pintura robada tres veces.',
  'Un negociador de rehenes se da cuenta de que el secuestrador está citando, palabra por palabra, su propia tesis doctoral.',
], { tones: ['ironico'], chapters: 6, writerIds: ['bolaño'] });

addPlans('neurociencia', 'Neurociencia Divulgativa', [
  'Un recorrido por qué el cerebro prefiere una buena historia a un buen dato.',
], { tones: ['contemplativo'], chapters: 4 });

addPlans('finanzas', 'Economía Conductual', [
  'Por qué tratamos el dinero futuro como si perteneciera a otra persona.',
], { tones: ['ironico'], chapters: 4 });

addPlans('kids', 'Fantasía Infantil', [
  'Un zorro que solo puede cruzar al bosque de los sueños si antes cuenta un secreto verdadero.',
  'Una niña que hereda un farol que ilumina únicamente lo que la gente olvidó agradecer.',
], { tones: ['lirico'], chapters: 3 });

addPlans('kids', 'Aventura Ecológica', [
  'Un río le pide ayuda a un grupo de chicos porque olvidó el camino hacia el mar.',
], { tones: ['epico'], chapters: 3 });

// ── Generación de un libro ───────────────────────────────────────────────
async function generateBook(plan, index) {
  const writer = TIMELESS_WRITERS.find(w => w.id === plan.writerId) || TIMELESS_WRITERS[0];
  const systemPrompt = TIMELESS_PROMPTS.buildSystem(writer.id);

  console.log(`\n  ✦ [${index}] Generando outline · categoría=${plan.cat} · voz=${writer.name} · premisa="${plan.premise.slice(0, 60)}..."`);
  const outlineUser = TIMELESS_PROMPTS.buildOutline(plan.premise, plan.cat, plan.chapters, plan.tone, writer.id);
  const rawOutline = await callGemini(systemPrompt, outlineUser, { temperature: 0.80, maxTokens: 2048 });
  const outline = extractJson(rawOutline);
  console.log(`    → título generado: "${outline.title}"`);

  const chapters = [];
  for (let i = 0; i < outline.chapters.length; i++) {
    process.stdout.write(`    · capítulo ${i + 1}/${outline.chapters.length}... `);
    const chapterUser = TIMELESS_PROMPTS.buildChapter(outline, i, { genre: plan.cat, tone: plan.tone, writerId: writer.id });
    let rawChapter = await callGemini(systemPrompt, chapterUser, { temperature: 0.92, maxTokens: 2500 });

    // Control de calidad real: si el primer capítulo reprueba el BSC, se
    // reescribe una vez pasándole la nota editorial como corrección — a
    // diferencia del Agente del sitio, acá el puntaje si tiene consecuencia.
    if (i === 0) {
      const bsc = await evaluateBSC(rawChapter, plan.cat);
      if (bsc.overall < 82) {
        console.log(`\n      ⚠ BSC ${bsc.overall}/100 ("${bsc.nota_editorial}") — reescribiendo con la crítica...`);
        const retryPrompt = `${chapterUser}\n\nNOTA DEL EDITOR SOBRE UN INTENTO ANTERIOR (corregí esto en la nueva versión): "${bsc.nota_editorial}"`;
        rawChapter = await callGemini(systemPrompt, retryPrompt, { temperature: 0.92, maxTokens: 2500 });
      } else {
        console.log(`(BSC ${bsc.overall}/100 ✓)`);
      }
    } else {
      console.log('ok');
    }

    chapters.push(toParagraphHtml(rawChapter));
    await sleep(600); // margen amistoso contra rate limits
  }

  const isKids = plan.cat === 'kids';
  const kidsExtra = isKids ? {
    ageBadge: pick(['4-8 años', '6-10 años', '8-12 años'], index),
    collectionTitle: plan.genreLabel.toUpperCase(),
    coverAccent: pick(KIDS_ACCENTS, index).primary,
    coverAccentMuted: pick(KIDS_ACCENTS, index).secondary,
  } : {};

  const totalWords = chapters.join(' ').split(/\s+/).filter(Boolean).length;
  const pages = Math.max(32, Math.round(totalWords / 260));
  const durationMinutes = Math.round(totalWords / 200);

  // Preview corto del capítulo 1 para lectores sin suscripción (misma
  // fórmula que usa renderPreview() en el lector). La prosa completa NUNCA
  // va al doc público de 'books' — 'books' es legible por cualquier usuario
  // autenticado, incluso gratuito; la prosa completa vive solo en
  // 'books_full', bloqueada por completo a nivel de reglas y servida bajo
  // demanda desde /api/book/:id/chunk/:index, que sí valida suscripción.
  const previewChapter = (chapters[0] || "")
    .split('\n')
    .filter(p => p.trim())
    .slice(0, 3)
    .join('\n');

  const bookData = {
    title: outline.title,
    author: pick(FICTIONAL_PSEUDONYMS, index),
    cat: plan.cat,
    genre: plan.genreLabel,
    cover: isKids ? pick(KIDS_EMOJIS, index) : pick(COVER_PRESETS, index),
    badge: index % 5 === 0 ? 'new' : (index % 7 === 0 ? 'excl' : ''),
    badgeText: index % 5 === 0 ? 'Nuevo' : (index % 7 === 0 ? 'Exclusivo' : ''),
    pages,
    duration: isKids ? `${durationMinutes}min` : `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}min`,
    desc: outline.premise,
    tagline: outline.premise.split('.')[0] + '.',
    themes: outline.themes || [],
    previewChapter,
    outline: {
      title: outline.title,
      chapters: outline.chapters.map(c => ({ title: c.title, arc: c.arc })),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    generatedBy: `gemini-ai:${writer.id}`,
    ...kidsExtra,
  };

  const bookId = `ai-${plan.cat}-${slugify(outline.title)}`;
  await db.collection('books').doc(bookId).set(bookData);
  await db.collection('books_full').doc(bookId).set({ chapters });
  console.log(`    ✔ Guardado como books/${bookId} (+ books_full/${bookId})`);
  return bookId;
}

async function evaluateBSC(text, genre) {
  const SYSTEM = 'Eres un crítico literario de una editorial de lujo. Devuelves solo JSON.';
  const userPrompt = TIMELESS_PROMPTS.buildBSC(text, genre);
  try {
    const raw = await callGemini(SYSTEM, userPrompt, { temperature: 0.20, maxTokens: 300 });
    return extractJson(raw);
  } catch (e) {
    console.warn('    ⚠ No se pudo evaluar BSC, se omite la reescritura:', e.message);
    return { overall: 100, nota_editorial: '' };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));
  let plans = BOOK_PLANS;
  if (args.length === 1) {
    plans = BOOK_PLANS.slice(0, args[0]);
  } else if (args.length === 2) {
    plans = BOOK_PLANS.slice(args[0], args[1]);
  }

  console.log(`\n  ✦ [Timeless AI Seed] Generando ${plans.length} de ${BOOK_PLANS.length} obras con IA real (modelo: ${MODEL})...\n`);

  let ok = 0, failed = 0;
  for (let i = 0; i < plans.length; i++) {
    try {
      await generateBook(plans[i], i);
      ok++;
    } catch (err) {
      failed++;
      console.error(`  ✗ [${i}] Falló la generación:`, err.message);
    }
    await sleep(1000);
  }

  console.log(`\n  ✦ Listo. ${ok} obras generadas con éxito, ${failed} fallidas.\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
