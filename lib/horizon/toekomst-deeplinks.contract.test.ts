/**
 * Vangnet fase 1 "/toekomst in drie katernen" (ADR 0179) — het deeplink-contract
 * van /toekomst, gepind vóórdat `horizon-client.tsx` wordt ontleed.
 *
 * Wat hier NIET door een andere test gedekt werd:
 *  - `deeplink-cleanup.test.ts` toetst alleen de URL-OPSCHONING; zijn
 *    "dekt precies de params die het mount-effect leest" vergelijkt een
 *    hardgecodeerde lijst met zichzelf, niet met wat de route écht leest.
 *  - `redirect-guard.test.ts` dekte alleen `?tab=` (sinds stroom R verhuisd naar
 *    `next.config.test.ts`, per waarde door Next's eigen matcher).
 *  - Niets toetste dat elke `/toekomst?…`-link die de app zelf uitstuurt
 *    (widgets, ⌘K, Fin, redirects) door de route wordt opgepakt.
 *
 * Toets op de ROUTE, niet op een bestand: een sleutel telt als "afgehandeld"
 * wanneer (a) een module die de /toekomst-route laadt (page/layout + hun
 * imports, zie `route-import-graph.ts`) hem leest met `.get('<sleutel>')`, of
 * (b) `next.config.ts` een redirect heeft met `source: '/toekomst'` en een
 * `has`-query op die sleutel. Zo overleeft het contract de decompositie van
 * horizon-client én de redirects die stroom B toevoegt (`?whatif=open` →
 * `/toekomst/doelen` enz.): beide routes zijn geldig, een stille dode link niet.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import nextConfig from '../../next.config'
import { PLAN_REVIEW_PARAM } from '@/lib/plan-review/types'
import { CONSUMED_DEEPLINK_PARAMS } from './deeplink-cleanup'
import {
  codeOnly,
  reachableModules,
  readRel,
  routeEntryFiles,
} from '@/lib/test-utils/route-import-graph'

type Contract = {
  /** Waarden die vandaag iets openen; `'*'` = vrije waarde (bv. een event-id). */
  values: readonly string[] | '*'
  /** Wat de gebruiker vandaag ziet (characterization, voor de visuele check). */
  effect: string
}

/**
 * Het deeplink-contract van de ROOT-route /toekomst zoals het op 26 sep 2026
 * werkt (horizon-client mount-effect r. ±1054, `plan-review-provider.tsx`,
 * `resolveTabRedirect` in `toekomst/page.tsx` — sinds stroom R de `has`-regels in
 * `next.config.ts`). Een sleutel of waarde erbij of
 * eraf is een bewuste contractwijziging — pas deze tabel dan in dezelfde PR aan.
 */
const CONTRACT: Record<string, Contract> = {
  whatif: { values: ['open'], effect: 'doelscenario (lab) in beeld scrollen' },
  strategie: { values: ['open'], effect: 'strategie-venster open' },
  uitgaven: { values: ['open'], effect: 'pane "uitgaven na pensioen" open' },
  event: { values: '*', effect: "'new' → gebeurtenis-catalogus; <id> → gebeurtenis bekijken" },
  edit: { values: ['true'], effect: 'met event=<id>: gebeurtenis in bewerkmodus' },
  // Addendum 26 sep (ADR 0179): alias van event=new. Tot dan las de gebeurtenissenlijst in
  // Instellingen hem zelf; nu opent de provider op elk katern dezelfde catalogus.
  nieuw: { values: ['1', 'true'], effect: 'alias van event=new → gebeurtenis-catalogus' },
  modal: {
    values: ['scenarios', 'simulations', 'withdrawal', 'backtesting', 'strategie', 'life_events'],
    effect:
      'bijbehorende modal; life_events → gebeurtenis-catalogus (als event=new; fase 1 stap 2); ' +
      'withdrawal → next.config-redirect naar /toekomst/instellingen?regel=onttrekkingsstrategie',
  },
  planreview: { values: ['open'], effect: 'plan-review-wizard open' },
  tab: {
    values: ['doelen', 'gebeurtenissen', 'voorkeuren', 'rekenhulp'],
    effect:
      'next.config-redirect (has-regel, ADR 0179 Q2) naar het katern: doelen/rekenhulp → ' +
      'hun route, voorkeuren → /toekomst/instellingen (overige query mee); gebeurtenissen ' +
      'blijft op Plan (addendum 26 sep): OudeTabParam zet #gebeurtenissen, mét levensstrategie ' +
      '→ /toekomst/instellingen',
  },
}

