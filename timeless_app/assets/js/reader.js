import { auth, onAuthStateChanged, db, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, addDoc, query, where, getDocs } from '../../firebase_config.js';
import { CryptoUtils } from './crypto_utils.js';

const $ = id => document.getElementById(id);
const state = {
  book: null,
  bookId: null,
  currentChapter: 0,
  theme: localStorage.getItem('tl_theme') || 'paper',
  fontSize: parseInt(localStorage.getItem('tl_fontSize') || '20'),
  fontFamily: localStorage.getItem('tl_font') || 'serif',
  lineHeight: localStorage.getItem('tl_lineHeight') || '1.85',
  readingWidth: localStorage.getItem('tl_readingWidth') || '720px',
  start: Date.now(),
  lastScroll: 0,
  focusMode: false,
  focusTimeout: null,
  gift: null,
  highlights: []
};

// ── INDEXEDDB OFFLINE STORAGE & QUEUE ─────────────────────────────────
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('timeless_offline_db', 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('offline_books')) {
        db.createObjectStore('offline_books', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('offline_keys')) {
        db.createObjectStore('offline_keys', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('telemetry_queue')) {
        db.createObjectStore('telemetry_queue', { autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function getBookOffline(bookId) {
  return openOfflineDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['offline_books', 'offline_keys'], 'readonly');
      const bookReq = tx.objectStore('offline_books').get(bookId);
      const keyReq = tx.objectStore('offline_keys').get(bookId);
      tx.oncomplete = () => {
        if (bookReq.result && keyReq.result) {
          if (Date.now() > keyReq.result.expiresAt) {
            reject(new Error("La licencia offline de esta obra ha caducado. Conéctate a internet para renovarla."));
          } else {
            resolve({ book: bookReq.result.data, license: keyReq.result.license });
          }
        } else {
          resolve(null);
        }
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  });
}

function queueTelemetryOffline(payload) {
  return openOfflineDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('telemetry_queue', 'readwrite');
      tx.objectStore('telemetry_queue').add({ ...payload, timestamp: Date.now() });
      tx.oncomplete = () => {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          navigator.serviceWorker.ready.then(reg => {
            return reg.sync.register('sync-telemetry');
          }).then(() => {
            console.log("  ✦ [PWA] Background Sync registrado con éxito ('sync-telemetry').");
          }).catch(err => {
            console.warn("  ⚠ [PWA] No se pudo registrar Background Sync:", err.message);
          });
        }
        resolve();
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  });
}

async function syncOfflineTelemetry() {
  if (!navigator.onLine || !auth.currentUser) return;
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('telemetry_queue', 'readonly');
    const store = tx.objectStore('telemetry_queue');
    const events = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (!events || events.length === 0) return;
    
    console.log(`  ✦ [Telemetry Sync] Detectada conexión. Sincronizando ${events.length} eventos offline en lote...`);
    const token = await auth.currentUser.getIdToken();
    
    const res = await fetch('/api/telemetry/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ events })
    });
    
    if (res.ok) {
      const clearTx = db.transaction('telemetry_queue', 'readwrite');
      clearTx.objectStore('telemetry_queue').clear();
      console.log("  ✦ [Telemetry Sync] Sincronización masiva offline completada con éxito.");
    } else {
      console.warn("  ⚠ [Telemetry Sync] Error en el servidor al sincronizar lote:", res.statusText);
    }
  } catch(e) {
    console.warn("Error al sincronizar telemetría offline:", e);
  }
}

window.addEventListener('online', syncOfflineTelemetry);

// ---- TELEMETRY & DRM CONFIG (Pilar 1 & 2) ----
let readingStartTime = Date.now();
let telemetryInterval = null;

async function decryptText(encryptedHex, ivHex) {
  const password = "timeless_secret_key_32_bytes_long_!!!";
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const hash = await window.crypto.subtle.digest('SHA-256', passwordBuffer);
  const key = await window.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );
  
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const ciphertext = new Uint8Array(encryptedHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv },
    key,
    ciphertext
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

function startTelemetry() {
  readingStartTime = Date.now();
  if (telemetryInterval) clearInterval(telemetryInterval);
  telemetryInterval = setInterval(() => {
    sendTelemetryPacket();
  }, 25000);
  
  syncOfflineTelemetry();
}

async function sendTelemetryPacket() {
  if (!state.book || !auth.currentUser) return;
  
  const now = Date.now();
  const timeSpent = Math.round((now - readingStartTime) / 1000);
  if (timeSpent <= 0) return;
  readingStartTime = now;
  
  const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
  const scrollDepth = scrollHeight > 0 ? (window.scrollY / scrollHeight) : 0;
  
  const payload = {
    bookId: state.bookId,
    chapterIndex: state.currentChapter,
    timeSpent: timeSpent,
    scrollDepth: parseFloat(scrollDepth.toFixed(3)),
    exitPoint: `scroll_${Math.round(scrollDepth * 100)}%`
  };
  
  if (!navigator.onLine) {
    try {
      await queueTelemetryOffline(payload);
      console.log("  ✦ [Telemetry Offline] Evento encolado localmente en IndexedDB.");
    } catch(e) {
      console.warn("No se pudo encolar telemetría offline:", e);
    }
    return;
  }
  
  try {
    const token = await auth.currentUser.getIdToken();
    fetch('/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch (e) {
    console.warn("  ⚠ [Telemetry] Error al enviar ping:", e.message);
  }
}

// Bloqueos de Copia DRM activos
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('copy', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault();
  }
});

window.addEventListener('beforeunload', () => {
  sendTelemetryPacket();
});

// ── Data Loading ─────────────────────────────────────────────────────────────
async function loadBook() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  const giftToken = urlParams.get('gift');

  if (!id && !giftToken) { 
    const tlfData = sessionStorage.getItem('tlf_import');
    if (tlfData) {
      await handleTLFImport(JSON.parse(tlfData));
      return;
    }
    window.location.href = 'index.html'; 
    return; 
  }
  
  try {
    state.bookId = id;

    // Lógica de Regalo e Invitación
    if (giftToken && !id) {
      const giftSnap = await getDoc(doc(db, "gifts", giftToken));
      if (!giftSnap.exists()) throw new Error("El link de invitación ha expirado.");
      
      const giftData = giftSnap.data();
      state.gift = { id: giftToken, ...giftData };
      state.bookId = giftData.bookId;

      if (!auth.currentUser) {
        state.isPreview = true;
      } else if (!giftData.claimed && giftData.fromUserId !== auth.currentUser.uid) {
        await claimGift(giftToken, giftData);
      }
    }

    let data = null;
    let isOfflineCopy = false;

    // Intentar cargar desde IndexedDB primero (Pilar 1 - Offline)
    try {
      const offlineData = await getBookOffline(state.bookId);
      if (offlineData) {
        data = offlineData.book;
        isOfflineCopy = true;
        console.log("  ✦ [Reader] Obra cargada con éxito desde IndexedDB (Lectura Offline).");
      }
    } catch (offlineErr) {
      console.warn("  ⚠ [Reader] Licencia offline caducada o error de lectura:", offlineErr.message);
      if (!navigator.onLine) {
        throw offlineErr; // si está offline, arrojamos el error de expiración de licencia
      }
    }

    if (!data) {
      const sessionActiveBook = sessionStorage.getItem('tl_active_book');
      if (sessionActiveBook) {
        try {
          const parsedBook = JSON.parse(sessionActiveBook);
          if (parsedBook.id === state.bookId) {
            data = parsedBook;
            console.log("  ✦ [Reader] Obra cargada al instante desde sesión local.");
          }
        } catch (err) {
          console.warn("Error leyendo obra activa de sesión:", err);
        }
      }
    }

    if (!data) {
      let snap = await getDoc(doc(db, "books", state.bookId));
      if (!snap.exists()) snap = await getDoc(doc(db, "obras", state.bookId));
      if (snap.exists()) {
        data = snap.data();
      }
    }

    if (!data) {
      throw new Error("Obra no encontrada o acceso restringido.");
    }

    state.book = formatBookData(data);

    // Verificación de Suscripción Premium
    let isUserPremium = false;
    if (auth.currentUser) {
      if (auth.currentUser.email === 'matiaseorejas@gmail.com') {
        isUserPremium = true; // El editor tiene acceso total
      } else {
        try {
          const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
          if (userSnap.exists() && userSnap.data().isPremium === true) {
            isUserPremium = true;
          }
        } catch (dbErr) {
          console.warn("  ⚠ [Reader] No se pudo verificar el estado premium en Firestore. Sandbox mode: Permitir acceso temporal.");
          isUserPremium = true; // Fallback tolerante en sandbox local offline
        }
      }
    } else {
      state.isPreview = true;
    }

    if (!isUserPremium && !state.gift) {
      state.isPreview = true;
    }

    if (state.gift) showInvitationCard(state.gift);

    renderTOC();
    
    // Si no es un regalo/preview, cargar el progreso guardado y los subrayados
    if (!state.isPreview && auth.currentUser) {
      await Promise.all([loadProgress(), loadHighlights()]);
      renderChapter(state.currentChapter);
    } else {
      if (state.isPreview) renderPreview();
      else renderChapter(0);
    }

  } catch (e) {
    showErrorState(e.message);
  }
}

