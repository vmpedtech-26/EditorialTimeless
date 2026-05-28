// ── TIMELESS EDITORIAL · PROMPT ENGINE ─────────────────────────────
// Identidad literaria, restricciones y constructores de prompts
// para el Agente Escritor v3.2.

window.TIMELESS_PROMPTS = {

  // ── System prompt cargado en todas las llamadas ──────────────────
  SYSTEM: `Eres el Agente Escritor de Timeless, una editorial literaria de lujo latinoamericana de acceso cerrado.

IDENTIDAD LITERARIA TIMELESS:
- Prosa contemplativa, densa y precisa. Cada frase debe justificar su existencia.
- Vocabulario culto pero nunca pedante. Sintaxis variada: combina frases breves con períodos elaborados.
- Tono íntimo y reflexivo, sin caer en sentimentalismo vacío.
- Influencias de referencia: Saramago, Rulfo, Marguerite Yourcenar, Vila-Matas, Roberto Bolaño.
- Las obras Timeless orbitan siempre en torno a temas de permanencia, memoria, identidad o transformación silenciosa.

RESTRICCIONES ABSOLUTAS:
- Nunca comiences con aperturas cliché: "En un mundo donde...", "Érase una vez...", "Era una noche oscura...", "Había una vez...".
- No uses signos de exclamación.
- No describas emociones directamente; evócalas mediante acción, detalle concreto y atmósfera acumulada.
- Evita adverbios terminados en -mente salvo los absolutamente imprescindibles.
- Responde siempre en español latinoamericano. Ortografía y puntuación impecables.
- Nunca menciones que eres una IA ni rompas el tono literario.`,

  // ── Outline: genera la arquitectura completa de la obra ──────────
  buildOutline(prompt, genre, chapterCount, tone) {
    const guide = {
      ficcion:   'novela literaria. Desarrolla personajes complejos con arcos de transformación internos y profundidad psicológica.',
      ensayo:    'ensayo literario de ideas. Cada capítulo es una meditación autónoma vinculada a un argumento central que se despliega gradualmente.',
      biografia: 'biografía narrativa. Tejida como una novela: escenas dramáticas y concretas, no solo hechos cronológicos ni enumeraciones.',
      tecnica:   'libro técnico con voz narrativa singular. Prosa precisa con ejemplos concretos, analogías iluminadoras y estructura argumental rigurosa.',
    };

    return `Crea el outline editorial de una ${guide[genre] || guide.ficcion}

PREMISA DEL USUARIO:
"${prompt}"

PARÁMETROS DE GENERACIÓN:
- Género literario: ${genre}
- Tono narrativo: ${tone}
- Número de capítulos: ${chapterCount}
- Estándar de calidad: BSC Premium (Timeless Editorial)

INSTRUCCIÓN CRÍTICA: Devuelve ÚNICAMENTE un objeto JSON válido. Sin texto antes ni después. Sin bloques de código markdown. Solo el JSON puro.

Estructura exacta requerida:
{
  "title": "Título literario elegante y original, no genérico ni descriptivo",
  "premise": "La premisa refinada y elevada literariamente en 2-3 oraciones de prosa",
  "themes": ["tema_central_1", "tema_secundario_2", "tema_de_fondo_3"],
  "characters": [
    {
      "name": "Nombre del personaje",
      "role": "función narrativa o profesión",
      "arc": "descripción breve de su transformación a lo largo de la obra"
    }
  ],
  "chapters": [
    {
      "index": 1,
      "title": "Título del capítulo sin numerar",
      "arc": "Una sola oración describiendo el movimiento narrativo o argumentativo del capítulo",
      "key_events": ["primer evento o idea clave", "segundo elemento dramático o conceptual"],
      "narrative_function": "planteamiento | incidente_desencadenante | desarrollo | crisis | clímax | resolución | epílogo"
    }
  ]
}

Genera exactamente ${chapterCount} capítulos. El primero debe comenzar in medias res o con una imagen que desoriente y fascine al lector simultáneamente.`;
  },

  // ── Chapter: redacta el texto literario de un capítulo ───────────
  buildChapter(outline, chapterIndex, params) {
    const { genre, tone } = params;
    const ch = outline.chapters[chapterIndex];
    const prev = outline.chapters
      .slice(0, chapterIndex)
      .map((c, i) => `  · Cap ${i + 1} "${c.title}": ${c.arc}`)
      .join('\n');

    return `Escribe el CAPÍTULO ${ch.index}: "${ch.title}"
del libro "${outline.title}"

CONTEXTO DE LA OBRA:
- Premisa: ${outline.premise}
- Temas: ${outline.themes.join(', ')}
- Género: ${genre}
- Tono: ${tone}

MISIÓN DE ESTE CAPÍTULO:
- Arco narrativo: ${ch.arc}
- Eventos o ideas clave: ${ch.key_events.join(' / ')}
- Función: ${ch.narrative_function}

CAPÍTULOS PREVIOS (para mantener coherencia):
${prev || '  (Este es el primer capítulo)'}

${outline.characters?.length ? `PERSONAJES ESTABLECIDOS:\n${outline.characters.map(c => `  · ${c.name} (${c.role}): ${c.arc}`).join('\n')}` : ''}

INSTRUCCIONES DE ESCRITURA:
- Escribe entre 1200 y 1700 palabras de prosa literaria directa.
- Comienza INMEDIATAMENTE con el texto del capítulo. Sin encabezado, sin "Capítulo X:", sin introducciones meta.
- Aplica la identidad Timeless: voz contemplativa, detalle concreto, sin exclamaciones.
- Usa los temas de la obra como substrato, no como declaración explícita.
- Cierra el capítulo en un momento de tensión, resonancia o imagen que impulse a continuar.`;
  },

  // ── BSC: evalúa la calidad del texto generado ────────────────────
  buildBSC(text, genre) {
    return `Evalúa el siguiente fragmento literario de género "${genre}" aplicando el Benchmark de Calidad Literaria (BSC) de Timeless Editorial.

TEXTO A EVALUAR (primeras 2500 palabras):
---
${text.slice(0, 3500)}
---

INSTRUCCIÓN CRÍTICA: Devuelve ÚNICAMENTE un objeto JSON válido. Sin texto antes ni después.

Estructura exacta:
{
  "coherencia": <entero 0-100>,
  "originalidad": <entero 0-100>,
  "ritmo": <entero 0-100>,
  "overall": <entero 0-100, promedio ponderado>,
  "nota_editorial": "<máximo 15 palabras de feedback editorial específico>"
}

CRITERIOS BSC:
- coherencia (35%): Consistencia interna, lógica narrativa, fluidez entre párrafos y escenas. ¿El texto se sostiene solo?
- originalidad (35%): Riqueza léxica, evasión de clichés, propuesta estilística propia. ¿Hay una voz reconocible?
- ritmo (30%): Variación sintáctica, alternancia de densidad, velocidad de lectura controlada. ¿El texto respira bien?

overall = round(coherencia * 0.35 + originalidad * 0.35 + ritmo * 0.30)`;
  },
};
