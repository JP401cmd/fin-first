/**
 * Structuur-grendels op de canvas-bladeren die bij de extractie het makkelijkst
 * stil verschuiven (kaart V4, V7, besluit Q4):
 *
 *  1. PhaseBar, EventsTimeline en de Geldstroom-grafiek (IncomeExpenseChart, sinds
 *     fase 2 een modus) staan ín de render-prop van ZoomableChartContainer en lezen
 *     zijn zoomvenster (visibleMin/visibleMax). PhaseBar blijft hier (Q4), alleen in Plan.
 *  2. De render-volgorde binnen de grafiek is die van vandaag (spiegelt VOLGORDE
 *     in `lib/horizon/toekomst-blokken.inventaris.test.ts`).
 *  3. De HideInSimple-grenzen reizen mee (ADR 0026: nooit als ternary).
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const DIR = join(process.cwd(), 'components', 'toekomst', 'canvas')
const lees = (naam: string) => readSourceLF(join(DIR, naam))

describe('canvas-grafiek — zoom-render-prop (V4/Q4)', () => {
  const src = lees('canvas-grafiek.tsx')
  const start = src.indexOf('{(visibleMin, visibleMax, controls) => (')
  const eind = src.indexOf('</ZoomableChartContainer>')
  const renderProp = src.slice(start, eind)

  it('heeft één render-prop met het zoomvenster', () => {
    expect(start).toBeGreaterThan(-1)
    expect(eind).toBeGreaterThan(start)
  })

  it.each(['<SimChart', '<WealthCompositionChart', '<IncomeExpenseChart', '<EventsTimeline', '<PhaseBar'])(
    '%s staat binnen de render-prop',
    (tag) => {
      expect(renderProp).toContain(tag)
    },
  )

  it('PhaseBar, EventsTimeline en IncomeExpenseChart lezen het zoomvenster', () => {
    for (const tag of ['<PhaseBar', '<EventsTimeline', '<IncomeExpenseChart']) {
      const blok = renderProp.slice(renderProp.indexOf(tag), renderProp.indexOf('/>', renderProp.indexOf(tag)))
      expect(blok, tag).toContain('visibleMinAge={visibleMin}')
      expect(blok, tag).toContain('visibleMaxAge={visibleMax}')
    }
  })

  it('houdt de render-volgorde van vandaag', () => {
    const volgorde = ['<ProjectieLaadlaag', '<ToekomstOverlay', '<SimChart', '<WealthCompositionChart', '<IncomeExpenseChart', '<EventsTimeline', '<PhaseBar']
    const posities = volgorde.map((t) => src.indexOf(t))
    expect(posities.every((p) => p > -1)).toBe(true)
    expect([...posities].sort((a, b) => a - b)).toEqual(posities)
  })

  it('de IncomeExpenseChart-dynamic verhuisde mee met zijn enige consument (V3)', () => {
    expect(src).toContain("import('@/components/app/horizon/income-expense-chart')")
    expect(src).toContain('{ ssr: false }')
  })
})

describe('canvas-bladeren — HideInSimple-grenzen reizen mee (V7)', () => {
  it('PhaseBar staat binnen HideInSimple', () => {
    const src = lees('canvas-grafiek.tsx')
    const i = src.indexOf('<PhaseBar')
    expect(src.lastIndexOf('<HideInSimple>', i)).toBeGreaterThan(src.lastIndexOf('</HideInSimple>', i))
  })

  it('LifelineReadout staat binnen HideInSimple', () => {
    const src = lees('canvas-uitleg.tsx')
    const i = src.indexOf('<LifelineReadout')
    expect(src.lastIndexOf('<HideInSimple>', i)).toBeGreaterThan(src.lastIndexOf('</HideInSimple>', i))
  })

  it('de lagen buiten Eenvoudig staan in HideInSimple van het Lagen-menu (de pills zijn vervallen)', () => {
    const src = lees('lagen-menu.tsx')
    expect(src).toContain('LAGEN_EENVOUDIG.includes(id) ? rij : <HideInSimple key={id}>{rij}</HideInSimple>')
  })

  it('de sub-weergave Bronnen van Geldstroom staat in HideInSimple', () => {
    const src = lees('modus-switch.tsx')
    expect(src).toContain("s === 'bronnen' ? <HideInSimple key={s}>{knop}</HideInSimple> : knop")
  })

  it.each(['canvas-uitleg.tsx', 'canvas-grafiek.tsx', 'canvas-legenda.tsx', 'modus-switch.tsx', 'lagen-menu.tsx'])(
    '%s kiest nooit via een ternary op de weergavemodus',
    (naam) => {
      expect(lees(naam)).not.toMatch(/displayMode === 'simple' \?/)
    },
  )
})
