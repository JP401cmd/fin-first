/**
 * Asset KPI berekeningen — pure functies per asset-type.
 *
 * Levert per asset 1 of 2 KPI's voor de strip onder de naam/bedrag-row.
 * Categorie-aggregaten leven in `lib/category-kpi.ts` (die deze functies
 * niet aanroept maar zelfde input-data weegt). Beide bestanden delen het
 * `KpiValue` type zodat de UI één consistente strip-component kan tonen.
 *
 * Uitgangspunten:
 * - Strikt server-safe (geen 'use client', geen DOM, geen hooks).
 * - Pure: zelfde input → zelfde output. Geen Date.now() side-effects buiten
 *   `ctx.now` (zodat tests deterministisch zijn).
 * - Lege KPI = `undefined` retourneren — de strip filtert dat zelf weg.
 */
import type { Asset, AssetType } from './asset-data'
import { formatCurrency } from './format'
import type { CashAssetStats } from './kpi-context'

// ── Gedeelde types ──────────────────────────────────────────────

/**
 * Eén KPI-waarde voor de strip. De UI rendert `value` prominent en `label`
 * als suffix. Als het label vanzelf duidelijk is uit de waarde (bv. `+5,2%
 * YTD` waar "YTD" in de waarde zit) mag `label` weggelaten worden.
 */
export interface KpiValue {
  /** Voorgevormde tekst incl. teken/suffix, bv. "+0,8%" of "€ 145.000". */
  value: string
  /** Optionele tag, bv. "vandaag" of "rente". Vervalt als `value` zelf-uitlegbaar is. */
  label?: string
  /** Kleur-tone — driver voor `text-positive`/`text-negative`/`text-[var(--ink-2)]`. */
  tone?: 'pos' | 'neg' | 'neutral'
  /** Pijl-icon voor mutatie-KPI's. */
  icon?: 'up' | 'down' | null
}

export interface KpiPair {
  primary?: KpiValue
  secondary?: KpiValue
}

/**
 * Context die per request beschikbaar gemaakt wordt door de loader.
 * Niet alle velden zijn nodig voor elk asset-type; ontbrekende velden
 * resulteren in een lege KPI (geen crash).
 */
export interface AssetKpiContext {
  /**
   * Map van `asset.id` → array van bijbehorende holdings (alleen relevant
   * voor `investment` / `crypto` als deze de tracker gebruiken).
   * Velden die we minimaal verwachten: `units`, `current_price`,
   * `avg_purchase_price`, `daily_change_percent`.
   */
  holdingsByAssetId?: Map<string, ReadonlyArray<Record<string, unknown>>>
  /**
   * Map van `asset.id` → som schuld-balances die naar dit asset linken.
   * Gebruikt voor `eigen_huis` om overwaarde te bepalen zonder dat de
   * KPI-functie zelf de debts-array moet kennen.
   */
  linkedDebtBalanceByAssetId?: Map<string, number>
  /**
   * Map van cash-asset.id → cash-stats. Twee `kind`-varianten:
   * - `transaction`: cash mét actief budgetteren — KPI's tonen laatste tx +
   *   maandmutatie + hoogste uitgave (server-side uit `transactions`).
   * - `revaluation`: cash zónder budgetteren — KPI's tonen laatste
   *   herwaardering + saldo-mutatie deze maand (server-side uit `valuations`).
   * Cash-assets zonder beide vallen terug op een rente-fallback.
   */
  cashStatsByAssetId?: Map<string, CashAssetStats>
  /** Referentiedatum voor looptijd-berekeningen — default `new Date()`. */
  now?: Date
}

// ── Format-helpers ─────────────────────────────────────────────

const NL = 'nl-NL'

