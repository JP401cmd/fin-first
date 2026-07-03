/**
 * Horizon-kernel adapter — FASE 4 instellingen-datalaag (V4/V5/V7/V8).
 *
 * Diff-test-stijl: elk nieuw instelveld ABSENT → bestaand gedrag byte-identiek
 * (Excel-default); PRESENT → doorgegeven aan het juiste kern-parameterblok. Geen
 * fixtures (buiten het Excel-parity-domein).
 */

import { describe, it, expect } from 'vitest'
import {
  parseWithdrawalProfileConfig,
} from '@/lib/withdrawal-strategy'
import { resolvePotRules, sanitizeCategoriePrios } from '@/lib/pot-rules'
import { parseHousingStrategy, type DownsizeConfig, type ReverseMortgageConfig } from '@/lib/housing-strategy'
import {
  buildOnttrekkingsprofiel,
  buildWoning,
  resolveDeficitLoanRate,
  buildTsParams,
  type KernelAdapterProfile,
} from './index'
import {
  EXCEL_FASE_CURVE,
  EXCEL_TEKORT_LENING_RENTE,
  EXCEL_WONING_DEFAULTS,
} from './defaults'
import type { AssetPot, DebtPot } from '../types'

function profile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
  return { date_of_birth: '1980-01-01', ...over }
}

// ── V4 — onttrekkingsprofiel-curve ────────────────────────────────────────────────

describe('V4 — withdrawal_profile_config', () => {
  it('parse: NULL/afwezig → null', () => {
    expect(parseWithdrawalProfileConfig({ withdrawal_profile_config: null })).toBeNull()
    expect(parseWithdrawalProfileConfig({})).toBeNull()
    expect(parseWithdrawalProfileConfig(undefined)).toBeNull()
  })

  it('afwezig → curve byte-identiek aan Excel-defaults', () => {
    const p = buildOnttrekkingsprofiel(profile())
    expect(p.fase1TotLeeftijd).toBe(EXCEL_FASE_CURVE.fase1TotLeeftijd)
    expect(p.factor1Pct).toBe(EXCEL_FASE_CURVE.factor1Pct)
    expect(p.fase2TotLeeftijd).toBe(EXCEL_FASE_CURVE.fase2TotLeeftijd)
    expect(p.factor2Pct).toBe(EXCEL_FASE_CURVE.factor2Pct)
    expect(p.factor3Pct).toBe(EXCEL_FASE_CURVE.factor3Pct)
  })

  it('aanwezig → doorgegeven aan onttrekkingsprofiel', () => {
    const p = buildOnttrekkingsprofiel(
      profile({
        withdrawal_profile_config: {
          gogo_tot_leeftijd: 70,
          gogo_pct: 110,
          slowgo_tot_leeftijd: 80,
          slowgo_pct: 90,
          nogo_pct: 60,
        },
      }),
    )
    expect(p.fase1TotLeeftijd).toBe(70)
    expect(p.factor1Pct).toBe(110)
    expect(p.fase2TotLeeftijd).toBe(80)
    expect(p.factor2Pct).toBe(90)
    expect(p.factor3Pct).toBe(60)
  })

  it('partieel → per veld terug op Excel-default', () => {
    const p = buildOnttrekkingsprofiel(
      profile({ withdrawal_profile_config: { gogo_tot_leeftijd: 72 } }),
    )
    expect(p.fase1TotLeeftijd).toBe(72)
    expect(p.factor1Pct).toBe(EXCEL_FASE_CURVE.factor1Pct)
    expect(p.factor3Pct).toBe(EXCEL_FASE_CURVE.factor3Pct)
  })
})

// ── V4 — profiel-voorrang (F4) ─────────────────────────────────────────────────────

