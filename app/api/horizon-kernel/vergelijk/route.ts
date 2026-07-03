import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { solveFire } from '@/lib/horizon-kernel'
import type { SolverStatus } from '@/lib/horizon-kernel/solver'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { loadKernelReportInput } from '@/lib/horizon-kernel-report/load-input'
import { readKernelFlags, type KernelFlags } from '@/lib/horizon-kernel/flag'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { ledgerToUnifiedResult } from '@/lib/horizon-engine/adapter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Horizon-kernel · beheer-transparantie — VERGELIJK (FASE 5, stap 2c).
 *
 * Superadmin-gegate, alleen-lezen. Draait op de EIGEN data BEIDE FIRE-motoren en
 * levert een compacte vergelijkings-payload:
 *   • v2-grootboek: `buildHorizonInput` (zelfde assemblage als /toekomst) →
 *     `runHorizonLedger` → `ledgerToUnifiedResult` (= wat `runSelectedProjection`
 *     intern doet; we lezen daarnaast de native ledger-rijen voor de per-jaar
 *     netto-liquide, die het `UnifiedProjectionResult`-contract niet meedraagt).
 *   • kernel: `loadKernelReportInput` → adapter → `solveFire` (Prognose!I/J).
 *
 * Consumeert uitsluitend bestaande engines/adapters/bridges — géén rekenwijziging.
 * Beide reeksen worden NOMINAAL vergeleken: de kernel is al nominaal (Prognose!I/J),
 * de v2-grootboek-engine rekent reëel en wordt met (1+inflatie)^jaar naar nominaal
 * getild (exact zoals `ledgerToUnifiedResult` dat voor `netWorth` doet).
 */

type KentalKind = 'age' | 'eur'

interface MotorKerngetal {
  readonly fireLeeftijd: number | null
  readonly requiredFirePortfolio: number
  readonly firePortfolioAtFire: number
  readonly eindNettoVermogen: number
  readonly eindNettoLiquide: number
  /** Alleen kernel. */
  readonly solverStatus?: SolverStatus
  /** Alleen kernel. */
  readonly tekortLeningPiek?: number
}

interface ReeksPunt {
  readonly age: number
  readonly v2Vermogen: number
  readonly v2Liquide: number
  readonly kernelVermogen: number
  readonly kernelLiquide: number
}

interface Kentaldelta {
  readonly key: string
  readonly label: string
  readonly kind: KentalKind
  readonly v2: number | null
  readonly kernel: number | null
  readonly absDelta: number | null
  readonly pctDelta: number | null
}

interface Reeksdelta {
  readonly key: 'vermogen' | 'liquide'
  readonly label: string
  readonly maxAbsDelta: number
  readonly meanAbsDelta: number
  readonly ageAtMax: number
}

export interface VergelijkResponse {
  readonly ok: boolean
  readonly reason?: string
  readonly eindLeeftijd?: number
  readonly v2?: MotorKerngetal
  readonly kernel?: MotorKerngetal
  readonly reeks?: ReeksPunt[]
  readonly kentalDeltas?: Kentaldelta[]
  readonly reeksDeltas?: Reeksdelta[]
  readonly badge?: {
    readonly fireLeeftijdDeltaJaar: number | null
    readonly eindVermogenAbs: number
    readonly eindVermogenPct: number | null
  }
  readonly flags?: KernelFlags
  readonly meta?: {
    readonly v2EndAge: number
    readonly kernelEndAge: number
    readonly v2Strategy: string
    readonly kernelStatus: SolverStatus
  }
}

