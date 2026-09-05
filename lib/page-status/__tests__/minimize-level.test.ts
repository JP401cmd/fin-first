// lib/page-status/__tests__/minimize-level.test.ts
//
// Unit-tests voor minimizeLevelFor() (lib/page-status/display.ts): op WELK
// niveau een banner wordt weggeklikt. Samen met resolveBannerDisplay() vormt dat
// één keten — het niveau dat hier gekozen wordt, bepaalt daar of de banner
// ingeklapt blijft. Die keten is precies waar B-017 misging, dus de tests
// hieronder toetsen niet alleen het niveau maar ook de uitkomst ná minimaliseren.
//
// Laag: Vitest — pure module, geen IO/React.

import { describe, it, expect } from 'vitest'
import { minimizeLevelFor, resolveBannerDisplay } from '../display'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { PageStatusKind } from '../types'

describe('minimizeLevelFor — de vrijheidsbanner met een tekort (B-017)', () => {
  // Given: de stop-anker-banner op /overzicht meldt een tekort (kind 'freedom',
  //   status 'warn' — sinds ADR 0129 kan die banner niet-neutraal zijn).
  // When: de gebruiker op "Minimaliseren" klikt.
  // Then: hij klapt in en BLIJFT ingeklapt. Vóór de fix werd hij op 'info'
  //   (severity 0) opgeslagen, waarna resolveBannerDisplay de eigen 'warn'
  //   (severity 1) als escalatie las en de banner direct heropende — de knop
  //   deed zichtbaar niets.
  it("freedom + 'warn' → niveau 'warn', en blijft daarna ingeklapt", () => {
    const level = minimizeLevelFor('freedom', 'warn')
    expect(level).toBe('warn')
    expect(resolveBannerDisplay('warn', level)).toBe('minimized')
  })

  it("freedom + 'bad' → niveau 'bad', en blijft daarna ingeklapt", () => {
    const level = minimizeLevelFor('freedom', 'bad')
    expect(level).toBe('bad')
    expect(resolveBannerDisplay('bad', level)).toBe('minimized')
  })

  it("freedom + 'warn' geminimaliseerd heropent alsnog bij verergering naar 'bad'", () => {
    const level = minimizeLevelFor('freedom', 'warn')
    expect(resolveBannerDisplay('bad', level)).toBe('expanded')
  })
})

describe('minimizeLevelFor — de informatieve vrijheidsbanner (ongewijzigd)', () => {
  // Het gedekte geval: geen alarm, dus het vaste 'info'-niveau dat nooit
  // escaleert. Dit werkte al en moet blijven werken.
  it("freedom + 'neutral' → niveau 'info', en blijft daarna ingeklapt", () => {
    const level = minimizeLevelFor('freedom', 'neutral')
    expect(level).toBe('info')
    expect(resolveBannerDisplay('neutral', level)).toBe('minimized')
  })

  it("freedom + 'good' → niveau 'info'", () => {
    expect(minimizeLevelFor('freedom', 'good')).toBe('info')
  })
})

describe('minimizeLevelFor — de leverage-banner (ongewijzigd)', () => {
  it("leverage + 'warn' → niveau 'warn'", () => {
    expect(minimizeLevelFor('leverage', 'warn')).toBe('warn')
  })

  it("leverage + 'bad' → niveau 'bad'", () => {
    expect(minimizeLevelFor('leverage', 'bad')).toBe('bad')
  })

  it("leverage + 'neutral' → null (geen banner om te minimaliseren)", () => {
    expect(minimizeLevelFor('leverage', 'neutral')).toBeNull()
  })

  it("leverage + 'good' → null", () => {
    expect(minimizeLevelFor('leverage', 'good')).toBeNull()
  })
})

describe('minimizeLevelFor — keten-invariant over alle combinaties', () => {
  // De harde regel achter B-017: minimaliseren moet ALTIJD zichtbaar effect
  // hebben. Levert de helper een niveau, dan is de banner bij een ongewijzigde
  // status ook daadwerkelijk ingeklapt — voor elke kind/status-combinatie.
  it('een gekozen niveau leidt bij ongewijzigde status altijd tot "minimized"', () => {
    const kinds: PageStatusKind[] = ['leverage', 'freedom']
    const statuses: LeverageStatus[] = ['good', 'neutral', 'warn', 'bad']

    for (const kind of kinds) {
      for (const status of statuses) {
        const level = minimizeLevelFor(kind, status)
        if (level === null) continue
        expect(
          resolveBannerDisplay(status, level),
          `${kind}/${status} klapte niet in op niveau ${level}`,
        ).toBe('minimized')
      }
    }
  })
})
