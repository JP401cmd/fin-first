/**
 * Shared types + pure computation for the vier-hefbomen-kompas.
 *
 * This file deliberately has NO 'use client' directive so it can be imported
 * by both server components (e.g. app/(app)/layout.tsx) and client components
 * (e.g. lever-compass.tsx, responsive-shell.tsx).
 */

import { box3TaxStatus } from '@/lib/box3-taxable-input'
import { hasDebtRatioData, scoreDebtRatio } from '@/lib/financial-health'
import { LEVERAGE_STATUS_LABEL, type LeverageStatus } from '@/lib/leverage-status'

// ── Types ────────────────────────────────────────────────────────────────────

export type LeverStatus = 'green' | 'amber' | 'red' | 'neutral'

// ── Statusvocabulaire: één vertaling, één woordenlijst ───────────────────────
//
// Het kompas rekent in `LeverStatus` (green/amber/red/neutral), de kaarten en
// de status-dots in `LeverageStatus` (good/warn/bad/neutral). Diezelfde
// vertaling stond drie keer met de hand overgeschreven — hier (voor de
// tax-lever), in `hefbomen-nav.tsx` en impliciet in de pariteitstest — en
// dáárnaast bestonden twee EIGEN woordenlijsten ("Gezond/Aandacht/Zorg/Geen
// data") in `lever-compass.tsx` en `sidebar.tsx`. Gevolg op één scherm:
// de Belasting-hefboomkaart droeg het generieke `LEVERAGE_STATUS_LABEL`-woord
// ("Goed op koers") terwijl het kompas ernaast "Gezond" zei, en de sidebar
// zijn eigen derde kopie las — terwijl de Box 1/2/3-kinderen in diezelfde
// sidebar wél al `LEVERAGE_STATUS_LABEL` gebruikten (bug UR2-04).
//
// Sindsdien geldt: de vertaling staat hier, en het WOORD komt uit de ene
// generieke lijst `LEVERAGE_STATUS_LABEL` (lib/leverage-status.ts). De
// domeinspecifieke oordelen ("Goed gespreid", "Hoge schuldenlast") blijven
// bewust een aparte laag — zie lib/hefboom-status-copy.ts.

/** Kompasvocabulaire → kaart-/dot-vocabulaire. */
export function leverToLeverageStatus(status: LeverStatus): LeverageStatus {
  return status === 'green'
    ? 'good'
    : status === 'amber'
      ? 'warn'
      : status === 'red'
        ? 'bad'
        : 'neutral'
}

/** Kaart-/dot-vocabulaire → kompasvocabulaire. */
export function leverageToLeverStatus(status: LeverageStatus): LeverStatus {
  return status === 'good'
    ? 'green'
    : status === 'warn'
      ? 'amber'
      : status === 'bad'
        ? 'red'
        : 'neutral'
}

/**
 * Het generieke statuswoord bij een kompas-status — dezelfde ene lijst die de
 * hefboomkaart, de status-dot en de status-duiding-melding lezen.
 */
export function leverStatusLabel(status: LeverStatus): string {
  return LEVERAGE_STATUS_LABEL[leverToLeverageStatus(status)]
}

export type LeverEntry = {
  score: number | null
  status: LeverStatus
  /** Korte detailtekst voor tooltip, bv. "4 typen · € 834k". */
  detail: string
  /** Optioneel: voortgangspercentage (0–100) voor visuele ring indicator. */
  progress?: number | null
}

export type LeverScores = {
  /** Bezittingen: diversificatie + omvang. */
  assets: LeverEntry
  /** Schulden: schuld-vermogen-ratio. */
  debts: LeverEntry
  /** Cashflow: spaarquote (canoniek 6-maands) + budget-health. */
  cashflow: LeverEntry
  /** Belasting: box3-exposure. */
  tax: LeverEntry
}

// ── Score computation ────────────────────────────────────────────────────────

function statusFromScore(score: number | null): LeverStatus {
  if (score === null) return 'neutral'
  if (score >= 60) return 'green'
  if (score >= 30) return 'amber'
  return 'red'
}

