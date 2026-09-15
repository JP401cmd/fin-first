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
  netWorthExcludingHome,
  projectEigenHuisValuesAt,
  projectMortgageStateAt,
  shouldFilterEigenHuisForFire,
  shouldShowDualHousingBasis,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'

export interface SimNetWorthRow {
  age: number
  /**
   * Geprojecteerd VOLLEDIG netto vermogen (FIRE-pot + niet-liquide assets).
   *
   * NOMINAAL — in de euro's van het projectiejaar zelf. Géén `netWorthNominal`-
   * suffix (ADR 0090 / D6): nominaal is de enige grondslag die in de datalaag
   * bestaat, en een suffix zou suggereren dat er ergens ook een `netWorthReal`
   * ligt. Het signaal dat deze rij nominaal is, is de buurman hieronder.
   */
  netWorth: number
  /**
   * Canonieke WEERGAVE-deflator van deze rij (`UnifiedProjectionRow
   * .inflationFactor`, jaar 0 = exact 1.0). Puur doorgegeven — deze helper
   * gebruikt hem NIET in enige som (zie de reconcile-offset hieronder).
   *
   * Consument: het renderende component deelt `netWorth` hierdoor wanneer de
   * gebruiker "huidige euro's" kiest — ná de her-ankering, nooit ervoor.
   */
  inflationFactor: number
  /**
   * Geprojecteerd netto vermogen EXCL. eigen woning ÓP leeftijd `age` — de
   * dubbele-grondslag-tegenhanger van `netWorth` (lib/housing-strategy.ts
   * `netWorthExcludingHome`: netto vermogen − overwaarde, ZUIVER, ook bij
   * reverse_mortgage). NOMINAAL, zelfde tijdstip en zelfde deflator
   * (`inflationFactor`) als `netWorth` van deze rij — de consument deflateert
   * beide exact één keer, nooit hier (ADR 0090/0093).
   *
   * ALLEEN AANWEZIG wanneer `shouldShowDualHousingBasis` waar is (eigen woning
   * én strategie ≠ include_full) ÉN de kernelrijen de J-grondslag droegen
   * (`startNettoLiquideByAge`). Anders ontbreekt de sleutel volledig, zodat
   * bestaande bundels byte-identiek blijven.
   *
   * BRON = de kernel, geen eigen overwaarde-projectie. `UnifiedProjectionRow
   * .startNettoLiquide` (Prognose!J ÓP `age` = I − (L − M)) is in de app exact
   * "netto vermogen zonder het eigen-woningblok": de adapter vlagt UITSLUITEND
   * bezitcategorie 'Eigen huis' en schuldcategorie 'Woning' als niet-liquide
   * (`adapter/prio-overgang.ts`, en alleen bij woonstrategie ≠ Meerekenen).
   * Daardoor volgt dit veld per constructie wat de kernel met de woning doet:
   *   • exclude_from_fire → huis + hypotheek blijven in het grootboek; J trekt
   *     de meegroeiende overwaarde (huiswaarde − hypotheeksaldo) er per maand af.
   *   • downsize → op de kernel-verkoopmaand (Bez!AY 0→1) gaat de huis-slot op 0,
   *     de hypotheek-slot op 0 en de netto-opbrengst als inleg naar de liquide
   *     pot; L en M zijn daarna 0 → J ≡ I → excl. == incl. Géén dubbele aftrek,
   *     en het verkoopmoment komt uit dezelfde bron als de kernel zelf.
   *   • reverse_mortgage → huis blijft, hypotheek loopt af, de opeethypotheek
   *     (slot 3, categorie 'Woning', niet-liquide) loopt op terwijl de opnames
   *     naar de liquide pot gaan; J strijkt huis én álle woningschulden (hypotheek
   *     + opeetschuld) weg — de liquide pot mét ontvangen opnames. Op rij 0 is de
   *     opeetschuld 0, dus dat sluit exact aan op de zuivere `netWorth − overwaarde`.
   *   • include_full → niets is niet-liquide (J ≡ I); veld wordt weggelaten.
   * NIET verwarren met een generieke "liquide"-grootheid: zodra de adapter ooit
   * een ándere categorie niet-liquide zou vlaggen, is J niet langer excl.-woning
   * (grendel in networth-rows.test.ts).
   *
   * CONTINUÏTEIT (hard): rij 0 is EXACT `netWorthExcludingHome(currentNetWorth,
   * housingContext)` — hetzelfde getal als de linker kaart op /overzicht. De reeks
   * wordt daarop verankerd als `anker + (J(age) − J(rij 0))`: dezelfde vlakke
   * euro-verschuiving als bij `netWorth`, maar met een EIGEN offset. Die twee
   * offsets vallen alleen samen als de kernel-overwaarde op t0 gelijk is aan de
   * context-overwaarde (huiswaarde − gekoppelde hypotheken); ze wijken af bij een
   * WOZ-verkoopbasis (TPR-03), een ongelinkte hypotheek (conservatief 'Woning')
   * of afwijkende inclusion-weging — precies de grondslagverschillen die de
   * her-ankering hoort weg te nemen, per grondslag apart.
   */
  netWorthExclHome?: number
}

