import { describe, expect, it } from 'vitest'
import {
  AFRONDING_GELDIG_MS,
  ONBOARDING_AFRONDING_KEY,
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
