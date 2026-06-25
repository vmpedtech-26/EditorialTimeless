# Spec: Timeless Premium Netflix-Style Landing Page Redesign

## 1. Objective
Redesign the public Landing Page (Guest View) of Timeless Editorial to mimic the high-conversion, visually striking layout of Netflix's portal (netflix.com/ar/), adapted to a luxury editorial brand. The page will feature a darkened backdrop curtain showing a grid of book covers, alternating feature panels explaining the platform's value, a polished FAQ accordion, 3D mouse tilt effects on mockups and book covers, and global parallax scrolling of golden dust particles.

---

## 2. Requirements & Must-Haves
- [ ] **REQ-1: Hero Billboard & Book Poster Curtain**
  - The background of the Hero section must contain a tiled grid of book covers (a poster curtain) tilted slightly in 3D, dimmed, and vignette-masked to create depth.
  - Centered typography:
    - Main Title: "Obras exclusivas, ensayos profundos y lecturas eternas."
    - Subtitle: "Lee en cualquier pantalla. Cancela cuando quieras."
    - Action text: "¿Listo para sumergirte en literatura exclusiva? Ingresa tu email para iniciar tu suscripción."
  - Integrated Email Gate form (Input + Big Golden button with a Chevron arrow `Comenzar >`).
- [ ] **REQ-2: Top Navigation Realignment**
  - Minimalistic navbar: Logo on the left, "Iniciar sesión" button on the right. Links are hidden to avoid distraction.
- [ ] **REQ-3: Alternating Feature Sections (Netflix-Style Rows)**
  - Divided by clean, solid border lines. Alternate layouts (text left / visual right, then vice-versa):
    - **Row 1: Read Anywhere (Multi-device)**. Visual: Glassmorphic tablet/mobile mockup rendering a mock page of the reader with a 3D mouse tilt hover effect.
    - **Row 2: Secure Offline Access**. Visual: A luxurious bookshelves scene showing dynamic covers descending into an offline-ready state, highlighting the offline badge.
    - **Row 3: Dedicated Kids Space**. Visual: Cozy children bookshelf visual showcasing the Kids collection.
- [ ] **REQ-4: FAQ Accordion Component**
  - Standardized Netflix-style accordion rows: wide columns, clicking a question expands the answer smoothly using max-height transitions.
  - Questions to cover: What is Timeless?, How much does it cost?, Where can I read?, Can I cancel?, How does the offline download work?
- [ ] **REQ-5: 3D Mouse Tilt & Hover Effects**
  - Implement a clean Vanilla JS 3D tilt effect on book cards and device mockups.
  - When the user hovers over these elements, they tilt dynamically following the coordinates of the cursor, with realistic shadow shifts.
- [ ] **REQ-6: Parallax Background & Floating Particles**
  - Create a canvas overlay generating floating golden dust particles that move slowly according to page scroll and mouse cursor movements.
  - High-end dark marble background with golden veins applied to the body.

---

## 3. Constraints & Design Guidelines
- **Tech Stack**: Vanilla HTML5, CSS3, ES6 JS. No external heavy frameworks (like React or Tailwind) to maintain optimal Largest Contentful Paint (LCP) performance.
- **Color Palette & Aesthetics**:
  - Dark luxurious marble backdrop (`#0d0c0a` to `#161411`) with subtle gold accents (`#C9A96E`).
  - Font pairings: Playfair Display (Serif) for headings, Lora for body copy, and Inter (Sans-serif) for actionable inputs and buttons.
- **Responsive Layout**:
  - The book curtain grid must wrap and adjust column counts on mobile.
  - Tilt effects disabled on touch devices to conserve battery and CPU.

---

## 4. Edge Cases & Error States
- [ ] **EDGE-1: Heavy CSS Animation Lag**
  - Ensure the floating particles and 3D tilt utilize hardware-accelerated properties (`transform: translate3d`, `will-change`) to prevent lag on lower-end devices.
- [ ] **EDGE-2: Email Field Empty Submission**
  - Enforce standard HTML5 validation on the hero email gate input.

---

## 5. Definition of Done (DoD)
- [ ] **DoD-1**: Core redesign specification is written and version-controlled.
- [ ] **DoD-2**: High-resolution luxury dark marble texture is generated or imported as background.
- [ ] **DoD-3**: Netflix-style alternating panels are implemented in HTML and styled in CSS.
- [ ] **DoD-4**: Smooth FAQ accordion is active and fully interactive.
- [ ] **DoD-5**: 3D mouse tilt script is added and verified on desktop browsers.
- [ ] **DoD-6**: Floating golden dust parallax canvas is created and rendering smoothly.
