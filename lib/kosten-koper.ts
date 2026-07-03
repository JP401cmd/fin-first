import {
  OVB_TARIEF_EIGEN_WONING,
  STARTERSVRIJSTELLING_MAX,
  NHG_KOSTENGRENS,
  NHG_BORGTOCHTPROVISIE_PCT,
  KOSTEN_KOPER_NOTARIS,
  KOSTEN_KOPER_TAXATIE,
  KOSTEN_KOPER_BANKGARANTIE_PCT,
} from './constants'

export interface KostenKoperInput {
  /** Aankoopprijs van de woning (€). */
  aankoopprijs: number
  /** Starter (18–35 jr, eerste eigen woning): komt in aanmerking voor de startersvrijstelling. */
  isStarter: boolean
  /** Financiering met Nationale Hypotheek Garantie (NHG). */
  hasNHG: boolean
}

export interface KostenKoperBreakdown {
  /** Overdrachtsbelasting (€). €0 bij startersvrijstelling, anders 2% van de prijs. */
  overdracht: number
  /** Notariskosten (€). */
  notaris: number
  /** Taxatiekosten (€). */
  taxatie: number
  /** Bankgarantie (€). */
  bankgarantie: number
  /** NHG borgtochtprovisie (€). €0 zonder NHG of boven de NHG-kostengrens. */
  nhgKosten: number
  /** Totaal kosten koper (€) — som van de posten hierboven. */
  totaal: number
}

/**
 * Kosten koper bij aankoop van een EIGEN woning (hoofdverblijf).
 *
 * ENIGE bron van waarheid voor het life-event 'house_purchase' in de Horizon-
 * scenario/projectie: het `totaal` stroomt als eenmalige uitgave in de FIRE-
 * berekening. Voorheen stond deze som 4× gedupliceerd in horizon-client.tsx met
 * hardcoded (en verouderde) grenzen — verkeerde grenzen = verkeerd bedrag.
 *
 * Fiscale grondslag (2026, zie lib/constants.ts — JAARLIJKS verifiëren):
 *  • Startersvrijstelling: geen overdrachtsbelasting tot €555.000, daarboven 2%.
 *  • NHG: borgtochtprovisie 0,4% van de aankoopprijs, alleen ≤ NHG-kostengrens €470.000.
 *
 * Let op: dit geldt voor een HOOFDVERBLIJF. Een tweede woning/beleggingspand valt
 * niet onder de startersvrijstelling en kent 8% overdrachtsbelasting (2026) — dat
 * loopt via een eigen (handmatig) bedrag, niet via deze helper.
 */
export function computeKostenKoper(input: KostenKoperInput): KostenKoperBreakdown {
  const prijs = Number.isFinite(input.aankoopprijs) ? Math.max(0, input.aankoopprijs) : 0
  const overdracht =
    input.isStarter && prijs <= STARTERSVRIJSTELLING_MAX
      ? 0
      : Math.round(prijs * OVB_TARIEF_EIGEN_WONING)
  const notaris = KOSTEN_KOPER_NOTARIS
  const taxatie = KOSTEN_KOPER_TAXATIE
  const bankgarantie = Math.round(prijs * KOSTEN_KOPER_BANKGARANTIE_PCT)
  const nhgKosten =
    input.hasNHG && prijs <= NHG_KOSTENGRENS
      ? Math.round(prijs * NHG_BORGTOCHTPROVISIE_PCT)
      : 0
  const totaal = overdracht + notaris + taxatie + bankgarantie + nhgKosten
  return { overdracht, notaris, taxatie, bankgarantie, nhgKosten, totaal }
}
