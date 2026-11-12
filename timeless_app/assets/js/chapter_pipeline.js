// Pipeline de redacción de UN capítulo con control de calidad real.
// Sin dependencias (ni DOM ni Firebase): lo usa el Agente Escritor del sitio y
// se prueba con respuestas simuladas en tests/pipeline.test.js.
//
// Flujo: redactar (con el final real del capítulo anterior para que haya
// continuidad) -> evaluar con el BSC -> si el puntaje no llega al umbral,
// reescribir con la nota del editor -> quedarse con la mejor versión.

export const BSC_THRESHOLD = 82;
export const CONTINUITY_CHARS = 1800;

// Acepta la respuesta cruda del modelo y devuelve un BSC consistente o null
// si no trae puntajes utilizables (nunca se inventan puntajes).
export function normalizeBsc(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : null);
  const coherencia = num(raw.coherencia), originalidad = num(raw.originalidad), ritmo = num(raw.ritmo);
  let overall = num(raw.overall);
  if (overall === null && coherencia !== null && originalidad !== null && ritmo !== null) {
    overall = Math.round(coherencia * 0.35 + originalidad * 0.35 + ritmo * 0.30);
  }
  if (overall === null) return null;
  return { coherencia, originalidad, ritmo, overall, nota_editorial: String(raw.nota_editorial || '') };
}

// Promedia los BSC de varios capítulos (ignora los no evaluados).
export function averageBsc(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  const avg = key => {
    const vals = ok.map(b => b[key]).filter(v => typeof v === 'number');
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  return { coherencia: avg('coherencia'), originalidad: avg('originalidad'), ritmo: avg('ritmo'), overall: avg('overall'), chapters: ok.length };
}

/**
 * @param {object}   o
 * @param {Function} o.stream     ({previousText, editorNote}) => async iterable de fragmentos de texto
 * @param {Function} o.evaluate   (text) => Promise<bsc|null>
 * @param {string}   [o.previousText] texto completo del capítulo anterior
 * @param {boolean}  [o.review]   false = calidad "standard" (sin BSC)
 * @yields {{type:'chunk',text:string}|{type:'review',attempt:number,bsc:object|null}|
 *          {type:'rewrite',attempt:number,note:string}|{type:'kept-original'}|
 *          {type:'done',text:string,bsc:object|null,rewrites:number}}
 */
export async function* produceChapter({ stream, evaluate, previousText = '', review = true, threshold = BSC_THRESHOLD, maxRewrites = 1 }) {
  const tail = previousText ? previousText.slice(-CONTINUITY_CHARS) : '';

  let text = '';
  for await (const chunk of stream({ previousText: tail })) {
    text += chunk;
    yield { type: 'chunk', text };
  }

  let bsc = null;
  let rewrites = 0;
  if (review) {
    bsc = normalizeBsc(await evaluate(text));
    yield { type: 'review', attempt: 0, bsc };

    while (bsc && bsc.overall < threshold && rewrites < maxRewrites) {
      rewrites++;
      yield { type: 'rewrite', attempt: rewrites, note: bsc.nota_editorial };

      let candidate = '';
      for await (const chunk of stream({ previousText: tail, editorNote: bsc.nota_editorial || 'Elevá el nivel literario general: más concreción, subtexto y variación de ritmo.' })) {
        candidate += chunk;
        yield { type: 'chunk', text: candidate };
      }
      const candBsc = normalizeBsc(await evaluate(candidate));
      yield { type: 'review', attempt: rewrites, bsc: candBsc };

      if (candBsc && candBsc.overall >= bsc.overall) {
        text = candidate;
        bsc = candBsc;
      } else {
        // La reescritura no mejoró (o no se pudo evaluar): se conserva la original.
        yield { type: 'kept-original' };
        yield { type: 'chunk', text };
        break;
      }
    }
  }

  yield { type: 'done', text, bsc, rewrites };
}
