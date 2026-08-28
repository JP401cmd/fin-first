/**
 * M17 — de compacte mobiele lezing van de uitgaven-heatmap.
 *
 * De bevinding: op mobiel toonden de krappe tegels (`quarter`/`half`, en `half`
 * is de DEFAULT van deze widget) dezelfde SVG-treemap als desktop. De viewBox
 * van `half` is 800×190 terwijl het content-vlak op 390px-breed ~330×70px is;
 * `preserveAspectRatio="meet"` schaalt de hele SVG dan met ~0,4-0,5×, en de
 * labels in de foreignObject (nominaal 9-10px) schalen mee tot ~4-5px. Tien
 * categorieën in een halve tegel werden zo decoratie in plaats van informatie.
 *
 * Besluit eigenaar 26-08-2026: lijst top-5 + "toon meer" voor half/quarter, en
 * de tegel aantikbaar naar de schermbrede route.
 *
 * BudgetHeatmap is een GEDEELDE component (widget én de vrijstaande
 * budgetten-pagina), dus deze suite toetst ALLE sizes — juist dat de grote
 * formaten en de vrijstaande pagina ongemoeid blijven.
 *
 * NB: jsdom kent geen media-queries. Beide render-paden staan dus altijd in de
 * DOM; welk pad mobiel wint is een `md:hidden`/`hidden md:…`-kwestie. Deze
 * tests toetsen daarom of het compacte pad AANWEZIG is voor de juiste sizes en
 * afwezig voor de rest, plus de klassen die de zichtbaarheid sturen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BudgetHeatmap, type HeatmapSection } from './budget-heatmap'
import type { WidgetSize } from '@/lib/widget-catalog'

vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({ masked: false }),
}))

/** Acht categorieën met oplopend budget — genoeg om de top-5-cap te bewijzen. */
const NAMES = [
  'Boodschappen', 'Wonen', 'Vervoer', 'Verzekeringen',
  'Gas, water, licht', 'Abonnementen', 'Kleding', 'Uitjes',
]

const section = {
  label: 'Uitgaven',
  budgetType: 'expense',
  groups: NAMES.map((name, i) => ({
    id: `c${i}`,
    name,
    icon: 'ShoppingCart',
    default_limit: (i + 1) * 100,
    children: [],
  })),
} as unknown as HeatmapSection

const spending = Object.fromEntries(NAMES.map((_, i) => [`c${i}`, (i + 1) * 50]))

beforeEach(cleanup)

describe('BudgetHeatmap — compacte mobiele lijst bij krappe tegels (M17)', () => {
  it.each(['quarter', 'half'] as WidgetSize[])(
    '%s toont de top-5-lijst met echte HTML-tekst i.p.v. alleen de geschaalde SVG',
    (size) => {
      render(
        <BudgetHeatmap sections={[section]} spending={spending} onNavigate={() => {}} size={size} />,
      )
      const list = screen.getByRole('list', { name: 'Grootste budgetten' })
      expect(list.querySelectorAll('li')).toHaveLength(5)
    },
  )

  it('toont de vijf GROOTSTE budgetten — dezelfde ordening als de treemap zelf', () => {
    render(
      <BudgetHeatmap sections={[section]} spending={spending} onNavigate={() => {}} size="half" />,
    )
    const list = screen.getByRole('list', { name: 'Grootste budgetten' })
    const labels = [...list.querySelectorAll('li')].map((li) => li.textContent ?? '')
    // squarify() sorteert op weight (= limit) aflopend; c7 (800) is de grootste.
    expect(labels[0]).toContain('Uitjes')
    expect(labels[4]).toContain('Verzekeringen')
    // De drie kleinste zitten NIET in de lijst — die vind je achter "toon meer".
    expect(labels.join(' ')).not.toContain('Boodschappen')
  })

  it('toont het percentage per regel als leesbare tekst', () => {
    render(
      <BudgetHeatmap sections={[section]} spending={spending} onNavigate={() => {}} size="half" />,
    )
    const list = screen.getByRole('list', { name: 'Grootste budgetten' })
    // Elke regel besteedde de helft van zijn limiet → 50%.
    expect(list.textContent).toContain('50%')
  })

  it('een regel opent de categorie (en volgt niet de tegel-href)', () => {
    const onNavigate = vi.fn()
    render(
      <BudgetHeatmap sections={[section]} spending={spending} onNavigate={onNavigate} size="half" />,
    )
    const list = screen.getByRole('list', { name: 'Grootste budgetten' })
    fireEvent.click(list.querySelectorAll('button')[0])
    expect(onNavigate).toHaveBeenCalledWith('c7')
  })

  it('"toon meer" noemt het echte totaal en roept onShowAll aan', () => {
    const onShowAll = vi.fn()
    render(
      <BudgetHeatmap
        sections={[section]}
        spending={spending}
        onNavigate={() => {}}
        size="half"
        onShowAll={onShowAll}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Toon alle 8' }))
    expect(onShowAll).toHaveBeenCalledTimes(1)
  })

  it('geen "toon meer" wanneer alles al zichtbaar is (geen loze knop)', () => {
    const small = {
      label: 'Uitgaven',
      budgetType: 'expense',
      groups: (section.groups as unknown[]).slice(0, 3),
    } as unknown as HeatmapSection
    render(
      <BudgetHeatmap
        sections={[small]}
        spending={spending}
        onNavigate={() => {}}
        size="half"
        onShowAll={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /Toon alle/ })).toBeNull()
  })
})

describe('BudgetHeatmap — de andere sizes blijven ongemoeid (gedeelde component)', () => {
  it.each(['full', 'xl'] as WidgetSize[])(
    '%s houdt de gestapelde groepslijst en krijgt GEEN compacte lijst',
    (size) => {
      render(
        <BudgetHeatmap sections={[section]} spending={spending} onNavigate={() => {}} size={size} />,
      )
      expect(screen.queryByRole('list', { name: 'Grootste budgetten' })).toBeNull()
      expect(screen.getAllByText('Uitjes').length).toBeGreaterThan(0)
    },
  )

  it('vrijstaande pagina (geen size) krijgt GEEN compacte lijst', () => {
    render(<BudgetHeatmap sections={[section]} spending={spending} onNavigate={() => {}} />)
    expect(screen.queryByRole('list', { name: 'Grootste budgetten' })).toBeNull()
  })

  it('mini valt niet in de compacte tak (de widget toont daar een telling)', () => {
    render(
      <BudgetHeatmap sections={[section]} spending={spending} onNavigate={() => {}} size="mini" />,
    )
    expect(screen.queryByRole('list', { name: 'Grootste budgetten' })).toBeNull()
  })

  it('de SVG is op mobiel verborgen bij quarter/half en blijft zichtbaar op desktop', () => {
    for (const size of ['quarter', 'half'] as WidgetSize[]) {
      const { container, unmount } = render(
        <BudgetHeatmap sections={[section]} spending={spending} onNavigate={() => {}} size={size} />,
      )
      const svgBlock = container.querySelector('svg')?.closest('div')?.parentElement
      expect(svgBlock?.className).toContain('hidden')
      expect(svgBlock?.className).toContain('md:flex')
      unmount()
    }
  })

  it('fit-to-tile blijft intact voor alle widget-sizes (regressie op de vorige fix)', () => {
    for (const size of ['quarter', 'half', 'full', 'xl'] as WidgetSize[]) {
      const { container, unmount } = render(
        <BudgetHeatmap sections={[section]} spending={spending} onNavigate={() => {}} size={size} />,
      )
      expect(container.querySelector('svg')?.getAttribute('class')).toContain('h-full')
      unmount()
    }
  })
})
