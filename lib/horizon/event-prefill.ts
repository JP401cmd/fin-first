/**
 * Pure event-prefill heuristics voor het levensgebeurtenissen-formulier op /toekomst.
 *
 * Deze functie berekent de voorgestelde (catalogus-default) waarden voor een
 * gekozen levensgebeurtenis-type, verrijkt met profieldata. Puur en zonder
 * side-effects — geextraheerd uit horizon-client.tsx zodat de heuristiek
 * testbaar is zonder de component te mounten. Gedrag is identiek aan de
 * voormalige inline `computeSuggestedValues`-methode.
 *
 * Consume-don't-recompute: kosten-koper komt uit de canonieke bron
 * (`computeKostenKoper`); AOW-basisbedragen uit `lib/constants`.
 */
import {
  LIFE_EVENT_CATALOG,
  VERBOUWING_TYPE_KOSTEN,
  STUDIE_TYPE_KOSTEN,
  type FinancialInput,
} from '@/lib/horizon-data'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { computeKostenKoper } from '@/lib/kosten-koper'
import type { AowAge } from '@/lib/aow-leeftijd'
import type { Debt } from '@/lib/debt-data'

/** Component-context waarop de prefill-heuristiek leunt. */
export interface EventPrefillContext {
  userAowAge: AowAge
  currentAge: number | null
  effectiveInput: FinancialInput | null
  isHouseholdView: boolean
  effectiveNetWorth: number
  debts: Debt[]
}

/** Voorgestelde formulierwaarden voor een levensgebeurtenis. */
export interface SuggestedEventValues {
  amount: number
  age: number | ''
  direction: 'income' | 'expense'
  durationType: 'one_time' | 'period' | 'continuous'
  duration: number | ''
  isIndexed: boolean
  metadata: Record<string, unknown>
}

