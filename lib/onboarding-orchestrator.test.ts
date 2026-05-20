import { describe, it, expect } from 'vitest'
import {
  computeOrchestratorState,
  type OrchestratorInput,
  type OrchestratorStepKey,
} from './onboarding-orchestrator'

/**
 * Tests voor onboarding-orchestrator state-machine. Plan §6.7:
 * journey-stappen worden gemonteerd op basis van wat de gebruiker heeft
 * aangeleverd en hoe oud het account is.
 */

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    hasDob: false,
    hasAssets: false,
    hasGoals: false,
    accountAgeDays: 0,
    dismissedKeys: new Set<OrchestratorStepKey>(),
    ...overrides,
  }
}

describe('computeOrchestratorState — stage-bepaling', () => {
  it('start = registreren (niets ingevuld)', () => {
    const s = computeOrchestratorState(makeInput())
    expect(s.currentStage).toBe('registreren')
  })

  it('na DOB+asset → toekomst (mist doel)', () => {
    const s = computeOrchestratorState(
      makeInput({ hasDob: true, hasAssets: true }),
    )
    expect(s.currentStage).toBe('toekomst')
  })

  it('alles ingevuld + < 7 dagen → inzicht', () => {
    const s = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: true,
        accountAgeDays: 3,
      }),
    )
    expect(s.currentStage).toBe('inzicht')
  })

  it('alles ingevuld + ≥ 7 dagen + briefing nog niet gedismissed → tips', () => {
    const s = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: true,
        accountAgeDays: 14,
      }),
    )
    expect(s.currentStage).toBe('tips')
  })

  it('alles ingevuld + ≥ 7 dagen + briefing gedismissed → complete', () => {
    const s = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: true,
        accountAgeDays: 14,
        dismissedKeys: new Set(['open-briefing']),
      }),
    )
    expect(s.currentStage).toBe('complete')
  })
})

describe('computeOrchestratorState — nextNudge volgorde', () => {
  it('eerste nudge is DOB als niets ingevuld', () => {
    const s = computeOrchestratorState(makeInput())
    expect(s.nextNudge?.key).toBe('dob')
  })

  it('na DOB → next is first-asset', () => {
    const s = computeOrchestratorState(makeInput({ hasDob: true }))
    expect(s.nextNudge?.key).toBe('first-asset')
  })

  it('na DOB+asset → next is first-goal', () => {
    const s = computeOrchestratorState(
      makeInput({ hasDob: true, hasAssets: true }),
    )
    expect(s.nextNudge?.key).toBe('first-goal')
  })

  it('na DOB+asset+goal + < 7 dagen → next null (wacht op briefing-unlock)', () => {
    const s = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: true,
        accountAgeDays: 3,
      }),
    )
    expect(s.nextNudge).toBeNull()
  })

  it('na DOB+asset+goal + ≥ 7 dagen → next is open-briefing', () => {
    const s = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: true,
        accountAgeDays: 7,
      }),
    )
    expect(s.nextNudge?.key).toBe('open-briefing')
  })

  it('dismissed stap wordt overgeslagen voor nextNudge', () => {
    const s = computeOrchestratorState(
      makeInput({ dismissedKeys: new Set(['dob']) }),
    )
    // DOB is gedismissed → next-nudge wordt geblokkeerd door asset's unlocked=false
    // (asset is unlocked door hasDob; dismissal verbergt de DOB-prompt maar
    // verandert hasDob niet). Resultaat: geen volgende nudge.
    expect(s.nextNudge).toBeNull()
  })
})

describe('computeOrchestratorState — unlocked-progressie', () => {
  it('DOB unlocked van begin af aan', () => {
    const s = computeOrchestratorState(makeInput())
    expect(s.steps.find((x) => x.key === 'dob')?.unlocked).toBe(true)
  })

  it('first-asset locked tot DOB gezet is', () => {
    const s1 = computeOrchestratorState(makeInput())
    expect(s1.steps.find((x) => x.key === 'first-asset')?.unlocked).toBe(false)
    const s2 = computeOrchestratorState(makeInput({ hasDob: true }))
    expect(s2.steps.find((x) => x.key === 'first-asset')?.unlocked).toBe(true)
  })

  it('first-goal locked tot DOB+asset gezet zijn', () => {
    const s1 = computeOrchestratorState(makeInput({ hasDob: true }))
    expect(s1.steps.find((x) => x.key === 'first-goal')?.unlocked).toBe(false)
    const s2 = computeOrchestratorState(
      makeInput({ hasDob: true, hasAssets: true }),
    )
    expect(s2.steps.find((x) => x.key === 'first-goal')?.unlocked).toBe(true)
  })

  it('open-briefing locked tot alles compleet + ≥ 7 dagen', () => {
    const s1 = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: true,
        accountAgeDays: 3,
      }),
    )
    expect(s1.steps.find((x) => x.key === 'open-briefing')?.unlocked).toBe(false)
    const s2 = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: true,
        accountAgeDays: 7,
      }),
    )
    expect(s2.steps.find((x) => x.key === 'open-briefing')?.unlocked).toBe(true)
  })
})

describe('computeOrchestratorState — completedCount', () => {
  it('telt voltooide stappen, ongeacht dismissed', () => {
    const s = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: false,
      }),
    )
    expect(s.completedCount).toBe(2)
  })

  it('open-briefing telt niet als completable (geen data-criterium)', () => {
    const s = computeOrchestratorState(
      makeInput({
        hasDob: true,
        hasAssets: true,
        hasGoals: true,
        accountAgeDays: 30,
      }),
    )
    // 3 van 4 stappen "completed" — briefing-stap is altijd false op completed
    expect(s.completedCount).toBe(3)
  })
})
