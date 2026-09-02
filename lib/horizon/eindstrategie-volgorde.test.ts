import { describe, it, expect } from 'vitest'
import { EINDSTRATEGIE_VOLGORDE, toontEindleeftijd } from './eindstrategie-volgorde'
import { FIRE_END_STRATEGIES, STRATEGY_LABELS, type FireEndStrategy } from '@/lib/fire-strategy'

/**
 * ADR 0127 — de fout die dit bestand voorkomt: een oppervlak met een HANDMATIGE
 * strategie-lijst mist stil een nieuw lid. `components/future/regels/
 * eindstrategie-body.tsx` droeg
 * `['deplete', 'legacy', 'perpetual', 'pensioen']` en toonde 'nu-stoppen' dus
 * niet, terwijl drie andere schermen hem al aanboden.
 *
 * De compiler dwingt dit niet af (een array-literal van unie-leden is geldig,
 * hoe incompleet ook), dus staat het hier.
 */

describe('EINDSTRATEGIE_VOLGORDE', () => {
  it('bevat ELKE strategie uit de canonieke allowlist — precies één keer', () => {
    expect([...EINDSTRATEGIE_VOLGORDE].sort()).toEqual([...FIRE_END_STRATEGIES].sort())
    expect(new Set(EINDSTRATEGIE_VOLGORDE).size).toBe(EINDSTRATEGIE_VOLGORDE.length)
  })

  it('bevat geen strategie die niet in STRATEGY_LABELS staat (geen dode entry)', () => {
    for (const key of EINDSTRATEGIE_VOLGORDE) {
      expect(STRATEGY_LABELS[key]).toBeDefined()
    }
  })

  it('houdt de bewuste volgorde aan: eind-vormen eerst, stop-ankers erachter', () => {
    expect(EINDSTRATEGIE_VOLGORDE).toEqual([
      'deplete',
      'legacy',
      'perpetual',
      'pensioen',
      'nu-stoppen',
    ])
  })

  it("'nu-stoppen' staat achteraan — als eerste optie zou hij als aanbeveling lezen", () => {
    expect(EINDSTRATEGIE_VOLGORDE[EINDSTRATEGIE_VOLGORDE.length - 1]).toBe('nu-stoppen')
  })
})

describe('toontEindleeftijd', () => {
  it('alleen perpetual heeft geen instelbare eindleeftijd', () => {
    expect(toontEindleeftijd('perpetual')).toBe(false)
    for (const key of FIRE_END_STRATEGIES.filter((k) => k !== 'perpetual')) {
      expect(toontEindleeftijd(key)).toBe(true)
    }
  })

  it("onder 'nu-stoppen' is de eindleeftijd juist betekenisvol (de lat waar het geld tot moet reiken)", () => {
    expect(toontEindleeftijd('nu-stoppen')).toBe(true)
  })

  it('een onbekende (toekomstige) strategie toont de eindleeftijd standaard wél', () => {
    // Een veld te veel is zichtbaar en corrigeerbaar; een ontbrekende instelling niet.
    expect(toontEindleeftijd('een-zesde-strategie' as FireEndStrategy)).toBe(true)
  })
})
