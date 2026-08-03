// ── Feature-registry: de tellingen vastzetten ───────────────────────────────
//
// De commentaren in feature-registry.ts liepen uit de pas met de inhoud: de
// bestandskop zei "16 consolidated features" terwijl het er 18 waren, en de
// AI-sectie zei "(4 features)" terwijl er 6 stonden. Op zichzelf onschuldig,
// maar dit is wél de lijst waarop het AI-abonnement is ingericht: hij wordt
// letterlijk als bullets op de AI-kaart in /mijn/account getoond en stuurt via
// lib/ai/execution-groups.ts de indeling van het privacy-scherm. Een telling die
// stilletjes verschuift, is dus een lijst die niet meer klopt op twee schermen.
//
// Deze test pint de verdeling. Verandert het aanbod echt, dan werk je hier én de
// commentaren bij — bewust, in dezelfde wijziging.

import { describe, it, expect } from 'vitest'
import { UNIFIED_FEATURES } from './feature-registry'
import { featuresForTier } from './subscription-catalog'
import { AI_EXECUTION_GROUPS } from './ai/execution-groups'

describe('UNIFIED_FEATURES — verdeling per tier', () => {
  it('telt 18 features: 11 gratis + 1 connected + 6 ai', () => {
    const perTier = UNIFIED_FEATURES.reduce<Record<string, number>>((acc, f) => {
      acc[f.requiredTier] = (acc[f.requiredTier] ?? 0) + 1
      return acc
    }, {})

    expect(perTier).toEqual({ gratis: 11, connected: 1, ai: 6 })
    expect(UNIFIED_FEATURES.length).toBe(18)
  })

  it('feature-id\'s zijn uniek', () => {
    const ids = UNIFIED_FEATURES.map((f) => f.id)
    expect(new Set(ids).size, 'dubbele feature-id in de registry').toBe(ids.length)
  })

  it('de zes AI-features hebben de verwachte id\'s', () => {
    const aiIds = UNIFIED_FEATURES.filter((f) => f.requiredTier === 'ai').map((f) => f.id).sort()
    expect(aiIds).toEqual([
      'ai_aanbevelingen',
      'ai_analyse',
      'ai_assistent',
      'ai_briefing',
      'ai_nieuws',
      'ai_rapportage',
    ])
  })
})

describe('koppeling met de uitvoergroepen van /mijn/privacy', () => {
  // Het privacy-scherm groepeert de keuze "waar draait de AI?" langs precies de
  // features die iemand koopt. Verwijst een groep naar een feature die niet meer
  // bestaat, dan toont dat scherm een categorie zonder betekenis.
  it('elke groep verwijst naar bestaande feature-id\'s', () => {
    const known = new Set(UNIFIED_FEATURES.map((f) => f.id))
    for (const groep of AI_EXECUTION_GROUPS) {
      for (const featureId of groep.commercieleFeatures) {
        expect(known.has(featureId), `groep "${groep.id}" verwijst naar onbekende feature "${featureId}"`).toBe(true)
      }
    }
  })

  it('elke AI-feature komt terug in minstens één groep', () => {
    const gedekt = new Set(AI_EXECUTION_GROUPS.flatMap((g) => g.commercieleFeatures))
    for (const feature of UNIFIED_FEATURES.filter((f) => f.requiredTier === 'ai')) {
      expect(
        gedekt.has(feature.id),
        `"${feature.label}" wordt verkocht maar heeft geen plek in de privacy-keuze`,
      ).toBe(true)
    }
  })

  // featuresForTier woont in lib/subscription-catalog.ts en is wat /mijn/account
  // daadwerkelijk rendert — de brug tussen "wat je koopt" en deze registry.
  it("featuresForTier('ai') levert precies de zes AI-items", () => {
    const viaCatalog = featuresForTier('ai')
      .map((f) => f.id)
      .sort()
    const viaRegistry = UNIFIED_FEATURES.filter((f) => f.requiredTier === 'ai')
      .map((f) => f.id)
      .sort()
    expect(viaCatalog).toEqual(viaRegistry)
  })
})
