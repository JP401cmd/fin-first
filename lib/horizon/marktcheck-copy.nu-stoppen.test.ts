import { describe, it, expect } from 'vitest'
import { margeAnkerKort, margeAnkerZin, margeZin } from './marktcheck-copy'
import type { RendementMarge } from '@/lib/horizon-kernel/rendement-marge'

/**
 * ADR 0127 — `MargeAnker` kreeg het lid `'nu'`, maar de copy koos met
 * `anker === 'stopkeuze' ? … : …`. Die else-tak is de AOW-tekst, dus de
 * marktcheck zei "als je doorwerkt tot je AOW (67)" naast een hoofdlijn waarin
 * de gebruiker vandaag al gestopt is. Een string-vergelijking op een verbrede
 * union: de compiler zwijgt, dus staat het hier.
 */

function marge(anker: RendementMarge['anker'], leeftijd: number): RendementMarge {
  return { marge: 0.018, ankerLeeftijd: leeftijd, anker, begrensd: null }
}

describe("marktcheck-copy — anker 'nu'", () => {
  it('noemt de AOW niet meer', () => {
    const m = marge('nu', 47)
    expect(margeAnkerZin(m)).not.toMatch(/AOW/)
    expect(margeAnkerKort(m)).not.toMatch(/AOW/)
    expect(margeZin(m)).not.toMatch(/AOW/)
  })

  it('spreekt over nu stoppen, niet over een stopkeuze of doorwerken', () => {
    const m = marge('nu', 47)
    expect(margeAnkerZin(m)).toMatch(/nu stopt/i)
    expect(margeAnkerKort(m)).toMatch(/nu stoppen/i)
    expect(margeZin(m)).toMatch(/Stop je nu/i)
    expect(margeAnkerZin(m)).not.toMatch(/doorwerkt/i)
  })

  it('noemt de anker-leeftijd, zodat de zin bij het plan hoort dat ernaast staat', () => {
    expect(margeAnkerZin(marge('nu', 47))).toContain('47')
  })

  it('de bestaande twee ankers blijven ongewijzigd', () => {
    expect(margeAnkerZin(marge('stopkeuze', 55))).toBe('als je stopt op je 55e')
    expect(margeAnkerZin(marge('aow', 67))).toBe('als je doorwerkt tot je AOW (67)')
    expect(margeAnkerKort(marge('stopkeuze', 55))).toBe('bij stoppen op je 55e')
    expect(margeAnkerKort(marge('aow', 67))).toBe('bij doorwerken tot je AOW (67)')
  })
})
