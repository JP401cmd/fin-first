/**
 * EIGENAARSBESLUIT 12-09-2026 — welke gedetecteerde patronen mogen naar de AI?
 *
 * Sinds V-001 gaan ook de 'low'-kandidaten mee ter beoordeling. De
 * security-review liet zien wat daar in zit: de 'low'-staart bestaat
 * grotendeels uit ONHERKENDE tegenpartijen, en dat zijn de privébetalingen —
 * twee overboekingen naar "M. de Vries" (lening, alimentatie, Marktplaats)
 * vormen samen een 'low'-patroon en gingen als naam + bedrag naar de
 * AI-leverancier. `sanitizeForAI` vangt dat niet: die laat de tegenpartijnaam
 * bewust staan, want een handelsnaam is juist wat de classificatie mogelijk
 * maakt.
 *
 * Deze suite pint de drie grenzen van het besluit: de cloud-snede, de
 * uitzondering voor het lokale pad, en dat bestaand gedrag (high/medium) niet
 * stilzwijgend wordt ingeperkt.
 */

import { describe, it, expect } from 'vitest'
import {
  heeftHerkendeNaam,
  selectVasteKostenAiKandidaten,
} from './vaste-kosten-kandidaten'
import { detectCategory, type RecurringCategory } from '@/lib/recurring-detection'

type Kandidaat = {
  naam: string
  confidence: 'high' | 'medium' | 'low'
  suggestedCategory: RecurringCategory
}

/** Bouwt een kandidaat met de ÉCHTE categorie die `detectCategory` geeft, zodat
 *  de test niet zijn eigen aanname over "herkend" verzint. */
function kandidaat(naam: string, confidence: Kandidaat['confidence']): Kandidaat {
  return { naam, confidence, suggestedCategory: detectCategory(naam, naam, false) }
}

const namen = (lijst: Kandidaat[]) => lijst.map((k) => k.naam)

describe('heeftHerkendeNaam', () => {
  it('de onbekende-naam-sentinel is other_expense/other_income, niet "other"', () => {
    // Deze assertie staat er omdat de voor de hand liggende fout — filteren op
    // `!== 'other'` — geruisloos NIETS wegfiltert: die categorie bestaat niet.
    expect(heeftHerkendeNaam('other_expense')).toBe(false)
    expect(heeftHerkendeNaam('other_income')).toBe(false)
    expect(heeftHerkendeNaam('other')).toBe(true)
  })

  it('een particuliere naam is onherkend, een merk niet', () => {
    expect(detectCategory('M. de Vries', 'M. de Vries', false)).toBe('other_expense')
    expect(heeftHerkendeNaam(detectCategory('M. de Vries', 'M. de Vries', false))).toBe(false)
    expect(heeftHerkendeNaam(detectCategory('Netflix', 'Netflix', false))).toBe(true)
  })
})

describe('selectVasteKostenAiKandidaten — cloud-pad', () => {
  const lijst = [
    kandidaat('Netflix', 'low'),
    kandidaat('M. de Vries', 'low'),
    kandidaat('Vattenfall', 'medium'),
    kandidaat('Onbekende Klusser', 'medium'),
    kandidaat('J. Jansen', 'high'),
  ]

  it('houdt een onherkende low-kandidaat binnenboord', () => {
    const uit = selectVasteKostenAiKandidaten(lijst, { lokaal: false })
    expect(namen(uit)).not.toContain('M. de Vries')
  })

  it('laat een low-kandidaat met een herkend merk wél door', () => {
    const uit = selectVasteKostenAiKandidaten(lijst, { lokaal: false })
    expect(namen(uit)).toContain('Netflix')
  })

  it('perkt bestaand gedrag niet in: high/medium gaan mee, ook onherkend', () => {
    // Vóór dit besluit was het filter puur `confidence !== 'low'`, dus een
    // onherkende medium ging al mee. Die grens mag hier niet stil verschuiven.
    const uit = selectVasteKostenAiKandidaten(lijst, { lokaal: false })
    expect(namen(uit)).toContain('Onbekende Klusser')
    expect(namen(uit)).toContain('J. Jansen')
    expect(namen(uit)).toContain('Vattenfall')
  })
})

describe('selectVasteKostenAiKandidaten — lokaal pad', () => {
  it('houdt de VOLLE lijst: on-device is er geen leverancier', () => {
    const lijst = [
      kandidaat('Netflix', 'low'),
      kandidaat('M. de Vries', 'low'),
      kandidaat('Vattenfall', 'medium'),
    ]
    const uit = selectVasteKostenAiKandidaten(lijst, { lokaal: true })
    expect(namen(uit)).toEqual(namen(lijst))
  })
})

describe('stilgevallen patronen vallen uit de voorstellen', () => {
  const NU = new Date('2026-09-12T12:00:00Z')

  /** Opgezegde Ziggo: herkende naam, maar de laatste betaling is van feb 2025. */
  const OPGEZEGD = {
    naam: 'ZIGGO',
    confidence: 'low' as const,
    suggestedCategory: detectCategory('ZIGGO', 'ZIGGO', false),
    frequency: 'monthly' as const,
    dates: ['2024-10-01', '2024-11-01', '2024-12-01', '2025-01-01', '2025-02-01'],
  }

  /** Zelfde post, maar hij loopt gewoon door. */
  const LOPEND = {
    ...OPGEZEGD,
    dates: ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'],
  }

  it('Given een opgezegd abonnement met een herkende naam, When de cloudlijst wordt samengesteld, Then valt het af', () => {
    const uit = selectVasteKostenAiKandidaten([OPGEZEGD], { lokaal: false, now: NU })

    expect(uit).toHaveLength(0)
  })

  it('Given hetzelfde abonnement, When het lokale pad de lijst samenstelt, Then valt het óók af — dit is een relevantiegrens', () => {
    const uit = selectVasteKostenAiKandidaten([OPGEZEGD], { lokaal: true, now: NU })

    expect(uit).toHaveLength(0)
  })

  it('Given een lopend abonnement, When de lijst wordt samengesteld, Then blijft het staan', () => {
    const uit = selectVasteKostenAiKandidaten([LOPEND], { lokaal: false, now: NU })

    expect(uit).toHaveLength(1)
  })

  it('Given een kandidaat zonder datums, When de lijst wordt samengesteld, Then wordt hij niet weggegooid', () => {
    const uit = selectVasteKostenAiKandidaten(
      [{ naam: 'X', confidence: 'high' as const, suggestedCategory: detectCategory('SPOTIFY', 'SPOTIFY', false) }],
      { lokaal: false, now: NU },
    )

    expect(uit).toHaveLength(1)
  })
})
