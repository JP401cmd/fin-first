/**
 * Pixel-proximity-clustering van chart-markers (bevinding M16).
 *
 * De kern van het defect: `positionChartEvents` groepeerde alléén op AFGEROND
 * JAAR. Op de standaard uitgezoomde Toekomst-grafiek (~5-6 px per jaar op een
 * 390px-scherm) betekent dat: zes gebeurtenissen in de jaren 44 t/m 50 kregen
 * zes eigen buckets, elk met stackIndex 0, op een paar pixels van elkaar. Zes
 * markers met 44×44 hit-rects die elkaar bijna volledig overlappen — welke een
 * tik wint bepaalt de SVG-paint-order, niet de gebruiker.
 *
 * De tests hieronder pinnen daarom niet "clustert wel/niet" in het algemeen,
 * maar precies dat contrast: dezelfde events, twee zoomstanden, twee uitkomsten.
 */

import { describe, it, expect } from 'vitest'
import {
  packByPixelProximity,
  positionChartEvents,
  CLUSTER_THRESHOLD_PX,
  chartEventOverlayToClusterRow,
  MAX_STACK_VISIBLE,
  type ChartEventOverlay,
} from './chart-event-overlay'

function ev(
  id: string,
  age: number,
  overrides: Partial<ChartEventOverlay> = {},
): ChartEventOverlay {
  return {
    id,
    label: `Event ${id}`,
    age,
    side: 'above',
    color: '#000',
    icon: 'Calendar',
    kind: 'life_event',
    ...overrides,
  }
}

/**
 * De geometrie uit de bevinding: innerW ≈ 314px (390px-viewport minus
 * CHART_PAD.left 60 en right 16) over het standaard zoomvenster van 55 jaar
 * (leeftijd 40 → 95) ⇒ ~5,7 px per jaar.
 */
const uitgezoomd = (age: number) => ((age - 40) / 55) * 314
/** Ingezoomd op 40-50: hetzelfde scherm, 10 jaar ⇒ ~31 px per jaar. */
const ingezoomd = (age: number) => ((age - 40) / 10) * 314

describe('packByPixelProximity', () => {
  it('bundelt items binnen de drempel en laat items erbuiten los', () => {
    const items = [0, 10, 20, 200, 210].map(x => ({ x }))
    const clusters = packByPixelProximity(items, i => i.x, i => i.x, CLUSTER_THRESHOLD_PX)

    expect(clusters).toHaveLength(2)
    expect(clusters[0].items.map(i => i.x)).toEqual([0, 10, 20])
    expect(clusters[1].items.map(i => i.x)).toEqual([200, 210])
  })

  it('centreert een groep op het zwaartepunt van zijn leden', () => {
    const items = [{ x: 0, age: 40 }, { x: 10, age: 42 }, { x: 20, age: 44 }]
    const [cluster] = packByPixelProximity(items, i => i.x, i => i.age)

    // De incrementele update is exact het rekenkundig gemiddelde van de leden:
    // 0+10+20 = 30 / 3 = 10, en 40+42+44 = 126 / 3 = 42.
    expect(cluster.x).toBeCloseTo(10, 5)
    expect(cluster.centerAge).toBeCloseTo(42, 5)
  })

  it('een keten van net-binnen-de-drempel-stappen loopt niet oneindig door', () => {
    // Elke stap is 20px (< 28), maar het zwaartepunt schuift mee, dus de keten
    // breekt vanzelf. Zonder meeschuivend zwaartepunt zou dit één cluster van
    // 200px breed worden — dat zet de badge lós van zijn eigen markers.
    const items = Array.from({ length: 11 }, (_, i) => ({ x: i * 20 }))
    const clusters = packByPixelProximity(items, i => i.x, i => i.x)

    expect(clusters.length).toBeGreaterThan(1)
    for (const c of clusters) {
      const xs = c.items.map(i => i.x)
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(100)
    }
  })

  it('geeft een lege lijst terug voor geen items', () => {
    expect(packByPixelProximity([], () => 0, () => 0)).toEqual([])
  })
})

