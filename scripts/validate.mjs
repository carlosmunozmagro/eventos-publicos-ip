// Valida data/noticias.json, eventos.json, competencia.json y concursos.json. Uso: node scripts/validate.mjs
// Sale con código 1 si hay errores (lo usa CI y la tarea programada antes de publicar).
import { readFileSync } from 'node:fs';
import { noticiaDuplicada, eventoDuplicado, actividadDuplicada, concursoDuplicado } from './lib/dedup.mjs';

const CATEGORIAS = ['marcas', 'patentes', 'disenos', 'derechos-autor', 'indicaciones-geograficas', 'litigios', 'normativa', 'institucional'];
const MODALIDADES = ['presencial', 'online', 'hibrido'];
const TIPOS = ['articulo', 'evento', 'reconocimiento', 'corporativo', 'adjudicacion'];
const TIPOS_CONCURSO = ['licitacion', 'convocatoria', 'premio', 'adjudicacion'];
const ESTADOS = ['abierta', 'cerrada', 'adjudicada'];
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

// Competencia: lista de despachos seguidos + su actividad pública (categoría opcional)
(function validarCompetencia(archivo = 'data/competencia.json') {
  let doc;
  try { doc = JSON.parse(readFileSync(archivo, 'utf8')); } catch (e) { errores.push(`${archivo}: JSON inválido (${e.message})`); return; }
  if (!doc.actualizado || Number.isNaN(Date.parse(doc.actualizado))) errores.push(`${archivo}: "actualizado" debe ser fecha ISO`);
  if (!Array.isArray(doc.despachos) || !Array.isArray(doc.items)) { errores.push(`${archivo}: "despachos" e "items" deben ser arrays`); return; }
  const despachos = new Set();
  doc.despachos.forEach((d, i) => {
    const at = `${archivo} despachos[${i}] (${d.id ?? 'sin id'})`;
    if (!/^[a-z0-9-]+$/.test(d.id || '')) errores.push(`${at}: id debe ser un slug`);
    if (despachos.has(d.id)) errores.push(`${at}: id duplicado`);
    despachos.add(d.id);
    if (!texto(d.nombre)) errores.push(`${at}: nombre obligatorio`);
    if (!esUrl(d.web)) errores.push(`${at}: web inválida`);
  });
  const ids = new Set();
  doc.items.forEach((it, i) => {
    const at = `${archivo}[${i}] (${it.id ?? 'sin id'})`;
    if (!ID.test(it.id || '')) errores.push(`${at}: id debe ser "AAAA-MM-DD-slug"`);
    if (ids.has(it.id)) errores.push(`${at}: id duplicado`);
    ids.add(it.id);
    if (!despachos.has(it.despacho)) errores.push(`${at}: despacho "${it.despacho}" no está en "despachos"`);
    if (!TIPOS.includes(it.tipo)) errores.push(`${at}: tipo debe ser ${TIPOS.join('/')}`);
    if (!texto(it.titulo, 5, 200)) errores.push(`${at}: titulo obligatorio (5-200 caracteres)`);
    if (!texto(it.resumen, 20, 600)) errores.push(`${at}: resumen obligatorio (20-600 caracteres)`);
    if (!esFecha(it.fecha)) errores.push(`${at}: fecha AAAA-MM-DD obligatoria`);
    if (!esUrl(it.url)) errores.push(`${at}: url inválida`);
    if (it.categoria != null && !CATEGORIAS.includes(it.categoria)) errores.push(`${at}: categoria "${it.categoria}" no válida`);
    if (it.fecha_evento != null && !esFecha(it.fecha_evento)) errores.push(`${at}: fecha_evento debe ser AAAA-MM-DD`);
    if (it.tipo === 'evento' && !esFecha(it.fecha_evento)) errores.push(`${at}: los eventos necesitan fecha_evento`);
    if (it.anadido != null && !esFecha(it.anadido)) errores.push(`${at}: anadido debe ser AAAA-MM-DD`);
    if (it.modificado != null && !esFecha(it.modificado)) errores.push(`${at}: modificado debe ser AAAA-MM-DD`);
  });
  const orden = doc.items.filter((i) => esFecha(i.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (let i = 0; i < orden.length; i++) {
    for (let j = i + 1; j < orden.length && Date.parse(orden[j].fecha) - Date.parse(orden[i].fecha) <= 10 * 864e5; j++) {
      if (actividadDuplicada(orden[i], orden[j])) errores.push(`${archivo}: posible duplicado "${orden[i].id}" ≈ "${orden[j].id}"`);
    }
  }
  console.log(`✓ ${archivo}: ${doc.despachos.length} despachos, ${doc.items.length} elementos`);
})();

// Concursos y licitaciones
(function validarConcursos(archivo = 'data/concursos.json') {
  let doc;
  try { doc = JSON.parse(readFileSync(archivo, 'utf8')); } catch (e) { errores.push(`${archivo}: JSON inválido (${e.message})`); return; }
  if (!doc.actualizado || Number.isNaN(Date.parse(doc.actualizado))) errores.push(`${archivo}: "actualizado" debe ser fecha ISO`);
  if (!Array.isArray(doc.items)) { errores.push(`${archivo}: "items" debe ser un array`); return; }
  const ids = new Set();
  doc.items.forEach((it, i) => {
    const at = `${archivo}[${i}] (${it.id ?? 'sin id'})`;
    if (!ID.test(it.id || '')) errores.push(`${at}: id debe ser "AAAA-MM-DD-slug"`);
    if (ids.has(it.id)) errores.push(`${at}: id duplicado`);
    ids.add(it.id);
    if (!TIPOS_CONCURSO.includes(it.tipo)) errores.push(`${at}: tipo debe ser ${TIPOS_CONCURSO.join('/')}`);
    if (!texto(it.titulo, 5, 250)) errores.push(`${at}: titulo obligatorio (5-250 caracteres)`);
    if (!texto(it.resumen, 20, 600)) errores.push(`${at}: resumen obligatorio (20-600 caracteres)`);
    if (!texto(it.organismo)) errores.push(`${at}: organismo obligatorio`);
    if (!texto(it.fuente)) errores.push(`${at}: fuente obligatoria`);
    if (!esFecha(it.fecha)) errores.push(`${at}: fecha AAAA-MM-DD obligatoria`);
    if (!esUrl(it.url)) errores.push(`${at}: url inválida`);
    for (const k of ['fecha_limite', 'fecha_adjudicacion', 'anadido', 'modificado']) {
      if (it[k] != null && !esFecha(it[k])) errores.push(`${at}: ${k} debe ser AAAA-MM-DD`);
    }
    if (it.estado != null && !ESTADOS.includes(it.estado)) errores.push(`${at}: estado debe ser ${ESTADOS.join('/')}`);
    if (it.tipo === 'adjudicacion' && !texto(it.adjudicatario)) errores.push(`${at}: las adjudicaciones necesitan adjudicatario`);
    if (['licitacion', 'convocatoria', 'premio'].includes(it.tipo) && !it.fecha_limite && !it.estado) {
      errores.push(`${at}: indica fecha_limite o, si no se conoce, "estado"`);
    }
    if (it.categoria != null && !CATEGORIAS.includes(it.categoria)) errores.push(`${at}: categoria "${it.categoria}" no válida`);
  });
  const orden = doc.items.filter((i) => esFecha(i.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (let i = 0; i < orden.length; i++) {
    for (let j = i + 1; j < orden.length && Date.parse(orden[j].fecha) - Date.parse(orden[i].fecha) <= 30 * 864e5; j++) {
      if (concursoDuplicado(orden[i], orden[j])) errores.push(`${archivo}: posible duplicado "${orden[i].id}" ≈ "${orden[j].id}"`);
    }
  }
  console.log(`✓ ${archivo}: ${doc.items.length} elementos`);
})();

if (errores.length) {
  console.error(`\n✗ ${errores.length} error(es):\n  - ` + errores.join('\n  - '));
  process.exit(1);
}
console.log('Datos válidos.');
