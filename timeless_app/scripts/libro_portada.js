// Arma el encargo de la portada de un libro (Arte). Uso: node scripts/libro_portada.js <libro>
// Imprime el prompt para el generador de imágenes. Guardá el resultado en libros/<libro>/portada.png
const L = require('./libro_lib');
const d = L.path.join(__dirname, '..', 'libros', process.argv[2] || '');
const enc = JSON.parse(L.fs.readFileSync(L.path.join(d, 'encargo.json'), 'utf8'));
if (!enc.portada) { console.error('Falta "portada" (concepto visual) en encargo.json'); process.exit(1); }
console.log(`Portada de libro de tapa dura, vista frontal, centrada, sobre fondo liso gris claro cálido (#e9e7e1), sombra suave. Cuadrado 1:1.
CONCEPTO DE LA IMAGEN DE TAPA: ${enc.portada}
ESTILO DE CASA (igual en todo el catálogo): fotografía editorial realista, grano fino, luz natural, paleta contenida y apagada, un único motivo con mucho espacio vacío, composición silenciosa. Tela de encuadernación lisa en el color dominante de la imagen, con lomo visible a la izquierda.
PROHIBIDO: texto, letras, números, logos, marcas, rostros, personas reconocibles, ilustración de dibujo animado, estética futurista, brillos o neón, efecto digital.`);
