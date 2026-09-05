import { describe, it, expect } from 'vitest'
import { resolveOnboardingPlanColumns } from './onboarding-plan'
import {
  END_AGE_MAX,
  END_AGE_MIN,
  LEGACY_PENSIOEN_END_AGE,
  STOP_AGE_MAX,
  STOP_AGE_MIN,
  validateStopAnchorInput,
  stopAgeConflictsWithEndAge,
} from './fire-strategy'
import * as planDraft from './horizon/plan-draft'

describe('plan-grenzen — één bron (lib/fire-strategy)', () => {
  it('END_AGE_MIN is 60: spiegel van profiles_fire_end_age_check (60..120), geen migratie', () => {
    // De live DB-CHECK is `fire_end_age BETWEEN 60 AND 120` (pg_constraint, 5 sep 2026).
    // Een lagere client-/route-grens zou een geldige invoer in een 23514 laten eindigen.
    expect(END_AGE_MIN).toBe(60)
    expect(END_AGE_MAX).toBe(120)
    expect(STOP_AGE_MIN).toBe(18)
    expect(STOP_AGE_MAX).toBe(100)
  })

  it('plan-draft re-exporteert dezelfde waarden (geen tweede grens voor de client)', () => {
    expect(planDraft.END_AGE_MIN).toBe(END_AGE_MIN)
    expect(planDraft.END_AGE_MAX).toBe(END_AGE_MAX)
    expect(planDraft.STOP_AGE_MIN).toBe(STOP_AGE_MIN)
    expect(planDraft.STOP_AGE_MAX).toBe(STOP_AGE_MAX)
  })
})

/**
 * Het plan uit de onboarding → de plan-kolommen (ADR 0129, stap "Jouw plan").
 * Gedragstests van de mapping die `POST /api/onboarding/save-own-data` gebruikt;
 * de route zelf wordt in `route.test.ts` alleen op bronvorm gepind.
 */
