/**
 * Natural milestones — automatisch afgeleide moment-events voor de horizon-tijdlijn.
 *
 * In tegenstelling tot user-defined life events worden deze mijlpalen niet
 * opgeslagen in `life_events`, maar afgeleid uit:
 *  - asset/debt-metadata (per-item, statisch)
 *  - simulatie-output (`SimRow[]`, portfolio-niveau)
 *  - combinaties (schuldenvrij)
 *
 * Pure functions. Geen Supabase dependency.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { debtProjection } from '@/lib/debt-data'
import { type LifeEvent } from '@/lib/horizon-data'
import { BOX3_PARAMS } from '@/lib/box3-data'
import type { SimResult } from '@/lib/fire-simulation'

// ── Types ────────────────────────────────────────────────────────────────

export type NaturalMilestoneKind =
  | 'debt_payoff'
  | 'debt_free'
  | 'fixed_rate_reset'
  | 'asset_expiry'
  | 'asset_maturity'
  | 'vehicle_runoff'
  | 'sim_out_of_cash'
  | 'sim_peak'
  | 'sim_first_million'
  | 'sim_box3_threshold'

export type NaturalMilestoneCategory = 'asset' | 'debt' | 'simulation'

export interface NaturalMilestone {
  /** Synthetic id, e.g. `nat-debt-payoff-<debtId>` */
  id: string
  kind: NaturalMilestoneKind
  category: NaturalMilestoneCategory
  /** Display name, e.g. 'Hypotheek Rabobank afgelost' */
  name: string
  /** Age at moment — used for chart x-positioning */
  target_age: number
  /** ISO date of moment (yyyy-mm-dd) */
  target_date: string
  /** Lucide icon name (or fallback emoji) for EVENT_ICONS lookup */
  icon: string
  /** FK to source debt/asset (when category is asset/debt) */
  sourceId?: string
  /** Optional bedrag — payoff balance, payout, peak value, etc. */
  amount?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert ISO date to age given a date-of-birth (also ISO). Returns null if
 * dob missing or invalid. Gebruikt **integer-floor** (zelfde semantiek als
 * `ageAtDate()` uit horizon-data.ts), zodat onze milestones consistent zijn
 * met de bar-chart's age-as. De simulatie rendert rij `age=73` als de periode
 * [73, 74), dus een payoff die tijdens dat jaar valt hoort op leeftijd 73 —
 * niet op 74 (wat zou gebeuren als we naar boven afronden bij 73.99).
 */
function dateToAge(dob: string | null, isoDate: string): number | null {
  if (!dob || !isoDate) return null
  const target = new Date(isoDate)
  if (Number.isNaN(target.getTime())) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  let age = target.getFullYear() - birth.getFullYear()
  const m = target.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && target.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}

/** Year-from-now → ISO date. Used for sim-derived milestones where we only know the age. */
function ageToIsoDate(dob: string | null, age: number): string {
  if (!dob) {
    // No dob: synthesize ISO using current year + age delta. Best-effort.
    const now = new Date()
    const target = new Date(now.getFullYear() + Math.round(age - 30), now.getMonth(), 1)
    return target.toISOString().split('T')[0]
  }
  const birth = new Date(dob)
  const yearsFull = Math.floor(age)
  const monthFraction = age - yearsFull
  const target = new Date(birth)
  target.setFullYear(birth.getFullYear() + yearsFull)
  target.setMonth(birth.getMonth() + Math.round(monthFraction * 12))
  return target.toISOString().split('T')[0]
}

/** Box 3 heffingsvrij vermogen voor het huidige (of meest recente) jaar. */
function getBox3HeffingsvrijVermogen(hasPartner: boolean): number {
  const currentYear = new Date().getFullYear()
  const params = BOX3_PARAMS[currentYear as keyof typeof BOX3_PARAMS]
    ?? BOX3_PARAMS[2026]
    ?? Object.values(BOX3_PARAMS).at(-1)!
  return hasPartner ? params.heffingsvrijPartner : params.heffingsvrijSingle
}

// ── Static derivation (asset/debt metadata) ──────────────────────────────

