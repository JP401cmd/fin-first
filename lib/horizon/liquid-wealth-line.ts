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
 * Minimale rij-vorm die de lijn nodig heeft. `UnifiedProjectionRow` voldoet
 * hieraan structureel; het smalle type houdt deze module los van het volledige
 * projectiecontract (en dus testbaar zonder een complete rij te fabriceren).
 */
export type LiquidWealthRow = {
  /** Jaar-index als leeftijd (zoals `UnifiedProjectionRow.age`). */
  age: number
  /** Netto LIQUIDE vermogen aan het EINDE van dit jaar (Prognose!J). */
  nettoLiquide: number
}

/**
 * Zet projectierijen om naar `[leeftijd, besteedbaar]`-punten voor `SimChart`.
 *
 * X-conventie identiek aan de hoofdlijn: die plot per rij de EINDwaarde op
 * `age + 1` (het punt op leeftijd A is de stand aan het begin van jaar A). De
 * besteedbare lijn volgt exact dezelfde as, zodat een crosshair op leeftijd A
 * beide grootheden op hetzelfde moment leest. Gevolg: de lijn begint één jaar
 * ná de hoofdlijn — de kernel levert geen begin-stand voor het liquide vermogen
 * en die wordt hier bewust NIET verzonnen.
 *
 * Niet-eindige waarden worden overgeslagen (defensief tegen een half gevulde rij).
 */
export function buildLiquidWealthPoints(
  rows: readonly LiquidWealthRow[],
): [number, number][] {
  const points: [number, number][] = []
  for (const row of rows) {
    if (!Number.isFinite(row.nettoLiquide) || !Number.isFinite(row.age)) continue
    points.push([row.age + 1, row.nettoLiquide])
  }
  return points
}
