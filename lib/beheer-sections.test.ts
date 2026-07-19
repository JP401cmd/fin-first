import { describe, expect, it } from 'vitest'
import { BEHEER_GROUPS, findBeheerGroup, isBeheerToolActive } from './beheer-sections'

const allTools = BEHEER_GROUPS.flatMap((group) => group.tools)

describe('BEHEER_GROUPS', () => {
  it('heeft de vier vaste groepen in volgorde', () => {
    expect(BEHEER_GROUPS.map((g) => g.id)).toEqual(['technisch', 'functioneel', 'test', 'info'])
  })

  it('bevat 41 tools met unieke routes onder /beheer/', () => {
    expect(allTools).toHaveLength(41)
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
