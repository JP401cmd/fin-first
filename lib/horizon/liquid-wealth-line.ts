/**
 * Tweede vermogenslijn voor de Toekomst-vermogensgrafiek (Pad-modus): het
 * vermogen ZONDER JE HUIS, naast de hoofdlijn MET JE HUIS.
 *
 * De hoofdlijn van `SimChart` plot het TOTALE netto vermogen — inclusief de
 * eigen woning. In de drie niet-meetellen-woonstrategieën behandelt de kernel de
 * woning als niet-liquide, dus wat je daadwerkelijk kunt besteden ligt daar
 * structureel lager. Na het vrijheidsmoment kán het totaal dóórstijgen (de woning
 * groeit mee) terwijl de besteedbare portefeuille juist leegloopt — dat las de
 * gebruiker als "ik word rijker". Deze module levert de twee pure bouwstenen om
 * die tweede lijn te tonen: de conditie en de punten.
 *
 * **Consume-only:** er wordt hier NIETS gerekend. De besteedbare waarde komt
 * één-op-één uit `UnifiedProjectionRow.nettoLiquide` (Prognose!J uit de
 * horizon-kernel, dezelfde grondslag als `requiredFirePortfolio`) — geen eigen
 * som "totaal − overwaarde".
 */
import type { HousingContext, HousingStrategyConfig } from '@/lib/housing-strategy'

/**
 * Toont /toekomst een tweede lijn met het besteedbare vermogen? Ja zodra de
 * gebruiker een eigen woning heeft ÉN de woonstrategie niet `include_full` is.
 *
 * ## Herroeping van het "alle vier de modi"-besluit (2026-08-05, zelfde dag)
 * Het oorspronkelijke besluit luidde: tonen in ÁLLE VIER de woonstrategieën, met
 * als motivering "de kernel rekent de woning in élke modus als niet-liquide, dus
 * de kloof bestaat overal". **Die premisse is aantoonbaar onjuist en daarmee
 * vervalt het besluit.** De niet-liquide-vlag is géén eigenschap van de categorie
 * maar van de STRATEGIE: `lib/horizon-kernel/adapter/prio-overgang.ts` zet
 * `nietLiquide: categorie === 'Eigen huis' ? !woningMeerekenen : false` (regel 182)
 * en idem voor schuldcategorie 'Woning' (regel 197). Bij `include_full`
 * (= selector 'Meerekenen') is er dus GEEN enkele niet-liquide categorie, en
 * `Prognose!J = I − (L − M)` degenereert tot **J ≡ I exact**.
 *
 * Gevolg: bij `include_full` valt de besteedbare lijn PIXEL-EXACT samen met de
 * totaallijn. Ze toont geen kloof, ze voegt geen informatie toe en ze kost wél
 * een legenda-item plus een tweede lijn die de crosshair-lezing verdubbelt — dat
 * is legenda-ruis, niet consistentie. De oorspronkelijke afweging ("consistentie
 * wint van minder ruis") ging over een kloof die er in die modus niet is.
 *
 * Wat blijft staan is het echte argument, en dat geldt voor de drie modi waar de
 * woning wél buiten J valt — daar verschilt niet het BESTAAN van de kloof maar het
 * VERLOOP, en dat is precies wat de gebruiker mag zien:
 *  - `exclude_from_fire` — de woning blijft staan, dus de lijnen lopen blijvend
 *    uit elkaar;
 *  - `downsize` — op het verkoopmoment valt de woning weg en convergeren de lijnen
 *    zichtbaar (het huis wordt besteedbaar);
 *  - `reverse_mortgage` — de opnames stromen ín de besteedbare lijn terwijl de
 *    woningwaarde erbuiten blijft.
 *
 * NIET TERUGSCHROEVEN NAAR EEN NÓG KLEINERE SUBSET: bij `downsize` is de kloof
 * tijdelijk (tot de verkoop) en bij `reverse_mortgage` groeit ze juist — beide
 * zijn betekenisdragend. Alleen `include_full` is aantoonbaar leeg.
 *
 * Zonder eigen woning is er niets te splitsen (J ≡ I) en blijft de grafiek
 * ongewijzigd — één lijn, zoals altijd.
 */
export function shouldShowLiquidWealthLine(
  context: HousingContext,
  mode: HousingStrategyConfig['mode'],
): boolean {
  return context.hasEigenHuis && mode !== 'include_full'
}

/**
 * ## Standaardstand van de tweede lijn (verwijderd, ADR 0114 D5)
 * Hier stond `defaultLiquidWealthLineVisible`: AAN bij `exclude_from_fire`, UIT
 * bij de rest. Die uitzondering bestond om precies één reden — bij "Uitsluiten"
 * stond de voortgangsbalk al op J terwijl de grafiek op I stond, dus zonder die
 * tweede lijn liep de grafiek zichtbaar uit de pas met de balk eronder. Sinds de
 * PRIMAIRE lijn daar zélf op J staat (`primaryChartBasis` hieronder) is die reden
 * vervallen, en een standaard-AAN tweede lijn zou de "te druk"-melding die spoor A
 * oploste opnieuw openen. De tweede lijn staat daarom in álle strategieën
 * standaard UIT; de opgeslagen gebruikersvoorkeur (per apparaat) wint daarna.
 */

/**
 * Minimale rij-vorm die de lijn nodig heeft. `UnifiedProjectionRow` voldoet
 * hieraan structureel; het smalle type houdt deze module los van het volledige
 * projectiecontract (en dus testbaar zonder een complete rij te fabriceren).
 */
