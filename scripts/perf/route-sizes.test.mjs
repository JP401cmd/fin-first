// @vitest-environment node
/**
 * Tests voor scripts/perf/route-sizes.mjs (Task 3.4, bundle-budget-CI).
 *
 * Dekt drie lagen:
 *   1. `unionChunks` — pure union/dedupe/async-skip op een fixture-
 *      `__RSC_MANIFEST`-entry.
 *   2. `evaluateBudget` — pure budget-/override-logica; toont zowel het
 *      pass- als het fail-pad zonder een subprocess te starten.
 *   3. `computeRouteSizes` — end-to-end op een fixture-`.next`-map (tijdelijke
 *      map op schijf) die de Turbopack-manifestvorm nabootst: shared
 *      root/polyfill-chunks + per-route RSC-manifest, met een chunk die in
 *      beide voorkomt (dedupe-bewijs) en een route zonder manifest-bestand
 *      (skip-pad-bewijs).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  unionChunks,
  notFoundBoundaryChunks,
  evaluateBudget,
  evaluateRatchet,
  computeBaselineUpdate,
  computeRouteSizes,
} from './route-sizes.mjs'

describe('unionChunks', () => {
  it('unioneert chunks over meerdere clientModules en dedupliceert', () => {
    const entry = {
      clientModules: {
        modA: { id: 1, chunks: ['/_next/static/chunks/a.js', '/_next/static/chunks/shared.js'], async: false },
        modB: { id: 2, chunks: ['/_next/static/chunks/b.js', '/_next/static/chunks/shared.js'], async: false },
      },
    }
    expect(unionChunks(entry).sort()).toEqual(
      ['/_next/static/chunks/a.js', '/_next/static/chunks/b.js', '/_next/static/chunks/shared.js'].sort()
    )
  })

  it('slaat modules met async:true over (lazy chunks tellen niet mee in first load)', () => {
    const entry = {
      clientModules: {
        eager: { id: 1, chunks: ['/_next/static/chunks/eager.js'], async: false },
        lazy: { id: 2, chunks: ['/_next/static/chunks/lazy.js'], async: true },
      },
    }
    expect(unionChunks(entry)).toEqual(['/_next/static/chunks/eager.js'])
  })

  it('geeft lege array bij ontbrekende/lege clientModules', () => {
    expect(unionChunks({})).toEqual([])
    expect(unionChunks(undefined)).toEqual([])
  })
})

describe('notFoundBoundaryChunks', () => {
  it('unioneert chunks van elke entryJSFiles-key die op /not-found eindigt, generiek op keypatroon', () => {
    const entry = {
      entryJSFiles: {
        'app/layout': ['static/chunks/layout.js'],
        'app/not-found': ['static/chunks/root-notfound.js', 'static/chunks/shared.js'],
        'app/(app)/not-found': ['static/chunks/group-notfound.js', 'static/chunks/shared.js'],
        'app/(app)/beheer/page': ['static/chunks/page.js'],
      },
    }
    expect(notFoundBoundaryChunks(entry).sort()).toEqual(
      ['static/chunks/root-notfound.js', 'static/chunks/shared.js', 'static/chunks/group-notfound.js'].sort()
    )
  })

  it('negeert entryJSFiles-keys die niet op /not-found eindigen (bv. /error, /layout, /page)', () => {
    const entry = {
      entryJSFiles: {
        'app/error': ['static/chunks/error.js'],
        'app/(app)/error': ['static/chunks/group-error.js'],
        'app/(app)/beheer/page': ['static/chunks/page.js'],
      },
    }
    expect(notFoundBoundaryChunks(entry)).toEqual([])
  })

  it('geeft lege array bij ontbrekende/lege entryJSFiles', () => {
    expect(notFoundBoundaryChunks({})).toEqual([])
    expect(notFoundBoundaryChunks(undefined)).toEqual([])
  })
})

describe('evaluateBudget', () => {
  const routes = [
    { route: '/licht', gzipKb: 100 },
    { route: '/precies-op-budget', gzipKb: 300 },
    { route: '/te-zwaar', gzipKb: 350 },
    { route: '/toekomst', gzipKb: 450 }, // valt onder override
  ]

  it('pass-pad: alles binnen budget → geen failures', () => {
    const { failing, overBaselineOnly } = evaluateBudget(
      [{ route: '/licht', gzipKb: 100 }],
      { budgetKb: 300, overrides: {} }
    )
    expect(failing).toEqual([])
    expect(overBaselineOnly).toEqual([])
  })

  it('fail-pad: een route boven het standaardbudget zonder override faalt', () => {
    const { failing } = evaluateBudget(routes, { budgetKb: 300, overrides: {} })
    const failingRoutes = failing.map((r) => r.route)
    expect(failingRoutes).toContain('/te-zwaar')
    expect(failingRoutes).toContain('/toekomst')
    expect(failingRoutes).not.toContain('/licht')
  })

  it('override: route boven standaardbudget maar binnen override faalt niet, blijft wel zichtbaar', () => {
    const { failing, overBaselineOnly, evaluated } = evaluateBudget(routes, {
      budgetKb: 300,
      overrides: { '/toekomst': 900 },
    })
    expect(failing.map((r) => r.route)).not.toContain('/toekomst')
    expect(overBaselineOnly.map((r) => r.route)).toContain('/toekomst')
    const toekomst = evaluated.find((r) => r.route === '/toekomst')
    expect(toekomst.status).toMatch(/boven budget/)
  })

  it('exact op de drempel faalt niet (strikt >)', () => {
    const { failing } = evaluateBudget(routes, { budgetKb: 300, overrides: {} })
    expect(failing.map((r) => r.route)).not.toContain('/precies-op-budget')
  })
})

describe('evaluateRatchet', () => {
  const baseline = {
    '/onder-baseline': 200,
    '/boven-tolerantie': 200,
    '/exact-op-tolerantie': 200,
    '/override-route': 200,
  }

  it('onder-baseline: gemeten waarde onder de baseline is altijd groen, ongeacht de 300 kB-target', () => {
    const routes = [{ route: '/onder-baseline', gzipKb: 350 }] // ruim boven 300 kB "target", maar onder baseline
    const { mode, failing, overTargetOnly } = evaluateRatchet(routes, { baseline: { '/onder-baseline': 400 }, budgetKb: 300 })
    expect(mode).toBe('ratchet')
    expect(failing).toEqual([])
    // wél zichtbaar als "boven target" (gerapporteerd, niet gatend)
    expect(overTargetOnly.map((r) => r.route)).toContain('/onder-baseline')
  })

  it('boven-baseline+tolerantie: > baseline × 1.04 faalt', () => {
    const routes = [{ route: '/boven-tolerantie', gzipKb: 209 }] // 200 * 1.04 = 208 → 209 faalt
    const { mode, failing } = evaluateRatchet(routes, { baseline, tolerance: 1.04, budgetKb: 300 })
    expect(mode).toBe('ratchet')
    expect(failing.map((r) => r.route)).toContain('/boven-tolerantie')
  })

  it('binnen de 4%-tolerantie faalt niet (208 kB op baseline 200 kB)', () => {
    const routes = [{ route: '/exact-op-tolerantie', gzipKb: 208 }] // 200 * 1.04 = 208, strikt >, dus geen fail
    const { failing } = evaluateRatchet(routes, { baseline, tolerance: 1.04, budgetKb: 300 })
    expect(failing).toEqual([])
  })

  it('override wint van de ratchet-ceiling: een route met override faalt pas boven de override-waarde', () => {
    const routes = [{ route: '/override-route', gzipKb: 250 }] // > 200*1.04=208, maar override=300
    const { failing } = evaluateRatchet(routes, {
      baseline,
      tolerance: 1.04,
      budgetKb: 300,
      overrides: { '/override-route': 300 },
    })
    expect(failing).toEqual([])
  })

  it('ontbrekende baseline (bestand ontbreekt volledig) = report-only: exit-waardige groen, geen enkele failure', () => {
    const routes = [{ route: '/willekeurig', gzipKb: 999 }] // zou anders ruim boven elk budget falen
    const { mode, reason, failing } = evaluateRatchet(routes, { baseline: null, budgetKb: 300 })
    expect(mode).toBe('report-only')
    expect(failing).toEqual([])
    expect(reason).toMatch(/geen baseline-bestand/)
  })

  it('ontbrekende route in een overigens aanwezige baseline = report-only voor de HELE run', () => {
    const routes = [
      { route: '/in-baseline', gzipKb: 999 },
      { route: '/nieuwe-route-zonder-baseline', gzipKb: 999 },
    ]
    const { mode, reason, failing } = evaluateRatchet(routes, {
      baseline: { '/in-baseline': 100 },
      budgetKb: 300,
    })
    expect(mode).toBe('report-only')
    expect(failing).toEqual([])
    expect(reason).toMatch(/nieuwe-route-zonder-baseline/)
  })
})

describe('computeBaselineUpdate', () => {
  it('voegt een nieuwe route toe die nog niet in de baseline stond', () => {
    const { baseline, added, lowered, rejected } = computeBaselineUpdate(
      [{ route: '/nieuw', gzipKb: 123.4 }],
      {}
    )
    expect(baseline).toEqual({ '/nieuw': 123.4 })
    expect(added).toEqual(['/nieuw'])
    expect(lowered).toEqual([])
    expect(rejected).toEqual([])
  })

  it('verlaagt de baseline als de gemeten waarde lager is (monotone convergentie)', () => {
    const { baseline, lowered, rejected } = computeBaselineUpdate(
      [{ route: '/bestaand', gzipKb: 90 }],
      { '/bestaand': 100 }
    )
    expect(baseline['/bestaand']).toBe(90)
    expect(lowered).toEqual([{ route: '/bestaand', from: 100, to: 90 }])
    expect(rejected).toEqual([])
  })

  it('update-guard weigert stijging: een hogere meting laat de baseline ongewijzigd en wordt gerapporteerd als rejected', () => {
    const { baseline, lowered, rejected } = computeBaselineUpdate(
      [{ route: '/bestaand', gzipKb: 150 }],
      { '/bestaand': 100 }
    )
    expect(baseline['/bestaand']).toBe(100) // ongewijzigd — de stijging naar 150 werd geweigerd
    expect(lowered).toEqual([])
    expect(rejected).toEqual([{ route: '/bestaand', baseline: 100, measured: 150 }])
  })

  it('laat een gelijke waarde ongewijzigd (geen added/lowered/rejected)', () => {
    const { baseline, added, lowered, rejected } = computeBaselineUpdate(
      [{ route: '/gelijk', gzipKb: 100 }],
      { '/gelijk': 100 }
    )
    expect(baseline['/gelijk']).toBe(100)
    expect(added).toEqual([])
    expect(lowered).toEqual([])
    expect(rejected).toEqual([])
  })

  it('laat routes die niet meer gemeten worden ongewijzigd in de baseline staan', () => {
    const { baseline } = computeBaselineUpdate([{ route: '/nog-actief', gzipKb: 50 }], {
      '/nog-actief': 60,
      '/verwijderde-pagina': 42,
    })
    expect(baseline['/verwijderde-pagina']).toBe(42)
  })
})

describe('computeRouteSizes (fixture .next-map)', () => {
  let fixtureDir
  let sharedChunkBytes
  let routeChunkBytes
  let notFoundChunkBytes

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'route-sizes-fixture-'))

    // shared bootstrap chunk (rootMainFiles) — 500 bytes 'a', ook gerefereerd
    // door de route-manifest (dedupe-bewijs: mag maar 1x meetellen).
    const sharedContent = Buffer.from('a'.repeat(500))
    const routeOnlyContent = Buffer.from('b'.repeat(700))
    // not-found-boundary-chunk (alleen via entryJSFiles gerefereerd, NIET via
    // clientModules — zie notFoundBoundaryChunks-fix). 900 bytes 'c'.
    const notFoundContent = Buffer.from('c'.repeat(900))

    mkdirSync(join(fixtureDir, 'static', 'chunks'), { recursive: true })
    writeFileSync(join(fixtureDir, 'static', 'chunks', 'shared.js'), sharedContent)
    writeFileSync(join(fixtureDir, 'static', 'chunks', 'route-only.js'), routeOnlyContent)
    writeFileSync(join(fixtureDir, 'static', 'chunks', 'not-found-only.js'), notFoundContent)

    sharedChunkBytes = gzipSync(sharedContent).length
    routeChunkBytes = gzipSync(routeOnlyContent).length
    notFoundChunkBytes = gzipSync(notFoundContent).length

    writeFileSync(
      join(fixtureDir, 'build-manifest.json'),
      JSON.stringify({
        rootMainFiles: ['static/chunks/shared.js'],
        polyfillFiles: [],
        lowPriorityFiles: ['static/mid/_buildManifest.js'], // bewust genegeerd
      })
    )

    writeFileSync(
      join(fixtureDir, 'app-path-routes-manifest.json'),
      JSON.stringify({
        '/(app)/licht/page': '/licht',
        '/(app)/zonder-manifest/page': '/zonder-manifest',
      })
    )

    // /licht: refereert zowel de shared chunk (moet gededupliceerd worden
    // t.o.v. rootMainFiles) als een eigen route-chunk, plus een async-chunk
    // die NIET moet meetellen, plus een `entryJSFiles`-not-found-boundary
    // (niet in clientModules — bewijst de notFoundBoundaryChunks-fix) die
    // ZELF ook de shared chunk refereert (dedupe-bewijs t.o.v. entryJSFiles).
    mkdirSync(join(fixtureDir, 'server', 'app', '(app)', 'licht'), { recursive: true })
    writeFileSync(
      join(fixtureDir, 'server', 'app', '(app)', 'licht', 'page_client-reference-manifest.js'),
      `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/(app)/licht/page"] = {
  clientModules: {
    modShared: { id: 1, chunks: ["/_next/static/chunks/shared.js"], async: false },
    modRoute: { id: 2, chunks: ["/_next/static/chunks/route-only.js"], async: false },
    modLazy: { id: 3, chunks: ["/_next/static/chunks/never-loaded.js"], async: true },
  },
  entryJSFiles: {
    "app/layout": ["static/chunks/shared.js"],
    "app/not-found": ["static/chunks/not-found-only.js", "static/chunks/shared.js"],
  },
};
`
    )
    // '/zonder-manifest' heeft bewust GEEN *_client-reference-manifest.js
    // bestand — bewijst het skip-pad (146→minus 1 in de echte build kwam
    // niet voor, maar defensief moet dit netjes overslaan, niet crashen).
  })

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
  })

  it('unioneert route-chunks + shared bootstrap-chunks + not-found-boundary-chunks, dedupliceert, en gzipt correct', () => {
    const { routes, skipped } = computeRouteSizes({ nextDir: fixtureDir })

    const licht = routes.find((r) => r.route === '/licht')
    expect(licht).toBeDefined()
    // 3 unieke chunks (shared + route-only + not-found-only), NIET 4 — de
    // shared chunk komt maar 1x mee ondanks dat 'ie in drie plekken
    // gerefereerd wordt: rootMainFiles, clientModules, ÉN entryJSFiles
    // (not-found-entry). De not-found-only-chunk komt wél mee, ook al staat
    // 'ie NERGENS in clientModules — dat is precies de fix.
    expect(licht.chunkCount).toBe(3)
    expect(licht.gzipBytes).toBe(sharedChunkBytes + routeChunkBytes + notFoundChunkBytes)

    expect(skipped).toHaveLength(1)
    expect(skipped[0].route).toBe('/zonder-manifest')
  })

  it('gooit een duidelijke fout als de basismanifesten ontbreken', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'route-sizes-empty-'))
    try {
      expect(() => computeRouteSizes({ nextDir: emptyDir })).toThrow(/build:next-only/)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})
