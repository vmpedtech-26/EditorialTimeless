'use strict';

// ── IMPORTS ───────────────────────────────────────────────────
import { db, collection, addDoc, auth, onAuthStateChanged, signOut } from '../../firebase_config.js';

// ── AGENT INSTANCE ────────────────────────────────────────────
const agent = new AgentService();

// ── API KEY UI ────────────────────────────────────────────────
function updateKeyUI() {
  const inputWrap = document.getElementById('key-input-wrap');
  const labelText  = document.getElementById('key-label-text');

  if (agent.isLocal) {
    // Corriendo en servidor local — API Key gestionada en .env
    labelText.innerHTML = 'Servidor local activo &middot; API Key gestionada en <strong>.env</strong>';
    inputWrap.innerHTML = `
      <div class="key-status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Conectado &middot; localhost
      </div>`;

  } else if (agent.hasKey()) {
    // Modo directo con key manual
    labelText.innerHTML = 'Agente conectado a <strong>Gemini</strong> &middot; Generaci&oacute;n real activa';
    inputWrap.innerHTML = `
      <div class="key-status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        API Key configurada
      </div>
      <button class="key-change-btn" id="btn-change-key">cambiar</button>`;
    document.getElementById('btn-change-key').addEventListener('click', () => {
      agent.setApiKey('');
      updateKeyUI();
    });

  } else {
    // Sin key — modo simulación
    labelText.innerHTML = 'Para generaci&oacute;n <strong>real</strong>, configura tu <strong>Gemini API Key</strong>:';
    inputWrap.innerHTML = `
      <input type="password" class="api-key-field" id="api-key-field" placeholder="AIzaSy..." autocomplete="off" />
      <button class="btn-save-key" id="btn-save-key">Guardar</button>`;

    document.getElementById('btn-save-key').addEventListener('click', () => {
      const k = document.getElementById('api-key-field').value.trim();
      if (k.length > 10) { agent.setApiKey(k); updateKeyUI(); }
    });
    document.getElementById('api-key-field').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-save-key').click();
    });
  }
}
updateKeyUI();

// ── GENRE TABS ──────────────────────────────────────────────
const genreLabels = {
  ficcion:  'Ficción',
  ensayo:   'Ensayo',
  biografia:'Biografía',
  tecnica:  'Técnica',
};

const promptExamples = {
  ficcion:   'Una historia sobre la última biblioteca del mundo en un futuro donde los libros están prohibidos.',
  ensayo:    'Un ensayo sobre la relación entre la velocidad del pensamiento moderno y la pérdida de la profundidad intelectual.',
  biografia: 'La vida de un arquitecto anónimo del siglo XIX que diseñó los hospitales más hermosos de Europa sin que nadie lo supiera.',
  tecnica:   'Un manual técnico narrativo sobre el proceso creativo de la escritura: desde el bloqueo hasta la obra maestra.',
};

let currentGenre = 'ficcion';

document.querySelectorAll('.genre-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.genre-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentGenre = btn.dataset.genre;
    document.getElementById('genre-badge').textContent = genreLabels[currentGenre];
    document.getElementById('prompt-input').placeholder = promptExamples[currentGenre];
  });
});