async function handleTLFImport(tlfFile) {
  if (!auth.currentUser) throw new Error("Debes iniciar sesión para abrir un archivo .tlf protegido.");

  try {
    const userId = auth.currentUser.uid;
    const obraId = tlfFile.metadata.id;

    const decrypted = await CryptoUtils.decrypt(tlfFile.payload, userId, obraId);
    
    state.book = {
      title: tlfFile.metadata.title,
      author: tlfFile.metadata.author,
      chapters: decrypted.chapters
    };

    renderTOC();
    renderChapter(0);
    sessionStorage.removeItem('tlf_import'); // Limpiar tras cargar
  } catch (e) {
    showErrorState("Error de DRM: Este archivo está vinculado a otro usuario o la llave es inválida.");
  }
}

function romanize(num) {
  if (isNaN(num)) return NaN;
  const digits = String(+num).split(""),
    key = ["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM",
           "","X","XX","XXX","XL","L","LX","LXX","LXXX","XC",
           "","I","II","III","IV","V","VI","VII","VIII","IX"],
    roman = [];
  let i = 3;
  while (i--) roman.push(key[+digits.pop() + (i * 10)] || "");
  return roman.join("");
}

function formatBookData(data) {
  const category = data.cat || 'ficcion';
  const title = data.title || "Obra sin título";
  const author = data.author || "Timeless Editorial";
  const themes = data.themes || [];
  
  let outline = data.outline;
  if (!outline) {
    let numChapters = 5;
    if (typeof data.chapters === 'number') {
      numChapters = data.chapters;
    } else if (category === 'kids') {
      numChapters = 3;
    }
    
    const chapterOutlines = [];
    const nouns = ["La hendidura", "El laberinto", "El murmullo", "El fragmento", "La frontera", "El umbral", "La vigilia", "La memoria", "La deriva", "La alquimia", "La sonata", "El teorema", "Las ruinas", "El sastre", "El espejo", "La sintaxis", "El faro", "El afinador", "El manuscrito", "El enigma", "La sombra", "El eco", "La ética", "La arqueología", "La contemplación", "La condición", "La paradoja", "La carpintería", "La física", "El dragón", "La estación", "El oso", "El duende", "La tortuga"];
    const adjs = ["los días", "las sombras", "la arena", "las ruinas", "los espejos", "los relojes", "los pasos", "las estrellas", "los silencios", "las nubes", "el tiempo", "el olvido", "la niebla", "el vacío", "la prisa", "la atención", "la melancolía", "la vigilia", "la luz", "el fuego", "el norte", "el sol", "el viento", "la lluvia"];
    
    const seedBase = title + author;
    
    for (let c = 1; c <= numChapters; c++) {
      const sCh1 = getStringSeed(seedBase, c * 10);
      const sCh2 = getStringSeed(seedBase, c * 20);
      
      const chTitle = `${romanize(c)}. ${selectFromPool(nouns, sCh1)} de ${selectFromPool(adjs, sCh2)}`;
      const chDesc = `Arco narrativo sobre la búsqueda estética y el fluir de la trama principal.`;
      
      chapterOutlines.push({
        title: chTitle,
        arc: chDesc
      });
    }
    outline = {
      title: title,
      chapters: chapterOutlines
    };
  }

  const isChaptersArray = Array.isArray(data.chapters);
  
  return {
    title: title,
    author: author,
    cover: data.cover || 'assets/cover.png',
    chapters: outline.chapters.map((chOutline, i) => {
      let content = "";
      let encryptedContent = "";
      let iv = "";
      
      if (isChaptersArray && data.chapters[i]) {
        if (typeof data.chapters[i] === 'string') {
          content = data.chapters[i];
        } else if (typeof data.chapters[i] === 'object') {
          encryptedContent = data.chapters[i].encryptedContent || "";
          iv = data.chapters[i].iv || "";
          content = data.chapters[i].content || "";
        }
      } else {
        content = generateJITProse(category, i + 1, title, author, chOutline.title || '', chOutline.arc || '', themes);
      }
      
      return {
        id: i + 1,
        title: chOutline.title || `Capítulo ${i+1}`,
        desc: chOutline.arc || "",
        content: content,
        encryptedContent: encryptedContent,
        iv: iv,
        fallbackContent: content
      };
    })
  };
}

// ── Deterministic String Hash & Advanced Prose Synthesizer ──────────────────
function getStringSeed(str, salt = 0) {
  let hash = 1315423911;
  const fullStr = str + salt;
  for (let i = 0; i < fullStr.length; i++) {
    hash ^= ((hash << 5) + fullStr.charCodeAt(i) + (hash >> 2));
  }
  return Math.abs(hash);
}

function selectFromPool(pool, seed) {
  return pool[seed % pool.length];
}