describe('V4 — withdrawal_profile_config.profiel', () => {
  it('parse: geldig profiel doorgelaten, ongeldig/afwezig → null', () => {
    expect(parseWithdrawalProfileConfig({ withdrawal_profile_config: { profiel: 'afnemend' } })?.profiel).toBe('afnemend')
    expect(parseWithdrawalProfileConfig({ withdrawal_profile_config: { profiel: 'onzin' } })?.profiel).toBeNull()
    expect(parseWithdrawalProfileConfig({ withdrawal_profile_config: { gogo_pct: 90 } })?.profiel).toBeNull()
  })

  it('zonder profiel → enum-mapping (static → Vast), byte-identiek', () => {
    expect(buildOnttrekkingsprofiel(profile({ withdrawal_strategy: 'static' })).profiel).toBe('Vast')
    // Curve-config zonder profiel wijzigt de selector niet.
    expect(
      buildOnttrekkingsprofiel(
        profile({ withdrawal_strategy: 'static', withdrawal_profile_config: { gogo_pct: 90 } }),
      ).profiel,
    ).toBe('Vast')
  })

  it('profiel wint van enum: guardrails-enum + profiel=afnemend → Afnemend', () => {
    const p = buildOnttrekkingsprofiel(
      profile({ withdrawal_strategy: 'guardrails', withdrawal_profile_config: { profiel: 'afnemend' } }),
    )
    expect(p.profiel).toBe('Afnemend')
  })

  it('elk profiel → juiste kern-selector', () => {
    const cases: [string, string][] = [
      ['vast', 'Vast'],
      ['afnemend', 'Afnemend'],
      ['oplopend', 'Oplopend'],
      ['guardrails', 'Guardrails'],
    ]
    for (const [profiel, expected] of cases) {
      expect(
        buildOnttrekkingsprofiel(profile({ withdrawal_profile_config: { profiel } })).profiel,
      ).toBe(expected)
    }
  })
})

// ── V7 — tekort-lening-rente ──────────────────────────────────────────────────────

describe('V7 — deficit_loan_rate', () => {
  it('afwezig/NULL → Excel-default', () => {
    expect(resolveDeficitLoanRate(profile())).toBe(EXCEL_TEKORT_LENING_RENTE)
    expect(resolveDeficitLoanRate(profile({ deficit_loan_rate: null }))).toBe(EXCEL_TEKORT_LENING_RENTE)
  })

  it('geldige waarde 0..1 → gebruikt', () => {
    expect(resolveDeficitLoanRate(profile({ deficit_loan_rate: 0.08 }))).toBe(0.08)
    expect(resolveDeficitLoanRate(profile({ deficit_loan_rate: 0 }))).toBe(0)
  })

  it('ongeldige waarde (>1 / NaN) → default', () => {
    expect(resolveDeficitLoanRate(profile({ deficit_loan_rate: 5 }))).toBe(EXCEL_TEKORT_LENING_RENTE)
    expect(resolveDeficitLoanRate(profile({ deficit_loan_rate: Number.NaN }))).toBe(EXCEL_TEKORT_LENING_RENTE)
  })
})

// ── V8 — woning fallbackAge ───────────────────────────────────────────────────────

describe('V8 — housing fallbackAge', () => {
  const downsizeBase = {
    mode: 'downsize' as const,
    trigger: 'on_depletion' as const,
    triggerAge: 68,
    depletionThresholdYears: 0,
    salePricePct: 1,
    salesCostsPct: 0.04,
    newMonthlyHousingCost: null,
  }

  it('parse: fallbackAge (camelCase) doorgelaten', () => {
    const cfg = parseHousingStrategy({ ...downsizeBase, fallbackAge: 82 }) as DownsizeConfig
    expect(cfg.fallbackAge).toBe(82)
  })

  it('parse: fallback_age (snake) tolerant geaccepteerd', () => {
    const cfg = parseHousingStrategy({ ...downsizeBase, fallback_age: 79 }) as DownsizeConfig
    expect(cfg.fallbackAge).toBe(79)
  })

  it('afwezig (on_depletion) → verkoopleeftijd = Excel-fallback (75), NIET triggerAge', () => {
    // Bugfix: on_depletion zonder fallbackAge mag niet op de app-triggerAge (68)
    // vallen — dat forceerde een harde verkoop op 68 ongeacht FIRE. Nu Excel-default 75.
    const w = buildWoning({ ...downsizeBase })
    expect(w.verkoopleeftijd).toBe(EXCEL_WONING_DEFAULTS.verkoopleeftijd)
    expect(w.verkoopleeftijd).toBe(75)
  })

  it('aanwezig (on_depletion) → verkoopleeftijd = fallbackAge', () => {
    const w = buildWoning({ ...downsizeBase, fallbackAge: 82 })
    expect(w.verkoopleeftijd).toBe(82)
  })

  it('at_age (fixed_age) → verkoopleeftijd = triggerAge (ongewijzigd)', () => {
    const w = buildWoning({ ...downsizeBase, trigger: 'fixed_age' })
    expect(w.verkoopleeftijd).toBe(68)
  })

  it('reverse_mortgage on_depletion ZONDER fallbackAge → opeetStart = triggerAge (geen gedragswijziging)', () => {
    const rm = {
      mode: 'reverse_mortgage' as const,
      trigger: 'on_depletion' as const,
      triggerAge: 67,
      depletionThresholdYears: 0,
      maxLoanPct: 0.5,
      interestRate: 0.055,
      monthlyPayout: null,
    }
    const w = buildWoning(rm as ReverseMortgageConfig)
    expect(w.opeetStartleeftijdOpname).toBe(67)
  })

  it('reverse_mortgage on_depletion → opeetStart = fallbackAge', () => {
    const rm = {
      mode: 'reverse_mortgage' as const,
      trigger: 'on_depletion' as const,
      triggerAge: 67,
      depletionThresholdYears: 0,
      maxLoanPct: 0.5,
      interestRate: 0.055,
      monthlyPayout: null,
      fallbackAge: 80,
    }
    const w = buildWoning(rm as ReverseMortgageConfig)
    expect(w.opeetStartleeftijdOpname).toBe(80)
  })

  it('fixed_age → fallbackAge genegeerd (verkoopleeftijd = triggerAge)', () => {
    const w = buildWoning({ ...downsizeBase, trigger: 'fixed_age', fallbackAge: 82 })
    expect(w.verkoopleeftijd).toBe(68)
  })

  it('leeg → base-defaults ongemoeid (Excel-verkoopleeftijd)', () => {
    const w = buildWoning({ mode: 'include_full' })
    expect(w.verkoopleeftijd).toBe(EXCEL_WONING_DEFAULTS.verkoopleeftijd)
  })
})

