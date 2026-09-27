# PONS IP News · Noticias y eventos de Propiedad Intelectual

Web app (PWA) con las noticias más relevantes y la agenda de eventos de Propiedad Industrial e
Intelectual en España. Se actualiza sola mediante una tarea programada de Claude Code que investiga
fuentes (OEPM, EUIPO, tribunales, BOE, sector…) y sube los cambios a este repositorio.

## Cómo funciona

```
Routine de Claude Code (diaria)         GitHub                       Usuarios
┌──────────────────────────┐   push   ┌─────────────────────┐      ┌───────────────┐
│ busca noticias y eventos │ ───────► │ main: data/*.json   │ ───► │ GitHub Pages  │
│ valida y hace commit     │          │ Action: valida +    │      │ móvil / PC    │
└──────────────────────────┘          │ publica en Pages    │      └───────────────┘
                                      └─────────────────────┘
```

- **Sin build ni dependencias**: HTML + CSS + JS. Los contenidos viven en `data/noticias.json` y
  `data/eventos.json`; la web los lee al cargar.
- **Móvil primero**: barra de pestañas inferior, chips de categoría deslizables, instalable en la
  pantalla de inicio (PWA) y funciona sin conexión con la última versión descargada.
- **Escritorio**: navegación superior, rejilla de noticias y columna lateral con próximos eventos.
- **Historial**: nada se borra. Las noticias de más de 30 días y los eventos ya celebrados pasan
  solos a la sección Historial, agrupados por mes.
- **Sin duplicados**: la tarea programada no escribe directamente en `data/`; deja los candidatos en
  `entrantes.json` y `scripts/merge.mjs` los fusiona. La misma noticia en otro medio se añade como
  “También en: …”; un evento ya conocido se actualiza (fecha, hora, enlace) en vez de repetirse.
- **Competencia**: actividad pública de los despachos competidores (artículos, eventos, premios y
  rankings, movimientos corporativos), filtrable por tipo y por despacho, con su agenda de eventos.
- Búsqueda, filtros por categoría, etiqueta “Nuevo”, “+ Calendario” (.ics), guardados
  (en el navegador), compartir, modo claro/oscuro.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `assets/` | La web app |
| `manifest.webmanifest`, `sw.js` | PWA (instalable + offline) |
| `data/noticias.json`, `data/eventos.json` | Contenido |
| `data/competencia.json` | Despachos competidores seguidos (`despachos`) y su actividad (`items`) |
| `scripts/merge.mjs` | Fusiona candidatos con los datos existentes, sin borrar y sin duplicar |
| `scripts/lib/dedup.mjs` | Reglas de detección de duplicados (URL normalizada + parecido de titulares) |
| `scripts/validate.mjs` | Validación del formato y de posibles duplicados |
| `tests/` | Tests del fusionado (`node --test tests/*.test.mjs`) |
| `automation/research-prompt.md` | Instrucciones de la tarea programada de research |
| `.github/workflows/deploy.yml` | Valida en cada PR/push y publica `main` en GitHub Pages |

## Puesta en marcha

1. Fusionar esta rama en `main`.
2. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. La web queda en `https://carlosmunozmagro.github.io/eventos-publicos-ip/`.
4. Crear la Routine de Claude Code con el contenido de `automation/research-prompt.md`
   (sesión nueva en cada ejecución). Recomendado: diaria a primera hora (hora de Madrid) y un
   barrido más profundo de eventos los lunes.
5. En el entorno cloud de Claude, permitir acceso de red a los dominios de las fuentes
   (oepm.es, euipo.europa.eu, epo.org, wipo.int, boe.es, …) para que pueda verificar cada página,
   y a los de los competidores (elzaburu.com, abg-ip.com, curell.com, isern.com, zbm-patents.eu,
   tecnopatent.com, ungria.com, balderip.com, clarkemodet.com, herrero.es, grauangulo.com).

## Probar en local

```bash
python3 -m http.server 8000   # y abrir http://localhost:8000
node scripts/merge.mjs entrantes.json --dry-run   # simular una fusión
node scripts/validate.mjs
node --test tests/*.test.mjs
```

## Categorías

`marcas`, `patentes`, `disenos`, `derechos-autor`, `indicaciones-geograficas`, `litigios`,
`normativa`, `institucional`. Para añadir una nueva: `scripts/validate.mjs`, `assets/js/app.js`
(`CATEGORIAS`) y un color `--c-<categoria>` en `assets/css/styles.css`.