function generateJITProse(category, chapterNum, title, author, chTitle = '', chArc = '', themes = []) {
  const seedBase = title + author + chapterNum + chTitle + (themes.join(','));
  const s1 = getStringSeed(seedBase, 1);
  const s2 = getStringSeed(seedBase, 2);
  const s3 = getStringSeed(seedBase, 3);
  const s4 = getStringSeed(seedBase, 4);

  const t1 = themes[0] || 'el tiempo';
  const t2 = themes[1] || 'la memoria';
  const t3 = themes[2] || 'el silencio';

  if (category === 'ficcion') {
    // ── FICTION: Borges, Cortázar, Murakami style ──
    const openings = [
      `El hombre despertó en una habitación cuyos muros duplicaban hasta el infinito la pálida luz del atardecer. Comprendió, con una resignación que bordeaba la felicidad, que la arquitectura de su destino no dependía de la vigilia, sino de las intrincadas galerías de su memoria.`,
      `Hubo en las afueras de la vieja ciudad un callejón empedrado donde los crepúsculos duraban tres segundos más que en el resto de la provincia. La posteridad lo consideró una anomalía geométrica, pero los cuadernos personales de ${author} demuestran que allí la realidad solía abrirse en abanico.`,
      `El viento del sur traía el rumor del acueducto lejano, un sonido de agua subterránea que parecía arrastrar los nombres olvidados de quienes alguna vez habitaron esta casa. Sentada frente al atril de caoba, sintió que escribir no era un acto voluntario, sino una liturgia silenciosa del regreso.`,
      `Las ruinas circulares de la antigua biblioteca ya no guardaban volúmenes físicos, sino cenizas y murmullos suspendidos en el aire denso del verano. Caminar entre aquellos pilares caídos despertaba un fervor casi religioso, una búsqueda obstinada de la frase única que lo justificaría todo.`,
      `Bajo la luz difusa del hotel de frontera, las sombras parecían cobrar una densidad de bronce. Nadie recordaba exactamente cómo había llegado a este punto del mapa, ni qué nombre le correspondía en el registro del conserje, pero todos compartían la certeza de que algo irreparable estaba a punto de ocurrir.`
    ];

    const introspections = [
      `A menudo se preguntaba si su obsesión con ${t1} y ${t2} no era más que una máscara para ocultar una verdad más honda: que toda identidad es ficticia y que cada uno de nosotros no es más que el sueño de otro. Aquel enigma recordaba vagamente los pasajes más oscuros de su juventud, cuando los laberintos discretos del mapa parecían ofrecer una salida.`,
      `En el centro del laberinto no hay un monstruo, sino un espejo cóncavo que devuelve la imagen de nuestra propia soledad amplificada. ¿Cómo justificar el paso de los años cuando la sustancia misma de la que estamos hechos se escurre entre los dedos como la arena del reloj? El manuscrito original planteaba esta paradoja sin resolverla.`,
      `Escribir sobre ${t1} exige una renuncia al realismo vulgar y una inmersión en la lógica fluida de la melancolía. Ella sabía que el pasado no es un lugar al que se vuelve, sino una corriente subterránea que altera imperceptiblemente el sabor del agua que bebemos hoy en los acueductos urbanos.`,
      `El coleccionista de crepúsculos solía repetir que las palabras son monedas desgastadas que ya no sirven para comprar la verdad. Su obsesión no radicaba en explicar el misterio, sino en habitarlo con la dignidad de un ajedrecista que juega una partida eterna contra su propio reflejo en el cristal de la ventana.`,
      `Entre la vigilia y el sueño se despliega un territorio sin cartografiar, una llanura donde los objetos pierden sus contornos y las ideas flotan con la levedad del viento austral. En esa habitación que no aparece en ningún mapa se decide verdaderamente el curso de nuestras vidas discretas.`
    ];

    const chapterClimaxes = [
      `En las páginas del destino, la revelación sobre "${chTitle || 'la hendidura del tiempo'}" se manifestaba no como una explosión de luz, sino como un murmullo que se extingue en la penumbra. El arco de la escena dependía del uso arquitectónico de la elipsis, dejando que el vacío hablara con mayor elocuencia que la voz del narrador.`,
      `Al abordar "${chTitle || 'las ruinas circulares'}", comprendemos que el clímax de la historia ocurre en la frontera de lo indecible. Los personajes de ${author} no conversan para transmitirse información, sino para tejer una red de silencios y sobreentendidos donde lo no dicho es lo único que verdaderamente importa.`,
      `La resolución dramática de "${chTitle || 'la geometría del olvido'}" se acumulaba lentamente en la atmósfera, como la humedad densa que precede a las tormentas de otoño en el Sena. Cada gesto, cada mirada suspendida, funcionaba como un engranaje milimétrico de la carpintería del suspenso existencial.`,
      `El fragmento titulado "${chTitle || 'el afinador de silencios'}" destaca por su lucidez lírica y su rigor formal. Aquí, el conflicto se traslada de la acción física a la tensión del lenguaje mismo, demostrando que la verdadera aventura ocurre en la sintaxis de cada frase húmeda bajo la lluvia.`,
      `En este tramo, "${chTitle || 'la balada del gato de medianoche'}" se revela como la clave oculta de toda la obra. La irrupción de lo fantástico en lo cotidiano ocurre sin estridencias, de forma natural, como si el misterio fuera el estado original de la materia y la lógica diaria una simple ilusión.`
    ];

    const resolutions = [
      `Cerró los ojos frente al espejo empañado, sabiendo que el tiempo es un río que nos arrebata implacablemente, pero consolado por la certeza de que él mismo era la sustancia de ese río circular.`,
      `Al final, el rumor de los días idos quedó sepultado bajo el murmullo constante de la llovizna sobre los tejados de Praga, una música monótona que no cansa al alma cansada de buscar pasajes secretos.`,
      `La última página se disolvió en el crepúsculo con la belleza melancólica de las fronteras lejanas, dejando al lector con la extraña sensación de haber habitado una habitación de la infancia que creía olvidada.`,
      `La sonata del agua inmóvil concluyó en un silencio absoluto, demostrando que la literatura no consiste en poblar el mundo de fantasmas, sino en enseñarnos a contemplar los que ya habitan en nuestra mirada.`,
      `El sastre de las sombras guardó sus herramientas de plata en la caja de música rota, sabiendo que toda gran historia tiene una sombra invisible que persiste mucho después de que se apague la última vela.`
    ];

    const p1 = selectFromPool(openings, s1);
    const p2 = selectFromPool(introspections, s2);
    const p3 = selectFromPool(chapterClimaxes, s3);
    const p4 = selectFromPool(resolutions, s4);

    return `<p>${p1}</p>\n<p>${p2}</p>\n<p>${p3}</p>\n<p>${p4}</p>`;

  } else if (category === 'ensayo') {
    // ── ESSAY: Walter Benjamin, Byung-Chul Han, Woolf style ──
    const openings = [
      `La prisa contemporánea no debe entenderse simplemente como una aceleración mecánica del movimiento cotidiano, sino como una mutilación sistemática de nuestra capacidad de mirar. En la velocidad del tránsito, los objetos pierden su sombra, y con ella, su misterio, dejándonos en una intemperie conceptual sin precedentes.`,
      `Escribir es trazar una línea en el agua con la esperanza de que la corriente entienda el trazo antes de disolverlo bajo su fluir constante. En la obra intelectual de ${author}, este gesto no constituye una ingenuidad poética, sino un acto de soberanía intelectual frente a la dictadura del consumo rápido.`,
      `La contemplación no es una actitud pasiva, una simple renuncia al ajetreo del mundo productivo; por el contrario, es la resistencia política más profunda y rigurosa que nos queda. Detenerse a observar cómo la luz de la tarde se filtra por la ventana del museo vacío es recuperar el tiempo secuestrado.`,
      `La arqueología del lenguaje demuestra que cada palabra que pronunciamos es en realidad una ruina que aún respira con el eco de los siglos. Limpiar el polvo acumulado de los vocablos para devolverles su peso original es la tarea fundamental que se impone en estas páginas esenciales.`,
      `El silencio no representa la simple ausencia de sonido en el espacio físico; es la presencia de una atención absoluta y concentrada. En una cultura que idolatra la opinión instantánea y la reacción digital, cultivar la pausa es el único camino hacia una liturgia íntima del pensar.`
    ];

    const introspections = [
      `Al reflexionar sobre ${t1} y ${t2}, nos enfrentamos a la paradoja del sujeto moderno, atrapado en un laberinto de estímulos constantes que le impiden la experiencia profunda de la melancolía. Como argumenta esta meditación poética, la reconstrucción del vacío no es un síntoma de decadencia, sino de lucidez estética.`,
      `La deriva de las ideas contemporáneas demuestra que la pérdida de la atención ha provocado una erosión de nuestra relación con ${t1}. No se trata de proponer una nostalgia reaccionaria, sino de cuestionar la prisa como un imperativo ético que devalúa el arte de la frase precisa y la contemplación tranquila.`,
      `La gramática de la melancolía revela las grietas invisibles de la modernidad tardía, donde cada fragmento poético funciona como un refugio contra la prisa. En este contexto, el estudio de ${t2} adquiere un carácter casi de arqueología de las palabras olvidadas por el ruido digital de nuestra época.`,
      `La contemplación como resistencia exige del lector una disposición táctil para saborear la textura del silencio. La tiranía de la velocidad nos obliga a consumir conceptos en lugar de habitarlos, de la misma manera que el turista recorre el museo buscando registrar la visita en lugar de contemplar la obra.`,
      `Bajo la mirada suspendida de la filosofía de la atención, lo indecible cobra una presencia casi física en las páginas de *${title}*. No se busca enunciar una teoría definitiva, sino construir un horizonte donde el pensamiento pueda respirar a su propio ritmo sin la presión del rendimiento.`
    ];

    const chapterClimaxes = [
      `En el capítulo dedicado a "${chTitle || 'la estética del vacío'}", el análisis de ${author} se adentra en la carpintería del concepto. El autor demuestra cómo el fragmento poético constituye la unidad mínima de resistencia intelectual, desvelando que la verdad no se enuncia en el centro de la voz, sino en los límites de la elipsis.`,
      `Al abordar "${chTitle || 'la rebelión de la atención'}", el ensayo alcanza su punto de máxima intensidad teórica. A través de una crítica cultural implacable, se desarticulan los mecanismos del utilitarismo para proponer una ética del lector distraído que encuentra la belleza en la deriva y el desvío.`,
      `La tesis de "${chTitle || 'la contemplación como resistencia'}" se desarrolla con una cadencia argumentativa que imita la respiración de la prosa más exigente. No hay prisa por llegar a una conclusión apresurada; el pensamiento se acumula lentamente, como la humedad que precede a la tormenta intelectual.`,
      `En este tramo crítico sobre "${chTitle || 'la arqueología de las palabras'}", nos enfrentamos al espejo de nuestra propia cultura de la inmediatez. El rigor del análisis formal desvela las estructuras del vacío sobre las que descansa gran parte de la teoría contemporánea de los signos mudos.`,
      `Al indagar en "${chTitle || 'la paradoja del tiempo suspendido'}", el autor erige una partitura conceptual impecable. La alternancia de períodos largos y sinuosos con reflexiones afiladas como latidos genera una hipnosis que invita a la pausa meditativa.`
    ];

    const resolutions = [
      `En última instancia, el elogio de la lentitud nos recuerda que el pensamiento no tiene la función de acelerar la acción, sino de ensanchar el espacio de la contemplación y devolvernos la soberanía de nuestra mirada.`,
      `Escribir, bajo esta luz crepuscular, es un gesto de fe en que el trazo en el agua perdurará en la memoria de la corriente, convirtiendo el acto de leer en una liturgia de profunda intimidad intelectual.`,
      `La estética de la renuncia concluye así no como un final abrupto, sino como una apertura hacia el horizonte de lo indecible, donde las palabras callan para que la verdad comience a respirar en silencio.`,
      `Así se cierra esta arqueología, recordándonos que el murmullo de las ruinas es la única música capaz de sanar al alma contemporánea del ruido ensordecedor de su propio progreso.`,
      `La mirada suspendida sobre las páginas sueltas de este cuaderno de taller nos deja con una única certeza: en la física de las ideas, el silencio siempre ocupa más espacio que la elocuencia de la prisa.`
    ];

    const p1 = selectFromPool(openings, s1);
    const p2 = selectFromPool(introspections, s2);
    const p3 = selectFromPool(chapterClimaxes, s3);
    const p4 = selectFromPool(resolutions, s4);

    return `<p>${p1}</p>\n<p>${p2}</p>\n<p>${p3}</p>\n<p>${p4}</p>`;

  } else if (category === 'biografia') {
    // ── BIOGRAPHY & MEMOIRS: Zweig style ──
    const openings = [
      `Nació en un puerto cuyos barcos parecían siempre a punto de partir hacia horizontes ignotos pero nunca lo hacían. Su infancia transcurrió bajo el influjo del rumor salino de las maderas y el olor persistente a brea húmeda, enmarcado en una luz gris que determinaría para siempre el tono melancólico de su correspondencia.`,
      `Los últimos años de su vida transcurrieron en una absoluta y voluntaria reclusión en aquella casona frente al oleaje de Brighton. Quienes la visitaron en esa época crepuscular recuerdan que apenas hablaba, dedicating las horas de la tarde a contemplar la luz cambiante sobre los guijarros mojados de la costa.`,
      `Las cartas de juventud de este singular creador revelan a un espíritu dividido entre la vorágine de la vida bohemia en París y un anhelo irrefrenable de silencio absoluto. 'París es una fiesta que nos agota las palabras', escribía en 1924, 'necesito una geografía fría donde las ideas recuperen su peso'.`,
      `El diario de su convalecencia constituye uno de los testimonios más desgarradores y a la vez luminosos sobre la fragilidad de la condición humana. Escrito con una caligrafía temblorosa pero con una lucidez formal implacable, analiza cómo el dolor físico agudiza la percepción de la belleza.`,
      `Caminaba por los bulevares con la mirada distraída de quien busca un pasaje secreto entre dos edificios grises comunes. Sus amigos íntimos recordaban su risa tímida y su obsesión infantil por coleccionar cajas de música rotas, un rastro de melancolía que impregna cada página de sus diarios.`
    ];

    const introspections = [
      `La biografía intelectual de este autor demuestra que su búsqueda de ${t1} y ${t2} estuvo íntimamente ligada a sus crisis personales. Su exilio voluntario en Brighton no fue una simple huida de las responsabilidades mundanas, sino la dolorosa ganancia de una memoria que necesitaba distancia para traducirse en arte.`,
      `A través de sus cuadernos íntimos de esta época, contemplamos el rastro de una voz herida que luchaba por dar forma a ${t1}. Su relación tormentosa con el lenguaje y su obsesión con el exilio del alma nos ofrecen una semblanza poética de una sensibilidad abrumadora que hizo del invierno su estación de luz.`,
      `El análisis epistolar de esta etapa revela cómo la viajera solitaria del Sena encontró en ${t2} una geografía habitable. Sus cartas nunca enviadas a destinatarios que ya habían partido son un testimonio íntimo del arte de la melancolía, donde el rumor de los días idos se convierte en la única música constante.`,
      `En el transcurso de su reclusión, la sombra del cerezo en flor en su jardín de Brighton se convirtió en el eje de sus meditaciones sobre la memoria habitada. Su infancia de espejos había quedado atrás, pero el rastro de sus pasos sobre el hielo delgado seguía definiendo su andar errante.`,
      `La bitácora del náufrago urbano nos enseña que toda gran vida es un borrador inconcluso, un intento obstinado por retener el viento en páginas sueltas. Su exilio no fue la pérdida de una geografía física, sino el descubrimiento de una patria literaria donde las palabras pesaban más que los días.`
    ];

    const chapterClimaxes = [
      `Durante el período que corresponde a "${chTitle || 'los años de Brighton'}", la correspondencia de ${author} muestra el inicio de la redacción de *${title}*. La tensión existencial que se respira en el texto refleja los diarios de la sombra y la luz que el autor mantenía en secreto, revelando una lucha interna sin cuartel.`,
      `Al estudiar el capítulo titulado "${chTitle || 'el diario de la convalecencia'}", descubrimos la génesis de su madurez estilística. La enfermedad física actuó como un filtro estético de una finura abrumadora, obligándolo a prescindir del adorno vulgar para concentrarse en la elipsis y la partitura del silencio.`,
      `En este tramo correspondiente a "${chTitle || 'las cartas que nunca envié'}", la semblanza de ${author} adquiere una profundidad trágica. Su ruptura intelectual con los círculos parisinos y su retiro a la soledad de la costa son narrados con una sensibilidad y un rigor que evitan la autocompasión melodramática.`,
      `Al abordar "${chTitle || 'los pasos sobre el hielo delgado'}", la investigación biográfica desvela los detalles de su tormentoso proceso creativo. La arquitectura de su obra cumbre se construyó sobre las ruinas de su propia salud mental, un precio altísimo que pagó con una resignación que bordeaba la felicidad.`,
      `El capítulo dedicado a "${chTitle || 'la bitácora del náufrago urbano'}" ilumina las esquinas más oscuras de su juventud literaria. A través del cruce de testimonios y correspondencia privada, se reconstruye la atmósfera intelectual de entreguerras con un realismo documental fascinante.`
    ];

    const resolutions = [
      `Hoy, al contemplar el rastro de su voz herida sobre las páginas amarillentas, comprendemos que su exilio no fue una derrota, sino el precio necesario para regalarnos una verdad que desafía el paso del tiempo.`,
      `Se apagó su luz una mañana de invierno en Brighton, dejando tras de sí un vacío inmenso pero también una bitácora única sobre cómo persistir con elegancia en medio de la tempestad del mundo.`,
      `La memoria de sus días idos persiste disuelta en el oleaje constante de la costa, una música de fondo que acompaña a cada lector que se aventura en los diarios íntimos de este creador extraordinario.`,
      `Así concluye este retrato íntimo, recordándonos que las vidas más excepcionales son aquellas que se escriben con la levedad de un suspiro y la solidez de una piedra húmeda bajo la lluvia.`,
      `Su último diario quedó abierto sobre la mesa de caoba, con una última frase inconclusa que resume toda su existencia: escribir es la única forma de recordar lo que nunca tuvimos el valor de vivir.`
    ];

    const p1 = selectFromPool(openings, s1);
    const p2 = selectFromPool(introspections, s2);
    const p3 = selectFromPool(chapterClimaxes, s3);
    const p4 = selectFromPool(resolutions, s4);

    return `<p>${p1}</p>\n<p>${p2}</p>\n<p>${p3}</p>\n<p>${p4}</p>`;

  } else if (category === 'tecnica') {
    // ── TECHNICAL & WRITING: Umberto Eco style ──
    const openings = [
      `Toda novela de primer orden se comporta ante los ojos del lector como una catedral invisible: sus cimientos deben poseer una rigidez matemática impecable, pero su interior debe estar diseñado para permitir la libre circulación de la luz, las sombras y los silencios implícitos.`,
      `El adjetivo preciso no es aquel que decora la frase con fines ornamentales, sino el que la ancla con firmeza al suelo de la verdad dramática. En la física del espacio ficcional, una sola palabra colocada con pereza o vanidad puede derrumbar la arquitectura de una escena entera.`,
      `La elipsis literaria no representa una omisión perezosa o una elusión del conflicto por parte del creador; al contrario, es el motor que hace respirar a la novela moderna. Al sugerir lo invisible, el autor exige del lector un acto de co-creación estética y activa.`,
      `El ritmo de la prosa exigente no depende de una métrica rígida, sino de la sabia distribución de las respiraciones en el texto. Alternar frases cortas como latidos con períodos largos y sinuosos como corrientes de agua genera una hipnosis tipográfica que atrapa la atención.`,
      `El suspenso existencial en la alta literatura no nace de la urgencia por saber quién cometió el crimen físico, sino de comprender por qué el personaje continúa caminando hacia la sombra de su propio abismo. Es una vibración ética y estética que ocurre en la frontera de lo indecible.`
    ];

    const introspections = [
      `Para dominar las técnicas de ${t1} y ${t2}, el escritor en formación debe comprender la carpintería del suspenso existencial. La ingeniería del personaje ausente exige un control absoluto del subtexto, obligándonos a erigir muros y proyectar sombras para que el lector los habite intuitivamente en *${title}*.`,
      `La alquimia del adjetivo preciso es la herramienta fundamental en la carpintería de la prosa literaria de ${author}. El ritmo de las palabras mudas no se improvisa; se construye mediante la alternancia de períodos que respeten la respiración de la frase y la física de la atención del lector.`,
      `En el taller literario contemporáneo, el estudio de ${t1} y ${t2} revela la importancia de la estructura invisible de la novela moderna. A través de la partitura de los diálogos implícitos, aprendemos a diseñar habitaciones narrativas que el lector recordará con la nitidez de una casa de su infancia.`,
      `La física del diálogo implícito nos enseña que el silencio ocupa más espacio en la página que la elocuencia de la voz. La ingeniería formal que propone este volumen se adentra en el arte del subtexto poético, desvelando los engranajes de la tensión y el uso arquitectónico de la luz en la escena.`,
      `Toda partitura de la novela moderna exige del escritor una disciplina de cirujano y una sensibilidad de poeta. Para equilibrar ${t2} con la dinámica del avance narrativo, es indispensable dominar la elipsis, sabiendo qué omitir para que lo no dicho sea lo que verdaderamente resuene.`
    ];

    const chapterClimaxes = [
      `Al abordar el tema de "${chTitle || 'la tensión narrativa'}", el análisis técnico de ${author} se revela de una lucidez excepcional. Se analizan los mecanismos de la respiración de la frase corta y cómo el suspenso existencial se acumula en las grietas de la estructura sintáctica del manuscrito.`,
      `En el capítulo titulado "${chTitle || 'la carpintería del final perfecto'}", se desvelan los engranajes formales de los desenlaces memorables. El manual explica cómo evitar la resolución artificial de los conflictos, enseñando a suspender la acción en la frontera de lo indecible para lograr el eco lírico.`,
      `Al indagar en "${chTitle || 'la física del espacio ficcional'}", esta lección teórica demuestra cómo erigir escenarios tridimensionales habitables. La colocación del mobiliario escénico y la luz rasante de la tarde en la página son tratadas como cuestiones de estricta ingeniería literaria.`,
      `El segmento dedicado a "${chTitle || 'la partitura del diálogo implícito'}" constituye un hito de la crítica teórica. Se examinan los diálogos donde los personajes conversan sobre una cosa mientras resuelven otra diferente en el subtexto, un mecanismo de alta costura narrativa indispensable.`,
      `Al analizar "${chTitle || 'el arte de la elipsis'}", el cuaderno de taller ofrece una guía práctica y brillante para depurar la prosa. Se enseña a podar la maleza de las palabras vacías para dejar únicamente la piedra húmeda y reluciente de la frase perfecta bajo la lluvia nocturna.`
    ];

    const resolutions = [
      `En última instancia, el rigor técnico no estrangula la inspiración literaria, sino que le proporciona la única armadura sólida capaz de hacerla perdurar frente a la erosión del tiempo.`,
      `Así concluye esta lección de estilo, recordándonos que la frase perfecta debe tener el peso exacto de una piedra húmeda bajo la lluvia, anclada siempre al suelo de la verdad humana.`,
      `La partitura de la novela moderna queda así dispuesta para el lector exigente, enseñando que escribir bien es, sobre todo, aprender a escuchar el espacio que queda libre entre las palabras.`,
      `El arte del subtexto literario se resume en una única regla de oro formal: el escritor proyecta la sombra, pero es el lector quien debe recorrer el laberinto por su propia voluntad.`,
      `Y al cerrar este cuaderno de taller, comprendemos que la gran arquitectura narrativa no se ve; se siente en la solidez de las habitaciones literarias donde habitamos mientras leemos.`
    ];

    const p1 = selectFromPool(openings, s1);
    const p2 = selectFromPool(introspections, s2);
    const p3 = selectFromPool(chapterClimaxes, s3);
    const p4 = selectFromPool(resolutions, s4);

    return `<p>${p1}</p>\n<p>${p2}</p>\n<p>${p3}</p>\n<p>${p4}</p>`;

  } else {
    // ── KIDS & FAMILY: Saint-Exupéry, Michael Ende style ──
    const openings = [
      `En la cima de la Montaña Azul vivía un unicornio cuyas crines estaban tejidas con hilos de escarcha brillante y luz de luna. Aunque a veces se sentía solo, los pájaros del viento del norte le traían cuentos mágicos de barcos de papel dorado que navegaban por ríos de nubes blancas.`,
      `El pequeño faro abandonado de la isla misteriosa no usaba aceite ni carbón para encender su luz cada noche. Se alimentaba de las sonrisas de las estrellas de mar que jugaban en la arena húmeda, proyectando un rayo brillante de colores fantásticos sobre las olas espumosas.`,
      `Don Manuel era el relojero más sabio y viejecito de la comarca, pero en su trastienda no reparaba relojes comunes de metal. Su especialidad eran los relojes de arena mágica que guardaban los segundos felices de los niños, deteniendo el tiempo cuando se reía con ganas.`,
      `Marta y su fiel perro Duque encontraron una línea de huellas brillantes que resplandecían con una suave luz verde al atardecer en el lindero del bosque. Sin pensarlo dos veces, Marta tomó de la mano a sus amigos y se adentró en el bosque para descifrar el hermoso misterio.`,
      `La pequeña tortuga Marina tenía un caparazón pintado con las constelaciones de todo el cielo estrellado. Cada vez que soplaba el viento fresco, Marina cerraba sus ojitos y flotaba suavemente sobre las ráfagas de aire, viajando de nube en nube para llevar sueños felices.`
    ];

    const introspections = [
      `Nuestro entrañable amigo amaba coleccionar ${t1} e imaginar emocionantes aventuras de ${t2}. Su abuelo le recordaba siempre que el tiempo de soñar no se mide en minutos en un reloj de arena, sino en la anchura de una sonrisa sincera compartida con las personas que queremos.`,
      `A Bruno le encantaba imaginar que las estrellas del cielo usaban faros de colores para no perderse en la inmensidad de la noche larga. Con la ayuda de ${author}, comprendió que la verdadera magia del invierno reside en la empatía, la amistad verdadera y el trabajo en equipo en la familia.`,
      `A través de este tierno relato sobre ${t1}, los niños aprenden que el bosque susurrante no habla alto, pero guarda secretos maravillosos para quienes saben caminar despacito y escuchar la naturaleza con respeto y amor por la ecología y el agua cristalina.`,
      `En la cueva de los ecos felices, cada palabra bonita que decías se convertía en una pequeña mariposa de luz de colores. Marta descubrió que el hielo brilla mucho con la luna, pero un amigo bueno brilla con luz propia en cualquier rincón oscuro de la vida.`,
      `El pingüino que quería volar pasaba las tardes contemplando el vuelo de las gaviotas sobre los barcos de papel dorado. Sus amigos le decían que los pingüinos no vuelan, pero él sabía que, con imaginación y perseverancia, no hay ningún sueño que sea demasiado grande.`
    ];

    const chapterClimaxes = [
      `En este capítulo lleno de diversión, titulado "${chTitle || 'la llave del viento'}", nuestros valientes protagonistas encuentran un engranaje dorado escondido bajo las raíces de un sauce llorón de hojas de plata que respondía a los suspiros de las constelaciones.`,
      `La emocionante aventura de "${chTitle || 'el secreto del faro'}" nos lleva a descubrir el misterio de los engranajes estelares. Al hacerlos girar con trabajo en equipo, un haz de luz cósmico ilumina el cielo, enviando un mensaje de alegría a todos los animales del bosque.`,
      `Al leer sobre "${chTitle || 'las huellas brillantes'}", acompañamos a Marta y Duque en su búsqueda por salvar el manantial sagrado. La lección sobre el respeto a la naturaleza y el cuidado de las plantas brilla con la fuerza de una estrella de mar en el agua.`,
      `En la divertida escena de "${chTitle || 'el relojero de los sueños'}", Don Manuel repara el reloj de Bruno usando arena dorada de la felicidad. Es un momento tierno y mágico que nos recuerda que jugar en familia es el tesoro más grande de toda la infancia.`,
      `La sorprendente historia de "${chTitle || 'el caballero de madera'}" nos enseña el valor de la empatía. Al ayudar a un pequeño duende que había perdido su lápiz de plata, la armadura de madera de nuestro caballero empieza a florecer con hermosas margaritas.`
    ];

    const resolutions = [
      `Y al final de la jornada, acurrucado bajo la luz tibia de la luna en su camita, se durmió con una sonrisa, sabiendo que un buen amigo siempre está cerca para iluminar la noche con cuentos felices.`,
      `La isla volvió a brillar en paz, con el faro sonriendo a las constelaciones lejanas y los niños soñando con maravillosos viajes espaciales a bordo de trenes hechos enteramente de nubes suaves.`,
      `El manantial sagrado volvió a correr con agua cristalina y cantarína, y el bosque susurrante le dio las gracias a los niños regalándoles flores brillantes que nunca jamás se marchitaban.`,
      `Don Manuel guardó su reloj de arena mágica con una gran sonrisa de abuelo, sabiendo que Bruno había aprendido la lección más importante: saborear cada minuto feliz de juego con sus seres queridos.`,
      `Y la pequeña tortuga Marina cerró sus ojitos en su caparazón estrellado, flotando en el cielo de los sueños felices mientras el viento del norte mecía suavemente su cuna de nubes esponjosas.`
    ];

    const p1 = selectFromPool(openings, s1);
    const p2 = selectFromPool(introspections, s2);
    const p3 = selectFromPool(chapterClimaxes, s3);
    const p4 = selectFromPool(resolutions, s4);

    return `<p>${p1}</p>\n<p>${p2}</p>\n<p>${p3}</p>\n<p>${p4}</p>`;
  }
}iedo a la oscuridad."
    ]
  };

  const pool = prosePools[category] || prosePools.ficcion;
  const seed = (title.length + chapterNum) % pool.length;
  
  const p1 = pool[seed];
  const p2 = pool[(seed + 1) % pool.length];
  const p3 = pool[(seed + 2) % pool.length];
  
  return `<p>${p1}</p>\n<p>${p2}</p>\n<p>${p3}</p>`;
}

