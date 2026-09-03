/**
 * Regressie-grendel op de bundel-variant van de puntenbouwer (nazorg R2+R3, D).
 *
 * Vier dashboard-widgets (levensgebeurtenissen, vrijheidsmijlpalen,
 * sim-vermogenspad, fire-prognose) plotten `[r.age, r.endPortfolio]` — zonder
 * seed en zonder `+ 1` — terwijl `endPortfolio` de stand aan het EIND van
 * leeftijdsjaar `age` is. Lijn, event-markers, mijlpaal-markers en piek-/eind-
 * labels stonden daardoor structureel één jaar links van SimChart, en
 * `interpAt` las elke mijlpaal een jaar te vroeg. De widgets consumeren nu
 * `widgetSimRowsToChartPoints`; deze test legt vast dat die byte-gelijk is aan
 * de canonieke `simRowsToChartPoints` zodra de seed aanwezig is, en dat een
 * fixture zonder seed nog steeds op de canonieke as (`age + 1`) landt.
 */

import { describe, it, expect } from 'vitest'
import { simRowsToChartPoints, widgetSimRowsToChartPoints } from './sim-chart-geometry'

const ROWS = [
  { age: 40, startPortfolio: 100_000, endPortfolio: 110_000 },
  { age: 41, startPortfolio: 110_000, endPortfolio: 121_000 },
  { age: 42, startPortfolio: 121_000, endPortfolio: 133_100 },
]

describe('widgetSimRowsToChartPoints — de widgets tekenen op dezelfde as als SimChart', () => {
  it('is identiek aan simRowsToChartPoints wanneer de bundel de seed draagt', () => {
    expect(widgetSimRowsToChartPoints(ROWS)).toEqual(simRowsToChartPoints(ROWS))
    // Seed op de startleeftijd, daarna elke eindstand op `age + 1`.
    expect(widgetSimRowsToChartPoints(ROWS)).toEqual([
      [40, 100_000],
      [41, 110_000],
      [42, 121_000],
      [43, 133_100],
    ])
  })

  it('zet de eindstand van rij `age` op `age + 1` — nooit op `age` (de oude widget-plot)', () => {
    const pts = widgetSimRowsToChartPoints(ROWS)
    const oud = ROWS.map((r): [number, number] => [r.age, r.endPortfolio])
    // Het oude patroon: 110.000 op leeftijd 40; canoniek: 110.000 op 41.
    expect(oud[0]).toEqual([40, 110_000])
    expect(pts.find(([a]) => a === 41)?.[1]).toBe(110_000)
    expect(pts.find(([a]) => a === 40)?.[1]).toBe(100_000)
    expect(pts).toHaveLength(ROWS.length + 1)
  })

  it('valt bij een fixture ZONDER startPortfolio terug op de eerste eindstand als seed, op de canonieke as', () => {
    const fixture = ROWS.map(({ age, endPortfolio }) => ({ age, endPortfolio }))
    const pts = widgetSimRowsToChartPoints(fixture)
    expect(pts[0]).toEqual([40, 110_000]) // seed-terugval
    expect(pts.slice(1)).toEqual([
      [41, 110_000],
      [42, 121_000],
      [43, 133_100],
    ])
  })

  it('lege invoer → lege reeks', () => {
    expect(widgetSimRowsToChartPoints([])).toEqual([])
  })
})
