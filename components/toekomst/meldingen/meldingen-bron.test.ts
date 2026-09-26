import { describe, expect, it } from 'vitest'
import type { GoalProgress } from '@/lib/goal-data'
import { bouwDoelenBron, planOordeelBekend, voorkeurenOpen } from './meldingen-bron'

function progress(pct: number, onTrack: boolean): GoalProgress {
  return { current: 0, target: 100, pct, onTrack, measured: true, requiredMonthly: null, eta: null, paceSkipped: false } as GoalProgress
}

describe('bouwDoelenBron — de doelen voor de Doelen-meldingen', () => {
  it('eigen doelen als DoelSignaal; lab-doelen alleen in de telling "past niet meer bij je plan"', () => {
    const goals = [
      { id: 'a', name: 'Buffer', metadata: null, is_completed: false },
      { id: 'b', name: 'Huis', metadata: {}, is_completed: true },
      { id: 'lab1', name: 'Vrij op 58', goal_type: 'fire_age', metadata: { bron: 'parameter' }, notApplicableReason: 'Je stopmoment ligt vast op 62.' },
      { id: 'lab2', name: 'Spaarquote 45%', goal_type: 'savings_rate', metadata: { bron: 'parameter' } },
    ]
    const uit = bouwDoelenBron(goals, [progress(40, false), progress(100, true), progress(0, true), progress(84, true)])
    expect(uit.doelen).toEqual([
      { id: 'a', naam: 'Buffer', progress: { onTrack: false, pct: 40 }, isCompleted: false },
      { id: 'b', naam: 'Huis', progress: { onTrack: true, pct: 100 }, isCompleted: true },
    ])
    expect(uit.labDoelenBuitenPlan).toBe(1)
  })

  it('een doel zonder voortgang telt niet mee (zoals in de doelenlijst)', () => {
    const uit = bouwDoelenBron([{ id: 'a', name: 'X', metadata: null }], [undefined])
    expect(uit).toEqual({ doelen: [], labDoelenBuitenPlan: 0 })
  })
})

describe('voorkeurenOpen — de wizardstand in de Instellingen-samenvatting', () => {
  const basis = { stappen: [], eersteOpen: null }
  it('totaal − bevestigd, 0 als voltooid of zonder review', () => {
    expect(voorkeurenOpen({ ...basis, bevestigd: 4, totaal: 6, voltooid: false })).toBe(2)
    expect(voorkeurenOpen({ ...basis, bevestigd: 6, totaal: 6, voltooid: true })).toBe(0)
    expect(voorkeurenOpen(null)).toBe(0)
  })
})

describe('planOordeelBekend — dezelfde poort als loadPlanStatusInput', () => {
  it('vast anker: alleen met bekende dekking; solved: alleen met bekende haalbaarheid', () => {
    expect(planOordeelBekend(null)).toBe(false)
    expect(planOordeelBekend({ anchorFixed: true, coveragePct: 87, solvedReachable: null })).toBe(true)
    // Zonder geboortedatum zet de server de dekking op null — geen oordeel, geen melding.
    expect(planOordeelBekend({ anchorFixed: true, coveragePct: null, solvedReachable: null })).toBe(false)
    expect(planOordeelBekend({ anchorFixed: false, coveragePct: null, solvedReachable: false })).toBe(true)
    expect(planOordeelBekend({ anchorFixed: false, coveragePct: null, solvedReachable: null })).toBe(false)
  })
})