async function claimGift(token, data) {
  const claimRef = doc(db, "gifts", `gift_${state.bookId}_${auth.currentUser.uid}`);
  await setDoc(claimRef, {
    ...data,
    claimed: true,
    claimedBy: auth.currentUser.uid,
    claimedAt: serverTimestamp()
  });
  await updateDoc(doc(db, "gifts", token), { claimed: true });
}

function renderPreview() {
  const ch = state.book.chapters[0];
  const container = $('reading-content');
  
  // Tomamos solo los primeros 3 párrafos para el preview
  const previewParagraphs = ch.content.split('\n').filter(p => p.trim()).slice(0, 3);
  const contentHtml = previewParagraphs.map(p => `<p>${p}</p>`).join('');

  let ctaHtml = '';
  if (state.gift) {
    ctaHtml = `
      <div class="cta-card">
        <h3>Continúa la lectura</h3>
        <p>Has llegado al final de la vista previa de cortesía. Acepta la invitación de <strong>${state.gift.fromName}</strong> para añadir esta obra a tu biblioteca y seguir leyendo.</p>
        <button onclick="window.location.href='index.html'" class="btn-accept-invitation">
          Aceptar Invitación y Continuar
        </button>
        <span class="cta-note">Es gratis para invitados. Timeless Editorial.</span>
      </div>
    `;
  } else {
    ctaHtml = `
      <div class="cta-card" style="border: 1px solid var(--gold-faint); background: rgba(28, 28, 26, 0.6); backdrop-filter: blur(10px);">
        <h3 style="color: var(--gold); font-family: var(--font-serif); font-size: 22px;">Suscripción Requerida</h3>
        <p style="margin: 10px 0 20px; line-height: 1.5; color: var(--text-secondary);">Esta obra es parte de la colección exclusiva de Timeless. Adquiere una suscripción anual para disfrutar de lectura ilimitada, tomar notas y personalizar tu experiencia.</p>
        <button onclick="window.location.href='index.html?action=subscribe'" class="btn-accept-invitation" style="background: var(--gold); color: #1C1C1A; font-weight: bold; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; letter-spacing: 1px; text-transform: uppercase;">
          Suscribirse por $89/año
        </button>
        <span class="cta-note" style="margin-top: 12px; color: var(--ink-faint);">14 días de prueba · Cancela cuando quieras</span>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="chapter-heading">
      <h1 class="chapter-title">${ch.title}</h1>
      <div class="chapter-desc">${ch.desc || ""}</div>
    </div>
    <div class="reading-body font-${state.fontFamily} preview-mode">
      ${contentHtml}
      <div class="preview-fade"></div>
    </div>
    <div class="invitation-cta">
      ${ctaHtml}
    </div>
  `;
  window.scrollTo(0, 0);
}

function showInvitationCard(gift) {
  const card = document.createElement('div');
  card.id = 'invitation-overlay';
  card.className = 'invitation-overlay visible';
  card.innerHTML = `
    <div class="invitation-card-inner">
      <div class="invitation-header">
        <div class="editorial-logo">TIMELESS</div>
        <div class="invitation-label">Invitación de Cortesía</div>
      </div>
      <div class="invitation-body">
        <img src="${state.book.cover || 'assets/cover.png'}" class="invitation-cover" />
        <h2 class="invitation-book-title">${state.book.title}</h2>
        <p class="invitation-sender">Un obsequio personal de <strong>${gift.fromName}</strong></p>
        ${gift.personalNote ? `<div class="personal-note">&ldquo;${gift.personalNote}&rdquo;</div>` : ''}
      </div>
      <button class="btn-start-reading" onclick="document.getElementById('invitation-overlay').remove()">
        Empezar a leer
      </button>
    </div>
  `;
  document.body.appendChild(card);
}

function showErrorState(msg) {
  $('reading-content').innerHTML = `
    <div style="text-align:center; padding:100px; font-family:var(--font-serif);">
      <div style="font-size: 50px; margin-bottom: 20px;">✉️</div>
      <h2>${msg}</h2><br>
      <p style="color:var(--text-muted); max-width:400px; margin: 0 auto 30px;">
        Esta invitación podría haber expirado o requerir una cuenta de Timeless activa.
      </p>
      <a href="index.html" class="btn-nav">Ir al Inicio</a>
    </div>`;
}

// ── Rendering ────────────────────────────────────────────────────────────────
async function renderChapter(idx) {
  // Enviar telemetría del capítulo anterior antes de cambiar (Pilar 2)
  if (state.book) {
    await sendTelemetryPacket();
  }

  state.currentChapter = idx;
  const ch = state.book.chapters[idx];
  
  // Update Header/UI
  $('top-title').textContent = state.book.title;
  $('top-ch').textContent = `Capítulo ${ch.id}`;
  $('nav-info').textContent = `Capítulo ${ch.id} de ${state.book.chapters.length}`;
  $('nav-title').textContent = ch.title;
  $('btn-prev').disabled = idx === 0;
  $('btn-next').disabled = idx === state.book.chapters.length - 1;

  // Content with Animation
  const container = $('reading-content');
  container.style.opacity = '0';
  
  // Si no se ha cargado el contenido del streaming, solicitarlo al servidor y descifrarlo en memoria (Pilar 1)
  if (!ch.content) {
    if (ch.encryptedContent && ch.iv) {
      try {
        const decrypted = await decryptText(ch.encryptedContent, ch.iv);
        ch.content = decrypted;
        console.log(`  ✦ [Reader Offline] Capítulo ${idx + 1} descifrado con éxito desde copia local IndexedDB.`);
      } catch (err) {
        console.warn("  ⚠ [Reader Offline] Fallo al descifrar capítulo descargado:", err.message);
        ch.content = `<p>Error de DRM: No se pudo descifrar el manuscrito local.</p>`;
      }
    } else {
      container.innerHTML = `<div style="text-align:center; padding:120px; font-family:var(--font-serif); color:var(--text-secondary);"><div style="font-size:32px; margin-bottom:15px; animation: kids-float 2.5s ease-in-out infinite;">🔒</div>Cifrando canal y transmitiendo manuscrito líquido...</div>`;
      container.style.opacity = '1';
      
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const response = await fetch(`/api/book/${state.bookId}/chunk/${idx}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
          throw new Error(response.status === 403 ? "Suscripción activa requerida para lectura Premium." : "Error en el servidor de streaming.");
        }
        
        const chunk = await response.json();
        const decrypted = await decryptText(chunk.data, chunk.iv);
        ch.content = decrypted;
        console.log(`  ✦ [Streaming] Capítulo ${idx + 1} transmitido y descifrado localmente.`);
      } catch (err) {
        console.warn("  ⚠ [Streaming Offline] Fallo de streaming en canal seguro, usando respaldo local:", err.message);
        ch.content = ch.fallbackContent || `<p>Este capítulo no se pudo descargar del canal de streaming seguro. Por favor verifica tu suscripción o conexión a internet.</p>`;
      }
    }
  }

  setTimeout(() => {
    container.innerHTML = `
      <div class="chapter-heading">
        <h1 class="chapter-title">${ch.title}</h1>
        <div class="chapter-desc">${ch.desc || ""}</div>
      </div>
      <div class="reading-body font-${state.fontFamily}">
        ${ch.content}
      </div>
    `;
    container.style.opacity = '1';
    
    // Restaurar scroll si estamos cargando el capítulo guardado por primera vez en la sesión
    if (state.restoringScroll && state.savedScrollY) {
      window.scrollTo({ top: state.savedScrollY, behavior: 'instant' });
      state.restoringScroll = false;
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    
    applyHighlightsToDOM();
    updateProgress();
  }, 300);
}

function renderTOC() {
  $('chapter-list').innerHTML = state.book.chapters.map((ch, i) => `
    <div class="chapter-item" data-idx="${i}">
      <div class="chapter-num">${ch.id}</div>
      <div class="chapter-name">${ch.title}</div>
    </div>
  `).join('');
  
  document.querySelectorAll('.chapter-item').forEach(el => {
    el.onclick = () => {
      renderChapter(parseInt(el.dataset.idx));
      closeAll();
    };
  });
}

// ── UI Controls ──────────────────────────────────────────────────────────────
const closeAll = () => {
  document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
  $('panel-overlay').classList.remove('visible');
};

$('btn-toc').onclick = () => {
  $('toc-panel').classList.add('open');
  $('panel-overlay').classList.add('visible');
};

$('btn-notes').onclick = () => {
  $('notes-panel').classList.add('open');
  $('panel-overlay').classList.add('visible');
};

$('btn-settings').onclick = () => {
  $('settings-panel').classList.add('open');
  $('panel-overlay').classList.add('visible');
};

$('panel-overlay').onclick = closeAll;
$('btn-back').onclick = () => window.location.href = 'index.html';
$('btn-prev').onclick = () => {
  renderChapter(state.currentChapter - 1);
  saveProgressDebounced();
};
$('btn-next').onclick = () => {
  renderChapter(state.currentChapter + 1);
  saveProgressDebounced();
};

// ── Progress & Focus Mode ────────────────────────────────────────────────────
function updateProgress() {
  const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
  const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrolled = (winScroll / height) * 100;
  $('progress-bar').style.width = scrolled + "%";
}

function handleScroll() {
  updateProgress();
  
  const currentScroll = window.pageYOffset;
  if (currentScroll > 100) {
    if (currentScroll > state.lastScroll) {
      // Scrolling down -> Focus Mode (Hide UI)
      document.querySelector('header').classList.add('hidden');
      document.querySelector('.nav-bottom').classList.add('hidden');
    } else {
      // Scrolling up -> Show UI
      document.querySelector('header').classList.remove('hidden');
      document.querySelector('.nav-bottom').classList.remove('hidden');
    }
  }
  state.lastScroll = currentScroll;
  saveProgressDebounced();
}

window.addEventListener('scroll', handleScroll);

// ── Cloud Sync & Highlights ──────────────────────────────────────────────────
let progressTimeout = null;
function saveProgressDebounced() {
  if (!auth.currentUser || state.isPreview) return;
  clearTimeout(progressTimeout);
  progressTimeout = setTimeout(async () => {
    try {
      const ref = doc(db, 'users', auth.currentUser.uid, 'progress', state.bookId);
      await setDoc(ref, {
        chapter: state.currentChapter,
        scrollY: window.pageYOffset,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch(e) { console.warn("No se pudo guardar progreso", e); }
  }, 1000);
}

async function loadProgress() {
  try {
    const ref = doc(db, 'users', auth.currentUser.uid, 'progress', state.bookId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const p = snap.data();
      state.currentChapter = p.chapter || 0;
      state.savedScrollY = p.scrollY || 0;
      state.restoringScroll = true;
    }
  } catch(e) {}
}

async function loadHighlights() {
  try {
    const q = query(
      collection(db, 'users', auth.currentUser.uid, 'highlights'),
      where('bookId', '==', state.bookId)
    );
    const snap = await getDocs(q);
    state.highlights = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNotesPanel();
  } catch (e) {}
}

function renderNotesPanel() {
  const list = $('notes-list');
  if (state.highlights.length === 0) {
    list.innerHTML = '<div style="color:var(--ink-faint); font-size:13px; text-align:center;">Aún no tienes notas. Selecciona texto en el lector para destacar.</div>';
    return;
  }
  
  list.innerHTML = state.highlights.map(h => `
    <div class="note-item" id="note-item-${h.id}">
      <div style="font-family:var(--font-serif); font-style:italic; font-size:15px; margin-bottom:8px; line-height:1.4;">&ldquo;${h.text}&rdquo;</div>
      <div class="note-footer">
        <div class="note-meta">Capítulo ${h.chapter + 1}</div>
        <div style="display:flex; gap:10px;">
          <button class="btn-share-quote" data-id="${h.id}">Compartir</button>
          <button class="btn-remove-highlight" data-id="${h.id}" style="background:none; border:none; color:#FF5F57; font-size:11px; text-transform:uppercase; letter-spacing:1px; cursor:pointer; font-weight:600;">Eliminar</button>
        </div>
      </div>
    </div>
  `).join('');
  
  // Vincular click en botones de compartir
  list.querySelectorAll('.btn-share-quote').forEach(btn => {
    btn.onclick = () => {
      const hlId = btn.dataset.id;
      const hl = state.highlights.find(x => x.id === hlId);
      if (hl) {
        shareQuoteCard(hl);
      }
    };
  });

  // Vincular click en botones de eliminar subrayado
  list.querySelectorAll('.btn-remove-highlight').forEach(btn => {
    btn.onclick = () => {
      const hlId = btn.dataset.id;
      if (confirm("¿Deseas eliminar este subrayado?")) {
        deleteHighlight(hlId);
      }
    };
  });
}

// ── Quote Sharing Card (Canvas & Native Share) ────────────────────────────────
function drawQuoteCard(canvas, text, bookTitle, chapterNum) {
  const ctx = canvas.getContext('2d');
  
  // 1. Fondo de papel premium
  ctx.fillStyle = '#F5F1EB'; 
  ctx.fillRect(0, 0, 1080, 1920);
  
  // 2. Bordes ornamentales de lujo
  ctx.strokeStyle = '#C9A96E'; // Borde dorado
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, 1080 - 80, 1920 - 80);
  
  ctx.strokeStyle = '#1C1C1A'; // Delgada línea oscura interna
  ctx.lineWidth = 1;
  ctx.strokeRect(55, 55, 1080 - 110, 1920 - 110);
  
  // 3. Encabezado de Marca
  ctx.fillStyle = '#1C1C1A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.font = "28px 'Inter', sans-serif";
  const headerText = "T I M E L E S S   E D I T O R I A L";
  ctx.fillText(headerText, 1080 / 2, 160);
  
  ctx.fillStyle = '#C9A96E';
  ctx.font = "24px 'EB Garamond', serif";
  ctx.fillText("♦   ♦   ♦", 1080 / 2, 210);
  
  // 4. Comilla gigante dorada translúcida detrás de la cita
  ctx.fillStyle = 'rgba(201, 169, 110, 0.1)';
  ctx.font = "360px 'Playfair Display', 'EB Garamond', serif";
  ctx.fillText("“", 1080 / 2, 600);
  
  // 5. Ajuste y renderizado del texto (WrapText centrado)
  ctx.fillStyle = '#1C1C1A';
  ctx.font = "italic 44px 'Lora', 'EB Garamond', Georgia, serif";
  
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  const maxWidth = 800; // Margen amplio para móviles
  
  for (let n = 0; n < words.length; n++) {
    const testLine = currentLine + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(currentLine.trim());
      currentLine = words[n] + ' ';
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine.trim());
  
  const lineHeight = 65;
  const totalTextHeight = lines.length * lineHeight;
  let startY = 960 - (totalTextHeight / 2); // Centrado vertical absoluto
  
  ctx.font = "italic 44px 'Lora', 'EB Garamond', Georgia, serif";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(`“${lines[i]}”`, 1080 / 2, startY + (i * lineHeight));
  }
  
  // 6. Pie de Página Literario
  ctx.fillStyle = '#C9A96E';
  ctx.font = "20px 'EB Garamond', serif";
  ctx.fillText("♦", 1080 / 2, startY + totalTextHeight + 100);
  
  ctx.fillStyle = '#1C1C1A';
  ctx.font = "bold 32px 'Playfair Display', 'EB Garamond', serif";
  ctx.fillText(bookTitle.toUpperCase(), 1080 / 2, startY + totalTextHeight + 160);
  
  ctx.fillStyle = '#C9A96E';
  ctx.font = "italic 26px 'EB Garamond', Georgia, serif";
  ctx.fillText(`Capítulo ${chapterNum}`, 1080 / 2, startY + totalTextHeight + 210);
  
  // Enlace Web discreto de ultra lujo
  ctx.fillStyle = 'rgba(28, 28, 26, 0.4)';
  ctx.font = "22px 'Inter', sans-serif";
  ctx.fillText("timeless-editorial.onrender.com", 1080 / 2, 1780);
}

function shareQuoteCard(hl) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  
  // Esperar a que las fuentes estén listas antes de dibujar
  document.fonts.ready.then(() => {
    drawQuoteCard(canvas, hl.text, state.book.title, hl.chapter + 1);
    
    const dataUrl = canvas.toDataURL('image/png');
    
    // Crear y mostrar modal
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'modal-overlay visible';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 420px; padding: 25px;">
        <h3 style="font-family: var(--font-serif); font-size: 20px; margin-bottom: 5px;">Comparte tu frase favorita</h3>
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 15px;">Guarda la imagen premium para subirla a tu Historia de Instagram.</p>
        
        <img src="${dataUrl}" class="share-preview-img" style="max-height: 48vh; border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.15);" />
        
        <div class="share-actions" style="margin-top: 15px; display: flex; gap: 10px; justify-content: center;">
          <button id="btn-share-native" class="btn-gift-premium" style="margin: 0; padding: 10px 20px; font-size: 13px; border-radius: 8px;">Compartir</button>
          <a href="${dataUrl}" download="Timeless_Frase_${hl.id}.png" id="btn-download-img" class="btn-nav" style="margin: 0; padding: 10px 20px; font-size: 13px; border-radius: 8px; text-decoration: none; display: inline-block; line-height: 1.4; border: 1px solid var(--border); color: var(--text-primary);">Descargar</a>
        </div>
        
        <button class="btn-close-modal" id="btn-close-share" style="margin-top: 15px; font-size: 12px; opacity: 0.6; background: none; border: none; cursor: pointer; color: var(--text-primary);">Cerrar</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Acción de compartir nativa (iOS/Android)
    $('btn-share-native').onclick = async () => {
      try {
        const file = dataURLtoFile(dataUrl, `Timeless_Frase_${hl.id}.png`);
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Timeless Frase Compartida',
            text: `"${hl.text}" — Leído en Timeless Editorial`
          });
        } else {
          // Fallback si no admite compartir archivos directamente
          await navigator.share({
            title: 'Timeless Frase Compartida',
            text: `"${hl.text}" — Leído en Timeless Editorial: ${window.location.origin}`,
            url: window.location.origin
          });
        }
      } catch (err) {
        // Si el usuario cancela o no se admite
        console.warn("Fallo al compartir:", err);
      }
    };
    
    $('btn-close-share').onclick = () => {
      modal.remove();
    };
  });
}

function dataURLtoFile(dataurl, filename) {
  var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
  bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, {type:mime});
}

function applyHighlightsToDOM() {
  const container = document.querySelector('.reading-body');
  if (!container || !state.highlights.length) return;

  const currentChHls = state.highlights.filter(h => h.chapter === state.currentChapter);
  if (currentChHls.length === 0) return;

  const paragraphs = container.querySelectorAll('p');
  paragraphs.forEach(p => {
    let text = p.innerHTML;
    currentChHls.forEach(h => {
      if (text.includes(h.text) && !text.includes(`data-id="${h.id}"`)) {
        const escapedText = h.text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedText})`, 'g');
        text = text.replace(regex, `<span class="highlighted-text" data-id="${h.id}">$1</span>`);
      }
    });
    p.innerHTML = text;
  });

  // Bind click listener on all newly inserted spans to offer deletion option
  container.querySelectorAll('.highlighted-text').forEach(span => {
    span.onclick = () => {
      const hlId = span.dataset.id;
      const hl = state.highlights.find(x => x.id === hlId);
      if (hl && confirm(`¿Deseas eliminar este subrayado?\n\n"${hl.text}"`)) {
        deleteHighlight(hlId);
      }
    };
  });
}

