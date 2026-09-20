import { describe, expect, it } from 'vitest'
import { patchNalatenschap, withResolvedKernelBedragen } from './kernel-profile-basis'
import { resolveFirePlanWithOverride } from '@/lib/fire-strategy'

/**
 * `patchNalatenschap` (ADR 0170) — de ene helper waarmee de grenzen-batch én de scenario-run
 * een profielrij op eind-vorm nalatenschap zetten. De tests pinnen precies de twee valkuilen
 * die een kale `{ fire_end_strategy: 'legacy', fire_legacy_amount }` had: de strategie-override
 * in `feature_preferences` en het oude ankerlabel in `fire_end_strategy` (ADR 0129 D2).
 */

describe('patchNalatenschap', () => {
  it('deplete → legacy met het bedrag; anker en overige velden ongemoeid', () => {
    const row = { fire_end_strategy: 'deplete', fire_end_age: 90, fire_legacy_amount: 0, fire_stop_anchor: 'age', fire_stop_age: 62, net_monthly_income: 4000 }
    const out = patchNalatenschap(row, 150_000)
    expect(out).toEqual({ ...row, fire_end_strategy: 'legacy', fire_legacy_amount: 150_000 })
    expect(row.fire_end_strategy).toBe('deplete') // kopie, geen mutatie
    const plan = resolveFirePlanWithOverride(out)
    expect(plan.endForm).toBe('legacy')
    expect(plan.legacyAmount).toBe(150_000)
    expect(plan.anchor).toEqual({ kind: 'age', age: 62 })
  })

  it("stript feature_preferences.fire_strategy_override (kopie) en laat andere prefs staan", () => {
    const row = {
      fire_end_strategy: 'deplete',
      fire_legacy_amount: 0,
      fire_stop_anchor: 'solved',
      feature_preferences: { fire_strategy_override: 'perpetual', ander: true },
    }
    const out = patchNalatenschap(row, 50_000)
    expect(out.feature_preferences).toEqual({ ander: true })
    expect(row.feature_preferences).toEqual({ fire_strategy_override: 'perpetual', ander: true })
    expect(resolveFirePlanWithOverride(out).endForm).toBe('legacy')
  })

  it("legacy-label 'pensioen' in de kolom → eind-vorm legacy, anker blijft AOW", () => {
    const row = { fire_end_strategy: 'pensioen', fire_legacy_amount: 0, fire_stop_anchor: 'solved' }
    // Zonder de helper: het anker komt uit het label (D2)...
    expect(resolveFirePlanWithOverride(row).anchor).toEqual({ kind: 'aow' })
    // ...een kale overschrijving zou het stil naar 'solved' laten terugvallen:
    expect(resolveFirePlanWithOverride({ ...row, fire_end_strategy: 'legacy' }).anchor).toEqual({ kind: 'solved' })
    // De helper draagt het anker over naar de nieuwe kolom.
    const out = patchNalatenschap(row, 20_000)
    expect(out.fire_stop_anchor).toBe('aow')
    expect(resolveFirePlanWithOverride(out)).toMatchObject({ endForm: 'legacy', legacyAmount: 20_000, anchor: { kind: 'aow' } })
  })

  it("legacy-label 'nu-stoppen' → anker 'now'", () => {
    const out = patchNalatenschap({ fire_end_strategy: 'nu-stoppen', fire_stop_anchor: 'solved' }, 0)
    expect(out.fire_stop_anchor).toBe('now')
    expect(resolveFirePlanWithOverride(out).anchor).toEqual({ kind: 'now' })
  })

  it("een via de override GEPARKEERD pensioen-anker (kolom 'deplete') blijft ook staan", () => {
    const row = {
      fire_end_strategy: 'deplete',
      fire_stop_anchor: 'solved',
      feature_preferences: { fire_strategy_override: 'pensioen' },
    }
    expect(resolveFirePlanWithOverride(row).anchor).toEqual({ kind: 'aow' })
    const out = patchNalatenschap(row, 10_000)
    expect(out.feature_preferences).toEqual({})
    expect(resolveFirePlanWithOverride(out)).toMatchObject({ endForm: 'legacy', anchor: { kind: 'aow' } })
  })

  it('is idempotent', () => {
    const row = { fire_end_strategy: 'pensioen', fire_legacy_amount: 0, fire_stop_anchor: 'solved', feature_preferences: { fire_strategy_override: 'pensioen', x: 1 } }
    const eens = patchNalatenschap(row, 30_000)
    const twee = patchNalatenschap(eens, 30_000)
    expect(twee).toEqual(eens)
  })

  it('werkt samen met withResolvedKernelBedragen (in beide volgordes gelijk)', () => {
    const row = { fire_end_strategy: 'deplete', fire_legacy_amount: 0, net_monthly_income: 0, estimated_monthly_expenses: 0 }
    const eff = { monthlyIncome: 4200, monthlyExpenses: 2600 }
    const a = patchNalatenschap(withResolvedKernelBedragen(row, eff), 80_000)
    const b = withResolvedKernelBedragen(patchNalatenschap(row, 80_000), eff)
    expect(a).toEqual(b)
    expect(a).toMatchObject({ fire_end_strategy: 'legacy', fire_legacy_amount: 80_000, net_monthly_income: 4200, estimated_monthly_expenses: 2600 })
  })
})