export type LiquidWealthRow = {
  /** Jaar-index als leeftijd (zoals `UnifiedProjectionRow.age`). */
  age: number
  /** Netto LIQUIDE vermogen aan het EINDE van dit jaar (Prognose!J). */
  nettoLiquide: number
  /** Netto LIQUIDE vermogen aan het BEGIN van dit jaar (Prognose!J op de
   *  vorige blokrand; op rij 0 het J(0)-anker uit de potten). Alleen rij 0
   *  wordt gebruikt — als seed voor het beginpunt van de reeks.
   *
   *  Optioneel, spiegel van `UnifiedProjectionRow.startNettoLiquide`: de
   *  kernel-bridge vult 'm altijd, test-/preview-rijfabrieken mogen 'm weglaten.
   *  Ontbreekt hij, dan komt er géén seed — de reeks begint dan op de eerste
   *  jaargrens, precies zoals vóór het anker. Bewust geen terugval op een
   *  I-waarde: dat zou de twee grondslagen op één lijn mengen. */
  startNettoLiquide?: number
}

/**
 * Zet projectierijen om naar `[leeftijd, besteedbaar]`-punten voor `SimChart`.
 *
 * X-conventie identiek aan de totaallijn (`simRowsToChartPoints` in
 * `lib/horizon/sim-chart-geometry.ts`): een seed op de beginleeftijd met de
 * BEGINstand, daarna per rij de EINDwaarde op `age + 1`. Zo leest een crosshair
 * op leeftijd A beide grootheden op hetzelfde moment.
 *
 * ## Het J(0)-anker (2026-08-29, ADR 0114)
 * Deze reeks begon eerder bewust op `age + 1`: de kernel leverde geen beginstand
 * voor het liquide vermogen, en die werd hier terecht niet verzonnen. Sinds de
 * kernel `UnifiedProjectionRow.startNettoLiquide` levert (de J-spiegel van
 * `startNetWorth`, herleid uit dezelfde TS!H-vlag als Prognose!L/M) is dat gat
 * dicht en seedt de reeks net als de totaallijn. Dat is een voorwaarde om deze
 * reeks als PRIMAIRE lijn te kunnen tekenen — zonder anker zou de hoofdlijn een
 * jaar later beginnen dan de as suggereert — en het corrigeert meteen de
 * secundaire lijn, die er één jaar te laat aan begon.
 *
 * Nog steeds geen eigen som: het anker wordt geconsumeerd, niet berekend.
 *
 * Niet-eindige waarden worden overgeslagen (defensief tegen een half gevulde rij);
 * een niet-eindig anker levert simpelweg geen seed, en de reeks begint dan zoals
 * voorheen op de eerste jaargrens.
 */
export function buildLiquidWealthPoints(
  rows: readonly LiquidWealthRow[],
): [number, number][] {
  const points: [number, number][] = []
  const seed = rows[0]
  if (seed !== undefined && Number.isFinite(seed.age) && Number.isFinite(seed.startNettoLiquide)) {
    points.push([seed.age, seed.startNettoLiquide as number])
  }
  for (const row of rows) {
    if (!Number.isFinite(row.nettoLiquide) || !Number.isFinite(row.age)) continue
    points.push([row.age + 1, row.nettoLiquide])
  }
  return points
}

/**
 * Op welke GRONDSLAG staat de PRIMAIRE (massieve, fasegekleurde) lijn van de
 * Toekomst-grafiek? Eén bron voor die keuze — de grafiek, de doellijn-rollen,
 * de legenda, de tooltip en de marktcheck-band lezen 'm allemaal hier, zodat ze
 * niet uiteen kunnen lopen.
 *
 * ## Herroeping van "de hoofdlijn blijft in alle vier de modi netWorth" (ADR 0114)
 * Dat besluit stond hierboven in deze module en in de woonstrategie-entry van
 * `lib/architecture/calculations.ts`, met als motivering dat een grondslagwissel
 * een nieuw veld op het gedeelde `SimRow`-contract zou vragen. Die premisse is
 * vervallen: de wissel woont in de GRAFIEKLAAG (`primaryBasis` op
 * `SimChartGeometryInput`), `SimRow` blijft ongemoeid.
 *
 * De wissel geldt uitsluitend bij `exclude_from_fire` ("Uitsluiten"). Daar — en
 * alleen daar — staan de voortgangsbalk en het vrijheids-% eronder al op de
 * J-grondslag (`selectFreedomProgressBasis`, ADR 0034), stond de grafiek dus
 * aantoonbaar op een ándere grootheid dan de balk, en solvet de kernel de
 * FIRE-maand al op J — waardoor de FIRE-stip nu exact op de J-drempel landt in
 * plaats van ernaast.
 *
 *  - `downsize` / `reverse_mortgage` → `'total'`. De woning wordt daar
 *    uiteindelijk besteedbaar; het totaal is het hoofdverhaal en de kloof is
 *    tijdelijk resp. groeiend — dat lees je juist tegen de totaallijn af.
 *  - `include_full` → `'total'`, en zonder eigen woning idem: J ≡ I exact, dus
 *    de keuze is daar betekenisloos.
 */
export function primaryChartBasis(
  context: HousingContext,
  mode: HousingStrategyConfig['mode'],
): 'total' | 'liquid' {
  return context.hasEigenHuis && mode === 'exclude_from_fire' ? 'liquid' : 'total'
}
