/**
 * TYPE-TEST — de compile-gard tegen dubbele deflatie (AC-A4).
 *
 * Dit bestand bevat geen runtime-assertions en wordt NIET door vitest gedraaid:
 * de runner matcht `*.test.ts`, en dit is `*.type-test.ts`. Het loopt mee in
 * `npx tsc --noEmit`, en dáár doet het zijn werk.
 *
 * De assertie zit in de `@ts-expect-error`-regels. Die werken twee kanten op:
 * verdwijnt de gard, dan meldt tsc "Unused '@ts-expect-error' directive" en is
 * dit bestand rood. Een test die niet kan bijten is precies het gat dat een
 * merk-type hoort te dichten, dus die richting is even belangrijk als de andere.
 *
 * Waarom een merk en geen runtime-check: een dubbel gedeeld bedrag is op het
 * scherm niet te onderscheiden van een correct bedrag. Deze fout moet vóór de
 * build sneuvelen, niet erna.
 */
import {
  buildFactorByAge,
  buildFactorByOffset,
  deflatePoints,
  deflateRowsByAge,
  deflateSeriesByOffset,
  type EuroView,
  type InEuroView,
} from './euro-display'

/** Minimale rij-vorm: één geldveld (klasse S/F) naast een teller en een label. */
interface DemoRow {
  age: number
  phase: string
  netWorth: number
}

const rows: DemoRow[] = [
  { age: 40, phase: 'opbouw', netWorth: 1000 },
  { age: 41, phase: 'opbouw', netWorth: 1100 },
]
const points: [number, number][] = [
  [40, 1000],
  [41, 1100],
]
const series: number[] = [1000, 1100]

const factorByAge = buildFactorByAge([
  { age: 40, inflationFactor: 1 },
  { age: 41, inflationFactor: 1.02 },
])
const factorByOffset = buildFactorByOffset([
  { age: 40, inflationFactor: 1 },
  { age: 41, inflationFactor: 1.02 },
])
const view: EuroView = 'real'

// ── Positief: de eerste omzetting compileert voor alle drie de feed-vormen ──
const viewRows = deflateRowsByAge(rows, factorByAge, ['netWorth'], view)
const viewPoints = deflatePoints(points, factorByAge, view, (x) => x - 1)
const viewSeries = deflateSeriesByOffset(series, factorByOffset, view)

// ── Positief: het merk is doorlaatbaar richting de tekenmachine ──
// Een omgezette feed moet nog steeds als de gewone vorm doorgegeven kunnen
// worden; anders zou elk chart-component een `view`-prop nodig hebben en
// daarmee moeten weten wat euro-weergave is. Dat is precies wat het merk juist
// wil voorkomen.
const marked: InEuroView<DemoRow>[] = viewRows
const rowsForChart: DemoRow[] = viewRows
const pointsForChart: [number, number][] = viewPoints
const seriesForChart: number[] = viewSeries

// ── Positief: `moneyFields` blijft begrensd tot bestaande velden ──
// @ts-expect-error — 'bestaatNiet' is geen veld van DemoRow
deflateRowsByAge(rows, factorByAge, ['bestaatNiet'], view)

// ── Negatief: een TWEEDE omzetting is een compile-fout (AC-A4) ──
// Dit is de kern van brok A. Het merk maakt een al omgezette feed onbruikbaar
// als invoer, ongeacht hoe plausibel de callsite eruitziet.
// @ts-expect-error — viewRows draagt het euro-weergave-merk al
deflateRowsByAge(viewRows, factorByAge, ['netWorth'], view)
// @ts-expect-error — viewPoints draagt het euro-weergave-merk al
deflatePoints(viewPoints, factorByAge, view)
// @ts-expect-error — viewSeries draagt het euro-weergave-merk al
deflateSeriesByOffset(viewSeries, factorByOffset, view)

// Verbruik de bindings zodat lint ze niet als ongebruikt ziet; deze regels
// hebben geen ander doel.
void marked
void rowsForChart
void pointsForChart
void seriesForChart
