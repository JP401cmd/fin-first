import { describe, it, expect } from 'vitest'
import {
  STOP_ANCHOR_OPTIONS,
  STOP_ANCHOR_QUESTION,
  END_FORM_OPTIONS,
  END_FORM_QUESTION,
  END_AGE_QUESTION,
  END_REMAINDER_QUESTION,
  PERPETUAL_NO_END_AGE_NOTE,
  defaultStopAge,
  planDraftEquals,
  planDraftFromPlan,
  planDraftFromSettings,
  planDraftToFireSettingsBody,
  validatePlanDraft,
  type PlanDraft,
  withEndForm,
} from './plan-draft'

const basis: PlanDraft = { anchor: 'solved', stopAge: null, endForm: 'deplete', endAge: 90, legacyAmount: 0 }

// Kopij herzien 5 sep 2026 (eigenaar-besluit, bijlage ADR 0129 "Herzien"): gewone
// taal op alle oppervlakken — 'Zo vroeg als het kan' i.p.v. 'Laat de app het
// uitrekenen', en vraag 2 als "tot welke leeftijd, en wat blijft er over" met
// expliciete tegelteksten i.p.v. de vaktermen uit STRATEGY_LABELS.
describe('plan-draft — de twee vragen dragen de ADR 0129-kopij (herzien 5 sep 2026)', () => {
  it('vraag 1 heeft precies de vier ankers in ADR-volgorde met de vastgestelde zinnen', () => {
    expect(STOP_ANCHOR_QUESTION).toBe('Wanneer wil je stoppen met werken?')
    expect(STOP_ANCHOR_OPTIONS.map((o) => o.kind)).toEqual(['solved', 'aow', 'age', 'now'])
    expect(STOP_ANCHOR_OPTIONS.map((o) => o.name)).toEqual([
      'Zo vroeg als het kan',
      'Op mijn AOW-leeftijd',
      'Op een leeftijd die ik kies',
      'Nu',
    ])
    expect(STOP_ANCHOR_OPTIONS.find((o) => o.kind === 'solved')?.subtitle).toBe(
      'De app rekent uit vanaf welke leeftijd werken een keuze wordt.',
    )
    expect(STOP_ANCHOR_OPTIONS.find((o) => o.kind === 'now')?.subtitle).toBe('Je rekent alsof je vandaag stopt.')
  })

  it('vraag 2 is "tot welke leeftijd, en wat blijft er over" met de drie eind-vormen in gewone taal', () => {
    expect(END_FORM_QUESTION).toBe('Tot welke leeftijd moet je geld reiken, en wat moet er dan nog over zijn?')
    expect(END_AGE_QUESTION).toBe('Tot welke leeftijd moet je geld reiken?')
    expect(END_REMAINDER_QUESTION).toBe('Wat moet er dan nog over zijn?')
    expect(END_FORM_OPTIONS.map((o) => o.form)).toEqual(['deplete', 'legacy', 'perpetual'])
    expect(END_FORM_OPTIONS.map((o) => o.name)).toEqual([
      'Niets, het mag op zijn',
      'Een bedrag voor later of voor anderen',
      'Mijn vermogen mag niet slinken',
    ])
    expect(PERPETUAL_NO_END_AGE_NOTE).toBe(
      'Dan rekent de app zonder eindleeftijd: je leeft van wat je vermogen oplevert.',
    )
  })

  it('toon-invariant: geen aansporing, geen "oneindig", geen hardcoded AOW-leeftijd in de kopij', () => {
    const alleTeksten = [
      ...STOP_ANCHOR_OPTIONS.flatMap((o) => [o.name, o.subtitle]),
      ...END_FORM_OPTIONS.flatMap((o) => [o.name, o.subtitle]),
      PERPETUAL_NO_END_AGE_NOTE,
    ]
    for (const t of alleTeksten) {
      expect(t).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
      expect(t).not.toMatch(/oneindig|voorgoed|voor altijd|eeuwig/i)
      expect(t).not.toMatch(/\b67\b/)
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

  it('legacy eist een bedrag boven nul (spiegel van de onboarding-route positive()); eindleeftijd buiten 60–120', () => {
    expect(validatePlanDraft({ ...basis, endForm: 'legacy', legacyAmount: -1 }).errors.legacyAmount).toBe('Een bedrag boven nul.')
    // Nul is per definitie de eind-vorm `deplete`, geen "bedrag dat over moet blijven".
    expect(validatePlanDraft({ ...basis, endForm: 'legacy', legacyAmount: 0 }).errors.legacyAmount).toBe('Een bedrag boven nul.')
    expect(validatePlanDraft({ ...basis, endForm: 'legacy', legacyAmount: 1 }).ok).toBe(true)
    expect(validatePlanDraft({ ...basis, endAge: 40 }).errors.endAge).toBeDefined()
    // 55 lag vóór 5 sep 2026 binnen de client-grens (50) maar buiten de DB-CHECK (60).
    expect(validatePlanDraft({ ...basis, endAge: 55 }).errors.endAge).toBe('Tussen 60 en 120 jaar.')
    expect(validatePlanDraft({ ...basis, endAge: 60 }).ok).toBe(true)
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

describe('withEndForm — perpetual zet de verborgen eindleeftijd op 100 (eigenaar-besluit 5 sep 2026)', () => {
  it('perpetual → eindleeftijd 100, zodat de B7-toets niet naar een onzichtbare 90 verwijst', () => {
    const next = withEndForm({ ...basis, endForm: 'deplete', endAge: 90 }, 'perpetual')
    expect(next).toMatchObject({ endForm: 'perpetual', endAge: 100 })
    // Stopleeftijd 92 was onder deplete/90 een B7-fout; onder perpetual/100 niet meer.
    expect(validatePlanDraft({ ...next, anchor: 'age', stopAge: 92 }).ok).toBe(true)
  })
  it('terug van perpetual naar een vorm mét eindleeftijd herstelt de standaard (90)', () => {
    const perpetual = withEndForm({ ...basis, endForm: 'deplete', endAge: 90 }, 'perpetual')
    expect(withEndForm(perpetual, 'deplete')).toMatchObject({ endForm: 'deplete', endAge: 90 })
    expect(withEndForm(perpetual, 'legacy')).toMatchObject({ endForm: 'legacy', endAge: 90 })
  })
  it('een zelf gekozen eindleeftijd blijft staan bij een wissel tussen deplete en legacy', () => {
    expect(withEndForm({ ...basis, endForm: 'deplete', endAge: 85 }, 'legacy').endAge).toBe(85)
  })
})