async function deleteHighlight(hlId) {
  if (!auth.currentUser) return;
  try {
    const ref = doc(db, 'users', auth.currentUser.uid, 'highlights', hlId);
    await deleteDoc(ref);
    state.highlights = state.highlights.filter(h => h.id !== hlId);
    renderNotesPanel();
    
    // Remove dynamic highlight element from DOM without reloading page
    const container = document.querySelector('.reading-body');
    if (container) {
      const span = container.querySelector(`span.highlighted-text[data-id="${hlId}"]`);
      if (span) {
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
      }
    }
  } catch (e) {
    console.error("Error deleting highlight:", e);
    alert("Error al eliminar subrayado");
  }
}

// Tooltip logic
const tooltip = $('highlight-tooltip');
const btnAdd = $('btn-add-highlight');
let currentSelection = '';

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (sel.isCollapsed || sel.toString().trim() === '') {
    tooltip.classList.remove('visible');
    return;
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  tooltip.style.left = `${rect.left + (rect.width / 2)}px`;
  tooltip.style.top = `${rect.top - 40 + window.scrollY}px`;
  tooltip.classList.add('visible');
  currentSelection = sel.toString().trim();
});

btnAdd.onclick = async () => {
  if (!currentSelection || !auth.currentUser) return;
  tooltip.classList.remove('visible');
  
  try {
    const hl = {
      bookId: state.bookId,
      chapter: state.currentChapter,
      text: currentSelection,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, 'users', auth.currentUser.uid, 'highlights'), hl);
    state.highlights.push({ id: docRef.id, ...hl });
    renderNotesPanel();
    
    // Quick visual feedback
    const sel = window.getSelection();
    if (!sel.isCollapsed) {
      const span = document.createElement('span');
      span.className = 'highlighted-text';
      span.textContent = currentSelection;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(span);
      sel.removeAllRanges();
    }
  } catch (e) {
    alert("Error al guardar subrayado");
  }
};