/** Compute suggested (catalog-default) values for a given event type, using profile data */
export function computeSuggestedEventValues(
  type: string,
  ctx: EventPrefillContext,
): SuggestedEventValues {
  const { userAowAge, currentAge, effectiveInput, isHouseholdView, effectiveNetWorth, debts } = ctx

  const catalog = LIFE_EVENT_CATALOG[type]
  const defaultDur = catalog?.defaultDuration ?? 0
  let amount = 0
  let direction: 'income' | 'expense' = 'expense'
  let durationType: 'one_time' | 'period' | 'continuous' = 'one_time'
  let duration: number | '' = defaultDur
  let isIndexed = true

  const effectiveDefaultAge = type === 'aow'
    ? Math.ceil(userAowAge.fractional)
    : catalog?.defaultAge
  let age: number | '' = effectiveDefaultAge !== undefined ? effectiveDefaultAge : (currentAge ? currentAge + 5 : '')

  // Determine from catalog cost properties
  const hasCost = (catalog?.defaultCost ?? 0) !== 0
  const hasMonthlyIncome = (catalog?.defaultMonthlyIncome ?? 0) !== 0
  const hasMonthlyExpense = (catalog?.defaultMonthlyCost ?? 0) !== 0
  if (hasCost) {
    durationType = 'one_time'
    const cost = catalog!.defaultCost
    direction = cost > 0 ? 'expense' : 'income'
    amount = Math.abs(cost)
  } else if (hasMonthlyIncome) {
    durationType = defaultDur > 0 ? 'period' : 'continuous'
    direction = catalog!.defaultMonthlyIncome > 0 ? 'income' : 'expense'
    amount = Math.abs(catalog!.defaultMonthlyIncome)
  } else if (hasMonthlyExpense) {
    durationType = defaultDur > 0 ? 'period' : 'continuous'
    direction = 'expense'
    amount = Math.abs(catalog!.defaultMonthlyCost)
  }

  // Initialize metadata from catalog field defaults
  const metadata: Record<string, unknown> = {}
  if (catalog?.fields) {
    for (const f of catalog.fields) {
      metadata[f.key] = f.default
    }
  }

  // ── Pre-fill from profile data ──
  const profileIncome = effectiveInput?.monthlyIncome ?? 0
  if (profileIncome > 0) {
    if (type === 'part_time' && metadata.nettoInkomen !== undefined) metadata.nettoInkomen = profileIncome
    if (type === 'career_change' && metadata.huidigNettoSalaris !== undefined) metadata.huidigNettoSalaris = profileIncome
    if (type === 'werkloosheid' && metadata.huidigNetto !== undefined) metadata.huidigNetto = profileIncome
  }

  // AOW: pre-fill leefsituatie from household status
  if (type === 'aow' && metadata.leefsituatie !== undefined) {
    metadata.leefsituatie = isHouseholdView ? 'samenwonend' : 'alleenstaand'
    const baseAmount = isHouseholdView ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
    const jarenBuiten = Number(metadata.jarenBuitenNL ?? 0)
    const factor = Math.min(1, Math.max(0, (50 - jarenBuiten) / 50))
    amount = Math.round(baseAmount * factor)
    direction = 'income'
    durationType = 'continuous'
  }

  // Scheiding: vermogensverlies + advocaat
  if (type === 'scheiding') {
    const behoudPct = Number(metadata.vermogensBehoudPct ?? 50)
    const advocaat = Number(metadata.advocaatKosten ?? 7500)
    const vermogensverlies = Math.round(effectiveNetWorth * (1 - behoudPct / 100))
    amount = Math.max(0, vermogensverlies + advocaat)
    durationType = 'one_time'
    direction = 'expense'
  }

  // Werkloosheid: transitievergoeding
  if (type === 'werkloosheid') {
    const bruto = Number(metadata.huidigBruto ?? 4000)
    const jaren = Number(metadata.dienstjaren ?? 5)
    const transitie = Math.round(bruto / 3 * jaren)
    metadata.transitievergoeding = transitie
    amount = transitie
    durationType = 'one_time'
    direction = 'income'
  }

  // House purchase: kosten koper (canonieke bron — lib/kosten-koper.ts)
  if (type === 'house_purchase') {
    amount = computeKostenKoper({
      aankoopprijs: Number(metadata.aankoopprijs ?? 350000),
      isStarter: Boolean(metadata.eersteWoning ?? true),
      hasNHG: Boolean(metadata.nhg ?? false),
    }).totaal
    durationType = 'one_time'
    direction = 'expense'
  }

  // House sale: netto overwaarde from mortgage debts
  if (type === 'house_sale' && debts.length > 0) {
    const mortgages = debts.filter(d => d.debt_type === 'mortgage' && d.is_active)
    if (mortgages.length > 0) {
      const totalBalance = mortgages.reduce((sum, m) => sum + Number(m.current_balance ?? 0), 0)
      const totalPayment = mortgages.reduce((sum, m) => sum + Number(m.monthly_payment ?? 0), 0)
      if (totalBalance > 0) metadata.resterendeHypotheek = totalBalance
      if (totalPayment > 0) metadata.oudeHypotheeklasten = totalPayment
      const vp = Number(metadata.verkoopprijs) || 400000
      const rh = Number(metadata.resterendeHypotheek) || 0
      const mkPct = Number(metadata.makelaarskosten) || 1.5
      const mkBedrag = Math.round(vp * mkPct / 100)
      const netto = vp - rh - mkBedrag
      amount = Math.abs(netto)
      direction = netto >= 0 ? 'income' : 'expense'
      durationType = 'one_time'
    }
  }

  // Pension: brutoBedrag as income
  if (type === 'pension') {
    amount = Number(metadata.brutoBedrag ?? 675)
    durationType = 'continuous'
    direction = 'income'
    age = Number(metadata.ingangLeeftijd ?? 67)
    isIndexed = Boolean(metadata.isGeindexeerd ?? false)
  }

  // Early retirement: AOW gap
  if (type === 'early_retirement') {
    const pensioenLeeftijd = Number(metadata.pensioenLeeftijd ?? 62)
    const aowGapMaanden = Math.max(0, (67 - pensioenLeeftijd) * 12)
    const maanduitgaven = effectiveInput?.monthlyExpenses ?? 3000
    const overbrugging = Number(metadata.overbruggingsUitkering ?? 0)
    age = pensioenLeeftijd
    amount = Math.max(0, maanduitgaven - overbrugging)
    durationType = 'period'
    direction = 'expense'
    duration = aowGapMaanden
  }

  // World trip: vertrekkosten as one-time
  if (type === 'world_trip') {
    amount = Number(metadata.vertrekkosten ?? 4000)
    durationType = 'one_time'
    direction = 'expense'
    duration = catalog?.defaultDuration ?? 12
  }

  // Sabbatical: inkomensverlies
  if (type === 'sabbatical') {
    const profileInc = effectiveInput?.monthlyIncome ?? 3000
    metadata.nettoInkomen = profileInc
    const doorbetalingsPct = Number(metadata.doorbetalingsPct ?? 0)
    amount = Math.round(profileInc * (1 - doorbetalingsPct / 100))
    durationType = 'period'
    direction = 'income'
    duration = catalog?.defaultDuration ?? 6
  }

  // Renovation: cost from type preset
  if (type === 'renovation') {
    const verbouwType = String(metadata.type ?? 'keuken')
    const preset = VERBOUWING_TYPE_KOSTEN[verbouwType]
    if (preset) {
      amount = preset.bedrag
      durationType = 'one_time'
      direction = 'expense'
    }
  }

  // Part-time: income loss from hours ratio
  if (type === 'part_time') {
    const huidigUren = Number(metadata.huidigUren ?? 40)
    const nieuwUren = Number(metadata.nieuwUren ?? 32)
    const nettoInkomen = Number(metadata.nettoInkomen ?? 3000)
    const reductie = 1 - (nieuwUren / huidigUren)
    amount = Math.round(nettoInkomen * reductie)
    direction = 'expense'
    const isPermanent = Boolean(metadata.isPermanent ?? false)
    durationType = isPermanent ? 'continuous' : 'period'
    if (!isPermanent) duration = catalog?.defaultDuration ?? 60
  }

  // Study: cost from type preset
  if (type === 'study') {
    const studieType = String(metadata.studieType ?? 'master')
    const preset = STUDIE_TYPE_KOSTEN[studieType]
    if (preset) {
      amount = preset.bedrag
      metadata.collegegeld = preset.bedrag
      durationType = 'one_time'
      direction = 'expense'
      duration = preset.duur
    }
  }

  return { amount, age, direction, durationType, duration, isIndexed, metadata }
}
