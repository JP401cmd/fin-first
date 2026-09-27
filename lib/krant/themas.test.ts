import { describe, expect, it } from 'vitest'
import { THEMA_IDS, THEMAS, isThemaId } from './themas'
import { DOELGROEP_SLEUTELS, isGeldigeDoelgroepWaarde, type DoelgroepSleutel } from './profiel-velden'
import { TOEGESTANE_OPS } from './duiding-controles'
import { normaliseerVoorLexicon } from './doelgroep-lexicon'

describe('themalijst (B35) — de dekking is hard', () => {
  it('elk id heeft precies één definitie en andersom', () => {
    expect(Object.keys(THEMAS).sort()).toEqual([...THEMA_IDS].sort())
    expect(new Set(THEMA_IDS).size).toBe(THEMA_IDS.length)
  })

  it('houdt de lijst beheersbaar (12–16 thema’s)', () => {
    expect(THEMA_IDS.length).toBeGreaterThanOrEqual(12)
    expect(THEMA_IDS.length).toBeLessThanOrEqual(16)
  })

  for (const id of THEMA_IDS) {
    it(`${id}: label, omschrijving, ≥ 3 genormaliseerde trefwoorden, geldige regels`, () => {
      const t = THEMAS[id]
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.omschrijving.length).toBeGreaterThan(10)
      // De omschrijving gaat de prompt in: één regel.
      expect(t.omschrijving).not.toMatch(/\n/)
      expect(new Set(t.trefwoorden).size).toBeGreaterThanOrEqual(3)
      for (const w of t.trefwoorden) {
        // Trefwoorden staan al in genormaliseerde vorm (kleine letters, één spatie).
        expect(normaliseerVoorLexicon(w), `${id}: ${w}`).toBe(w)
        // Te korte trefwoorden laten elk citaat door en zijn dan geen controle meer.
        expect(w.length, `${id}: ${w}`).toBeGreaterThanOrEqual(3)
      }
      if (t.raakt === 'iedereen') return
      expect(t.raakt.length).toBeGreaterThan(0)
      for (const regel of t.raakt) {
        const sleutel = regel.veld as DoelgroepSleutel
        const def = DOELGROEP_SLEUTELS[sleutel]
        expect(def, `${id}: ${regel.veld}`).toBeDefined()
        expect(TOEGESTANE_OPS[def.soort], `${id}: ${regel.veld} ${regel.op}`).toContain(regel.op)
        expect(regel.waarden.length).toBeGreaterThan(0)
        if (regel.op === 'is' || regel.op === 'minstens' || regel.op === 'hoogstens') expect(regel.waarden).toHaveLength(1)
        for (const w of regel.waarden) expect(isGeldigeDoelgroepWaarde(sleutel, w), `${id}: ${regel.veld}=${w}`).toBe(true)
      }
    })
  }

  it("'iedereen' is een expliciete keuze: alleen inkomstenbelasting en zorgkosten raken elk profiel", () => {
    // inkomstenbelasting sinds de eindreview van 1G (M5): 'werk in [loondienst …
    // pensioen]' raakte vrijwel elk profiel en telde dan onterecht als gericht.
    expect(THEMA_IDS.filter((id) => THEMAS[id].raakt === 'iedereen')).toEqual(['inkomstenbelasting', 'zorgkosten'])
  })

  it('isThemaId herkent alleen ids uit de lijst', () => {
    expect(isThemaId('huur')).toBe(true)
    expect(isThemaId('erfbelasting')).toBe(false)
  })
})