// ── Settings Management ──────────────────────────────────────────────────────
const updateUI = () => {
  document.body.setAttribute('data-theme', state.theme);
  document.documentElement.style.setProperty('--font-size', state.fontSize + 'px');
  document.documentElement.style.setProperty('--line-height', state.lineHeight);
  document.documentElement.style.setProperty('--reading-width', state.readingWidth);
  $('fs-val').textContent = state.fontSize + 'px';
  
  // Update Reading Body Class
  const body = document.querySelector('.reading-body');
  if (body) {
    body.className = `reading-body font-${state.fontFamily}`;
  }

  // Active States in Settings
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === state.theme);
  });
  
  // Active state for font families
  document.querySelectorAll('.font-option[data-font]').forEach(b => {
    b.classList.toggle('active', b.dataset.font === state.fontFamily);
  });

  // Active state for line heights
  document.querySelectorAll('.font-option[data-lh]').forEach(b => {
    b.classList.toggle('active', b.dataset.lh === state.lineHeight);
  });

  // Active state for column widths
  document.querySelectorAll('.font-option[data-w]').forEach(b => {
    b.classList.toggle('active', b.dataset.w === state.readingWidth);
  });
};

// Event Listeners for Settings
document.querySelectorAll('.theme-btn').forEach(b => {
  b.onclick = () => {
    state.theme = b.dataset.theme;
    localStorage.setItem('tl_theme', state.theme);
    updateUI();
  };
});

