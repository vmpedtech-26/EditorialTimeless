'use strict';

// ── Timeless Editorial · Servidor Local ────────────────────────────────────
// Proxy seguro entre el navegador y la Gemini API de Google.
// La API Key nunca sale del servidor — el cliente nunca la ve.
//
// Uso:
//   1. cp .env.example .env  →  añade tu GEMINI_API_KEY
//   2. npm install
//   3. npm start             →  abre http://localhost:3000/agent.html

const express = require('express');
const path    = require('path');
const admin   = require('firebase-admin');
const crypto  = require('crypto');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app  = express();

// Cabeceras de seguridad. Los onclick="" inline que antes forzaban a desactivar
// el CSP fueron eliminados (delegación de eventos vía addEventListener), así
// que script-src ya no necesita 'unsafe-inline': los pocos <script> estáticos
// que quedan (registro del Service Worker, banner de cookies, IIFE de reveal
// en architecture.html) se permiten por hash SHA-256 exacto. style-src sí
// mantiene 'unsafe-inline' porque hay decenas de atributos style="" legítimos
// (colores/layout dinámicos) cuyo refactor no aporta valor de seguridad real.
app.set('trust proxy', 1);
const SW_REGISTER_HASH   = "'sha256-02bmHLdKc5I7lm5BdooABRuv82llZtNQ96BEpm8RF08='";
const COOKIE_BANNER_HASH = "'sha256-T9/M+rSmnfgaS19VCgA0R1oa8Egt0FGbiFzylWRZuRg='";
const REVEAL_IIFE_HASH   = "'sha256-eaC1xasMvnBDsbpcC48jK0yMk4F42Mm+cwV0I5Pt5Xg='";
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://www.gstatic.com', 'https://cdnjs.cloudflare.com', SW_REGISTER_HASH, COOKIE_BANNER_HASH, REVEAL_IIFE_HASH],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
      connectSrc: ["'self'", 'https://*.googleapis.com'],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      // El login con Google (signInWithPopup) depende de un iframe oculto
      // que Firebase Auth carga desde authDomain para comunicar el popup
      // con la página principal. Sin esto cae a default-src 'self' y el
      // iframe se bloquea silenciosamente -> signInWithPopup falla con
      // auth/internal-error (sin ningún error de CSP explícito en consola).
      frameSrc: ["'self'", 'https://timeless-5d27d.firebaseapp.com']
    }
  },
  crossOriginEmbedderPolicy: false,
  // 'same-origin' (el default de helmet) rompe el login por popup de Google
  // (signInWithPopup) porque aísla la ventana del popup del opener.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

const PORT = parseInt(process.env.PORT || '3000', 10);
const KEY  = process.env.GEMINI_API_KEY || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Atajos de desarrollo (webhooks sin firma, checkout simulado, premium ante
// errores de Firestore) SOLO con TIMELESS_DEV=true explícito. Antes dependían de
// DLOCAL_SANDBOX/NODE_ENV: producción corría con DLOCAL_SANDBOX sin definir
// (=sandbox), así que cualquiera podía mandar un webhook "PAID" falso y quedar
// premium gratis.
const DEV_MODE = process.env.TIMELESS_DEV === 'true';
const ADMIN_EMAIL = 'matiaseorejas@gmail.com';
// Salto DRM: se expone a través de /api/config porque el cliente descifra en el navegador
// y necesita el mismo valor para derivar la llave. Ver assets/js/reader.js.
const DRM_SALT = process.env.DRM_MASTER_SECRET || 'Timeless_Editorial_Premium_Ecosystem_2024';

// Cargar catálogo fallback para streaming fuera de línea (Pilar 5)
let FALLBACK_BOOKS = [];
try {
  FALLBACK_BOOKS = require('./fallback_catalog.json');
} catch (e) {
  console.warn("  ⚠  No se pudo cargar el archivo fallback_catalog.json en el servidor.");
}

// Configuración dLocal Go
const DLOCAL_LOGIN = process.env.DLOCAL_LOGIN || '';
const DLOCAL_TRANS_KEY = process.env.DLOCAL_TRANS_KEY || '';
const DLOCAL_SECRET_KEY = process.env.DLOCAL_SECRET_KEY || '';
const DLOCAL_SANDBOX = process.env.DLOCAL_SANDBOX !== 'false';
const DLOCAL_BASE_URL = DLOCAL_SANDBOX
  ? 'https://api-sbx.dlocalgo.com'
  : 'https://api.dlocalgo.com';

if (!DLOCAL_LOGIN || !DLOCAL_TRANS_KEY || !DLOCAL_SECRET_KEY) {
  console.warn('  ⚠  dLocal Go: Credenciales incompletas en el archivo .env. Pasarela dLocal Go inactiva.');
}

// En producción no se devuelven mensajes internos de excepciones (rutas,
// detalles de Firestore/Gemini) al cliente; en local sí, para depurar.
function publicErr(err) {
  return DEV_MODE ? ((err && err.message) || "Error") : "Error interno del servidor.";
}

// Compara dos strings en tiempo constante para evitar timing attacks al
// verificar firmas HMAC (una comparación con !== filtra, byte a byte, en
// cuánto tarda en fallar, cuántos caracteres iniciales son correctos).
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    // Igual comparamos algo de longitud fija para no filtrar la longitud
    // real de forma aún más barata que un simple .length check.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Helper para generar firmas de dLocal
function generateDLocalSignature(xLogin, xDate, requestBody, secretKey) {
  const bodyString = typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody);
  const dataToSign = xLogin + xDate + bodyString;
  return crypto
    .createHmac('sha256', secretKey)
    .update(dataToSign)
    .digest('hex');
}


