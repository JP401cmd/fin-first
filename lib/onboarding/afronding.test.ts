import { describe, expect, it } from 'vitest'
import {
  AFRONDING_GELDIG_MS,
  ONBOARDING_AFRONDING_KEY,
  readOnboardingBankKoppelingen,
  readOpenAfronding,
  withAfrondingOpen,
  withAfrondingVoortgang,
} from './afronding'

const T0 = new Date('2026-09-17T10:00:00.000Z')
const later = (ms: number) => new Date(T0.getTime() + ms)

describe('onboarding-afronding markering', () => {
  it('opent op de budgetstap en laat andere sleutels staan', () => {
    const next = withAfrondingOpen({ 'rondleiding:pending': { since: 'x' }, 'welcome:guide': 1 }, T0)
    expect(next['rondleiding:pending']).toEqual({ since: 'x' })
    expect(next['welcome:guide']).toBe(1)
    expect(next[ONBOARDING_AFRONDING_KEY]).toEqual({ stap: 'budget', sinds: T0.toISOString() })
    expect(readOpenAfronding(next, T0)).toBe('budget')
  })

  it('schuift door naar bank en houdt sinds + budget-uitkomst vast', () => {
    const open = withAfrondingOpen(null, T0)
    const bank = withAfrondingVoortgang(open, { stap: 'bank', budget: 'opgeslagen' }, later(5000))
    expect(bank[ONBOARDING_AFRONDING_KEY]).toEqual({ stap: 'bank', sinds: T0.toISOString(), budget: 'opgeslagen' })
    expect(readOpenAfronding(bank, later(5000))).toBe('bank')
  })

  it('klaar sluit de markering maar bewaart de uitkomst', () => {
    const open = withAfrondingOpen(null, T0)
    const bank = withAfrondingVoortgang(open, { stap: 'bank', budget: 'overgeslagen' }, T0)
    const klaar = withAfrondingVoortgang(bank, { stap: 'klaar', bank: { overgeslagen: 'bank_ontbreekt' } }, T0)
    expect(readOpenAfronding(klaar, T0)).toBeNull()
    expect(klaar[ONBOARDING_AFRONDING_KEY]).toMatchObject({
      stap: 'klaar',
      budget: 'overgeslagen',
      bank: { overgeslagen: 'bank_ontbreekt' },
    })
  })

  it('verloopt na de geldigheidsduur', () => {
    const open = withAfrondingOpen(null, T0)
    expect(readOpenAfronding(open, later(AFRONDING_GELDIG_MS))).toBe('budget')
    expect(readOpenAfronding(open, later(AFRONDING_GELDIG_MS + 1))).toBeNull()
  })

  it('is fail-safe bij ontbrekende of corrupte state', () => {
    for (const raw of [null, undefined, 'kapot', 42, [], {}, { [ONBOARDING_AFRONDING_KEY]: 'x' },
      { [ONBOARDING_AFRONDING_KEY]: { stap: 'onbekend', sinds: T0.toISOString() } },
      { [ONBOARDING_AFRONDING_KEY]: { stap: 'bank', sinds: 'geen-datum' } }]) {
      expect(readOpenAfronding(raw, T0)).toBeNull()
    }
  })
})

// De poort onder de eerste ophaal op het homescherm (ADR 0158).
//
// Deze poort hangt bewust aan de KOPPELING en niet aan gebruikerstoestand:
// alleen de ids die bij de afronding zijn vastgelegd mogen automatisch worden
// opgehaald. Elke andere uitkomst dan die lijst is leeg — fail-safe, want de
// fout aan de andere kant (een koppeling synchroniseren waarvan het
// correctiemoment van ADR 0069 nog leeft) is onherstelbaar.
describe('readOnboardingBankKoppelingen', () => {
  const klaar = (voortgang: Parameters<typeof withAfrondingVoortgang>[1]) =>
    withAfrondingVoortgang(
      withAfrondingVoortgang(withAfrondingOpen(null, T0), { stap: 'bank', budget: 'opgeslagen' }, T0),
      voortgang,
      T0,
    )

  const gekoppeld = klaar({ stap: 'klaar', bank: 'gekoppeld', bankKoppelingen: ['ca-1', 'ca-2'] })

  it('geeft de vastgelegde koppelingen terug', () => {
    expect(readOnboardingBankKoppelingen(gekoppeld, T0)).toEqual(['ca-1', 'ca-2'])
  })

  // Een markering van vóór ADR 0158 draagt de ids nog niet. Die mag géén
  // automatische ophaal opleveren — anders valt de grens juist weg bij de
  // gebruikers die op het moment van uitrol midden in hun venster zaten.
  it('geeft leeg als de ids ontbreken (markering van vóór ADR 0158)', () => {
    expect(readOnboardingBankKoppelingen(klaar({ stap: 'klaar', bank: 'gekoppeld' }), T0)).toEqual([])
  })

  it('geeft leeg bij een overgeslagen bank', () => {
    const overgeslagen = klaar({ stap: 'klaar', bank: { overgeslagen: 'rondkijken' } })
    expect(readOnboardingBankKoppelingen(overgeslagen, T0)).toEqual([])
  })

  it('geeft leeg zolang de bankstap nog open staat', () => {
    const open = withAfrondingVoortgang(
      withAfrondingOpen(null, T0),
      { stap: 'bank', budget: 'opgeslagen' },
      T0,
    )
    expect(readOnboardingBankKoppelingen(open, T0)).toEqual([])
  })

  it('vervalt na het geldigheidsvenster', () => {
    expect(readOnboardingBankKoppelingen(gekoppeld, later(AFRONDING_GELDIG_MS - 1))).toEqual([
      'ca-1',
      'ca-2',
    ])
    expect(readOnboardingBankKoppelingen(gekoppeld, later(AFRONDING_GELDIG_MS + 1))).toEqual([])
  })

  it('geeft leeg bij ontbrekende, lege of corrupte staat', () => {
    for (const raw of [
      null,
      undefined,
      {},
      'tekst',
      { [ONBOARDING_AFRONDING_KEY]: { stap: 'klaar' } },
      { [ONBOARDING_AFRONDING_KEY]: { stap: 'klaar', sinds: 'geen-datum', bank: 'gekoppeld' } },
      {
        [ONBOARDING_AFRONDING_KEY]: {
          stap: 'klaar',
          sinds: T0.toISOString(),
          bank: 'gekoppeld',
          bankKoppelingen: 'geen-lijst',
        },
      },
    ]) {
      expect(readOnboardingBankKoppelingen(raw, T0)).toEqual([])
    }
  })

  it('zeeft niet-string en lege ids uit een corrupte lijst', () => {
    const vies = {
      [ONBOARDING_AFRONDING_KEY]: {
        stap: 'klaar',
        sinds: T0.toISOString(),
        bank: 'gekoppeld',
        bankKoppelingen: ['ca-1', '', null, 42, { id: 'ca-9' }, 'ca-2'],
      },
    }
    expect(readOnboardingBankKoppelingen(vies, T0)).toEqual(['ca-1', 'ca-2'])
  })
})
