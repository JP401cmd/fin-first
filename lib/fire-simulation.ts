/**
 * FIRE Simulatie Engine — gedeelde typen en cashflow-conversie.
 *
 * Bevat: typen (SimRow/SimResult/SimCashflow), lifeEventsToCashflows(),
 * previewEventCashflows(). De legacy `runSimulation()`-engine is in C5-c
 * verwijderd; v2 (`lib/horizon-engine/`) is de enige FIRE-rekenmotor.
 * Pure functions, geen Supabase dependency.
 */

import {
  type LifeEvent,
  type UserDefinedCashflow,
  type ChildrenMetadata,
  type AOWMetadata,
  type PensionMetadata,
  type InheritanceMetadata,
  type BegrafenisMetadata,
  NIBUD_CHILDREN_MONTHLY_COST,
  computeAowMonthly,
  normalizePensionType,
  annuitizePension,
  berekenErfbelasting,
  berekenKinderopvangNetto,
  kinderbijslagPerMaand,
  type WerkMetadata,
} from '@/lib/horizon-data'
import { type FireEndStrategy } from '@/lib/fire-strategy'
import { werkMetadataToCashflows } from '@/lib/werk-strategie'

// ── Types ───────────────────────────────────────────────────────────────────

export type ReturnModel = 'classic' | 'nl_box3'

export interface SimCashflow {
  id: string
  name: string
  type: 'recurring' | 'one_time'
  direction: 'income' | 'expense'
  amount: number       // always positive; direction determines sign
  fromAge: number      // age at which cashflow starts / one-time occurs
  toAge: number | null // recurring: stops at this age (null = until endAge); one_time: ignored
  indexed: boolean     // true: amount grows with inflation
  /**
   * Optional portfolio shock (signed proportion). When set on a one-time
   * cashflow, the simulation engine multiplies the running portfolio by
   * (1 + portfolioPct) at fromAge instead of adding `amount`. Used by
   * market_shock events so the loss scales with the portfolio at that age.
   * Examples: -0.37 = 37% drop, +0.20 = 20% gain.
   */
  portfolioPct?: number
  /**
   * Als `true`, telt deze recurring flow alléén mee zolang de gebruiker werkt
   * (de engine `werkt`-gate). Gebruikt door de Werk-strategie zodat salaris-
   * delta's exact dezelfde werk-stopgrens volgen als het basissalaris en niet
   * de onttrekkingsfase in lekken. AOW/pensioen laten dit ongezet (inkomen ná werk).
   */
  onlyWhileWorking?: boolean
}

export interface IncomeExpenseItem {
  id: string        // 'savings' | 'growth' | 'withdrawal' | 'box3' | cf.id
  label: string     // 'Besparingen' | 'Rendement' | cf.name
  amount: number    // altijd positief
}

export interface SimRow {
  age: number
  phase: 'accumulation' | 'retirement'
  startPortfolio: number
  growth: number
  savings: number
  withdrawal: number
  cashflowNet: number
  oneTimeNet: number
  endPortfolio: number
  grossIncome: number
  grossExpenses: number
  /** Vermogensstromen: totaal aanvulling op netto vermogen */
  flowIn: number
  /** Vermogensstromen: totaal onttrekking van netto vermogen */
  flowOut: number
  incomeBreakdown?: IncomeExpenseItem[]
  expenseBreakdown?: IncomeExpenseItem[]
}

export interface SimResult {
  /** One combined path: accumulation rows + decumulation rows */
  rows: SimRow[]
  /** Computed FIRE age as integer (null if not reachable within endAge) */
  fireAge: number | null
  /** Fractional FIRE age with sub-year precision (e.g. 52.3) */
  fireAgeFractional: number | null
  /** Portfolio value at the computed FIRE age */
  firePortfolioAtFire: number
  /** Minimum portfolio at fireAge so portfolio = 0 at endAge */
  requiredFirePortfolio: number
  /** Whether FIRE is reachable before endAge */
  fireReachable: boolean
  /** yearlyExpenses / requiredFirePortfolio */
  implicitWithdrawalRate: number
  /** Classic 25× comparison target */
  classic25xTarget: number
  /** Which strategy was used */
  strategy: FireEndStrategy
  /** Target end portfolio (0 for deplete, indexed legacy amount, 0 for perpetual) */
  targetEndPortfolio: number
  /** Effective end age used for display (chart x-axis) */
  displayEndAge: number
}

// ── LifeEvent → SimCashflow conversie ──────────────────────────────────────

