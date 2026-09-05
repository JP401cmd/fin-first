// lib/grondslag-guard.test.ts
//
// Onbekend is geen nul (ADR 0131): de ene toets "mag dit oordeel op het
// scherm?" en de ene zin + knop die ervoor in de plaats komen.

import { describe, it, expect } from 'vitest'
import {
  grondslagGuard,
  ontbrekendeGrondslag,
  GRONDSLAG_AANVULLEN_HREF,
  GRONDSLAG_ONBEKEND_HINT,
  GRONDSLAG_ONBEKEND_KOP,
} from './grondslag-guard'
import { HORIZON_MISSENDE_GEGEVENS_LABEL } from './horizon/outcome-guard'
import { BASIS_LABEL, savingsRateBasisLabel, savingsRateBasisPhrase } from './budget-basis'

describe('ontbrekendeGrondslag', () => {
  it('beide bekend → null', () => {
    expect(ontbrekendeGrondslag('manual', 'transaction')).toBeNull()
    expect(ontbrekendeGrondslag('profile', 'estimate')).toBeNull()
  })

  it('een ONTBREKEND veld telt als bekend — onbekendheid is een positieve uitspraak', () => {
    expect(ontbrekendeGrondslag(undefined, undefined)).toBeNull()
    expect(ontbrekendeGrondslag(null, 'manual')).toBeNull()
  })

  it('benoemt precies de kant die ontbreekt', () => {
    expect(ontbrekendeGrondslag('unknown', 'manual')).toBe('inkomen')
    expect(ontbrekendeGrondslag('manual', 'unknown')).toBe('uitgaven')
    expect(ontbrekendeGrondslag('unknown', 'unknown')).toBe('inkomen-en-uitgaven')
  })
})

describe('grondslagGuard', () => {
  it('ok zodra alles bekend is — geen hint, geen knop', () => {
    expect(grondslagGuard('manual', 'manual')).toEqual({ ok: true, ontbreekt: null, hint: null, actie: null })
  })

  it('levert bij onbekend inkomen de ene zin en de ene knop', () => {
    const g = grondslagGuard('unknown', 'unknown')
    expect(g.ok).toBe(false)
    expect(g.ontbreekt).toBe('inkomen-en-uitgaven')
    expect(g.hint).toBe(GRONDSLAG_ONBEKEND_HINT['inkomen-en-uitgaven'])
    expect(g.actie).toEqual({ href: GRONDSLAG_AANVULLEN_HREF, label: 'Vul je inkomen en uitgaven in' })
  })

  it('de zin bevat geen cijfer en geen oordeel', () => {
    for (const hint of Object.values(GRONDSLAG_ONBEKEND_HINT)) {
      expect(hint).not.toMatch(/\d/)
      expect(hint.toLowerCase()).not.toMatch(/kritiek|kwetsbaar|slecht/)
    }
  })

  it('de kop is dezelfde als die van de horizon-melding (ADR 0109) — één formulering app-breed', () => {
    expect(GRONDSLAG_ONBEKEND_KOP).toBe(HORIZON_MISSENDE_GEGEVENS_LABEL)
  })
})

describe('spaarquote-labels — onbekend wint over "gemengd"', () => {
  // Met één kant onbekend gaf het label vroeger 'gemengde grondslag' — dat
  // claimt een grondslag die er niet is en verstopt het gat.
  it('label', () => {
    expect(savingsRateBasisLabel('unknown', 'transaction')).toBe(BASIS_LABEL.unknown)
    expect(savingsRateBasisLabel('manual', 'unknown')).toBe(BASIS_LABEL.unknown)
    expect(savingsRateBasisLabel('manual', 'transaction')).toBe('gemengde grondslag')
  })

  it('zinsdeel', () => {
    expect(savingsRateBasisPhrase('unknown', 'transaction')).toBe('zonder bekende grondslag')
  })
})
