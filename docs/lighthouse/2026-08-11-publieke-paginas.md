# Lighthouse — publieke pagina's, 11 augustus 2026

Nameting na de a11y-fixes uit de kaart *Launch-audit · Lighthouse-run*. De
nulmeting van diezelfde dag (vóór de fixes) staat in die kaart; de eerste
landing-meting van 28 juli staat in `docs/lighthouse/landing-*.{html,json}`.

## Meetopzet

| | |
|---|---|
| Lighthouse | 13.4.1 (CLI, headless Chrome) |
| Build | lokale productie-build (`npm run build` + `next start -p 3100`) |
| Werkboom | **vuil** — bevat niet-gecommit werk van een parallelle sessie (holdings/sync). `npx tsc --noEmit` was schoon. |
| Dekking | 7 publieke pagina's mobiel + landing desktop |
| Commando | `npx lighthouse@latest <url> --only-categories=performance,accessibility,best-practices,seo --form-factor=mobile --screenEmulation.mobile --chrome-flags="--headless=new"` |
| Rauwe rapporten | bewust niet gecommit (8 × ~0,6 MB JSON); deze samenvatting is de vastlegging |

## Scores

| Pagina | Perf | A11y | Best pract. | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/` (landing) | 82 | **100** | 96¹ | 100 | 4,4 s | 10 ms | 0,013 |
| `/veiligheid` | 85 | **100** | 96¹ | 100 | 4,1 s | 10 ms | 0 |
| `/functies` | 85 | **100** | 96¹ | 100 | 4,1 s | 10 ms | 0,003 |
| `/check` | 81 | **100** | 96¹ | 100 | 4,4 s | 130 ms | 0 |
| `/wft` | 86 | **100** | 96¹ | 100 | 3,9 s | 10 ms | 0,001 |
| `/login` | 91 | **100** | 96¹ | 63² | 3,4 s | 10 ms | 0 |
| `/prijzen` | 85 | **100** | 96¹ | 100 | 4,1 s | 10 ms | 0 |
| `/` desktop | 99 | **100** | 96¹ | 100 | 0,9 s | 0 ms | 0 |

¹ Eén gefaalde audit: `errors-in-console`, nog **2** items — beide het
localhost-artefact `/_vercel/speed-insights/script.js` (404 → MIME-weigering).
Op Vercel serveert het platform dat script wél. Het derde item van de nulmeting
(`upgrade-insecure-requests` inert in een report-only CSP) is met deze ronde
weg; zie `next.config.ts`. Best practices hoort op Vercel dus 100 te zijn.

² `/login` SEO 63 komt volledig uit `is-crawlable`: `robots.txt` zet
`Disallow: /login`. Bewust — geen defect.

## Accessibility: 100 op alle acht metingen

De nulmeting had `color-contrast` (`--ink-4` op 10px-tekst), een naamloze
progressbar op `/check`, `heading-order` op `/prijzen` en een ontbrekende
`<main>` + `text-zinc-400` op `/login`. Alle vier zijn opgelost; geen enkele
a11y-audit faalt nog op een publieke pagina.

## Performance: deze cijfers zijn géén bruikbare nulmeting

De Performance-kolom ligt 10–14 punten onder de meting van dezelfde dag op
schone `HEAD`, terwijl de pagina's **lichter** zijn (landing: 565 KB / 49
requests nu, tegen 654 KB / 49 requests toen) en de machine even snel was
(`benchmarkIndex` 4317 tegen 4369). Drie herhalingen van `/prijzen` gaven
identiek 85 — binnen deze serverinstantie is het dus stabiel, tussen twee
runs niet. De oorzaak is niet vastgesteld.

Conclusie: **hang geen acceptatiedrempel aan localhost-Performance.** De
structurele categorieën (A11y, Best practices, SEO) zijn wél direct
vergelijkbaar en zijn waar deze poort op stuurt. Het echte Performance-oordeel
hoort tegen productie te lopen met de RUM (`public.web_vitals`, ADR 0063)
ernaast — dat wacht op het koppelen van `trifinity.app`.

De bekende richting voor de landing blijft staan: render-blocking CSS (45 KB
chunk uit een 64 KB `globals.css`) en 209 KB fonts over 6 bestanden in het
kritieke pad. Aparte kaart, niet blokkerend.
