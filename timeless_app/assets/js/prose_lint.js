// Detector de tics de prosa "de manual" en español. Sin dependencias: lo usan
// el pipeline de capítulos (browser y Node) y las pruebas.
//
// No juzga calidad literaria: mide los patrones que más delatan un texto
// escrito en piloto automático (comparaciones en cadena, "No era X. Era Y",
// adjetivos abstractos de relleno, cierres que explican la epifanía, ritmo
// uniforme, poca escena) y devuelve hallazgos concretos para que una
// reescritura sepa exactamente qué corregir.

export const LINT_THRESHOLD = 80;

// Palabras y giros que aparecen mucho más en prosa automática que en la de oficio.
const CLICHE_WORDS = [
  'susurr', 'tapiz', 'entramado', 'etére', 'palpable', 'inefable', 'imborrable', 'inconfundible',
  'sutil', 'cernía', 'cernir', 'cargado de', 'cargada de', 'testimonio de', 'sinfonía', 'danza de',
  'mineral', 'atávic', 'ancestral', 'telúric', 'visceral', 'fugaz', 'efímer', 'umbral de',
  'laberinto de', 'crisol', 'vorágine', 'sempitern', 'inexorable', 'indescriptible'
];
const CLICHE_PHRASES = [
  /un nudo en la garganta/i, /contuvo la respiraci[oó]n/i, /un escalofr[ií]o (le )?recorri[oó]/i,
  /el coraz[oó]n (le )?lat[ií]a/i, /sin saber por qu[eé]/i, /algo (en su interior|dentro de ella|dentro de [eé]l) (se )?(rompi|quebr|cambi|movi)/i,
  /el silencio (se )?(instal[oó]|se hizo|pesaba|llen[oó])/i, /el aire (se )?(volvi[oó]|se hizo|se cargó)/i,
  /una mezcla de [a-záéíóúñ]+ y [a-záéíóúñ]+/i, /por primera vez en (mucho|a[nñ]os|su vida)/i,
  /luz dorada/i, /el peso de (los|las|sus|un|una) [a-záéíóúñ]+/i, /como quien [a-záéíóúñ]+/i,
  /en un mundo (donde|en el que)/i, /no (solo|solamente) [^.]{3,60}, sino (que )?(tambi[eé]n )?/i,
  /(era|fue) como si el tiempo se (detuviera|hubiera detenido)/i, /las palabras (sobraban|pesaban|se quedaron)/i,
  /un torbellino de/i, /un abismo (de|entre)/i
];

const META_AI = /(inteligencia artificial|modelo de lenguaje|\bIA\b|\bchatgpt\b|\bgemini\b|como (un )?(asistente|modelo)\b|no puedo (continuar|ayudar) con|aqu[ií] tienes|aqu[ií] est[aá] (el|tu) (cap[ií]tulo|texto)|espero que te (guste|sirva))/i;