function deriveDebtMilestones(debts: Debt[], dob: string | null): NaturalMilestone[] {
  const out: NaturalMilestone[] = []
  const activeDebts = debts.filter(d => d.is_active && Number(d.current_balance) > 0)

  // Per-debt payoff
  for (const debt of activeDebts) {
    const proj = debtProjection(debt)
    if (!proj.isPayable || !proj.payoffDate) continue
    const age = dateToAge(dob, proj.payoffDate)
    if (age == null || !Number.isFinite(age)) continue

    out.push({
      id: `nat-debt-payoff-${debt.id}`,
      kind: 'debt_payoff',
      category: 'debt',
      name: `${debt.name || 'Schuld'} afgelost`,
      target_age: age,
      target_date: proj.payoffDate,
      icon: 'CheckCircle2',
      sourceId: debt.id,
      amount: Number(debt.current_balance),
    })

    // Mortgage fixed-rate reset (geen payoff, maar ander moment)
    if (debt.debt_type === 'mortgage' && debt.fixed_rate_end_date) {
      const resetAge = dateToAge(dob, debt.fixed_rate_end_date)
      if (resetAge != null && Number.isFinite(resetAge)) {
        out.push({
          id: `nat-fixed-rate-${debt.id}`,
          kind: 'fixed_rate_reset',
          category: 'debt',
          name: `Rentevast eindigt — ${debt.name || 'hypotheek'}`,
          target_age: resetAge,
          target_date: debt.fixed_rate_end_date,
          icon: 'TrendingUp',
          sourceId: debt.id,
        })
      }
    }
  }

  // Aggregaat: schuldenvrij = laatste payoff over alle actieve debts
  const payoffMilestones = out.filter(m => m.kind === 'debt_payoff')
  if (payoffMilestones.length >= 2) {
    const last = payoffMilestones.reduce((a, b) => (a.target_age > b.target_age ? a : b))
    out.push({
      id: 'nat-debt-free',
      kind: 'debt_free',
      category: 'debt',
      name: 'Schuldenvrij',
      target_age: last.target_age,
      target_date: last.target_date,
      icon: 'PartyPopper',
    })
  }

  return out
}

function deriveAssetMilestones(assets: Asset[], dob: string | null): NaturalMilestone[] {
  const out: NaturalMilestone[] = []
  const activeAssets = assets.filter(a => a.is_active)

  for (const asset of activeAssets) {
    // Levensverzekering: expiry_date = polis-uitkering
    if (asset.asset_type === 'levensverzekering' && asset.expiry_date) {
      const age = dateToAge(dob, asset.expiry_date)
      if (age != null && Number.isFinite(age)) {
        out.push({
          id: `nat-asset-expiry-${asset.id}`,
          kind: 'asset_expiry',
          category: 'asset',
          name: `${asset.name || 'Polis'} keert uit`,
          target_age: age,
          target_date: asset.expiry_date,
          icon: 'Shield',
          sourceId: asset.id,
          amount: Number(asset.current_value),
        })
      }
    }

    // Spaardeposito / vordering: lock_end_date = vrij beschikbaar / aflossing
    if ((asset.asset_type === 'savings' || asset.asset_type === 'vordering') && asset.lock_end_date) {
      const age = dateToAge(dob, asset.lock_end_date)
      if (age != null && Number.isFinite(age)) {
        out.push({
          id: `nat-asset-maturity-${asset.id}`,
          kind: 'asset_maturity',
          category: 'asset',
          name: asset.asset_type === 'savings'
            ? `${asset.name || 'Deposito'} vrij`
            : `${asset.name || 'Vordering'} terugbetaald`,
          target_age: age,
          target_date: asset.lock_end_date,
          icon: 'Landmark',
          sourceId: asset.id,
          amount: Number(asset.current_value),
        })
      }
    }

    // Voertuig: lineair afgeschreven naar 0
    if (asset.asset_type === 'vehicle' && asset.depreciation_rate && asset.depreciation_rate > 0) {
      const purchase = Number(asset.purchase_value) || Number(asset.current_value)
      const current = Number(asset.current_value)
      const yearlyDepreciation = (purchase * Number(asset.depreciation_rate)) / 100
      if (yearlyDepreciation > 0 && current > 0) {
        const yearsLeft = current / yearlyDepreciation
        const targetDate = new Date()
        targetDate.setFullYear(targetDate.getFullYear() + Math.floor(yearsLeft))
        targetDate.setMonth(targetDate.getMonth() + Math.round((yearsLeft - Math.floor(yearsLeft)) * 12))
        const isoDate = targetDate.toISOString().split('T')[0]
        const age = dateToAge(dob, isoDate)
        if (age != null && Number.isFinite(age) && yearsLeft < 50) {
          out.push({
            id: `nat-vehicle-runoff-${asset.id}`,
            kind: 'vehicle_runoff',
            category: 'asset',
            name: `${asset.name || 'Voertuig'} op €0`,
            target_age: age,
            target_date: isoDate,
            icon: 'Car',
            sourceId: asset.id,
          })
        }
      }
    }
  }

  return out
}