export interface BuildSimNetWorthRowsParams {
  /**
   * Per-jaar FIRE-portefeuille uit de engine (LedgerRow nettoVermogen, nominaal), mét
   * de weergave-deflator van diezelfde kernelrij. De aanroeper joint die factor op
   * LEEFTIJD uit `HorizonFireSim.unifiedRows`; hier wordt hij alleen doorgegeven.
   *
   * LEEFTIJDSCONVENTIE (hard — hier ging het mis, aug 2026):
   * een `SimRow` met `age: N` beschrijft het leeftijdsJAAR N, niet het tijdstip N.
   * `startPortfolio` is de stand ÓP leeftijd N, `endPortfolio` de stand aan het EIND
   * van dat jaar — dus op leeftijd N + 1 (bridge: `endPortfolio → UnifiedProjectionRow
   * .netWorth`, "netto vermogen einde van jaar"). Deze reeks is een WEERGAVE-reeks
   * "vermogen op leeftijd X" en gebruikt daarom `startPortfolio`.
   *
   * Beide velden zijn verplicht en geen van beide heeft een fallback: `endPortfolio`
   * doorgeven waar `startPortfolio` hoort schuift de héle curve een groeijaar omlaag
   * en dat is onzichtbaar, want de reconcile-offset hieronder trekt jaar 0 tóch weer
   * naar `currentNetWorth` — de naad blijft knikvrij terwijl elk later jaar te laag
   * staat. Dat was de /overzicht-bug: "Vermogen bij vrijheid" €471.625 i.p.v.
   * €512.505 (echte eigenaar-data, FIRE 50,75).
   */
  simRows: {
    age: number
    /** Netto vermogen ÓP leeftijd `age` (begin van het leeftijdsjaar) — de weergavewaarde. */
    startPortfolio: number
    /** Netto vermogen aan het EIND van leeftijdsjaar `age` (= stand op `age + 1`). */
    endPortfolio: number
    inflationFactor: number
  }[]
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
  /**
   * Kernel-J-grondslag per LEEFTIJD: `UnifiedProjectionRow.startNettoLiquide`
   * (Prognose!J ÓP `age`, nominaal — de J-spiegel van `startPortfolio`), gejoind
   * op leeftijd zoals `inflationFactor` (`buildFactorByAge`). Voedt uitsluitend
   * `netWorthExclHome`; zit in GEEN som voor `netWorth`.
   *
   * Weggelaten, of mist er een leeftijd uit `simRows` → `netWorthExclHome` wordt
   * voor de HELE reeks weggelaten (nooit een half gevulde reeks).
   */
  startNettoLiquideByAge?: ReadonlyMap<number, number>
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

  // Ruwe reeks: vermogen ÓP de leeftijd + huisbijdrage op diezelfde leeftijd.
  // `startPortfolio`, niet `endPortfolio` — zie de leeftijdsconventie op
  // `BuildSimNetWorthRowsParams.simRows`. Ook `houseEquityAt` rekent naar het
  // TIJDSTIP `age`, dus waarde en huisbijdrage horen nu bij hetzelfde moment;
  // met `endPortfolio` werd een stand van `age + 1` opgeteld bij een overwaarde
  // van `age`. `inflationFactor` reist mee als passagier — hij zit in GEEN
  // ENKELE som hieronder, en hoort (jaar 0 = 1.0) bij ditzelfde tijdstip.
  const raw = rows.map((r) => ({
    age: r.age,
    value: r.startPortfolio + houseEquityAt(r.age),
    inflationFactor: r.inflationFactor,
  }))

  // Reconcile-offset: veranker jaar 0 op currentNetWorth (zelfde "vandaag"-grondslag
  // als het Vandaag-punt + historie). Vlakke euro-verschuiving over alle rijen.
  //
  // GRONDSLAG (ADR 0090 / D7 — hier ligt de grens): deze offset is een bedrag van
  // VANDAAG en wordt in NOMINALE ruimte toegepast. Deflateren gebeurt pas in het
  // renderende component, ná deze her-ankering. Omgekeerd (eerst delen, dan
  // ankeren) zou het Vandaag-punt laten verschuiven en een knik op de naad
  // historie↔projectie opleveren. Omdat rij 0 factor 1.0 draagt, is
  // `netWorth / inflationFactor` in jaar 0 exact `currentNetWorth`.
  const offset = p.currentNetWorth - raw[0].value

  const inclRows: SimNetWorthRow[] = raw.map((r) => ({
    age: r.age,
    netWorth: r.value + offset,
    inflationFactor: r.inflationFactor,
  }))

  // ── Excl.-woning-reeks (dubbele grondslag) ──────────────────────────────────
  // Alleen wanneer de splitsing getoond wordt (eigen woning + strategie ≠
  // include_full) én élke rij een kernel-J heeft. Zie de doc op
  // `SimNetWorthRow.netWorthExclHome` voor waarom J hier de excl.-woning-grootheid
  // is en hoe verkoop/opeethypotheek daarin al verwerkt zitten.
  const exclByAge = p.startNettoLiquideByAge
  if (!exclByAge || !shouldShowDualHousingBasis(housingContext, p.housingStrategy)) return inclRows

  const rawExcl: number[] = []
  for (const r of rows) {
    const j = exclByAge.get(r.age)
    if (j === undefined || !Number.isFinite(j)) return inclRows
    rawExcl.push(j)
  }

  // Anker = het getal van de linker kaart (één home: lib/housing-strategy.ts).
  // Formulering `anker + (J_i − J_0)` i.p.v. `J_i + offset`, zodat rij 0 float-exact
  // het anker is (x + 0 === x) — een eigen vlakke verschuiving in nominale
  // ruimte, deflatie pas in de render (ADR 0090 D7), net als bij `netWorth`.
  const ankerExcl = netWorthExcludingHome(p.currentNetWorth, housingContext)
  return inclRows.map((row, i) => ({
    ...row,
    netWorthExclHome: ankerExcl + (rawExcl[i] - rawExcl[0]),
  }))
}
