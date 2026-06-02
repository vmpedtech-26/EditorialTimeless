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
require('dotenv').config();

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const KEY  = process.env.GEMINI_API_KEY || '';

// Configuración Stripe
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch (err) {
    console.warn('  ⚠  Error al inicializar Stripe:', err.message);
  }
} else {
  console.warn('  ⚠  Stripe: STRIPE_SECRET_KEY no configurado en el archivo .env. Pasarela de pagos inactiva.');
}
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

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

// ── Endpoint: Stripe Webhook ───────────────────────────────────────────────
// Debe ir ANTES de express.json() para leer el body en raw format
app.post('/api/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  if (!stripe) {
    console.warn('  ⚠ [Stripe Webhook] Recibido webhook de Stripe, pero Stripe no está configurado.');
    return res.status(500).send("Stripe no configurado en el servidor");
  }
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('  ✗ [Stripe Webhook] Error de firma:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar el evento de pago completado
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    
    console.log(`  ✦ [Webhook] Pago Stripe APROBADO: ${session.id} (Usuario: ${userId})`);
    
    if (userId && admin.apps.length > 0) {
      try {
        const db = admin.firestore();
        await db.collection('users').doc(userId).set({
          isPremium: true,
          subscriptionDate: admin.firestore.FieldValue.serverTimestamp(),
          lastPaymentId: session.id,
          plan: 'annual_stripe'
        }, { merge: true });
        console.log(`  ✦ [Firestore] Suscripción activada para ${userId}`);
      } catch (dbErr) {
        console.error('  ✗ [Webhook Error] Fallo al escribir en Firestore:', dbErr);
      }
    } else {
      console.warn('  ⚠ [Webhook] ERROR CRÍTICO: Firebase Admin no inicializado o userId faltante.');
    }
  }

  res.json({received: true});
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// Sirve todos los archivos estáticos de timeless_app
app.use(express.static(path.join(__dirname)));

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
    
    // Verificar si es premium en Firestore
    const userSnap = await admin.firestore().collection('users').doc(uid).get();
    if (!userSnap.exists || !userSnap.data().isPremium) {
      return res.status(403).json({ error: { message: "Requiere suscripción activa para usar Timeless Agent" }});
    }
    
    // Verificar si ha excedido su límite de palabras mensual (Evitar abusos de costos en Gemini API)
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-06"
    const usageDoc = await admin.firestore().collection('users').doc(uid).collection('usage').doc(currentMonth).get();
    let wordsUsed = 0;
    if (usageDoc.exists) {
      wordsUsed = usageDoc.data().wordsUsed || 0;
    }
    
    const LIMIT = 500000; // Límite mensual: 500k palabras
    if (wordsUsed >= LIMIT && uid !== 'matiaseorejas@gmail.com') {
      return res.status(429).json({ error: { message: `Has alcanzado el límite mensual de generación de IA (${LIMIT.toLocaleString()} palabras). Tu límite se renovará el próximo mes.` }});
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
    res.status(500).json({ error: { message: err.message } });
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

  } catch (err) {
    console.error('[/api/stream]', err.message);
    res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
  }

  res.end();
});

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: { message: "Servicio de pagos temporalmente no disponible (Stripe no configurado en el servidor)" }});
  }
  try {
    const { items, userId } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
          },
          unit_amount: Math.round(Number(item.unit_price) * 100), // Stripe usa centavos
        },
        quantity: Number(item.quantity),
      })),
      mode: 'payment',
      success_url: `https://${req.headers.host || 'localhost:'+PORT}/success.html`,
      cancel_url: `https://${req.headers.host || 'localhost:'+PORT}/index.html`,
      metadata: { userId }
    });

    // Enviar URL de Stripe
    res.json({ id: session.id, url: session.url });

  } catch (err) {
    console.error('[/api/create-checkout-session]', err);
    res.status(500).json({ error: { message: err.message } });
  }
});


// ── Fallback: SPA redirect ────────────────────────────────────────────────────
app.get('*', (req, res) => {
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
