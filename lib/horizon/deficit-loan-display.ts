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
import { MAX_TRANSIENT_SPAN_YEARS } from '@/lib/horizon-kernel/runway'

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
 * Een tekort-lening die binnen dit aantal jaar-snapshots weer volledig is afgelost
 * (en daarna €0 blijft) is een ZELFHERSTELLEND liquiditeit-bruggetje — geen staande
 * schuld. Klassiek geval: de paar maanden tussen "liquide op" en "huis verkocht" bij
 * een downsize-strategie; het model overbrugt het gat en lost het meteen ná de
 * verkoop af (zie ADR 0033, tekort-aflossing-uit-liquide). Zo'n transient hoort géén
 * rode tekort-melding te geven. `span` = `laatste materiële leeftijd − eerste
 * materiële leeftijd` van de aaneengesloten tekort-episode; ≤ 1 betekent dat de
 * lening in ten hoogste twee opeenvolgende jaar-snapshots stond en toen verdween.
 *
 * BEWUSTE KALIBRATIE (= 1, niet 0): het waargenomen huisverkoop-bruggetje staat in
 * precies één jaar-snapshot (span 0), maar 1 geeft veiligheidsmarge voor een
 * bruggetje dat een verjaardag-snapshotgrens overspant (liquide op vlak vóór, verkoop
 * vlak ná de verjaardag → twee snapshots). De onderdrukking is BEWUST magnitude-blind:
 * elk tekort dat binnen ~1 jaar volledig zelfherstelt is per definitie een liquiditeit-
 * brug (er kwam binnen een jaar genoeg liquide binnen om het af te lossen), of het nu
 * €3k of €150k was — dat is geen staande schuld. Een tekort dat lánger aanhoudt (span
 * > 1) of aan het venster-einde nog openstaat (niet bewezen afgelost) blijft wél melden.
 *
 * DE CONSTANTE ZELF woont sinds ADR 0126 in de kernel (`lib/horizon-kernel/runway.ts`,
 * `MAX_TRANSIENT_SPAN_YEARS`, hierboven geïmporteerd): de runway-lezer `depletionMonth`
 * hanteert exact dezelfde grens in maanden, zodat "geen tekort-melding" en "geen einde
 * van de runway" nooit over een andere drempel gaan. De kalibratie-motivering staat
 * hier, bij de tekort-melding waar hij is ontstaan.
 */

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

  // Bouw de aaneengesloten tekort-EPISODES binnen het venster. Een rij is "materieel"
  // als het eindsaldo op hele euro's afgerond ≥ €1 is (€1-materialiteitsgate): zo
  // levert float-ruis (€0,003) óf een reële sub-euro (€0,30) — die beide naar €0
  // afronden — geen fantoom-episode. Een episode eindigt zodra een immateriële
  // in-venster-rij volgt (`clears = true`: bewijs dat de lening is afgelost) of aan
  // het einde van het venster (`clears = false`: nog openstaand, niet bewezen afgelost).
  interface Episode {
    startAge: number
    lastAge: number
    peak: number
    clears: boolean
  }
  const episodes: Episode[] = []
  let current: Episode | null = null
  for (const r of rows) {
    if (r.age > cutoff) continue
    const endBalance = r.debtBalances['tekort-lening']?.endBalance ?? 0
    if (Math.round(endBalance) >= 1) {
      if (current === null) {
        current = { startAge: r.age, lastAge: r.age, peak: endBalance, clears: false }
      } else {
        current.lastAge = r.age
        if (endBalance > current.peak) current.peak = endBalance
      }
    } else if (current !== null) {
      current.clears = true
      episodes.push(current)
      current = null
    }
  }
  if (current !== null) episodes.push(current)

  // Onderdruk zelfherstellende bruggetjes: een korte episode (span ≤
  // MAX_TRANSIENT_SPAN_YEARS) die bewezen is afgelost (`clears`) is geen staande
  // schuld en hoort geen melding te geven. Meld de eerste episode die WÉL aanhoudt —
  // te lang aanhoudt óf aan het venster-einde nog openstaat. In een plan met eerst
  // een bruggetje (huisverkoop) en later een echte staande schuld landt `firstAge`
  // zo op de staande schuld, niet op het bruggetje.
  const sustained = episodes.filter(
    (ep) => !(ep.clears && ep.lastAge - ep.startAge <= MAX_TRANSIENT_SPAN_YEARS),
  )
  if (sustained.length === 0) return null
  const firstAge = sustained[0].startAge
  const peak = Math.max(...sustained.map((ep) => ep.peak))
  return { firstAge, peak: Math.round(peak) }
}
