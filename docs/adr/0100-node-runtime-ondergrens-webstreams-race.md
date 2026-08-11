---
id: 0100-node-runtime-ondergrens-webstreams-race
title: 'Node-runtime kent een expliciete ondergrens (24.15.0) vanwege de webstreams-race'
status: aanvaard
date: 2026-08-11
elements: [t-platform]
---

De SSR-crash op `/overzicht` was geen fout in onze code maar nodejs/node#62036,
een race in Node's eigen webstreams-implementatie. Hij is upstream gerepareerd in
Node 24.15.0. We leggen daarom een expliciete patch-ondergrens vast in
`engines.node` en bewaken die met een deterministische regressietest, in plaats
van te vertrouwen op een major-only bereik dat de kwetsbare 24.13/24.14 toestaat.

## Context

Tussen 26 juli en 3 augustus 2026 registreerde `error_logs` drie crash-incidenten
(zes dubbel-gelogde rijen) op `/overzicht`, allemaal met dezelfde stack:

```
TypeError: controller[kState].transformAlgorithm is not a function
    at transformStreamDefaultControllerPerformTransform (node:internal/webstreams/transformstream:527:37)
    at node:internal/webstreams/transformstream:568:16
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
```

Geen enkel eigen bestand in de stack. `onRequestError` (`instrumentation.ts` →
`lib/observability/request-error.ts`) is een pure logging-hook zonder recovery,
dus elke logregel is een echt mislukte SSR-render voor de bezoeker op dat moment.

Een eerdere analyse wees naar een undici-bump als oorzaak. Die hypothese is
weerlegd: `undici` zelf wijzigde niet (alleen `undici-types`, TS-only), Vercel
draaide al Node 24 vóór die commit, en de commit landde ná het begin van de
stilte. "Nul events sinds de deploy" was dus geen geldig sluitbewijs.

De werkelijke oorzaak is te lezen in Node's eigen bron. Regel 568 is de tak
waarin een write die op `backpressureChange` geparkeerd stond wordt hervat.
Regel 660 (`transformStreamDefaultSourceCancelAlgorithm`) wist
`transformAlgorithm` **synchroon** zodra de leeskant geannuleerd wordt, terwijl
de writable pas een microtask later ge-errord wordt (regel 668). In dat venster
passeert de hervatte write de `'erroring'`-guard én de
`assert(state === 'writable')`, en roept vervolgens een inmiddels gewiste functie
aan. Dat is precies de waargenomen stack.

De trigger in onze app is een **bezoeker die wegklikt of ververst terwijl de
RSC-stream van `/overzicht` nog loopt** — de upstream-test noemt het letterlijk
"simulate client disconnect". `/overzicht` is de primaire hub na inloggen en de
zwaarste route, dus het langste streamvenster en daarmee de grootste kans.

Geverifieerd met de canonieke upstream-reproductie
(`test/parallel/test-whatwg-transformstream-cancel-write-race.js`):

| Node     | Uitkomst (300 runs) | Guard in `performTransform` |
| -------- | ------------------- | --------------------------- |
| 24.13.0  | 300× lek            | afwezig                     |
| 24.14.0  | 300× lek            | afwezig                     |
| 24.15.0  | 300× schoon         | aanwezig                    |

De fix (nodejs/node#62040) keert stil terug zodra de algorithms gewist zijn, en
landde in 25.8.1 en als backport in 24.15.0 (15 april 2026).

## Besluit

1. **`engines.node` wordt `">=24.15.0"`** in plaats van `"24.x"`. Een major-only
   bereik staat de kwetsbare 24.13/24.14 expliciet toe; de ondergrens benoemt
   waar de eis werkelijk ligt en levert een `EBADENGINE`-waarschuwing bij
   `npm install` op een te oude runtime.
2. **`.nvmrc` blijft `24`** (geen patch-pin). `actions/setup-node` en Vercel
   resolven een major naar de nieuwste 24.x, en dat is precies wat we willen:
   automatisch meebewegen met latere beveiligingspatches. Een exacte pin zou ons
   juist vastzetten op één patchniveau. De ondergrens wordt daarom afgedwongen
   door `engines` en de test, niet door `.nvmrc`.
3. **`test/node-webstreams-race.test.ts`** draait de upstream-reproductie en is
   deterministisch rood op elke Node < 24.15.0. Hij draait als eigen, snel
   falende CI-stap vóór de zware suites.

## Gevolgen

- Wie lokaal op Node < 24.15.0 draait, krijgt een rode test met de instructie te
  upgraden. Dat is het bedoelde signaal, geen defect in de test. Bij het
  opstellen van dit besluit draaide de ontwikkelmachine op 24.13.0 — dus
  aantoonbaar kwetsbaar.
- **Restrisico, bewust geaccepteerd:** Vercel biedt alleen *majors* aan
  (`24.x`/`22.x`/`20.x`) en rolt minor- en patchupdates naar eigen inzicht uit.
  We kunnen het patchniveau in productie dus niet afdwingen — `>=24.15.0` mapt
  daar simpelweg naar "nieuwste 24.x". De nieuwste 24.x is inmiddels 24.19.0
  (3 augustus 2026), ruim boven de ondergrens, maar de garantie ligt bij Vercel.
  Wie hierop wil sturen, doet dat via de projectinstelling *Node.js Version*,
  niet via dit bestand.
- De monitoringquery blijft bruikbaar als tegenbewijs:
  `SELECT count(*), max(created_at) FROM error_logs WHERE message LIKE '%transformAlgorithm%';`
  Anders dan bij de weerlegde undici-theorie is er nu wél een mechanisme dat
  verklaart waaróm nieuwe events zouden moeten uitblijven.
- Geen productcode gewijzigd: er viel in eigen code niets te repareren. De
  TransformStreams in de renderketen zijn die van Next.js/React, niet van ons.