document.querySelectorAll('.font-option[data-font]').forEach(b => {
  b.onclick = () => {
    state.fontFamily = b.dataset.font;
    localStorage.setItem('tl_font', state.fontFamily);
    updateUI();
  };
});

document.querySelectorAll('.font-option[data-lh]').forEach(b => {
  b.onclick = () => {
    state.lineHeight = b.dataset.lh;
    localStorage.setItem('tl_lineHeight', state.lineHeight);
    updateUI();
  };
});

document.querySelectorAll('.font-option[data-w]').forEach(b => {
  b.onclick = () => {
    state.readingWidth = b.dataset.w;
    localStorage.setItem('tl_readingWidth', state.readingWidth);
    updateUI();
  };
});

$('btn-fs-dec').onclick = () => {
  if (state.fontSize > 12) {
    state.fontSize--;
    localStorage.setItem('tl_fontSize', state.fontSize);
    updateUI();
  }
};

$('btn-fs-inc').onclick = () => {
  if (state.fontSize < 40) {
    state.fontSize++;
    localStorage.setItem('tl_fontSize', state.fontSize);
    updateUI();
  }
};

// ── Gift Generation ──────────────────────────────────────────────────────────
async function generateGift() {
  if (!auth.currentUser) {
    alert("Debes iniciar sesión para regalar una obra.");
    return;
  }

  const note = prompt("Añade una nota personal para tu invitado (opcional):", "Leí esto y pensé en ti.");
  
  const btn = $('btn-gift-action');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generando obsequio...";
  }

  try {
    const giftId = `gift_${state.bookId}_${Math.random().toString(36).substring(2, 9)}`;
    const giftRef = doc(db, "gifts", giftId);
    
    await setDoc(giftRef, {
      bookId: state.bookId,
      bookTitle: state.book.title,
      fromUserId: auth.currentUser.uid,
      fromName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
      personalNote: note,
      claimed: false,
      createdAt: serverTimestamp()
    });

    const giftUrl = `${window.location.origin}${window.location.pathname}?gift=${giftId}`;
    
    // Mostrar modal con el link
    showGiftModal(giftUrl);

  } catch (e) {
    console.error("Error generating gift:", e);
    alert("No se pudo generar el regalo. Inténtalo de nuevo.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Regalar esta obra";
    }
  }
}

