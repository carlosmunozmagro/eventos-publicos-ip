import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionar } from '../scripts/merge.mjs';
import { normalizarUrl, similitud } from '../scripts/lib/dedup.mjs';

const noticia = (o) => ({
  id: '2026-09-24-base', titulo: 'La OEPM lanza nuevas ayudas para patentes y modelos de utilidad',
  resumen: 'Resumen de prueba suficientemente largo.', fecha: '2026-09-24', fuente: 'OEPM',
  url: 'https://www.oepm.es/noticia-ayudas', categoria: 'patentes', ...o,
});
const evento = (o) => ({
  id: '2026-10-15-base', titulo: 'Jornada sobre el Sistema de Madrid para pymes', fecha_inicio: '2026-10-15',
  fecha_fin: '2026-10-15', hora: null, modalidad: 'online', ciudad: null, organizador: 'OEPM',
  url: 'https://www.oepm.es/evento-madrid', categoria: 'marcas', ...o,
});
const vacio = { noticias: [], eventos: [] };

test('normaliza URLs: www, barra final, parámetros de rastreo y https', () => {
  assert.equal(
    normalizarUrl('http://www.OEPM.es/Noticia-Ayudas/?utm_source=x&fbclid=y'),
    normalizarUrl('https://oepm.es/noticia-ayudas'),
  );
});

test('titulares parecidos puntúan alto y distintos bajo', () => {
  assert.ok(similitud('La OEPM lanza nuevas ayudas para patentes', 'Nuevas ayudas de la OEPM para patentes y modelos de utilidad') >= 0.6);
  assert.ok(similitud('La OEPM lanza nuevas ayudas para patentes', 'La EUIPO publica su informe anual de falsificaciones') < 0.3);
});

test('añade noticias nuevas con fecha de alta y no borra las existentes', () => {
  const r = fusionar({ ...vacio, noticias: [noticia()] }, { noticias: [noticia({ id: '2026-09-25-otra', titulo: 'El Supremo confirma la nulidad de una marca de vinos', url: 'https://ejemplo.es/supremo', categoria: 'litigios', fecha: '2026-09-25' })] }, '2026-09-27');
  assert.equal(r.noticias.length, 2);
  assert.equal(r.noticias[0].anadido, '2026-09-27');
  assert.deepEqual(r.informe.anadidas.length, 1);
});

test('misma URL con parámetros distintos → descartada', () => {
  const r = fusionar({ ...vacio, noticias: [noticia()] }, { noticias: [noticia({ id: '2026-09-24-copia', url: 'https://oepm.es/noticia-ayudas/?utm_campaign=news' })] });
  assert.equal(r.noticias.length, 1);
  assert.equal(r.informe.descartadas.length, 1);
});

test('misma noticia en otro medio → se guarda como fuente adicional', () => {
  const r = fusionar({ ...vacio, noticias: [noticia()] }, {
    noticias: [noticia({ id: '2026-09-25-expansion', titulo: 'Nuevas ayudas de la OEPM para patentes y modelos de utilidad', fuente: 'Expansión', url: 'https://expansion.com/ayudas-oepm', fecha: '2026-09-25' })],
  });
  assert.equal(r.noticias.length, 1);
  assert.deepEqual(r.noticias[0].otras_fuentes, [{ fuente: 'Expansión', url: 'https://expansion.com/ayudas-oepm' }]);
});

test('"mismo_que" fuerza la fusión aunque el titular sea muy distinto', () => {
  const r = fusionar({ ...vacio, noticias: [noticia()] }, {
    noticias: [noticia({ id: '2026-09-25-x', titulo: 'Dinero público para inventores españoles', fuente: 'El País', url: 'https://elpais.com/x', mismo_que: '2026-09-24-base' })],
  });
  assert.equal(r.noticias.length, 1);
  assert.equal(r.noticias[0].otras_fuentes[0].fuente, 'El País');
});

test('"mismo_que" con id inexistente → error', () => {
  const r = fusionar(vacio, { noticias: [noticia({ mismo_que: 'no-existe' })] });
  assert.equal(r.informe.errores.length, 1);
});

test('duplicados dentro del mismo lote se detectan', () => {
  const r = fusionar(vacio, { noticias: [noticia(), noticia({ id: '2026-09-24-bis', url: 'https://otro.es/a', fuente: 'Otro' })] });
  assert.equal(r.noticias.length, 1);
  assert.equal(r.noticias[0].otras_fuentes.length, 1);
});

test('mismo titular pero meses después NO es duplicado', () => {
  const r = fusionar({ ...vacio, noticias: [noticia()] }, { noticias: [noticia({ id: '2027-03-01-ayudas', fecha: '2027-03-01', url: 'https://www.oepm.es/ayudas-2027' })] });
  assert.equal(r.noticias.length, 2);
});

test('página índice compartida con titulares distintos NO es duplicado', () => {
  const idx = 'https://www.oepm.es/es/sobre-OEPM/noticias-y-eventos/eventos/';
  const r = fusionar({ ...vacio, eventos: [evento({ url: idx })] }, {
    eventos: [evento({ id: '2026-10-15-otro', titulo: 'Webinar sobre diseños industriales comunitarios', url: idx })],
  });
  assert.equal(r.eventos.length, 2);
});

