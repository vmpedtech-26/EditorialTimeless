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

  // 0. Largo: un capítulo que no llega a la extensión de su formato es un fragmento, no un capítulo.
  if (Array.isArray(opts.words) && wc < opts.words[0] * 0.6) add('longitud', `Tiene ${wc} palabras y el formato pide entre ${opts.words[0]} y ${opts.words[1]}. Es un fragmento: desarrollá escenas completas.`, 40);

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


  // 12. Redacción: errores mecánicos que un corrector marcaría de inmediato
  const mech = [];
  const dbl = (clean.match(/[^\s] {2,}[^\s]/g) || []).length;
  if (dbl) mech.push(`${dbl} espacios dobles`);
  const spBefore = (clean.match(/\S [,.;:](?=\s|$)/g) || []).length;
  if (spBefore) mech.push(`${spBefore} espacios antes de coma o punto`);
  const cnt = (re) => (clean.match(re) || []).length;
  if (cnt(/¿/g) !== cnt(/\?/g)) mech.push(`signos de pregunta desparejos (${cnt(/¿/g)} ¿ / ${cnt(/\?/g)} ?)`);
  if (cnt(/¡/g) !== cnt(/!/g)) mech.push(`signos de exclamación desparejos (${cnt(/¡/g)} ¡ / ${cnt(/!/g)} !)`);
  if (cnt(/\(/g) !== cnt(/\)/g)) mech.push('paréntesis sin cerrar');
  if (cnt(/«/g) !== cnt(/»/g)) mech.push('comillas « » sin cerrar');
  if (cnt(/"/g) % 2) mech.push('comillas rectas sin cerrar');
  const OKREP = /^(no|sí|si|ya|muy|ja|jaja|bla|tan|así|vamos|dale|poco|bien|mal|todo|nada|mil|tic|tac|toc|y)$/i;
  const reps = [...clean.matchAll(/\b([a-záéíóúñ]{2,})\s+\1\b/gi)].filter(m => !OKREP.test(m[1]));
  if (reps.length) mech.push(`palabra repetida seguida («${reps[0][0]}»)`);
  const deq = clean.match(/\b(pienso|creo|opino|dijo|dice|digo|sé|supo|sabía|pensó|pensaba|parece|aseguró|cree|creía|dijeron|dicen) de que\b/i);
  if (deq) mech.push(`dequeísmo («${deq[0]}»)`);
  const que = clean.match(/\b(me di cuenta|se dio cuenta|se dieron cuenta|nos dimos cuenta|te das cuenta|me doy cuenta) que\b/i);
  if (que) mech.push(`queísmo («${que[0]}»)`);
  const hab = clean.match(/\b(habían|hubieron|habrán|habrían|habían)\s+(muchos|muchas|varios|varias|pocos|pocas|algunos|algunas|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/i);
  if (hab) mech.push(`«${hab[0]}»: «haber» impersonal va en singular`);
  const mule = clean.match(/\b(a nivel de|en base a|en el día de hoy|de cara a)\b/i);
  if (mule) mech.push(`muletilla de oficina («${mule[0]}»)`);
  if (mech.length) add('redaccion', `Errores de redacción: ${mech.join('; ')}. Corregilos uno por uno.`, Math.min(30, 5 * mech.length));

  // 13. Registro: voseo y tuteo en el mismo texto
  const vos = clean.match(/\b(tenés|querés|sabés|podés|decís|sos|vos|hacé|mirá|andá|venís|pensás|salís|ponés)\b/gi) || [];
  const tu = clean.match(/\b(tienes|quieres|sabes|puedes|dices|eres|tú|haces|vienes|piensas|sales|pones)\b/gi) || [];
  if (vos.length && tu.length) add('voseo_mezclado', `Mezcla voseo («${vos[0]}») y tuteo («${tu[0]}»). Elegí uno según quién habla y mantenelo.`, 12);

  // 14. Argentinismos de decorado
  const FOLK = /\b(che|boludo|boluda|pibe|pibes|piba|pibas|laburo|laburar|laburando|guita|quilombo|bondi|morfar|mango|mangos|pelotudo|chabón|chamuyo|afanar|garpar|bardo|fiaca|posta|re (lindo|linda|bueno|buena|loco|loca|mal|bien)|dale[,.!]|viste\?|capaz que)\b|\b(mate|asado|fernet|choripán|choripan|dulce de leche|medialunas|alfajor|alfajores)\b/gi;
  const folk = clean.match(FOLK) || [];
  const dens = folk.length / wc * 1000;
  if (dens > 4) add('argentinismo_forzado', `Argentinismos y color local de postal (${[...new Set(folk.map(x => x.toLowerCase()))].slice(0, 6).join(', ')}): ${folk.length} en ${wc} palabras. Suena a decorado. Dejá solo lo que un personaje diría de verdad y sacá el resto.`, dens > 9 ? 14 : 7);

  const penalty = findings.reduce((n, f) => n + f.penalty, 0);
  const score = Math.max(0, 100 - penalty);
  return { score, pass: score >= LINT_THRESHOLD && !findings.some(f => f.rule === 'meta'), wordCount: wc, findings };
}


// Continuidad entre capítulos: nombres propios nuevos o escritos de dos maneras.
// `known` = texto de referencia (plan + capítulos anteriores). Devuelve avisos.
export function checkContinuity(text, known) {
  const clean = String(text || '').replace(/<[^>]+>/g, ' ');
  const ref = String(known || '');
  const nameRe = /(?<!(?:^|\n|[.!?…¿¡—"«»:(]\s*|\p{L}))([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})(?!\p{L})/gu;
  const STOPN = new Set(['Pero', 'Cuando', 'Entonces', 'Después', 'Mientras', 'Aunque', 'Como', 'Porque', 'Todo', 'Nada', 'Algo', 'Nadie', 'Tal', 'Así', 'Ahora', 'Luego', 'Siempre', 'Nunca', 'Aquí', 'Allí', 'Dios', 'Señor', 'Señora', 'Doña', 'Don']);
  const counts = {};
  for (const m of clean.matchAll(nameRe)) { if (!STOPN.has(m[1])) counts[m[1]] = (counts[m[1]] || 0) + 1; }
  const refNames = new Set([...ref.matchAll(/(?<!\p{L})([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})(?!\p{L})/gu)].map(m => m[1]));
  const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  const out = [];
  for (const [n, c] of Object.entries(counts)) {
    if (refNames.has(n)) continue;
    const near = [...refNames].find(r => r.length > 3 && lev(n.toLowerCase(), r.toLowerCase()) <= 1);
    if (near) out.push({ level: 'error', msg: `«${n}» parece una variante de «${near}»: un nombre se escribe siempre igual.` });
    else if (c >= 2) out.push({ level: 'aviso', msg: `Aparece «${n}» ×${c} y no figura en el plan ni en los capítulos anteriores. ¿Es un personaje o lugar nuevo previsto?` });
  }
  return out;
}

// Convierte los hallazgos en una instrucción de corrección para la reescritura.
export function lintToEditorNote(result) {
  if (!result || !result.findings.length) return '';
  return result.findings.filter(f => f.rule !== 'vacio')
    .map(f => `- ${f.detail}${f.sample ? ` (por ejemplo: «${f.sample}»)` : ''}`).join('\n');
}