function showGiftModal(url) {
  const modal = document.createElement('div');
  modal.id = 'gift-modal';
  modal.className = 'modal-overlay visible';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="gift-modal-header">
        <span class="gift-icon-large">🎁</span>
        <h2>¡Gesto literario completado!</h2>
        <p>Comparte este link con alguien especial para que pueda leer esta obra gratuitamente.</p>
      </div>
      <div class="gift-link-wrap">
        <input type="text" id="gift-url-input" value="${url}" readonly />
        <button id="btn-copy-gift">Copiar</button>
      </div>
      <p class="gift-hint">Recuerda: El destinatario podrá leer la obra completa una vez iniciada su sesión.</p>
      <button class="btn-close-modal" id="btn-close-gift">Cerrar</button>
    </div>
  `;
  document.body.appendChild(modal);

  $('btn-copy-gift').onclick = () => {
    $('gift-url-input').select();
    document.execCommand('copy');
    $('btn-copy-gift').textContent = "¡Copiado!";
    setTimeout(() => $('btn-copy-gift').textContent = "Copiar", 2000);
  };

  $('btn-close-gift').onclick = () => {
    modal.remove();
  };
}

// ── Timer & Auth ─────────────────────────────────────────────────────────────
setInterval(() => {
  const elapsed = Math.floor((Date.now() - state.start) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = (elapsed % 60).toString().padStart(2, '0');
  $('timer-val').textContent = `${mins}:${secs}`;
  $('reading-timer').classList.toggle('visible', elapsed > 10);
  
  // Mostrar botón de regalo al final del libro o después de un tiempo de lectura
  if (state.currentChapter === state.book.chapters.length - 1 && elapsed > 30) {
    showGiftCTA();
  }
}, 1000);

function showGiftCTA() {
  if ($('gift-cta')) return;
  const cta = document.createElement('div');
  cta.id = 'gift-cta';
  cta.className = 'gift-cta-container reveal';
  cta.innerHTML = `
    <div class="gift-cta-content">
      <h3>¿Disfrutaste la lectura?</h3>
      <p>Comparte la magia de Timeless regalando una invitación de lectura a un amigo.</p>
      <button id="btn-gift-action" class="btn-gift-premium">
        <span class="gift-icon">🎁</span> Regalar esta obra
      </button>
    </div>
  `;
  $('reading-content').appendChild(cta);
  setTimeout(() => cta.classList.add('in-view'), 100);
  
  $('btn-gift-action').onclick = generateGift;
}

function saveAuthTokenToIndexedDB(token) {
  return openOfflineDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_keys', 'readwrite');
      tx.objectStore('offline_keys').put({ bookId: '_user_token', license: token, expiresAt: Date.now() + 55 * 60 * 1000 }); // 55 min
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  });
}

onAuthStateChanged(auth, async (u) => {
  if (u) {
    try {
      const token = await u.getIdToken();
      await saveAuthTokenToIndexedDB(token);
      console.log("  ✦ [PWA] Token JWT guardado en IndexedDB para Background Sync desde Reader.");
    } catch(e) {
      console.warn("No se pudo guardar el token JWT en IndexedDB:", e.message);
    }
  }
  if (u || new URLSearchParams(window.location.search).get('gift')) loadBook();
  else window.location.href = 'index.html';
});

// Init
updateUI();