test('evento repetido con más datos → se actualiza, no se duplica', () => {
  const r = fusionar({ ...vacio, eventos: [evento()] }, { eventos: [evento({ id: '2026-10-15-nuevo', hora: '10:00-12:00', ciudad: null })] }, '2026-09-28');
  assert.equal(r.eventos.length, 1);
  assert.equal(r.eventos[0].hora, '10:00-12:00');
  assert.equal(r.eventos[0].id, '2026-10-15-base');
  assert.equal(r.eventos[0].modificado, '2026-09-28');
});

test('evento aplazado (mismo título, otra fecha cercana) → se actualiza la fecha', () => {
  const r = fusionar({ ...vacio, eventos: [evento()] }, { eventos: [evento({ id: '2026-10-22-base', fecha_inicio: '2026-10-22', fecha_fin: '2026-10-22' })] });
  assert.equal(r.eventos.length, 1);
  assert.equal(r.eventos[0].fecha_inicio, '2026-10-22');
});

test('edición de otro año del mismo evento → evento nuevo', () => {
  const r = fusionar({ ...vacio, eventos: [evento()] }, { eventos: [evento({ id: '2027-10-14-base', fecha_inicio: '2027-10-14', fecha_fin: '2027-10-14', url: 'https://www.oepm.es/evento-madrid-2027' })] });
  assert.equal(r.eventos.length, 2);
});

test('ids repetidos con contenido distinto reciben sufijo', () => {
  const r = fusionar({ ...vacio, noticias: [noticia()] }, { noticias: [noticia({ titulo: 'La EUIPO publica su informe anual de falsificaciones', url: 'https://euipo.europa.eu/informe', fuente: 'EUIPO' })] });
  assert.deepEqual(r.noticias.map((n) => n.id).sort(), ['2026-09-24-base', '2026-09-24-base-2']);
});

// ---------- competencia ----------
const actividad = (o) => ({
  id: '2026-09-15-abg-granada', despacho: 'abg-ip', tipo: 'corporativo',
  titulo: 'ABG IP abre oficina en Granada, la quinta en España', resumen: 'Resumen de prueba suficientemente largo.',
  fecha: '2026-09-15', url: 'https://abg-ip.com/ip-firm-andalusia-granada/', ...o,
});
const conDespachos = (items = []) => ({ ...vacio, competencia: items, despachos: [{ id: 'abg-ip' }, { id: 'elzaburu' }] });

test('competencia: añade actividad nueva con fecha de alta', () => {
  const r = fusionar(conDespachos(), { competencia: [actividad()] }, '2026-09-27');
  assert.equal(r.competencia.length, 1);
  assert.equal(r.competencia[0].anadido, '2026-09-27');
});

test('competencia: misma URL → no se duplica', () => {
  const r = fusionar(conDespachos([actividad()]), { competencia: [actividad({ id: '2026-09-16-copia', url: 'https://www.abg-ip.com/ip-firm-andalusia-granada?utm_source=li' })] });
  assert.equal(r.competencia.length, 1);
  assert.equal(r.informe.descartadas.length, 1);
});

test('competencia: evento aplazado → se actualiza fecha_evento', () => {
  const ev = actividad({ id: '2026-07-07-abg-cat', tipo: 'evento', titulo: 'IP Perspectives Catalunya V', url: 'https://abg-ip.com/es/events/cat-v/', fecha_evento: '2026-11-11' });
  const r = fusionar(conDespachos([ev]), { competencia: [{ ...ev, fecha_evento: '2026-11-18' }] }, '2026-09-27');
  assert.equal(r.competencia.length, 1);
  assert.equal(r.competencia[0].fecha_evento, '2026-11-18');
  assert.equal(r.competencia[0].modificado, '2026-09-27');
});

test('competencia: titular parecido pero de otro despacho NO es duplicado', () => {
  const r = fusionar(conDespachos([actividad()]), { competencia: [actividad({ id: '2026-09-15-elz', despacho: 'elzaburu', url: 'https://elzaburu.com/granada' })] });
  assert.equal(r.competencia.length, 2);
});

test('competencia: despacho desconocido → error', () => {
  const r = fusionar(conDespachos(), { competencia: [actividad({ despacho: 'inventado' })] });
  assert.equal(r.competencia.length, 0);
  assert.equal(r.informe.errores.length, 1);
});

// ---------- concursos ----------
const concurso = (o) => ({
  id: '2026-07-17-bsc', tipo: 'licitacion', titulo: 'Asesoramiento legal en transferencia de tecnología del BSC',
  resumen: 'Resumen de prueba suficientemente largo.', organismo: 'BSC-CNS', fecha: '2026-07-17', fecha_limite: '2026-08-10',
  fuente: 'BOE', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-B-2026-24435', ...o,
});

test('concursos: plazo ampliado → se actualiza el existente, no se duplica', () => {
  const r = fusionar({ ...vacio, concursos: [concurso()] }, { concursos: [concurso({ id: '2026-07-20-bsc-ampliado', fecha_limite: '2026-08-24' })] }, '2026-09-27');
  assert.equal(r.concursos.length, 1);
  assert.equal(r.concursos[0].fecha_limite, '2026-08-24');
  assert.equal(r.concursos[0].modificado, '2026-09-27');
});

test('concursos: otro organismo con título parecido → concurso nuevo', () => {
  const r = fusionar({ ...vacio, concursos: [concurso()] }, { concursos: [concurso({ id: '2026-07-18-upc', organismo: 'UPC', url: 'https://ejemplo.es/upc' })] });
  assert.equal(r.concursos.length, 2);
});
