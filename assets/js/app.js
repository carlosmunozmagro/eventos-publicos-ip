(() => {
  'use strict';

  const CATEGORIAS = {
    'marcas': 'Marcas',
    'patentes': 'Patentes',
    'disenos': 'Diseños',
    'derechos-autor': 'Derechos de autor',
    'indicaciones-geograficas': 'Indicaciones geográficas',
    'litigios': 'Litigios',
    'normativa': 'Normativa',
    'institucional': 'Institucional',
  };
  const MODALIDAD = { presencial: 'Presencial', online: 'Online', hibrido: 'Híbrido' };
  const TIPOS = {
    'evento': 'Evento',
    'reconocimiento': 'Premio / ranking',
    'adjudicacion': 'Contrato público',
    'corporativo': 'Movimiento',
    'articulo': 'Artículo',
  };
  const TIPOS_CONCURSO = {
    'licitacion': 'Licitación',
    'convocatoria': 'Ayuda / subvención',
    'premio': 'Premio / concurso',
    'adjudicacion': 'Adjudicación',
  };
  const ESTADOS = { abierta: 'Plazo abierto', adjudicada: 'Adjudicadas', cerrada: 'Cerradas' };
  const TITULOS = {
    noticias: 'Noticias', competencia: 'Competencia', concursos: 'Concursos y licitaciones',
    eventos: 'Eventos', historial: 'Historial', guardados: 'Guardados',
  };
  const DIAS_ACTUALIDAD = 30;   // noticias más antiguas pasan al Historial
  const DIAS_NUEVO = 2;         // etiqueta "Nuevo" para lo añadido recientemente

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    view: 'noticias',
    categoria: null,
    hist: 'noticias',
    tipo: null,
    despacho: null,
    tipoConcurso: null,
    q: '',
    noticias: [],
    eventos: [],
    competencia: [],
    despachos: new Map(),
    concursos: [],
    actualizado: null,
    guardados: new Set(store('guardados', [])),
  };

  // ---------- almacenamiento local (tolerante a fallos) ----------
  function store(key, fallback, value) {
    try {
      if (value === undefined) {
        const raw = localStorage.getItem('ipes:' + key);
        return raw ? JSON.parse(raw) : fallback;
      }
      localStorage.setItem('ipes:' + key, JSON.stringify(value));
    } catch { /* modo privado o almacenamiento bloqueado */ }
    return fallback;
  }

  // ---------- fechas ----------
  const hoy = () => new Date().toISOString().slice(0, 10);
  const haceDias = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const parseDate = (s) => new Date(s + 'T12:00:00');
  const fmtLargo = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtCorto = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'short' });
  const fmtMesAnio = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

  function relativo(fecha) {
    const d = Math.round((parseDate(hoy()) - parseDate(fecha)) / 864e5);
    if (d === 0) return 'Hoy';
    if (d === 1) return 'Ayer';
    if (d > 1 && d < 7) return `Hace ${d} días`;
    const f = parseDate(fecha);
    return f.getFullYear() === new Date().getFullYear() ? fmtCorto.format(f) : fmtLargo.format(f).replace(/^[^,]+,\s*/, '');
  }

  function rangoEvento(e) {
    const ini = parseDate(e.fecha_inicio);
    const fin = e.fecha_fin && e.fecha_fin !== e.fecha_inicio ? parseDate(e.fecha_fin) : null;
    let txt = fin ? `${fmtCorto.format(ini)} – ${fmtLargo.format(fin)}` : fmtLargo.format(ini);
    if (e.hora) txt += ` · ${e.hora}`;
    return txt;
  }

  // ---------- datos ----------
  async function cargar() {
    const json = (url) => fetch(url, { cache: 'no-cache' }).then((r) => r.json());
    const [n, e, c, k] = await Promise.all([
      json('data/noticias.json'),
      json('data/eventos.json'),
      json('data/competencia.json').catch(() => ({ despachos: [], items: [] })),   // secciones opcionales
      json('data/concursos.json').catch(() => ({ items: [] })),
    ]);
    state.noticias = n.items.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    state.eventos = e.items.slice().sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
    state.despachos = new Map(c.despachos.map((d) => [d.id, d]));
    // "fuente" (solo en memoria) permite buscar por nombre de despacho
    state.competencia = c.items.map((i) => ({ ...i, fuente: state.despachos.get(i.despacho)?.nombre || i.despacho }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    state.concursos = k.items.map((i) => ({ ...i, estado: estadoConcurso(i) }));
    state.actualizado = [n.actualizado, e.actualizado].filter(Boolean).sort().pop();
  }

  function estadoConcurso(c) {
    if (c.estado) return c.estado;
    if (c.tipo === 'adjudicacion') return 'adjudicada';
    return c.fecha_limite && c.fecha_limite >= hoy() ? 'abierta' : 'cerrada';
  }

  const texto = (o) => [o.titulo, o.resumen, o.descripcion, o.fuente, o.organizador, o.organismo, o.adjudicatario, o.ciudad, o.lugar, ...(o.etiquetas || [])]
    .filter(Boolean).join(' ').toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');

  function filtrar(items) {
    const q = state.q.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
    const pasa = state.view === 'competencia'
      ? (i) => (!state.tipo || i.tipo === state.tipo) && (!state.despacho || i.despacho === state.despacho)
      : state.view === 'concursos'
        ? (i) => !state.tipoConcurso || i.tipo === state.tipoConcurso
        : (i) => !state.categoria || i.categoria === state.categoria;
    return items.filter((i) => pasa(i) && (!q || texto(i).includes(q)));
  }

  const esPasado = (e) => (e.fecha_fin || e.fecha_inicio) < hoy();
  const esActual = (n) => n.fecha >= haceDias(DIAS_ACTUALIDAD);
  const esNuevo = (i) => i.anadido && i.anadido >= haceDias(DIAS_NUEVO);

  // Elementos de cada vista antes de aplicar búsqueda y categoría
  function base(view = state.view) {
    if (view === 'noticias') return state.noticias.filter(esActual);
    if (view === 'eventos') return state.eventos.filter((e) => !esPasado(e));
    if (view === 'historial') {
      return state.hist === 'eventos'
        ? state.eventos.filter(esPasado).reverse()
        : state.noticias.filter((n) => !esActual(n));
    }
    if (view === 'competencia') return state.competencia;
    if (view === 'concursos') return state.concursos;
    return [...state.eventos, ...state.noticias, ...state.competencia, ...state.concursos].filter((i) => state.guardados.has(i.id));
  }

  // ---------- render ----------
  function badge(el, cat) {
    el.textContent = CATEGORIAS[cat] || cat;
    el.style.setProperty('--c', `var(--c-${cat}, var(--c-institucional))`);
  }

  function saveBtn(btn, id) {
    const on = state.guardados.has(id);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Quitar de guardados' : 'Guardar');
    btn.onclick = () => {
      state.guardados.has(id) ? state.guardados.delete(id) : state.guardados.add(id);
      store('guardados', null, [...state.guardados]);
      if (state.view === 'guardados') render(); else saveBtn(btn, id);
    };
  }

  function cardNoticia(n) {
    const node = $('#tpl-news').content.firstElementChild.cloneNode(true);
    if (n.destacado) node.classList.add('card--featured');
    badge($('.badge', node), n.categoria);
    const t = $('time', node);
    t.dateTime = n.fecha; t.textContent = relativo(n.fecha); t.title = fmtLargo.format(parseDate(n.fecha));
    $('.source', node).textContent = n.fuente;
    if (esNuevo(n)) $('.new', node).hidden = false;
    const a = $('.card__title a', node); a.href = n.url; a.textContent = n.titulo;
    $('.card__body', node).textContent = n.resumen;
    if (n.otras_fuentes?.length) {
      const p = $('.also', node);
      p.hidden = false;
      p.append('También en: ');
      n.otras_fuentes.forEach((f, i) => {
        const l = document.createElement('a');
        l.href = f.url; l.target = '_blank'; l.rel = 'noopener'; l.textContent = f.fuente;
        p.append(...(i ? [', ', l] : [l]));
      });
    }
    const ul = $('.tags', node);
    (n.etiquetas || []).slice(0, 4).forEach((tag) => { const li = document.createElement('li'); li.textContent = tag; ul.append(li); });
    saveBtn($('.save', node), n.id);
    $('.share', node).onclick = () => compartir(n.titulo, n.url);
    return node;
  }

  function cardEvento(e) {
    const node = $('#tpl-event').content.firstElementChild.cloneNode(true);
    if (esPasado(e)) node.classList.add('card--past');
    if (esNuevo(e)) $('.new', node).hidden = false;
    const d = parseDate(e.fecha_inicio);
    $('.datebox__day', node).textContent = d.getDate();
    $('.datebox__month', node).textContent = fmtMes.format(d).replace('.', '');
    badge($('.badge', node), e.categoria);
    const lugar = [MODALIDAD[e.modalidad] || e.modalidad, e.ciudad].filter(Boolean).join(' · ');
    $('.mode', node).textContent = lugar + (e.gratuito ? ' · Gratuito' : '');
    const a = $('.card__title a', node); a.href = e.url; a.textContent = e.titulo;
    $('.card__when', node).textContent = rangoEvento(e);
    $('.card__body', node).textContent = e.descripcion || '';
    $('.source', node).textContent = e.organizador || '';
    $('.ics', node).onclick = () => descargarICS(e);
    saveBtn($('.save', node), e.id);
    return node;
  }

  function cardCompetencia(c) {
    const node = $('#tpl-comp').content.firstElementChild.cloneNode(true);
    const desp = state.despachos.get(c.despacho);
    const b = $('.badge', node);
    b.textContent = TIPOS[c.tipo] || c.tipo;
    b.style.setProperty('--c', `var(--c-t-${c.tipo}, var(--c-institucional))`);
    const t = $('time', node);
    t.dateTime = c.fecha; t.textContent = relativo(c.fecha); t.title = 'Publicado el ' + fmtLargo.format(parseDate(c.fecha));
    $('.firm', node).textContent = c.fuente;
    if (esNuevo(c)) $('.new', node).hidden = false;
    const a = $('.card__title a', node); a.href = c.url; a.textContent = c.titulo;
    if (c.fecha_evento) {
      const w = $('.card__when', node);
      w.hidden = false;
      w.textContent = [
        (c.organiza ? 'Organiza · ' : '') + fmtLargo.format(parseDate(c.fecha_evento)),
        c.ciudad,
        c.fecha_evento < hoy() ? 'Celebrado' : null,
      ].filter(Boolean).join(' · ');
    }
    $('.card__body', node).textContent = c.resumen;
    const web = $('.firm-web', node);
    if (desp) { web.href = desp.web; web.textContent = new URL(desp.web).hostname.replace(/^www\./, ''); } else web.remove();
    saveBtn($('.save', node), c.id);
    $('.share', node).onclick = () => compartir(c.titulo, c.url);
    return node;
  }

  function cardConcurso(c) {
    const node = $('#tpl-tender').content.firstElementChild.cloneNode(true);
    node.classList.add('card--' + c.estado);
    const b = $('.badge', node);
    b.textContent = TIPOS_CONCURSO[c.tipo] || c.tipo;
    b.style.setProperty('--c', `var(--c-k-${c.tipo}, var(--c-institucional))`);
    const est = $('.estado', node);
    est.textContent = { abierta: 'Abierta', adjudicada: 'Adjudicada', cerrada: 'Cerrada' }[c.estado];
    est.dataset.estado = c.estado;
    $('.firm', node).textContent = c.organismo;
    if (esNuevo(c)) $('.new', node).hidden = false;
    const a = $('.card__title a', node); a.href = c.url; a.textContent = c.titulo;

    const dl = $('.facts', node);
    const dato = (k, v) => { if (!v) return; const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
    if (c.fecha_limite) {
      const quedan = Math.round((parseDate(c.fecha_limite) - parseDate(hoy())) / 864e5);
      const extra = c.estado !== 'abierta' ? '' : quedan === 0 ? ' · termina hoy' : ` · quedan ${quedan} días`;
      dato('Plazo', fmtLargo.format(parseDate(c.fecha_limite)) + extra);
      if (c.estado === 'abierta' && quedan <= 15) node.classList.add('card--urgente');
    }
    dato('Importe', c.importe);
    if (c.adjudicatario) dato('Adjudicatario', c.adjudicatario + (c.ofertas ? ` (${c.ofertas} ofertas)` : ''));
    dato('Ámbito', [c.lugar, c.ambito].filter(Boolean).join(' · '));

    $('.card__body', node).textContent = c.resumen;
    $('.source', node).textContent = `${c.fuente} · ${relativo(c.fecha)}`;
    if (c.estado === 'abierta' && c.fecha_limite) {
      const ics = $('.ics', node);
      ics.hidden = false;
      ics.onclick = () => descargarICS({ id: c.id, titulo: 'Fin de plazo: ' + c.titulo, fecha_inicio: c.fecha_limite, descripcion: c.organismo, url: c.url });
    }
    saveBtn($('.save', node), c.id);
    $('.share', node).onclick = () => compartir(c.titulo, c.url);
    return node;
  }

  function renderChips() {
    if (state.view === 'competencia') return renderChipsCompetencia();
    if (state.view === 'concursos') return renderChipsConcursos();
    $('#chips-desp').hidden = true;
    $('#chips').setAttribute('aria-label', 'Filtrar por categoría');
    const presentes = new Set(base().map((i) => i.categoria));
    const wrap = $('#chips');
    wrap.replaceChildren();
    const mk = (val, label) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = label;
      b.setAttribute('aria-pressed', String(state.categoria === val));
      b.onclick = () => { state.categoria = val; render(); };
      wrap.append(b);
    };
    mk(null, 'Todo');
    Object.entries(CATEGORIAS).filter(([k]) => presentes.has(k)).forEach(([k, v]) => mk(k, v));
    if (state.categoria && !presentes.has(state.categoria)) state.categoria = null;
  }

  // Dos filas: tipo de actividad y despacho (con número de publicaciones)
  function renderChipsCompetencia() {
    const fila = (wrap, label, opciones, clave) => {
      wrap.replaceChildren();
      wrap.setAttribute('aria-label', label);
      for (const [val, txt] of opciones) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.textContent = txt;
        b.setAttribute('aria-pressed', String(state[clave] === val));
        b.onclick = () => { state[clave] = val; render(); };
        wrap.append(b);
      }
    };
    const tipos = new Set(state.competencia.map((i) => i.tipo));
    const cuenta = {};
    state.competencia.forEach((i) => { cuenta[i.despacho] = (cuenta[i.despacho] || 0) + 1; });
    fila($('#chips'), 'Filtrar por tipo de actividad', [[null, 'Toda la actividad'], ...Object.entries(TIPOS).filter(([k]) => tipos.has(k))], 'tipo');
    const desp = [...state.despachos.values()].filter((d) => cuenta[d.id])
      .sort((a, b) => cuenta[b.id] - cuenta[a.id] || a.nombre.localeCompare(b.nombre, 'es'));
    fila($('#chips-desp'), 'Filtrar por despacho', [[null, 'Todos los despachos'], ...desp.map((d) => [d.id, `${d.nombre} · ${cuenta[d.id]}`])], 'despacho');
    $('#chips-desp').hidden = false;
  }

  function renderChipsConcursos() {
    $('#chips-desp').hidden = true;
    const wrap = $('#chips');
    wrap.replaceChildren();
    wrap.setAttribute('aria-label', 'Filtrar por tipo');
    const presentes = new Set(state.concursos.map((c) => c.tipo));
    [[null, 'Todo'], ...Object.entries(TIPOS_CONCURSO).filter(([k]) => presentes.has(k))].forEach(([val, txt]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = txt;
      b.setAttribute('aria-pressed', String(state.tipoConcurso === val));
      b.onclick = () => { state.tipoConcurso = val; render(); };
      wrap.append(b);
    });
  }

  function renderAsideConcursos() {
    const ol = $('#aside-plazos');
    ol.replaceChildren();
    const abiertas = state.concursos.filter((c) => c.estado === 'abierta' && c.fecha_limite)
      .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite));
    if (!abiertas.length) ol.innerHTML = '<li class="muted">No hay plazos abiertos ahora mismo.</li>';
    abiertas.forEach((c) => {
      const d = parseDate(c.fecha_limite);
      const li = document.createElement('li');
      li.innerHTML = '<div class="datebox"><span class="datebox__day"></span><span class="datebox__month"></span></div><div><a target="_blank" rel="noopener"></a><small></small></div>';
      $('.datebox__day', li).textContent = d.getDate();
      $('.datebox__month', li).textContent = fmtMes.format(d).replace('.', '');
      const a = $('a', li); a.href = c.url; a.textContent = c.titulo;
      $('small', li).textContent = [TIPOS_CONCURSO[c.tipo], c.organismo].join(' · ');
      ol.append(li);
    });
  }

  function renderAsideCompetencia() {
    const ol = $('#aside-comp-events');
    ol.replaceChildren();
    const prox = state.competencia.filter((c) => c.fecha_evento && c.fecha_evento >= hoy())
      .sort((a, b) => a.fecha_evento.localeCompare(b.fecha_evento)).slice(0, 6);
    if (!prox.length) ol.innerHTML = '<li class="muted">Sin eventos próximos.</li>';
    prox.forEach((c) => {
      const d = parseDate(c.fecha_evento);
      const li = document.createElement('li');
      li.innerHTML = '<div class="datebox"><span class="datebox__day"></span><span class="datebox__month"></span></div><div><a target="_blank" rel="noopener"></a><small></small></div>';
      $('.datebox__day', li).textContent = d.getDate();
      $('.datebox__month', li).textContent = fmtMes.format(d).replace('.', '');
      const a = $('a', li); a.href = c.url; a.textContent = c.titulo;
      $('small', li).textContent = [c.fuente, c.ciudad].filter(Boolean).join(' · ');
      ol.append(li);
    });

    const ul = $('#aside-despachos');
    ul.replaceChildren();
    const ultima = {};
    state.competencia.forEach((c) => { if (!ultima[c.despacho] || c.fecha > ultima[c.despacho]) ultima[c.despacho] = c.fecha; });
    [...state.despachos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).forEach((d) => {
      const li = document.createElement('li');
      li.innerHTML = '<a target="_blank" rel="noopener"></a><small></small>';
      const a = $('a', li); a.href = d.web; a.textContent = d.nombre; a.title = d.perfil || '';
      $('small', li).textContent = [d.sede, ultima[d.id] ? 'última actividad ' + relativo(ultima[d.id]).toLocaleLowerCase('es') : 'sin actividad registrada'].filter(Boolean).join(' · ');
      ul.append(li);
    });
  }

  function renderAside() {
    if (state.view === 'competencia') return renderAsideCompetencia();
    if (state.view === 'concursos') return renderAsideConcursos();
    const ol = $('#aside-events');
    ol.replaceChildren();
    const prox = state.eventos.filter((e) => !esPasado(e)).slice(0, 5);
    if (!prox.length) { ol.innerHTML = '<li class="muted">No hay eventos próximos.</li>'; return; }
    prox.forEach((e) => {
      const d = parseDate(e.fecha_inicio);
      const li = document.createElement('li');
      li.innerHTML = '<div class="datebox"><span class="datebox__day"></span><span class="datebox__month"></span></div><div><a target="_blank" rel="noopener"></a><small></small></div>';
      $('.datebox__day', li).textContent = d.getDate();
      $('.datebox__month', li).textContent = fmtMes.format(d).replace('.', '');
      const a = $('a', li); a.href = e.url; a.textContent = e.titulo;
      $('small', li).textContent = [MODALIDAD[e.modalidad], e.ciudad].filter(Boolean).join(' · ');
      ol.append(li);
    });
  }

  function render() {
    document.body.dataset.view = state.view;
    $('#view-title').textContent = TITULOS[state.view];
    $$('[data-view]').forEach((a) => (a.dataset.view === state.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $('#when').hidden = state.view !== 'historial';
    const intro = $('#view-intro');
    const intros = {
      competencia: `Actividad pública de ${state.despachos.size} despachos competidores: publicaciones, eventos, premios, contratos públicos y movimientos corporativos.`,
      concursos: 'Licitaciones públicas, ayudas y premios relacionados con la propiedad industrial e intelectual, y a quién se adjudican los contratos.',
    };
    intro.hidden = !intros[state.view];
    intro.textContent = intros[state.view] || '';
    $$('#when button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.hist === state.hist)));

    renderChips();
    const list = $('#list');
    list.className = 'list';
    const items = filtrar(base());
    const card = (i) => ('despacho' in i ? cardCompetencia(i) : 'organismo' in i ? cardConcurso(i) : 'fecha_inicio' in i ? cardEvento(i) : cardNoticia(i));
    const cabecera = (texto, n) => {
      const h = document.createElement('h2');
      h.className = 'month';
      h.textContent = texto;
      if (n != null) { const c = document.createElement('span'); c.className = 'month__count'; c.textContent = n; h.append(' ', c); }
      return h;
    };
    let nodes;

    if (state.view === 'noticias') {
      // de la más reciente a la más antigua; la sección se indica en la etiqueta de cada tarjeta
      list.classList.add('list--news');
      nodes = items.map(card);
    } else if (state.view === 'concursos') {
      // abiertas primero (por plazo más próximo), luego adjudicadas y cerradas (más recientes primero)
      nodes = [];
      for (const [estado, titulo] of Object.entries(ESTADOS)) {
        const grupo = items.filter((i) => i.estado === estado);
        if (estado === 'abierta') grupo.sort((a, b) => (a.fecha_limite || '9').localeCompare(b.fecha_limite || '9'));
        else grupo.sort((a, b) => b.fecha.localeCompare(a.fecha));
        if (grupo.length) nodes.push(cabecera(titulo, grupo.length), ...grupo.map(card));
      }
    } else if (state.view === 'historial' || state.view === 'competencia') {
      // agrupado por mes, del más reciente al más antiguo
      nodes = [];
      let mes = null;
      for (const i of items) {
        const m = (i.fecha || i.fecha_inicio).slice(0, 7);
        if (m !== mes) {
          mes = m;
          const h = document.createElement('h2');
          h.className = 'month';
          h.textContent = fmtMesAnio.format(parseDate(m + '-01'));
          nodes.push(h);
        }
        nodes.push(card(i));
      }
    } else {
      nodes = items.map(card);
    }

    list.replaceChildren(...nodes);
    const empty = $('#empty');
    empty.hidden = nodes.length > 0;
    const sinFiltros = !state.q && (state.view === 'competencia' ? !state.tipo && !state.despacho
      : state.view === 'concursos' ? !state.tipoConcurso : !state.categoria);
    empty.textContent = !sinFiltros ? 'No hay resultados con estos filtros.'
      : state.view === 'guardados' ? 'Aún no has guardado nada. Pulsa el marcador en cualquier noticia o evento.'
      : state.view === 'historial' ? 'Todavía no hay nada en el historial.'
      : state.view === 'competencia' ? 'Todavía no hay actividad registrada de la competencia.'
      : state.view === 'concursos' ? 'Todavía no hay concursos ni licitaciones registrados.'
      : state.view === 'eventos' ? 'No hay eventos próximos. Consulta los pasados en el Historial.'
      : `No hay noticias de los últimos ${DIAS_ACTUALIDAD} días. Consulta el Historial.`;
    renderAside();
  }

  // ---------- acciones ----------
  async function compartir(title, url) {
    if (navigator.share) { try { await navigator.share({ title, url }); } catch { /* cancelado */ } return; }
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { window.open(url, '_blank', 'noopener'); }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, { position: 'fixed', left: '50%', bottom: 'calc(var(--bottombar-h) + 16px)', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--bg)', padding: '8px 14px', borderRadius: '999px', fontSize: '14px', zIndex: 50 });
    document.body.append(t);
    setTimeout(() => t.remove(), 1800);
  }

  function descargarICS(e) {
    const d = (s) => s.replaceAll('-', '');
    const finExcl = new Date(parseDate(e.fecha_fin || e.fecha_inicio).getTime() + 864e5).toISOString().slice(0, 10);
    const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PONS IP News//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${e.id}@ip-espana`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${d(e.fecha_inicio)}`,
      `DTEND;VALUE=DATE:${d(finExcl)}`,
      `SUMMARY:${esc(e.titulo)}`,
      `DESCRIPTION:${esc([e.descripcion, e.hora && 'Hora: ' + e.hora, e.url].filter(Boolean).join('\n'))}`,
      `LOCATION:${esc([MODALIDAD[e.modalidad], e.ciudad].filter(Boolean).join(' · '))}`,
      `URL:${e.url}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = `${e.id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- navegación ----------
  function fromHash() {
    const v = location.hash.slice(1);
    state.view = TITULOS[v] ? v : 'noticias';
    render();
    window.scrollTo({ top: 0 });
  }

  function initTheme() {
    const saved = store('tema', null);
    if (saved) document.documentElement.dataset.theme = saved;
    $('#theme').onclick = () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      store('tema', null, next);
    };
  }

  async function init() {
    initTheme();
    $('#list').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    let t;
    $('#q').addEventListener('input', (ev) => { clearTimeout(t); t = setTimeout(() => { state.q = ev.target.value; render(); }, 120); });
    $$('#when button').forEach((b) => (b.onclick = () => { state.hist = b.dataset.hist; render(); }));
    window.addEventListener('hashchange', fromHash);

    try {
      await cargar();
      if (state.actualizado) {
        $('#updated').textContent = 'Actualizado: ' + new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.actualizado));
      }
      fromHash();
    } catch (err) {
      console.error(err);
      $('#list').innerHTML = '';
      $('#empty').hidden = false;
      $('#empty').textContent = 'No se han podido cargar los datos. Revisa tu conexión.';
    }

    if ('serviceWorker' in navigator) {
      // Si se activa una versión nueva con la página abierta, recargar una vez para no mezclar versiones
      const habiaVersion = !!navigator.serviceWorker.controller;
      let recargado = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (habiaVersion && !recargado) { recargado = true; location.reload(); }
      });
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