// ── V5 — categorie_prios overlay ──────────────────────────────────────────────────

describe('V5 — categorie_prios overlay op TsParams', () => {
  const emptyAssets: AssetPot[] = []
  const emptyDebts: DebtPot[] = []

  it('sanitize: prio buiten 1..5 weggelaten; leeg → undefined (categorie-agnostisch)', () => {
    expect(sanitizeCategoriePrios(undefined)).toBeUndefined()
    expect(sanitizeCategoriePrios({ toename: { Spaargeld: 9 } })).toBeUndefined()
    // Onbekende categorie 'X' met geldige prio blijft hier staan (pot-rules kent het
    // vocabulaire niet); de adapter-overlay dropt 'm — zie de overlay-test hieronder.
    expect(sanitizeCategoriePrios({ toename: { Spaargeld: 2, X: 1 } })).toEqual({
      toename: { Spaargeld: 2, X: 1 },
    })
  })

  it('overlay: onbekende categorie X genegeerd, alleen bezit-labels toegepast', () => {
    const cfg = resolvePotRules({
      pot_rules: { categorie_prios: { onttrekking: { Beleggingen: 1, X: 2 } } },
    })
    const ts = buildTsParams(cfg, emptyAssets, emptyDebts, true)
    expect(ts.bezitCategorien.find((c) => c.categorie === 'Beleggingen')!.prioOnttrekking).toBe(1)
    // 'X' verschijnt nergens in de bezit-categorieën (6 vaste labels).
    expect(ts.bezitCategorien).toHaveLength(6)
  })

  it('afwezig → TsParams byte-identiek aan orde-groep-afleiding', () => {
    const withoutPrios = resolvePotRules({ pot_rules: {} })
    const ts = buildTsParams(withoutPrios, emptyAssets, emptyDebts, true)
    // Default: Eigen huis = reserve (5); overige bezit actief (≤4).
    const huis = ts.bezitCategorien.find((c) => c.categorie === 'Eigen huis')!
    expect(huis.prioOnttrekking).toBe(5)
  })

  it('aanwezig → expliciete prio doorgegeven per bezit-categorie', () => {
    const cfg = resolvePotRules({
      pot_rules: {
        categorie_prios: {
          onttrekking: { Beleggingen: 1, Spaargeld: 3, 'Eigen huis': 5 },
          toename: { Spaargeld: 1 },
          afname: { Vastgoed: 2 },
        },
      },
    })
    const ts = buildTsParams(cfg, emptyAssets, emptyDebts, true)
    const beleggingen = ts.bezitCategorien.find((c) => c.categorie === 'Beleggingen')!
    const spaargeld = ts.bezitCategorien.find((c) => c.categorie === 'Spaargeld')!
    const vastgoed = ts.bezitCategorien.find((c) => c.categorie === 'Vastgoed')!
    expect(beleggingen.prioOnttrekking).toBe(1)
    expect(spaargeld.prioOnttrekking).toBe(3)
    expect(spaargeld.prioToename).toBe(1)
    expect(vastgoed.prioAfname).toBe(2)
  })
})
