'use strict';
// Filtro de los pedidos que el navegador manda a Gemini a través del servidor.
// Antes /api/generate y /api/stream reenviaban req.body sin tocar, así que un
// suscriptor podía pedir herramientas más caras, respuestas gigantes o
// contenido multimodal con la clave y la cuota del proyecto. Acá solo pasa
// texto, con topes de tamaño y de configuración.

const MAX_CONTENTS = 40;
const MAX_PARTS = 8;
const MAX_TOTAL_CHARS = 120000;
const MAX_SYSTEM_CHARS = 30000;
const MAX_OUTPUT_TOKENS = 8192;

class BadAiRequest extends Error {}

function textParts(parts, label) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_PARTS) throw new BadAiRequest(`${label}: partes inválidas.`);
  return parts.map(p => {
    if (!p || typeof p.text !== 'string') throw new BadAiRequest(`${label}: solo se admite texto.`);
    return { text: p.text };
  });
}

function num(v, min, max, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function sanitizeGeminiRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadAiRequest('Pedido inválido.');
  if (!Array.isArray(body.contents) || body.contents.length < 1 || body.contents.length > MAX_CONTENTS) {
    throw new BadAiRequest('El pedido necesita entre 1 y 40 mensajes.');
  }

  const contents = body.contents.map((c, i) => {
    if (!c || typeof c !== 'object') throw new BadAiRequest(`Mensaje ${i + 1} inválido.`);
    const role = c.role === 'model' ? 'model' : 'user';
    return { role, parts: textParts(c.parts, `Mensaje ${i + 1}`) };
  });

  const sys = body.system_instruction || body.systemInstruction;
  const clean = { contents };
  let total = contents.reduce((n, c) => n + c.parts.reduce((m, p) => m + p.text.length, 0), 0);
  if (sys) {
    clean.system_instruction = { parts: textParts(sys.parts, 'system_instruction') };
    const sysChars = clean.system_instruction.parts.reduce((m, p) => m + p.text.length, 0);
    if (sysChars > MAX_SYSTEM_CHARS) throw new BadAiRequest('La instrucción de sistema es demasiado larga.');
    total += sysChars;
  }
  if (total > MAX_TOTAL_CHARS) throw new BadAiRequest('El pedido es demasiado largo.');

  const g = body.generationConfig && typeof body.generationConfig === 'object' ? body.generationConfig : {};
  clean.generationConfig = {
    temperature: num(g.temperature, 0, 2, 0.85),
    topP: num(g.topP, 0, 1, 0.95),
    maxOutputTokens: Math.round(num(g.maxOutputTokens, 1, MAX_OUTPUT_TOKENS, 4096)),
    candidateCount: 1
  };
  return clean;
}

// Los errores de Gemini no se reenvían tal cual (pueden traer detalles de la
// cuenta o del proyecto): el cliente recibe solo un mensaje y un código.
function publicUpstreamError(status, data) {
  if (status === 429) return { status: 429, message: 'El servicio de redacción está saturado. Probá de nuevo en un momento.' };
  if (status >= 500) return { status: 502, message: 'El servicio de redacción no está disponible ahora.' };
  const raw = data && data.error && typeof data.error.message === 'string' ? data.error.message : '';
  if (/api key|permission|credential|unauthenticated|billing/i.test(raw) || status === 401 || status === 403) {
    return { status: 502, message: 'El servicio de redacción no está configurado correctamente. Avisale al editor.' };
  }
  return { status: 400, message: 'El pedido fue rechazado.' };
}

module.exports = { sanitizeGeminiRequest, publicUpstreamError, BadAiRequest, MAX_OUTPUT_TOKENS };
