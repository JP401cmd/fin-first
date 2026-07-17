import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BerichtenWidget } from './berichten-widget'
import type { DashboardData } from './widget-renderer'
import type { NewsPreview } from '@/lib/news-preview'

// De Nieuws-widget (id `berichten`) consumeert het serverveld data.newsPreview.
// Deze tests borgen de review-fixes (2026-07-17): echt editienummer i.p.v.
// dagen-sinds-launch, generatedAt i.p.v. new Date(), "artikelen" i.p.v.
// "nieuw", en impact-stippen i.p.v. gebruikers-instelbare module-accenten.

function makePreview(overrides: Partial<NewsPreview> = {}): NewsPreview {
  return {
    editionNr: 3,
    count: 3,
    // Bewust een oude datum (niet vandaag) om te bewijzen dat de widget de
    // bron-datum consumeert en niet new Date() rekent.
    generatedAt: '2026-03-05T08:00:00.000Z',
    items: [
      { id: 'n1', headline: 'Box 3-tarief stijgt', summary: 'Forfait omhoog.', category: 'fiscaal', impactDirection: 'negatief' },
      { id: 'n2', headline: 'Hypotheekrente daalt', summary: 'Rentes zakken.', category: 'woningmarkt', impactDirection: 'positief' },
      { id: 'n3', headline: 'ECB houdt rente gelijk', summary: 'Geen wijziging.', category: 'macro', impactDirection: 'neutraal' },
    ],
    ...overrides,
  }
}

function makeData(preview: NewsPreview | null): DashboardData {
  return { newsPreview: preview } as unknown as DashboardData
}

describe('BerichtenWidget — empty state', () => {
  it('toont empty state zonder newsPreview', () => {
    const { container } = render(<BerichtenWidget size="full" data={makeData(null)} />)
    expect(container.textContent).toContain('nieuwspagina')
  })

  it('toont empty state bij lege editie', () => {
    const { container } = render(
      <BerichtenWidget size="full" data={makeData(makePreview({ items: [], count: 0 }))} />,
    )
    expect(container.textContent).toContain('nieuwspagina')
  })
})

describe('BerichtenWidget — consume, don\'t recompute', () => {
  it('toont het echte editienummer uit de bron, niet dagen-sinds-launch', () => {
    const { container } = render(<BerichtenWidget size="full" data={makeData(makePreview())} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Editie 3')
    // De oude getEditionNumber() gaf ~197 (dagen sinds 2026-01-01).
    expect(text).not.toContain('197')
  })

  it('toont de bron-datum (generatedAt), niet de datum van vandaag', () => {
    const { container } = render(<BerichtenWidget size="half" data={makeData(makePreview())} />)
    const text = container.textContent ?? ''
    expect(text).toContain('5 maart')
    // Vandaag (testdatum juli) mag nooit als dateline verschijnen.
    expect(text).not.toContain('juli')
  })

  it('verbergt de editieregel wanneer editionNr ontbreekt', () => {
    const { container } = render(
      <BerichtenWidget size="quarter" data={makeData(makePreview({ editionNr: null }))} />,
    )
    expect(container.textContent).not.toContain('Editie')
  })
})

describe('BerichtenWidget — mini teller', () => {
  it('labelt het aantal als "artikelen", niet "nieuw"', () => {
    const { container } = render(<BerichtenWidget size="mini" data={makeData(makePreview())} />)
    const text = container.textContent ?? ''
    expect(text).toContain('3 artikelen')
    expect(text).not.toContain('nieuw')
  })

  it('gebruikt enkelvoud bij één artikel', () => {
    const { container } = render(
      <BerichtenWidget
        size="mini"
        data={makeData(makePreview({ count: 1, items: [makePreview().items[0]] }))}
      />,
    )
    expect(container.textContent).toContain('1 artikel')
  })
})

describe('BerichtenWidget — kleurconventie (MED-8)', () => {
  it('gebruikt semantische impact-tokens, geen instelbare module-accenten', () => {
    const { container } = render(<BerichtenWidget size="full" data={makeData(makePreview())} />)
    const html = container.innerHTML
    // Impactrichting via semantische tokens (volgen accentkeuze bewust niet).
    expect(html).toContain('bg-positive')
    expect(html).toContain('bg-negative')
    // Module-accenttokens mogen NIET meer voorkomen als categorie-/impactkleur.
    expect(html).not.toContain('bg-kern-500')
    expect(html).not.toContain('bg-wil-500')
    expect(html).not.toContain('bg-horizon-500')
  })
})

describe('BerichtenWidget — inhoud per sizing', () => {
  it('full toont categorielabel en samenvatting', () => {
    const { container } = render(<BerichtenWidget size="full" data={makeData(makePreview())} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Fiscaal')
    expect(text).toContain('Forfait omhoog.')
  })
})
