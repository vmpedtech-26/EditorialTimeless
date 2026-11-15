# Cómo escribir un libro de Timeless Editorial desde Antigravity

Esta carpeta (`libros/`) es el taller. Cada libro tiene su carpeta: `libros/<nombre-del-libro>/`.
Las instrucciones de oficio, las guías por formato y el detector de prosa ya están en el proyecto:
no hay que inventar ni pegar prompts a mano, los scripts los arman.

## Reglas que no se negocian
1. **Escribís vos, capítulo por capítulo.** No hace falta ninguna clave de API.
2. **Siempre con el encargo exacto**: antes de cada capítulo corré `libro_prompt.js` y seguí al pie de la letra lo que imprime (oficio, formato, personajes, final del capítulo anterior).
3. **Nunca menciones inteligencia artificial, modelos ni cómo se escribió** en ningún texto, título, descripción, comentario ni archivo del libro.
4. **No toques otros archivos del proyecto.** Solo `libros/<nombre>/`.
5. **No uses `--apply` sin que el usuario lo apruebe** después de leer el libro.

## Paso a paso

**1. Crear el libro.** Copiá `libros/_plantilla/` a `libros/<nombre>/` y editá `encargo.json`:
- `cat`: ficcion, novela, cuento, serie, ensayo, biografia, tecnica, comedia, thriller, neurociencia, finanzas, kids
- `genreLabel`: la etiqueta que ve el lector (por ejemplo "Realismo mágico", "Thriller", "Cuento infantil")
- `premise`: la idea en una o dos oraciones, concreta (lugar, época, conflicto)
- `tone`, `chapters` (capítulos o episodios), `writerId` (`libre` salvo que se pida una voz de referencia; ver `prompts.js`)

**2. El plan.**
```bash
node scripts/libro_prompt.js <nombre> plan
```
Escribí el JSON que pide y guardalo en `libros/<nombre>/outline.json`.

**3. Cada capítulo, en orden (1, 2, 3…).**
```bash
node scripts/libro_prompt.js <nombre> 1
```
Escribí SOLO la prosa y guardala en `libros/<nombre>/cap-01.txt` (sin título, sin markdown, sin asteriscos). Después:
```bash
node scripts/libro_revisar.js <nombre> 1
```
- Si dice ✔, seguí con el capítulo siguiente.
- Si dice ✘, se guarda una nota de corrección. Corré de nuevo `libro_prompt.js <nombre> 1` (la incluye sola), reescribí el capítulo corrigiendo exactamente eso y revisá otra vez. Máximo 3 intentos por capítulo.

**4. Leer el libro completo** y verificar continuidad: nombres, fechas, lugares, tono y voz iguales de punta a punta. Corregí lo que no cierre.

**5. Control editorial (antes de publicar).** Copiá `libros/_plantilla/ficha.json` a `libros/<nombre>/ficha.json` y completala solo después de hacerlo de verdad:
- *Corrección*: leer el libro completo buscando ortografía, gramática, puntuación del diálogo, repeticiones y errores de continuidad (nombres, edades, fechas, lugares, objetos). Corregir en los `cap-NN.txt`.
- *Legal*: ninguna empresa, institución o persona real asociada a delitos o escándalos; nada copiado de otras obras (ni frases reconocibles); título que no choque con una obra conocida.
- *Arte*: la portada del libro está definida.
- *Comité editorial*: lo aprueba el usuario (nombre y fecha). El agente nunca lo marca por su cuenta.

**6. Publicar.**
```bash
node scripts/libro_revisar.js <nombre>        # todos los capítulos deben dar ✔
node scripts/libro_publicar.js <nombre>       # simulacro: valida y muestra qué se escribiría
node scripts/libro_publicar.js <nombre> --apply   # SOLO con aprobación del usuario
```
La publicación usa la cuenta de servicio local (`serviceAccountKey.json`). El libro queda firmado "Timeless Editorial".