function words(s) { return (s.match(/[\p{L}\p{N}'’-]+/gu) || []); }
function sentences(s) {
  return s.replace(/\n+/g, ' ').split(/(?<=[.!?…])\s+(?=[—"«¿¡A-ZÁÉÍÓÚÑ])/u).map(x => x.trim()).filter(x => words(x).length > 0);
}
function snippet(text, index, len = 90) {
  const a = Math.max(0, index - 25);
  return (a > 0 ? '…' : '') + text.slice(a, a + len).replace(/\s+/g, ' ') + '…';
}

/**
 * @param {string} text
 * @param {{ kind?: 'narrative'|'expository' }} [opts]  expository = ensayo/técnica/divulgación (no exige diálogo)
 * @returns {{ score:number, pass:boolean, wordCount:number, findings:Array<{rule:string,detail:string,sample?:string,penalty:number}> }}
 */
export function lintProse(text, opts = {}) {
  const kind = opts.kind || 'narrative';
  const clean = String(text || '').replace(/<[^>]+>/g, ' ');
  const wc = words(clean).length;
  const findings = [];
  const add = (rule, detail, penalty, sample) => findings.push({ rule, detail, penalty, ...(sample ? { sample } : {}) });
  if (wc < 40) return { score: 0, pass: false, wordCount: wc, findings: [{ rule: 'vacio', detail: 'Texto demasiado corto para evaluar.', penalty: 100 }] };

  // 1. Texto que habla de sí mismo o de la máquina: nunca debe llegar a un libro.
  const meta = clean.match(META_AI);
  if (meta) add('meta', `Aparece «${meta[0]}»: el texto habla de su propia producción. Debe ser solo literatura.`, 60, snippet(clean, meta.index));
  if (/(\*[^*\n]{1,80}\*|^#{1,4}\s|^\s*[-*]\s+\S)/m.test(clean)) add('formato', 'Hay marcas de markdown (asteriscos, títulos o viñetas) dentro de la prosa.', 15);

  // 2. "No era X. Era Y." y "no solo X, sino Y"
  const contrast = [...clean.matchAll(/\b[Nn]o (era|fue|es|eran|son|estaba|había)\b[^.!?\n]{2,90}[.;]\s*(Era|Fue|Es|Eran|Son|Estaba|Había)\b/g)];
  if (contrast.length > 1) add('no_era_sino_era', `«No era X. Era Y.» aparece ${contrast.length} veces: es el recurso más reconocible de la prosa automática. Dejá solo lo que afirma.`, 6 * (contrast.length - 1), snippet(clean, contrast[0].index));

  // 3. Comparaciones «como si»
  const comoSi = [...clean.matchAll(/\bcomo si\b/gi)];
  const comoSiAllowed = Math.max(2, Math.round(wc / 450));
  if (comoSi.length > comoSiAllowed) add('como_si', `${comoSi.length} «como si» en ${wc} palabras (máximo razonable: ${comoSiAllowed}). Cambiá la mayoría por una afirmación directa o por un detalle concreto.`, 4 * (comoSi.length - comoSiAllowed), snippet(clean, comoSi[comoSi.length - 1].index));

  // 4. Palabras de relleno "poético"
  const lower = clean.toLowerCase();
  const hits = [];
  for (const w of CLICHE_WORDS) { let i = lower.indexOf(w); while (i !== -1) { hits.push({ w, i }); i = lower.indexOf(w, i + w.length); } }
  if (hits.length > 2) add('palabras_de_relleno', `Adjetivos/sustantivos abstractos de relleno (${[...new Set(hits.map(h => h.w))].slice(0, 6).join(', ')}…). Reemplazalos por lo que el personaje ve o toca.`, 3 * (hits.length - 2), snippet(clean, hits[0].i));

  // 5. Frases hechas
  const phr = CLICHE_PHRASES.map(re => { const m = clean.match(re); return m ? { m: m[0], i: m.index } : null; }).filter(Boolean);
  if (phr.length) add('frases_hechas', `Frases hechas: ${phr.slice(0, 4).map(p => '«' + p.m + '»').join(', ')}. Contá la reacción con un gesto particular de ese personaje.`, 5 * phr.length, snippet(clean, phr[0].i));

  // 6. Cierre que explica la epifanía
  const tail = clean.trim().slice(-420);
  const epi = tail.match(/(comprendi[oó]|entendi[oó]|se dio cuenta|supo que|ya sab[ií]a|sinti[oó] que (nada|todo))/i);
  if (epi) add('cierre_epifanico', `El final explica lo que el personaje entendió («${epi[0]}»). Terminá en un gesto, una frase dicha o un objeto, y dejá la conclusión al lector.`, 12, snippet(clean, clean.length - 420 + epi.index));

  // 7. Ritmo
  const sents = sentences(clean);
  const lens = sents.map(s => words(s).length);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1));
  const cv = sd / (mean || 1);
  if (lens.length >= 12 && cv < 0.5) add('ritmo_uniforme', `Las oraciones tienen largos muy parecidos (variación ${cv.toFixed(2)}). Mezclá frases de tres palabras con otras largas y desordenadas.`, 8);
  if (mean > 24) add('oraciones_largas', `Promedio de ${mean.toFixed(0)} palabras por oración: se vuelve solemne y cuesta leerlo. Cortá.`, 6);

  // 8. Poca escena (solo ficción)
  const paras = String(text).split(/\n{1,}/).map(p => p.trim()).filter(Boolean);
  const dialogueParas = paras.filter(p => /^[—«"]/.test(p)).length;
  if (kind === 'narrative' && wc > 600 && paras.length > 3 && dialogueParas / paras.length < 0.08) add('poca_escena', 'Casi no hay diálogo: el capítulo se lee como un resumen. Pasá algo de lo narrado a conversación o acción.', 3);

  // 9. Aperturas repetidas
  const openers = {};
  sents.forEach(s => { const k = words(s).slice(0, 2).join(' ').toLowerCase(); if (k) openers[k] = (openers[k] || 0) + 1; });
  const rep = Object.entries(openers).filter(([k, n]) => n >= 4 && !/^(y |el |la |no )/.test(k));
  if (rep.length) add('aperturas_repetidas', `Muchas oraciones empiezan igual (${rep.slice(0, 3).map(([k, n]) => `«${k}» ×${n}`).join(', ')}).`, 4 * rep.length);

  // 9b. Nombre propio al inicio de casi cada oración (monotonía de sujeto)
  const STOP = /^(el|la|los|las|un|una|y|ella|él|no|se|es|hay|en|del|al|lo|su|si|ya|pero|que|con|por|para|como|cuando|era|fue)$/i;
  const firstWords = {};
  sents.forEach(s => { const w = words(s.replace(/^[—"«¿¡\s]+/, ''))[0]; if (w && /^[A-ZÁÉÍÓÚÑ]/.test(w) && !STOP.test(w)) firstWords[w] = (firstWords[w] || 0) + 1; });
  const subj = Object.entries(firstWords).filter(([, n]) => n >= 8 && n / (sents.length || 1) >= 0.12);
  if (subj.length) add('sujeto_repetido', `Demasiadas oraciones empiezan con «${subj[0][0]}» (×${subj[0][1]}). Empezá por el objeto, el lugar, la palabra de otro o la acción.`, 6);

  // 10. Adverbios en -mente y rayas de aparte en la narración
  const mente = (clean.match(/\b[a-záéíóúñ]{4,}mente\b/gi) || []).length;
  if (mente / wc * 1000 > 8) add('adverbios_mente', `${mente} adverbios en -mente. Un verbo preciso lo hace mejor.`, 5);
  const narrDashes = paras.filter(p => !/^—/.test(p)).reduce((n, p) => n + (p.match(/ — |—[^—\n]{3,60}—/g) || []).length, 0);
  if (narrDashes > 6) add('rayas_de_aparte', `${narrDashes} incisos entre rayas en la narración. Usá comas o punto.`, 4);

  // 11. Enumeraciones de tres
  const triples = (clean.match(/\b[a-záéíóúñ]{3,}, [a-záéíóúñ]{3,} y [a-záéíóúñ]{3,}\b/gi) || []).length;
  if (triples >= 6) add('enumeraciones_de_tres', `${triples} enumeraciones del tipo «A, B y C». Es un ritmo automático: rompelo.`, 4);

  const penalty = findings.reduce((n, f) => n + f.penalty, 0);
  const score = Math.max(0, 100 - penalty);
  return { score, pass: score >= LINT_THRESHOLD && !findings.some(f => f.rule === 'meta'), wordCount: wc, findings };
}

// Convierte los hallazgos en una instrucción de corrección para la reescritura.
export function lintToEditorNote(result) {
  if (!result || !result.findings.length) return '';
  return result.findings.filter(f => f.rule !== 'vacio')
    .map(f => `- ${f.detail}${f.sample ? ` (por ejemplo: «${f.sample}»)` : ''}`).join('\n');
}
