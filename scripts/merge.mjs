// Fusiona noticias y eventos candidatos con los datos existentes SIN borrar nada.
//
// Uso:  node scripts/merge.mjs [entrantes.json] [--dry-run]
//
// entrantes.json = { "noticias": [...], "eventos": [...], "competencia": [...], "concursos": [...] } con el
// mismo formato que data/*.json ("competencia" y "concursos" son sus respectivos "items").
// Opcional en cada candidato: "mismo_que": "<id existente>" para forzar la fusión con un elemento
// que el script no detecte como duplicado (p. ej. la misma noticia contada con otras palabras).
//
// Reglas:
//  - Noticia duplicada → no se añade; si viene de otra fuente se guarda en "otras_fuentes".
//  - Evento duplicado  → se actualizan los campos que hayan cambiado (fecha, hora, enlace…).
//  - Actividad de la competencia duplicada → se descarta; si es un evento, se actualizan sus datos.
//  - Concurso duplicado → se actualizan los campos cambiados (plazo ampliado, importe…).
//  - Nada se elimina: lo antiguo pasa al Historial de la web automáticamente por fecha.
import { readFileSync, writeFileSync } from 'node:fs';
import { noticiaDuplicada, eventoDuplicado, actividadDuplicada, concursoDuplicado, normalizarUrl } from './lib/dedup.mjs';

const CAMPOS_INTERNOS = new Set(['id', 'anadido', 'modificado', 'mismo_que', 'otras_fuentes']);

export function fusionar(existentes, entrantes, hoy = new Date().toISOString().slice(0, 10)) {
  const noticias = structuredClone(existentes.noticias);
  const eventos = structuredClone(existentes.eventos);
  const competencia = structuredClone(existentes.competencia || []);
  const concursos = structuredClone(existentes.concursos || []);
  const despachos = existentes.despachos ? new Set(existentes.despachos.map((d) => d.id)) : null;
  const informe = {
    anadidas: [], fusionadas: [], descartadas: [], eventosAnadidos: [], eventosActualizados: [],
    competenciaAnadida: [], competenciaActualizada: [], concursosAnadidos: [], concursosActualizados: [], errores: [],
  };

  const idsUsados = new Set([...noticias, ...eventos, ...competencia, ...concursos].map((i) => i.id));
  const idUnico = (id) => {
    let nuevo = id, n = 2;
    while (idsUsados.has(nuevo)) nuevo = `${id}-${n++}`;
    idsUsados.add(nuevo);
    return nuevo;
  };
  const buscarPorId = (lista, c, tipo) => {
    const t = lista.find((i) => i.id === c.mismo_que);
    if (!t) informe.errores.push(`${tipo} "${c.titulo}": mismo_que="${c.mismo_que}" no existe`);
    return t;
  };

  for (const c of entrantes.noticias || []) {
    const destino = c.mismo_que ? buscarPorId(noticias, c, 'Noticia') : noticias.find((n) => noticiaDuplicada(n, c));
    if (c.mismo_que && !destino) continue;
    if (destino) {
      const urlsConocidas = [destino.url, ...(destino.otras_fuentes || []).map((f) => f.url)].map(normalizarUrl);
      if (!urlsConocidas.includes(normalizarUrl(c.url))) {
        destino.otras_fuentes = [...(destino.otras_fuentes || []), { fuente: c.fuente, url: c.url }];
        informe.fusionadas.push(`${c.titulo} (${c.fuente}) → ${destino.id}`);
      } else {
        informe.descartadas.push(`${c.titulo} (ya existe como ${destino.id})`);
      }
      continue;
    }
    const { mismo_que, ...limpia } = c;
    noticias.push({ etiquetas: [], destacado: false, ...limpia, id: idUnico(c.id), anadido: hoy });
    informe.anadidas.push(`${c.titulo} (${c.fuente})`);
  }

  // Copia en el destino los campos que hayan cambiado; devuelve la lista de cambios
  const actualizar = (destino, c) => {
    const cambios = [];
    for (const [k, v] of Object.entries(c)) {
      if (CAMPOS_INTERNOS.has(k) || v == null || JSON.stringify(destino[k]) === JSON.stringify(v)) continue;
      cambios.push(`${k}: ${JSON.stringify(destino[k] ?? null)} → ${JSON.stringify(v)}`);
      destino[k] = v;
    }
    if (cambios.length) destino.modificado = hoy;
    return cambios;
  };

  for (const c of entrantes.eventos || []) {
    const destino = c.mismo_que ? buscarPorId(eventos, c, 'Evento') : eventos.find((e) => eventoDuplicado(e, c));
    if (c.mismo_que && !destino) continue;
    if (destino) {
      const cambios = actualizar(destino, c);
      if (cambios.length) informe.eventosActualizados.push(`${destino.id}: ${cambios.join('; ')}`);
      else informe.descartadas.push(`${c.titulo} (evento ya existe como ${destino.id})`);
      continue;
    }
    const { mismo_que, ...limpio } = c;
    eventos.push({ ...limpio, id: idUnico(c.id), anadido: hoy });
    informe.eventosAnadidos.push(`${c.titulo} (${c.fecha_inicio})`);
  }

  for (const c of entrantes.competencia || []) {
    if (despachos && !despachos.has(c.despacho)) {
      informe.errores.push(`Competencia "${c.titulo}": despacho "${c.despacho}" no está en data/competencia.json → despachos`);
      continue;
    }
    const destino = c.mismo_que ? buscarPorId(competencia, c, 'Competencia') : competencia.find((i) => actividadDuplicada(i, c));
    if (c.mismo_que && !destino) continue;
    if (destino) {
      // Solo los eventos cambian (aplazamientos, sede…); una publicación repetida se descarta sin tocar el original
      const cambios = destino.tipo === 'evento' ? actualizar(destino, c) : [];
      if (cambios.length) informe.competenciaActualizada.push(`${destino.id}: ${cambios.join('; ')}`);
      else informe.descartadas.push(`${c.titulo} (competencia, ya existe como ${destino.id})`);
      continue;
    }
    const { mismo_que, ...limpio } = c;
    competencia.push({ ...limpio, id: idUnico(c.id), anadido: hoy });
    informe.competenciaAnadida.push(`${c.titulo} (${c.despacho})`);
  }

  for (const c of entrantes.concursos || []) {
    const destino = c.mismo_que ? buscarPorId(concursos, c, 'Concurso') : concursos.find((i) => concursoDuplicado(i, c));
    if (c.mismo_que && !destino) continue;
    if (destino) {
      const cambios = actualizar(destino, c);
      if (cambios.length) informe.concursosActualizados.push(`${destino.id}: ${cambios.join('; ')}`);
      else informe.descartadas.push(`${c.titulo} (concurso, ya existe como ${destino.id})`);
      continue;
    }
    const { mismo_que, ...limpio } = c;
    concursos.push({ ...limpio, id: idUnico(c.id), anadido: hoy });
    informe.concursosAnadidos.push(`${c.titulo} (${c.organismo})`);
  }

  noticias.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  eventos.sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio) || a.id.localeCompare(b.id));
  competencia.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  concursos.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  return { noticias, eventos, competencia, concursos, informe };
}

// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const archivo = args.find((a) => !a.startsWith('--')) || 'entrantes.json';

  const leer = (f) => JSON.parse(readFileSync(f, 'utf8'));
  const docN = leer('data/noticias.json');
  const docE = leer('data/eventos.json');
  const docC = leer('data/competencia.json');
  const docK = leer('data/concursos.json');
  const entrantes = leer(archivo);

  const { noticias, eventos, competencia, concursos, informe } = fusionar(
    { noticias: docN.items, eventos: docE.items, competencia: docC.items, despachos: docC.despachos, concursos: docK.items },
    entrantes,
  );

  const seccion = (titulo, lista) => lista.length && console.log(`\n${titulo} (${lista.length}):\n  - ${lista.join('\n  - ')}`);
  seccion('Noticias añadidas', informe.anadidas);
  seccion('Noticias fusionadas como fuente adicional', informe.fusionadas);
  seccion('Eventos añadidos', informe.eventosAnadidos);
  seccion('Eventos actualizados', informe.eventosActualizados);
  seccion('Competencia añadida', informe.competenciaAnadida);
  seccion('Competencia actualizada', informe.competenciaActualizada);
  seccion('Concursos añadidos', informe.concursosAnadidos);
  seccion('Concursos actualizados', informe.concursosActualizados);
  seccion('Descartados por duplicados', informe.descartadas);
  seccion('ERRORES', informe.errores);

  if (informe.errores.length) process.exit(1);

  const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const cambiaN = informe.anadidas.length + informe.fusionadas.length > 0;
  const cambiaE = informe.eventosAnadidos.length + informe.eventosActualizados.length > 0;
  const cambiaC = informe.competenciaAnadida.length + informe.competenciaActualizada.length > 0;
  const cambiaK = informe.concursosAnadidos.length + informe.concursosActualizados.length > 0;
  if (!cambiaN && !cambiaE && !cambiaC && !cambiaK) { console.log('\nSin cambios.'); process.exit(0); }
  if (dryRun) { console.log('\n(--dry-run: no se ha escrito nada)'); process.exit(0); }

  const escribir = (f, doc, items) => writeFileSync(f, JSON.stringify({ ...doc, actualizado: ahora, items }, null, 2) + '\n');
  if (cambiaN) escribir('data/noticias.json', docN, noticias);
  if (cambiaE) escribir('data/eventos.json', docE, eventos);
  if (cambiaC) escribir('data/competencia.json', docC, competencia);
  if (cambiaK) escribir('data/concursos.json', docK, concursos);
  console.log('\nDatos actualizados. Ejecuta ahora: node scripts/validate.mjs');
}
