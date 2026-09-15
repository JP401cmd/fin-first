import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const loadHorizonDataMock = vi.fn()
const computeHorizonFireSimMock = vi.fn()

vi.mock('@/lib/horizon-data-loader', () => ({
  loadHorizonData: (...args: unknown[]) => loadHorizonDataMock(...args),
}))
vi.mock('@/lib/fire-target-shared', () => ({
  computeHorizonFireSim: (...args: unknown[]) => computeHorizonFireSimMock(...args),
}))

import { loadPlanStatus } from './plan-status-loader'

const SB = {} as SupabaseClient

function horizon(anchor: { kind: string; age?: number }, freedomPct: number, dob: string | null = '1980-01-01') {
  return {
    firePlan: { anchor },
    healthScoreInput: { freedomPct },
    effectiveInput: { dateOfBirth: dob },
  }
}
const run = (fireReachable: boolean) => ({ sim: { fireReachable } })

describe('loadPlanStatus', () => {
  beforeEach(() => {
    loadHorizonDataMock.mockReset()
    computeHorizonFireSimMock.mockReset()
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

  it('een falende loader geeft neutral, nooit een exception', async () => {
    loadHorizonDataMock.mockRejectedValue(new Error('kapot'))
    computeHorizonFireSimMock.mockRejectedValue(new Error('kapot'))
    await expect(loadPlanStatus(SB, 'personal')).resolves.toBe('neutral')
  })
})
