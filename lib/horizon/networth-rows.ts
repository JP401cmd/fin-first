/**
 * Geprojecteerd TOTAAL netto vermogen per jaar (incl. niet-liquide assets).
 *
 * (Verhuisd uit `lib/horizon-engine/networth-projection.ts` bij de v2-verwijdering,
 * FASE 6 stap 5A — de horizon-kernel is de enige motor. De v1/v2-downsize-begrippen
 * zijn gestript; de `houseInLedger`-semantiek blijft.)
 *
 * Achtergrond — de grafiek-dip op /overzicht (bug-fix jun 2026):
 *   De mini-vermogen-grafiek plot het Vandaag-punt + historie op het VOLLEDIGE
 *   netto vermogen (`currentNetWorth`, incl. eigen huis), maar de projectielijn
 *   op `endPortfolio` uit de FIRE-engine. Voor housing-modi die het huis uit de
 *   FIRE-pot FILTEREN (`exclude_from_fire`) bevat `endPortfolio` het huis NIET →
 *   de lijn sprong van "netto vermogen mét huis" naar "FIRE-portefeuille zónder
 *   huis": een zichtbare dip direct na vandaag.
 *
 * Deze helper levert náást `endPortfolio` een tweede reeks: het GEPROJECTEERDE
 * VOLLEDIGE netto vermogen per jaar = FIRE-portefeuille + meegroeiende niet-
 * liquide assets (huis) die uit de FIRE-pot zijn gefilterd. Zo blijft de lijn
 * continu met het Vandaag-punt.
 *
 * SSoT — géén tweede engine-run, géén tweede groeiformule:
 *   • De FIRE-portefeuille per jaar komt 1:1 uit `endPortfolio` (= LedgerRow
 *     `nettoVermogen`, nominaal via de bridge) — de kernel is de bron.
 *   • De huiswaarde-groei hergebruikt de canonieke `projectEigenHuisValuesAt`
 *     (per-asset `expected_return`, nominaal). De hypotheek-afbouw hergebruikt
 *     `projectMortgageStateAt`. Géén nieuwe WOZ/groeiformule.
 *
 * Per housing-variant (geen dubbeltelling):
 *   • houseInLedger (kernel-tak, ÉLKE modus) → huis zit AL in `endPortfolio`
 *     (de kernel houdt het eigen huis voor elke housing-modus in het grootboek,
 *     ADR 0015/0032). `simNetWorthRows ≡ endPortfolio`; tel niets bij.
 *   • include_full / reverse_mortgage → huis zit AL in `endPortfolio`. Idem.
 *   • exclude_from_fire (zonder houseInLedger) → huis is uit de pot gefilterd →
 *     tel de meegroeiende overwaarde (huiswaarde − hypotheeksaldo) bij `endPortfolio`.
 *
 * Continuïteit/SSoT: het Vandaag-punt en de historie tonen `currentNetWorth`
 * (gegrond op de healthScoreInput-grondslag). De engine-start (`endPortfolio` +
 * huisbijdrage in jaar 0) kan daar een fractie van afwijken (grondslag-/temporeel
 * verschil). We verankeren daarom de hele reeks op `currentNetWorth` door het
 * verschil in jaar 0 (de "reconcile-offset") over alle rijen te verschuiven. Dat
 * dicht óók de kleine include_full-knik. De offset is een vlakke verschuiving (in
 * euro's), niet een herschaling: relatieve groei van de engine blijft intact.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { ageAtDate } from '@/lib/horizon-data'
import {
  deriveHousingContext,
  projectEigenHuisValuesAt,
  projectMortgageStateAt,
  shouldFilterEigenHuisForFire,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'

export interface SimNetWorthRow {
  age: number
  /** Geprojecteerd VOLLEDIG netto vermogen (FIRE-pot + niet-liquide assets). */
  netWorth: number
}