describe('positionChartEvents — pixel-clustering (M16)', () => {
  // Precies de reeks uit de bevinding: aangrenzende, niet-identieke jaren.
  const reeks = [ev('a', 44), ev('b', 45), ev('c', 46), ev('d', 47), ev('e', 48), ev('f', 50)]

  it('REGRESSIE: de oude jaar-strategie laat aangrenzende jaren ongeclusterd', () => {
    // Dit IS het defect, hier vastgelegd zodat de reden voor de nieuwe strategie
    // niet verdampt: zes losse buckets, elk met bucketSize 1 en stackIndex 0.
    const positioned = positionChartEvents(reeks, { ageGroupingStrategy: 'integer' })

    expect(positioned).toHaveLength(6)
    expect(positioned.every(p => p.bucketSize === 1)).toBe(true)
    expect(positioned.every(p => p.stackIndex === 0)).toBe(true)
    // En ze staan op een handvol pixels van elkaar — ruim binnen één icoon.
    const xs = reeks.map(e => uitgezoomd(e.age))
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(CLUSTER_THRESHOLD_PX + 10)
  })

  it('clustert dezelfde reeks wél op de uitgezoomde stand', () => {
    const positioned = positionChartEvents(reeks, {
      pixelClustering: { xScale: uitgezoomd },
    })

    expect(positioned).toHaveLength(6)
    // Eén bucket: alle zes delen bucketSize en krijgen oplopende stackIndex.
    expect(new Set(positioned.map(p => p.bucketSize))).toEqual(new Set([6]))
    expect(positioned.map(p => p.stackIndex).sort()).toEqual([0, 1, 2, 3, 4, 5])
    // Allemaal op hetzelfde zwaartepunt — anders staat de stapel scheef.
    expect(new Set(positioned.map(p => p.clusterX)).size).toBe(1)
    expect(positioned[0].clusterMembers).toHaveLength(6)
  })

  it('trekt bij inzoomen vanzelf weer uit elkaar tot losse markers', () => {
    // Geen aparte modus of drempel-schakelaar: dezelfde code, andere xScale.
    const positioned = positionChartEvents(reeks, {
      pixelClustering: { xScale: ingezoomd },
    })

    expect(positioned.every(p => p.bucketSize === 1)).toBe(true)
    expect(positioned.every(p => p.stackIndex === 0)).toBe(true)
  })

  it('clustert nooit over de boven/onder-grens heen', () => {
    const gemengd = [ev('boven', 44), ev('onder', 44, { side: 'below' })]
    const positioned = positionChartEvents(gemengd, {
      pixelClustering: { xScale: uitgezoomd },
    })

    expect(positioned.every(p => p.bucketSize === 1)).toBe(true)
  })

  it('houdt de stapelvolgorde aan: eigen gebeurtenis vóór doel vóór mijlpaal', () => {
    const gemengd = [
      ev('nat', 45, { kind: 'natural' }),
      ev('doel', 44, { kind: 'goal' }),
      ev('eigen', 46, { kind: 'life_event' }),
    ]
    const positioned = positionChartEvents(gemengd, {
      pixelClustering: { xScale: uitgezoomd },
    })

    const volgorde = [...positioned]
      .sort((a, b) => a.stackIndex - b.stackIndex)
      .map(p => p.id)
    expect(volgorde).toEqual(['eigen', 'doel', 'nat'])
  })

  it('levert genoeg leden voor een "+N"-badge zodra de bucket de stapel overschrijdt', () => {
    const positioned = positionChartEvents(reeks, {
      pixelClustering: { xScale: uitgezoomd },
    })
    const badgeDrager = positioned.find(p => p.stackIndex === MAX_STACK_VISIBLE - 1)!

    // De badge toont "+3" (6 leden, 3 zichtbaar) en moet ÁLLE 6 kunnen openen:
    // een lijst die er minder toont dan de badge telt is erger dan geen lijst.
    expect(badgeDrager.bucketSize - MAX_STACK_VISIBLE).toBe(3)
    expect(badgeDrager.clusterMembers).toHaveLength(6)
  })
})

describe('chartEventOverlayToClusterRow', () => {
  it('verzint geen bedragen maar zet een expliciete tekstregel', () => {
    const rij = chartEventOverlayToClusterRow(ev('g1', 52, { kind: 'goal' }))

    expect(rij.one_time_cost).toBe(0)
    expect(rij.monthly_cost_change).toBe(0)
    expect(rij.monthly_income_change).toBe(0)
    expect(rij.metadata?.impactLine).toBe('Financieel doel')
    expect(rij.target_age).toBe(52)
  })

  it('gebruikt de detail-regel van de marker wanneer die er is', () => {
    const rij = chartEventOverlayToClusterRow(
      ev('g2', 52, { kind: 'goal', detail: 'Streefdatum verstreken' }),
    )
    expect(rij.metadata?.impactLine).toBe('Streefdatum verstreken')
  })

  it('benoemt een read-only partner-gebeurtenis als zodanig', () => {
    const rij = chartEventOverlayToClusterRow(
      ev('partner-1', 48, { kind: 'life_event', readOnly: true }),
    )
    expect(rij.metadata?.impactLine).toBe('Levensgebeurtenis van je partner')
    expect(rij.metadata?.isNatural).toBe(false)
  })
})
