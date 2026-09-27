// Detección de duplicados compartida por merge.mjs y validate.mjs.
// Reglas deterministas: mismo enlace (normalizado) o títulos muy parecidos en fechas cercanas.

const STOPWORDS = new Set(`
  a al ante bajo con contra de del desde durante e el en entre hacia hasta la las le lo los mas para
  por que se segun sin sobre su sus tras un una unos unas y o u es son ha han sera como nuevo nueva
  the of and to in for on at by with from an is are its new
`.split(/\s+/).filter(Boolean));

const PARAMS_RASTREO = /^(utm_|fbclid$|gclid$|mc_|ref$|source$|at_)/i;

export function normalizarUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const params = [...url.searchParams].filter(([k]) => !PARAMS_RASTREO.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? '?' + new URLSearchParams(params).toString() : '';
    const path = decodeURI(url.pathname).replace(/\/+$/, '').toLowerCase();
    return host + path + qs;
  } catch {
    return String(u || '').trim().toLowerCase();
  }
}

export function tokens(texto) {
  return new Set(
    String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

/** Parecido entre dos títulos (0-1): el máximo entre Jaccard y un solapamiento ponderado. */
export function similitud(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  const jaccard = comunes / (A.size + B.size - comunes);
  // Un titular corto contenido casi entero en otro más largo también es duplicado
  const solape = Math.min(A.size, B.size) >= 4 ? comunes / Math.min(A.size, B.size) : 0;
  return Math.max(jaccard, solape * 0.9);
}

const dias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

export const UMBRAL_NOTICIA = 0.6;
export const UMBRAL_EVENTO = 0.5;

/** ¿Son la misma noticia? */
export function noticiaDuplicada(a, b) {
  const misma = normalizarUrl(a.url) === normalizarUrl(b.url);
  const sim = similitud(a.titulo, b.titulo);
  // Misma URL pero titular distinto suele ser una página índice (p. ej. "Noticias OEPM"): no es duplicado
  if (misma && sim >= 0.3) return true;
  return sim >= UMBRAL_NOTICIA && dias(a.fecha, b.fecha) <= 10;
}

/** ¿Son el mismo evento? */
export function eventoDuplicado(a, b) {
  const cerca = dias(a.fecha_inicio, b.fecha_inicio) <= 1;
  const sim = similitud(a.titulo, b.titulo);
  if (normalizarUrl(a.url) === normalizarUrl(b.url) && cerca && sim >= 0.3) return true;
  // Mismo título con fecha distinta: probablemente se ha aplazado → también es el mismo evento
  // (ventana de 3 semanas para no fusionar ediciones distintas de un ciclo mensual)
  if (sim >= 0.85 && dias(a.fecha_inicio, b.fecha_inicio) <= 21) return true;
  return cerca && sim >= UMBRAL_EVENTO;
}

/** ¿Es la misma publicación de un competidor? Mismo enlace, o mismo despacho con titular muy parecido. */
export function actividadDuplicada(a, b) {
  if (normalizarUrl(a.url) === normalizarUrl(b.url)) return true;
  return a.despacho === b.despacho && similitud(a.titulo, b.titulo) >= UMBRAL_NOTICIA && dias(a.fecha, b.fecha) <= 10;
}
