/**
 * Tekort-lening-zichtbaarheid (V7, pure).
 *
 * De horizon-kernel-bridge levert per rij `debtBalances['tekort-lening']` — maar
 * alléén in de jaren waarin de synthetische tekort-lening daadwerkelijk is
 * aangesproken (saldo > 0; zie lib/horizon-kernel/bridge.ts). De hoofd-grafiek plot
 * `netWorth` (waarin het tekort al gesaldeerd is) en vloert de lijn op 0 — daardoor
 * is een aangesproken tekort-lening in Pad-modus volledig ONzichtbaar.
 *
 * ONTWERPBESLUIT (hoofdthread): de 0-vloer van de lijn NIET verwijderen — die is een
 * y-schaal-invariant over meerdere render-sites en `netWorth` is rekenkundig al de
 * waarheid. WEL een expliciet, uitlegbaar signaal in de bestaande chart-/status-taal:
 * deze detector leidt de eerste leeftijd + de piek van de tekort-lening uit de rijen
 * af, zodat /toekomst er een stoplicht-melding (+ optioneel een marker) bij kan tonen.
 *
 * BESLUIT 4 juli 2026 (eigenaar): bij een "Vermogen opeten"-eindstrategie ontstaat
 * na de eindleeftijd per definitie een enorme tekort-lening-staart — dat is
 * modelmarge, geen meldenswaardig feit. De detector telt de tekort-lening daarom
 * alleen mee t/m `endAge − 1`; rijen op/na `endAge` worden genegeerd, óók voor de
 * piek-bepaling. Zonder `endAge` (null/undefined) blijft het oude gedrag: geen cutoff.
 *
 * CALLERS: lever de KÉRNEL-eindleeftijd aan (`SimResult.displayEndAge` — bij
 * doorlopende strategieën perpetual/pensioen is dat de horizon-cap 100, bij
 * deplete/legacy de plan-eindleeftijd fire_end_age), NIET de rauwe
 * `profiles.fire_end_age`. Zo clippen alle Toekomst-oppervlakken op exact dezelfde
 * eindleeftijd die de run zelf hanteerde (geen dual-source-divergentie).
 *
 * Pure functie — geen React/Supabase/Date.now.
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'

export interface DeficitLoanNotice {
  /** Eerste leeftijd (rij-as) waarop het tekort-lening-saldo > 0 is. */
  firstAge: number
  /** Hoogste tekort-lening-eindsaldo over alle rijen (afgerond, nominaal). */
  peak: number
}

/** Opties voor de tekort-lening-detectie. */
export interface DeficitLoanDetectOptions {
  /**
   * Eindleeftijd van het plan. Wanneer gezet, tellen alleen rijen met
   * `age <= endAge − 1` mee (staart op/na de eindleeftijd = modelmarge, besluit
   * 4 juli 2026). Null/undefined ⇒ geen cutoff (oud gedrag).
   */
  endAge?: number | null
}

/**
 * Detecteer of en wanneer de tekort-lening wordt aangesproken.
 *
 * @returns `{ firstAge, peak }` zodra ≥1 rij binnen het venster een tekort-lening-
 *          saldo > 0 heeft; anders `null` (geen tekort-lening → geen melding).
 *          v2-rijen dragen de sleutel niet, dus daar is het resultaat per
 *          constructie `null`. Zie de module-docstring voor de endAge-cutoff.
 */
export function detectDeficitLoanFromRows(
  rows: readonly UnifiedProjectionRow[] | null | undefined,
  opts?: DeficitLoanDetectOptions,
): DeficitLoanNotice | null {
  if (!rows || rows.length === 0) return null
  // endAge gegeven (en eindig) → venster = rijen t/m endAge − 1; anders geen
  // bovengrens. Number.isFinite dekt naast null/undefined ook een NaN-bron af,
  // zodat die de cutoff niet stil uitschakelt.
  const endAge = opts?.endAge
  const cutoff = Number.isFinite(endAge)
    ? (endAge as number) - 1
    : Number.POSITIVE_INFINITY
  let firstAge: number | null = null
  let peak = 0
  for (const r of rows) {
    if (r.age > cutoff) continue
    const endBalance = r.debtBalances['tekort-lening']?.endBalance ?? 0
    if (endBalance > 0) {
      if (firstAge === null) firstAge = r.age
      if (endBalance > peak) peak = endBalance
    }
  }
  if (firstAge === null) return null
  return { firstAge, peak: Math.round(peak) }
}