function formatPercent(value: number, opts: { decimals?: number; signed?: boolean } = {}): string {
  const { decimals = 1, signed = false } = opts
  const formatted = value.toLocaleString(NL, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  if (signed && value > 0) return `+${formatted}%`
  return `${formatted}%`
}

function formatSignedCurrency(value: number): string {
  // formatCurrency rendert "-€ 100" voor negatief; voor positief willen we
  // expliciet een "+"-prefix als visuele tegenpool bij mutaties.
  if (value > 0) return `+${formatCurrency(value)}`
  return formatCurrency(value)
}

function diffMonths(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  // Pas op voor halve maanden via getDate-vergelijking; voor onze KPI volstaat hele maanden.
  return Math.max(0, months)
}

function diffYearsApprox(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  if (ms <= 0) return 0
  return ms / (1000 * 60 * 60 * 24 * 365.25)
}

function toneFromSign(value: number): KpiValue['tone'] {
  if (value > 0) return 'pos'
  if (value < 0) return 'neg'
  return 'neutral'
}

// ── Per-type implementaties ────────────────────────────────────

function kpiCash(asset: Asset, ctx: AssetKpiContext): KpiPair {
  const stats = ctx.cashStatsByAssetId?.get(asset.id)

  // Geen stats beschikbaar → val terug op rente uit `expected_return` zodat
  // de strip niet leeg blijft op edge-cases (bv. nieuwe rekening zonder
  // historie, contant geld zonder valuations).
  if (!stats) {
    const rate = Number(asset.expected_return)
    if (isFinite(rate) && rate > 0) {
      return {
        primary: {
          value: formatPercent(rate, { decimals: 1 }),
          label: 'rente',
          tone: 'neutral',
        },
      }
    }
    return {}
  }

  // KPI 1 — laatste activiteit X dagen geleden. Het label hangt af van de
  // bron (transactie of herwaardering) zodat de gebruiker zonder dubbel te
  // kijken weet hoe het saldo wordt bijgehouden.
  let primary: KpiValue | undefined
  if (stats.lastDate) {
    const now = ctx.now ?? new Date()
    const last = new Date(stats.lastDate)
    const diffMs = now.getTime() - last.getTime()
    const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
    const suffix = stats.kind === 'revaluation' ? 'herwaardeerd' : 'geleden'
    if (days === 0) {
      primary = { value: 'Vandaag', label: suffix, tone: 'pos' }
    } else if (days === 1) {
      primary = { value: '1 dag', label: suffix, tone: 'pos' }
    } else {
      primary = {
        value: `${days} dgn`,
        label: suffix,
        // Stale-signal: cash-rekeningen zonder activiteit / herwaardering
        // langer dan 14 dagen voelen verwaarloosd. Bij valuations is 30
        // dagen normaler (handmatig bijwerken is minder frequent).
        tone: days <= (stats.kind === 'revaluation' ? 30 : 14) ? 'neutral' : 'neg',
      }
    }
  }

  // KPI 2 — mutatie deze maand. Voor transactie-stats: inkomsten − uitgaven.
  // Voor herwaarderings-stats: huidige waarde − waarde bij maandstart.
  let secondary: KpiValue | undefined
  if (isFinite(stats.monthlyChangeEur)) {
    const value = stats.monthlyChangeEur
    secondary = {
      value: value > 0
        ? `+${formatCurrency(value)}`
        : formatCurrency(value),
      label: 'deze maand',
      tone: toneFromSign(value),
      icon: value > 0 ? 'up' : value < 0 ? 'down' : null,
    }
  }

  return { primary, secondary }
}

function kpiSavings(asset: Asset, ctx: AssetKpiContext): KpiPair {
  const rate = Number(asset.expected_return)
  const primary: KpiValue | undefined = isFinite(rate)
    ? { value: formatPercent(rate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  // KPI 2 — vasttijd resterend (alleen voor deposito's met lock_end_date).
  let secondary: KpiValue | undefined
  if (asset.lock_end_date) {
    const lockEnd = new Date(asset.lock_end_date)
    const now = ctx.now ?? new Date()
    const months = diffMonths(now, lockEnd)
    if (months > 0) {
      secondary = {
        value: `${months} mnd`,
        label: 'vast',
        tone: 'neutral',
      }
    }
  }
  return { primary, secondary }
}

function kpiInvestment(asset: Asset, ctx: AssetKpiContext): KpiPair {
  const holdings = ctx.holdingsByAssetId?.get(asset.id) ?? []
  // Pad 1 — holdings-tracker actief: bereken dagverandering uit holdings
  if (holdings.length > 0) {
    let totalValue = 0
    let dailyChangeAbsolute = 0
    let totalCost = 0
    for (const h of holdings) {
      const units = Number(h.units) || 0
      const currentPrice = h.current_price != null ? Number(h.current_price) : Number(h.avg_purchase_price) || 0
      const avg = Number(h.avg_purchase_price) || 0
      const dailyChangePct = Number(h.daily_change_percent) || 0
      const value = units * currentPrice
      totalValue += value
      totalCost += units * avg
      dailyChangeAbsolute += value * (dailyChangePct / 100)
    }
    const baseValue = totalValue - dailyChangeAbsolute
    const dailyChangePct = baseValue > 0 ? (dailyChangeAbsolute / baseValue) * 100 : 0
    const totalReturnPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0
    return {
      primary: {
        value: formatPercent(dailyChangePct, { decimals: 1, signed: true }),
        label: 'vandaag',
        tone: toneFromSign(dailyChangePct),
        icon: dailyChangePct > 0 ? 'up' : dailyChangePct < 0 ? 'down' : null,
      },
      secondary: {
        value: formatPercent(totalReturnPct, { decimals: 1, signed: true }),
        label: 'totaal',
        tone: toneFromSign(totalReturnPct),
      },
    }
  }

  // Pad 2 — geen holdings: fallback op aankoopwaarde-vergelijking.
  const purchase = Number(asset.purchase_value)
  const current = Number(asset.current_value)
  if (purchase > 0 && isFinite(current)) {
    const totalReturnPct = ((current - purchase) / purchase) * 100
    return {
      primary: {
        value: formatPercent(totalReturnPct, { decimals: 1, signed: true }),
        label: 'totaal',
        tone: toneFromSign(totalReturnPct),
      },
      secondary: {
        value: formatPercent(Number(asset.expected_return), { decimals: 1, signed: false }),
        label: 'verwacht',
        tone: 'neutral',
      },
    }
  }
  return {}
}

function kpiCrypto(asset: Asset, ctx: AssetKpiContext): KpiPair {
  // Crypto deelt het holdings-pad met investment.
  return kpiInvestment(asset, ctx)
}

function kpiRetirement(asset: Asset, _ctx: AssetKpiContext): KpiPair {
  const monthly = Number(asset.monthly_contribution)
  const expected = Number(asset.expected_return)
  return {
    primary: monthly > 0
      ? { value: `${formatCurrency(monthly)}/mnd`, tone: 'neutral' }
      : undefined,
    secondary: isFinite(expected) && expected > 0
      ? { value: formatPercent(expected, { decimals: 1 }), label: 'verwacht', tone: 'neutral' }
      : undefined,
  }
}

function kpiEigenHuis(asset: Asset, ctx: AssetKpiContext): KpiPair {
  // KPI 1 — markt vs WOZ
  let primary: KpiValue | undefined
  const market = Number(asset.current_value)
  const woz = Number(asset.woz_value)
  if (woz > 0 && market > 0) {
    const deltaPct = ((market - woz) / woz) * 100
    primary = {
      value: formatPercent(deltaPct, { decimals: 0, signed: true }),
      label: 'boven WOZ',
      tone: toneFromSign(deltaPct),
    }
  }

  // KPI 2 — overwaarde via gekoppelde hypotheek
  let secondary: KpiValue | undefined
  const linkedDebt = ctx.linkedDebtBalanceByAssetId?.get(asset.id)
  if (linkedDebt != null && linkedDebt > 0 && market > 0) {
    const overwaarde = Math.max(0, market - linkedDebt)
    secondary = {
      value: formatCurrency(overwaarde),
      label: 'overwaarde',
      tone: 'pos',
    }
  }
  return { primary, secondary }
}

function kpiRealEstate(asset: Asset, _ctx: AssetKpiContext): KpiPair {
  // KPI 1 — bruto huurrendement
  let primary: KpiValue | undefined
  const market = Number(asset.current_value)
  const rentalMonthly = Number(asset.rental_income)
  if (market > 0 && rentalMonthly > 0) {
    const grossYield = ((rentalMonthly * 12) / market) * 100
    primary = {
      value: formatPercent(grossYield, { decimals: 1 }),
      label: 'rendement',
      tone: 'neutral',
    }
  }

  // KPI 2 — bezettingsgraad uit vacancy_log (laatste 12 maanden)
  let secondary: KpiValue | undefined
  const log = Array.isArray(asset.vacancy_log) ? asset.vacancy_log : []
  if (log.length > 0) {
    const recent = log.slice(-12)
    const occupied = recent.filter((entry) => entry.occupied).length
    const occupancyPct = (occupied / recent.length) * 100
    secondary = {
      value: formatPercent(occupancyPct, { decimals: 0 }),
      label: 'bezet',
      tone: occupancyPct >= 80 ? 'pos' : occupancyPct >= 50 ? 'neutral' : 'neg',
    }
  }
  return { primary, secondary }
}

function kpiVehicle(asset: Asset, _ctx: AssetKpiContext): KpiPair {
  const market = Number(asset.current_value)
  const purchase = Number(asset.purchase_value)
  const depreciationRate = Number(asset.depreciation_rate)

  // KPI 1 — geschat jaarlijks waardeverlies
  let primary: KpiValue | undefined
  if (market > 0 && isFinite(depreciationRate) && depreciationRate > 0) {
    const annualLoss = market * (depreciationRate / 100)
    primary = {
      value: `−${formatCurrency(annualLoss)}/jr`,
      tone: 'neg',
    }
  }

  // KPI 2 — restwaarde t.o.v. aankoop
  let secondary: KpiValue | undefined
  if (purchase > 0 && market > 0) {
    const residualPct = (market / purchase) * 100
    secondary = {
      value: formatPercent(residualPct, { decimals: 0 }),
      label: 'van aankoop',
      tone: residualPct >= 70 ? 'pos' : residualPct >= 40 ? 'neutral' : 'neg',
    }
  }
  return { primary, secondary }
}

function kpiPhysical(asset: Asset, _ctx: AssetKpiContext): KpiPair {
  const market = Number(asset.current_value)
  const purchase = Number(asset.purchase_value)
  const depreciationRate = Number(asset.depreciation_rate)

  // KPI 1 — waardeverandering sinds aankoop (kunst kan stijgen)
  let primary: KpiValue | undefined
  if (purchase > 0 && isFinite(market)) {
    const delta = market - purchase
    primary = {
      value: formatSignedCurrency(delta),
      label: 'totaal',
      tone: toneFromSign(delta),
    }
  }

  // KPI 2 — verwacht jaarlijks waardeverloop
  let secondary: KpiValue | undefined
  if (market > 0 && isFinite(depreciationRate) && depreciationRate !== 0) {
    const annual = market * (depreciationRate / 100)
    secondary = {
      value: depreciationRate < 0
        ? `+${formatCurrency(Math.abs(annual))}/jr`
        : `−${formatCurrency(annual)}/jr`,
      tone: depreciationRate < 0 ? 'pos' : 'neg',
    }
  }
  return { primary, secondary }
}

function kpiDeelneming(asset: Asset, _ctx: AssetKpiContext): KpiPair {
  const ownership = Number(asset.ownership_percentage)
  const annualDividend = Number(asset.annual_dividend)
  return {
    primary: isFinite(ownership) && ownership > 0
      ? { value: formatPercent(ownership, { decimals: 0 }), label: 'eigendom', tone: 'neutral' }
      : undefined,
    secondary: isFinite(annualDividend) && annualDividend > 0
      ? { value: `${formatCurrency(annualDividend)}/jr`, label: 'dividend', tone: 'pos' }
      : undefined,
  }
}

function kpiLevensverzekering(asset: Asset, ctx: AssetKpiContext): KpiPair {
  // KPI 1 — resterende looptijd
  let primary: KpiValue | undefined
  if (asset.expiry_date) {
    const expiry = new Date(asset.expiry_date)
    const now = ctx.now ?? new Date()
    const years = Math.floor(diffYearsApprox(now, expiry))
    if (years > 0) {
      primary = { value: `${years} jr`, label: 'resterend', tone: 'neutral' }
    }
  }

  // KPI 2 — liquide / niet-liquide
  let secondary: KpiValue | undefined
  if (asset.is_liquid != null) {
    secondary = asset.is_liquid
      ? { value: 'Liquide', tone: 'pos' }
      : { value: 'Vast', tone: 'neutral' }
  }
  return { primary, secondary }
}

function kpiVordering(asset: Asset, ctx: AssetKpiContext): KpiPair {
  const rate = Number(asset.expected_return)
  // KPI 1 — rente
  const primary: KpiValue | undefined = isFinite(rate) && rate > 0
    ? { value: formatPercent(rate, { decimals: 1 }), label: 'rente', tone: 'pos' }
    : undefined

  // KPI 2 — resterende looptijd
  let secondary: KpiValue | undefined
  if (asset.lock_end_date) {
    const end = new Date(asset.lock_end_date)
    const now = ctx.now ?? new Date()
    const months = diffMonths(now, end)
    if (months > 0) {
      secondary = { value: `${months} mnd`, label: 'resterend', tone: 'neutral' }
    }
  }
  return { primary, secondary }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Bereken het KPI-paar voor één asset. Onbekende of niet-aggregeerbare
 * data resulteert in een lege of half-gevulde `KpiPair` — de UI verbergt
 * lege slots zelf.
 */
export function computeAssetKpi(asset: Asset, ctx: AssetKpiContext = {}): KpiPair {
  const dispatch: Record<AssetType, (a: Asset, c: AssetKpiContext) => KpiPair> = {
    cash: kpiCash,
    savings: kpiSavings,
    investment: kpiInvestment,
    retirement: kpiRetirement,
    eigen_huis: kpiEigenHuis,
    real_estate: kpiRealEstate,
    crypto: kpiCrypto,
    vehicle: kpiVehicle,
    physical: kpiPhysical,
    deelneming: kpiDeelneming,
    levensverzekering: kpiLevensverzekering,
    vordering: kpiVordering,
    other: () => ({}),
  }
  const fn = dispatch[asset.asset_type]
  return fn ? fn(asset, ctx) : {}
}
