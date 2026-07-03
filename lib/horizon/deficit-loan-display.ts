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
 * Pure functie — geen React/Supabase/Date.now.
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'

export interface DeficitLoanNotice {
  /** Eerste leeftijd (rij-as) waarop het tekort-lening-saldo > 0 is. */
  firstAge: number
  /** Hoogste tekort-lening-eindsaldo over alle rijen (afgerond, nominaal). */
  peak: number
}

/**
 * Detecteer of en wanneer de tekort-lening wordt aangesproken.
 *
 * @returns `{ firstAge, peak }` zodra ≥1 rij een tekort-lening-saldo > 0 heeft;
 *          anders `null` (geen tekort-lening → geen melding). v2-rijen dragen de
 *          sleutel niet, dus daar is het resultaat per constructie `null`.
 */
export function detectDeficitLoanFromRows(
  rows: readonly UnifiedProjectionRow[] | null | undefined,
): DeficitLoanNotice | null {
  if (!rows || rows.length === 0) return null
  let firstAge: number | null = null
  let peak = 0
  for (const r of rows) {
    const endBalance = r.debtBalances['tekort-lening']?.endBalance ?? 0
    if (endBalance > 0) {
      if (firstAge === null) firstAge = r.age
      if (endBalance > peak) peak = endBalance
    }
  }
  if (firstAge === null) return null
  return { firstAge, peak: Math.round(peak) }
}