const round = (n: number): number => Math.round(n)
/** Δ = kernel − v2 (signed); pct t.o.v. v2 (guard nul-noemer). */
function delta(v2: number | null, kernel: number | null): { absDelta: number | null; pctDelta: number | null } {
  if (v2 === null || kernel === null) return { absDelta: null, pctDelta: null }
  const absDelta = kernel - v2
  const pctDelta = Math.abs(v2) > 1e-9 ? (absDelta / Math.abs(v2)) * 100 : null
  return { absDelta, pctDelta }
}

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ ok: false, reason: 'Geen toegang' }, { status: 403 })
  }

  // ── Kernel-tak: eigen data → adapter → solveFire ────────────────────────────
  let kernelInput
  let solve
  try {
    const loaded = await loadKernelReportInput(supabase)
    kernelInput = buildKernelInputFromAppWithNotices(loaded.adapterInput).input
    solve = solveFire(kernelInput)
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reason: err instanceof Error ? err.message : 'Kon de kernel-invoer niet laden.',
    } satisfies VergelijkResponse)
  }

  // ── v2-tak: gedeelde assemblage (zelfde als /toekomst) → grootboek ──────────
  const horizonData = await loadHorizonData(supabase)
  const built = buildHorizonInput({
    horizonInput: horizonData.effectiveInput,
    lifeEvents: horizonData.events,
    fireStrategy: horizonData.fireStrategy,
    withdrawalStrategy: horizonData.withdrawalStrategy,
    grossReturn: horizonData.fireParams.grossReturn,
    inflation: horizonData.fireParams.inflationRate,
    assets: horizonData.assets,
    debts: horizonData.debts,
    box3Method: horizonData.box3Method,
    hasPartner: horizonData.hasPartner,
    bankAccountCash: horizonData.unlinkedCash,
    monthlySavingsOverride: horizonData.monthlySavingsOverride,
    baseAnnualSavingsFromCashflow: horizonData.baseAnnualSavingsFromCashflow,
    housingStrategy: horizonData.housingStrategy,
    potRules: horizonData.potRules,
    horizonEngineV2: true,
  })
  if (!built) {
    return NextResponse.json({
      ok: false,
      reason: 'Onvoldoende data voor de v2-grootboek-engine (geboortedatum of retirement-uitgaven ontbreken).',
    } satisfies VergelijkResponse)
  }
  const ledger = runHorizonLedger(built.input, built.strategyOptions)
  const v2Unified = ledgerToUnifiedResult(ledger, { yearlyExpenses: built.input.yearlyExpenses })
  const v2Inflatie = built.input.inflationRate

  // ── Reeksen per leeftijd (beide NOMINAAL) ───────────────────────────────────
  // Kernel: Prognose!I (netto vermogen) + Prognose!J (netto-liquide), per jaar-blok
  // gesampled op de laatste in-horizon-maand (zoals de kernel→unified-bridge).
  const prog = solve.projection.prognose
  const summary = solve.projection.summary
  const kernelStartAge = Math.round(kernelInput.startLeeftijd)
  const kernelByAge = new Map<number, { vermogen: number; liquide: number }>()
  const kLast = Math.floor(summary.lastInHorizonMonth / 12)
  for (let k = 0; k <= kLast; k++) {
    const monthEnd = Math.min(12 * k + 11, summary.lastInHorizonMonth)
    const row = prog[monthEnd]
    const vermogen = row && !row.beyondHorizon ? row.nettoVermogen : 0
    const liquide = row && !row.beyondHorizon ? row.nettoLiquide : 0
    kernelByAge.set(kernelStartAge + k, { vermogen, liquide })
  }

  // v2: native ledger-rij → nominaal via (1+inflatie)^jaar (netto vermogen = adapter-
  // `netWorth`; netto-liquide = `liquideVermogen` × factor, dezelfde reëel→nominaal-tilt).
  const v2ByAge = new Map<number, { vermogen: number; liquide: number }>()
  for (const r of ledger.rows) {
    const factor = Math.pow(1 + v2Inflatie, r.jaar)
    v2ByAge.set(Math.round(r.leeftijd), { vermogen: r.nettoVermogen * factor, liquide: r.liquideVermogen * factor })
  }

  const commonAges = [...kernelByAge.keys()].filter((a) => v2ByAge.has(a)).sort((a, b) => a - b)
  if (commonAges.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'De motoren delen geen enkel projectiejaar — vergelijken is niet mogelijk.',
    } satisfies VergelijkResponse)
  }

  const reeks: ReeksPunt[] = commonAges.map((age) => {
    const v = v2ByAge.get(age)!
    const kn = kernelByAge.get(age)!
    return {
      age,
      v2Vermogen: round(v.vermogen),
      v2Liquide: round(v.liquide),
      kernelVermogen: round(kn.vermogen),
      kernelLiquide: round(kn.liquide),
    }
  })

  const eindLeeftijd = commonAges[commonAges.length - 1]
  const eindV2 = v2ByAge.get(eindLeeftijd)!
  const eindKernel = kernelByAge.get(eindLeeftijd)!

  // ── Kerngetallen per motor ──────────────────────────────────────────────────
  const v2: MotorKerngetal = {
    fireLeeftijd: v2Unified.fireAgeFractional,
    requiredFirePortfolio: round(v2Unified.requiredFirePortfolio),
    firePortfolioAtFire: round(v2Unified.firePortfolioAtFire),
    eindNettoVermogen: round(eindV2.vermogen),
    eindNettoLiquide: round(eindV2.liquide),
  }
  const kernelFireReachable = solve.status !== 'unreachable_within_horizon'
  const kernelRequired = summary.nettoLiquideBijFire ?? summary.eindNettoLiquide
  const kernel: MotorKerngetal = {
    fireLeeftijd: kernelFireReachable ? solve.fireAge : null,
    requiredFirePortfolio: round(kernelRequired),
    firePortfolioAtFire: round(kernelRequired),
    eindNettoVermogen: round(eindKernel.vermogen),
    eindNettoLiquide: round(eindKernel.liquide),
    solverStatus: solve.status,
    tekortLeningPiek: round(summary.tekortLeningPiek),
  }

  // ── Kental-deltas ───────────────────────────────────────────────────────────
  const kentalBasis: ReadonlyArray<Omit<Kentaldelta, 'absDelta' | 'pctDelta'>> = [
    { key: 'fireLeeftijd', label: 'FIRE-leeftijd', kind: 'age', v2: v2.fireLeeftijd, kernel: kernel.fireLeeftijd },
    { key: 'requiredFirePortfolio', label: 'Benodigde FIRE-portefeuille', kind: 'eur', v2: v2.requiredFirePortfolio, kernel: kernel.requiredFirePortfolio },
    { key: 'firePortfolioAtFire', label: 'Portefeuille bij FIRE', kind: 'eur', v2: v2.firePortfolioAtFire, kernel: kernel.firePortfolioAtFire },
    { key: 'eindNettoVermogen', label: `Eindvermogen netto (leeftijd ${eindLeeftijd})`, kind: 'eur', v2: v2.eindNettoVermogen, kernel: kernel.eindNettoVermogen },
    { key: 'eindNettoLiquide', label: `Eindvermogen netto-liquide (leeftijd ${eindLeeftijd})`, kind: 'eur', v2: v2.eindNettoLiquide, kernel: kernel.eindNettoLiquide },
  ]
  const kentalDeltas: Kentaldelta[] = kentalBasis.map((d) => ({ ...d, ...delta(d.v2, d.kernel) }))

  // ── Reeks-deltas (max/gemiddeld |Δ| + leeftijd van het maximum) ─────────────
  const reeksDeltas: Reeksdelta[] = (['vermogen', 'liquide'] as const).map((key) => {
    let maxAbs = 0
    let ageAtMax = commonAges[0]
    let sumAbs = 0
    for (const p of reeks) {
      const d = key === 'vermogen'
        ? Math.abs(p.kernelVermogen - p.v2Vermogen)
        : Math.abs(p.kernelLiquide - p.v2Liquide)
      sumAbs += d
      if (d > maxAbs) {
        maxAbs = d
        ageAtMax = p.age
      }
    }
    return {
      key,
      label: key === 'vermogen' ? 'Netto vermogen' : 'Netto-liquide',
      maxAbsDelta: round(maxAbs),
      meanAbsDelta: round(sumAbs / reeks.length),
      ageAtMax,
    }
  })

  // ── Samenvattende badge ─────────────────────────────────────────────────────
  const fireDelta =
    v2.fireLeeftijd !== null && kernel.fireLeeftijd !== null
      ? kernel.fireLeeftijd - v2.fireLeeftijd
      : null
  const eindDelta = delta(v2.eindNettoVermogen, kernel.eindNettoVermogen)

  // ── Vlag-stand (hergebruik de flags-data) ───────────────────────────────────
  const { data: prof } = await supabase.from('profiles').select('feature_preferences').single()
  const flags = readKernelFlags(prof as { feature_preferences?: Record<string, unknown> | null } | null)

  return NextResponse.json({
    ok: true,
    eindLeeftijd,
    v2,
    kernel,
    reeks,
    kentalDeltas,
    reeksDeltas,
    badge: {
      fireLeeftijdDeltaJaar: fireDelta,
      eindVermogenAbs: eindDelta.absDelta ?? 0,
      eindVermogenPct: eindDelta.pctDelta,
    },
    flags,
    meta: {
      v2EndAge: Math.round(ledger.rows[ledger.rows.length - 1]?.leeftijd ?? eindLeeftijd),
      kernelEndAge: kernelStartAge + kLast,
      v2Strategy: v2Unified.strategy,
      kernelStatus: solve.status,
    },
  } satisfies VergelijkResponse)
}
