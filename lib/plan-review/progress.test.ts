import { describe, expect, it } from 'vitest'
import { buildPlanReviewFacts, derivePlanReviewProgress } from './progress'
import { parsePlanReviewState, type PlanReviewFacts, type PlanReviewState } from './types'

const ALLES_AANWEZIG: PlanReviewFacts = {
  hasAowEvent: true,
  hasEigenHuis: true,
  hasNietLiquideBezit: true,
  housingConfigured: true,
}

const M = { bevestigd_op: '2026-09-13T10:00:00.000Z', bron: 'review' as const }

describe('derivePlanReviewProgress — afgeleid, geen afvinklijst (A9/A10)', () => {
  it('zonder markeringen staat alles open; eerste open stap = plan', () => {
    const p = derivePlanReviewProgress({}, ALLES_AANWEZIG)
    expect(p.bevestigd).toBe(0)
    expect(p.totaal).toBe(5)
    expect(p.eersteOpen).toBe('plan')
    expect(p.voltooid).toBe(false)
  })

  it('alle vijf gemarkeerd + profielstaat compleet → voltooid', () => {
    const state: PlanReviewState = { plan: M, uitgaven: M, inkomsten: M, woning: M, potten: M }
    const p = derivePlanReviewProgress(state, ALLES_AANWEZIG)
    expect(p.bevestigd).toBe(5)
    expect(p.voltooid).toBe(true)
    expect(p.eersteOpen).toBeNull()
  })

  it('A10 — AOW-event verwijderd heropent stap 3, ook mét oude markering', () => {
    const state: PlanReviewState = { plan: M, uitgaven: M, inkomsten: M, woning: M, potten: M }
    const p = derivePlanReviewProgress(state, { ...ALLES_AANWEZIG, hasAowEvent: false })
    const inkomsten = p.stappen.find((s) => s.stap === 'inkomsten')!
    expect(inkomsten.status).toBe('open')
    expect(inkomsten.reden).toBe('aow_ontbreekt')
    expect(p.voltooid).toBe(false)
    expect(p.eersteOpen).toBe('inkomsten')
    expect(p.bevestigd).toBe(4)
  })

  it('A10 — eigen huis toegevoegd zonder woonstrategie heropent stap 4', () => {
    const state: PlanReviewState = { plan: M, uitgaven: M, inkomsten: M, woning: M, potten: M }
    const p = derivePlanReviewProgress(state, { ...ALLES_AANWEZIG, housingConfigured: false })
    const woning = p.stappen.find((s) => s.stap === 'woning')!
    expect(woning.status).toBe('open')
    expect(woning.reden).toBe('woning_zonder_strategie')
  })

  it('A7 — zonder niet-liquide bezit is stap 4 n.v.t. en telt niet mee (4 van 4)', () => {
    const state: PlanReviewState = { plan: M, uitgaven: M, inkomsten: M, potten: M }
    const p = derivePlanReviewProgress(state, {
      hasAowEvent: true,
      hasEigenHuis: false,
      hasNietLiquideBezit: false,
      housingConfigured: false,
    })
    expect(p.stappen.find((s) => s.stap === 'woning')!.status).toBe('nvt')
    expect(p.totaal).toBe(4)
    expect(p.bevestigd).toBe(4)
    expect(p.voltooid).toBe(true)
  })

  it('bevestigde stappen blijven bevestigd wanneer een latere stap open staat (A6)', () => {
    const state: PlanReviewState = { plan: M, uitgaven: M }
    const p = derivePlanReviewProgress(state, ALLES_AANWEZIG)
    expect(p.stappen.map((s) => s.status)).toEqual(['bevestigd', 'bevestigd', 'open', 'open', 'open'])
    expect(p.eersteOpen).toBe('inkomsten')
  })
})

describe('parsePlanReviewState — tolerant lezen', () => {
  it('laat onbekende sleutels en misvormde markeringen weg', () => {
    const parsed = parsePlanReviewState({
      plan: M,
      onbekend: M,
      uitgaven: { bevestigd_op: 'geen-datum', bron: 'review' },
      potten: { bevestigd_op: M.bevestigd_op, bron: 'onboarding' },
      woning: 'x',
    })
    expect(parsed).toEqual({ plan: M })
  })

  it('geeft {} op null/array/primitief', () => {
    expect(parsePlanReviewState(null)).toEqual({})
    expect(parsePlanReviewState([])).toEqual({})
    expect(parsePlanReviewState('a')).toEqual({})
  })
})

describe('buildPlanReviewFacts — uit de al-geladen bundelrijen', () => {
  it('leest AOW-event, eigen huis, niet-liquide bezit en de woonconfig', () => {
    const facts = buildPlanReviewFacts({
      events: [
        { event_type: 'aow', is_active: false },
        { event_type: 'pension', is_active: true },
      ],
      assets: [
        { asset_type: 'savings', is_active: true },
        { asset_type: 'vehicle', is_active: true },
        { asset_type: 'eigen_huis', is_active: false },
      ],
      housingStrategyRaw: null,
    })
    expect(facts).toEqual({
      hasAowEvent: false,
      hasEigenHuis: false,
      hasNietLiquideBezit: true,
      housingConfigured: false,
    })
  })

  it('een actief AOW-event en een expliciete woonconfig tellen', () => {
    const facts = buildPlanReviewFacts({
      events: [{ event_type: 'aow', is_active: true }],
      assets: [{ asset_type: 'eigen_huis', is_active: true }],
      housingStrategyRaw: { mode: 'exclude_from_fire' },
    })
    expect(facts.hasAowEvent).toBe(true)
    expect(facts.hasEigenHuis).toBe(true)
    expect(facts.housingConfigured).toBe(true)
  })
})
