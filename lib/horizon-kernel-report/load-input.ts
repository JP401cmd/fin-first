/**
 * Horizon-kernel · beheer-transparantie — data-loader (server-only).
 *
 * Laadt de ECHTE data van de ingelogde (super)admin — profiel, bezittingen,
 * schulden, levensgebeurtenissen, AOW-tabel, essentiële budgetten — en levert
 * (1) de `KernelAdapterInput` die de adapter naar `KernelInput` omzet, en (2) een
 * gecureerde "ruwe invoer"-samenvatting met per veld de bron (tabel.kolom of
 * instelling). Alleen-lezen; raakt geen data. Hergebruikt bestaande app-resolvers,
 * geen tweede rekenbron.
 *
 * NB: dit beheer-scherm draait een SOLO-projectie (geen partner-blok) — een echte
 * huishouden-run is hier bewust niet meegenomen; het household_type wordt wel als
 * ruwe invoer getoond.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { resolveFireParams } from '@/lib/fire-params'
import { FIRE_PLAN_COLUMNS } from '@/lib/fire-strategy'
import { parseHousingStrategy } from '@/lib/housing-strategy'
import { computeYearlyMustExpenses } from '@/lib/budget-utils'
import { formatCurrency } from '@/lib/format'
import type { KernelAdapterInput, KernelAdapterProfile } from '@/lib/horizon-kernel/adapter'

// ── Ruwe-invoer-samenvatting (deel 1 van het beheer-scherm) ──────────────────

/** Eén ruw invoer-veld met herkomst. */
export interface RawFieldRow {
  readonly label: string
  readonly waarde: string
  readonly bron: string
}
export interface RawAssetRow {
  readonly naam: string
  readonly type: string
  readonly waarde: number
  readonly rendementPct: number
  readonly maandinleg: number
}
export interface RawDebtRow {
  readonly naam: string
  readonly type: string
  readonly saldo: number
  readonly rentePct: number
  readonly maandlast: number
}
export interface RawEventRow {
  readonly naam: string
  readonly type: string
  readonly leeftijd: number | null
  readonly eenmaligBedrag: number
  readonly maandKost: number
  readonly maandInkomen: number
}
export interface RawInputSummary {
  readonly persoon: RawFieldRow[]
  readonly inkomenUitgaven: RawFieldRow[]
  readonly parameters: RawFieldRow[]
  readonly strategie: RawFieldRow[]
  readonly assets: RawAssetRow[]
  readonly debts: RawDebtRow[]
  readonly events: RawEventRow[]
  readonly aowRegels: number
}

export interface KernelReportInput {
  readonly adapterInput: KernelAdapterInput
  readonly raw: RawInputSummary
}

function pct(v: unknown): string {
  const n = Number(v ?? 0)
  return `${(n * 100).toFixed(1).replace('.', ',')}%`
}
function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Laad de kern-invoer + ruwe samenvatting voor de ingelogde gebruiker. Gooit een
 * duidelijke fout als de geboortedatum ontbreekt (zonder tijdas kan de kern niet
 * rekenen) — de route vertaalt dat naar een nette "onvoldoende data"-melding.
 */