/** Vaste waarden die binnen een vrije sleutel óók letterlijk herkend moeten worden. */
const REQUIRED_LITERALS: Record<string, readonly string[]> = { event: ['new'] }

const ROOT_ROUTE = 'app/(app)/toekomst'
const rootModules = reachableModules(routeEntryFiles(ROOT_ROUTE, { exactRoute: true }))
const rootSources = rootModules.map((rel) => ({ rel, code: codeOnly(readRel(rel)) }))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function readerPattern(key: string): RegExp {
  const lit = `\\.get\\(\\s*(['"\`])${escapeRe(key)}\\1\\s*\\)`
  if (key === PLAN_REVIEW_PARAM) return new RegExp(`${lit}|\\.get\\(\\s*PLAN_REVIEW_PARAM\\s*\\)`)
  // `?tab=` werd tot ADR 0179 (stroom R) server-side gelezen uit het searchParams-object
  // (`sp.tab`); sinds besluit Q2 vangt `next.config.ts` hem af. Het patroon blijft staan
  // zodat een teruggekeerde render-guard óók als lezer telt.
  if (key === 'tab') return new RegExp(`${lit}|\\b(sp|searchParams|params)\\.tab\\b|\\[\\s*['"]tab['"]\\s*\\]`)
  return new RegExp(lit)
}

function readersOf(key: string): typeof rootSources {
  const re = readerPattern(key)
  return rootSources.filter((s) => re.test(s.code))
}

function mentionsValue(code: string, value: string): boolean {
  return new RegExp(`(['"\`])${escapeRe(value)}\\1|\\b${escapeRe(value)}\\s*:`).test(code)
}

type RedirectRule = Awaited<ReturnType<NonNullable<typeof nextConfig.redirects>>>[number]
type HasCond = { type: string; key?: string; value?: string }

async function rootQueryRedirects(key: string): Promise<{ rule: RedirectRule; cond: HasCond }[]> {
  const rules = await nextConfig.redirects!()
  const out: { rule: RedirectRule; cond: HasCond }[] = []
  for (const rule of rules) {
    if (rule.source !== '/toekomst') continue
    for (const cond of ((rule as { has?: HasCond[] }).has ?? [])) {
      if (cond.type === 'query' && cond.key === key) out.push({ rule, cond })
    }
  }
  return out
}

function redirectCovers(conds: HasCond[], value: string): boolean {
  return conds.some((c) => c.value === undefined || new RegExp(`^(?:${c.value})$`).test(value))
}

describe('deeplink-contract /toekomst — de route zelf', () => {
  it('de route-graaf is echt gevonden (de scan mag niet leeg draaien)', () => {
    expect(rootModules.length).toBeGreaterThan(20)
    expect(PLAN_REVIEW_PARAM).toBe('planreview')
  })

  for (const [key, spec] of Object.entries(CONTRACT)) {
    it(`?${key}= wordt door /toekomst gelezen of op de routing-laag doorgestuurd`, async () => {
      const readers = readersOf(key)
      const redirects = await rootQueryRedirects(key)
      expect(
        readers.length + redirects.length,
        `?${key}= heeft geen lezer in de /toekomst-graaf en geen redirect — dode deeplink`,
      ).toBeGreaterThan(0)

      const values = spec.values === '*' ? (REQUIRED_LITERALS[key] ?? []) : spec.values
      for (const value of values) {
        const byReader = readers.some((r) => mentionsValue(r.code, value))
        const byRedirect = redirectCovers(redirects.map((r) => r.cond), value)
        expect(
          byReader || byRedirect,
          `?${key}=${value}: de lezer kent deze waarde niet en geen redirect vangt hem`,
        ).toBe(true)
      }
    })
  }

  it('edit=true werkt alleen samen met event: dezelfde module leest beide', async () => {
    // Stuurt een redirect `?event=` door, dan reist `edit` gewoon mee in de query.
    if ((await rootQueryRedirects('event')).length > 0) return
    const editReaders = readersOf('edit').map((r) => r.rel)
    const eventReaders = new Set(readersOf('event').map((r) => r.rel))
    expect(editReaders.some((rel) => eventReaders.has(rel))).toBe(true)
  })
})

