import { describe, it, expect } from 'vitest'
import {
  STOP_ANCHOR_OPTIONS,
  END_FORM_OPTIONS,
  defaultStopAge,
  planDraftEquals,
  planDraftFromPlan,
  planDraftFromSettings,
  planDraftToFireSettingsBody,
  validatePlanDraft,
  type PlanDraft,
} from './plan-draft'

const basis: PlanDraft = { anchor: 'solved', stopAge: null, endForm: 'deplete', endAge: 90, legacyAmount: 0 }

describe('plan-draft — de twee vragen dragen de ADR 0129-kopij', () => {
  it('vraag 1 heeft precies de vier ankers in ADR-volgorde met de vastgestelde zinnen', () => {
    expect(STOP_ANCHOR_OPTIONS.map((o) => o.kind)).toEqual(['solved', 'aow', 'age', 'now'])
    expect(STOP_ANCHOR_OPTIONS.map((o) => o.name)).toEqual([
      'Laat de app het uitrekenen',
      'Op mijn AOW-leeftijd',
      'Op een leeftijd die ik kies',
      'Nu',
    ])
    expect(STOP_ANCHOR_OPTIONS.find((o) => o.kind === 'now')?.subtitle).toBe('Je rekent alsof je vandaag stopt.')
  })

  it('vraag 2 heeft de drie eind-vormen en geen enkel anker (pensioen/nu-stoppen komen niet voor)', () => {
    expect(END_FORM_OPTIONS.map((o) => o.form)).toEqual(['deplete', 'legacy', 'perpetual'])
    expect(END_FORM_OPTIONS.map((o) => o.name)).toEqual(['Vermogen opeten', 'Nalatenschap', 'Eeuwigdurend'])
  })

  it('toon-invariant: geen aansporing of AOW-tekort in de ondertitels', () => {
    for (const o of STOP_ANCHOR_OPTIONS) {
      expect(o.subtitle).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
      expect(o.subtitle).not.toMatch(/oneindig|voorgoed|voor altijd/i)
    }
  })
})

describe('planDraftFromSettings — leest beide rijvormen, legacy-label wint (D2)', () => {
  it("'pensioen' in de oude kolom → anker aow, eind-vorm deplete", () => {
    const d = planDraftFromSettings({ fire_end_strategy: 'pensioen', fire_end_age: 100, fire_stop_anchor: 'age', fire_stop_age: 58 })
    expect(d.anchor).toBe('aow')
    expect(d.endForm).toBe('deplete')
    expect(d.endAge).toBe(100)
    expect(d.stopAge).toBeNull()
  })

  it('nieuwe rij: age × legacy met halve stopleeftijd', () => {
    const d = planDraftFromSettings({ fire_end_strategy: 'legacy', fire_end_age: 90, fire_legacy_amount: '100000', fire_stop_anchor: 'age', fire_stop_age: '58.5' })
    expect(d).toEqual({ anchor: 'age', stopAge: 58.5, endForm: 'legacy', endAge: 90, legacyAmount: 100000 })
  })

  it("age zonder leeftijd valt terug op solved — geen rij spreekt zichzelf tegen", () => {
    expect(planDraftFromSettings({ fire_end_strategy: 'deplete', fire_stop_anchor: 'age' }).anchor).toBe('solved')
  })

  it('round-trip via FirePlan', () => {
    const d = planDraftFromPlan({ anchor: { kind: 'age', age: 62 }, endForm: 'perpetual', endAge: 95, legacyAmount: 0 })
    expect(d).toEqual({ anchor: 'age', stopAge: 62, endForm: 'perpetual', endAge: 95, legacyAmount: 0 })
  })
})

describe('validatePlanDraft — de twee toetsen die alleen de client kan doen', () => {
  it('aow: eindleeftijd op of onder de AOW-leeftijd is fout, de route kent de AOW niet', () => {
    const r = validatePlanDraft({ ...basis, anchor: 'aow', endAge: 67 }, { aowAge: 67.25 })
    expect(r.ok).toBe(false)
    expect(r.errors.endAge).toContain('67,3')
    expect(validatePlanDraft({ ...basis, anchor: 'aow', endAge: 90 }, { aowAge: 67.25 }).ok).toBe(true)
  })

  it('aow zonder bekende AOW-leeftijd: geen valse fout', () => {
    expect(validatePlanDraft({ ...basis, anchor: 'aow', endAge: 60 }, { aowAge: null }).ok).toBe(true)
  })

  it('age: stopleeftijd moet vóór de eindleeftijd liggen en in halve jaren lopen', () => {
    expect(validatePlanDraft({ ...basis, anchor: 'age', stopAge: 90 }).errors.stopAge).toMatch(/vóór de eindleeftijd/)
    expect(validatePlanDraft({ ...basis, anchor: 'age', stopAge: 58.3 }).errors.stopAge).toMatch(/half jaar/)
    expect(validatePlanDraft({ ...basis, anchor: 'age', stopAge: null }).errors.stopAge).toMatch(/Kies/)
    expect(validatePlanDraft({ ...basis, anchor: 'age', stopAge: 58.5 }).ok).toBe(true)
  })

  it('legacy zonder geldig bedrag; eindleeftijd buiten 50–120', () => {
    expect(validatePlanDraft({ ...basis, endForm: 'legacy', legacyAmount: -1 }).errors.legacyAmount).toBeDefined()
    expect(validatePlanDraft({ ...basis, endAge: 40 }).errors.endAge).toBeDefined()
  })
})

describe('planDraftToFireSettingsBody — altijd het volledige plan, nooit een legacy-label', () => {
  it('solved × deplete', () => {
    expect(planDraftToFireSettingsBody(basis)).toEqual({
      fire_end_strategy: 'deplete', fire_end_age: 90, fire_legacy_amount: null, fire_stop_anchor: 'solved', fire_stop_age: null,
    })
  })
  it('age × legacy draagt stopleeftijd én bedrag', () => {
    expect(planDraftToFireSettingsBody({ anchor: 'age', stopAge: 58.5, endForm: 'legacy', endAge: 90, legacyAmount: 50000 })).toEqual({
      fire_end_strategy: 'legacy', fire_end_age: 90, fire_legacy_amount: 50000, fire_stop_anchor: 'age', fire_stop_age: 58.5,
    })
  })
  it('aow stuurt de eind-vorm, geen "pensioen"', () => {
    const body = planDraftToFireSettingsBody({ ...basis, anchor: 'aow' })
    expect(body.fire_end_strategy).toBe('deplete')
    expect(body.fire_stop_anchor).toBe('aow')
    expect(body.fire_stop_age).toBeNull()
  })
})

describe('defaultStopAge + planDraftEquals', () => {
  it('kiest het opgeloste moment in halve jaren, geklemd vóór de eindleeftijd', () => {
    expect(defaultStopAge({ solvedFireAge: 57.3, endAge: 90 })).toBe(57.5)
    expect(defaultStopAge({ solvedFireAge: 99, endAge: 90 })).toBe(89.5)
    expect(defaultStopAge({ currentAge: 40, endAge: 90 })).toBe(45)
  })
  it('gelijkheid negeert irrelevante velden (stopAge buiten age, bedrag buiten legacy)', () => {
    expect(planDraftEquals(basis, { ...basis, stopAge: 60, legacyAmount: 5 })).toBe(true)
    expect(planDraftEquals(basis, { ...basis, anchor: 'now' })).toBe(false)
  })
})
