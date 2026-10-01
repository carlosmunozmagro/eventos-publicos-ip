// Informes PDF por sección y periodo (semana, mes o año), con estadísticas y conclusiones para PONS IP.
// Se generan en el navegador a partir de data/*.json; el título, las conclusiones y las notas son
// editables antes de descargar (Guardar como PDF del diálogo de impresión).
(() => {
  'use strict';

  const SECCIONES = {
    noticias: 'Noticias', pons: 'PONS IP', competencia: 'Competencia',
    concursos: 'Concursos y licitaciones', eventos: 'Eventos',
  };
  const CATEGORIAS = {
    'marcas': 'Marcas', 'patentes': 'Patentes', 'disenos': 'Diseños', 'derechos-autor': 'Derechos de autor',
    'indicaciones-geograficas': 'Indicaciones geográficas', 'litigios': 'Litigios', 'normativa': 'Normativa',
    'institucional': 'Institucional',
  };
  const TIPOS = {
    evento: 'Eventos', reconocimiento: 'Premios y rankings', adjudicacion: 'Contratos públicos',
    corporativo: 'Movimientos', caso: 'Casos de éxito', articulo: 'Artículos',
  };
  const TIPOS_CONCURSO = { licitacion: 'Licitaciones', convocatoria: 'Ayudas y subvenciones', premio: 'Premios', adjudicacion: 'Adjudicaciones' };
  const MODALIDAD = { presencial: 'Presencial', online: 'Online', hibrido: 'Híbrido' };
  const TIPO_CONCURSO_UNO = { licitacion: 'Licitación', convocatoria: 'Ayuda o subvención', premio: 'Premio', adjudicacion: 'Adjudicación' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, props = {}, ...hijos) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...hijos.flat().filter((h) => h != null && h !== false));
    return n;
  };
  const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const UNO = { evento: 'evento', reconocimiento: 'premio o ranking', adjudicacion: 'contrato público', corporativo: 'movimiento', caso: 'caso de éxito', articulo: 'artículo' };
  const VARIOS = { evento: 'eventos', reconocimiento: 'premios o rankings', adjudicacion: 'contratos públicos', corporativo: 'movimientos', caso: 'casos de éxito', articulo: 'artículos' };
  const tipoUno = (t) => (UNO[t] || t).replace(/^./, (c) => c.toUpperCase());
  // "Despacho: título" sin repetir el nombre cuando el título ya empieza por él
  const conFirma = (c) => (c.titulo.toLowerCase().replace(/\s/g, '').startsWith(c.fuente.toLowerCase().replace(/\s/g, '')) ? c.titulo : `${c.fuente}: ${c.titulo}`);
  const cuantos = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const deTipo = (tipo, n) => cuantos(n, UNO[tipo] || tipo, VARIOS[tipo] || tipo);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const decimal = (x) => x.toFixed(1).replace('.', ',').replace(',0', '');
  const lista = (arr, max = 3) => {
    const a = arr.slice(0, max);
    const resto = arr.length - a.length;
    const txt = a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a.join('');
    return resto > 0 ? `${txt} (y ${resto} más)` : txt;
  };
  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem('ipes:informe:' + key) || 'null');
      if (value === null) localStorage.removeItem('ipes:informe:' + key);
      else localStorage.setItem('ipes:informe:' + key, JSON.stringify(value));
    } catch { /* almacenamiento no disponible */ }
    return null;
  }

  // ---------- fechas y periodos ----------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fecha = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  const fmtLargo = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

  function semanaISO(d) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dia = (t.getDay() + 6) % 7;            // lunes = 0
    t.setDate(t.getDate() - dia + 3);            // jueves de esa semana
    const primerJueves = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - primerJueves) / 864e5 - 3 + ((primerJueves.getDay() + 6) % 7)) / 7);
  }

  // Periodo que contiene la fecha "ref"
  function periodo(tipo, ref) {
    let ini, fin, etiqueta, clave;
    if (tipo === 'semana') {
      ini = new Date(ref); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7));
      fin = new Date(ini); fin.setDate(fin.getDate() + 6);
      etiqueta = `Semana ${semanaISO(ini)} · ${fmtDia.format(ini)} – ${fmtLargo.format(fin)}`;
      clave = iso(ini);
    } else if (tipo === 'mes') {
      ini = new Date(ref.getFullYear(), ref.getMonth(), 1);
      fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      etiqueta = fmtMes.format(ini).replace(' de ', ' ').replace(/^./, (c) => c.toUpperCase());
      clave = iso(ini).slice(0, 7);
    } else {
      ini = new Date(ref.getFullYear(), 0, 1);
      fin = new Date(ref.getFullYear(), 11, 31);
      etiqueta = 'Año ' + ref.getFullYear();
      clave = String(ref.getFullYear());
    }
    return { tipo, ini: iso(ini), fin: iso(fin), etiqueta, clave, ref: new Date(ini) };
  }

  function anterior(p) {
    const r = new Date(p.ref);
    if (p.tipo === 'semana') r.setDate(r.getDate() - 7);
    else if (p.tipo === 'mes') r.setMonth(r.getMonth() - 1);
    else r.setFullYear(r.getFullYear() - 1);
    return periodo(p.tipo, r);
  }

  function opcionesPeriodo(tipo, primerAnio) {
    const hoy = new Date();
    const out = [];
    let p = periodo(tipo, hoy);
    const n = tipo === 'semana' ? 26 : tipo === 'mes' ? 18 : Math.max(1, hoy.getFullYear() - primerAnio + 1);
    for (let i = 0; i < n; i++) { out.push(p); p = anterior(p); }
    return out;
  }

  const dentro = (f, p) => f && f >= p.ini && f <= p.fin;

  // ---------- datos ----------
  let datos = null;
  async function cargar() {
    const json = (u) => fetch(u, { cache: 'no-cache' }).then((r) => r.json());
    const [n, e, c, k] = await Promise.all([
      json('data/noticias.json'), json('data/eventos.json'),
      json('data/competencia.json').catch(() => ({ despachos: [], items: [] })),
      json('data/concursos.json').catch(() => ({ items: [] })),
    ]);
    const propio = c.despachos.find((d) => d.propio) || null;
    const nombre = new Map(c.despachos.map((d) => [d.id, d.nombre]));
    const comp = c.items.map((i) => ({ ...i, fuente: nombre.get(i.despacho) || i.despacho }));
    datos = {
      noticias: n.items, eventos: e.items, concursos: k.items, propio,
      despachos: c.despachos.filter((d) => !d.propio),
      pons: comp.filter((i) => i.despacho === propio?.id),
      competencia: comp.filter((i) => i.despacho !== propio?.id),
    };
    const anios = [...n.items.map((i) => i.fecha), ...comp.map((i) => i.fecha), ...k.items.map((i) => i.fecha)]
      .filter(Boolean).map((f) => +f.slice(0, 4));
    datos.primerAnio = Math.min(...anios, new Date().getFullYear());
    return datos;
  }

  const comparable = (i) => i.relevante !== false;
  const hoyIso = () => iso(new Date());
  const diasHasta = (f) => Math.round((fecha(f) - fecha(hoyIso())) / 864e5);
  const tokens = (t) => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const parecido = (a, b) => { const A = tokens(a), B = tokens(b); let c = 0; A.forEach((w) => B.has(w) && c++); return c / Math.max(1, Math.min(A.size, B.size)); };

  // Estado de un concurso (mismo criterio que la web): en curso con plazo abierto, en curso pendiente de
  // adjudicar (licitación con plazo vencido sin adjudicación conocida), adjudicado o cerrado
  function estadoConcurso(k) {
    if (k.estado) return k.estado;
    if (k.tipo === 'adjudicacion') return 'adjudicada';
    const adj = datos.concursos.some((a) => a.tipo === 'adjudicacion' && a.organismo === k.organismo && parecido(a.titulo, k.titulo) >= 0.5);
    if (adj) return 'adjudicada';
    if (k.fecha_limite && k.fecha_limite >= hoyIso()) return 'abierta';
    if (k.tipo === 'licitacion') return 'pendiente';
    return k.fecha_limite ? 'cerrada' : 'abierta';
  }
  const ESTADO_TXT = { abierta: 'En curso · plazo abierto', pendiente: 'En curso · pendiente de adjudicar', adjudicada: 'Adjudicado', cerrada: 'Cerrado' };

  // Etiqueta corta de un periodo para las series de evolución
  const corta = (p) => (p.tipo === 'semana' ? `S${semanaISO(fecha(p.ini))} ${fmtDia.format(fecha(p.ini))}` : p.tipo === 'mes' ? fmtMes.format(fecha(p.ini)).replace(' de ', ' ') : p.clave);

  // Evolución de una métrica en los últimos n periodos (el actual al final)
  function evolucion(p, medir, n = 6) {
    const ps = [p];
    for (let i = 1; i < n; i++) ps.unshift(anterior(ps[0]));
    const filas = ps.map((x) => [corta(x), medir(x)]);
    return { filas, nodo: barras(filas, { resaltar: corta(p) }) };
  }

  // Lista detallada: título enlazado, línea de datos y resumen
  function detalle(items, meta, texto = (i) => i.resumen || i.descripcion) {
    return el('ol', { className: 'r-detail' }, items.map((i) => el('li', {},
      el('p', { className: 'r-detail__title' }, enlace(i.titulo, i.url)),
      el('p', { className: 'r-detail__meta', textContent: meta(i) }),
      texto(i) ? el('p', { className: 'r-detail__text', textContent: texto(i) }) : null)));
  }

  const METODOLOGIA = {
    noticias: 'Noticias de propiedad industrial e intelectual con impacto en España, verificadas en la fuente original (OEPM, EUIPO, OMPI, BOE, tribunales y prensa especializada). Cuando varios medios publican el mismo hecho se cuenta una sola noticia y el resto figura como fuente adicional.',
    eventos: 'Agenda de jornadas, webinars y ferias de PI con fecha confirmada (principalmente agenda oficial de la OEPM, EUIPO, EPO y organizadores). La ciudad y la modalidad proceden de la ficha del evento; los eventos de la competencia se toman de sus webs.',
    competencia: 'Actividad pública de los despachos competidores (webs, notas de prensa y prensa jurídica). Solo cuentan las publicaciones comparables: se excluyen guías genéricas y temas ajenos a la PI, con el mismo criterio para PONS IP y para cada competidor.',
    pons: 'Publicaciones de ponsip.com. Las comparables siguen el mismo criterio editorial que se aplica a la competencia; el resto se muestran pero no cuentan en el puesto ni en la cuota de actividad.',
    concursos: 'Licitaciones, ayudas, premios y adjudicaciones de PI publicados en el BOE (CPV 70332300, 79120000 y 79110000) y por EUIPO, EPO y OEPM. «Pendiente de adjudicar»: licitación con plazo vencido sin adjudicación publicada todavía.',
  };

  // ---------- piezas del informe ----------
  function delta(actual, previo) {
    if (previo == null) return '';
    const d = actual - previo;
    if (d === 0) return '= que el periodo anterior';
    return `${d > 0 ? '+' : '−'}${Math.abs(d)} vs periodo anterior`;
  }

  function kpis(lista) {
    return el('ul', { className: 'r-kpis' }, lista.map(([v, t, d]) =>
      el('li', {}, el('strong', { textContent: v }), el('span', { textContent: t }), d ? el('small', { textContent: d }) : null)));
  }

  // Barras horizontales: [[etiqueta, valor, valorAnterior?]]
  function barras(filas, { formato = (v) => v, resaltar = null } = {}) {
    const max = Math.max(1, ...filas.map((f) => f[1]));
    return el('div', { className: 'r-bars' }, filas.map(([t, v, prev]) =>
      el('div', { className: 'r-bar' + (resaltar === t ? ' r-bar--propia' : '') },
        el('span', { className: 'r-bar__label', textContent: t }),
        el('span', { className: 'r-bar__track' }, el('span', { className: 'r-bar__fill', style: `width:${Math.max(2, (v / max) * 100)}%` })),
        el('span', { className: 'r-bar__value', textContent: formato(v) + (prev != null ? ` (${prev})` : '') }))));
  }

  function tabla(cols, filas, { claseFila } = {}) {
    return el('table', { className: 'r-table' },
      el('thead', {}, el('tr', {}, cols.map((c) => el('th', { textContent: c })))),
      el('tbody', {}, filas.map((f, i) => el('tr', { className: claseFila ? claseFila(f, i) : '' },
        f.map((c) => (c instanceof Node ? el('td', {}, c) : el('td', { textContent: c ?? '–' })))))));
  }

  const bloque = (titulo, ...contenido) => el('section', { className: 'r-block' }, el('h2', { textContent: titulo }), ...contenido);
  const vacio = (txt) => el('p', { className: 'r-empty', textContent: txt });
  const enlace = (texto, url) => el('a', { href: url, textContent: texto, target: '_blank', rel: 'noopener' });
  const contar = (arr, fn) => arr.reduce((m, i) => { const k = fn(i); if (k) m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  const ordenado = (mapa) => [...mapa.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'));

  // ---------- secciones ----------
  function informeNoticias(p, pa) {
    const act = datos.noticias.filter((n) => dentro(n.fecha, p));
    const prev = datos.noticias.filter((n) => dentro(n.fecha, pa));
    const porCat = contar(act, (n) => n.categoria);
    const porCatPrev = contar(prev, (n) => n.categoria);
    const porFuente = contar(act, (n) => n.fuente);
    const destacadas = act.filter((n) => n.destacado);
    const eco = act.filter((n) => n.otras_fuentes?.length).sort((a, b) => b.otras_fuentes.length - a.otras_fuentes.length);
    const ponsAct = datos.pons.filter((i) => dentro(i.fecha, p));
    const porEtiqueta = contar(act.flatMap((n) => n.etiquetas || []), (t) => t);
    const evo = evolucion(p, (x) => datos.noticias.filter((n) => dentro(n.fecha, x)).length);

    const concl = [];
    if (!act.length) concl.push('No se registraron noticias en el periodo.');
    else {
      const cats = ordenado(porCat);
      const [top, n] = cats[0];
      if (cats.length > 1 && cats[1][1] === n) concl.push(`Actualidad repartida entre ${cats.length} categorías, sin un tema dominante (${lista(cats.map(([k, v]) => `${CATEGORIAS[k] || k} ${v}`), 4)}).`);
      else concl.push(`La actualidad se concentró en ${CATEGORIAS[top] || top}: ${n} de ${act.length} noticias (${pct(n, act.length)} %).`);
      if (prev.length) concl.push(`Volumen de actualidad: ${act.length} noticias frente a ${prev.length} en el periodo anterior (${act.length >= prev.length ? 'más' : 'menos'} actividad en el sector).`);
      const norma = act.filter((n) => n.categoria === 'normativa');
      if (norma.length) concl.push(`${cuantos(norma.length, 'novedad normativa', 'novedades normativas')}: ${lista(norma.map((n) => `«${n.titulo}»`), 2)}. Conviene revisarlas con el área jurídica y valorar una alerta a clientes.`);
      const lit = act.filter((n) => n.categoria === 'litigios');
      if (lit.length) concl.push(`${cuantos(lit.length, 'resolución judicial relevante', 'resoluciones judiciales relevantes')}: material para un artículo de análisis en PONS IP News.`);
      if (eco.length) concl.push(`La noticia con más eco fue «${eco[0].titulo}» (${eco[0].otras_fuentes.length + 1} medios).`);
      for (const cat of ['marcas', 'patentes', 'disenos']) {
        const nCat = porCat.get(cat) || 0;
        if (nCat >= 2 && !ponsAct.some((i) => i.categoria === cat)) concl.push(`Oportunidad de contenido: ${nCat} noticias de ${CATEGORIAS[cat].toLowerCase()} y ninguna publicación de PONS IP sobre el tema en el periodo.`);
      }
    }
    return {
      kpis: kpis([
        [act.length, 'noticias', delta(act.length, prev.length)],
        [destacadas.length, 'destacadas'],
        [porCat.size, 'categorías'],
        [porFuente.size, 'fuentes'],
      ]),
      resumen: act.length
        ? `En el periodo se registraron ${cuantos(act.length, 'noticia', 'noticias')} de propiedad industrial e intelectual (${delta(act.length, prev.length) || 'sin periodo anterior comparable'}), procedentes de ${cuantos(porFuente.size, 'fuente', 'fuentes')}. ${concl[0]}`
        : 'No se registraron noticias de propiedad industrial e intelectual en el periodo.',
      bloques: [
        bloque('Evolución del volumen de noticias', evo.nodo, el('p', { className: 'r-note', textContent: 'Número de noticias registradas en cada periodo; resaltado, el periodo del informe.' })),
        bloque('Noticias por categoría', act.length
          ? barras(ordenado(porCat).map(([k, v]) => [CATEGORIAS[k] || k, v, porCatPrev.get(k) || 0]))
          : vacio('Sin noticias en el periodo.'), el('p', { className: 'r-note', textContent: 'Entre paréntesis, el periodo anterior.' })),
        bloque('Fuentes principales', act.length ? barras(ordenado(porFuente).slice(0, 8)) : vacio('—')),
        porEtiqueta.size ? bloque('Temas y organismos más citados', barras(ordenado(porEtiqueta).slice(0, 10))) : null,
        destacadas.length ? bloque('Noticias destacadas', detalle(destacadas, (n) => `${fmtLargo.format(fecha(n.fecha))} · ${n.fuente} · ${CATEGORIAS[n.categoria] || n.categoria}`)) : null,
        eco.length ? bloque('Noticias con más eco en medios', tabla(['Noticia', 'Medios'], eco.slice(0, 5).map((n) => [enlace(n.titulo, n.url), [n.fuente, ...n.otras_fuentes.map((f) => f.fuente)].join(', ')]))) : null,
      ],
      conclusiones: concl,
      anexo: detalle(act.sort((a, b) => b.fecha.localeCompare(a.fecha)),
        (n) => [fmtLargo.format(fecha(n.fecha)), n.fuente, CATEGORIAS[n.categoria] || n.categoria, n.otras_fuentes?.length ? `también en ${n.otras_fuentes.map((f) => f.fuente).join(', ')}` : null].filter(Boolean).join(' · ')),
      nAnexo: act.length,
    };
  }

  // Filtro por ciudad del informe de eventos ('' = todas, 'online' = solo online)
  const enCiudad = (e) => !ui.ciudad || (ui.ciudad === 'online' ? e.modalidad === 'online' : e.ciudad === ui.ciudad);
  const lugarEv = (e) => [MODALIDAD[e.modalidad] || e.modalidad, e.ciudad].filter(Boolean).join(' · ');

  function informeEventos(p, pa) {
    const act = datos.eventos.filter((e) => dentro(e.fecha_inicio, p) && enCiudad(e));
    const prev = datos.eventos.filter((e) => dentro(e.fecha_inicio, pa) && enCiudad(e));
    const porModalidad = contar(act, (e) => MODALIDAD[e.modalidad] || e.modalidad);
    const evo = evolucion(p, (x) => datos.eventos.filter((e) => dentro(e.fecha_inicio, x) && enCiudad(e)).length);
    const finSig = iso(new Date(fecha(p.fin).getTime() + 30 * 864e5));
    const siguientes = datos.eventos.filter((e) => e.fecha_inicio > p.fin && e.fecha_inicio <= finSig && enCiudad(e))
      .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
    const presenciales = act.filter((e) => e.modalidad !== 'online');
    const porCiudad = contar(presenciales, (e) => e.ciudad);
    const porOrg = contar(act, (e) => e.organizador);
    const porCat = contar(act, (e) => e.categoria);
    const ciudadOk = (c) => !ui.ciudad || (ui.ciudad !== 'online' && c.ciudad && c.ciudad.includes(ui.ciudad.replace(/\s*\(.*$/, '')));
    const compEv = datos.competencia.filter((c) => c.tipo === 'evento' && dentro(c.fecha_evento, p) && ciudadOk(c));
    const ponsEv = datos.pons.filter((c) => c.tipo === 'evento' && dentro(c.fecha_evento, p) && ciudadOk(c));

    const concl = [];
    if (ui.ciudad) concl.push(`Informe filtrado: ${ui.ciudad === 'online' ? 'solo eventos online' : 'solo eventos en ' + ui.ciudad}.`);
    if (!act.length) concl.push('No hay eventos del sector registrados en el periodo.');
    else {
      concl.push(`${act.length} eventos en el periodo: ${presenciales.length} presenciales y ${act.length - presenciales.length} online; ${act.filter((e) => e.gratuito).length} gratuitos.`);
      if (porCiudad.size) concl.push(`Los eventos presenciales se concentran en ${lista(ordenado(porCiudad).map(([c, n]) => `${c} (${n})`))}.`);
      const inst = act.filter((e) => /OEPM|EUIPO|OMPI|EPO/.test(e.organizador || ''));
      if (inst.length) concl.push(`${inst.length} eventos organizados por oficinas de PI (OEPM, EUIPO, OMPI): buena ocasión para relación institucional y visibilidad de PONS IP.`);
    }
    if (compEv.length) concl.push(`La competencia participa en ${cuantos(compEv.length, 'evento', 'eventos')} del periodo: ${lista(compEv.map((c) => `${c.fuente} en «${c.titulo}»`), 3)}. Valorar presencia de PONS IP donde coincidan clientes objetivo.`);
    if (ponsEv.length) concl.push(`PONS IP participa en ${lista(ponsEv.map((c) => `«${c.titulo}»`))}.`);
    const sinPons = presenciales.filter((e) => !ponsEv.some((c) => c.fecha_evento === e.fecha_inicio)).slice(0, 3);
    if (sinPons.length && act.length) concl.push(`Eventos presenciales a valorar para networking: ${lista(sinPons.map((e) => `«${e.titulo}» (${[fmtDia.format(fecha(e.fecha_inicio)), e.ciudad].filter(Boolean).join(', ')})`), 3)}.`);
    if (siguientes.length) concl.push(`En los 30 días siguientes al periodo hay ${cuantos(siguientes.length, 'evento', 'eventos')} más: conviene planificar asistencia e inscripciones con antelación.`);

    return {
      kpis: kpis([
        [act.length, 'eventos', delta(act.length, prev.length)],
        [presenciales.length, 'presenciales'],
        [act.length - presenciales.length, 'online'],
        [compEv.length, 'con competidores'],
      ]),
      resumen: act.length
        ? `${ui.ciudad ? (ui.ciudad === 'online' ? 'Eventos online' : 'Eventos en ' + ui.ciudad) + ': ' : ''}${cuantos(act.length, 'evento', 'eventos')} de propiedad industrial e intelectual en el periodo (${delta(act.length, prev.length) || 'sin periodo anterior comparable'}): ${presenciales.length} con asistencia presencial y ${act.length - presenciales.length} online, organizados por ${cuantos(porOrg.size, 'entidad', 'entidades')}.`
        : `No hay eventos registrados en el periodo${ui.ciudad ? ' para el filtro elegido' : ''}.`,
      bloques: [
        bloque('Evolución del número de eventos', evo.nodo),
        porCiudad.size ? bloque('Eventos presenciales por ciudad', barras(ordenado(porCiudad))) : null,
        porModalidad.size ? bloque('Modalidad', barras(ordenado(porModalidad))) : null,
        bloque('Eventos por temática', act.length ? barras(ordenado(porCat).map(([k, v]) => [CATEGORIAS[k] || k, v])) : vacio('—')),
        bloque('Organizadores', act.length ? barras(ordenado(porOrg).slice(0, 8)) : vacio('—')),
        compEv.length ? bloque('Eventos con presencia de la competencia', tabla(['Fecha', 'Despacho', 'Evento', 'Ciudad'],
          compEv.sort((a, b) => a.fecha_evento.localeCompare(b.fecha_evento)).map((c) => [fmtDia.format(fecha(c.fecha_evento)), c.fuente, enlace(c.titulo, c.url), c.ciudad || '–']))) : null,
        siguientes.length ? bloque('Próximos 30 días tras el periodo', tabla(['Fecha', 'Evento', 'Lugar', 'Organiza'],
          siguientes.map((e) => [fmtDia.format(fecha(e.fecha_inicio)), enlace(e.titulo, e.url), lugarEv(e), e.organizador || '–']))) : null,
      ],
      conclusiones: concl,
      anexo: detalle(act.sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)),
        (e) => [
          e.fecha_fin && e.fecha_fin !== e.fecha_inicio ? `${fmtDia.format(fecha(e.fecha_inicio))} – ${fmtLargo.format(fecha(e.fecha_fin))}` : fmtLargo.format(fecha(e.fecha_inicio)),
          e.hora, lugarEv(e), e.organizador, e.gratuito ? 'Gratuito' : null,
        ].filter(Boolean).join(' · ')),
      nAnexo: act.length,
    };
  }

  // Filas de actividad comparable por despacho (competidores + PONS IP) en un periodo
  function ranking(p) {
    const filas = datos.despachos.map((d) => ({ id: d.id, nombre: d.nombre, items: datos.competencia.filter((c) => c.despacho === d.id && comparable(c) && dentro(c.fecha, p)) }));
    if (datos.propio) filas.push({ id: datos.propio.id, nombre: datos.propio.nombre, propio: true, items: datos.pons.filter((c) => comparable(c) && dentro(c.fecha, p)) });
    return filas.sort((a, b) => b.items.length - a.items.length || a.nombre.localeCompare(b.nombre, 'es'));
  }

  function informeCompetencia(p, pa) {
    const act = datos.competencia.filter((c) => comparable(c) && dentro(c.fecha, p));
    const prev = datos.competencia.filter((c) => comparable(c) && dentro(c.fecha, pa));
    const rk = ranking(p);
    const rkPrev = new Map(ranking(pa).map((f) => [f.id, f.items.length]));
    const porTipo = contar(act, (c) => c.tipo);
    const contratos = datos.concursos.filter((k) => k.tipo === 'adjudicacion' && dentro(k.fecha, p));
    const rivales = rk.filter((f) => !f.propio);
    const activos = rivales.filter((f) => f.items.length);
    const propia = rk.find((f) => f.propio);
    const media = rivales.length ? rivales.reduce((s, f) => s + f.items.length, 0) / rivales.length : 0;
    const evo = evolucion(p, (x) => datos.competencia.filter((c) => comparable(c) && dentro(c.fecha, x)).length);
    const agenda = datos.competencia.filter((c) => c.tipo === 'evento' && c.fecha_evento && c.fecha_evento >= p.ini)
      .sort((a, b) => a.fecha_evento.localeCompare(b.fecha_evento)).slice(0, 12);

    const concl = [];
    if (!act.length) concl.push('No se registró actividad pública de la competencia en el periodo.');
    else {
      const top = activos[0];
      concl.push(`${top.nombre} fue el competidor más activo con ${cuantos(top.items.length, 'publicación', 'publicaciones')} (${lista(ordenado(contar(top.items, (c) => c.tipo)).map(([t, n]) => deTipo(t, n)))}).`);
      concl.push(`${activos.length} de ${rivales.length} competidores tuvieron actividad; ${act.length} publicaciones en total (${delta(act.length, prev.length).replace('vs periodo anterior', 'respecto al periodo anterior')}).`);
    }
    if (propia) {
      const puesto = 1 + rivales.filter((f) => f.items.length > propia.items.length).length;
      concl.push(`PONS IP: ${propia.items.length} publicaciones comparables, puesto ${puesto} de ${rk.length} (media de los competidores: ${decimal(media)}).`);
    }
    const premios = act.filter((c) => c.tipo === 'reconocimiento');
    if (premios.length) concl.push(`Reconocimientos de la competencia: ${lista(premios.map((c) => `${c.fuente} (${c.titulo})`), 3)}. Revisar que PONS IP presente candidatura en esos rankings.`);
    const movs = act.filter((c) => c.tipo === 'corporativo');
    if (movs.length) concl.push(`Movimientos corporativos a vigilar: ${lista(movs.map(conFirma), 3)}.`);
    const casos = act.filter((c) => c.tipo === 'caso');
    if (casos.length) concl.push(`Casos de éxito publicados por la competencia: ${lista(casos.map((c) => `${c.fuente} (${c.titulo})`), 2)}.`);
    if (contratos.length) concl.push(`Contratos públicos de PI adjudicados: ${lista(contratos.map((k) => `${k.adjudicatario} (${k.importe_adjudicado ? eur.format(k.importe_adjudicado) : 'importe no indicado'})`))}.`);
    const inactivos = rivales.filter((f) => !f.items.length).map((f) => f.nombre);
    if (inactivos.length && act.length) concl.push(`Sin actividad detectada: ${lista(inactivos, 4)}.`);

    return {
      kpis: kpis([
        [act.length, 'publicaciones de la competencia', delta(act.length, prev.length)],
        [activos.length, 'despachos activos'],
        [porTipo.get('reconocimiento') || 0, 'premios y rankings'],
        [contratos.length ? eur.format(contratos.reduce((s, k) => s + (k.importe_adjudicado || 0), 0)) : '0 €', 'en contratos públicos'],
      ]),
      resumen: act.length
        ? `La competencia publicó ${cuantos(act.length, 'contenido comparable', 'contenidos comparables')} en el periodo (${delta(act.length, prev.length) || 'sin periodo anterior comparable'}), con ${activos.length} de ${rivales.length} despachos activos. ${concl[0]}${propia ? ' ' + concl.find((c) => c.startsWith('PONS IP:')) : ''}`
        : 'No se registró actividad pública de la competencia en el periodo.',
      bloques: [
        bloque('Evolución de la actividad de la competencia', evo.nodo, el('p', { className: 'r-note', textContent: 'Publicaciones comparables de todos los competidores en cada periodo.' })),
        bloque('Actividad por despacho', barras(rk.map((f) => [f.propio ? `${f.nombre} (nosotros)` : f.nombre, f.items.length, rkPrev.get(f.id) || 0]),
          { resaltar: datos.propio ? `${datos.propio.nombre} (nosotros)` : null }),
          el('p', { className: 'r-note', textContent: 'Publicaciones comparables (mismo criterio editorial para todos). Entre paréntesis, el periodo anterior.' })),
        bloque('Tipo de actividad', act.length ? barras(ordenado(porTipo).map(([k, v]) => [TIPOS[k] || k, v])) : vacio('—')),
        bloque('Detalle por despacho', tabla(['Despacho', 'Total', 'Artíc.', 'Eventos', 'Premios', 'Movim.', 'Casos'],
          rk.map((f) => {
            const c = (t) => f.items.filter((i) => i.tipo === t).length || '–';
            return [f.propio ? `${f.nombre} (nosotros)` : f.nombre, f.items.length || '–', c('articulo'), c('evento'), c('reconocimiento'), c('corporativo'), c('caso')];
          }), { claseFila: (f) => (String(f[0]).includes('(nosotros)') ? 'r-row--propia' : '') })),
        ...activos.slice(0, 6).map((f) => bloque(`Ficha · ${f.nombre} (${cuantos(f.items.length, 'publicación', 'publicaciones')})`,
          detalle(f.items.sort((a, b) => b.fecha.localeCompare(a.fecha)), (c) => [fmtLargo.format(fecha(c.fecha)), tipoUno(c.tipo), c.fecha_evento ? 'evento el ' + fmtDia.format(fecha(c.fecha_evento)) : null, c.ciudad].filter(Boolean).join(' · ')))),
        agenda.length ? bloque('Agenda de eventos de la competencia', tabla(['Fecha', 'Despacho', 'Evento', 'Lugar'],
          agenda.map((c) => [fmtDia.format(fecha(c.fecha_evento)), c.fuente, enlace(c.titulo, c.url), c.ciudad || '–']))) : null,
      ],
      conclusiones: concl,
      anexo: detalle(act.sort((a, b) => b.fecha.localeCompare(a.fecha)), (c) => [fmtLargo.format(fecha(c.fecha)), c.fuente, tipoUno(c.tipo)].join(' · ')),
      nAnexo: act.length,
    };
  }

  function informePons(p, pa) {
    const todos = datos.pons.filter((c) => dentro(c.fecha, p));
    const act = todos.filter(comparable);
    const prev = datos.pons.filter((c) => comparable(c) && dentro(c.fecha, pa));
    const porTipo = contar(todos, (c) => c.tipo);
    const rk = ranking(p);
    const rivales = rk.filter((f) => !f.propio);
    const totalMercado = rk.reduce((s, f) => s + f.items.length, 0);
    const puesto = 1 + rivales.filter((f) => f.items.length > act.length).length;
    const media = rivales.length ? rivales.reduce((s, f) => s + f.items.length, 0) / rivales.length : 0;
    const noComp = todos.filter((c) => !comparable(c));
    const porCat = contar(todos, (c) => CATEGORIAS[c.categoria] || (c.categoria ? c.categoria : 'Sin categoría'));
    // Serie: publicaciones comparables de PONS IP, media de los competidores y puesto en cada periodo
    const serie = (() => {
      const ps = [p]; for (let i = 1; i < 6; i++) ps.unshift(anterior(ps[0]));
      return ps.map((x) => {
        const r = ranking(x); const yo = r.find((f) => f.propio)?.items.length || 0; const riv = r.filter((f) => !f.propio);
        return [corta(x), yo, riv.length ? riv.reduce((s, f) => s + f.items.length, 0) / riv.length : 0, 1 + riv.filter((f) => f.items.length > yo).length, r.length];
      });
    })();

    const concl = [];
    if (!todos.length) concl.push('PONS IP no publicó en el periodo. Mantener al menos una publicación semanal sostiene la visibilidad frente a la competencia.');
    else {
      concl.push(`PONS IP publicó ${todos.length} contenidos (${act.length} comparables), ${delta(act.length, prev.length).replace('vs periodo anterior', 'respecto al periodo anterior')}.`);
      concl.push(`Posición frente a la competencia: puesto ${puesto} de ${rk.length}, con una cuota del ${pct(act.length, totalMercado)} % de la actividad publicada del sector (media de los competidores: ${decimal(media)}).`);
      const arts = porTipo.get('articulo') || 0;
      const casos = porTipo.get('caso') || 0;
      if (arts / todos.length >= 0.6 && casos === 0) concl.push('Predominan los artículos y no hay casos de éxito: publicar resultados ganados para clientes (oposiciones, sentencias) refuerza la credibilidad comercial.');
      else if (casos) concl.push(`${cuantos(casos, 'caso de éxito publicado', 'casos de éxito publicados')}: buen material para propuestas comerciales y redes.`);
      const prem = todos.filter((c) => c.tipo === 'reconocimiento');
      if (prem.length) concl.push(`Reconocimientos: ${lista(prem.map((c) => c.titulo), 3)}.`);
      if (noComp.length) concl.push(`${cuantos(noComp.length, 'publicación no computa', 'publicaciones no computan')} en la comparativa (guías genéricas o temas fuera de PI): orientarlas a análisis de sentencias y normativa mejora el posicionamiento.`);
      const top = rivales.find((f) => f.items.length);
      if (top && top.items.length > act.length) concl.push(`${top.nombre} superó a PONS IP en publicaciones (${top.items.length} frente a ${act.length}).`);
    }
    const prox = datos.pons.filter((c) => c.fecha_evento && c.fecha_evento > p.fin).sort((a, b) => a.fecha_evento.localeCompare(b.fecha_evento));
    if (prox.length) concl.push(`Próximos eventos de PONS IP: ${lista(prox.map((c) => `«${c.titulo}» (${fmtDia.format(fecha(c.fecha_evento))})`), 2)}.`);

    return {
      kpis: kpis([
        [todos.length, 'publicaciones', delta(act.length, prev.length) && `${delta(act.length, prev.length)} (comparables)`],
        [`${puesto}.º de ${rk.length}`, 'puesto frente a la competencia'],
        [`${pct(act.length, totalMercado)} %`, 'cuota de actividad del sector'],
        [(porTipo.get('reconocimiento') || 0) + (porTipo.get('caso') || 0), 'premios y casos de éxito'],
      ]),
      resumen: todos.length
        ? `PONS IP publicó ${cuantos(todos.length, 'contenido', 'contenidos')} en el periodo (${act.length} comparables) y ocupa el puesto ${puesto} de ${rk.length} frente a la competencia, con el ${pct(act.length, totalMercado)} % de la actividad publicada del sector.`
        : 'PONS IP no publicó contenidos en el periodo.',
      bloques: [
        bloque('Evolución frente a la competencia', barras(serie.map(([t, yo]) => [t, yo]), { resaltar: corta(p) }),
          tabla(['Periodo', 'PONS IP', 'Media competidores', 'Puesto'], serie.map(([t, yo, med, pu, tot]) => [t, yo, decimal(med), `${pu}.º de ${tot}`]))),
        bloque('Publicaciones por tipo', todos.length ? barras(ordenado(porTipo).map(([k, v]) => [TIPOS[k] || k, v])) : vacio('—')),
        bloque('PONS IP frente a la competencia', barras(rk.map((f) => [f.propio ? `${f.nombre} (nosotros)` : f.nombre, f.items.length]),
          { resaltar: `${datos.propio?.nombre} (nosotros)` }),
          el('p', { className: 'r-note', textContent: 'Publicaciones comparables del periodo (mismo criterio editorial para todos).' })),
        todos.length ? bloque('Publicaciones por tema', barras(ordenado(porCat))) : null,
        noComp.length ? bloque('Publicaciones que no cuentan en la comparativa', tabla(['Publicación', 'Motivo'], noComp.map((c) => [enlace(c.titulo, c.url), c.motivo_no_comparable || '–']))) : null,
        prox.length ? bloque('Próximos eventos de PONS IP', tabla(['Fecha', 'Evento', 'Lugar'], prox.map((c) => [fmtDia.format(fecha(c.fecha_evento)), enlace(c.titulo, c.url), c.ciudad || '–']))) : null,
      ],
      conclusiones: concl,
      anexo: detalle(todos.sort((a, b) => b.fecha.localeCompare(a.fecha)), (c) => [fmtLargo.format(fecha(c.fecha)), tipoUno(c.tipo), comparable(c) ? 'cuenta en la comparativa' : 'no cuenta en la comparativa'].join(' · ')),
      nAnexo: todos.length,
    };
  }

  function informeConcursos(p, pa) {
    const act = datos.concursos.filter((k) => dentro(k.fecha, p));
    const prev = datos.concursos.filter((k) => dentro(k.fecha, pa));
    const abiertos = datos.concursos.filter((k) => k.tipo !== 'adjudicacion' && k.fecha <= p.fin && (!k.fecha_limite || k.fecha_limite >= p.ini));
    const adj = act.filter((k) => k.tipo === 'adjudicacion');
    const importe = adj.reduce((s, k) => s + (k.importe_adjudicado || 0), 0);
    const hoy = iso(new Date());
    const vigentes = abiertos.filter((k) => k.fecha_limite && k.fecha_limite >= hoy);
    const nombres = [...datos.despachos.map((d) => d.nombre), datos.propio?.nombre].filter(Boolean);
    const esCompetidor = (a) => nombres.find((n) => a && a.toLowerCase().includes(n.toLowerCase().split(' ')[0]));
    const porEstado = contar(datos.concursos.filter((k) => k.tipo !== 'adjudicacion'), (k) => ESTADO_TXT[estadoConcurso(k)]);
    const evo = evolucion(p, (x) => datos.concursos.filter((k) => dentro(k.fecha, x)).length);
    // Histórico de adjudicatarios (todas las adjudicaciones registradas)
    const historico = new Map();
    datos.concursos.filter((k) => k.tipo === 'adjudicacion' && k.adjudicatario).forEach((k) => {
      const r = historico.get(k.adjudicatario) || { n: 0, imp: 0 }; r.n++; r.imp += k.importe_adjudicado || 0; historico.set(k.adjudicatario, r);
    });

    const concl = [];
    if (!act.length && !abiertos.length) concl.push('No se publicaron licitaciones, ayudas ni adjudicaciones de PI en el periodo. La tarea diaria sigue revisando el BOE.');
    if (act.length) concl.push(`${cuantos(act.length, 'anuncio de PI publicado', 'anuncios de PI publicados')} en el periodo (${lista(ordenado(contar(act, (k) => TIPOS_CONCURSO[k.tipo])).map(([t, n]) => `${n} ${t.toLowerCase()}`))}).`);
    if (vigentes.length) concl.push(`Plazos abiertos hoy: ${lista(vigentes.map((k) => `«${k.titulo}» (${k.organismo}, hasta el ${fmtDia.format(fecha(k.fecha_limite))})`), 3)}. Valorar presentar oferta o informar a clientes.`);
    for (const k of adj) {
      const comp = esCompetidor(k.adjudicatario);
      concl.push(`${k.adjudicatario}${comp ? ' (competidor)' : ''} ganó «${k.titulo}» (${k.organismo})${k.importe_adjudicado ? ' por ' + eur.format(k.importe_adjudicado) : ''}${k.ofertas ? `, con ${k.ofertas} ofertas presentadas` : ''}.`);
    }
    if (adj.length && datos.propio && !adj.some((k) => esCompetidor(k.adjudicatario) === datos.propio.nombre)) concl.push('PONS IP no figura entre los adjudicatarios del periodo: revisar si se presentó oferta y los criterios de adjudicación (en varios contratos el precio es el único criterio).');

    return {
      kpis: kpis([
        [act.length, 'anuncios publicados', delta(act.length, prev.length)],
        [abiertos.length, 'con plazo abierto en el periodo'],
        [adj.length, 'adjudicaciones'],
        [eur.format(importe), 'importe adjudicado'],
      ]),
      resumen: `En el periodo se publicaron ${cuantos(act.length, 'anuncio', 'anuncios')} de PI (${cuantos(adj.length, 'adjudicación', 'adjudicaciones')} por ${eur.format(importe)}). A día de hoy hay ${cuantos(datos.concursos.filter((k) => estadoConcurso(k) === 'abierta').length, 'convocatoria', 'convocatorias')} con plazo abierto y ${cuantos(datos.concursos.filter((k) => estadoConcurso(k) === 'pendiente').length, 'licitación pendiente', 'licitaciones pendientes')} de adjudicar.`,
      bloques: [
        bloque('Evolución de anuncios publicados', evo.nodo),
        bloque('Situación actual de licitaciones, ayudas y premios', barras(ordenado(porEstado)), el('p', { className: 'r-note', textContent: 'Estado a fecha de hoy de todas las convocatorias registradas (sin contar las adjudicaciones).' })),
        bloque('Plazos abiertos en el periodo', abiertos.length ? tabla(['Plazo', 'Tipo', 'Convocatoria', 'Organismo'],
          abiertos.sort((a, b) => (a.fecha_limite || '9').localeCompare(b.fecha_limite || '9')).map((k) => [k.fecha_limite ? fmtLargo.format(fecha(k.fecha_limite)) : 'Sin plazo', (TIPO_CONCURSO_UNO[k.tipo] || k.tipo), enlace(k.titulo, k.url), k.organismo])) : vacio('Ninguna convocatoria con plazo abierto en el periodo.')),
        bloque('Adjudicaciones', adj.length ? tabla(['Adjudicatario', 'Contrato', 'Organismo', 'Importe'],
          adj.map((k) => [k.adjudicatario + (esCompetidor(k.adjudicatario) ? ' · competidor' : ''), enlace(k.titulo, k.url), k.organismo, k.importe_adjudicado ? eur.format(k.importe_adjudicado) : '–'])) : vacio('Sin adjudicaciones en el periodo.')),
        historico.size ? bloque('¿Quién gana los contratos de PI? (histórico)', tabla(['Adjudicatario', 'Contratos', 'Importe total'],
          [...historico.entries()].sort((a, b) => b[1].imp - a[1].imp).map(([n, r]) => [n + (esCompetidor(n) ? ' · competidor' : ''), r.n, r.imp ? eur.format(r.imp) : '–']))) : null,
      ],
      conclusiones: concl,
      anexo: detalle(act.sort((a, b) => b.fecha.localeCompare(a.fecha)), (k) => [
        fmtLargo.format(fecha(k.fecha)), (TIPO_CONCURSO_UNO[k.tipo] || k.tipo), k.organismo, ESTADO_TXT[estadoConcurso(k)],
        k.fecha_limite ? 'plazo ' + fmtLargo.format(fecha(k.fecha_limite)) : null, k.importe, k.adjudicatario ? 'adjudicatario: ' + k.adjudicatario : null,
      ].filter(Boolean).join(' · ')),
      nAnexo: act.length,
    };
  }

  // Informe a fecha de hoy con solo lo pendiente: convocatorias con plazo abierto y licitaciones pendientes de adjudicar
  function informePendientes() {
    const conEstado = datos.concursos.map((k) => ({ ...k, est: estadoConcurso(k) }));
    const abiertas = conEstado.filter((k) => k.est === 'abierta').sort((a, b) => (a.fecha_limite || '9').localeCompare(b.fecha_limite || '9'));
    const pendientes = conEstado.filter((k) => k.est === 'pendiente').sort((a, b) => (a.fecha_limite || '').localeCompare(b.fecha_limite || ''));
    const lic = abiertas.filter((k) => k.tipo === 'licitacion');
    const urgentes = abiertas.filter((k) => k.fecha_limite && diasHasta(k.fecha_limite) <= 15);
    const plazo = (k) => (k.fecha_limite ? `${fmtLargo.format(fecha(k.fecha_limite))} (${diasHasta(k.fecha_limite) === 0 ? 'termina hoy' : diasHasta(k.fecha_limite) === 1 ? 'queda 1 día' : `quedan ${diasHasta(k.fecha_limite)} días`})` : 'sin plazo publicado');

    const concl = [];
    if (!abiertas.length && !pendientes.length) concl.push('No hay licitaciones, ayudas ni premios de PI pendientes a fecha de hoy.');
    if (urgentes.length) concl.push(`Prioridad: ${lista(urgentes.map((k) => `«${k.titulo}» (${k.organismo}) cierra el ${fmtDia.format(fecha(k.fecha_limite))}`), 3)}.`);
    if (lic.length) concl.push(`${cuantos(lic.length, 'licitación con plazo abierto', 'licitaciones con plazo abierto')}: ${lista(lic.map((k) => `«${k.titulo}» (${k.organismo}; ofertas hasta el ${fmtLargo.format(fecha(k.fecha_limite))}${k.importe ? '; ' + k.importe : ''})`), 3)}. Decidir si PONS IP presenta oferta y preparar la documentación (solvencia, equipo y precio).`);
    const ayudas = abiertas.filter((k) => k.tipo !== 'licitacion');
    if (ayudas.length) concl.push(`${cuantos(ayudas.length, 'ayuda o premio abierto', 'ayudas o premios abiertos')} (${lista(ayudas.map((k) => k.titulo), 2)}): oportunidad para informar a clientes y gestionar sus solicitudes.`);
    for (const k of pendientes) concl.push(`Pendiente de adjudicar: «${k.titulo}» (${k.organismo}); el plazo de ofertas cerró ${k.fecha_limite ? 'el ' + fmtLargo.format(fecha(k.fecha_limite)) + `, hace ${-diasHasta(k.fecha_limite)} días` : ''}. Vigilar la formalización en el BOE para saber quién la gana y por qué importe.`);

    const meta = (k) => [ESTADO_TXT[k.est], (TIPO_CONCURSO_UNO[k.tipo] || k.tipo), k.organismo, [k.lugar, k.ambito].filter(Boolean).join(', '), k.importe ? 'importe: ' + k.importe : null].filter(Boolean).join(' · ');
    return {
      kpis: kpis([
        [abiertas.length, 'con plazo abierto'],
        [lic.length, 'licitaciones abiertas'],
        [pendientes.length, 'pendientes de adjudicar'],
        [urgentes.length, 'cierran en 15 días o menos'],
      ]),
      resumen: `A fecha de ${fmtLargo.format(new Date())} hay ${cuantos(abiertas.length, 'convocatoria', 'convocatorias')} de propiedad industrial e intelectual con plazo abierto (${cuantos(lic.length, 'licitación', 'licitaciones')}) y ${cuantos(pendientes.length, 'licitación', 'licitaciones')} con el plazo cerrado pendiente de adjudicación.`,
      bloques: [
        bloque('En curso · plazo abierto', abiertas.length ? detalle(abiertas, (k) => `Plazo: ${plazo(k)} · ${meta(k)}`) : vacio('No hay convocatorias con plazo abierto.')),
        bloque('En curso · pendientes de adjudicar', pendientes.length ? detalle(pendientes, (k) => `Plazo cerrado el ${k.fecha_limite ? fmtLargo.format(fecha(k.fecha_limite)) : '–'} · ${meta(k)}`) : vacio('No hay licitaciones pendientes de adjudicación.')),
        bloque('Calendario de vencimientos', abiertas.filter((k) => k.fecha_limite).length
          ? tabla(['Vence', 'Días', 'Convocatoria', 'Organismo'], abiertas.filter((k) => k.fecha_limite).map((k) => [fmtLargo.format(fecha(k.fecha_limite)), diasHasta(k.fecha_limite), enlace(k.titulo, k.url), k.organismo]))
          : vacio('Sin vencimientos próximos.')),
      ],
      conclusiones: concl,
      anexo: null,
      nAnexo: 0,
    };
  }

  const GENERADORES = { noticias: informeNoticias, eventos: informeEventos, competencia: informeCompetencia, pons: informePons, concursos: informeConcursos };

  // ---------- interfaz ----------
  const ui = { seccion: 'noticias', tipo: 'mes', clave: null, alcance: 'periodo', ciudad: '' };

  function crearUI() {
    const box = el('div', { id: 'informe', className: 'informe', hidden: true });
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Informe PDF');
    box.innerHTML = `
      <div class="informe__bar">
        <div class="informe__controls">
          <div class="segmented" role="tablist" aria-label="Periodo">
            <button type="button" role="tab" data-tipo="semana">Semana</button>
            <button type="button" role="tab" data-tipo="mes">Mes</button>
            <button type="button" role="tab" data-tipo="anio">Año</button>
          </div>
          <select id="informe-periodo" aria-label="Periodo del informe"></select>
          <div class="segmented" id="informe-alcance" role="tablist" aria-label="Alcance del informe" hidden>
            <button type="button" role="tab" data-alcance="periodo">Por periodo</button>
            <button type="button" role="tab" data-alcance="pendientes">Solo pendientes</button>
          </div>
          <select id="informe-ciudad" aria-label="Ciudad" hidden></select>
        </div>
        <div class="informe__actions">
          <button type="button" class="btn" id="informe-reset" title="Volver al texto generado automáticamente">Restablecer</button>
          <button type="button" class="btn btn--primary" id="informe-pdf">Descargar PDF</button>
          <button type="button" class="icon-btn" id="informe-close" aria-label="Cerrar informe">✕</button>
        </div>
        <p class="informe__hint">Puedes editar el título, las conclusiones y las notas antes de descargar. Los cambios se guardan en este dispositivo.</p>
      </div>
      <div class="informe__scroll"><article class="report" id="report"></article></div>`;
    document.body.append(box);
    box.querySelectorAll('[data-tipo]').forEach((b) => (b.onclick = () => { ui.tipo = b.dataset.tipo; ui.clave = null; pintar(); }));
    $('#informe-periodo').onchange = (e) => { ui.clave = e.target.value; pintar(); };
    box.querySelectorAll('[data-alcance]').forEach((b) => (b.onclick = () => { ui.alcance = b.dataset.alcance; pintar(); }));
    $('#informe-ciudad').onchange = (e) => { ui.ciudad = e.target.value; pintar(); };
    $('#informe-close').onclick = cerrar;
    $('#informe-pdf').onclick = descargar;
    $('#informe-reset').onclick = () => { store(claveEdicion(), null); pintar(); };
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
    return box;
  }

  const pendientes = () => ui.seccion === 'concursos' && ui.alcance === 'pendientes';
  const claveEdicion = () => (pendientes() ? `concursos:pendientes:${hoyIso()}` : `${ui.seccion}:${ui.tipo}:${ui.clave}${ui.seccion === 'eventos' && ui.ciudad ? ':' + ui.ciudad : ''}`);

  function controlesExtra() {
    const alc = $('#informe-alcance');
    alc.hidden = ui.seccion !== 'concursos';
    alc.querySelectorAll('[data-alcance]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.alcance === ui.alcance)));
    const soloHoy = pendientes();
    document.querySelectorAll('#informe [data-tipo]').forEach((b) => { b.disabled = soloHoy; });
    $('#informe-periodo').disabled = soloHoy;
    const sel = $('#informe-ciudad');
    sel.hidden = ui.seccion !== 'eventos';
    if (!sel.hidden) {
      const cuenta = contar(datos.eventos.filter((e) => e.modalidad !== 'online'), (e) => e.ciudad);
      const online = datos.eventos.filter((e) => e.modalidad === 'online').length;
      sel.replaceChildren(el('option', { value: '', textContent: 'Todas las ciudades' }),
        ...(online ? [el('option', { value: 'online', textContent: `Online (${online})` })] : []),
        ...[...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([c, n]) => el('option', { value: c, textContent: `${c} (${n})` })));
      sel.value = ui.ciudad;
      if (sel.value !== ui.ciudad) { ui.ciudad = ''; sel.value = ''; }
    }
  }

  function periodoActual() {
    const tipo = ui.tipo === 'anio' ? 'anio' : ui.tipo;
    const ops = opcionesPeriodo(tipo, datos.primerAnio);
    const sel = $('#informe-periodo');
    sel.replaceChildren(...ops.map((p) => el('option', { value: p.clave, textContent: p.etiqueta })));
    const p = ops.find((o) => o.clave === ui.clave) || ops[0];
    ui.clave = p.clave;
    sel.value = p.clave;
    return p;
  }

  function guardarEdicion() {
    const r = $('#report');
    store(claveEdicion(), {
      titulo: $('.r-title', r).innerText.trim(),
      resumen: $('.r-summary', r).innerText.trim(),
      conclusiones: [...r.querySelectorAll('.r-concl li')].map((li) => li.innerText.trim()).filter(Boolean),
      notas: $('.r-notes', r).innerText.trim(),
    });
  }

  function pintar() {
    document.querySelectorAll('#informe [data-tipo]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tipo === ui.tipo)));
    controlesExtra();
    const p = periodoActual();
    const pa = anterior(p);
    const inf = pendientes() ? informePendientes() : GENERADORES[ui.seccion](p, pa);
    const ed = store(claveEdicion()) || {};
    const filtroCiudad = ui.seccion === 'eventos' && ui.ciudad ? ` · ${ui.ciudad === 'online' ? 'Online' : ui.ciudad}` : '';
    const tituloAuto = pendientes() ? `Licitaciones y convocatorias pendientes · ${fmtLargo.format(new Date())}` : `Informe de ${SECCIONES[ui.seccion]}${filtroCiudad} · ${p.etiqueta}`;
    const titulo = ed.titulo || tituloAuto;
    const conclusiones = ed.conclusiones?.length ? ed.conclusiones : inf.conclusiones;
    const meta = pendientes() ? `Concursos y licitaciones · situación a ${fmtLargo.format(new Date())}` : `${SECCIONES[ui.seccion]}${filtroCiudad} · ${fmtLargo.format(fecha(p.ini))} – ${fmtLargo.format(fecha(p.fin))} · Generado el ${fmtLargo.format(new Date())}`;

    const r = $('#report');
    r.replaceChildren(...[
      el('header', { className: 'r-head' },
        el('div', { className: 'r-brand' }, el('strong', { textContent: 'PONS IP' }), el('span', { textContent: 'NEWS' })),
        el('p', { className: 'r-meta', textContent: meta })),
      el('h1', { className: 'r-title', contentEditable: 'true', spellcheck: true, textContent: titulo }),
      el('section', { className: 'r-block r-block--summary' },
        el('h2', { textContent: 'Resumen ejecutivo' }),
        el('p', { className: 'r-summary', contentEditable: 'true', spellcheck: true, textContent: ed.resumen || inf.resumen || '' })),
      inf.kpis,
      el('section', { className: 'r-block r-block--concl' },
        el('h2', { textContent: 'Conclusiones para PONS IP' }),
        el('ul', { className: 'r-concl', contentEditable: 'true', spellcheck: true }, conclusiones.map((c) => el('li', { textContent: c })))),
      ...inf.bloques.filter(Boolean),
      el('section', { className: 'r-block' },
        el('h2', { textContent: 'Notas y acciones' }),
        notas(ed.notas)),
      inf.anexo === null ? null : el('section', { className: 'r-block r-annex' },
        el('h2', { textContent: `Anexo · detalle del periodo (${inf.nAnexo})` }),
        inf.nAnexo ? inf.anexo : vacio('Sin elementos en el periodo.')),
      el('section', { className: 'r-block r-method' },
        el('h2', { textContent: 'Metodología y fuentes' }),
        el('p', { textContent: METODOLOGIA[ui.seccion] })),
      el('footer', { className: 'r-foot', textContent: 'PONS IP News · Fuentes: OEPM, EUIPO, BOE, tribunales, prensa especializada y webs de los despachos. Cifras de la competencia con el mismo criterio editorial para todos los despachos.' }),
    ].filter(Boolean));
    r.querySelectorAll('[contenteditable]').forEach((n) => n.addEventListener('input', guardarEdicion));
  }

  function notas(texto) {
    const n = el('div', { className: 'r-notes', contentEditable: 'true', spellcheck: true, textContent: texto || '' });
    n.dataset.placeholder = 'Escribe aquí acciones, responsables o comentarios para el equipo…';
    return n;
  }

  function cerrar() {
    $('#informe').hidden = true;
    document.body.classList.remove('con-informe');
    $('#informe-btn')?.focus();
  }

  function descargar() {
    const titulo = document.title;
    const nombre = $('.r-title').innerText.trim().replace(/[\\/:*?"<>|·]+/g, '-').replace(/\s+/g, ' ');
    document.title = nombre || 'Informe PONS IP';   // nombre sugerido del PDF
    window.print();
    setTimeout(() => { document.title = titulo; }, 500);
  }

  async function abrir() {
    const vista = document.body.dataset.view;
    ui.seccion = SECCIONES[vista] ? vista : 'noticias';
    // Hereda los filtros de la sección: ciudad en Eventos y «En curso» en Concursos
    ui.ciudad = document.body.dataset.ciudad || '';
    ui.alcance = document.body.dataset.estadoConcurso === 'curso' ? 'pendientes' : 'periodo';
    const box = $('#informe') || crearUI();
    try { if (!datos) await cargar(); } catch { alert('No se han podido cargar los datos del informe.'); return; }
    box.hidden = false;
    document.body.classList.add('con-informe');
    pintar();
    $('#informe-pdf').focus();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#informe-btn')) abrir();
  });
  // Si la web recarga los datos (botón actualizar), el próximo informe usa los nuevos
  document.addEventListener('ipes:datos', () => { datos = null; });
})();