## Criterio de calidad (resumen)
- Escena antes que resumen; detalle concreto antes que adjetivo; diálogo que esquiva.
- Nada de "No era X. Era Y.", "como si" en cadena, finales que explican lo que el personaje entendió.
- Cada capítulo termina en movimiento (acción, frase dicha, objeto), no en una reflexión.
- Nombres de personajes propios de la región y la edad; nunca los de piloto automático (Elena, Mateo, Lucía…).
- No asociar empresas, instituciones o personas reales con delitos o escándalos: inventar el nombre.
- Los pilotos de referencia están en https://claude.ai/artifact/JgcHrkrEuBarfuf6bPvdnj

## Portada (Arte)
Cada libro de adultos lleva portada propia, en el estilo de casa (fotografía editorial, sobria, sin texto).
1. Definí el motivo en `encargo.json` → `"portada"` (un solo objeto o escena, con paleta).
2. `node scripts/libro_portada.js <nombre>` imprime el encargo de imagen. Generala con `antigravity_image` usando `assets/cover_memoria.png` como referencia de estilo y guardala en `libros/<nombre>/portada.png`.
3. Revisá que no tenga texto, rostros ni marcas. Si falla, repetí. Después optimizala a 720×720 JPEG (calidad 88) como `libros/<nombre>/portada.jpg`; el PNG queda de original.
4. `libro_publicar.js` exige `portada.jpg` y la copia a `assets/covers/`; hay que subir ese archivo a git junto con el libro. Los libros infantiles usan la tapa tipográfica del sitio, no portada de imagen.

## Continuidad entre capítulos
Cada capítulo tiene su ficha de continuidad. Es lo que evita que cambien nombres, edades, objetos o lo que sabe cada personaje.
1. Al terminar el capítulo N y pasarlo por `libro_revisar.js`: `node scripts/libro_prompt.js <nombre> resumen N` imprime el pedido. Guardá el resultado en `libros/<nombre>/cap-NN.resumen.txt`.
2. `libro_prompt.js <nombre> N+1` incluye solo esas fichas como biblia de la obra. Si falta alguna, no te da el encargo.
3. `libro_revisar.js` avisa de nombres nuevos que el plan no prevé y rechaza variantes de un mismo nombre (Inés / Ines).
4. `libro_publicar.js` exige las fichas de todos los capítulos.

## Qué revisa el detector (además del estilo)
Errores de redacción (espacios, signos desparejos, dequeísmo y queísmo, «habían» plural, muletillas), mezcla de voseo y tuteo, y argentinismos de decorado. Que pase el detector es el piso, no el techo: la lectura de un corrector humano sigue siendo el paso de Corrección de la ficha.

## Reescribir un libro que ya está en el catálogo
Los libros actuales (126) son esbozos de ~170 palabras por capítulo: hay que escribirlos de nuevo, no retocarlos.
1. `node scripts/catalogo_exportar.js --lista` muestra todos con su extensión actual (solo lectura).
2. `node scripts/catalogo_exportar.js <id>` (por ejemplo `fb2`) crea `libros/rev-<id>/` con el encargo en modo reemplazo, el texto viejo en `original/` y la ficha vacía.
3. Completá `encargo.json` (`tone`; la premisa viene del catálogo) y seguí los pasos de arriba: plan, capítulos, revisión, fichas de continuidad, control editorial.
4. `node scripts/libro_publicar.js rev-<id> --apply` **reemplaza** el libro conservando su id, portada y fecha de alta, y deja un respaldo del original en `../Backups/`. Mismas reglas: solo con la aprobación del usuario.
5. Si el libro cambia de cantidad de capítulos, el progreso guardado de algún lector puede quedar apuntando a uno que no existe.
Orden recomendado: primero `fb2` (La Memoria del Agua, el libro que muestra la portada del sitio); después un libro por formato. No hace falta reescribir los 126.
