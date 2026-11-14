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