describe('resolveOnboardingPlanColumns — eind-vorm + anker uit horizonData', () => {
  it('nieuwe stap: solved × deplete zonder ankervelden (oude client) → solved, geen stopleeftijd', () => {
    expect(resolveOnboardingPlanColumns({ strategy: 'deplete', endAge: 90 })).toEqual({
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_stop_anchor: 'solved',
      fire_stop_age: null,
    })
  })

  it('aow × legacy — de combinatie die de oude enum niet kon uitdrukken', () => {
    expect(
      resolveOnboardingPlanColumns({ strategy: 'legacy', anchor: 'aow', stopAge: null, endAge: 95 }),
    ).toEqual({ fire_end_strategy: 'legacy', fire_end_age: 95, fire_stop_anchor: 'aow', fire_stop_age: null })
  })

  it('age × perpetual met halve stopleeftijd', () => {
    expect(
      resolveOnboardingPlanColumns({ strategy: 'perpetual', anchor: 'age', stopAge: 58.5, endAge: 90 }),
    ).toEqual({ fire_end_strategy: 'perpetual', fire_end_age: 90, fire_stop_anchor: 'age', fire_stop_age: 58.5 })
  })

  it("legacy-label 'pensioen' zonder anker → deplete + aow, eindleeftijd 100 (D6/M1-spiegel van de backfill), niet de 90-default", () => {
    // Een oude draft toonde geen eindleeftijd-veld: de 90 is nooit een keuze geweest.
    expect(LEGACY_PENSIOEN_END_AGE).toBe(100)
    expect(resolveOnboardingPlanColumns({ strategy: 'pensioen', endAge: 90 })).toEqual({
      fire_end_strategy: 'deplete',
      fire_end_age: 100,
      fire_stop_anchor: 'aow',
      fire_stop_age: null,
    })
  })

  it("legacy-label 'nu-stoppen' zonder anker → deplete + now, met de meegegeven eindleeftijd", () => {
    expect(resolveOnboardingPlanColumns({ strategy: 'nu-stoppen', endAge: 88 })).toEqual({
      fire_end_strategy: 'deplete',
      fire_end_age: 88,
      fire_stop_anchor: 'now',
      fire_stop_age: null,
    })
  })

  it('legacy-label náást een expliciet anker — óók een "bevestigend" aow — → fout (letterlijke spiegel van R2 in /api/fire-settings)', () => {
    const bevestigend = resolveOnboardingPlanColumns({ strategy: 'pensioen', anchor: 'aow', stopAge: null, endAge: 90 })
    expect((bevestigend as { error: string }).error).toMatch(/draagt zelf al een anker/)
    const anders = resolveOnboardingPlanColumns({ strategy: 'pensioen', anchor: 'age', stopAge: 58, endAge: 90 })
    expect((anders as { error: string }).error).toMatch(/draagt zelf al een anker/)
  })

  it('age zonder stopleeftijd → fout (age ⟺ leeftijd aanwezig)', () => {
    const r = resolveOnboardingPlanColumns({ strategy: 'deplete', anchor: 'age', stopAge: null, endAge: 90 })
    expect(r).toHaveProperty('error')
  })

  it('stopleeftijd op of voorbij de eindleeftijd → fout (B7)', () => {
    const r = resolveOnboardingPlanColumns({ strategy: 'deplete', anchor: 'age', stopAge: 90, endAge: 90 })
    expect((r as { error: string }).error).toMatch(/vóór de eindleeftijd/)
  })

  it('stopleeftijd buiten halve jaren → fout, geen stille afronding', () => {
    const r = resolveOnboardingPlanColumns({ strategy: 'deplete', anchor: 'age', stopAge: 58.3, endAge: 90 })
    expect((r as { error: string }).error).toMatch(/half jaar/)
  })

  it('stopleeftijd onder een ander anker dan age → fout', () => {
    const r = resolveOnboardingPlanColumns({ strategy: 'deplete', anchor: 'solved', stopAge: 60, endAge: 90 })
    expect((r as { error: string }).error).toMatch(/hoort alleen bij het anker/)
  })

  it('een onbekende strategie vouwt naar deplete (spiegel van parseFirePlan)', () => {
    const r = resolveOnboardingPlanColumns({ strategy: 'onzin', endAge: 90 })
    expect(r).toMatchObject({ fire_end_strategy: 'deplete', fire_stop_anchor: 'solved' })
  })
})

describe('validateStopAnchorInput — de gedeelde schrijftoets (fire-settings + onboarding)', () => {
  it('accepteert de vier ankers en eist een stopleeftijd alleen bij age', () => {
    expect(validateStopAnchorInput('solved', null)).toEqual({ anchor: 'solved', stopAge: null })
    expect(validateStopAnchorInput('aow', undefined)).toEqual({ anchor: 'aow', stopAge: null })
    expect(validateStopAnchorInput('now', null)).toEqual({ anchor: 'now', stopAge: null })
    expect(validateStopAnchorInput('age', '62.5')).toEqual({ anchor: 'age', stopAge: 62.5 })
  })

  it('wijst ongeldige ankers, halve-jaar-schendingen en grenzen af', () => {
    expect(validateStopAnchorInput('vandaag', null)).toHaveProperty('error')
    expect(validateStopAnchorInput('age', 58.3)).toHaveProperty('error')
    expect(validateStopAnchorInput('age', 17.5)).toHaveProperty('error')
    expect(validateStopAnchorInput('age', 100.5)).toHaveProperty('error')
    expect(validateStopAnchorInput('aow', 67)).toHaveProperty('error')
  })

  it('B7: stopleeftijd < eindleeftijd, alleen onder age', () => {
    expect(stopAgeConflictsWithEndAge({ anchor: 'age', stopAge: 90 }, 90)).toBe(true)
    expect(stopAgeConflictsWithEndAge({ anchor: 'age', stopAge: 89.5 }, 90)).toBe(false)
    expect(stopAgeConflictsWithEndAge({ anchor: 'aow', stopAge: null }, 60)).toBe(false)
  })
})