export interface BuildSimNetWorthRowsParams {
  /** Per-jaar FIRE-portefeuille uit de engine (endPortfolio = LedgerRow nettoVermogen, nominaal). */
  simRows: { age: number; endPortfolio: number }[]
  /** Volledig netto vermogen vandaag (incl. huis) — het Vandaag-punt / historie-grondslag. */
  currentNetWorth: number
  /** Housing-strategie van de gebruiker. */
  housingStrategy: HousingStrategyConfig
  /**
   * Kernel-tak: de horizon-kernel houdt het eigen huis voor ÉLKE housing-modus in
   * het grootboek (ADR 0015/0032) — `endPortfolio` (= LedgerRow nettoVermogen) bevat
   * de overwaarde dus altijd al. Net als `applyHousingToComposition`'s `houseInLedger`-
   * tak (zie de /toekomst-vermogenssamenstelling in `horizon-client.tsx`) mag de huis-
   * overwaarde dan NOOIT nog eens worden bijgeteld — ook niet bij `exclude_from_fire`
   * (de enige filterende modus). Default false = overwaarde-optelling voor de
   * filterende modus (byte-identiek aan het gedrag van vóór de verhuizing).
   */
  houseInLedger?: boolean
  /** Alle (rauwe) assets — voor de eigen-huis-context. */
  assets: Asset[]
  /** Alle (rauwe) debts — voor de gekoppelde hypotheek-context. */
  debts: Debt[]
  /** Geboortedatum — voor leeftijd → maanden-vooruit projectie van de huiswaarde. */
  dateOfBirth: string | null
}

/**
 * Bouw `simNetWorthRows` — geprojecteerd VOLLEDIG netto vermogen per jaar.
 * Retourneert een lege array bij ontbrekende `simRows`.
 */
export function buildSimNetWorthRows(p: BuildSimNetWorthRowsParams): SimNetWorthRow[] {
  const rows = p.simRows
  if (!rows || rows.length === 0) return []

  // Modes die het huis NIET filteren: het zit al in endPortfolio. Eén ankerpunt
  // (currentNetWorth) houdt het Vandaag-punt en de projectie naadloos op één lijn.
  const housingFilters = shouldFilterEigenHuisForFire(p.housingStrategy)

  // Kernel-tak: het huis zit voor ÉLKE modus al in endPortfolio (grootboek) →
  // nooit overwaarde bijtellen. Spiegelt `applyHousingToComposition`'s
  // `if (houseInLedger) return baseRows`-kortsluiting (geen dubbeltelling).
  const houseInLedger = p.houseInLedger === true

  const housingContext = deriveHousingContext(p.assets, p.debts)
  const addsHouseEquity = housingFilters && !houseInLedger && housingContext.hasEigenHuis

  const currentAge = p.dateOfBirth ? ageAtDate(p.dateOfBirth) : null

  // Huisbijdrage per jaar (overwaarde = huiswaarde − geprojecteerd hypotheeksaldo).
  // Alléén toegevoegd voor de filterende modus mét een eigen huis.
  function houseEquityAt(age: number): number {
    if (!addsHouseEquity || currentAge == null) return 0
    const monthsForward = Math.max(0, (age - currentAge) * 12)
    const { currentValue } = projectEigenHuisValuesAt(housingContext.eigenHuisAssets, monthsForward)
    const { balance } = projectMortgageStateAt(housingContext.eigenHuisMortgages, monthsForward)
    return Math.max(0, currentValue - balance)
  }

  // Ruwe reeks: endPortfolio + huisbijdrage per jaar.
  const raw = rows.map((r) => ({ age: r.age, value: r.endPortfolio + houseEquityAt(r.age) }))

  // Reconcile-offset: veranker jaar 0 op currentNetWorth (zelfde "vandaag"-grondslag
  // als het Vandaag-punt + historie). Vlakke euro-verschuiving over alle rijen.
  const offset = p.currentNetWorth - raw[0].value

  return raw.map((r) => ({ age: r.age, netWorth: r.value + offset }))
}
