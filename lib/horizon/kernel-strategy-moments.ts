/**
 * Kernel-afgeleide strategiemomenten (feature #876, pure, rows-first).
 *
 * De Gebeurtenissen-tab toont naast de door de gebruiker beheerde events ook
 * momenten die de kernel ZELF uit het plan afleidt ("Berekend door je plan"):
 * de opeethypotheek-levensduur en het einde van eindige pensioenpotten. Deze
 * helpers leiden die momenten af uit dezelfde kernel-run als de Tijdas-grafiek
 * (`useHorizonFireSim` → `unifiedRows` + bridge-weergavevelden), zodat tab en
 * grafiek per constructie hetzelfde vertellen.
 *
 * Bron-signalen:
 *  - Opeet: de rij-weergavevelden `opeetOpname` (jaarsom Bez!BE) en `opeetCap`
 *    (max Bez!BD; > 0 = opeet-venster actief), gezet door de kernel-bridge —
 *    alléén in opeet-modus. Zie lib/horizon-kernel/bridge.ts#buildRow.
 *  - Pensioen: de rijen dragen pensioen alleen geaggregeerd (CF!H →
 *    `grossIncome`), dus het per-pot einde komt uit het bridge-weergaveveld
 *    `kernelPensionPots` (spiegel van Auto-gebeurtenissen rij 26-31, J-M); de
 *    rijen begrenzen hier alleen de weergave-horizon.
 *
 * Pure functies — geen React/Supabase/Date.now. Puur weergave: deze afleidingen
 * voeden NOOIT lifeEvents of simulatie-invoer terug (regressie-eis #876).
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { KernelPensionPotView } from '@/lib/horizon-kernel/bridge'

// ── Opeethypotheek-levensduur ────────────────────────────────────────────────

export interface OpeetLifespan {
  /** Leeftijd (rij-as, hele jaren) van het eerste jaar met een opname > 0. */
  startAge: number
  /** Totaal opgenomen bedrag over de horizon (nominaal, afgerond). */
  totalDrawn: number
  /**
   * Leeftijd waarop de leenruimte is uitgeput: het eerste jaar ná de start
   * zonder opname terwijl het opeet-venster nog actief is (`opeetCap > 0`) —
   * "pot 0 ná start". `null` = niet uitgeput binnen de horizon.
   */
  depletionAge: number | null
}

/**
 * Leid start/uitputting/totaal van de opeethypotheek af uit de jaar-rijen.
 *
 * @returns `null` wanneer er geen rijen zijn of geen enkele opname plaatsvindt
 *          (geen opeet-strategie, of het venster gaat nooit open). Rijen zonder
 *          opeet-weergavevelden (alle niet-opeet-modi) leveren per constructie
 *          `null`.
 */
export function deriveOpeetLifespanFromRows(
  rows: readonly UnifiedProjectionRow[] | null | undefined,
): OpeetLifespan | null {
  if (!rows || rows.length === 0) return null
  let startAge: number | null = null
  let depletionAge: number | null = null
  let totalDrawn = 0
  for (const r of rows) {
    const opname = r.opeetOpname ?? 0
    if (opname > 0) {
      if (startAge === null) startAge = r.age
      totalDrawn += opname
    } else if (startAge !== null && depletionAge === null && (r.opeetCap ?? 0) > 0) {
      // Venster nog actief maar geen opname meer → leenruimte uitgeput.
      depletionAge = r.age
    }
  }
  if (startAge === null) return null
  return { startAge, totalDrawn: Math.round(totalDrawn), depletionAge }
}

// ── Pensioenpot-einde (eindige duur) ─────────────────────────────────────────

export interface PensionPotEnd {
  /** Naam van de pot (kolom A). */
  naam: string
  /** Leeftijd waarop de uitkering stopt (kolom L = ingang + duur). */
  endAge: number
  /** Bruto maandbedrag dat wegvalt (kolom K, afgerond). */
  maandbedrag: number
}

/**
 * Pensioenpot-eindes binnen de weergave-horizon, gesorteerd op leeftijd.
 * Levenslange potten (`bedrijf`/`lijfrente_levenslang`) hebben géén einde-rij;
 * eindes buiten de rij-horizon (ná de laatste rij-leeftijd) of vóór de eerste
 * rij-leeftijd (pot al gestopt) worden niet getoond.
 */
export function derivePensionPotEndFromRows(
  rows: readonly UnifiedProjectionRow[] | null | undefined,
  pots: readonly KernelPensionPotView[] | null | undefined,
): PensionPotEnd[] {
  if (!rows || rows.length === 0 || !pots || pots.length === 0) return []
  const firstAge = rows[0].age
  const lastAge = rows[rows.length - 1].age
  return pots
    .filter((p) => !p.levenslang && p.eindLeeftijd > firstAge && p.eindLeeftijd <= lastAge)
    .map((p) => ({ naam: p.naam, endAge: p.eindLeeftijd, maandbedrag: Math.round(p.maandbedrag) }))
    .sort((a, b) => a.endAge - b.endAge)
}
