#!/usr/bin/env node
/**
 * TriFinity — Bundle-budget: per-route first-load JS (gzip) uit build-manifesten
 * ============================================================================
 * Zero-dependency Node ESM script (Task 3.4, performance-programma fase 3).
 * Berekent per App-Router-route de "first load JS" — de unie van alle client-
 * chunks die een bezoeker moet laden om die pagina te hydrateren — direct uit
 * de Next-buildoutput, en faalt de build als een route boven het gzip-budget
 * komt. Dit is óók het meetinstrument voor de vóór/ná-cijfers van T3.1/T3.2/
 * T3.3/T3.6 (zie docs/superpowers/plans/2026-07-19-performance-programma.md).
 *
 *   npm run build:next-only && node scripts/perf/route-sizes.mjs
 *   (of: npm run perf:route-sizes, na een build)
 *
 * ── Turbopack-methode (belangrijk — lees dit vóór je het script aanpast) ────
 * De build gebruikt Turbopack, niet webpack. Dat verandert welke manifesten
 * bestaan en hoe je route → chunks opzoekt:
 *
 *   - `.next/app-build-manifest.json` (webpack-tijdperk `route → chunks[]`)
 *     BESTAAT NIET onder Turbopack. Niet gebruiken, niet op vertrouwen.
 *   - Top-level `.next/build-manifest.json` is Pages-Router-vormig
 *     (`{ pages, devFiles, polyfillFiles, lowPriorityFiles, rootMainFiles }`)
 *     en bevat GEEN App-Router-routes. Wel bevat het de gedeelde bootstrap-
 *     chunks die elke pagina meeladen: `rootMainFiles` + `polyfillFiles`.
 *     `lowPriorityFiles` (_buildManifest.js/_ssgManifest.js/
 *     _clientMiddlewareManifest.js) zijn Pages-Router-devtooling-artefacten
 *     die geen App-Router-pagina serveert — bewust NIET meegeteld.
 *   - `.next/app-path-routes-manifest.json` mapt module-pad → publieke route
 *     (bv. `"/(app)/overzicht/page": "/overzicht"`). Dit is de routekaart;
 *     geen chunks.
 *   - De eigenlijke per-route chunks leven in
 *     `.next/server/app/<route>/page_client-reference-manifest.js` (146 stuks in
 *     deze build — één per page-module-pad in de routes-manifest, 1-op-1
 *     geverifieerd). Elk bestand is JS dat bij het evalueren
 *     `globalThis.__RSC_MANIFEST[<module-pad>] = { clientModules: {...} }`
 *     zet — GEEN platte `route → chunks[]`-map. `clientModules` is een map
 *     van modulesleutel → `{ id, name, chunks: [...], async }`; de first-load
 *     chunks van een route zijn de UNIE van alle `chunks`-arrays van alle
 *     clientModules van die page-entry.
 *
 *   Layout-keten: leidt een route ook chunks af van bovenliggende
 *   layout.tsx-bestanden? EMPIRISCH GEVERIFIEERD (deze build): er bestaat
 *   GEEN ENKEL bestand genaamd `layout_client-reference-manifest.js` onder
 *   `.next/server/app` (0 van de 0 — Turbopack emit die niet apart). En de
 *   page-entry van `/(app)/overzicht/page` bevat al clientModules voor
 *   `components/app/module-color-provider.tsx`, `components/app/shell/
 *   responsive-shell.tsx`, `components/command-palette/command-palette-
 *   provider.tsx` en `components/app/shell/nav-stack-meta.tsx` — stuk voor
 *   stuk componenten die uitsluitend door `app/(app)/layout.tsx` gebruikt
 *   worden. Conclusie: Turbopack bakt de volledige layout-keten al in de
 *   leaf-page-manifest. Een aparte laag-voor-laag layout-union is dus
 *   OVERBODIG en zou dubbeltellen (dezelfde chunks nogmaals unioneren
 *   verandert de deduplicated som toch niet, maar het zou wél een niet-
 *   bestaand bestand proberen te lezen). Vind je in een latere Next-versie
 *   wél `layout_client-reference-manifest.js`-bestanden terug: voeg de union
 *   dan alsnog toe (de `existsSync`-guards hieronder maken dat veilig).
 *
 *   Alle `async` velden in deze build zijn `false` (10.294 clientModules
 *   gescand, 0 async) — er lijkt in deze Turbopack-build geen sprake van
 *   lazy-gemarkeerde clientModules-chunks in de RSC-manifest zelf (echte
 *   `next/dynamic()`-imports worden los geladen buiten dit manifest om).
 *   Het script telt defensief toch alléén `async !== true`-chunks mee, zodat
 *   het gedrag correct blijft als een toekomstige build dat wel zet.
 *
 *   Padnotatie verschilt per bron: RSC-manifest-chunks zijn geprefixt met
 *   `/_next/` (bv. `/_next/static/chunks/0dmr~uwyzv.ov.js`) → strip `/_next/`
 *   en resolve onder `.next/`. `build-manifest.json`-paden zijn al relatief
 *   aan `.next/` (bv. `static/chunks/...`) — geen prefix om te strippen.
 *
 * ── Self-verificatie tegen een echte ground truth (19-07-2026) ──────────────
 * De brief vroeg om minstens één route te vergelijken met de "First-Load-JS"-
 * regel uit `next build`-stdout. BEVINDING: Next.js 16.2.6 + Turbopack print
 * die tabel niet meer — de app-router-sectie van de build-stdout toont alleen
 * de routeboom (○ Static / ƒ Dynamic), geen kB-kolom. In plaats daarvan bevat
 * een verse build wél `.next/diagnostics/route-bundle-stats.json`: een array
 * van `{ route, firstLoadUncompressedJsBytes, firstLoadChunkPaths }` — Next's
 * eigen (ongedocumenteerde) per-route bundlestatistiek. Daartegen gevalideerd:
 *   - `/overzicht` en `/login`: mijn chunk-set (union + rootMainFiles) was
 *     EXACT gelijk aan `firstLoadChunkPaths`, op precies 1 chunk na: de
 *     polyfill-chunk (`polyfillFiles`), die Next zelf NIET meetelt. Vandaar
 *     dat `polyfillFiles` hierboven bewust is uitgesloten — vóór deze fix
 *     telde het script 'm ten onrechte mee.
 *   - `/toekomst`: na die fix nog 1 chunk-verschil (van de 30): een chunk die
 *     in dit manifest uitsluitend onder de `not-found`-boundary-entry
 *     voorkomt (niet in enig `clientModules`) maar door Next kennelijk toch
 *     tot de first-load van de pagina gerekend wordt.
 *   - Alternatieve methode geprobeerd (unie van `entryJSFiles[...]` over de
 *     hele layout-keten i.p.v. `clientModules`): leverde een STERKE
 *     ondertelling op (8 vs 25-30 chunks) — die structuur is dus NIET
 *     bruikbaar als unie-bron. `clientModules`-unie (zoals hierboven
 *     geïmplementeerd) is de nauwkeurige methode.
 *
 * ── Nagekomen fix (review Task 3.4, 19-07-2026): de twee gemiste
 *    not-found-boundary-chunks ──────────────────────────────────────────────
 * Het "1 chunk op 30"-verschil bij `/toekomst` hierboven bleek bij het echte
 * self-verificatiescript (alle 145 routes tegen `route-bundle-stats.json`,
 * niet slechts 2 steekproef-routes) een STRUCTUREEL patroon: exact 69 routes
 * misten `static/chunks/14.<hash>.js` en 19 routes misten
 * `static/chunks/<hash>.js` (een tweede, andere hash). Root-oorzaak: elke
 * `*_client-reference-manifest.js` bevat naast `clientModules` ook een
 * `entryJSFiles`-map (moduleentrypad → chunks[]) met entries voor o.a.
 * `app/not-found` en `app/(app)/not-found` (de root- resp. group-brede
 * not-found-boundary). Die not-found-chunks worden NERGENS in
 * `clientModules` gerefereerd (in tegenstelling tot `app/error`, dat wél al
 * via clientModules meekomt) maar Next telt ze toch mee in
 * `firstLoadChunkPaths` — kennelijk omdat elke route de not-found-boundary
 * van zijn route-groep altijd kan renderen. Fix: `notFoundBoundaryChunks()`
 * leest `entryJSFiles`, pakt alle keys die op `/not-found` eindigen (generiek
 * op keypatroon, NIET op een hardcoded chunk-hash — een hash verandert bij
 * elke build) en unioneert hun chunks in de route-total. Let op:
 * `entryJSFiles`-paden zijn AL relatief aan `.next/` (`static/chunks/...`,
 * zoals `build-manifest.json`) — GEEN `/_next/`-prefix zoals de
 * `clientModules`-chunkrefs, dus `resolveBuildManifestPath` gebruiken, niet
 * `resolveRscChunkPath`. Ná deze fix: 145/145 exacte match tegen
 * `route-bundle-stats.json` (was 144/145 — zie ook de `/_global-error`-noot
 * hieronder voor het 146e page-entry-artefact).
 *
 * Ander bevonden verschil, GEEN bug: `app-path-routes-manifest.json` bevat
 * 146 page-entries (module-paden die op "/page" eindigen) maar
 * `route-bundle-stats.json` slechts 145 routes. Het
 * verschil is `/_global-error` — de root `global-error`-boundary wordt door
 * Turbopack als eigen page-module-pad geëxporteerd (dus door dit script
 * gemeten) maar is geen navigeerbare App-Router-pagina en wordt door Next's
 * eigen route-bundle-diagnostiek dan ook niet meegenomen. 145/145 hierboven
 * betekent dus: elke ECHTE route matcht exact; `/_global-error` blijft als
 * 146e regel in de output staan (onschadelijk, geen budget-impact van
 * betekenis) maar heeft simpelweg geen tegenhanger om tegen te valideren.
 *
 *   Kortom: de gekozen methode is, ná bovenstaande fix, empirisch bevestigd
 *   tot een EXACTE match tegen Next's eigen interne boekhouding (145/145).
 *   Toekomstige onderhouder: overweeg `.next/diagnostics/route-bundle-
 *   stats.json` direct te consumeren als die diagnostiek in een latere
 *   Next-versie stabiel blijft — dat zou deze unie-logica overbodig kunnen
 *   maken.
 *
 * ── Budget: ratchet i.p.v. structureel-rode poort (review-fix Task 3.4) ─────
 * De eerste versie van dit script gatete hard op 300 kB gzip (BUDGET_KB) —
 * dat zette de CI-job meteen rood op 77 van de 145 routes (de authenticated-
 * shell-baseline zit vóór wave-2-slanking al rond 290-300 kB), lang vóórdat
 * de slankingstaken (T3.1/T3.2/T3.3/T3.5) landen. Review-oordeel: 300 kB
 * blijft bestaan als GERAPPORTEERDE "over target"-kolom (nooit gatend) —
 * de gate zelf is nu een RATCHET tegen een per-route high-water-mark:
 *
 *   - `scripts/perf/route-sizes.baseline.json` (NIET gecommit vanaf dit
 *     Windows-development-werk — zie hieronder) bevat `{ route: gzipKb }`
 *     per route, de op-schrijfmoment bekende bovengrens.
 *   - Een route faalt ALLEEN als `current > baseline * RATCHET_TOLERANCE`
 *     (1.04 = 4% marge voor chunk-split-jitter tussen builds). Op of onder
 *     de baseline is altijd groen, ongeacht de 300 kB-drempel.
 *   - `--update-baseline` herschrijft het bestand: per route wordt de
 *     NIEUWE waarde het MINIMUM van de bestaande baseline en de huidige
 *     meting — de baseline kan dus alleen DALEN via deze route (monotone
 *     convergentie richting de 300 kB-drempel), nooit stijgen. Een route
 *     die zwaarder is geworden dan zijn baseline wordt bij een update
 *     geweigerd (blijft op de oude, lagere waarde staan — zichtbaar als
 *     `rejected` in de update-samenvatting) zodat een regressie niet
 *     stilzwijgend de baseline optrekt. Nieuwe routes worden toegevoegd.
 *
 * BELANGRIJK — platform-gevoeligheid: gzip-bytes van dezelfde build kunnen
 * marginaal verschillen tussen besturingssystemen (padscheiding, regel-
 * eindes in gegenereerde bundels, zlib-versie). De baseline MOET daarom
 * gegenereerd worden op dezelfde runner als waar de gate draait — d.w.z.
 * op Linux-CI (`ubuntu-latest`, zie .github/workflows/ci.yml), NIET lokaal
 * op een Windows-ontwikkelmachine. Zolang die eerste CI-gegenereerde
 * baseline nog niet gecommit is (of een gemeten route ontbreekt erin) draait
 * dit script REPORT-ONLY: exit 0, met een duidelijke melding, geen enkele
 * route faalt. Zie ook de comment bij de `bundle-budget`-job in ci.yml voor
 * de eenmalige `--update-baseline`-procedure.
 *
 * BUDGET_OVERRIDES blijft bestaan als uitzonderingsmechanisme voor werkelijk
 * exceptionele gevallen (bv. een route die de ratchet-tolerantie om een
 * legitieme, tijdelijke reden moet omzeilen) — de ratchet vervangt het
 * gebruik dat de eerste versie ervoor had (`/toekomst` had een handmatig
 * 600 kB-plafond; dat is nu verwijderd, de ratchet regelt dat automatisch
 * t.o.v. de eigen baseline van die route). Een override-route blijft altijd
 * zichtbaar als "boven target" in de tabel (t.o.v. de standaard 300 kB) —
 * alleen de EXIT-CODE respecteert de override.
 *
 * Output:
 *   - stdout: gesorteerde tabel (zwaarste eerst) + samenvatting.
 *   - `.next/route-sizes.json`: machineleesbare bron voor T3.1/T3.2/T3.3/T3.6
 *     (niet gecommit — leeft in de build-output).
 *
 * Test-only override: env var `ROUTE_SIZES_BUDGET_KB` overschrijft BUDGET_KB
 * voor het aantonen van het faalpad (zie scripts/perf/route-sizes.test.mjs).
 * Niet gebruikt door CI — daar geldt altijd de echte 300 kB als gerapporteerde
 * (niet-gatende) target.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const NEXT_DIR = join(ROOT, '.next')

export const BUDGET_KB = Number(process.env.ROUTE_SIZES_BUDGET_KB) || 300

// 4% tolerantie boven de baseline (chunk-split-jitter tussen builds — zelfde
// route-inhoud kan een paar bytes verschuiven puur door Turbopack's
// chunk-indeling, zonder dat er iets echt zwaarder werd). Zie module-docblock
// ("Budget: ratchet i.p.v. structureel-rode poort") voor de volledige uitleg.
export const RATCHET_TOLERANCE = 1.04

// Per-route high-water-mark, {route: gzipKb}. Bewust NIET gecommit vanaf dit
// (Windows-)werk — zie module-docblock. Ontbreekt dit bestand (of een
// gemeten route erin), dan draait de check report-only.
export const BASELINE_PATH = join(HERE, 'route-sizes.baseline.json')

// Uitzonderingsmechanisme voor werkelijk exceptionele gevallen — zie
// module-docblock. Leeg by default: de ratchet regelt de normale
// wave-1→wave-2-convergentie nu automatisch per route t.o.v. zijn eigen
// baseline, dus geen handmatige per-route-plafonds meer nodig.
export const BUDGET_OVERRIDES = {}

/** Unieke waarden, volgorde behouden. */
function uniq(arr) {
  return [...new Set(arr)]
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Evalueert een `*_client-reference-manifest.js`-bestand in een geïsoleerde
 * sandbox (géén `eval`/module-cache-vervuiling) en geeft de resulterende
 * `__RSC_MANIFEST`-map terug.
 */
export function loadRscManifest(absPath) {
  const code = readFileSync(absPath, 'utf8')
  const sandbox = { __RSC_MANIFEST: {} }
  // Bewust `new Function`: het manifest is gegenereerde build-output (geen
  // user-input) en dit is de geëigende manier om een los
  // `globalThis.X = ...`-script te evalueren zonder de echte global aan te
  // raken. (ESLint's `no-new-func` staat hier niet aan — geen disable nodig.)
  new Function('globalThis', code)(sandbox)
  return sandbox.__RSC_MANIFEST
}

/**
 * Pure helper: unioneert alle `chunks`-arrays van de `clientModules` van één
 * page-entry (async-chunks defensief overgeslagen — zie docblock). Puur
 * getest in route-sizes.test.mjs via een fixture-manifest.
 */
export function unionChunks(rscManifestEntry) {
  const clientModules = rscManifestEntry?.clientModules || {}
  const chunkSet = new Set()
  for (const mod of Object.values(clientModules)) {
    if (mod.async === true) continue
    for (const chunk of mod.chunks || []) chunkSet.add(chunk)
  }
  return [...chunkSet]
}

/**
 * De niet-in-`clientModules`-gerefereerde not-found-boundary-chunks (zie
 * module-docblock, "Nagekomen fix"). Leest `entryJSFiles` — een map van
 * moduleentrypad → chunks[] — en pakt generiek elke key die op `/not-found`
 * eindigt (dus zowel de root `app/not-found` als elke route-groep's eigen
 * `app/(groep)/not-found`, ongeacht hoeveel groepen een toekomstige route-
 * structuur heeft). GEEN hardcoded chunk-hash: die verandert elke build.
 * Puur getest in route-sizes.test.mjs.
 */
export function notFoundBoundaryChunks(rscManifestEntry) {
  const entryJSFiles = rscManifestEntry?.entryJSFiles || {}
  const chunkSet = new Set()
  for (const [modulePath, chunks] of Object.entries(entryJSFiles)) {
    if (!modulePath.endsWith('/not-found')) continue
    for (const chunk of chunks || []) chunkSet.add(chunk)
  }
  return [...chunkSet]
}

/** RSC-manifest-chunkpaden zijn geprefixt met `/_next/`; build-manifest-paden niet. */
function resolveRscChunkPath(nextDir, chunkRef) {
  return join(nextDir, chunkRef.replace(/^\/_next\//, ''))
}
function resolveBuildManifestPath(nextDir, relPath) {
  return join(nextDir, relPath)
}

/** Som van gzip-bytes van een lijst chunk-bestandspaden (ontbrekende bestanden tellen als waarschuwing, niet als crash). */
function gzipTotal(paths) {
  let bytes = 0
  const missing = []
  for (const p of paths) {
    if (!existsSync(p)) {
      missing.push(p)
      continue
    }
    bytes += gzipSync(readFileSync(p)).length
  }
  return { bytes, missing }
}

function formatKb(bytes) {
  return (bytes / 1024).toFixed(1)
}

export function computeRouteSizes({ nextDir = NEXT_DIR } = {}) {
  const routesManifestPath = join(nextDir, 'app-path-routes-manifest.json')
  const buildManifestPath = join(nextDir, 'build-manifest.json')

  if (!existsSync(routesManifestPath) || !existsSync(buildManifestPath)) {
    throw new Error(
      `Ontbrekende buildmanifesten onder ${nextDir} — draai eerst \`npm run build:next-only\`.`
    )
  }

  const routesManifest = readJson(routesManifestPath)
  const buildManifest = readJson(buildManifestPath)

  // Gedeelde bootstrap-chunks die bij ELKE pagina meeladen (framework/main/
  // turbopack-runtime). `polyfillFiles` bewust NIET meegeteld — empirisch
  // geverifieerd tegen `.next/diagnostics/route-bundle-stats.json` (zie
  // docblock): Next's eigen first-load-boekhouding sluit de polyfill-chunk
  // uit. `lowPriorityFiles` blijft ook uitgesloten — zie docblock.
  const sharedChunkPaths = uniq([...(buildManifest.rootMainFiles || [])]).map((f) =>
    resolveBuildManifestPath(nextDir, f)
  )

  const pageEntries = Object.entries(routesManifest).filter(([modPath]) =>
    modPath.endsWith('/page')
  )

  const routes = []
  const skipped = []

  for (const [modPath, route] of pageEntries) {
    const manifestFile = join(nextDir, 'server', 'app', `${modPath}_client-reference-manifest.js`)
    if (!existsSync(manifestFile)) {
      skipped.push({ route, modPath, reason: 'geen client-reference-manifest' })
      continue
    }

    const rsc = loadRscManifest(manifestFile)
    const entry = rsc[modPath]
    if (!entry) {
      skipped.push({ route, modPath, reason: 'manifest bevat geen entry voor eigen modulepad' })
      continue
    }

    const routeChunkRefs = unionChunks(entry)
    const routeChunkPaths = routeChunkRefs.map((c) => resolveRscChunkPath(nextDir, c))

    // Not-found-boundary-chunks: `entryJSFiles`-paden zijn AL relatief aan
    // `.next/` (geen `/_next/`-prefix, zoals build-manifest-paden) — dus
    // resolveBuildManifestPath, niet resolveRscChunkPath.
    const notFoundRefs = notFoundBoundaryChunks(entry)
    const notFoundPaths = notFoundRefs.map((c) => resolveBuildManifestPath(nextDir, c))

    const allChunkPaths = uniq([...sharedChunkPaths, ...routeChunkPaths, ...notFoundPaths])

    const { bytes, missing } = gzipTotal(allChunkPaths)

    routes.push({
      route,
      modPath,
      gzipBytes: bytes,
      gzipKb: Number(formatKb(bytes)),
      chunkCount: allChunkPaths.length,
      missingChunks: missing.length,
    })
  }

  routes.sort((a, b) => b.gzipBytes - a.gzipBytes)
  return { routes, skipped }
}

/**
 * Pure budget-evaluatie per route: bepaalt of een route de CI faalt
 * (respecteert `overrides`) en of 'ie boven de STANDAARD-drempel zit (altijd
 * zichtbaar, ongeacht override — zie module-docblock). Los van `main()`
 * getest zodat beide paden (pass/fail) zonder subprocess aan te tonen zijn.
 */
export function evaluateBudget(routes, { budgetKb = BUDGET_KB, overrides = BUDGET_OVERRIDES } = {}) {
  const evaluated = routes.map((r) => {
    const override = overrides[r.route]
    const failThreshold = override ?? budgetKb
    const overBaseline = r.gzipKb > budgetKb
    const fails = r.gzipKb > failThreshold
    let status = 'ok'
    if (fails) status = `FAIL (>${failThreshold} kB)`
    else if (overBaseline) status = `boven budget (override tot ${override} kB)`
    return { ...r, override, failThreshold, overBaseline, fails, status }
  })
  return {
    evaluated,
    failing: evaluated.filter((r) => r.fails),
    overBaselineOnly: evaluated.filter((r) => r.overBaseline && !r.fails),
  }
}

/**
 * Leest de baseline; `null` als het bestand ontbreekt of geen bruikbaar
 * `{route: gzipKb}`-object bevat. `null` is het signaal voor `evaluateRatchet`
 * om report-only te draaien (zie module-docblock).
 */
export function loadBaseline(path = BASELINE_PATH) {
  if (!existsSync(path)) return null
  try {
    const parsed = readJson(path)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Ratchet-evaluatie: bepaalt per route of de CI faalt t.o.v. de EIGEN
 * baseline × tolerantie (respecteert `overrides` als uitzonderingsklep) en
 * of 'ie boven de gerapporteerde 300 kB-target zit (die kolom is nooit op
 * zichzelf gatend). Ontbreekt de baseline geheel, of ontbreekt een gemeten
 * route erin, dan is de uitkomst `mode: 'report-only'` — GEEN enkele route
 * faalt, ongeacht de meting (zie module-docblock: de eerste/bijgewerkte
 * baseline moet eerst via `--update-baseline` op Linux-CI gegenereerd
 * worden — gzip-bytes zijn platform-gevoelig). Los van `main()` getest zodat
 * alle vier de paden (pass/fail/report-only/override) zonder subprocess
 * aan te tonen zijn.
 */
export function evaluateRatchet(
  routes,
  { baseline = null, tolerance = RATCHET_TOLERANCE, budgetKb = BUDGET_KB, overrides = BUDGET_OVERRIDES } = {}
) {
  const missingFromBaseline = baseline ? routes.filter((r) => !(r.route in baseline)) : routes
  const reportOnly = !baseline || missingFromBaseline.length > 0

  if (reportOnly) {
    const evaluated = routes.map((r) => {
      const baselineKb = baseline ? baseline[r.route] ?? null : null
      const overTarget = r.gzipKb > budgetKb
      return {
        ...r,
        baselineKb,
        override: overrides[r.route],
        overTarget,
        fails: false,
        status: overTarget ? `report-only (boven target ${budgetKb} kB)` : 'report-only',
      }
    })
    const reason = !baseline
      ? 'geen baseline-bestand gevonden'
      : `${missingFromBaseline.length} route(s) ontbreken in de baseline (${missingFromBaseline
          .map((r) => r.route)
          .join(', ')})`
    return {
      mode: 'report-only',
      reason,
      evaluated,
      failing: [],
      overTargetOnly: evaluated.filter((r) => r.overTarget),
    }
  }

  const evaluated = routes.map((r) => {
    const override = overrides[r.route]
    const baselineKb = baseline[r.route]
    const ratchetCeiling = baselineKb * tolerance
    const failThreshold = override ?? ratchetCeiling
    const overTarget = r.gzipKb > budgetKb
    const fails = r.gzipKb > failThreshold
    let status = 'ok'
    if (fails) {
      status = `FAIL (>${failThreshold.toFixed(1)} kB${
        override ? `, override ${override} kB` : ` = baseline ${baselineKb} kB × ${tolerance}`
      })`
    } else if (overTarget) {
      status = `boven target (${budgetKb} kB), binnen baseline (${baselineKb} kB × ${tolerance})`
    }
    return { ...r, baselineKb, override, failThreshold, overTarget, fails, status }
  })

  return {
    mode: 'ratchet',
    reason: null,
    evaluated,
    failing: evaluated.filter((r) => r.fails),
    overTargetOnly: evaluated.filter((r) => r.overTarget && !r.fails),
  }
}

/**
 * Pure guard voor `--update-baseline`: monotone convergentie richting de
 * 300 kB-target. Per route:
 *   - ontbreekt in de bestaande baseline → toevoegen (nieuwe route, ok).
 *   - gemeten < bestaand → DALEN toegestaan, baseline wordt verlaagd.
 *   - gemeten > bestaand → GEWEIGERD; baseline blijft op de oude (lagere)
 *     waarde staan (zichtbaar als `rejected`) zodat een regressie niet
 *     stilzwijgend de baseline optrekt — een bewuste stijging vereist het
 *     handmatig aanpassen van de bestaande regel, niet een gewone
 *     `--update-baseline`-run.
 *   - gemeten === bestaand → ongewijzigd.
 * Routes die in de bestaande baseline staan maar niet meer gemeten worden
 * (verwijderde pagina) blijven ongewijzigd staan — opschonen is een aparte,
 * bewuste actie.
 */
export function computeBaselineUpdate(routes, existingBaseline) {
  const next = { ...(existingBaseline || {}) }
  const added = []
  const lowered = []
  const rejected = []

  for (const r of routes) {
    const prev = next[r.route]
    if (prev == null) {
      next[r.route] = r.gzipKb
      added.push(r.route)
    } else if (r.gzipKb < prev) {
      next[r.route] = r.gzipKb
      lowered.push({ route: r.route, from: prev, to: r.gzipKb })
    } else if (r.gzipKb > prev) {
      rejected.push({ route: r.route, baseline: prev, measured: r.gzipKb })
    }
  }

  return { baseline: next, added, lowered, rejected }
}

function printTable(evaluated) {
  const header = ['Route', 'gzip kB', 'Baseline kB', '#chunks', 'Status']
  const rows = evaluated.map((r) => [
    r.route,
    r.gzipKb.toFixed(1),
    r.baselineKb == null ? '–' : Number(r.baselineKb).toFixed(1),
    String(r.chunkCount),
    r.status,
  ])
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(line(header))
  console.log(line(widths.map((w) => '-'.repeat(w))))
  for (const row of rows) console.log(line(row))
}

function printUpdateSummary({ added, lowered, rejected }) {
  console.log(
    `\nBaseline-update: ${added.length} nieuwe route(s), ${lowered.length} verlaagd, ${rejected.length} geweigerd (stijging).`
  )
  if (added.length) console.log(`  + Nieuw: ${added.join(', ')}`)
  if (lowered.length) {
    console.log('  ↓ Verlaagd:')
    for (const l of lowered) console.log(`    - ${l.route}: ${l.from} → ${l.to} kB`)
  }
  if (rejected.length) {
    console.log(
      '  ✗ Geweigerd (gemeten waarde hoger dan baseline — baseline blijft op de oude, lagere waarde; mogelijke regressie):'
    )
    for (const r of rejected) console.log(`    - ${r.route}: baseline ${r.baseline} kB, gemeten ${r.measured} kB`)
  }
}

function main() {
  const updateBaseline = process.argv.slice(2).includes('--update-baseline')

  let result
  try {
    result = computeRouteSizes()
  } catch (err) {
    console.error(`✗ ${err.message}`)
    process.exit(1)
  }

  const { routes, skipped } = result

  if (skipped.length) {
    console.warn(`\n  ! ${skipped.length} route(s) overgeslagen (geen bruikbare manifest):`)
    for (const s of skipped) console.warn(`    - ${s.route} (${s.modPath}): ${s.reason}`)
  }

  if (updateBaseline) {
    const existing = loadBaseline() || {}
    const { baseline, added, lowered, rejected } = computeBaselineUpdate(routes, existing)
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
    console.log(`\nBaseline geschreven: ${BASELINE_PATH}`)
    printUpdateSummary({ added, lowered, rejected })
    console.log(
      '\nLET OP: commit dit bestand alleen als het op Linux-CI (ubuntu-latest) gegenereerd is — gzip-bytes zijn' +
        ' platform-gevoelig, zie module-docblock. Geen Windows-baseline committen.'
    )
    process.exit(0)
  }

  const baseline = loadBaseline()
  const { mode, reason, evaluated, failing, overTargetOnly } = evaluateRatchet(routes, { baseline })

  console.log(
    `\nBundle-budget — first-load JS per route (gzip, gerapporteerde target ${BUDGET_KB} kB, ratchet-tolerantie ×${RATCHET_TOLERANCE})\n`
  )
  printTable(evaluated)

  const outPath = join(NEXT_DIR, 'route-sizes.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode,
        reason,
        budgetKb: BUDGET_KB,
        ratchetTolerance: RATCHET_TOLERANCE,
        overrides: BUDGET_OVERRIDES,
        routes: evaluated,
        skipped,
      },
      null,
      2
    )
  )
  console.log(`\nJSON geschreven: ${outPath}`)

  console.log(
    `\nTop-5 zwaarste routes: ${routes
      .slice(0, 5)
      .map((r) => `${r.route} (${r.gzipKb.toFixed(1)} kB)`)
      .join(', ')}`
  )

  if (overTargetOnly.length) {
    console.log(
      `Boven target (${BUDGET_KB} kB) maar binnen baseline/tolerantie (of override): ${overTargetOnly
        .map((r) => `${r.route} (${r.gzipKb.toFixed(1)} kB)`)
        .join(', ')}`
    )
  }

  if (mode === 'report-only') {
    console.warn(`\n! Report-only (exit 0, geen gate): ${reason}.`)
    console.warn(
      '  Draai `npm run perf:route-sizes -- --update-baseline` op Linux-CI en commit' +
        ' scripts/perf/route-sizes.baseline.json om de ratchet-gate te activeren.'
    )
    process.exit(0)
  }

  if (failing.length) {
    console.error(
      `\n✗ ${failing.length} route(s) boven baseline × ${RATCHET_TOLERANCE}: ${failing
        .map((r) => `${r.route} (${r.gzipKb.toFixed(1)} kB, baseline ${r.baselineKb} kB)`)
        .join(', ')}`
    )
    process.exit(1)
  }

  console.log('\n✓ Alle routes binnen baseline.')
  process.exit(0)
}

// Alleen uitvoeren als direct aangeroepen (niet bij `import` vanuit de test).
// `pathToFileURL` (i.p.v. handmatige `file://`-string) is vereist voor
// Windows-paden: die hebben een derde `/` na `file://` (`file:///C:/...`)
// die een handmatige template-string mist.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
