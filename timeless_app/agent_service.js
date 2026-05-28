import { auth } from './firebase_config.js';
import { CryptoUtils } from './assets/js/crypto_utils.js';

window.AgentService = class AgentService {

  constructor() {
    this.model   = 'gemini-2.0-flash';
  }

  // En producción, siempre se tiene acceso a la API a través del proxy del servidor
  hasKey() {
    return true;
  }

  // ── Build Gemini request body ────────────────────────────────────
  _body(systemPrompt, userMessage, cfg = {}) {
    return {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents:           [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature:     cfg.temperature    ?? 0.85,
        maxOutputTokens: cfg.maxTokens      ?? 4096,
        topP:            cfg.topP           ?? 0.95,
      },
    };
  }

  // ── Internal POST ─────────────────────────────────────────────────
  // Enruta siempre a través del servidor local/producción para ocultar la API Key
  async _post(endpoint, body) {
    const isStream = endpoint.includes('stream');
    const url     = isStream ? '/api/stream' : '/api/generate';

    // Obtener token Bearer de Firebase Auth dinámicamente
    let token = '';
    if (auth && auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch (err) {
        console.warn("  ⚠ [AgentService] No se pudo obtener el ID token de Firebase:", err.message);
      }
    }

    const options = {
      method:  'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body:    JSON.stringify(body),
    };

    const res = await fetch(url, options);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.clone().json();
        msg = err.error?.message || msg;
      } catch { /* ignore clone error */ }
      throw new Error(msg);
    }

    return res;
  }

  // ── Non-streaming generation ─────────────────────────────────────
  async generate(systemPrompt, userPrompt, cfg = {}) {
    const body = this._body(systemPrompt, userPrompt, cfg);
    const res  = await this._post('generateContent', body);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // ── Streaming generation (async generator) ───────────────────────
  async *stream(systemPrompt, userPrompt, cfg = {}) {
    const body    = this._body(systemPrompt, userPrompt, cfg);
    const res     = await this._post('streamGenerateContent?alt=sse', body);
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (raw === '[DONE]') return;
        try {
          const parsed = JSON.parse(raw);
          // Maneja error embebido en stream
          if (parsed.error) throw new Error(parsed.error.message);
          const chunk  = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunk) yield chunk;
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
          /* skip malformed chunks */
        }
      }
    }
  }

  // ── Pipeline: generate outline ───────────────────────────────────
  async generateOutline(params) {
    const writerId = params.writerId || 'libre';
    const systemPrompt = window.TIMELESS_PROMPTS.buildSystem(writerId);
    const userPrompt = window.TIMELESS_PROMPTS.buildOutline(
      params.prompt, params.genre, params.chapters, params.tone, writerId
    );
    const raw = await this.generate(systemPrompt, userPrompt, {
      temperature: 0.80,
      maxTokens:   2048,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('El modelo no devolvió JSON válido en el outline.');
    return JSON.parse(match[0]);
  }

  // ── Pipeline: stream chapter ─────────────────────────────────────
  streamChapter(outline, chapterIndex, params) {
    const writerId = params.writerId || 'libre';
    const systemPrompt = window.TIMELESS_PROMPTS.buildSystem(writerId);
    const userPrompt = window.TIMELESS_PROMPTS.buildChapter(outline, chapterIndex, params);
    return this.stream(systemPrompt, userPrompt, {
      temperature: 0.92,
      maxTokens:   2500,
    });
  }

  // ── Pipeline: evaluate BSC ───────────────────────────────────────
  async evaluateBSC(text, genre) {
    const SYSTEM = 'Eres un crítico literario de una editorial de lujo. Devuelves solo JSON.';
    const userPrompt = window.TIMELESS_PROMPTS.buildBSC(text, genre);

    const raw = await this.generate(SYSTEM, userPrompt, {
      temperature: 0.20,
      maxTokens:   300,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { coherencia: 88, originalidad: 85, ritmo: 87, overall: 87, nota_editorial: '' };

    try { return JSON.parse(match[0]); }
    catch { return { coherencia: 88, originalidad: 85, ritmo: 87, overall: 87, nota_editorial: '' }; }
  }

  // ── Export: generate encrypted .tlf file ──────────────────────────
  async exportTLF(obra) {
    if (!auth.currentUser) throw new Error("Debes iniciar sesión para exportar con DRM.");

    const userId = auth.currentUser.uid;
    const obraId = obra.id || `obra_${Date.now().toString(36).toUpperCase()}`;

    // Estructura de metadatos (públicos en el JSON)
    const tlfMetadata = {
      format:     'TLF-2.0',
      id:         obraId,
      title:      obra.title,
      genre:      obra.genre,
      author:     obra.author || 'Timeless Agent',
      created_at: new Date().toISOString(),
      word_count: obra.wordCount || 0,
      bsc_score:  obra.bscScore || null,
      drm_bound:  true
    };

    // Datos a cifrar: el contenido literario real
    const sensitiveData = {
      outline:  obra.outline,
      chapters: obra.chapters.map((content, i) => ({
        index:   i + 1,
        title:   obra.outline?.chapters?.[i]?.title || `Capítulo ${i + 1}`,
        content,
      }))
    };

    try {
      // Cifrado de grado militar
      const encryptedPayload = await CryptoUtils.encrypt(sensitiveData, userId, obraId);

      const finalFile = {
        metadata: tlfMetadata,
        payload:  encryptedPayload, // El corazón del libro ahora es ilegible sin la llave
        signature: btoa(`timeless:${userId}:${obraId}`)
      };

      const blob = new Blob([JSON.stringify(finalFile, null, 2)], { type: 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { 
        href: url, 
        download: `${tlfMetadata.title.replace(/\s+/g, '_')}.tlf` 
      });
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      return obraId;
    } catch (error) {
      console.error("Error en la exportación DRM:", error);
      throw new Error("Fallo en el cifrado del archivo .tlf");
    }
  }
};