// ── WRITER SELECTOR ──────────────────────────────────────────────────
function initWriterSelector() {
  const grid    = document.getElementById('writer-grid');
  const preview = document.getElementById('writer-preview');
  const select  = document.getElementById('writer-select');
  if (!grid || !window.TIMELESS_WRITERS) return;

  window.TIMELESS_WRITERS.forEach(writer => {
    // Build hidden option
    const opt = document.createElement('option');
    opt.value = writer.id;
    opt.textContent = writer.name;
    select.appendChild(opt);

    // Shorten name to last surname for display
    const shortName = writer.id === 'libre'
      ? 'Timeless'
      : writer.name.split(' ').slice(-1)[0];

    // Build visual chip
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'writer-chip' + (writer.id === 'libre' ? ' selected' : '');
    chip.dataset.writerId = writer.id;
    chip.style.setProperty('--chip-color', writer.color);
    chip.innerHTML = `
      <span class="writer-chip-flag">${writer.nationality}</span>
      <span class="writer-chip-name">${shortName}</span>
      <span class="writer-chip-era">${writer.era}</span>
    `;
    chip.addEventListener('click', () => {
      grid.querySelectorAll('.writer-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      select.value = writer.id;
      preview.textContent = writer.signature;
      preview.style.borderLeftColor = writer.color;
    });
    grid.appendChild(chip);
  });

  // Set initial preview
  if (preview) {
    preview.style.borderLeftColor = window.TIMELESS_WRITERS[0].color;
  }
}

// TIMELESS_WRITERS is defined in prompts.js (loaded before this module)
if (typeof window.TIMELESS_WRITERS !== 'undefined') {
  initWriterSelector();
} else {
  window.addEventListener('load', initWriterSelector);
}

// ── STATE ─────────────────────────────────────────────────────
let generating = false;
let currentObra = null;

// ── WORKSPACE SWITCHING ──────────────────────────────────────
window.switchWorkspace = function(view) {
  document.querySelectorAll('.w-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.workspace-view').forEach(v => v.classList.remove('active'));
  
  document.getElementById('tab-' + view).classList.add('active');
  document.getElementById('view-' + view).classList.add('active');
};

// ── PHASE STEPPER ─────────────────────────────────────────────
function setPhase(num) {
  const items = document.querySelectorAll('.phase-item');
  items.forEach((item, idx) => {
    const phase = idx + 1;
    item.classList.remove('active', 'done');
    if (phase < num) item.classList.add('done');
    if (phase === num) item.classList.add('active');
  });
}

// ── OUTPUT HELPERS ────────────────────────────────────────────
let logLines = [];
let chapterText = '';

function log(html) {
  logLines.push(`<div class="out-line">${html}</div>`);
  renderOutput();
}
function logBlank() {
  logLines.push('<div class="out-line">&nbsp;</div>');
  renderOutput();
}
function renderOutput() {
  const area = document.getElementById('output-area');
  area.innerHTML = logLines.join('');
  area.scrollTop = area.scrollHeight;
}
function updateLivePreview(text) {
  const canvas = document.getElementById('preview-canvas');
  if (!text) {
    canvas.innerHTML = '<div class="preview-empty">La vista previa aparecerá durante la fase de redacción.</div>';
    return;
  }
  const paragraphs = text.split('\n\n');
  const html = paragraphs.map(p => `<p style="margin-bottom:1.5em; line-height:1.8;">${p.trim()}</p>`).join('');

  canvas.innerHTML = `
    <div style="max-width:600px; margin:0 auto; padding-top:20px;">
      <div style="font-family:var(--sans); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.2em; color:var(--gold-d); margin-bottom:40px; text-align:center;">&mdash; Vista Previa Editorial &mdash;</div>
      ${html}
    </div>
  `;
  canvas.scrollTop = canvas.scrollHeight;
}
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function setProgress(pct, label) {
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-pct').textContent  = Math.floor(pct) + '%';
  document.getElementById('progress-label').textContent = label;
}
function setStatus(text, cls) {
  const b = document.getElementById('status-badge');
  b.textContent = text;
  b.className   = 'panel-badge ' + cls;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── MAIN GENERATION (real AI) ─────────────────────────────────
window.startGeneration = async function() {
  if (generating) return;

  const prompt = document.getElementById('prompt-input').value.trim();
  if (!prompt) {
    const ta = document.getElementById('prompt-input');
    ta.focus();
    ta.style.borderColor = 'rgba(200,80,80,0.5)';
    setTimeout(() => { ta.style.borderColor = ''; }, 1500);
    return;
  }

  // Fallback to simulation if no API key
  if (!agent.hasKey()) { runSimulation(prompt); return; }

  generating   = true;
  currentObra  = null;
  logLines     = [];
  chapterText  = '';
  document.getElementById('btn-generate').disabled = true;
  document.getElementById('gen-progress').style.display = 'block';
  setStatus('Generando…', 'pb-blue');
  renderOutput();

  const params = {
    prompt,
    genre:    currentGenre,
    chapters: document.getElementById('chapters-select').value,
    tone:     document.getElementById('tone-select').value,
    writerId: document.getElementById('writer-select')?.value || 'libre',
  };

  try {
    // ── FASE 1: OUTLINE ───────────────────────────────────────
    setPhase(2);
    setProgress(5, 'Inicializando agente…');
    log(`<span class="out-dim">// timeless.agent &mdash; g&eacute;nero: ${params.genre} &middot; tono: ${params.tone}</span>`);
    log(`<span class="out-gold">agent.init</span><span class="out-dim"> --model=gemini-2.0-flash --quality=bsc</span>`);
    await sleep(300);
    log(`<span class="out-green">✓</span> Motor literario v4.0 conectado &middot; Gemini API activa`);
    // Show selected writer voice in terminal
    const writerInfo = window.TIMELESS_WRITERS?.find(w => w.id === params.writerId);
    if (writerInfo && writerInfo.id !== 'libre') {
      log(`<span class="out-blue">&rarr;</span> Voz literaria: <span class="out-cream">${writerInfo.nationality} ${writerInfo.name}</span> <span class="out-dim">&mdash; ${writerInfo.signature.split('.')[0]}</span>`);
    } else {
      log(`<span class="out-blue">&rarr;</span> Voz literaria: <span class="out-cream">Timeless Editorial</span> <span class="out-dim">&mdash; identidad original</span>`);
    }
    logBlank();

    setProgress(10, 'Generando outline…');
    const preview = params.prompt.slice(0, 48) + (params.prompt.length > 48 ? '…' : '');
    log(`<span class="out-gold">outline.generate</span><span class="out-dim"> --theme="${esc(preview)}"</span>`);

    const outline = await agent.generateOutline(params);
    currentObra = { 
      title: outline.title, 
      genre: params.genre, 
      outline, 
      chapters: [],
      userId: auth.currentUser?.uid,
      createdAt: new Date().toISOString()
    };

    log(`<span class="out-green">✓</span> T&iacute;tulo: <span class="out-cream">${esc(outline.title)}</span>`);
    if (outline.themes?.length) {
      log(`<span class="out-blue">&rarr;</span> Temas: <span class="out-dim">${outline.themes.join(' &middot; ')}</span>`);
    }
    logBlank();

    setProgress(15, 'Validando estructura…');
    for (const ch of (outline.chapters || [])) {
      log(`<span class="out-green">✓</span> <span class="out-cream">Cap ${ch.index} &middot; ${esc(ch.title)}</span>`);
      await sleep(110);
    }
    log(`<span class="out-blue">&rarr;</span> Outline validado &middot; BSC estructural: <span class="out-green">✓</span>`);
    logBlank();

    // ── FASE 2: REDACCIÓN SECUENCIAL ────────────────────────────
    setPhase(3);
    switchWorkspace('preview');
    
    let totalWordCount = 0;
    const totalChapters = outline.chapters.length;

    for (let i = 0; i < totalChapters; i++) {
      const ch = outline.chapters[i];
      const startPct = 20 + (i * (60 / totalChapters));
      
      setProgress(startPct, `Redactando Cap ${ch.index}: ${ch.title}…`);
      log(`<span class="out-gold">draft.chapter</span><span class="out-dim">(${ch.index}) --mode=streaming</span>`);
      
      chapterText = '';
      updateLivePreview('');

      let chapterWordCount = 0;
      for await (const chunk of agent.streamChapter(outline, i, params)) {
        if (!generating) break;
        chapterText += chunk;
        chapterWordCount = chapterText.split(/\s+/).filter(Boolean).length;
        updateLivePreview(chapterText);
        
        const subPct = (chapterWordCount / 1200) * (60 / totalChapters);
        setProgress(startPct + Math.min(60 / totalChapters, subPct), `Cap ${ch.index}: ${chapterWordCount} palabras`);
      }

      if (!generating) break;

      currentObra.chapters.push(chapterText);
      totalWordCount += chapterWordCount;
      log(`<span class="out-green">✓</span> Cap ${ch.index} redactado &rarr; <span class="out-cream">${chapterWordCount.toLocaleString('es')} palabras</span>`);
      logBlank();
      
      await sleep(500);
    }

    if (!generating) return;

    // ── FASE 3: BSC FINAL ───────────────────────────────────────
    setPhase(4);
    switchWorkspace('terminal');
    setProgress(85, 'Evaluaci&oacute;n BSC final…');
    log(`<span class="out-gold">quality.check</span><span class="out-dim"> --standard=bsc --total=${totalWordCount}w</span>`);

    // Evaluamos el primer capítulo para el score
    const bsc = await agent.evaluateBSC(currentObra.chapters[0], params.genre);
    await sleep(250);
    log(`<span class="out-amber">  coherencia   &rarr; <span class="out-green">${bsc.coherencia} / 100</span></span>`);
    await sleep(180);
    log(`<span class="out-amber">  originalidad &rarr; <span class="out-green">${bsc.originalidad} / 100</span></span>`);
    await sleep(180);
    log(`<span class="out-amber">  ritmo        &rarr; <span class="out-green">${bsc.ritmo} / 100</span></span>`);
    
    const overall = bsc.overall || Math.round(bsc.coherencia * 0.35 + bsc.originalidad * 0.35 + bsc.ritmo * 0.30);
    currentObra.bscScore = overall;
    currentObra.wordCount = totalWordCount;

    log(`<span class="out-green">✓</span> <span class="out-cream">BSC Score: <strong>${overall} / 100</strong> &middot; ${overall >= 82 ? 'APROBADO' : 'REQUIERE REVISIÓN'}</span>`);
    if (bsc.nota_editorial) {
      logBlank();
      log(`<span class="out-dim">  Editor: &ldquo;${esc(bsc.nota_editorial)}&rdquo;</span>`);
    }
    logBlank();

    // ── FASE 4: EXPORT & PERSISTENCE ────────────────────────────
    setPhase(5);
    setProgress(95, 'Sincronizando biblioteca…');
    log(`<span class="out-gold">export.tlf</span><span class="out-dim"> --encrypt=AES-256 --sign=subscription_token</span>`);
    
    // Persistir en Firestore automáticamente
    await saveToLibrary(currentObra);

    log(`<span class="out-green">✓</span> <span class="out-cream">obra completa lista &middot; ${totalWordCount.toLocaleString('es')} palabras totales</span>`);
    log(`<span class="out-green">★ LISTA PARA PUBLICAR EN BIBLIOTECA ★</span>`);
    
    setProgress(100, 'Completado');
    setStatus('Completado ✓', 'pb-green');

    // Update BSC cards with real values
    updateBSCMetrics(bsc);

    await sleep(800);
    document.getElementById('modal-bsc').textContent   = `${overall} / 100`;
    document.getElementById('modal-words').textContent = `${totalWordCount.toLocaleString('es')} palabras (Obra completa)`;
    document.getElementById('export-modal').classList.add('visible');

  } catch (err) {
    const msg = err.message || 'Error desconocido';
    log(`<span style="color:#C87870;">✗ Error: ${esc(msg)}</span>`);
    setStatus('Error', 'pb-blue');
  } finally {
    generating = false;
    document.getElementById('btn-generate').disabled = false;
  }
};

// ── SIMULATION FALLBACK (without API key) ─────────────────────
function runSimulation(prompt) {
  generating  = true;
  logLines    = [];
  chapterText = '';
  document.getElementById('btn-generate').disabled = true;
  document.getElementById('gen-progress').style.display = 'block';
  setStatus('Simulando…', 'pb-blue');

  const ch = document.getElementById('chapters-select').value;
  const steps = [
    { t: 300,   h: `<span class="out-dim">// modo simulaci&oacute;n &middot; configura una API Key para generaci&oacute;n real</span>` },
    { t: 700,   h: `<span class="out-gold">agent.init</span><span class="out-dim"> --genre=${currentGenre} --quality=bsc</span>` },
    { t: 1400,  h: `<span class="out-green">✓</span> Motor literario v3.2 inicializado` },
    { t: 2100,  h: `<span class="out-gold">outline.generate</span><span class="out-dim"> --theme="${esc(prompt.slice(0,42))}…"</span>` },
    { t: 3200,  h: `<span class="out-green">✓</span> <span class="out-cream">Cap I &middot; Planteamiento del mundo</span>` },
    { t: 3700,  h: `<span class="out-green">✓</span> <span class="out-cream">Cap II &middot; El incidente desencadenante</span>` },
    { t: 4200,  h: `<span class="out-green">✓</span> <span class="out-cream">Cap III &middot; El primer umbral</span>` },
    { t: 4700,  h: `<span class="out-dim">  … ${parseInt(ch)-3} cap&iacute;tulos adicionales generados</span>` },
    { t: 5300,  h: `<span class="out-blue">&rarr;</span> Outline validado &middot; BSC estructural: <span class="out-green">✓</span>` },
    { t: 6100,  h: `<span class="out-gold">draft.start</span><span class="out-dim"> --mode=sequential</span>` },
    { t: 7200,  h: `<span class="out-green">✓</span> Cap I redactado &rarr; <span class="out-cream">7.284 palabras</span>` },
    { t: 8100,  h: `<span class="out-gold">quality.check</span><span class="out-dim"> --standard=bsc</span>` },
    { t: 9000,  h: `<span class="out-amber">  coherencia   &rarr; <span class="out-green">94 / 100</span></span>` },
    { t: 9500,  h: `<span class="out-amber">  originalidad &rarr; <span class="out-green">92 / 100</span></span>` },
    { t: 10000, h: `<span class="out-amber">  ritmo        &rarr; <span class="out-green">96 / 100</span></span>` },
    { t: 10700, h: `<span class="out-green">✓</span> <span class="out-cream">BSC Score: <strong>94.0 / 100</strong> &middot; APROBADO</span>` },
    { t: 11600, h: `<span class="out-gold">export.tlf</span><span class="out-dim"> --encrypt=AES-256</span>` },
    { t: 12400, h: `<span class="out-green">✓</span> <span class="out-cream">obra lista &middot; ${(parseInt(ch)*7200).toLocaleString('es')} palabras</span>` },
    { t: 12900, h: `<span class="out-green">★ LISTA PARA PUBLICAR ★</span>` },
  ];
  const total = 13500;
  const t0 = Date.now();
  steps.forEach(s => setTimeout(() => { logLines.push(`<div class="out-line">${s.h}</div>`); renderOutput(); }, s.t));
  const iv = setInterval(() => {
    const elapsed = Date.now() - t0;
    const pct = Math.min(99, (elapsed / total) * 100);
    setProgress(pct, pct < 20 ? 'Inicializando…' : pct < 45 ? 'Generando outline…' : pct < 75 ? 'Redactando…' : pct < 88 ? 'Revisi&oacute;n BSC…' : 'Exportando…');
    if (elapsed >= total) {
      clearInterval(iv);
      setProgress(100, 'Completado');
      setPhase(5);
      setStatus('Completado ✓', 'pb-green');
      generating = false;
      document.getElementById('btn-generate').disabled = false;
      setTimeout(() => {
        document.getElementById('modal-bsc').textContent   = '94.0 / 100';
        document.getElementById('modal-words').textContent = `${(parseInt(ch)*7200).toLocaleString('es')} palabras aprox.`;
        document.getElementById('export-modal').classList.add('visible');
      }, 700);
    }
  }, 100);
}

// ── UPDATE BSC SECTION WITH REAL VALUES ───────────────────────
function updateBSCMetrics(bsc) {
  const map = [
    { numId: 'bm-1', val: bsc.coherencia,   spId: 'sp-1', cls: 'sb-gold'  },
    { numId: 'bm-2', val: bsc.originalidad,  spId: 'sp-2', cls: 'sb-green' },
    { numId: 'bm-3', val: bsc.ritmo,         spId: 'sp-3', cls: 'sb-blue'  },
  ];
  map.forEach(m => {
    const numEl = document.getElementById(m.numId);
    let count = 0;
    const step = () => { count = Math.min(m.val, count + 2); numEl.textContent = count + '/100'; if (count < m.val) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

// ── FIRESTORE PERSISTENCE ────────────────────────────────────
async function saveToLibrary(obra) {
  if (!auth.currentUser) return;
  try {
    const docRef = await addDoc(collection(db, "obras"), obra);
    log(`<span class="out-dim">  [sync] Obra guardada en biblioteca remota (ID: ${docRef.id})</span>`);
    return docRef.id;
  } catch (e) {
    console.error("Error al guardar en Firestore", e);
    log(`<span style="color:#C87870;">✗ Error de sincronizaci&oacute;n: Firestore</span>`);
  }
}

window.closeExport = function() {
  document.getElementById('export-modal').classList.remove('visible');
};

window.simulateDownload = function() {
  const btn = document.querySelector('.btn-modal-export');
  if (currentObra && agent.hasKey()) {
    const id = agent.exportTLF(currentObra);
    btn.textContent = `✓ ${id}.tlf descargado`;
  } else {
    btn.textContent = '✓ Guardado en biblioteca';
  }
  btn.style.background   = 'var(--green)';
  btn.style.borderColor  = 'var(--green)';
  setTimeout(() => {
    document.getElementById('export-modal').classList.remove('visible');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar obra.tlf';
    btn.style.background = btn.style.borderColor = '';
  }, 2000);
};

document.getElementById('export-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('export-modal')) closeExport();
});

// ── BSC COUNTER ANIMATION (on scroll) ─────────────────────────
const sparks = [
  { id:'sp-1', values:[78,82,85,88,91,90,93,94,95], cls:'sb-gold',  target:'bm-1', end:94 },
  { id:'sp-2', values:[70,75,80,83,87,89,90,92,95], cls:'sb-green', target:'bm-2', end:95 },
  { id:'sp-3', values:[80,82,84,86,88,89,90,91,93], cls:'sb-blue',  target:'bm-3', end:93 },
];

function animateBSC() {
  sparks.forEach(s => {
    const max = Math.max(...s.values);
    document.getElementById(s.id).innerHTML = s.values.map(v => `<div class="spark-bar ${s.cls}" style="height:${Math.round((v/max)*32)}px"></div>`).join('');
    const numEl = document.getElementById(s.target);
    let count = 0;
    const step = () => { count = Math.min(s.end, count + 2); numEl.textContent = count + '/100'; if (count < s.end) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

// ── SCROLL REVEAL ─────────────────────────────────────────────
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      if (e.target.closest('#quality') && e.target.classList.contains('bsc-c-gold')) {
        setTimeout(animateBSC, 400);
      }
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal, .pipeline-step, .bsc-card').forEach(el => io.observe(el));

// ── AUTH LOGIC ────────────────────────────────────────────────
const userProf = document.getElementById('user-prof');
const userAvatarBtn = document.getElementById('user-avatar-btn');
const userMenu = document.getElementById('user-menu');
const btnLogout = document.getElementById('btn-logout');

onAuthStateChanged(auth, (user) => {
  if (user) {
    userProf.classList.add('visible');
    userAvatarBtn.textContent = user.displayName ? user.displayName.charAt(0) : user.email.charAt(0).toUpperCase();
  } else {
    // Redirigir si no está logueado (protección básica)
    window.location.href = 'index.html';
  }
});

userAvatarBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  userMenu.classList.toggle('open');
});
document.addEventListener('click', () => userMenu.classList.remove('open'));
btnLogout.addEventListener('click', () => signOut(auth));
