import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const loadHorizonDataMock = vi.fn()
const computeHorizonFireSimMock = vi.fn()
const vastgelegdDoelGedektMock = vi.fn()

vi.mock('@/lib/horizon-data-loader', () => ({
  loadHorizonData: (...args: unknown[]) => loadHorizonDataMock(...args),
}))
vi.mock('@/lib/fire-target-shared', () => ({
  computeHorizonFireSim: (...args: unknown[]) => computeHorizonFireSimMock(...args),
}))
vi.mock('@/lib/horizon/doel-oordeel', () => ({
  vastgelegdDoelGedekt: (...args: unknown[]) => vastgelegdDoelGedektMock(...args),
}))

import { loadPlanStatus, loadPlanVerdictSentence } from './plan-status-loader'

const SB = {} as SupabaseClient

function horizon(
  anchor: { kind: string; age?: number },
  freedomPct: number,
  dob: string | null = '1980-01-01',
  doel: unknown = undefined,
) {
  return {
    firePlan: { anchor },
    healthScoreInput: { freedomPct, effectiveSavingsRatePct: 30 },
    effectiveInput: { dateOfBirth: dob, monthlyIncome: 5_000, monthlyExpenses: 3_000 },
    fireParams: { grossReturn: 0.06 },
    toekomstScenarioPrefs: doel === undefined ? null : { v: 2, doel },
  }
}
const run = (fireReachable: boolean) => ({ sim: { fireReachable }, rawContext: { profile: {} } })
const DOEL = { gezetOp: '2026-09-20T10:00:00Z', parameters: { fire: true }, stand: { stopAge: 52 } }

describe('loadPlanStatus', () => {
  beforeEach(() => {
    loadHorizonDataMock.mockReset()
    computeHorizonFireSimMock.mockReset()
    vastgelegdDoelGedektMock.mockReset()
  })

  it('vast anker met run: de dekking beslist (5% ⇒ bad)', async () => {
    loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'age', age: 48 }, 5))
    computeHorizonFireSimMock.mockResolvedValue(run(true))
    await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('bad')
  })

  it('vast anker ZONDER run: de loader-0 is "onbekend" ⇒ neutral, geen vals rood', async () => {
    loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'aow' }, 0))
    computeHorizonFireSimMock.mockResolvedValue(null)
    await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('neutral')
  })

  it('vast anker zonder geboortedatum ⇒ neutral', async () => {
    loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'aow' }, 0, null))
    computeHorizonFireSimMock.mockResolvedValue(run(true))
    await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('neutral')
  })

  it('solved: fireReachable van de hoofdrun beslist', async () => {
    loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5))
    computeHorizonFireSimMock.mockResolvedValue(run(true))
    await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('good')
    computeHorizonFireSimMock.mockResolvedValue(run(false))
    await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('bad')
  })

  describe('ADR 0175 — het vastgelegde doel onder solved', () => {
    it('haalbaar plan, doel reikt niet ⇒ warn, en de kop zegt "haalbaar, je doel nog niet"', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5, '1980-01-01', DOEL))
      computeHorizonFireSimMock.mockResolvedValue(run(true))
      vastgelegdDoelGedektMock.mockReturnValue(false)
      await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('warn')
      await expect(loadPlanVerdictSentence(SB, 'personal')).resolves.toEqual({
        sentence: { voor: 'Je toekomstplan is', oordeel: 'haalbaar, je doel nog niet' },
        status: 'warn',
      })
      // De doel-run krijgt de rauwe context van de hoofdrun en de lab-baseline.
      const arg = vastgelegdDoelGedektMock.mock.calls[0]![0]
      expect(arg.doel).toBe(DOEL)
      expect(arg.rawContext).toEqual({ profile: {} })
      expect(arg.baseline.savingsRate).toBe(30)
    })

    it('doel reikt ⇒ good', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5, '1980-01-01', DOEL))
      computeHorizonFireSimMock.mockResolvedValue(run(true))
      vastgelegdDoelGedektMock.mockReturnValue(true)
      await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('good')
    })

    it('huishoudblik: het doel telt niet mee (het lab rekent solo) — geen doel-run', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5, '1980-01-01', DOEL))
      computeHorizonFireSimMock.mockResolvedValue(run(true))
      vastgelegdDoelGedektMock.mockReturnValue(false)
      await expect(loadPlanStatus(SB, 'household')).resolves.toBe('good')
      expect(vastgelegdDoelGedektMock).not.toHaveBeenCalled()
    })

    it('onhaalbaar plan blijft rood — geen doel-run', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5, '1980-01-01', DOEL))
      computeHorizonFireSimMock.mockResolvedValue(run(false))
      await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('bad')
      expect(vastgelegdDoelGedektMock).not.toHaveBeenCalled()
    })

    it('vast stopmoment: de dekking beslist — geen doel-run', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'age', age: 48 }, 120, '1980-01-01', DOEL))
      computeHorizonFireSimMock.mockResolvedValue(run(true))
      await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('good')
      expect(vastgelegdDoelGedektMock).not.toHaveBeenCalled()
    })

    it('zonder geboortedatum geen doel-run', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5, null, DOEL))
      computeHorizonFireSimMock.mockResolvedValue(run(true))
      await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('good')
      expect(vastgelegdDoelGedektMock).not.toHaveBeenCalled()
    })

    it('geen hoofdrun (fireReachable onbekend) ⇒ neutral, geen doel-run', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5, '1980-01-01', DOEL))
      computeHorizonFireSimMock.mockResolvedValue(null)
      await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('neutral')
      expect(vastgelegdDoelGedektMock).not.toHaveBeenCalled()
    })

    it('doel-oordeel null (niets te beoordelen) ⇒ ongewijzigd groen', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5, '1980-01-01', DOEL))
      computeHorizonFireSimMock.mockResolvedValue(run(true))
      vastgelegdDoelGedektMock.mockReturnValue(null)
      await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('good')
    })

    it('geen vastgelegd doel — geen doel-run, ongewijzigd groen', async () => {
      loadHorizonDataMock.mockResolvedValue(horizon({ kind: 'solved' }, 5))
      computeHorizonFireSimMock.mockResolvedValue(run(true))
      await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('good')
      expect(vastgelegdDoelGedektMock).not.toHaveBeenCalled()
    })
  })

  it('een falende loader geeft neutral, nooit een exception', async () => {
    loadHorizonDataMock.mockRejectedValue(new Error('kapot'))
    computeHorizonFireSimMock.mockRejectedValue(new Error('kapot'))
    await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('neutral')
  })
})