/**
 * Bereken de 4 hefboomscores uit layout-data.
 *
 * Wordt aangeroepen in `app/(app)/layout.tsx` (server component). Parameters
 * komen uit de reeds-geladen asset/debt/transaction-queries — geen extra DB-
 * round-trips.
 */
/**
 * Format a EUR value to a short display string, e.g. "€ 142k" or "€ 1,2M".
 */
function fmtShort(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    const rounded = Math.round(m * 10) / 10
    return `${sign}€ ${rounded.toString().replace('.', ',')}M`
  }
  if (abs >= 1_000) {
    return `${sign}€ ${Math.round(abs / 1_000)}k`
  }
  return `${sign}€ ${Math.round(abs)}`
}

export function computeLeverScores(input: {
  totalAssets: number
  totalDebts: number
  /** Totale oorspronkelijke schuldbedragen (sum original_amount). Voor payoff-voortgang. */
  totalOriginalDebts?: number
  /** Aantal actieve schulden. */
  debtCount?: number
  assetTypeCount: number
  /** Canonieke 6-maands spaarquote (%) uit savingsRateFromAggregates (incl.
   *  spaarbudget- + aflossing-correctie). null = onvoldoende transactiedata. */
  savingsRate: number | null
  /** Totaal box3-belast vermogen boven vrijstelling. */
  box3TaxableAboveThreshold: number
  /** Of de gebruiker box3-belastbare assets heeft (cash, savings, investment, etc.). Geen → neutral. */
  hasBox3Assets?: boolean
  /** Huishoudtype: 'solo' | 'samen' | 'gezin'. Partner verdubbelt vrijstelling → optimalisatie-kans. */
  householdType?: string
  /** Aantal top-level budgets met limiet (expense/savings). */
  budgetsTotal?: number
  /** Aantal budgets die op schema liggen (spent ≤ limit). */
  budgetsOnTrack?: number
  /** Aantal budgets die over limiet zijn (spent > limit). */
  budgetsOver?: number
}): LeverScores {
  // 1. Bezittingen: diversificatie
  // Bij géén assets → null (neutral/grijs) — er is niets om te beoordelen.
  // Bij wel assets → score 20–100 op basis van diversificatie.
  const assetScore: number | null = input.assetTypeCount <= 0
    ? null
    : input.assetTypeCount >= 5
      ? 100
      : Math.round((input.assetTypeCount / 5) * 100)

  // 2. Schulden: debt-to-asset ratio
  //
  // CANONIEK: exact de curve van de gezondheidspijler `debt_ratio`
  // (`scoreDebtRatio`, lib/financial-health.ts). Die formule stond hier tot
  // UR2-10 als letterlijke tweede kopie — twee eigenaren van één curve, en dus
  // per definitie toekomstige drift.
  //
  // Niets geregistreerd (geen vermogen én geen schuld) → `null` → 'neutral'.
  // Dát is wat deze tak altijd al BEDOELDE — het commentaar zei "neutral — no
  // financial data" — maar niet DEED: hij gaf 50 terug, en 50 valt in de
  // amber-band (>= 30). Op een schoon account las je daardoor op /overzicht de
  // kaart "Schuldenlast vraagt aandacht" bóven zijn eigen detailregel "Geen data
  // — Start", naast een gezondheidsscore-onderverdeling "Schuld: 80" (bug
  // UR2-10). De drie andere hefbomen coderen 'geen data' al als `null`; de
  // schulden-tak was de enige met een magisch middengetal. `lib/page-status/
  // resolve.ts` moest die synthetische amber daarom met een string-sentinel uit
  // de status-banner houden — die vangrail is nu overbodig geworden.
  //
  // Let op de grens: géén schulden mét vermogen blijft gewoon 100/groen
  // (schuldenvrij). Alleen het volledig lege account is 'geen oordeel'.
  const debtScore: number | null = hasDebtRatioData(input.totalAssets, input.totalDebts)
    ? scoreDebtRatio(input.totalAssets, input.totalDebts)
    : null

  // 3. Cashflow: combined savings rate + budget health (#847)
  //
  // Savings-rate component (0–100):
  let savingsComponent: number | null
  if (input.savingsRate === null) {
    savingsComponent = null
  } else if (input.savingsRate <= 0) {
    savingsComponent = Math.max(0, Math.round(20 + input.savingsRate))
  } else if (input.savingsRate >= 30) {
    savingsComponent = 100
  } else if (input.savingsRate >= 20) {
    savingsComponent = Math.round(80 + ((input.savingsRate - 20) / 10) * 20)
  } else if (input.savingsRate >= 10) {
    savingsComponent = Math.round(50 + ((input.savingsRate - 10) / 10) * 30)
  } else {
    savingsComponent = Math.round((input.savingsRate / 10) * 30 + 20)
  }

  // Budget-health component (0–100):
  // Green (≥60): alle budgets op schema
  // Amber (30–59): 1–2 budgets over limiet
  // Red (<30): 3+ budgets over limiet
  const bTotal = input.budgetsTotal ?? 0
  const bOver = input.budgetsOver ?? 0
  let budgetComponent: number | null
  if (bTotal <= 0) {
    budgetComponent = null // geen budgets → geen data
  } else if (bOver === 0) {
    budgetComponent = 100 // alles op schema
  } else if (bOver <= 2) {
    budgetComponent = Math.round(50 - (bOver - 1) * 10) // 1→50, 2→40
  } else {
    budgetComponent = Math.max(0, Math.round(25 - (bOver - 3) * 5)) // 3→25, 4→20, 5→15...
  }

  // Combined score: blend beide componenten (50/50 als beide beschikbaar)
  let cashflowScore: number | null
  if (savingsComponent !== null && budgetComponent !== null) {
    cashflowScore = Math.round((savingsComponent + budgetComponent) / 2)
  } else if (budgetComponent !== null) {
    cashflowScore = budgetComponent
  } else {
    cashflowScore = savingsComponent // null of een waarde
  }

  // 4. Belasting: tax optimization status (#848)
  //
  // Neutral (grijs): geen box3-belastbare assets → niets te optimaliseren
  // Green (gezond):  onder vrijstelling → optimaal, geen belasting verschuldigd
  // Green (gezond):  boven vrijstelling maar beperkt + partner → geoptimaliseerd
  // Amber (aandacht): boven vrijstelling, optimalisatie mogelijk
  //   - Solo-huishouden met partner-potentieel
  //   - Significante blootstelling (>100k boven drempel)
  // Red (zorg): zeer hoge blootstelling (>500k boven drempel)
  const hasBox3 = input.hasBox3Assets ?? (input.box3TaxableAboveThreshold > 0 || input.totalAssets > 0)
  const hasPartner = input.householdType === 'samen' || input.householdType === 'gezin'
  let taxScore: number | null

  if (!hasBox3) {
    // Geen box3-relevante assets → geen belasting-data
    taxScore = null
  } else if (input.box3TaxableAboveThreshold <= 0) {
    // Onder vrijstelling → optimaal
    taxScore = 90
  } else if (input.box3TaxableAboveThreshold <= 100_000) {
    // Lichte blootstelling — amber: er is belasting verschuldigd, tips mogelijk
    taxScore = hasPartner ? 70 : 45
  } else if (input.box3TaxableAboveThreshold <= 500_000) {
    // Significante blootstelling — amber/red afhankelijk van partner-situatie
    taxScore = hasPartner ? 40 : 25
  } else {
    // Zeer hoge blootstelling
    taxScore = 20
  }

  // ── Detail text per lever ─────────────────────────────────────────────────
  const assetDetail = input.assetTypeCount <= 0
    ? 'Geen bezittingen geregistreerd — Start'
    : `${input.assetTypeCount} ${input.assetTypeCount === 1 ? 'type' : 'typen'} · ${fmtShort(input.totalAssets)}`

  // Detail en status delen sinds UR2-10 hetzelfde predicaat: de "— Start"-regel
  // verschijnt exact wanneer de status 'neutral' is, nooit meer los daarvan.
  let debtDetail: string
  if (!hasDebtRatioData(input.totalAssets, input.totalDebts)) {
    debtDetail = 'Geen data — Start'
  } else if (input.totalDebts <= 0) {
    debtDetail = 'Schuldenvrij'
  } else {
    // Payoff voortgang: percentage afbetaald o.b.v. original_amount vs current_balance
    const origTotal = input.totalOriginalDebts ?? 0
    const payoffPct = origTotal > 0
      ? Math.round(((origTotal - input.totalDebts) / origTotal) * 100)
      : 0
    // Richting: afnemend is goed (↓ symbool)
    const directionLabel = payoffPct > 0 ? ' · ↓ afnemend' : ''
    if (origTotal > 0 && payoffPct > 0) {
      debtDetail = `${payoffPct}% afbetaald · ${fmtShort(input.totalDebts)} resterend${directionLabel}`
    } else {
      const ratio = input.totalAssets > 0
        ? Math.round((input.totalDebts / input.totalAssets) * 100)
        : 100
      debtDetail = `${fmtShort(input.totalDebts)} · ${ratio}% van vermogen`
    }
  }

  // Cashflow detail: combine budget health + savings rate
  let cashflowDetail: string
  const budgetPart = bTotal > 0
    ? `${bTotal - bOver}/${bTotal} op schema`
    : null
  const savingsPart = input.savingsRate !== null
    ? `Spaarquote ${Math.round(input.savingsRate)}%`
    : null

  if (budgetPart && savingsPart) {
    cashflowDetail = `${budgetPart} · ${savingsPart}`
  } else if (budgetPart) {
    cashflowDetail = budgetPart
  } else if (savingsPart) {
    cashflowDetail = savingsPart
  } else {
    cashflowDetail = 'Onvoldoende transactiedata — Start'
  }

  let taxDetail: string
  if (!hasBox3) {
    taxDetail = 'Geen belastbare bezittingen — Start'
  } else if (input.box3TaxableAboveThreshold <= 0) {
    taxDetail = 'Onder vrijstelling'
  } else if (hasPartner && input.box3TaxableAboveThreshold <= 100_000) {
    taxDetail = `${fmtShort(input.box3TaxableAboveThreshold)} boven vrijstelling`
  } else {
    // H24 (Wft): de staart was "— optimalisatie aanbevolen". Deze detailtekst
    // wordt via {figure} in de status-banner van /overzicht/belasting
    // geïnterpoleerd, dus die aanbeveling landde letterlijk in de banner.
    // Beschrijvend gehouden; de verwijzing naar tips is navigatie, geen advies.
    // De twee resterende takken (geen partner; partner boven €100k) leverden
    // hetzelfde inzicht op en zijn daarom samengevoegd.
    taxDetail = `${fmtShort(input.box3TaxableAboveThreshold)} boven vrijstelling — bekijk tips`
  }

  // Schulden payoff voortgang: 0–100 (null als schuldenvrij of geen data)
  const origDebt = input.totalOriginalDebts ?? 0
  const debtProgress: number | null =
    input.totalDebts <= 0 ? (origDebt > 0 ? 100 : null) :
    origDebt > 0 ? Math.round(((origDebt - input.totalDebts) / origDebt) * 100) :
    null

  // Tax-status komt uit de gedeelde canonieke helper (box3-taxable-input.ts) —
  // dezelfde bron die de Belasting-kaart (Box 3) en de sidebar-Box-3-dot lezen,
  // zodat alle drie altijd dezelfde status tonen. De score (taxScore) blijft voor
  // de tooltip/ring; de status komt single-sourced uit box3TaxStatus, gemapt van
  // het LeverageStatus-vocabulaire (good/warn/bad) naar LeverStatus
  // (green/amber/red) dat het kompas rendert.
  const taxLeverageStatus = box3TaxStatus({
    box3TaxableAboveThreshold: input.box3TaxableAboveThreshold,
    hasBox3Assets: hasBox3,
    householdType: input.householdType,
  })
  const taxStatus: LeverStatus = leverageToLeverStatus(taxLeverageStatus)

  return {
    assets: { score: assetScore, status: statusFromScore(assetScore), detail: assetDetail },
    debts: { score: debtScore, status: statusFromScore(debtScore), detail: debtDetail, progress: debtProgress },
    cashflow: { score: cashflowScore, status: statusFromScore(cashflowScore), detail: cashflowDetail },
    tax: { score: taxScore, status: taxStatus, detail: taxDetail },
  }
}
