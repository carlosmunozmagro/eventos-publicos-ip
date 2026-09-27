// Valida data/noticias.json y data/eventos.json. Uso: node scripts/validate.mjs
// Sale con código 1 si hay errores (lo usa CI y la tarea programada antes de publicar).
import { readFileSync } from 'node:fs';
import { noticiaDuplicada, eventoDuplicado } from './lib/dedup.mjs';

const CATEGORIAS = ['marcas', 'patentes', 'disenos', 'derechos-autor', 'indicaciones-geograficas', 'litigios', 'normativa', 'institucional'];
const MODALIDADES = ['presencial', 'online', 'hibrido'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;
const errores = [];

const esFecha = (s) => typeof s === 'string' && FECHA.test(s) && !Number.isNaN(Date.parse(s));
const esUrl = (s) => { try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; } };
const texto = (v, min = 1, max = Infinity) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

function validar(archivo, reglas) {
  let doc;
  try { doc = JSON.parse(readFileSync(archivo, 'utf8')); } catch (e) { errores.push(`${archivo}: JSON inválido (${e.message})`); return; }
  if (!doc.actualizado || Number.isNaN(Date.parse(doc.actualizado))) errores.push(`${archivo}: "actualizado" debe ser fecha ISO`);
  if (!Array.isArray(doc.items)) { errores.push(`${archivo}: "items" debe ser un array`); return; }
  const ids = new Set(), urls = new Set();
  doc.items.forEach((it, i) => {
    const at = `${archivo}[${i}] (${it.id ?? 'sin id'})`;
    if (!ID.test(it.id || '')) errores.push(`${at}: id debe ser "AAAA-MM-DD-slug"`);
    if (ids.has(it.id)) errores.push(`${at}: id duplicado`);
    ids.add(it.id);
    if (!esUrl(it.url)) errores.push(`${at}: url inválida`);
    if (!CATEGORIAS.includes(it.categoria)) errores.push(`${at}: categoria "${it.categoria}" no está en ${CATEGORIAS.join(', ')}`);
    if (!texto(it.titulo, 5, 200)) errores.push(`${at}: titulo obligatorio (5-200 caracteres)`);
    if (it.anadido != null && !esFecha(it.anadido)) errores.push(`${at}: anadido debe ser AAAA-MM-DD`);
    if (it.modificado != null && !esFecha(it.modificado)) errores.push(`${at}: modificado debe ser AAAA-MM-DD`);
    reglas(it, at, urls);
  });
  buscarDuplicados(archivo, doc.items);
  console.log(`✓ ${archivo}: ${doc.items.length} elementos`);
}

// Compara cada elemento solo con los cercanos en fecha (los ficheros crecen sin límite).
function buscarDuplicados(archivo, items) {
  const esNoticia = archivo.includes('noticias');
  const fecha = (i) => (esNoticia ? i.fecha : i.fecha_inicio) || '';
  const iguales = esNoticia ? noticiaDuplicada : eventoDuplicado;
  const ventana = (esNoticia ? 10 : 21) * 864e5;
  const orden = items.filter((i) => esFecha(fecha(i))).sort((a, b) => fecha(a).localeCompare(fecha(b)));
  for (let i = 0; i < orden.length; i++) {
    for (let j = i + 1; j < orden.length && Date.parse(fecha(orden[j])) - Date.parse(fecha(orden[i])) <= ventana; j++) {
      if (iguales(orden[i], orden[j])) errores.push(`${archivo}: posible duplicado "${orden[i].id}" ≈ "${orden[j].id}" (fusiónalos o ajusta el título)`);
    }
  }
}

validar('data/noticias.json', (n, at, urls) => {
  if (!esFecha(n.fecha)) errores.push(`${at}: fecha AAAA-MM-DD obligatoria`);
  if (!texto(n.resumen, 20, 600)) errores.push(`${at}: resumen obligatorio (20-600 caracteres)`);
  if (!texto(n.fuente)) errores.push(`${at}: fuente obligatoria`);
  if (n.etiquetas && !Array.isArray(n.etiquetas)) errores.push(`${at}: etiquetas debe ser array`);
  if (n.otras_fuentes != null && !(Array.isArray(n.otras_fuentes) && n.otras_fuentes.every((f) => texto(f.fuente) && esUrl(f.url)))) {
    errores.push(`${at}: otras_fuentes debe ser [{ fuente, url }]`);
  }
  // Varias noticias pueden citar la misma página índice, pero no el mismo artículo con el mismo título
  const clave = n.url + '|' + n.titulo;
  if (urls.has(clave)) errores.push(`${at}: noticia duplicada`);
  urls.add(clave);
});

validar('data/eventos.json', (e, at) => {
  if (!esFecha(e.fecha_inicio)) errores.push(`${at}: fecha_inicio AAAA-MM-DD obligatoria`);
  if (e.fecha_fin != null && !esFecha(e.fecha_fin)) errores.push(`${at}: fecha_fin inválida`);
  if (esFecha(e.fecha_fin) && e.fecha_fin < e.fecha_inicio) errores.push(`${at}: fecha_fin anterior a fecha_inicio`);
  if (!MODALIDADES.includes(e.modalidad)) errores.push(`${at}: modalidad debe ser ${MODALIDADES.join('/')}`);
  if (e.modalidad !== 'online' && e.ciudad != null && !texto(e.ciudad)) errores.push(`${at}: ciudad vacía`);
  if (e.hora != null && !/^\d{2}:\d{2}(\s*[-–]\s*\d{2}:\d{2})?$/.test(e.hora)) errores.push(`${at}: hora debe ser "HH:MM" o "HH:MM-HH:MM"`);
});

if (errores.length) {
  console.error(`\n✗ ${errores.length} error(es):\n  - ` + errores.join('\n  - '));
  process.exit(1);
}
console.log('Datos válidos.');