const MODEL = 'gemini-2.5-flash';
const GEMINI = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`;

// ── Firebase Admin Init ──────────────────────────────────────────────────────
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    serviceAccount = require('./serviceAccountKey.json');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (err) {
  console.warn('  ⚠  Firebase Admin: Credenciales no encontradas (.env o serviceAccountKey.json). Funciones de admin limitadas.');
}


// ── Startup checks ──────────────────────────────────────────────────────────
if (!KEY || KEY === 'pega_tu_api_key_aqui') {
  console.error('\n  ✗  ERROR: GEMINI_API_KEY no configurada.');
  console.error('     Edita el archivo .env y añade tu key de https://aistudio.google.com/app/apikey\n');
  process.exit(1);
}

// ── Endpoint: webhook de dLocal Go (debe ir ANTES de express.json() para leer el body crudo)
app.post('/api/webhook/dlocal', express.raw({type: 'application/json'}), async (req, res) => {
  const xDate = req.headers['x-date'] || req.headers['X-Date'] || '';
  const sigHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  
  if (!DLOCAL_SECRET_KEY) {
    console.warn('  ⚠ [dLocal Webhook] Recibido webhook de dLocal, pero dLocal no está configurado.');
    return res.status(500).send("dLocal no configurado en el servidor");
  }

  const rawBody = req.body.toString('utf8');
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).send("JSON de payload inválido");
  }

  // La firma es obligatoria y se compara en tiempo constante. Solo en modo
  // desarrollo explícito (TIMELESS_DEV=true) se toleran webhooks sin firmar.
  let signatureOk = false;
  if (sigHeader && sigHeader.includes('Signature:')) {
    const receivedSig = sigHeader.split('Signature:')[1].trim();
    const computedSig = generateDLocalSignature(DLOCAL_LOGIN, xDate, rawBody, DLOCAL_SECRET_KEY);
    signatureOk = safeCompare(receivedSig, computedSig);
  }
  if (!signatureOk) {
    console.error('  ✗ [dLocal Webhook] Firma ausente o inválida.');
    if (!DEV_MODE) {
      return res.status(400).send("Firma inválida");
    }
    console.warn('  ⚠ [dLocal Webhook] TIMELESS_DEV=true: se tolera la firma inválida.');
  }

  const status = payload.status;
  const orderId = payload.order_id;
  const paymentId = payload.id;

  console.log(`  ✦ [dLocal Webhook] Recibido evento. ID: ${paymentId}, Estado: ${status}, Order ID: ${orderId}`);

  if ((status === 'PAID' || status === 'APPROVED') && orderId) {
    // order_id se arma como `${userId}_${planId}_${timestamp}` en /api/create-checkout-session
    const orderParts = String(orderId).split('_');
    const userId = orderParts[0];
    const planId = ['monthly', 'annual', 'family'].includes(orderParts[1]) ? orderParts[1] : 'annual';

    const plan = PLAN_CATALOG[planId];
    const paidAmount = Number(payload.amount);
    if (Number.isFinite(paidAmount) && paidAmount > 0 && paidAmount < plan.price) {
      console.error(`  ✗ [dLocal Webhook] Monto insuficiente (${paidAmount} < ${plan.price}) para ${planId}. No se activa premium. Pago: ${paymentId}`);
      return res.json({ received: true });
    }

    console.log(`  ✦ [dLocal Webhook] Pago APROBADO. Activando premium para usuario: ${userId} (plan: ${planId})`);

    if (admin.apps.length > 0) {
      try {
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        const current = await userRef.get();
        if (current.exists && current.data().lastPaymentId === paymentId) {
          // dLocal reintenta las notificaciones: no extender el plan dos veces.
          return res.json({ received: true });
        }
        // Si todavía tiene días vigentes, la renovación se suma al final.
        const prev = current.exists ? current.data() : {};
        const prevUntil = subscriptionActive(prev) && prev.premiumUntil && prev.premiumUntil.toMillis ? prev.premiumUntil.toMillis() : 0;
        const baseMs = Math.max(Date.now(), prevUntil);
        const premiumUntil = admin.firestore.Timestamp.fromMillis(baseMs + plan.days * 86400000);

        await userRef.set({
          isPremium: true,
          subscriptionDate: admin.firestore.FieldValue.serverTimestamp(),
          premiumUntil,
          lastPaymentId: paymentId,
          plan: `${planId}_dlocal`
        }, { merge: true });
        localPremiumUsers.add(userId);
        console.log(`  ✦ [Firestore] Suscripción dLocal Go activada para ${userId} hasta ${premiumUntil.toDate().toISOString()}`);
        if (planId === 'family') {
          await ensureFamilyForOwner(userId, null);
        }
      } catch (dbErr) {
        console.error('  ✗ [dLocal Webhook Error] Fallo al escribir en Firestore:', dbErr);
        // 500 para que dLocal reintente la notificación: un pago cobrado no puede quedar sin activar.
        return res.status(500).send("Error interno");
      }
    } else {
      console.warn('  ⚠ [dLocal Webhook] ERROR: Firebase Admin no inicializado.');
      return res.status(500).send("Error interno");
    }
  }

  res.json({ received: true });
});


// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// Rate limiting general para la API (los webhooks ya quedaron registrados
// arriba, antes de este middleware, así que no les aplica: no queremos
// descartar entregas legítimas de dLocal por límite de tasa).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Demasiadas solicitudes. Por favor, intenta de nuevo en unos minutos." } }
});
app.use('/api/', (req, res, next) => {
  if (req.path === '/health' || req.path === '/config') return next();
  return apiLimiter(req, res, next);
});

// Límite más estricto para el formulario público de arrepentimiento (sin
// autenticación) y para iniciar checkouts, dos superficies propensas a abuso.
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Demasiadas solicitudes. Por favor, intenta de nuevo más tarde." } }
});
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Demasiados intentos de pago. Por favor, intenta de nuevo más tarde." } }
});

// El proyecto vive en un solo directorio junto con el backend, así que servir
// todo con express.static expone también código de servidor, scripts de seed y
// configuración. En vez de una lista de bloqueo (que siempre se queda corta
// cuando aparece un archivo nuevo — así quedaron server.js y seed_library_ai.js
// descargables), se sirve SOLO una lista de permitidos explícita.
const PUBLIC_STATIC = /^\/(assets\/.+|(index|reader|agent|admin|architecture|privacy|terms)\.html|sw\.js|manifest\.json|firebase_config\.js|agent_service\.js|prompts\.js|fallback_catalog\.json|kids_fallback_catalog\.json)$/;
const staticHandler = express.static(path.join(__dirname), { dotfiles: 'deny', index: 'index.html' });
app.use((req, res, next) => {
  if (req.path === '/' || PUBLIC_STATIC.test(req.path)) return staticHandler(req, res, next);
  next();
});

// Precios y duración de cada plan: los define el servidor. Antes el monto del
// pago salía de `unit_price` que mandaba el navegador, así que cualquiera podía
// pagar $0,01 por el plan anual. Debe coincidir con index.html y terms.html.
const PLAN_CATALOG = {
  monthly: { price: 12, days: 31,  label: 'Plan Mensual' },
  annual:  { price: 89, days: 366, label: 'Plan Anual' },
  family:  { price: 18, days: 31,  label: 'Plan Familiar' }
};

// ¿Sigue vigente la suscripción de este doc de usuario? Los usuarios
// anteriores al control de vencimiento (sin premiumUntil) siguen vigentes.
function subscriptionActive(userData) {
  if (!userData || !userData.isPremium) return false;
  if (!userData.premiumUntil) return true;
  const until = typeof userData.premiumUntil.toMillis === 'function' ? userData.premiumUntil.toMillis() : Number(userData.premiumUntil);
  return !Number.isFinite(until) || until > Date.now();
}

// Caché local para usuarios Premium (evita relecturas repetidas a Firestore)
const localPremiumUsers = new Set();
// El caché evita releer Firestore en cada request, pero se vacía seguido para
// que vencimientos y revocaciones se apliquen en minutos.
setInterval(() => localPremiumUsers.clear(), 10 * 60 * 1000).unref();

// Middleware que solo verifica el token de Firebase, sin exigir estado Premium.
// Para endpoints a los que un usuario no-premium debe poder llegar, como el
// propio checkout que lo va a convertir en premium.
async function verifyToken(req, res, next) {
  if (!admin.apps.length) return res.status(500).json({ error: { message: "Firebase Admin no inicializado" }});

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: "Falta token de autorización Bearer" }});
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (err) {
    console.error("  ✗ [verifyToken] Token inválido o expirado:", err.message);
    return res.status(401).json({ error: { message: "Token inválido o expirado" }});
  }
}

const FAMILY_MAX_MEMBERS = 6;

// Un usuario es premium por sí mismo (isPremium) o por pertenecer a un Plan
// Familiar activo (familyId apunta a una familia cuyo memberIds lo incluye).
async function isPremiumViaFamily(uid) {
  try {
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(uid).get();
    const familyId = userSnap.exists ? userSnap.data().familyId : null;
    if (!familyId) return false;
    const familySnap = await db.collection('families').doc(familyId).get();
    if (!familySnap.exists) return false;
    const fam = familySnap.data();
    if (!Array.isArray(fam.memberIds) || !fam.memberIds.includes(uid)) return false;
    // Los miembros solo tienen acceso mientras el titular tenga el plan vigente.
    const ownerSnap = await db.collection('users').doc(fam.ownerId).get();
    return ownerSnap.exists && subscriptionActive(ownerSnap.data());
  } catch (e) {
    return false;
  }
}

// Crea la familia del Plan Familiar para su titular si todavía no tiene una.
async function ensureFamilyForOwner(uid, ownerEmail) {
  const db = admin.firestore();
  const userSnap = await db.collection('users').doc(uid).get();
  if (userSnap.exists && userSnap.data().familyId) {
    return userSnap.data().familyId;
  }
  const familyRef = db.collection('families').doc();
  await familyRef.set({
    ownerId: uid,
    ownerEmail: ownerEmail || '',
    memberIds: [uid],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await db.collection('users').doc(uid).set({ familyId: familyRef.id }, { merge: true });
  return familyRef.id;
}

// ¿Tiene este usuario acceso premium? (titular, familiar o editor). En
// producción un error de Firestore nunca otorga acceso; en desarrollo local sí.
async function checkPremium(decodedToken) {
  const uid = decodedToken.uid;
  let isPremium = localPremiumUsers.has(uid) || decodedToken.email === ADMIN_EMAIL;

  if (!isPremium) {
    try {
      const userSnap = await admin.firestore().collection('users').doc(uid).get();
      if (userSnap.exists && subscriptionActive(userSnap.data())) {
        isPremium = true;
      } else {
        if (userSnap.exists && userSnap.data().isPremium) {
          // Suscripción vencida: se baja el flag para que la UI también lo refleje.
          admin.firestore().collection('users').doc(uid).set({ isPremium: false }, { merge: true })
            .catch(e => console.warn('  ⚠ [checkPremium] No se pudo marcar vencida:', e.message));
        }
        if (userSnap.exists && userSnap.data().familyId) {
          isPremium = await isPremiumViaFamily(uid);
        }
      }
      if (isPremium) localPremiumUsers.add(uid);
    } catch (dbErr) {
      console.error(`  ✗ [checkPremium] Error al leer Firestore (${dbErr.message}).`);
      if (DEV_MODE) {
        console.warn('  ⚠ [checkPremium] Modo desarrollo: habilitando acceso temporal pese al error.');
        isPremium = true;
        localPremiumUsers.add(uid);
      }
    }
  }
  return isPremium;
}

// Acceso a los capítulos de un libro: premium, o un regalo ya reclamado de
// ESE libro (gifts/gift_<libro>_<uid>, que escribe claimGift en el lector).
async function chunkAccessMiddleware(req, res, next) {
  if (!admin.apps.length) return res.status(500).json({ error: { message: "Firebase Admin no inicializado" }});
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: "Falta token de autorización Bearer" }});
  }
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    if (await checkPremium(decoded)) { req.user = decoded; return next(); }

    const giftSnap = await admin.firestore().collection('gifts').doc(`gift_${req.params.id}_${decoded.uid}`).get();
    if (giftSnap.exists && giftSnap.data().claimed === true && giftSnap.data().bookId === req.params.id) {
      req.user = decoded;
      return next();
    }
    return res.status(403).json({ error: { message: "Suscripción activa requerida para lectura Premium." }});
  } catch (err) {
    console.error("  ✗ [ChunkAccess] Token inválido o error:", err.message);
    return res.status(401).json({ error: { message: "Token inválido o expirado" }});
  }
}

// Middleware para verificar token de Firebase y estado Premium
async function authMiddleware(req, res, next) {
  if (!admin.apps.length) return res.status(500).json({ error: { message: "Firebase Admin no inicializado" }});
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: "Falta token de autorización Bearer" }});
  }
  
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    
    let isPremium = await checkPremium(decodedToken);

    // Si sigue sin ser premium, denegar
    if (!isPremium) {
      return res.status(403).json({ error: { message: "Requiere suscripción activa para usar Timeless Agent" }});
    }
    
    // Verificar límite de uso mensual (silencioso si falla Firestore)
    let wordsUsed = 0;
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-06"
      const usageDoc = await admin.firestore().collection('users').doc(uid).collection('usage').doc(currentMonth).get();
      if (usageDoc.exists) {
        wordsUsed = usageDoc.data().wordsUsed || 0;
      }
    } catch (usageErr) {
      // Ignorar error de uso en sandbox
    }
    
    const LIMIT = 500000;
    if (wordsUsed >= LIMIT && decodedToken.email !== ADMIN_EMAIL) {
      return res.status(429).json({ error: { message: `Has alcanzado el límite mensual de generación de IA (${LIMIT.toLocaleString()} palabras).` }});
    }
    
    req.user = decodedToken;
    next();
  } catch (err) {
    console.error("  ✗ [AuthMiddleware] Token inválido o expirado:", err.message);
    return res.status(401).json({ error: { message: "Token inválido o expirado" }});
  }
}

// ── Endpoint: generación normal (outline, BSC) ───────────────────────────────
app.post('/api/generate', authMiddleware, async (req, res) => {
  try {
    const upstream = await fetch(`${GEMINI}:generateContent?key=${KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json(data);
    }
    
    // Contar y registrar palabras de la respuesta
    const textGenerated = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const wordsCount = textGenerated.split(/\s+/).filter(Boolean).length;
    
    if (wordsCount > 0 && req.user) {
      const uid = req.user.uid;
      const currentMonth = new Date().toISOString().slice(0, 7);
      const usageRef = admin.firestore().collection('users').doc(uid).collection('usage').doc(currentMonth);
      await usageRef.set({
        wordsUsed: admin.firestore.FieldValue.increment(wordsCount),
        lastRequestAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(err => console.error("Error al registrar palabras en generate:", err));
    }
    
    res.json(data);

  } catch (err) {
    console.error('[/api/generate]', err.message);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

// ── Endpoint: streaming SSE (capítulo) ───────────────────────────────────────
app.post('/api/stream', authMiddleware, async (req, res) => {
  // Headers para Server-Sent Events
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // evita buffering en nginx

  try {
    const upstream = await fetch(`${GEMINI}:streamGenerateContent?alt=sse&key=${KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      const msg = err.error?.message || `HTTP ${upstream.status}`;
      res.write(`data: ${JSON.stringify({ error: { message: msg } })}\n\n`);
      return res.end();
    }

    // Pipe transparente: Gemini SSE → cliente SSE
    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkStr = decoder.decode(value, { stream: true });
      accumulatedText += chunkStr;
      res.write(chunkStr);
    }
    
    // Contar y registrar palabras del streaming al finalizar
    let wordsCount = 0;
    try {
      const lines = accumulatedText.split('\n');
      let textBuffer = "";
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            const txt = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (txt) textBuffer += txt;
          } catch(e) {}
        }
      }
      wordsCount = textBuffer.split(/\s+/).filter(Boolean).length;
    } catch (e) {
      console.warn("No se pudo parsear texto acumulado para contar palabras en stream:", e.message);
    }

    if (wordsCount > 0 && req.user) {
      const uid = req.user.uid;
      const currentMonth = new Date().toISOString().slice(0, 7);
      const usageRef = admin.firestore().collection('users').doc(uid).collection('usage').doc(currentMonth);
      await usageRef.set({
        wordsUsed: admin.firestore.FieldValue.increment(wordsCount),
        lastRequestAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(err => console.error("Error al registrar palabras en stream:", err));
    }

    res.end();
  } catch (err) {
    console.error('[/api/stream]', err.message);
    try {
      res.write(`data: ${JSON.stringify({ error: { message: publicErr(err) } })}\n\n`);
    } catch(e) {}
    res.end();
  }
});


// ── CACHÉ DE SERVIDOR (Pilar 5) ──────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const serverCache = {
  books: new Map(),
  catalog: null,
  catalogTimestamp: 0
};

async function getCachedCatalog() {
  const now = Date.now();
  if (serverCache.catalog && (now - serverCache.catalogTimestamp < CACHE_TTL)) {
    return serverCache.catalog;
  }
  
  if (admin.apps.length > 0) {
    try {
      const db = admin.firestore();
      const snap = await db.collection("books").get();
      const books = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      serverCache.catalog = books;
      serverCache.catalogTimestamp = now;
      return books;
    } catch (err) {
      console.warn("  ⚠ [Caché Servidor] Fallo al renovar catálogo desde Firestore:", err.message);
    }
  }
  
  return FALLBACK_BOOKS;
}

// ── IN-MEMORY TELEMETRÍA Y BUFFER (Pilar 2) ──────────────────────────────────
const telemetryBuffer = [];
const telemetryFLUSH_LIMIT = IS_PRODUCTION ? 25 : 5; // en local se vacía rápido para probar
const TELEMETRY_BUFFER_MAX = 2000; // si Firestore falla en bucle, no crecer sin límite

async function flushTelemetry() {
  if (telemetryBuffer.length === 0 || admin.apps.length === 0) return;
  const eventsToFlush = [...telemetryBuffer];
  telemetryBuffer.length = 0;
  
  try {
    const db = admin.firestore();
    // Firestore admite máx. 500 operaciones por batch.
    for (let i = 0; i < eventsToFlush.length; i += 400) {
      const batch = db.batch();
      eventsToFlush.slice(i, i + 400).forEach(evt => {
        batch.set(db.collection('telemetry_logs').doc(), {
          ...evt,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
    console.log(`  ✦ [Telemetría] Flusheados ${eventsToFlush.length} eventos a Firestore.`);
  } catch (err) {
    console.error("  ✗ [Telemetría Error] Fallo al vaciar buffer de telemetría:", err.message);
    telemetryBuffer.push(...eventsToFlush); // Re-encolar en caso de fallo
    if (telemetryBuffer.length > TELEMETRY_BUFFER_MAX) telemetryBuffer.splice(0, telemetryBuffer.length - TELEMETRY_BUFFER_MAX);
  }
}

// ── Endpoint: Streaming & Cifrado AES-256-CBC (Pilar 1) ───────────────────────
app.get('/api/book/:id/chunk/:index', chunkAccessMiddleware, async (req, res) => {
  try {
    const { id, index } = req.params;
    const chIndex = parseInt(index, 10);
    
    // Obtener catálogo desde caché
    const catalog = await getCachedCatalog();
    let book = catalog.find(b => b.id === id);
    
    if (!book && admin.apps.length > 0) {
      const db = admin.firestore();
      const docSnap = await db.collection('obras').doc(id).get();
      if (docSnap.exists) book = docSnap.data();
    }
    
    if (!book) {
      return res.status(404).json({ error: { message: "Libro no encontrado" } });
    }

    let chapterText = "";

    // Fuente de verdad para la prosa completa: la colección books_full, que
    // firestore.rules bloquea por completo del lado del cliente (allow read,
    // write: if false) — solo el Admin SDK del servidor la lee. Antes la
    // prosa vivía embebida en el propio doc de books/obras, legible por
    // cualquier usuario autenticado vía el SDK cliente; se mantiene ese
    // camino viejo como fallback mientras se migra el catálogo existente.
    if (admin.apps.length > 0) {
      try {
        const fullDb = admin.firestore();
        const fullSnap = await fullDb.collection('books_full').doc(id).get();
        if (fullSnap.exists) {
          const fullChapters = fullSnap.data().chapters;
          if (Array.isArray(fullChapters) && fullChapters[chIndex]) {
            chapterText = fullChapters[chIndex];
          }
        }
      } catch (fullErr) {
        console.warn('  ⚠ [Chunk] Fallo al leer books_full, usando fallback:', fullErr.message);
      }
    }

    if (!chapterText) {
      if (Array.isArray(book.chapters) && book.chapters[chIndex]) {
        chapterText = book.chapters[chIndex];
      } else if (book.chaptersArray && book.chaptersArray[chIndex]) {
        chapterText = book.chaptersArray[chIndex];
      } else if (book.outline && book.outline.chapters && book.outline.chapters[chIndex]) {
        // Simulación de prosa si no está redactado en base
        chapterText = `<p>Las páginas de <em>${book.title}</em> revelaban una prosa madura y contemplativa.</p><p>El transcurso de los días en la narrativa nos recordaba el peso del tiempo y la levedad de la memoria.</p>`;
      } else {
        return res.status(404).json({ error: { message: "Capítulo no encontrado" } });
      }
    }
    
    // Cifrar contenido con AES-256-CBC (DRM Simulation)
    const algorithm = 'aes-256-cbc';
    const userId = req.user.uid;
    const password = DRM_SALT + userId + id;
    
    const key = crypto.createHash('sha256').update(password).digest();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(chapterText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    res.json({
      bookId: id,
      chapterIndex: chIndex,
      iv: iv.toString('hex'),
      data: encrypted
    });
  } catch (err) {
    console.error('[/api/book/:id/chunk/:index]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

// Valida y acota un evento de telemetría: bookId usable como ID de documento
// y números en rangos razonables. Devuelve null si el evento no sirve.
function sanitizeTelemetryEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bookId = typeof raw.bookId === 'string' ? raw.bookId : '';
  if (!bookId || bookId.length > 120 || bookId.includes('/')) return null;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  return {
    bookId,
    chapterIndex: clamp(parseInt(raw.chapterIndex, 10) || 0, 0, 500),
    timeSpent: clamp(parseInt(raw.timeSpent, 10) || 0, 0, 86400),
    scrollDepth: clamp(parseFloat(raw.scrollDepth) || 0, 0, 1),
    exitPoint: String(raw.exitPoint || '').slice(0, 100)
  };
}

// ── Endpoint: Telemetría de Lectura (Pilar 2) ────────────────────────────────
app.post('/api/telemetry', authMiddleware, async (req, res) => {
  try {
    const clean = sanitizeTelemetryEvent(req.body);
    if (!clean) return res.status(400).json({ error: { message: "Evento de telemetría inválido." } });
    const userId = req.user.uid;
    const event = { userId, ...clean, receivedAt: new Date().toISOString() };

    telemetryBuffer.push(event);
    if (telemetryBuffer.length >= telemetryFLUSH_LIMIT) {
      flushTelemetry();
    }

    // Guardar posición de lectura rápida en Firestore
    if (admin.apps.length > 0) {
      admin.firestore().collection('users').doc(userId).collection('reading_progress').doc(clean.bookId).set({
        chapterIndex: clean.chapterIndex,
        scrollDepth: clean.scrollDepth,
        lastReadAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(e => console.error("Error actualizando progreso:", e.message));
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[/api/telemetry]', err);
    res.status(500).json({ error: { message: "Error procesando telemetría." } });
  }
});

// ── Endpoint: Telemetría de Lectura Masiva (Bulk Offline Sync - Pilar 2) ──────
app.post('/api/telemetry/bulk', authMiddleware, async (req, res) => {
  try {
    if (!Array.isArray(req.body.events)) {
      return res.status(400).json({ error: { message: "Se esperaba un array de eventos en 'events'." } });
    }
    // Tope por request: cada evento puede implicar una escritura a Firestore.
    const events = req.body.events.slice(0, 100);
    const userId = req.user.uid;
    const db = admin.apps.length > 0 ? admin.firestore() : null;

    let accepted = 0;
    for (const rawEv of events) {
      const clean = sanitizeTelemetryEvent(rawEv);
      if (!clean) continue;
      accepted++;
      telemetryBuffer.push({ userId, ...clean, receivedAt: new Date().toISOString(), isOfflineSync: true });

      if (db) {
        db.collection('users').doc(userId).collection('reading_progress').doc(clean.bookId).set({
          chapterIndex: clean.chapterIndex,
          scrollDepth: clean.scrollDepth,
          lastReadAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(e => console.error("Error actualizando progreso en bulk:", e.message));
      }
    }

    if (telemetryBuffer.length >= telemetryFLUSH_LIMIT) {
      flushTelemetry();
    }

    res.json({ success: true, count: accepted });
  } catch (err) {
    console.error('[/api/telemetry/bulk]', err);
    res.status(500).json({ error: { message: "Error procesando telemetría." } });
  }
});

// ── Endpoint: Recomendaciones Semánticas y Test A/B de Portada (Pilar 3) ────
app.get('/api/recommendations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const catalog = await getCachedCatalog();
    
    // Perfil e intereses predeterminados
    let interests = ['ficcion', 'ensayo'];
    if (admin.apps.length > 0) {
      try {
        const db = admin.firestore();
        const userSnap = await db.collection('users').doc(userId).get();
        if (userSnap.exists && userSnap.data().interests) {
          interests = userSnap.data().interests;
        }
      } catch (e) {}
    }
    
    // Vectores temáticos simplificados para similitud vectorial (Simulando pgvector)
    const categoryVectors = {
      ficcion:      [0.9, 0.4, 0.2, 0.1, 0.3],
      ensayo:       [0.2, 0.9, 0.8, 0.2, 0.1],
      biografia:    [0.4, 0.3, 0.9, 0.1, 0.1],
      tecnica:      [0.1, 0.7, 0.1, 0.9, 0.2],
      comedia:      [0.8, 0.1, 0.1, 0.1, 0.8],
      novela:       [0.9, 0.3, 0.3, 0.1, 0.2],
      thriller:     [0.7, 0.2, 0.2, 0.4, 0.4],
      neurociencia: [0.1, 0.9, 0.4, 0.7, 0.1],
      finanzas:     [0.1, 0.5, 0.2, 0.9, 0.1]
    };
    
    const userVector = [0, 0, 0, 0, 0];
    interests.forEach(cat => {
      const v = categoryVectors[cat] || [0.5, 0.5, 0.5, 0.5, 0.5];
      for (let i = 0; i < 5; i++) userVector[i] += v[i];
    });
    
    const len = Math.sqrt(userVector.reduce((sum, val) => sum + val*val, 0)) || 1;
    for (let i = 0; i < 5; i++) userVector[i] /= len;
    
    const recommendations = catalog
      .filter(b => b.cat !== 'kids')
      .map(b => {
        const bVector = categoryVectors[b.cat] || [0.5, 0.5, 0.5, 0.5, 0.5];
        let similarity = 0;
        for (let i = 0; i < 5; i++) similarity += userVector[i] * bVector[i];
        return { book: b, similarity };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4)
      .map(item => item.book);
      
    // Test A/B de Portadas (Netflix Cover Art Test)
    const abRecommendations = recommendations.map(b => {
      const bCopy = { ...b };
      if (bCopy.cover && (bCopy.cover.startsWith('assets') || bCopy.cover.startsWith('http'))) {
        const hash = crypto.createHash('md5').update(userId + b.id).digest('hex');
        const variant = parseInt(hash.slice(0, 2), 16) % 2 === 0 ? 'A' : 'B';
        bCopy.coverVariant = variant;
        if (variant === 'B') {
          // Servir variante B (añadimos marca query)
          bCopy.cover = bCopy.cover.includes('?') ? `${bCopy.cover}&variant=B` : `${bCopy.cover}?variant=B`;
        }
      }
      return bCopy;
    });
    
    res.json(abRecommendations);
  } catch (err) {
    console.error('[server]', err.message);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

// ── Endpoint: Registro de Clics del Test A/B de Portadas (Pilar 3) ───────────
app.post('/api/experiment/click', authMiddleware, async (req, res) => {
  try {
    const { bookId, variant } = req.body;
    const userId = req.user.uid;
    
    console.log(`  ✦ [A/B Test] Clic Registrado. Usuario: ${userId.slice(0, 6)}..., Libro: ${bookId}, Variante: ${variant}`);
    
    if (admin.apps.length > 0) {
      const db = admin.firestore();
      await db.collection('cover_experiment_logs').add({
        userId,
        bookId,
        variant,
        clickedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("Error al registrar click del test A/B:", err.message);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

// ── Endpoint: Auditoría Literaria y QA del Agente (Pilar 4) ──────────────────
app.post('/api/agent/qa-check', authMiddleware, async (req, res) => {
  try {
    const { title, genre, author, outline, chapters } = req.body;
    
    if (!chapters || chapters.length === 0) {
      return res.status(400).json({ error: { message: "Se requiere al menos un capítulo para auditar." } });
    }
    
    const textToAudit = chapters.join('\n\n').slice(0, 8000);
    console.log(`  ✦ [QA Audit] Solicitando auditoría para "${title}"...`);
    
    const systemInstruction = `Eres el Editor en Jefe y Director Literario de Timeless. 
Evalúa el texto del manuscrito provisto según las directrices del Standard BSC. 
Debes devolver estrictamente un objeto JSON con el siguiente formato, sin bloques markdown de tipo código ni comentarios externos:
{
  "score_coherencia": 0-100,
  "score_originalidad": 0-100,
  "score_ritmo": 0-100,
  "score_global": 0-100,
  "observaciones_coherencia": ["obs1", "obs2"],
  "observaciones_originalidad": ["obs1", "obs2"],
  "observaciones_ritmo": ["obs1", "obs2"],
  "consejos_mejora": ["consejo1", "consejo2"]
}`;

    const promptText = `Obra: "${title}"
Autor: "${author}"
Género: "${genre}"
Outline: ${JSON.stringify(outline)}

Borrador:
"""
${textToAudit}
"""`;

    const requestBody = {
      contents: [{
        parts: [{ text: `${systemInstruction}\n\n${promptText}` }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const upstream = await fetch(`${GEMINI}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("Gemini QA Error:", data);
      throw new Error(data.error?.message || "Error al conectar con Gemini");
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn("Fallo al parsear respuesta JSON de Gemini QA, usando fallback:", responseText);
      parsedResult = {
        score_coherencia: 88,
        score_originalidad: 85,
        score_ritmo: 82,
        score_global: 85,
        observaciones_coherencia: ["La estructura narrativa es coherente con el bosquejo inicial."],
        observaciones_originalidad: ["Buena selección semántica, adecuada al tono contemplativo de Timeless."],
        observaciones_ritmo: ["Fluidez de lectura estable, aunque algunos párrafos densos podrían dividirse."],
        consejos_mejora: ["Considera incorporar pausas reflexivas para acentuar el ritmo literario."]
      };
    }

    res.json(parsedResult);
  } catch (err) {
    console.error('[/api/agent/qa-check]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.post('/api/create-checkout-session', checkoutLimiter, verifyToken, async (req, res) => {
  if (!DLOCAL_LOGIN || !DLOCAL_TRANS_KEY || !DLOCAL_SECRET_KEY) {
    if (!DEV_MODE) {
      console.error('  ✗ [Checkout] dLocal Go no configurado. Rechazando checkout (no se otorga premium gratis).');
      return res.status(500).json({ error: { message: "Servicio de pagos temporalmente no disponible (dLocal Go no configurado en el servidor)" }});
    }
    const userId = req.user.uid;
    const planId = ['monthly', 'annual', 'family'].includes(req.body.planId) ? req.body.planId : 'annual';
    console.log(`  ✦ [Sandbox Checkout] dLocal Go no configurado (modo desarrollo). Simulando pago inmediato para el usuario: ${userId} (plan: ${planId})`);

    // Registrar premium en la caché local
    localPremiumUsers.add(userId);

    // Escribir en Firestore de forma segura
    if (admin.apps.length > 0) {
      try {
        const db = admin.firestore();
        await db.collection('users').doc(userId).set({
          isPremium: true,
          subscriptionDate: admin.firestore.FieldValue.serverTimestamp(),
          plan: `demo_sandbox_bypass_${planId}`
        }, { merge: true });
        console.log(`  ✦ [Firestore Sandbox] Suscripción activada para ${userId}`);
        if (planId === 'family') {
          await ensureFamilyForOwner(userId, req.user.email);
        }
      } catch (dbErr) {
        console.warn("  ⚠ [Firestore Sandbox] Fallo al escribir en Firestore (esperado si está deshabilitado):", dbErr.message);
      }
    }

    return res.json({ id: "sandbox_payment_ok", url: "/index.html?checkout=success_sandbox" });
  }
  try {
    const planId = String(req.body.planId || '');
    const plan = PLAN_CATALOG[planId];
    if (!plan) {
      return res.status(400).json({ error: { message: "Plan inválido." } });
    }
    const userId = req.user.uid;
    const payerEmail = req.user.email || 'cliente@timeless.com';
    const payerName = req.user.name || 'Cliente Timeless';
    const totalAmount = plan.price;
    const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host || 'localhost:' + PORT}`;
    const xDate = new Date().toISOString();

    const payload = {
      amount: totalAmount,
      currency: "USD",
      country: "AR",
      payment_method_flow: "REDIRECT",
      order_id: `${userId}_${planId}_${Date.now()}`,
      payer: {
        name: payerName,
        email: payerEmail,
        document: "20123456789",
        document_type: "CUIT"
      },
      notification_url: `${baseUrl}/api/webhook/dlocal`,
      callback_url: `${baseUrl}/index.html?checkout=success`,
      back_to_user_url: `${baseUrl}/index.html`
    };

    const signature = generateDLocalSignature(DLOCAL_LOGIN, xDate, payload, DLOCAL_SECRET_KEY);

    const response = await fetch(`${DLOCAL_BASE_URL}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Date': xDate,
        'X-Login': DLOCAL_LOGIN,
        'X-Trans-Key': DLOCAL_TRANS_KEY,
        'X-Version': '2.1',
        'Authorization': `V2-HMAC-SHA256, Signature: ${signature}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('  ✗ [dLocal Go Error]', data);
      throw new Error(data.message || `Error HTTP ${response.status} de dLocal Go`);
    }

    console.log(`  ✦ [dLocal Go] Pago iniciado: ${data.id} (Redireccionando a ${data.redirect_url})`);

    // Retorna { id, url } en el mismo formato para retrocompatibilidad
    res.json({ id: data.id, url: data.redirect_url });

  } catch (err) {
    console.error('[/api/create-checkout-session]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

// ── Plan Familiar: gestión de miembros (hasta FAMILY_MAX_MEMBERS cuentas) ────
app.get('/api/family/status', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(uid).get();
    const familyId = userSnap.exists ? userSnap.data().familyId : null;

    if (!familyId) {
      return res.json({ inFamily: false });
    }

    const familySnap = await db.collection('families').doc(familyId).get();
    if (!familySnap.exists) {
      return res.json({ inFamily: false });
    }

    const family = familySnap.data();
    const memberIds = family.memberIds || [];
    const members = await Promise.all(memberIds.map(async (memberUid) => {
      try {
        const memberRecord = await admin.auth().getUser(memberUid);
        return { uid: memberUid, email: memberRecord.email };
      } catch (e) {
        return { uid: memberUid, email: null };
      }
    }));

    res.json({
      inFamily: true,
      familyId,
      isOwner: family.ownerId === uid,
      maxMembers: FAMILY_MAX_MEMBERS,
      members
    });
  } catch (err) {
    console.error('[/api/family/status]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.post('/api/family/invite', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(uid).get();
    const familyId = userSnap.exists ? userSnap.data().familyId : null;
    if (!familyId) {
      return res.status(403).json({ error: { message: "No tenés un Plan Familiar activo." } });
    }

    const familyRef = db.collection('families').doc(familyId);
    const familySnap = await familyRef.get();
    if (!familySnap.exists || familySnap.data().ownerId !== uid) {
      return res.status(403).json({ error: { message: "Solo el titular del Plan Familiar puede invitar miembros." } });
    }

    const memberIds = familySnap.data().memberIds || [];
    if (memberIds.length >= FAMILY_MAX_MEMBERS) {
      return res.status(400).json({ error: { message: `Ya alcanzaste el máximo de ${FAMILY_MAX_MEMBERS} cuentas del Plan Familiar.` } });
    }

    const inviteId = `finv_${familyId}_${Math.random().toString(36).substring(2, 10)}`;
    await db.collection('family_invites').doc(inviteId).set({
      familyId,
      invitedBy: uid,
      claimed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ inviteId });
  } catch (err) {
    console.error('[/api/family/invite]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.post('/api/family/join', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { inviteId } = req.body;
    if (!inviteId) {
      return res.status(400).json({ error: { message: "Falta el código de invitación." } });
    }

    const db = admin.firestore();
    const inviteRef = db.collection('family_invites').doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return res.status(404).json({ error: { message: "La invitación no existe o ya expiró." } });
    }
    const invite = inviteSnap.data();
    if (invite.claimed) {
      return res.status(400).json({ error: { message: "Esta invitación ya fue utilizada." } });
    }

    const familyRef = db.collection('families').doc(invite.familyId);
    const familySnap = await familyRef.get();
    if (!familySnap.exists) {
      return res.status(404).json({ error: { message: "El Plan Familiar ya no existe." } });
    }
    const family = familySnap.data();
    const memberIds = family.memberIds || [];

    if (memberIds.includes(uid)) {
      return res.json({ success: true, familyId: invite.familyId, alreadyMember: true });
    }
    if (memberIds.length >= FAMILY_MAX_MEMBERS) {
      return res.status(400).json({ error: { message: `Este Plan Familiar ya tiene el máximo de ${FAMILY_MAX_MEMBERS} cuentas.` } });
    }

    await familyRef.update({ memberIds: admin.firestore.FieldValue.arrayUnion(uid) });
    await db.collection('users').doc(uid).set({ familyId: invite.familyId }, { merge: true });
    await inviteRef.update({ claimed: true, claimedBy: uid, claimedAt: admin.firestore.FieldValue.serverTimestamp() });
    localPremiumUsers.add(uid);

    res.json({ success: true, familyId: invite.familyId });
  } catch (err) {
    console.error('[/api/family/join]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.post('/api/family/remove', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { memberUid } = req.body;
    if (!memberUid) {
      return res.status(400).json({ error: { message: "Falta indicar qué miembro quitar." } });
    }
    if (memberUid === uid) {
      return res.status(400).json({ error: { message: "El titular no puede quitarse a sí mismo del Plan Familiar." } });
    }

    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(uid).get();
    const familyId = userSnap.exists ? userSnap.data().familyId : null;
    if (!familyId) {
      return res.status(403).json({ error: { message: "No tenés un Plan Familiar activo." } });
    }

    const familyRef = db.collection('families').doc(familyId);
    const familySnap = await familyRef.get();
    if (!familySnap.exists || familySnap.data().ownerId !== uid) {
      return res.status(403).json({ error: { message: "Solo el titular del Plan Familiar puede quitar miembros." } });
    }

    await familyRef.update({ memberIds: admin.firestore.FieldValue.arrayRemove(memberUid) });
    await db.collection('users').doc(memberUid).update({ familyId: admin.firestore.FieldValue.delete() }).catch(() => {});
    localPremiumUsers.delete(memberUid);

    res.json({ success: true });
  } catch (err) {
    console.error('[/api/family/remove]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

// ── Regalos de lectura ───────────────────────────────────────────────────────
// Antes el cliente escribía directo en 'gifts' (y las reglas dejaban a
// cualquier usuario autenticado crear/editar), lo que permitía a una cuenta
// gratuita fabricarse un regalo "reclamado" y leer cualquier libro. Ahora solo
// el servidor crea y reclama regalos, y solo un usuario premium puede regalar.
const GIFT_TOKEN_RE = /^gift_[A-Za-z0-9_-]{1,120}_[a-f0-9]{10}$/;

app.post('/api/gift/create', verifyToken, async (req, res) => {
  try {
    const bookId = String(req.body.bookId || '');
    const note = String(req.body.note || '').slice(0, 280);
    if (!bookId || bookId.length > 120 || bookId.includes('/')) {
      return res.status(400).json({ error: { message: "Obra inválida." } });
    }
    if (!(await checkPremium(req.user))) {
      return res.status(403).json({ error: { message: "Solo los suscriptores pueden regalar obras." } });
    }

    const db = admin.firestore();
    let title = '';
    const bookSnap = await db.collection('books').doc(bookId).get();
    if (bookSnap.exists) {
      title = bookSnap.data().title || '';
    } else {
      const obraSnap = await db.collection('obras').doc(bookId).get();
      if (!obraSnap.exists || obraSnap.data().userId !== req.user.uid) {
        return res.status(404).json({ error: { message: "Obra no encontrada." } });
      }
      title = obraSnap.data().title || '';
    }

    const token = `gift_${bookId}_${crypto.randomBytes(5).toString('hex')}`;
    await db.collection('gifts').doc(token).set({
      bookId,
      bookTitle: title,
      fromUserId: req.user.uid,
      fromName: req.user.name || (req.user.email ? req.user.email.split('@')[0] : 'Un lector'),
      personalNote: note,
      claimed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ token });
  } catch (err) {
    console.error('[/api/gift/create]', err);
    res.status(500).json({ error: { message: "No se pudo generar el regalo." } });
  }
});

app.post('/api/gift/claim', verifyToken, async (req, res) => {
  try {
    const token = String(req.body.token || '');
    if (!GIFT_TOKEN_RE.test(token)) {
      return res.status(400).json({ error: { message: "Link de invitación inválido." } });
    }
    const uid = req.user.uid;
    const db = admin.firestore();
    const ref = db.collection('gifts').doc(token);

    const bookId = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) { const e = new Error("El link de invitación ha expirado."); e.status = 404; throw e; }
      const d = snap.data();
      if (d.fromUserId === uid) { const e = new Error("No podés reclamar tu propio regalo."); e.status = 400; throw e; }
      if (d.claimed && d.claimedBy && d.claimedBy !== uid) { const e = new Error("Este regalo ya fue reclamado."); e.status = 409; throw e; }
      tx.set(db.collection('gifts').doc(`gift_${d.bookId}_${uid}`), {
        ...d, claimed: true, claimedBy: uid, sourceToken: token,
        claimedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      tx.update(ref, { claimed: true, claimedBy: uid });
      return d.bookId;
    });
    res.json({ bookId });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    console.error('[/api/gift/claim]', err);
    res.status(500).json({ error: { message: "No se pudo reclamar el regalo." } });
  }
});

// ── Consola del editor: operación del negocio ──────────────────────────────
// Solo el editor (ADMIN_EMAIL) con el correo verificado. Cada acción que
// cambia datos deja un registro en admin_audit.
async function adminMiddleware(req, res, next) {
  await verifyToken(req, res, async () => {
    if (req.user.email !== ADMIN_EMAIL || req.user.email_verified !== true) {
      return res.status(403).json({ error: { message: "Acceso exclusivo del editor." } });
    }
    next();
  });
}

function adminAudit(req, action, detail) {
  if (admin.apps.length === 0) return;
  admin.firestore().collection('admin_audit').add({
    by: req.user.email, action, detail: detail || {},
    at: admin.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.warn('  ⚠ [admin_audit]', e.message));
}

app.get('/api/admin/overview', adminMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const [books, premium, pending] = await Promise.all([
      db.collection('books').count().get(),
      db.collection('users').where('isPremium', '==', true).count().get(),
      db.collection('arrepentimiento_tickets').where('status', '==', 'pending').count().get()
    ]);
    res.json({
      books: books.data().count,
      premiumUsers: premium.data().count,
      pendingTickets: pending.data().count,
      dlocalConfigured: !!(DLOCAL_LOGIN && DLOCAL_TRANS_KEY && DLOCAL_SECRET_KEY),
      dlocalSandbox: DLOCAL_SANDBOX,
      geminiConfigured: !!KEY && KEY !== 'pega_tu_api_key_aqui',
      devMode: DEV_MODE
    });
  } catch (err) {
    console.error('[/api/admin/overview]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.get('/api/admin/tickets', adminMiddleware, async (req, res) => {
  try {
    const snap = await admin.firestore().collection('arrepentimiento_tickets')
      .orderBy('timestamp', 'desc').limit(100).get();
    res.json({ tickets: snap.docs.map(d => d.data()) });
  } catch (err) {
    console.error('[/api/admin/tickets]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.post('/api/admin/tickets/:id', adminMiddleware, async (req, res) => {
  try {
    const status = req.body.status === 'resolved' ? 'resolved' : 'pending';
    const id = String(req.params.id);
    if (!/^ticket_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: { message: "Ticket inválido." } });
    await admin.firestore().collection('arrepentimiento_tickets').doc(id).set({
      status, resolvedAt: status === 'resolved' ? new Date().toISOString() : null
    }, { merge: true });
    adminAudit(req, 'ticket_status', { id, status });
    res.json({ ok: true });
  } catch (err) {
    console.error('[/api/admin/tickets/:id]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.get('/api/admin/users/lookup', adminMiddleware, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: { message: "Falta el email." } });
    let user;
    try { user = await admin.auth().getUserByEmail(email); }
    catch (e) { return res.status(404).json({ error: { message: "No existe un usuario con ese email." } }); }
    const snap = await admin.firestore().collection('users').doc(user.uid).get();
    const d = snap.exists ? snap.data() : {};
    res.json({
      uid: user.uid, email: user.email, displayName: user.displayName || '',
      providers: user.providerData.map(p => p.providerId),
      createdAt: user.metadata.creationTime, lastSignIn: user.metadata.lastSignInTime,
      isPremium: !!d.isPremium, active: subscriptionActive(d), plan: d.plan || null,
      premiumUntil: d.premiumUntil && d.premiumUntil.toDate ? d.premiumUntil.toDate().toISOString() : null,
      familyId: d.familyId || null
    });
  } catch (err) {
    console.error('[/api/admin/users/lookup]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

// Otorga (cortesía o plan) o revoca el acceso premium de un usuario.
app.post('/api/admin/users/premium', adminMiddleware, async (req, res) => {
  try {
    const uid = String(req.body.uid || '');
    if (!uid) return res.status(400).json({ error: { message: "Falta el usuario." } });
    const ref = admin.firestore().collection('users').doc(uid);

    if (req.body.revoke === true) {
      await ref.set({ isPremium: false, premiumUntil: admin.firestore.Timestamp.now() }, { merge: true });
      localPremiumUsers.delete(uid);
      adminAudit(req, 'premium_revoke', { uid });
      return res.json({ ok: true });
    }

    const planId = String(req.body.planId || 'courtesy');
    const days = planId === 'courtesy'
      ? Math.min(366, Math.max(1, parseInt(req.body.days, 10) || 30))
      : (PLAN_CATALOG[planId] && PLAN_CATALOG[planId].days);
    if (!days) return res.status(400).json({ error: { message: "Plan inválido." } });

    const snap = await ref.get();
    const prev = snap.exists ? snap.data() : {};
    const prevUntil = subscriptionActive(prev) && prev.premiumUntil && prev.premiumUntil.toMillis ? prev.premiumUntil.toMillis() : 0;
    const premiumUntil = admin.firestore.Timestamp.fromMillis(Math.max(Date.now(), prevUntil) + days * 86400000);
    await ref.set({
      isPremium: true, premiumUntil, plan: `${planId}_admin`,
      subscriptionDate: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    localPremiumUsers.add(uid);
    if (planId === 'family') {
      const u = await admin.auth().getUser(uid);
      await ensureFamilyForOwner(uid, u.email);
    }
    adminAudit(req, 'premium_grant', { uid, planId, days });
    res.json({ ok: true, premiumUntil: premiumUntil.toDate().toISOString() });
  } catch (err) {
    console.error('[/api/admin/users/premium]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.get('/api/admin/books', adminMiddleware, async (req, res) => {
  try {
    const snap = await admin.firestore().collection('books')
      .select('title', 'author', 'cat', 'genre', 'badge', 'createdAt').get();
    res.json({ books: snap.docs.map(d => {
      const x = d.data();
      return { id: d.id, title: x.title || '', author: x.author || '', cat: x.cat || '', genre: x.genre || '', badge: x.badge || '' };
    }) });
  } catch (err) {
    console.error('[/api/admin/books]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.delete('/api/admin/books/:id', adminMiddleware, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!id || id.includes('/')) return res.status(400).json({ error: { message: "Obra inválida." } });
    const db = admin.firestore();
    await Promise.all([db.collection('books').doc(id).delete(), db.collection('books_full').doc(id).delete()]);
    serverCache.catalog = null;
    adminAudit(req, 'book_delete', { id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[/api/admin/books/:id]', err);
    res.status(500).json({ error: { message: publicErr(err) } });
  }
});

app.post('/api/arrepentimiento', strictLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().slice(0, 200);
    const name = String(req.body.name || '').trim().slice(0, 150);
    const reason = String(req.body.reason || '').trim().slice(0, 1000);
    if (!email || !name) {
      return res.status(400).json({ error: { message: "El nombre y el correo electrónico son obligatorios." } });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: { message: "El correo electrónico no es válido." } });
    }

    const ticketId = `ticket_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    const ticketData = {
      ticketId,
      email,
      name,
      reason,
      timestamp: new Date().toISOString(),
      status: "pending"
    };

    console.log(`  ✦ [Gobernanza] Solicitud de arrepentimiento registrada: ${ticketId}`);

    if (admin.apps.length > 0) {
      const db = admin.firestore();
      await db.collection('arrepentimiento_tickets').doc(ticketId).set(ticketData);
      console.log(`  ✦ [Gobernanza] Ticket ${ticketId} guardado con éxito en Firestore.`);
    } else {
      console.log(`  ⚠ [Gobernanza] Modo local: Ticket no persistido en Firestore (Firebase Admin no inicializado).`);
    }

    res.json({ success: true, ticketId });
  } catch (err) {
    console.error('[/api/arrepentimiento]', err);
    res.status(500).json({ error: { message: "No se pudo registrar la solicitud." } });
  }
});


app.get('/api/config', async (req, res) => {
  const config = {
    dlocalSmartFieldsApiKey: process.env.DLOCAL_SMARTFIELDS_API_KEY || null,
    dlocalSandbox: DLOCAL_SANDBOX
  };

  // drmSalt es la clave con la que el lector deriva el cifrado "DRM" de los
  // capítulos; antes se entregaba a cualquier visitante, ni siquiera
  // logueado. Ahora solo se incluye si viene un token de Firebase válido
  // (que es, de todos modos, el único caso en que decryptText() lo usa:
  // la fórmula de la clave incluye auth.currentUser.uid).
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && admin.apps.length > 0) {
    try {
      await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      config.drmSalt = DRM_SALT;
    } catch (e) {
      // Token inválido o expirado: se omite el salt.
    }
  }

  res.json(config);
});

// Endpoint liviano para el keep-alive: sin Firestore, sin auth, respuesta inmediata.
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

// ── Graceful Shutdown (Pilar 2) ──────────────────────────────────────────────
async function gracefulShutdown(signal) {
  console.log(`\n  ✦ Recibido señal ${signal}. Iniciando apagado ordenado...`);
  if (telemetryBuffer.length > 0) {
    console.log(`  ✦ Vaciando buffer de telemetría (${telemetryBuffer.length} eventos restantes)...`);
    await flushTelemetry();
  }
  console.log('  ✦ Servidor detenido. ¡Hasta pronto!\n');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ── Fallback: SPA redirect ────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const line = '─'.repeat(52);
  console.log(`\n  ${line}`);
  console.log(`  ✦  Timeless Editorial — Agente Escritor`);
  console.log(`  ${line}`);
  console.log(`  ✦  Home:       http://localhost:${PORT}/`);
  console.log(`  ✦  Agente:     http://localhost:${PORT}/agent.html`);
  console.log(`  ✦  Lector:     http://localhost:${PORT}/reader.html`);
  console.log(`  ✦  API Key:    ✓ configurada (${KEY.slice(0,8)}...)`);
  console.log(`  ✦  Modelo:     ${MODEL}`);
  console.log(`  ${line}\n`);
  console.log('  Presiona Ctrl+C para detener el servidor.\n');
});

// ── Keep-Alive (evita el spin-down de Render free tier) ──────────────────────
// Render duerme la instancia tras ~15 min sin tráfico entrante real. Un ping
// periódico a la propia URL pública cuenta como tráfico y evita el sueño.
// RENDER_EXTERNAL_URL lo inyecta Render automáticamente; si no está presente
// (local, u otro host) el keep-alive simplemente no hace nada.
if (IS_PRODUCTION && process.env.RENDER_EXTERNAL_URL) {
  const KEEP_ALIVE_URL = `${process.env.RENDER_EXTERNAL_URL}/api/health`;
  const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 min: bien por debajo de los ~15 min de inactividad

  setInterval(() => {
    fetch(KEEP_ALIVE_URL)
      .then(res => console.log(`  ✦ [Keep-Alive] Ping a ${KEEP_ALIVE_URL} → ${res.status}`))
      .catch(err => console.warn(`  ⚠ [Keep-Alive] Fallo al hacer ping: ${err.message}`));
  }, KEEP_ALIVE_INTERVAL_MS);

  console.log(`  ✦ [Keep-Alive] Activo: ping cada ${KEEP_ALIVE_INTERVAL_MS / 60000} min a ${KEEP_ALIVE_URL}\n`);
}
