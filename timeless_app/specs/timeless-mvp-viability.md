# Spec: Timeless MVP Viability & Integration

## 1. Objective
Prepare the Timeless platform for a premium investor presentation (Kaszek Ventures) by ensuring it is 100% functional, highly secure, and cost-efficient (FinOps). This specification details the connection of the Express server to the real Cloud Firestore database, the implementation of a database seeding script using existing catalogs, a dynamic cryptographic DRM key rotation mechanism, and a sandbox payment flow that updates user premium status in real time.

---

## 2. Requirements & Must-Haves

- [ ] **REQ-1: Real Firestore Database Connection**
  - Migrate all read/write operations in `server.js` from local mock variables/cache files to Cloud Firestore.
  - Implement full database reads for the catalog row generation (`/api/recommendations` and book retrieval).
  - Save all user telemetry (`/api/telemetry` and `/api/telemetry/bulk`) and cover click experiment logs directly to Firestore.

- [ ] **REQ-2: Database Ingestion & Seeding Tool**
  - Create a Node.js seeding script `seed_db.js` that parses `fallback_catalog.json` and `kids_fallback_catalog.json`.
  - The script must populate the `obras` collection in Firestore with structured books (title, author, category, covers, chapters, and summary).
  - Ensure the script is idempotent (can be re-run without duplicating entries).

- [ ] **REQ-3: Cryptographically Secure DRM Key Derivation**
  - Replace the static global DRM password in `server.js` and `CryptoUtils` with a dynamic, session-based salt.
  - The key used for encrypting book chunks in `/api/book/:id/chunk/:index` must be derived from a combination of a server-side environment secret (`DRM_MASTER_SECRET`), the user's UID (`req.user.uid`), and the unique book ID (`book.id`).
  - Update `CryptoUtils` in the client code to derive the decryption key using Web Crypto API matching this signature.

- [ ] **REQ-4: Real-time Sandbox Payment & Premium Update**
  - Configure the `/api/create-checkout-session` endpoint to support a mock dLocal/Stripe flow or direct bypass.
  - If payment credentials are not configured, allow a "Demo Sandbox Checkout" that simulates a payment approval and immediately writes `{ isPremium: true, plan: 'demo_sandbox' }` to the corresponding user document in the `users` Firestore collection.
  - Ensure index.html and reader.html dynamically react to this status change in Firestore.

---

## 3. Constraints & Design Guidelines
- **Tech Stack**: Vanilla HTML5, CSS3, ES6 JavaScript, Node.js (Express), Firebase SDK (v10.8.0), Firebase Admin SDK.
- **FinOps & Cost Optimization**:
  - Keep Firestore read/write costs at zero by caching the active catalog in-memory on the Express server (invalidating/refreshing cache only on database updates).
  - Never call the Gemini API during regular browsing, only during explicit book creation or QA audit requests.
  - Use weighted category metrics for recommendation calculations to avoid continuous vector database compute bills.
- **Design & UX**: Maintain the premium dark luxury theme (`#0d0c0a` to `#161411`) with gold accents (`#C9A96E`) and smooth CSS transitions.

---

## 4. Edge Cases & Error States
- [ ] **EDGE-1: Unauthenticated Chunk Requests**
  - If a guest or expired session requests `/api/book/:id/chunk/:index`, block the request and return HTTP 401 Unauthorized immediately.
- [ ] **EDGE-2: Missing Firebase Admin Credentials**
  - If `serviceAccountKey.json` is missing on startup, fallback gracefully to a mock mode with warning logs to prevent server crashes.
- [ ] **EDGE-3: PWA Offline Data Sync**
  - Ensure telemetry cached in IndexedDB during offline reading (`sw.js`) is correctly flushed to Firestore when internet connectivity is restored.

---

## 5. Definition of Done (DoD)
- [ ] **DoD-1**: The seeding script `seed_db.js` executes cleanly and populates Firestore.
- [ ] **DoD-2**: The landing page correctly loads all rows and carousels from the live Firestore catalog.
- [ ] **DoD-3**: Reader opens and decrypts book chunks dynamically using unique derived DRM keys.
- [ ] **DoD-4**: Completing a sandbox checkout instantly upgrades the user's view to "Member View" without requiring page reloads.
- [ ] **DoD-5**: Server starts without any syntax or initialization errors.
