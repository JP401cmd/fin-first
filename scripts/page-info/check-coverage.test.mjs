// @vitest-environment node
/**
 * Tests voor de route-dekking-toets in `scripts/page-info/check-coverage.mjs`
 * (UR3-14, deel C).
 *
 * De gate is de vangrail onder eigenaarsbesluit 9 (12 jul 2026): élke
 * inhoudspagina draagt een "Wat zie ik hier?"-knop, pure instellingen- en
 * flowschermen bewust niet. Zonder deze toets was dat besluit alleen een
 * periodieke audit — precies waardoor het gat naar 17 van de 64 routes groeide.
 *
 * Drie lagen:
 *   1. `routePathOf` / `routePatternToRegex` — pure padvertaling, inclusief
 *      route-groepen en dynamische segmenten.
 *   2. `routeHasInfoButton` — op fixture-bestanden op schijf, zodat het
 *      diepte-2-gedrag en de DEF_FILES-uitzondering bewijsbaar zijn zonder de
 *      echte app te raken.
 *   3. de lijsten zelf — de drie routes die deze kaart heeft gerepareerd staan
 *      NIET op de afbouwlijst, en de twee lijsten overlappen niet.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  routePathOf,
  routePatternToRegex,
  routeHasInfoButton,
  scanRoutes,
  RESIDUE_ROUTES,
  SETTINGS_OR_FLOW_ROUTES,
} from './check-coverage.mjs'

describe('routePathOf', () => {
  it('strips de route-groep en het page.tsx-achtervoegsel', () => {
    const file = join(process.cwd(), 'app', '(app)', 'overzicht', 'schulden', 'page.tsx')
    expect(routePathOf(file)).toBe('/overzicht/schulden')
  })

  it('houdt het dynamische segment intact', () => {
    const file = join(process.cwd(), 'app', '(app)', 'overzicht', 'schulden', '[type]', 'page.tsx')
    expect(routePathOf(file)).toBe('/overzicht/schulden/[type]')
  })
})

describe('routePatternToRegex', () => {
  it('matcht een concrete PAGE_INFO-key op zijn dynamische route', () => {
    const re = routePatternToRegex('/overzicht/schulden/[type]')
    expect(re.test('/overzicht/schulden/mortgage')).toBe(true)
    // Niet één segment dieper — dat is een andere route.
    expect(re.test('/overzicht/schulden/mortgage/detail')).toBe(false)
    expect(re.test('/overzicht/schulden')).toBe(false)
  })

  it('matcht een catch-all over meerdere segmenten', () => {
    const re = routePatternToRegex('/nieuws/[...slug]')
    expect(re.test('/nieuws/2026/september')).toBe(true)
  })
})

describe('routeHasInfoButton', () => {
  let dir

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'page-info-cov-'))
    mkdirSync(join(dir, 'nested'), { recursive: true })

    // Niveau 1: de pagina rendert de knop zelf.
    writeFileSync(
      join(dir, 'direct.tsx'),
      "export default function P() { return <PageInfoButton content={x} /> }\n",
    )
    // Niveau 2: pagina → client → knop. Binnen het diepte-budget.
    writeFileSync(join(dir, 'depth2.tsx'), "import { C } from './nested/client'\nexport default C\n")
    writeFileSync(
      join(dir, 'nested', 'client.tsx'),
      "export function C() { return <PageInfoButton content={x} /> }\n",
    )
    // Niveau 3: buiten het budget — meldt bewust als gat.
    writeFileSync(join(dir, 'depth3.tsx'), "import { M } from './nested/mid-a'\nexport default M\n")
    writeFileSync(join(dir, 'nested', 'mid-a.tsx'), "export { M } from './mid-b'\n")
    writeFileSync(join(dir, 'nested', 'mid-b.tsx'), "export { C as M } from './client'\n")
    // Een pagina zonder enige knop.
    writeFileSync(join(dir, 'bare.tsx'), 'export default function P() { return <div /> }\n')
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('ziet een knop op de pagina zelf', () => {
    expect(routeHasInfoButton(join(dir, 'direct.tsx'))).toBe(true)
  })

  it('volgt de importgraaf twee niveaus diep', () => {
    expect(routeHasInfoButton(join(dir, 'depth2.tsx'))).toBe(true)
  })

  it('meldt een pagina zonder knop als gat', () => {
    expect(routeHasInfoButton(join(dir, 'bare.tsx'))).toBe(false)
  })

  it('rekent niets buiten het diepte-budget als dekking', () => {
    // Bewuste grens: dieper zoeken verklaart élke pagina "gedekt" via een
    // willekeurig hulpcomponent dat toevallig ook een `i` draagt.
    expect(routeHasInfoButton(join(dir, 'depth3.tsx'))).toBe(false)
  })
})

describe('lijsten en werkelijke stand', () => {
  it('houdt de uitzonderingslijst en de afbouwlijst uit elkaar', () => {
    const overlap = RESIDUE_ROUTES.filter((r) => SETTINGS_OR_FLOW_ROUTES.includes(r))
    expect(overlap).toEqual([])
  })

  it('zet de door deze kaart gerepareerde routes niet op de afbouwlijst', () => {
    for (const route of [
      '/overzicht/bezittingen/[type]',
      '/overzicht/schulden/[type]',
      '/toekomst/rekenhulp',
    ]) {
      expect(RESIDUE_ROUTES).not.toContain(route)
    }
  })

  it('geeft de drie gerepareerde routes daadwerkelijk als gedekt terug', () => {
    const byRoute = new Map(scanRoutes().map((r) => [r.route, r]))
    for (const route of [
      '/overzicht/bezittingen/[type]',
      '/overzicht/schulden/[type]',
      '/core/debts/[type]',
      '/core/assets/[type]',
      '/toekomst/rekenhulp',
    ]) {
      expect(byRoute.get(route)?.covered, `${route} zou een info-knop moeten dragen`).toBe(true)
    }
  })

  it('laat geen afbouwlijst-entry staan die al gedicht is', () => {
    const byRoute = new Map(scanRoutes().map((r) => [r.route, r]))
    const stale = RESIDUE_ROUTES.filter((route) => !byRoute.has(route) || byRoute.get(route).covered)
    expect(stale, 'afbouwlijst mag alleen krimpen — haal deze regels eruit').toEqual([])
  })
})
