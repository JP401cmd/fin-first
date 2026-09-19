// lib/horizon-kernel-report/raw-rendement.test.ts
// ---------------------------------------------------------------------------
// ADR 0166 — het beheer-scherm "ruwe invoer" toonde `num(a.expected_return)`,
// en `Number(null) === 0`: een bezitting zonder eigen aanname stond daar als
// 0,0% terwijl de kern er het profielrendement op zet. `rawAssetRendement`
// spiegelt de beslissing van `potRendement` (heeftEigenRendement) op de
// percentage-schaal en markeert de bron, zodat het scherm "(profiel)" toont.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { rawAssetRendement } from './load-input'

describe('rawAssetRendement — null vs bewuste 0 (ADR 0166)', () => {
  it('null → profielrendement (decimaal → procent) met bron "profiel"', () => {
    // Tolerantie ABSOLUUT 1e-10 op de percentage-schaal: 0,07 × 100 is in IEEE-754
    // 7,000000000000001, niet 7 — precies de niet-bit-identieke ×100 waarom de
    // beslissing (heeftEigenRendement) wél en de omrekening níét gedeeld is.
    for (const leeg of [null, undefined]) {
      const r = rawAssetRendement(leeg, 0.07)
      expect(r.rendementBron).toBe('profiel')
      expect(r.rendementPct).toBeCloseTo(7, 10)
    }
  })

  it('een ingevulde 0 blijft 0 met bron "eigen" — een bewuste nul erft niets', () => {
    expect(rawAssetRendement(0, 0.07)).toEqual({ rendementPct: 0, rendementBron: 'eigen' })
  })

  it('een eigen aanname wint van het profiel, ook als NUMERIC-string uit PostgREST', () => {
    expect(rawAssetRendement(2.5, 0.07)).toEqual({ rendementPct: 2.5, rendementBron: 'eigen' })
    expect(rawAssetRendement('2.5', 0.07)).toEqual({ rendementPct: 2.5, rendementBron: 'eigen' })
  })
})
