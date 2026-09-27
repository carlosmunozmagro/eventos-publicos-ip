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
  const TITULOS = { noticias: 'Noticias', eventos: 'Eventos', guardados: 'Guardados' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    view: 'noticias',
    categoria: null,
    when: 'proximos',
    q: '',
    noticias: [],
    eventos: [],
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
  const parseDate = (s) => new Date(s + 'T12:00:00');
  const fmtLargo = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtCorto = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'short' });

  function relativo(fecha) {
    const d = Math.round((parseDate(hoy()) - parseDate(fecha)) / 864e5);
    if (d === 0) return 'Hoy';
    if (d === 1) return 'Ayer';
    if (d > 1 && d < 7) return `Hace ${d} días`;
    return fmtCorto.format(parseDate(fecha));
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
    const [n, e] = await Promise.all([
      fetch('data/noticias.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('data/eventos.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    state.noticias = n.items.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    state.eventos = e.items.slice().sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
    state.actualizado = [n.actualizado, e.actualizado].filter(Boolean).sort().pop();
  }

  const texto = (o) => [o.titulo, o.resumen, o.descripcion, o.fuente, o.organizador, o.ciudad, ...(o.etiquetas || [])]
    .filter(Boolean).join(' ').toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');

  function filtrar(items) {
    const q = state.q.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
    return items.filter((i) => (!state.categoria || i.categoria === state.categoria) && (!q || texto(i).includes(q)));
  }

  const esPasado = (e) => (e.fecha_fin || e.fecha_inicio) < hoy();

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
    const a = $('.card__title a', node); a.href = n.url; a.textContent = n.titulo;
    $('.card__body', node).textContent = n.resumen;
    const ul = $('.tags', node);
    (n.etiquetas || []).slice(0, 4).forEach((tag) => { const li = document.createElement('li'); li.textContent = tag; ul.append(li); });
    saveBtn($('.save', node), n.id);
    $('.share', node).onclick = () => compartir(n.titulo, n.url);
    return node;
  }

  function cardEvento(e) {
    const node = $('#tpl-event').content.firstElementChild.cloneNode(true);
    if (esPasado(e)) node.classList.add('card--past');
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

  function renderChips() {
    const base = state.view === 'eventos' ? state.eventos : state.view === 'noticias' ? state.noticias : [...state.noticias, ...state.eventos];
    const presentes = new Set(base.map((i) => i.categoria));
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

  function renderAside() {
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
    $('#when').hidden = state.view !== 'eventos';
    $$('#when button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.when === state.when)));

    renderChips();
    const list = $('#list');
    list.className = 'list';
    let nodes = [];

    if (state.view === 'noticias') {
      list.classList.add('list--news');
      nodes = filtrar(state.noticias).map(cardNoticia);
    } else if (state.view === 'eventos') {
      let evs = filtrar(state.eventos).filter((e) => (state.when === 'pasados' ? esPasado(e) : !esPasado(e)));
      if (state.when === 'pasados') evs = evs.reverse();
      nodes = evs.map(cardEvento);
    } else {
      const n = filtrar(state.noticias).filter((i) => state.guardados.has(i.id)).map(cardNoticia);
      const e = filtrar(state.eventos).filter((i) => state.guardados.has(i.id)).map(cardEvento);
      nodes = [...e, ...n];
    }

    list.replaceChildren(...nodes);
    const empty = $('#empty');
    empty.hidden = nodes.length > 0;
    empty.textContent = state.view === 'guardados' && !state.q && !state.categoria
      ? 'Aún no has guardado nada. Pulsa el marcador en cualquier noticia o evento.'
      : 'No hay resultados con estos filtros.';
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
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IP España//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
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
    $$('#when button').forEach((b) => (b.onclick = () => { state.when = b.dataset.when; render(); }));
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

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  init();
})();
