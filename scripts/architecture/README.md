# Architectuurplaat

Een interactieve, zelf-actualiserende plaat van de hele TriFinity-architectuur:
schermen, API's, datalagen, integraties, de generieke mechanismen en de modules.

> **Filosofie van deze opzet:** de plaat wordt **uit de code gegenereerd**, niet
> met de hand getekend. Daardoor klopt hij altijd en kost onderhoud bijna niets.
> Het enige wat je handmatig bijhoudt is het *verhaal* (annotations.mjs) — de
> *feiten* leest de scanner zelf.

## Draaien

```bash
npm run arch:diagram
# of:  node scripts/architecture/generate.mjs
```

Output in `docs/architecture/`:

| Bestand | Wat | Commit? |
| --- | --- | --- |
| `index.html` | De interactieve plaat (zelfstandig, geen dependencies). Open in de browser. | optioneel — regenereerbaar artefact |
| `architecture.json` | Gestructureerde snapshot. Bron voor de dagelijkse diff. | **ja** — geeft schone, leesbare diffs |
| `CHANGELOG.md` | Append-only log met per dag wat er veranderde. | **ja** |

Tip: wil je geen dagelijkse ruis van het grote `index.html` in git, zet dan
`docs/architecture/index.html` in `.gitignore` en commit alleen de JSON + changelog.

## Hoe het werkt

```
generate.mjs ──┬─ scant de repo (zero-dependency, alleen Node)
               ├─ leest annotations.mjs (het curatie-verhaal)
               ├─ vergelijkt met de vorige architecture.json  → diff
               ├─ schrijft architecture.json + CHANGELOG.md
               └─ vult template.html met de data            → index.html
```

| Bestand | Rol | Onderhoud |
| --- | --- | --- |
| `generate.mjs` | Scanner + diff + renderer. | Alleen aanraken voor een nieuwe scanner. |
| `annotations.mjs` | Het architectuurverhaal: de drie mechanismen, laag- en moduletoelichting, principes. | **Hier pas je tekst aan.** |
| `template.html` | De visuele HTML-template (CSS + render-JS). Bevat de placeholder `"__ARCH_DATA__"`. | Alleen voor visuele aanpassingen. |

Wat automatisch wordt gelezen (en dus nooit handmatig hoeft):

- **Schermen** — alle `app/**/page.tsx` (route-groups `(x)` gestript), per module ingedeeld.
- **API-routes** — alle `app/api/**/route.ts` met gedetecteerde HTTP-methodes.
- **Tabellen** — `create table …` uit `supabase/migrations/*.sql`.
- **Providers** — `<XxxProvider>` uit de app-shell layout.
- **Componenten** — geteld en gegroepeerd onder `components/`.
- **Integraties** — afgeleid uit `package.json`, `.env*` en de bank-parsers.
- **Generieke mechanismen** — de `buildXContext`-imports (builder.ts), de
  `showX: tool({…})`-kaarten (briefing.ts) en de coach-lagen (coach-suggestions.ts).
- **Modules & soevereiniteitsniveaus** — uit module-registry.ts en feature-phases.ts.

Elke scanner is **defensief**: ontbreekt een bestand of patroon, dan degradeert
hij netjes naar leeg (met een waarschuwing) in plaats van te crashen.

## Uitbreiden

**Een tekst aanpassen of een mechanisme/principe toevoegen** → bewerk
`annotations.mjs`. Niets anders nodig.

**Een nieuw data-gebied automatisch laten verschijnen** → niets doen. Zodra de
code bestaat (een nieuwe route, tabel, `buildXContext`, briefing-kaart, …) pikt
de scanner het bij de volgende run op.

**Een compleet nieuwe scanner toevoegen** (bv. een lijst cron-jobs):

1. Schrijf een `scanCronJobs()` in `generate.mjs` die een array teruggeeft.
2. Roep hem aan in `build()` en hang het resultaat onder `data`.
3. Render het in `template.html` (een extra band of accordion).

## Dagelijks bijwerken

Een Cowork-taak draait elke ochtend `npm run arch:diagram`, regenereert de plaat
en meldt bovenaan (en in de chat) wat er sinds gisteren veranderde. De diff komt
uit de vergelijking met de vorige `architecture.json`.
