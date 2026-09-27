# IP España · Noticias y eventos de Propiedad Intelectual

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
- Búsqueda, filtros por categoría, eventos próximos/pasados, “+ Calendario” (.ics), guardados
  (en el navegador), compartir, modo claro/oscuro.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `assets/` | La web app |
| `manifest.webmanifest`, `sw.js` | PWA (instalable + offline) |
| `data/noticias.json`, `data/eventos.json` | Contenido |
| `scripts/validate.mjs` | Validación del formato de los datos (`node scripts/validate.mjs`) |
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
   (oepm.es, euipo.europa.eu, epo.org, wipo.int, boe.es, …) para que pueda verificar cada página.

## Probar en local

```bash
python3 -m http.server 8000   # y abrir http://localhost:8000
node scripts/validate.mjs
```

## Categorías

`marcas`, `patentes`, `disenos`, `derechos-autor`, `indicaciones-geograficas`, `litigios`,
`normativa`, `institucional`. Para añadir una nueva: `scripts/validate.mjs`, `assets/js/app.js`
(`CATEGORIAS`) y un color `--c-<categoria>` en `assets/css/styles.css`.