// ── Simulation-derived ───────────────────────────────────────────────────

function deriveSimMilestones(
  simResult: SimResult | null,
  dob: string | null,
  hasPartner: boolean,
): NaturalMilestone[] {
  if (!simResult || !simResult.rows.length) return []
  const out: NaturalMilestone[] = []
  const rows = simResult.rows

  // Out of cash — eerste row waar endPortfolio <= 0 in retirement-fase
  const outOfCash = rows.find(r => r.phase === 'retirement' && r.endPortfolio <= 0)
  if (outOfCash) {
    out.push({
      id: 'nat-sim-out-of-cash',
      kind: 'sim_out_of_cash',
      category: 'simulation',
      name: 'Vermogen op',
      target_age: outOfCash.age,
      target_date: ageToIsoDate(dob, outOfCash.age),
      icon: 'AlertTriangle',
      amount: 0,
    })
  }

  // Piek-vermogen — maximum endPortfolio
  const peak = rows.reduce((max, r) => (r.endPortfolio > max.endPortfolio ? r : max), rows[0])
  if (peak && peak.endPortfolio > 0) {
    out.push({
      id: 'nat-sim-peak',
      kind: 'sim_peak',
      category: 'simulation',
      name: 'Piek-vermogen',
      target_age: peak.age,
      target_date: ageToIsoDate(dob, peak.age),
      icon: 'Mountain',
      amount: peak.endPortfolio,
    })
  }

  // Eerste miljoen
  const firstMillion = rows.find(r => r.endPortfolio >= 1_000_000)
  if (firstMillion) {
    out.push({
      id: 'nat-sim-first-million',
      kind: 'sim_first_million',
      category: 'simulation',
      name: 'Eerste miljoen',
      target_age: firstMillion.age,
      target_date: ageToIsoDate(dob, firstMillion.age),
      icon: 'Sparkles',
      amount: firstMillion.endPortfolio,
    })
  }

  // Box 3-drempel doorbroken (heffingsvrij vermogen — partner-afhankelijk)
  const heffingsvrij = getBox3HeffingsvrijVermogen(hasPartner)
  const box3Row = rows.find(r => r.endPortfolio >= heffingsvrij)
  if (box3Row) {
    out.push({
      id: 'nat-sim-box3-threshold',
      kind: 'sim_box3_threshold',
      category: 'simulation',
      name: 'Box 3-drempel doorbroken',
      target_age: box3Row.age,
      target_date: ageToIsoDate(dob, box3Row.age),
      icon: 'Receipt',
      amount: heffingsvrij,
    })
  }

  return out
}

// ── Public API ───────────────────────────────────────────────────────────

export interface DeriveNaturalMilestonesParams {
  debts: Debt[]
  assets: Asset[]
  simResult: SimResult | null
  dob: string | null
  hasPartner: boolean
}

export function deriveNaturalMilestones(params: DeriveNaturalMilestonesParams): NaturalMilestone[] {
  const { debts, assets, simResult, dob, hasPartner } = params
  const milestones = [
    ...deriveDebtMilestones(debts, dob),
    ...deriveAssetMilestones(assets, dob),
    ...deriveSimMilestones(simResult, dob, hasPartner),
  ]
  // Sort chronologically — events-timeline assumes ascending target_age
  return milestones.sort((a, b) => a.target_age - b.target_age)
}

// ── LifeEvent-shape mapping ──────────────────────────────────────────────

/**
 * Verpak een NaturalMilestone in een LifeEvent-vorm zodat EventsTimeline
 * het kan renderen zonder eigen rendering-pad. EventsTimeline herkent
 * natuurlijke mijlpalen via `metadata.isNatural === true` en stylet ze
 * met outlined dots i.p.v. gevulde.
 */
export function naturalMilestoneToLifeEvent(m: NaturalMilestone): LifeEvent {
  return {
    id: m.id,
    name: m.name,
    event_type: m.kind,
    target_age: m.target_age,
    target_date: m.target_date,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: m.icon,
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    metadata: {
      isNatural: true,
      kind: m.kind,
      category: m.category,
      sourceId: m.sourceId,
      amount: m.amount,
    },
  }
}
