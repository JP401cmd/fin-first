/**
 * Shared types + pure computation for the vier-hefbomen-kompas.
 *
 * This file deliberately has NO 'use client' directive so it can be imported
 * by both server components (e.g. app/(app)/layout.tsx) and client components
 * (e.g. lever-compass.tsx, responsive-shell.tsx).
 */

import { hasDebtRatioData, scoreDebtRatio } from '@/lib/financial-health'
import { formatCurrency } from '@/lib/format'
import {
  FISCALE_RUIMTE_POST_LABEL,
  type FiscaleRuimteResult,
} from '@/lib/fiscale-ruimte'
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
  /** Cashflow: de EFFECTIEVE spaarquote (ADR 0121) + budget-health. */
  cashflow: LeverEntry
  /** Belasting: ONBENUTTE fiscale ruimte als aandeel van de eigen heffing (ADR 0177). */
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
  /**
   * De EFFECTIEVE spaarquote (%) — `resolveSavingsSource(...).effectiveSavingsRatePct`
   * (ADR 0121): de grondslag-geresolveerde quote, waar een handmatige of
   * budget-grondslag wint van de 6-maands transactiemeting. Hetzelfde getal als
   * de hefboomKAART op /overzicht toont (via
   * `healthScoreInput.effectiveSavingsRatePct`) en als het
   * instellingenblok onderaan /overzicht/budget noemt — met één benoemde
   * uitzondering, zie hieronder.
   *
   * Op een zuivere transactiegrondslag IS dat per definitie de meting
   * (`computeSavingsRate6m` → `savingsRateFromAggregates`, incl. spaarbudget- +
   * aflossing-correctie).
   *
   * `null` = de hefboom doet geen uitspraak. Dat is NIET alleen "geen grondslag
   * én geen transactiedata": het gebeurt óók op het zuivere transactiepad zodra
   * er wel 12-maands maar geen 6-maands transactie-inkomen is. `loadLeverScores`
   * geeft daar bewust geen profiel-fallback of vermogens-delta-schatting door,
   * waar de kaart die wél heeft — de volledige motivatie en de grens staan in de
   * kop van lib/lever-scores-loader.ts. Consumenten die het getal van de kaart
   * náást dit oordeel zetten (de rondleiding doet dat) moeten dus kunnen omgaan
   * met "wel een percentage, geen oordeel".
   *
   * Voedt zowel de detailregel ("Spaarquote 25%") als de SCORE/stoplichtkleur —
   * bewust samen: vóór B-030 stond hier de rauwe meting terwijl de kaart ernaast
   * het effectieve getal toonde, dus droeg één tegel een effectief cijfer met een
   * rauw afgeleid stipje.
   */
  savingsRate: number | null
  /**
   * De ONBENUTTE fiscale ruimte (ADR 0177) — status, ratio, posten en score in
   * één, uit de pure kern `computeFiscaleRuimte` (lib/fiscale-ruimte.ts).
   *
   * BEWUST EEN PARAMETER, GEEN AANROEP HIER: de scalars achter die kern
   * (partnerverdeling, jaarruimte, samenstelling-netto, Box 1- en
   * Box 3-heffing) komen uit de canonieke motoren op al-geladen rijen, en die
   * assemblage woont in `loadLeverScores` (lib/lever-scores-loader.ts). Eén
   * rekenweg, twee invoerkanalen (ADR 0177 D5) — het hefboompad hier en de
   * belasting-hub via `loadFiscaleKansen`.
   *
   * Dit VERVANGT de oude euro-banden (`box3TaxStatus` op
   * `box3TaxableAboveThreshold`, € 100k/€ 500k boven de vrijstelling). Die
   * maten vermogen, niet gedrag: monotoon dalend, zonder plafond, en zonder
   * handeling die ze groen kon maken behalve minder vermogen bezitten.
   * `box3TaxStatus` bestaat nog, maar uitsluitend als Box 3-kaart-/subpagina-
   * label (ADR 0177 D6) — niet meer als hefboomstatus.
   */
  fiscaleRuimte: FiscaleRuimteResult
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

  // 4. Belasting: ONBENUTTE FISCALE RUIMTE (ADR 0177)
  //
  // Score én status komen uit dezelfde pure kern, en de tax-lever routeert zijn
  // status bewust NIET via `statusFromScore` (dat deed hij vóór ADR 0177 ook
  // al niet) — anders kunnen band en ring uit elkaar lopen. `score` is
  // `100 − min(100, ratio × 400)`: 0% → 100, 5% → 80 (bovenkant groen),
  // 15% → 40 (bovenkant oranje). `null` = geen oordeel → neutral.
  const taxScore: number | null = input.fiscaleRuimte.score

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

  // Belasting-detail: de GROOTSTE openstaande post met zijn bedrag (ADR 0177
  // D4). Deze regel wordt via {figure} in de status-banner van
  // /overzicht/belasting geïnterpoleerd, dus hij blijft CONSTATEREND — het
  // label komt uit `FISCALE_RUIMTE_POST_LABEL` (één home, gedeeld met de
  // oorzaak-specifieke melding), nooit uit een tweede woordenlijst hier.
  //
  // De "— Start"-sentinel hangt exact aan `neutral`, net als bij de drie andere
  // hefbomen (invariant in lib/lever-scores.test.ts, waar lib/page-status/
  // resolve.ts op leunt). "Geen onbenutte ruimte" is GEEN geen-data-regel: daar
  // is wél gerekend, er valt alleen niets te halen.
  let taxDetail: string
  if (input.fiscaleRuimte.status === 'neutral') {
    taxDetail = 'Geen fiscale gegevens — Start'
  } else if (input.fiscaleRuimte.posten.length > 0) {
    const grootste = input.fiscaleRuimte.posten[0]
    taxDetail = `${FISCALE_RUIMTE_POST_LABEL[grootste.cause]} · ${formatCurrency(grootste.besparing)} per jaar`
  } else {
    taxDetail = 'Geen onbenutte ruimte'
  }

  // Schulden payoff voortgang: 0–100 (null als schuldenvrij of geen data)
  const origDebt = input.totalOriginalDebts ?? 0
  const debtProgress: number | null =
    input.totalDebts <= 0 ? (origDebt > 0 ? 100 : null) :
    origDebt > 0 ? Math.round(((origDebt - input.totalDebts) / origDebt) * 100) :
    null

  // Tax-status komt sinds ADR 0177 uit de pure kern `computeFiscaleRuimte`,
  // gemapt van het LeverageStatus-vocabulaire (good/warn/bad/neutral) naar
  // LeverStatus (green/amber/red/neutral) dat het kompas rendert. Score, status
  // en detailregel hebben daarmee ÉÉN bron: ze kunnen elkaar niet meer
  // tegenspreken, en de status kan de kansenlijst niet meer tegenspreken (het
  // rode alarm naast een lege kansenlijst verdwijnt per constructie).
  //
  // Wat hier stond: `box3TaxStatus` op het box 3-vermogen boven de
  // heffingsvrije voet. Die helper blijft bestaan voor het Box 3-KAARTLABEL en
  // de Box 3-subpagina (ADR 0177 D6), maar draagt het hefboomoordeel niet meer.
  const taxStatus: LeverStatus = leverageToLeverStatus(input.fiscaleRuimte.status)

  return {
    assets: { score: assetScore, status: statusFromScore(assetScore), detail: assetDetail },
    debts: { score: debtScore, status: statusFromScore(debtScore), detail: debtDetail, progress: debtProgress },
    cashflow: { score: cashflowScore, status: statusFromScore(cashflowScore), detail: cashflowDetail },
    tax: { score: taxScore, status: taxStatus, detail: taxDetail },
  }
}
