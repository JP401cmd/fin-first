/**
 * Structuur-grendels op de canvas-bladeren die bij de extractie het makkelijkst
 * stil verschuiven (kaart V4, V7, besluit Q4):
 *
 *  1. PhaseBar, EventsTimeline en de Inkomen & Uitgaven-grafiek staan ín de
 *     render-prop van ZoomableChartContainer en lezen zijn zoomvenster
 *     (visibleMin/visibleMax). Fase 1 laat PhaseBar hier (Q4).
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

  it("Scenario's, Marktcheck, tweede lijn en Speel af staan binnen HideInSimple; de doellijn-pil niet", () => {
    const src = lees('canvas-pills.tsx')
    const binnen = (anker: string) => {
      const i = src.indexOf(anker)
      expect(i, anker).toBeGreaterThan(-1)
      return src.lastIndexOf('<HideInSimple>', i) > src.lastIndexOf('</HideInSimple>', i)
    }
    expect(binnen('aria-label="Scenario-lijnen tonen"')).toBe(true)
    expect(binnen('<FlaskConical')).toBe(true)
    expect(binnen('onClick={() => persistLiquidLine(!showLiquidLine)}')).toBe(true)
    expect(binnen("aria-label={isPlaying ? 'Pauzeer afspelen' : 'Speel de levenslijn af'}")).toBe(true)
    expect(binnen('onClick={() => setShowScenarioLine(prev => !prev)}')).toBe(false)
  })

  it.each(['canvas-pills.tsx', 'canvas-uitleg.tsx', 'canvas-grafiek.tsx', 'canvas-legenda.tsx'])(
    '%s kiest nooit via een ternary op de weergavemodus',
    (naam) => {
      expect(lees(naam)).not.toMatch(/displayMode === 'simple' \?/)
    },
  )
})
