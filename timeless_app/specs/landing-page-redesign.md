# Spec: Timeless Premium Netflix-Style Landing Page Redesign

## 1. Objective
Redesign the public Landing Page (Guest View) of Timeless Editorial to replicate the high-conversion layout, copywriting structure, and user experience of Netflix's portal (netflix.com/ar/), adapted to a luxury editorial brand. The design will combine Netflix's structure (transparent overlapping header, 4 alternating features, FAQ accordion, top/bottom email gates) with Timeless's premium aesthetics (dark marble backdrop, floating golden dust particles, gold highlights `#C9A96E`, and 3D mouse tilt effects).

---

## 2. Requirements & Must-Haves

### REQ-1: Copywriting Aligning with Netflix
All public guest-facing marketing text must match the Netflix structure exactly, adapted for books:
- **Hero Title**: "Libros, novelas y ensayos ilimitados y mucho más"
- **Hero Subtitle**: "Lee donde quieras. Cancela en cualquier momento."
- **Email Gate Text (Top & Bottom)**: "¿Quieres leer? Ingresa tu email para crear o reiniciar tu membresía."

### REQ-2: Top Navigation with Language Selector
- **Minimalist Header**: Show the brand logo on the left.
- **Language Dropdown Selector**: Add a select dropdown on the right, next to the "Iniciar sesión" button. It must feature:
  - A globe icon on the left of the select.
  - Options: "Español" and "English".
  - Sleek dark border, gold/grey hover states, and transparent background.
- **Hiding Unirse Button**: The "Unirse" button must be hidden for guest users to match Netflix's header layout.

### REQ-3: Floating Label Email Inputs
- The email gate inputs (both in the Hero and under the FAQs) must use a floating label effect.
- When empty and unfocused, the label is centered and looks like placeholder text.
- When focused or filled, the label scales down and slides to the top, leaving space for the typed email address.
- Must be implemented using pure CSS selectors (`:placeholder-shown` and sibling selectors) for hardware-accelerated rendering.

### REQ-4: 4 Alternating Feature Sections (Netflix Rows)
Divided by solid, luxury borders. Layouts alternate (left-to-right) and feature:
- **Row 1: Disfruta en tu pantalla**
  - *Content*: "Disfruta en tu pantalla. Lee en smart TVs, tablets, móviles, computadoras y e-readers con total comodidad y sincronización."
  - *Visual (Right)*: Glassmorphic tablet screen displaying a book page with 3D mouse tilt.
- **Row 2: Descarga tus libros para leer offline** (Reversed)
  - *Content*: "Descarga tus libros para leer offline. Guarda tus obras favoritas y ten siempre algo que leer."
  - *Visual (Left)*: Mobile phone mockup displaying a book. Inside the phone, an overlay card simulates a download progress state (Stranger Things style):
    - Book thumbnail on the left, text in the center ("El Arquitecto de Sombras" / "Descargando..."), and an animated circular progress indicator on the right that counts up to 100% and displays a checkmark.
- **Row 3: Lee donde quieras**
  - *Content*: "Lee donde quieras. Acceso ilimitado a miles de libros en tu teléfono, tablet, computadora o e-reader sin cargos adicionales."
  - *Visual (Right)*: A 3D layered device stack (overlapping Laptop, Tablet, and Mobile phone screens) displaying active book pages.
- **Row 4: Un espacio exclusivo para niños** (Reversed)
  - *Content*: "Un espacio exclusivo para niños. Los niños viven aventuras con sus personajes favoritos en un espacio diseñado especialmente para ellos, gratis con tu membresía."
  - *Visual (Left)*: Cozy kids collection bookshelf showing playful premium book designs.

### REQ-5: Bottom Email Gate
- Beneath the FAQ accordion, add a secondary, identical Email Gate form with the copy: "¿Quieres leer? Ingresa tu email para crear o reiniciar tu membresía."
- Submitting either the top or bottom gate pre-fills the registration email and opens the authentication modal.

### REQ-6: FAQ Accordion Component
- Standardized Netflix-style accordion with 6 questions:
  1. ¿Qué es Timeless?
  2. ¿Cuánto cuesta la membresía?
  3. ¿Dónde puedo leer?
  4. ¿Cómo cancelo mi suscripción?
  5. ¿Qué puedo leer en Timeless?
  6. ¿Es adecuado para los niños?
- Expanding an answer collapses any other open answers smoothly using height transitions. The plus (`+`) icon must rotate 45 degrees into an (`x`) icon when active.

### REQ-7: 3D Mouse Tilt & Floating Particles
- The 3D mouse tilt effect must remain active on device mockups and feature cards.
- The canvas overlay rendering floating golden dust particles must stay active.
- High-end dark marble background with golden veins applied to the body.

---

## 3. Constraints & Design Guidelines
- **Tech Stack**: Vanilla HTML5, CSS3, ES6 JS. No heavy external frameworks.
- **Color Palette & Aesthetics**: Dark luxury theme (`#0d0c0a` to `#161411`) with subtle gold accents (`#C9A96E`).
- **Responsive Layout**: Tilt effects automatically bypassed on touch screens using pointer media query `(pointer: coarse)`.

---

## 4. Definition of Done (DoD)
- **DoD-1**: Floating label inputs are functional and styled in CSS.
- **DoD-2**: Language selector is added to the header.
- **DoD-3**: 4 alternating rows with custom download animation and multi-device stack are fully coded.
- **DoD-4**: FAQ accordion features the 6 correct questions and smooth rotation of icons.
- **DoD-5**: Bottom email gate is functional and triggers the Auth modal.
- **DoD-6**: No JS errors are present on guest page load.