describe('deeplink-contract /toekomst — de opschoning loopt in de pas', () => {
  it('elke client-deeplink die een paneel opent wordt na consumptie weggepoetst', () => {
    // `tab` gaat op de routing-laag weg (next.config, vóór render) en `planreview` poetst zichzelf
    // (plan-review-provider, native replaceState) — die twee staan bewust niet in
    // CONSUMED_DEEPLINK_PARAMS. De rest moet er wél in, anders heropent een
    // refresh hetzelfde paneel.
    const clientKeys = Object.keys(CONTRACT).filter((k) => k !== 'tab' && k !== PLAN_REVIEW_PARAM)
    for (const key of clientKeys) {
      expect(CONSUMED_DEEPLINK_PARAMS as readonly string[], key).toContain(key)
    }
  })
})

// ── Uitgaande kant: wat de app zelf naar /toekomst stuurt ────────────────────

const ROOT = process.cwd()
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** Bestanden die links naar /toekomst kunnen uitsturen (geen tests, geen UAT-teksten). */
const EMITTER_FILES = [
  ...['app', 'components', 'lib'].flatMap((d) => walk(path.join(ROOT, d))),
  path.join(ROOT, 'next.config.ts'),
]
  .map((f) => path.relative(ROOT, f).replace(/\\/g, '/'))
  .filter((f) => /\.(ts|tsx|mjs)$/.test(f))
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .filter((f) => !/^lib\/(uat|regression-tests|test-utils)\//.test(f))

type Emitted = { file: string; key: string; value: string }

/** Letterlijke `/toekomst?…` en `/horizon?…` (de legacy-route redirect mét query naar /toekomst). */
function emittedRootDeeplinks(): Emitted[] {
  const out: Emitted[] = []
  for (const file of EMITTER_FILES) {
    const code = codeOnly(readRel(file))
    for (const m of code.matchAll(/(['"`])\/(?:toekomst|horizon)\?([^'"`#\s]+)/g)) {
      for (const [key, value] of new URLSearchParams(m[2])) {
        // `/toekomst?${PLAN_REVIEW_PARAM}=open`: de sleutel is een constante, die
        // de route-kant hierboven al toetst.
        if (key.includes('${')) continue
        const dynamisch = value.includes('${') || value.startsWith(':') || value === ''
        out.push({ file, key, value: dynamisch ? '*' : value })
      }
    }
  }
  return out
}

describe('deeplink-contract /toekomst — elke link die de app uitstuurt valt binnen het contract', () => {
  const emitted = emittedRootDeeplinks()

  it('vindt de bekende uitgaande links (de scan mag niet leeg draaien)', () => {
    const keys = new Set(emitted.map((e) => e.key))
    // Gemeten 26 sep 2026: whatif, uitgaven, modal, tab, strategie, planreview.
    // ADR 0179 stap 18–19: `strategie=open` en `whatif=open` redirecten naar hun katern,
    // en de app stuurt die links sindsdien rechtstreeks daarheen — ze vallen dus uit
    // deze scan. Wat op Plan blijft (de panes en modals van de overlay-host), niet.
    for (const k of ['uitgaven', 'modal']) expect(keys, k).toContain(k)
  })

  it('geen uitgaande link gebruikt een sleutel of waarde die /toekomst niet kent', () => {
    const buiten = emitted.filter((e) => {
      const spec = CONTRACT[e.key]
      if (!spec) return true
      if (spec.values === '*' || e.value === '*') return false
      return !spec.values.includes(e.value)
    })
    expect(buiten.map((e) => `${e.file}: ?${e.key}=${e.value}`)).toEqual([])
  })
})