/**
 * Converteert app-data LifeEvents naar SimCashflows voor de simulatie-engine.
 * AOW wordt niet hardcoded toegevoegd — het staat als levensgebeurtenis in de DB.
 *
 * `skipEventIds` (optioneel): events waarvan de OPBRENGST-portie al door de
 * v2-grootboek-engine wordt afgehandeld als asset-liquidatie (generieke niet-
 * liquide verkoop, zie `buildGenericAssetLiquidations`). Voor die events wordt
 * UITSLUITEND de eenmalige opbrengst onderdrukt — de generieke `one_time_cost`-
 * cashflow ÉN custom `metadata.cashflows` van het event — zodat de verkoop niet
 * dubbel telt (één keer als liquidatie + één keer als inkomen-cashflow). De
 * `monthly_cost_change` (bv. wegvallend onderhoud) en `monthly_income_change`
 * BLIJVEN bestaan: dat zijn legitieme losse gevolgen van de verkoop.
 */
export function lifeEventsToCashflows(events: LifeEvent[], skipEventIds?: Set<string>): SimCashflow[] {
  const flows: SimCashflow[] = []

  for (const ev of events) {
    if (!ev.is_active) continue
    const age = ev.target_age ?? null
    if (age === null) continue

    const isIndexed = ev.is_indexed ?? true
    const meta = ev.metadata ?? {}

    // Verkoop-event dat de engine al als asset-liquidatie verwerkt: onderdruk de
    // opbrengst-cashflows (one_time_cost + custom cashflows), behoud de
    // maandelijkse gevolgen. Zie de doc-comment hierboven.
    const liquidationHandled = skipEventIds?.has(ev.id) === true

    // ── Metadata-enhanced processing per event type ──
    // When metadata is present, generate more accurate phased cashflows
    // and skip the generic fallback for the same cost categories.

    let skipGenericCost = false
    let skipGenericMonthlyCost = false
    let skipGenericMonthlyIncome = false

    // Children: phased costs by age period (NIBUD-based) + kinderopvang + kinderbijslag
    if (ev.event_type === 'children' && meta.aantalKinderen) {
      const m = meta as ChildrenMetadata
      const count = Math.min(4, Math.max(1, Number(m.aantalKinderen) || 1))
      // NIBUD phases: 0-3 baby (120%), 4-11 basisschool (100%), 12-17 tiener (130%)
      const baseCost = NIBUD_CHILDREN_MONTHLY_COST[count] ?? NIBUD_CHILDREN_MONTHLY_COST[4]!
      const phases = [
        { label: 'baby/peuter', factor: 1.2, fromAge: age, toAge: age + 4 },
        { label: 'basisschool', factor: 1.0, fromAge: age + 4, toAge: age + 12 },
        { label: 'tiener', factor: 1.3, fromAge: age + 12, toAge: age + 18 },
      ]
      for (const phase of phases) {
        const amount = Math.round(baseCost * phase.factor)
        flows.push({
          id: `le-children-${phase.label}-${ev.id}`,
          name: `${ev.name} (${phase.label})`,
          type: 'recurring',
          direction: 'expense',
          amount,
          fromAge: phase.fromAge,
          toAge: phase.toAge,
          indexed: true,
        })
      }

      // Kinderopvang: netto kosten na toeslag, typisch 0-4 jaar
      const opvangDagen = Number(m.kinderopvangDagen ?? 0)
      if (opvangDagen > 0) {
        const nettoOpvang = berekenKinderopvangNetto(opvangDagen, count)
        flows.push({
          id: `le-children-opvang-${ev.id}`,
          name: `${ev.name} (kinderopvang)`,
          type: 'recurring',
          direction: 'expense',
          amount: nettoOpvang,
          fromAge: age,
          toAge: age + 4, // Kinderopvang typically 0-4 years
          indexed: true,
        })
      }

      // Kinderbijslag: income over full 0-18 period
      const useKinderbijslag = m.kinderbijslag !== false
      if (useKinderbijslag) {
        const kbPerMaand = kinderbijslagPerMaand(count)
        flows.push({
          id: `le-children-kb-${ev.id}`,
          name: `${ev.name} (kinderbijslag)`,
          type: 'recurring',
          direction: 'income',
          amount: kbPerMaand,
          fromAge: age,
          toAge: age + 18,
          indexed: true,
        })
      }

      skipGenericMonthlyCost = true
      skipGenericMonthlyIncome = true
    }

    // AOW: adjust amount based on leefsituatie and opbouwpercentage
    if (ev.event_type === 'aow' && (meta.leefsituatie || meta.jarenBuitenNL)) {
      const m = meta as AOWMetadata
      const adjustedAmount = computeAowMonthly(m.leefsituatie, m.jarenBuitenNL ?? m.jarenInNL)
      if (adjustedAmount > 0) {
        flows.push({
          id: `le-aow-adjusted-${ev.id}`,
          name: ev.name,
          type: 'recurring',
          direction: 'income',
          amount: adjustedAmount,
          fromAge: age,
          toAge: null, // AOW is levenslang
          indexed: true,
        })
      }
      skipGenericMonthlyIncome = true
    }

    // PENSION: type-bewuste uitkering (vervangt de generieke maandinkomen-fallback).
    // inleg → annuïteit; uitkeringsduur → toAge; partner-% verwerkt in de annuïteit
    // (geen aparte flow → geen dubbeltelling op de eigen tijdas).
    if (ev.event_type === 'pension') {
      const m = meta as PensionMetadata
      const pType = normalizePensionType(m.pensioenType)
      const ingang = m.ingangLeeftijd ?? age
      const duur = m.uitkeringsduur ?? 'levenslang'
      const inleg = Number(m.inlegBedrag ?? 0)
      const brutoMaand =
        inleg > 0
          ? annuitizePension({
              inlegBedrag: inleg,
              ingangLeeftijd: ingang,
              uitkeringsduur: duur,
              partnerUitkeringPct:
                pType === 'lijfrente_levenslang' ? m.partnerUitkeringPct : undefined,
            })
          : Number(m.brutoBedrag ?? ev.monthly_income_change ?? 0)
      if (brutoMaand > 0) {
        flows.push({
          id: `le-pension-${ev.id}`,
          name: ev.name,
          type: 'recurring',
          direction: 'income',
          amount: brutoMaand,
          fromAge: ingang,
          toAge: duur === 'levenslang' ? null : ingang + Number(duur),
          // Nieuwe potten zetten isGeindexeerd expliciet; legacy UPO-rijen vallen
          // terug op de rij-vlag zodat hun bestaande projectie niet stil verandert.
          indexed: m.isGeindexeerd ?? ev.is_indexed ?? false,
        })
      }
      skipGenericCost = true
      skipGenericMonthlyCost = true
      skipGenericMonthlyIncome = true
    }

    // WERK-strategie: loopbaan-/inkomenslijn → reële inkomens-DELTA-kasstromen
    // (groei/plafond/deeltijd/sprongen) t.o.v. het basisinkomen. Alle delta's
    // dragen onlyWhileWorking zodat ze de werk-stopgrens volgen. Vervangt de
    // generieke maandinkomen-fallback volledig.
    if (ev.event_type === 'werk') {
      const werkFlows = werkMetadataToCashflows(meta as WerkMetadata, {
        eventId: ev.id,
        name: ev.name,
        currentAge: age,
      })
      flows.push(...werkFlows)
      skipGenericCost = true
      skipGenericMonthlyCost = true
      skipGenericMonthlyIncome = true
    }

    // Inheritance: calculate netto after erfbelasting
    if (ev.event_type === 'inheritance' && meta.brutoBedrag) {
      const m = meta as InheritanceMetadata
      const bruto = Number(m.brutoBedrag) || 0
      const relatie = m.erfbelastingSchijf ?? 'overig'
      const result = berekenErfbelasting(bruto, relatie)
      const netto = result.netto
      if (netto > 0) {
        flows.push({
          id: `le-inheritance-netto-${ev.id}`,
          name: ev.name,
          type: 'one_time',
          direction: 'income',
          amount: netto,
          fromAge: age,
          toAge: age,
          indexed: false,
        })
      }
      skipGenericCost = true
    }

    // Market shock: one-time portfolio multiplier (signed pct on running portfolio)
    if (ev.event_type === 'market_shock') {
      const pct = Number(meta.shockPercentage ?? 0)
      if (pct !== 0) {
        flows.push({
          id: `le-shock-${ev.id}`,
          name: ev.name,
          type: 'one_time',
          direction: pct < 0 ? 'expense' : 'income',
          amount: 0,
          fromAge: age,
          toAge: age,
          indexed: false,
          portfolioPct: pct,
        })
      }
      skipGenericCost = true
      skipGenericMonthlyCost = true
      skipGenericMonthlyIncome = true
    }

    // Begrafenis: eenmalige kost = uitvaartkosten + extraWensen - verzekeringDekking + grafrechten
    if (ev.event_type === 'begrafenis') {
      const m = meta as BegrafenisMetadata
      const uitvaartkosten = Number(m.uitvaartkosten ?? 9000)
      const extraWensen = Number(m.extraWensen ?? 0)
      const heeftVerzekering = m.heeftVerzekering ?? false
      const verzekeringDekking = heeftVerzekering ? Number(m.verzekeringDekking ?? 0) : 0
      const uitvaartType = m.uitvaartType ?? 'begraven'
      const grafrechtenJaar = Number(m.grafrechtenJaar ?? 20)

      // Grafrechten: alleen bij begraven of natuurbegraven (niet bij crematie)
      // Geschatte kosten: ~€150/jaar voor grafrechten
      const grafrechtenKosten = (uitvaartType === 'begraven' || uitvaartType === 'natuurbegraven') && grafrechtenJaar > 0
        ? Math.round(grafrechtenJaar * 150)
        : 0

      const nettoKosten = Math.max(0, uitvaartkosten + extraWensen + grafrechtenKosten - verzekeringDekking)

      if (nettoKosten > 0) {
        flows.push({
          id: `le-begrafenis-${ev.id}`,
          name: ev.name,
          type: 'one_time',
          direction: 'expense',
          amount: nettoKosten,
          fromAge: age,
          toAge: age,
          indexed: false,
        })
      }
      skipGenericCost = true
    }

    // ── User-defined custom cashflows from metadata ──
    // Bij een door de engine afgehandelde liquidatie worden deze opbrengst-
    // cashflows onderdrukt (anders dubbeltelling met de asset-liquidatie).
    const customFlows = liquidationHandled
      ? []
      : (meta.cashflows as UserDefinedCashflow[] | undefined) ?? []
    if (customFlows.length > 0) {
      for (const cf of customFlows) {
        const dur = cf.durationMonths > 0 ? Math.ceil(cf.durationMonths / 12) : null
        flows.push({
          id: `le-custom-${ev.id}-${cf.id}`,
          name: cf.name || ev.name,
          type: cf.type,
          direction: cf.direction,
          amount: cf.amount,
          fromAge: age,
          toAge: dur != null ? age + dur : null,
          indexed: cf.indexed,
        })
      }
      // Custom cashflows replace the generic fallback
      skipGenericCost = true
      skipGenericMonthlyCost = true
      skipGenericMonthlyIncome = true
    }

    // ── Generic fallback: use stored amounts (backward compatible) ──

    // 1. Eenmalige kosten (one_time_cost) — eenmalige bedragen zijn nooit geïndexeerd.
    //    Bij een door de engine afgehandelde liquidatie wordt de eenmalige
    //    opbrengst (one_time_cost < 0) onderdrukt zodat de verkoop niet dubbel telt.
    if (!skipGenericCost && !liquidationHandled) {
      const cost = Number(ev.one_time_cost ?? 0)
      if (cost !== 0) {
        flows.push({
          id: `le-cost-${ev.id}`,
          name: ev.name,
          type: 'one_time',
          direction: cost > 0 ? 'expense' : 'income',
          amount: Math.abs(cost),
          fromAge: age,
          toAge: age,
          indexed: false,
        })
      }
    }

    // 2. Maandelijkse kostenwijziging (monthly_cost_change)
    if (!skipGenericMonthlyCost) {
      const monthlyCost = Number(ev.monthly_cost_change ?? 0)
      if (monthlyCost !== 0) {
        const toAge = ev.duration_months && ev.duration_months > 0
          ? age + ev.duration_months / 12
          : null
        flows.push({
          id: `le-costchange-${ev.id}`,
          name: ev.name,
          type: 'recurring',
          direction: monthlyCost > 0 ? 'expense' : 'income',
          amount: Math.abs(monthlyCost),
          fromAge: age,
          toAge,
          indexed: isIndexed,
        })
      }
    }

    // 3. Maandelijkse inkomenswijziging (monthly_income_change)
    if (!skipGenericMonthlyIncome) {
      const monthlyIncome = Number(ev.monthly_income_change ?? 0)
      if (monthlyIncome !== 0) {
        const toAge = ev.duration_months && ev.duration_months > 0
          ? age + ev.duration_months / 12
          : null
        flows.push({
          id: `le-incomechange-${ev.id}`,
          name: ev.name,
          type: 'recurring',
          direction: monthlyIncome > 0 ? 'income' : 'expense',
          amount: Math.abs(monthlyIncome),
          fromAge: age,
          toAge,
          indexed: isIndexed,
        })
      }
    }
  }

  return flows
}

/**
 * Preview cashflows for a single life event, regardless of is_active or target_age.
 * Useful for displaying calculated flows in modal previews before saving.
 */
export function previewEventCashflows(event: LifeEvent): SimCashflow[] {
  const previewEvent: LifeEvent = {
    ...event,
    is_active: true,
    target_age: event.target_age ?? 40, // fallback for preview
  }
  return lifeEventsToCashflows([previewEvent])
}
