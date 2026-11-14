'use strict';
// Utilidades compartidas por los scripts de libros (prompts, revisión y publicación).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { TIMELESS_WRITERS, TIMELESS_PROMPTS, TIMELESS_FORMATS, TIMELESS_FORMAT_FOR } = require('../prompts.js');

const ROOT = path.join(__dirname, '..', 'libros');
const pad = n => String(n).padStart(2, '0');

function dir(slug) {
  if (!slug || /[^a-z0-9_-]/i.test(slug)) { console.error('Uso: indicá el nombre de la carpeta del libro dentro de libros/ (solo letras, números, guiones).'); process.exit(2); }
  const d = path.join(ROOT, slug);
  if (!fs.existsSync(d)) { console.error(`No existe libros/${slug}/`); process.exit(2); }
  return d;
}
const readJson = (d, f) => { const p = path.join(d, f); if (!fs.existsSync(p)) { console.error(`Falta ${path.relative(process.cwd(), p)}`); process.exit(2); } return JSON.parse(fs.readFileSync(p, 'utf8')); };
const capFile = (d, n) => path.join(d, `cap-${pad(n)}.txt`);
const formatOf = enc => TIMELESS_FORMATS[TIMELESS_FORMAT_FOR[enc.cat] || 'novela'];
async function lint() { return import(pathToFileURL(path.join(__dirname, '..', 'assets', 'js', 'prose_lint.js')).href); }

module.exports = { fs, path, TIMELESS_WRITERS, TIMELESS_PROMPTS, TIMELESS_FORMATS, TIMELESS_FORMAT_FOR, ROOT, pad, dir, readJson, capFile, formatOf, lint };
