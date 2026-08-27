/**
 * M36 — doel-markers op de tijdas.
 *
 * Deze suite pint niet alleen "er staat een marker", maar de GERENDERDE positie
 * tegen de canonieke omzetting: de x-coördinaat van het SVG-icoon moet exact de
 * leeftijd zijn die `buildGoalChartMarkers` uit `target_date` + geboortedatum
 * afleidt. Zo wordt weergave-drift (verkeerd veld, verkeerde datum-grondslag,
 * stale mapping) zichtbaar in plaats van pas bij een gebruikersmelding.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  buildGoalChartMarkers,
  fractionalAgeAt,
  isGoalMarkerId,
  GOAL_MARKER_ID_PREFIX,
  type GoalMarkerInput,
} from './goal-chart-markers'
import { positionChartEvents, type ChartEventOverlay } from '@/lib/chart-event-overlay'
import { ChartEventMarkers } from '@/components/app/horizon/chart-event-markers'
import { EVENT_ICON_COMPONENTS } from '@/lib/event-icon'
import { GOAL_TYPE_ICONS, GOAL_TYPE_META, type GoalType } from '@/lib/goal-data'

const DOB = '1990-06-15'
const NOW = new Date('2026-08-27T12:00:00Z')

const OPTS = {
  dateOfBirth: DOB,
  currentAge: 36,
  color: '#0f766e',
  overdueColor: '#b91c1c',
  now: NOW,
}

function goal(overrides: Partial<GoalMarkerInput> & { id: string }): GoalMarkerInput {
  return {
    name: 'Noodfonds',
    goal_type: 'savings',
    target_date: '2030-06-15',
    is_completed: false,
    ...overrides,
  }
}

describe('fractionalAgeAt', () => {
  it('geeft een hele leeftijd op de verjaardag zelf', () => {
    expect(fractionalAgeAt(DOB, new Date('2030-06-15T00:00:00'))).toBe(40)
  })

  it('geeft de fractie binnen het lopende levensjaar', () => {
    // Exact een half jaar na de 40e verjaardag → ~40,5.
    const age = fractionalAgeAt(DOB, new Date('2030-12-15T00:00:00'))
    expect(age).not.toBeNull()
    expect(age!).toBeGreaterThan(40.45)
    expect(age!).toBeLessThan(40.55)
  })

  it('geeft null bij een onbruikbare datum', () => {
    expect(fractionalAgeAt('geen-datum', new Date('2030-01-01'))).toBeNull()
  })
})

describe('buildGoalChartMarkers — selectie', () => {
  it('bouwt een marker voor een doel met streefdatum', () => {
    const out = buildGoalChartMarkers([goal({ id: 'g1' })], OPTS)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(`${GOAL_MARKER_ID_PREFIX}g1`)
    expect(out[0].kind).toBe('goal')
    expect(out[0].label).toBe('Noodfonds')
    expect(out[0].age).toBe(40)
  })

  it('slaat een doel ZONDER streefdatum over (bekende grens, geen crash)', () => {
    expect(buildGoalChartMarkers([goal({ id: 'g1', target_date: null })], OPTS)).toEqual([])
  })

  it('slaat afgeronde doelen over', () => {
    expect(buildGoalChartMarkers([goal({ id: 'g1', is_completed: true })], OPTS)).toEqual([])
  })

  it('sluit lab-parameterdoelen uit — die staan al in het doelblok', () => {
    // Discriminant is de viaLab-vlag, niet een overgetikte type-lijst: elk
    // nieuw lab-type loopt automatisch mee.
    const viaLab = (Object.keys(GOAL_TYPE_META) as GoalType[]).filter(
      t => GOAL_TYPE_META[t].viaLab,
    )
    expect(viaLab).toContain('fire_age')
    expect(viaLab).toContain('expected_return')

    const goals = viaLab.map((t, i) => goal({ id: `lab-${i}`, goal_type: t }))
    expect(buildGoalChartMarkers(goals, OPTS)).toEqual([])
  })

  it('geeft geen markers zonder geboortedatum (geen leeftijd-as mogelijk)', () => {
    expect(buildGoalChartMarkers([goal({ id: 'g1' })], { ...OPTS, dateOfBirth: null })).toEqual([])
  })

  it('negeert een onparseerbare streefdatum', () => {
    expect(buildGoalChartMarkers([goal({ id: 'g1', target_date: 'ooit' })], OPTS)).toEqual([])
  })

  it('markers zijn read-only: niet sleepbaar, geen sourceId', () => {
    const [m] = buildGoalChartMarkers([goal({ id: 'g1' })], OPTS)
    expect(m.readOnly).toBe(true)
    expect(m.sourceId).toBeUndefined()
  })
})

describe('buildGoalChartMarkers — verstreken streefdatum', () => {
  it('klemt een verstreken doel op de huidige leeftijd zodat het zichtbaar blijft', () => {
    const [m] = buildGoalChartMarkers(
      [goal({ id: 'oud', target_date: '2024-01-10' })],
      OPTS,
    )
    // Zonder klem zou de leeftijd (~33,6) links buiten het venster vallen en
    // filtert ChartEventMarkers 'm weg — precies de onzichtbaarheid uit M36.
    expect(m.age).toBe(36)
    expect(m.color).toBe(OPTS.overdueColor)
    expect(m.detail).toMatch(/^Streefdatum verstreken · /)
  })

  it('een toekomstig doel houdt de accentkleur en de gewone detail-regel', () => {
    const [m] = buildGoalChartMarkers([goal({ id: 'g1' })], OPTS)
    expect(m.color).toBe(OPTS.color)
    expect(m.detail).toBe('Streefdatum · 15 juni 2030')
  })

  it('toont geen kaal bedrag — de detail-regel is puur tijd', () => {
    const [m] = buildGoalChartMarkers([goal({ id: 'g1' })], OPTS)
    expect(m.detail).not.toMatch(/€/)
  })
})

describe('doel-iconen zijn gedekt door de gedeelde catalogus', () => {
  it('elk GOAL_TYPE_ICONS-glyph bestaat in EVENT_ICON_COMPONENTS', () => {
    // Ontbreekt er één, dan valt de marker terug op `Calendar` en ziet een doel
    // eruit als een levensgebeurtenis — precies wat M36 wilde onderscheiden.
    for (const [type, icon] of Object.entries(GOAL_TYPE_ICONS)) {
      expect(EVENT_ICON_COMPONENTS[icon], `${type} → ${icon}`).toBeDefined()
    }
  })
})

describe('stapelvolgorde binnen één leeftijd-bucket', () => {
  it('levensgebeurtenis eerst, dan doel, dan natuurlijke mijlpaal', () => {
    const base = { age: 40, side: 'above' as const, color: '#000', icon: 'Calendar', label: 'x' }
    const positioned = positionChartEvents([
      { ...base, id: 'n', kind: 'natural' },
      { ...base, id: 'g', kind: 'goal' },
      { ...base, id: 'l', kind: 'life_event' },
    ])
    const byId = Object.fromEntries(positioned.map(p => [p.id, p.stackIndex]))
    expect(byId.l).toBe(0)
    expect(byId.g).toBe(1)
    expect(byId.n).toBe(2)
  })
})

// ── Render-grendel: de getekende positie == de berekende leeftijd ────────────

function xScale(age: number): number {
  return ((age - 20) / 80) * 800
}

function renderMarkers(events: ChartEventOverlay[]) {
  return render(
    <svg width={800} height={400}>
      <ChartEventMarkers
        events={events}
        xScale={xScale}
        padLeft={0}
        chartTopY={60}
        chartBottomY={340}
        visibleMinAge={36}
        visibleMaxAge={100}
      />
    </svg>,
  )
}

describe('ChartEventMarkers — doel-marker render', () => {
  it('tekent de marker op exact de leeftijd die de builder afleidt', () => {
    const markers = buildGoalChartMarkers([goal({ id: 'g1' })], OPTS)
    const { container } = renderMarkers(markers)

    const node = container.querySelector('[data-testid="chart-event-marker-goal-g1"]')
    expect(node).not.toBeNull()

    const circle = node!.querySelector('circle')
    expect(circle).not.toBeNull()
    // De gerénderde x moet de canonieke omzetting volgen — geen eigen som,
    // geen afgeronde-jaar-benadering.
    expect(Number(circle!.getAttribute('cx'))).toBeCloseTo(xScale(markers[0].age), 6)
    expect(circle!.getAttribute('stroke')).toBe(OPTS.color)
  })

  it('rendert een verstreken doel binnen het venster i.p.v. het weg te filteren', () => {
    const markers = buildGoalChartMarkers(
      [goal({ id: 'oud', target_date: '2024-01-10' })],
      OPTS,
    )
    const { container } = renderMarkers(markers)
    const node = container.querySelector('[data-testid="chart-event-marker-goal-oud"]')
    expect(node).not.toBeNull()
    expect(node!.querySelector('circle')!.getAttribute('stroke')).toBe(OPTS.overdueColor)
  })
})

describe('isGoalMarkerId', () => {
  it('herkent doel-markers en laat andere ids met rust', () => {
    expect(isGoalMarkerId('goal-abc')).toBe(true)
    expect(isGoalMarkerId('nat-debt-1')).toBe(false)
    expect(isGoalMarkerId('partner-1')).toBe(false)
  })
})
