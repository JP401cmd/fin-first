/**
 * Tweede vermogenslijn voor de Toekomst-vermogensgrafiek (Pad-modus): het
 * vermogen ZONDER JE HUIS, naast de hoofdlijn MET JE HUIS.
 *
 * De hoofdlijn van `SimChart` plot het TOTALE netto vermogen — inclusief de
 * eigen woning. De kernel rekent de woning echter in élke woonstrategie als
 * niet-liquide, dus wat je daadwerkelijk kunt besteden ligt structureel lager.
 * Na het vrijheidsmoment kán het totaal dóórstijgen (de woning groeit mee)
 * terwijl de besteedbare portefeuille juist leegloopt — dat las de gebruiker als
 * "ik word rijker". Deze module levert de twee pure bouwstenen om die tweede
 * lijn te tonen: de conditie en de punten.
 *
 * **Consume-only:** er wordt hier NIETS gerekend. De besteedbare waarde komt
 * één-op-één uit `UnifiedProjectionRow.nettoLiquide` (Prognose!J uit de
 * horizon-kernel, dezelfde grondslag als `requiredFirePortfolio`) — geen eigen
 * som "totaal − overwaarde".
 */
import type { HousingContext } from '@/lib/housing-strategy'

/**
 * Toont /toekomst een tweede lijn met het besteedbare vermogen? Ja zodra de
 * gebruiker een eigen woning heeft — in ÁLLE VIER de woonstrategieën.
 *
 * NIET TERUGSCHROEVEN NAAR EEN SUBSET (eigenaarsbesluit 2026-08-05). De verleiding
 * is om alleen `exclude_from_fire` en `reverse_mortgage` te tonen "omdat de kloof
 * daar blijft bestaan". Dat klopt niet: de kloof bestaat OVERAL. De kernel bepaalt
 * `Prognose!J = I − (niet-liquide bezit − niet-liquide leningen)` puur op de
 * `nietLiquide`-vlag van de bezitcategorie (`lib/horizon-kernel/tables/prognose.ts`),
 * volledig los van de woonstrategie — de eigen woning is dus in élke modus
 * niet-liquide, óók bij `include_full`. Alleen selectief tonen betekende: dezelfde
 * grafiek liegt in de ene modus en niet in de andere. Consistentie wint hier van
 * minder ruis.
 *
 * Wat per modus verschilt is niet het BESTAAN van de kloof maar het VERLOOP, en dat
 * is precies wat de gebruiker mag zien:
 *  - `include_full` / `exclude_from_fire` — de woning blijft staan, dus de lijnen
 *    lopen blijvend uit elkaar;
 *  - `downsize` — op het verkoopmoment valt de woning weg en convergeren de lijnen
 *    zichtbaar (het huis wordt besteedbaar);
 *  - `reverse_mortgage` — de opnames stromen ín de besteedbare lijn terwijl de
 *    woningwaarde erbuiten blijft.
 *
 * Zonder eigen woning is er niets te splitsen (J ≈ I) en blijft de grafiek
 * ongewijzigd — één lijn, zoals altijd.
 */
export function shouldShowLiquidWealthLine(context: HousingContext): boolean {
  return context.hasEigenHuis
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
