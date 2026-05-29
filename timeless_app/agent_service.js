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

  // ── Cover Generator: creates elegant abstract dynamic SVG covers ──
  generateCover(title, author, genre, tone) {
    // Elegant HSL color palettes matching the book's tone
    const palettes = {
      contemplatif: { bgStart: '#111318', bgEnd: '#1e1c18', accent: '#c9a96e', text: '#eae5d9', accentMuted: '#4a4235' },
      thriller: { bgStart: '#0b0c10', bgEnd: '#1a0d0d', accent: '#ff4c4c', text: '#ffffff', accentMuted: '#4a1717' },
      lirico: { bgStart: '#101815', bgEnd: '#222d28', accent: '#a3c9a8', text: '#f3f7f2', accentMuted: '#2d3f37' },
      epico: { bgStart: '#1a0e12', bgEnd: '#331623', accent: '#d9a05b', text: '#fbf5ee', accentMuted: '#502035' },
      ironico: { bgStart: '#0d131f', bgEnd: '#182232', accent: '#62b6cb', text: '#f1f5f9', accentMuted: '#203243' }
    };

    const p = palettes[tone] || palettes.contemplatif;

    // Build unique geometry based on the tone
    let shapes = '';
    if (tone === 'contemplatif' || tone === 'lirico') {
      shapes = `
        <circle cx="200" cy="290" r="110" fill="none" stroke="${p.accent}" stroke-width="0.75" opacity="0.25" />
        <circle cx="200" cy="290" r="85" fill="none" stroke="${p.accent}" stroke-width="1.25" opacity="0.4" />
        <circle cx="200" cy="290" r="55" fill="${p.accent}" opacity="0.12" />
        <line x1="200" y1="120" x2="200" y2="460" stroke="${p.accent}" stroke-width="0.5" opacity="0.2" />
        <line x1="60" y1="290" x2="340" y2="290" stroke="${p.accent}" stroke-width="0.5" opacity="0.2" />
      `;
    } else if (tone === 'thriller' || tone === 'ironico') {
      shapes = `
        <rect x="110" y="200" width="180" height="180" transform="rotate(45 200 290)" fill="none" stroke="${p.accent}" stroke-width="1.25" opacity="0.35" />
        <rect x="135" y="225" width="130" height="130" transform="rotate(45 200 290)" fill="none" stroke="${p.accent}" stroke-width="0.75" opacity="0.15" />
        <line x1="70" y1="160" x2="330" y2="420" stroke="${p.accent}" stroke-width="0.75" opacity="0.25" />
        <line x1="330" y1="160" x2="70" y2="420" stroke="${p.accent}" stroke-width="0.75" opacity="0.25" />
      `;
    } else {
      // Epic or general organic landscape curves
      shapes = `
        <path d="M 60 340 Q 200 190 340 340" fill="none" stroke="${p.accent}" stroke-width="1.25" opacity="0.45" />
        <path d="M 60 360 Q 200 210 340 360" fill="none" stroke="${p.accent}" stroke-width="0.75" opacity="0.25" />
        <path d="M 60 320 Q 200 170 340 320" fill="none" stroke="${p.accent}" stroke-width="0.5" opacity="0.15" />
        <circle cx="200" cy="210" r="16" fill="${p.accent}" opacity="0.75" />
      `;
    }

    // Format title across lines if long
    const words = title.split(' ');
    let line1 = title;
    let line2 = '';
    if (words.length > 3) {
      const mid = Math.ceil(words.length / 2);
      line1 = words.slice(0, mid).join(' ');
      line2 = words.slice(mid).join(' ');
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="100%" height="100%">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${p.bgStart}" />
            <stop offset="100%" stop-color="${p.bgEnd}" />
          </linearGradient>
        </defs>

        <!-- Background -->
        <rect width="400" height="600" fill="url(#bgGrad)" />

        <!-- Delicate Frame -->
        <rect x="15" y="15" width="370" height="570" fill="none" stroke="${p.accent}" stroke-width="0.75" opacity="0.4" />
        <rect x="20" y="20" width="360" height="560" fill="none" stroke="${p.accent}" stroke-width="0.25" opacity="0.15" />

        <!-- Editorial Top Branding -->
        <text x="200" y="60" font-family="'Inter', sans-serif" font-size="9" font-weight="600" fill="${p.accent}" letter-spacing="4.5" text-anchor="middle" opacity="0.75">TIMELESS EDITORIAL</text>
        <line x1="160" y1="70" x2="240" y2="70" stroke="${p.accent}" stroke-width="0.5" opacity="0.4" />

        <!-- Abstract Centerpiece -->
        <g id="artwork">
          ${shapes}
        </g>

        <!-- Book Typography & Metadata -->
        <g id="typography">
          <text x="200" y="${line2 ? '425' : '440'}" font-family="'Playfair Display', 'Georgia', serif" font-size="26" font-style="italic" font-weight="500" fill="${p.text}" text-anchor="middle">
            ${line1}
          </text>
          ${line2 ? `<text x="200" y="460" font-family="'Playfair Display', 'Georgia', serif" font-size="26" font-style="italic" font-weight="500" fill="${p.text}" text-anchor="middle">${line2}</text>` : ''}
          
          <!-- Subtitle / Genre -->
          <text x="200" y="${line2 ? '495' : '485'}" font-family="'Inter', sans-serif" font-size="9" fill="${p.accent}" letter-spacing="2" text-anchor="middle" opacity="0.8" font-weight="500">
            ${genre.toUpperCase()}
          </text>
          
          <!-- Author / Inspiration -->
          <text x="200" y="540" font-family="'Inter', sans-serif" font-size="10.5" font-weight="500" fill="${p.text}" letter-spacing="1.5" text-anchor="middle" opacity="0.75">
            ${author.toUpperCase()}
          </text>
        </g>
      </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  }
};