export async function loadKernelReportInput(supabase: SupabaseClient): Promise<KernelReportInput> {
  const [profileResult, assetsResult, debtsResult, eventsResult, aowRows, budgetsResult] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          `date_of_birth, household_type, number_of_children, net_monthly_income, estimated_monthly_expenses, income_source, expenses_source, expected_return, inflation_rate, marginaal_tarief, box3_method, ${FIRE_PLAN_COLUMNS}, retirement_expense_method, retirement_expense_custom_amount, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, housing_strategy_config, pot_rules, feature_preferences`,
        )
        .single(),
      supabase.from('assets').select('*').eq('is_active', true).limit(500),
      supabase.from('debts').select('*').eq('is_active', true).limit(200),
      supabase
        .from('life_events')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      // AOW-referentietabel via de gedeelde module-TTL-cache (lib/reference-cache.ts).
      // Zelfde stille fallback-op-fout als voorheen (geen .error-check hier): een
      // query-fout resulteert in een lege array i.p.v. een fatale throw.
      getAowLeeftijden(supabase).catch(() => [] as AowLeeftijdRow[]),
      supabase
        .from('budgets')
        .select('id, name, default_limit, interval, budget_type, is_essential, parent_id')
        .eq('is_archived', false),
    ])

  const profileRaw = (profileResult.data ?? {}) as Record<string, unknown>
  if (!profileRaw.date_of_birth) {
    throw new Error('Profiel heeft geen geboortedatum — de rekenkern kan geen tijdas bouwen.')
  }

  const assets = (assetsResult.data ?? []) as Asset[]
  const debts = (debtsResult.data ?? []) as Debt[]
  const events = (eventsResult.data ?? []) as LifeEvent[]

  // Jaarlijkse essentiële uitgaven (zelfde subset-logica als de horizon-loader).
  const allBudgets = (budgetsResult.data ?? []) as Array<{
    id: string
    name: string | null
    default_limit: number | string | null
    interval: string | null
    budget_type: string | null
    is_essential: boolean | null
    parent_id: string | null
  }>
  const essentialBudgets = allBudgets.filter(
    (b) => b.is_essential && b.budget_type === 'expense' && b.parent_id === null,
  )
  const children = allBudgets.filter(
    (b) => b.parent_id !== null && !['archive', 'income', 'savings'].includes(b.budget_type ?? ''),
  )
  let yearlyEssential = 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = computeYearlyMustExpenses(essentialBudgets as any, children as any)
    yearlyEssential = num(res.yearlyMustExpenses)
  } catch {
    yearlyEssential = 0
  }

  // KernelAdapterProfile: superset van de losse resolver-inputs.
  const adapterProfile: KernelAdapterProfile = {
    date_of_birth: profileRaw.date_of_birth as string,
    net_monthly_income: num(profileRaw.net_monthly_income),
    estimated_monthly_expenses: num(profileRaw.estimated_monthly_expenses),
    yearly_essential_expenses: yearlyEssential > 0 ? yearlyEssential : undefined,
    expected_return: profileRaw.expected_return as number | null,
    inflation_rate: profileRaw.inflation_rate as number | null,
    box3_method: profileRaw.box3_method as string | null,
    marginaal_tarief: profileRaw.marginaal_tarief as number | null,
    fire_end_strategy: profileRaw.fire_end_strategy as string | null,
    fire_end_age: profileRaw.fire_end_age as number | null,
    fire_legacy_amount: profileRaw.fire_legacy_amount as number | string | null,
    // ADR 0129 L1 — het anker reist mee; zonder deze twee rekende het kernel-rapport
    // een aow-/age-plan als `solved` (bisectie) terwijl /toekomst het anker wél kent.
    fire_stop_anchor: profileRaw.fire_stop_anchor as string | null,
    fire_stop_age: profileRaw.fire_stop_age as number | string | null,
    feature_preferences: profileRaw.feature_preferences as Record<string, unknown> | null,
    withdrawal_strategy: profileRaw.withdrawal_strategy as string | null,
    guardrail_floor: profileRaw.guardrail_floor as number | null,
    guardrail_ceiling: profileRaw.guardrail_ceiling as number | null,
    guardrail_cut_step: profileRaw.guardrail_cut_step as number | null,
    guardrail_raise_step: profileRaw.guardrail_raise_step as number | null,
    housing_strategy_config: profileRaw.housing_strategy_config,
    pot_rules: profileRaw.pot_rules,
    retirement_expense_method: profileRaw.retirement_expense_method as string | null,
    retirement_custom_amount: profileRaw.retirement_expense_custom_amount as number | null,
  }

  const adapterInput: KernelAdapterInput = {
    profile: adapterProfile,
    assets,
    debts,
    lifeEvents: events,
    aowRows,
    // taxYear = adapter-default (meest recente); geen partner-blok (solo-run).
  }

  // ── Ruwe-invoer-samenvatting ────────────────────────────────────────────────
  const fireParams = resolveFireParams(adapterProfile)
  const housing = parseHousingStrategy(profileRaw.housing_strategy_config)

  const raw: RawInputSummary = {
    persoon: [
      { label: 'Geboortedatum', waarde: String(profileRaw.date_of_birth), bron: 'profiles.date_of_birth' },
      { label: 'Huishoudtype', waarde: String(profileRaw.household_type ?? 'solo'), bron: 'profiles.household_type' },
      { label: 'Aantal kinderen', waarde: String(num(profileRaw.number_of_children)), bron: 'profiles.number_of_children' },
    ],
    inkomenUitgaven: [
      { label: 'Netto maandinkomen', waarde: formatCurrency(num(profileRaw.net_monthly_income)), bron: 'profiles.net_monthly_income' },
      { label: 'Geschatte maanduitgaven', waarde: formatCurrency(num(profileRaw.estimated_monthly_expenses)), bron: 'profiles.estimated_monthly_expenses' },
      { label: 'Jaarlijkse essentiële uitgaven', waarde: formatCurrency(yearlyEssential), bron: 'budgets (essentieel, is_essential)' },
      { label: 'Inkomstenbron', waarde: String(profileRaw.income_source ?? '—'), bron: 'profiles.income_source' },
      { label: 'Uitgavenbron', waarde: String(profileRaw.expenses_source ?? '—'), bron: 'profiles.expenses_source' },
    ],
    parameters: [
      { label: 'Verwacht rendement', waarde: pct(fireParams.grossReturn), bron: 'profiles.expected_return' },
      { label: 'Inflatie', waarde: pct(fireParams.inflationRate), bron: 'profiles.inflation_rate' },
      { label: 'Marginaal tarief', waarde: profileRaw.marginaal_tarief != null ? pct(profileRaw.marginaal_tarief) : '—', bron: 'profiles.marginaal_tarief' },
      { label: 'Box 3-methode', waarde: fireParams.box3Method, bron: 'afgeleid (profiles.box3_method / fire-params)' },
    ],
    strategie: [
      { label: 'Eindstrategie', waarde: String(profileRaw.fire_end_strategy ?? 'perpetual'), bron: 'profiles.fire_end_strategy' },
      { label: 'Eindleeftijd', waarde: String(num(profileRaw.fire_end_age) || 90), bron: 'profiles.fire_end_age' },
      { label: 'Nalatenschap-bedrag', waarde: formatCurrency(num(profileRaw.fire_legacy_amount)), bron: 'profiles.fire_legacy_amount' },
      { label: 'Onttrekkingsstrategie', waarde: String(profileRaw.withdrawal_strategy ?? 'static'), bron: 'profiles.withdrawal_strategy' },
      { label: 'Guardrail floor / ceiling', waarde: `${pct(profileRaw.guardrail_floor ?? 0.8)} / ${pct(profileRaw.guardrail_ceiling ?? 1.2)}`, bron: 'profiles.guardrail_floor/ceiling' },
      { label: 'Woningstrategie', waarde: housing.mode, bron: 'profiles.housing_strategy_config' },
      { label: 'Pensioen-uitgaven-methode', waarde: String(profileRaw.retirement_expense_method ?? '—'), bron: 'profiles.retirement_expense_method' },
    ],
    assets: assets.map((a) => ({
      naam: a.name ?? a.asset_type,
      type: a.asset_type,
      waarde: num(a.current_value),
      rendementPct: num(a.expected_return),
      maandinleg: num(a.monthly_contribution),
    })),
    debts: debts.map((d) => ({
      naam: d.name ?? d.debt_type,
      type: d.debt_type,
      saldo: num(d.current_balance),
      rentePct: num(d.interest_rate),
      maandlast: num((d as { monthly_payment?: number | null }).monthly_payment),
    })),
    events: events.map((e) => ({
      naam: e.name ?? e.event_type,
      type: e.event_type,
      leeftijd: e.target_age ?? null,
      eenmaligBedrag: num(e.one_time_cost),
      maandKost: num(e.monthly_cost_change),
      maandInkomen: num(e.monthly_income_change),
    })),
    aowRegels: aowRows.length,
  }

  return { adapterInput, raw }
}
