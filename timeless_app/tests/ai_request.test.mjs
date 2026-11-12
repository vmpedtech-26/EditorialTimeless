import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sanitizeGeminiRequest, publicUpstreamError, BadAiRequest, MAX_OUTPUT_TOKENS } = require('../ai_request.js');

const ok = { system_instruction: { parts: [{ text: 'sys' }] }, contents: [{ role: 'user', parts: [{ text: 'hola' }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 2500, topP: 0.9 } };

test('un pedido normal del Agente pasa intacto', () => {
  const r = sanitizeGeminiRequest(ok);
  assert.equal(r.contents[0].parts[0].text, 'hola');
  assert.equal(r.system_instruction.parts[0].text, 'sys');
  assert.deepEqual(r.generationConfig, { temperature: 0.8, topP: 0.9, maxOutputTokens: 2500, candidateCount: 1 });
});

test('campos no permitidos se descartan (herramientas, safety, modelo, cache)', () => {
  const r = sanitizeGeminiRequest({ ...ok, tools: [{ google_search: {} }], safetySettings: [], model: 'x', cachedContent: 'c', toolConfig: {},
    generationConfig: { ...ok.generationConfig, thinkingConfig: { thinkingBudget: 99999 }, responseSchema: {}, candidateCount: 8 } });
  assert.deepEqual(Object.keys(r).sort(), ['contents', 'generationConfig', 'system_instruction']);
  assert.deepEqual(Object.keys(r.generationConfig).sort(), ['candidateCount', 'maxOutputTokens', 'temperature', 'topP']);
  assert.equal(r.generationConfig.candidateCount, 1);
});

test('la salida se acota y los valores raros caen a los por defecto', () => {
  assert.equal(sanitizeGeminiRequest({ ...ok, generationConfig: { maxOutputTokens: 10 ** 9 } }).generationConfig.maxOutputTokens, MAX_OUTPUT_TOKENS);
  assert.equal(sanitizeGeminiRequest({ ...ok, generationConfig: { maxOutputTokens: -5 } }).generationConfig.maxOutputTokens, 1);
  assert.equal(sanitizeGeminiRequest({ ...ok, generationConfig: { temperature: 99 } }).generationConfig.temperature, 2);
  assert.equal(sanitizeGeminiRequest({ ...ok, generationConfig: { temperature: 'alto' } }).generationConfig.temperature, 0.85);
  assert.equal(sanitizeGeminiRequest({ contents: ok.contents }).generationConfig.maxOutputTokens, 4096);
});

test('solo se admite texto: imágenes, archivos y partes raras se rechazan', () => {
  for (const parts of [[{ inline_data: { mime_type: 'image/png', data: 'AAAA' } }], [{ fileData: { fileUri: 'x' } }], [{ text: 5 }], [], null])
    assert.throws(() => sanitizeGeminiRequest({ contents: [{ role: 'user', parts }] }), BadAiRequest);
});

test('tamaños: demasiados mensajes, texto enorme o sistema enorme se rechazan', () => {
  assert.throws(() => sanitizeGeminiRequest({ contents: Array(41).fill(ok.contents[0]) }), BadAiRequest);
  assert.throws(() => sanitizeGeminiRequest({ contents: [{ role: 'user', parts: [{ text: 'a'.repeat(120001) }] }] }), BadAiRequest);
  assert.throws(() => sanitizeGeminiRequest({ ...ok, system_instruction: { parts: [{ text: 'a'.repeat(30001) }] } }), BadAiRequest);
  assert.throws(() => sanitizeGeminiRequest({ contents: [] }), BadAiRequest);
});

test('entradas que no son objeto se rechazan', () => {
  for (const b of [null, undefined, 'x', 5, [], {}]) assert.throws(() => sanitizeGeminiRequest(b), BadAiRequest);
});

test('el rol solo puede ser user o model', () => {
  assert.equal(sanitizeGeminiRequest({ contents: [{ role: 'system', parts: [{ text: 'x' }] }] }).contents[0].role, 'user');
  assert.equal(sanitizeGeminiRequest({ contents: [{ role: 'model', parts: [{ text: 'x' }] }] }).contents[0].role, 'model');
});

test('los errores de Gemini no se filtran al cliente', () => {
  const leaky = { error: { message: 'API key not valid. Please pass a valid API key. project 12345 key AIzaSyXXXX' } };
  for (const status of [400, 401, 403, 429, 500, 503]) {
    const e = publicUpstreamError(status, leaky);
    assert.ok(!/AIza|12345|project/i.test(e.message), `status ${status}`);
  }
  assert.equal(publicUpstreamError(429, {}).status, 429);
  assert.equal(publicUpstreamError(503, {}).status, 502);
  assert.equal(publicUpstreamError(403, leaky).status, 502);
});
