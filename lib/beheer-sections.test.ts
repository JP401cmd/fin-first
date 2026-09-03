import { describe, expect, it } from 'vitest'
import { BEHEER_GROUPS, findBeheerGroup, isBeheerToolActive } from './beheer-sections'

const allTools = BEHEER_GROUPS.flatMap((group) => group.tools)

describe('BEHEER_GROUPS', () => {
  it('heeft de vier vaste groepen in volgorde', () => {
    expect(BEHEER_GROUPS.map((g) => g.id)).toEqual(['technisch', 'functioneel', 'test', 'info'])
  })

  it('bevat 40 tools met unieke routes onder /beheer/', () => {
    expect(allTools).toHaveLength(40)
    const hrefs = allTools.map((t) => t.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const href of hrefs) {
      expect(href).toMatch(/^\/beheer\/[a-z-]+$/)
    }
  })

  it('heeft voor elke tool een label, omschrijving en icoon', () => {
    for (const tool of allTools) {
      expect(tool.label.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.icon).toBeTruthy()
    }
  })

  it('koppelt precies de drie inbakken met werkvoorraad-notie aan een teller', () => {
    const keyed = allTools.filter((t) => t.inboxKey != null)
    expect(new Map(keyed.map((t) => [t.href, t.inboxKey]))).toEqual(
      new Map([
        ['/beheer/errors', 'errors'],
        ['/beheer/calculator-reports', 'calculator_reports'],
        ['/beheer/feedback', 'feedback'],
      ]),
    )
    // Elke sleutel hoort bij precies één tegel — anders telt de hub dubbel.
    expect(new Set(keyed.map((t) => t.inboxKey)).size).toBe(keyed.length)
  })

  it('heeft geen lege groepen', () => {
    for (const group of BEHEER_GROUPS) {
      expect(group.tools.length).toBeGreaterThan(0)
    }
  })

  it('bevat de verwijderde pagina’s niet meer', () => {
    const hrefs = allTools.map((t) => t.href)
    for (const removed of [
      '/beheer/features',
      '/beheer/tiers',
      '/beheer/toegang',
      '/beheer/meldingen',
      '/beheer/test-deferred',
      '/beheer/will-avatar',
      '/beheer/widgets-test',
      '/beheer/propositie',
      // C5-c: de v1↔v2 parity-inspector is verwijderd (v2 is de enige engine).
      '/beheer/horizon-tabellen',
      // Besluit 02 (beheer-opschoning): de roadmap-naslag verhuisde naar Notion;
      // de teamopstelling leest voortaan alleen nog van de org-site (team.html).
      // De curatie-gate zelf (development-model.ts + .test.ts) blijft bestaan.
      '/beheer/roadmap',
      '/beheer/development',
      // WF-BEHEER-12-bug1: de doelgids had sinds ADR 0007 nul UI-consumers
      // (dode configuratie). De Welkomstgids (/beheer/welkom) is de live
      // vervanger van doel-gebonden begeleiding.
      '/beheer/doelen',
    ]) {
      expect(hrefs).not.toContain(removed)
    }
  })
})

describe('isBeheerToolActive', () => {
  it('matcht exact pad', () => {
    expect(isBeheerToolActive('/beheer/ai', '/beheer/ai')).toBe(true)
  })

  it('matcht subpaden met /-grens', () => {
    expect(isBeheerToolActive('/beheer/blueprints/hub', '/beheer/blueprints')).toBe(true)
  })

  it('matcht géén prefix zonder grens (/beheer/ai vs /beheer/ai-features)', () => {
    expect(isBeheerToolActive('/beheer/ai-features', '/beheer/ai')).toBe(false)
  })
})

describe('findBeheerGroup', () => {
  it('vindt de juiste groep per tool', () => {
    expect(findBeheerGroup('/beheer/coach')?.id).toBe('functioneel')
    expect(findBeheerGroup('/beheer/bank-connect')?.id).toBe('technisch')
    expect(findBeheerGroup('/beheer/testdata')?.id).toBe('test')
    expect(findBeheerGroup('/beheer/architectuur')?.id).toBe('info')
  })

  it('valt /beheer/ai-features onder technisch via eigen route, niet via /beheer/ai', () => {
    expect(findBeheerGroup('/beheer/ai-features')?.id).toBe('technisch')
  })

  it('geeft null op de hub en onbekende paden', () => {
    expect(findBeheerGroup('/beheer')).toBeNull()
    expect(findBeheerGroup('/overzicht')).toBeNull()
  })
})
