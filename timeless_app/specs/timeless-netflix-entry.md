# Spec: Timeless Netflix-Style Entry Experience

## 1. Objective
Transform the entry experience of the Timeless platform into a gated, subscription-first portal similar to modern multimedia platforms (e.g., Netflix). This improves corporate governance by protecting premium intellectual property and guarding the Firestore database read budget. Non-members (Guests) will see a high-conversion marketing page with a Call to Action to enter their email, while authenticated Members will gain access to an interactive dashboard featuring category carousels, a hero billboard, and direct book reading capabilities.

---

## 2. Requirements & Must-Haves
- [ ] **REQ-1: UI View Segregation (Guest vs. Member)**
  - Toggled dynamically by authentication state (Firebase Auth listener).
  - **Guest View (Unauthenticated)**: Show navigation bar (with logo, "Iniciar sesión" button), Hero marketing section, Subscription plans, Testimonials, and Footer. 
  - **Member View (Authenticated)**: Show full navigation bar (with user avatar, write book option, admin option if admin), Featured Billboard book, horizontal scrollable category rows, and kids catalog carousel. Hide plans/testimonials.
- [ ] **REQ-2: Hero Email Gate Integration**
  - Add an email subscription input box with a "Comenzar" button to the Guest Hero section.
  - When the user enters their email and clicks "Comenzar", it pre-fills the registration/auth form inside the Auth Modal and opens it.
- [ ] **REQ-3: Firestore Read Budget Protection**
  - Do **NOT** invoke `fetchLibrary()` or download any catalog data from Firestore on initial page load if the user is a Guest.
  - Fetch the library catalog and populate rows only after authentication changes to a logged-in Member.
- [ ] **REQ-4: Horizontal Scrollable Category Rows (Netflix Carousel Style)**
  - Re-engineer the catalog representation into horizontal-scrolling carousels grouped by genres/categories (e.g., "Destacados", "Ficción", "Ensayo", "Kids").
  - Category rows must support mouse drag, scroll gestures, and responsive padding.
  - Clean styling with scale-up hover animations on book covers to feel premium and alive.
- [ ] **REQ-5: Consumer Protection Preservation**
  - The "Botón de Arrepentimiento" modal must remain fully accessible to all users (both guests and members) in the footer links.
- [ ] **REQ-6: Fix Broken Cookies Script**
  - Close the unclosed `<script>` tag in `index.html` around line 712-727.

---

## 3. Constraints & Design Guidelines
- **Tech Stack**: Vanilla HTML5, CSS3, ES6 JavaScript, Firebase Auth, Cloud Firestore.
- **Design & UX**:
  - Keep the premium dark theme with gold accents (`#A26829`, `#8C541D`) and glassmorphic panels.
  - Outfit and Lora fonts for refined contrast.
  - Smooth transitions between guest and member view to avoid flickering.
- **SEO & Accessibility (a11y)**:
  - Accessible form labels and focus states for the new hero input.
  - Semantic HTML tags intact.
- **Performance**:
  - Prevent initial load lag by lazy-loading member assets and delaying database initialization.

---

## 4. Edge Cases & Error States
- [ ] **EDGE-1: Unauthenticated Session Recovery**
  - If a guest refreshes while logged in, transition smoothly without flashing the guest hero section (use a loading overlay or layout spacer while checking auth state).
- [ ] **EDGE-2: Network Failures**
  - Handle Firestore fetch errors gracefully, falling back to local cached catalog data without breaking the page layout.
- [ ] **EDGE-3: Broken Image Alt-Backups**
  - Ensure dynamic SVG book covers generate automatically if a title fails to load its cover image.

---

## 5. Definition of Done (DoD)
- [ ] **DoD-1**: HTML syntax error (unclosed script tag) is completely fixed.
- [ ] **DoD-2**: Gating classes (`guest-only` and `member-only`) are defined in CSS and applied in HTML.
- [ ] **DoD-3**: Firebase Auth listener toggles state classes on `document.body` and handles data-fetching conditionals.
- [ ] **DoD-4**: Guest view and Member view display correctly according to authentication status.
- [ ] **DoD-5**: Dynamic horizontal scrollable carousels created for book categories.
- [ ] **DoD-6**: Verification page loads successfully, and no Firebase console errors occur when browsing as a guest.
