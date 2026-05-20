import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BriefingPanel, MAX_BRIEFING_ENTRIES, type BriefingEntry } from './briefing-panel'

/**
 * Tests voor BriefingPanel — 3-koloms grid (max 6) voor wekelijkse briefing.
 * Categorieën: observation/tip/upcoming/heads_up/milestone/market.
 */

function makeEntry(
  category: BriefingEntry['category'],
  text: string,
  overrides: Partial<BriefingEntry> = {},
): BriefingEntry {
  return { id: category + ':' + text.slice(0, 5), category, text, ...overrides }
}

describe('BriefingPanel — basis-render', () => {
  it('rendert empty-state placeholder bij geen entries', () => {
    render(<BriefingPanel entries={[]} />)
    expect(screen.getByText(/Nog onvoldoende data/i)).toBeTruthy()
  })

  it('rendert alle 6 categorie-labels wanneer alle types gegeven', () => {
    render(
      <BriefingPanel
        entries={[
          makeEntry('observation', 'Vermogen +1.2%'),
          makeEntry('tip', 'Verschuif €3k'),
          makeEntry('upcoming', 'Autoverz. €87'),
          makeEntry('heads_up', 'Schuld hoog'),
          makeEntry('milestone', 'Eerste doel behaald'),
          makeEntry('market', 'AEX -1.2%'),
        ]}
      />,
    )
    expect(screen.getByText('Wat valt op')).toBeTruthy()
    expect(screen.getByText('Een tip')).toBeTruthy()
    expect(screen.getByText('Komende maand')).toBeTruthy()
    expect(screen.getByText('Heads-up')).toBeTruthy()
    expect(screen.getByText('Mijlpaal')).toBeTruthy()
    expect(screen.getByText('Markt')).toBeTruthy()
  })

  it('capped op MAX_BRIEFING_ENTRIES (6) — extra worden weggelaten', () => {
    const seven: BriefingEntry[] = Array.from({ length: 7 }, (_, i) =>
      makeEntry('observation', `Item ${i}`, { id: 'obs-' + i }),
    )
    const { container } = render(<BriefingPanel entries={seven} />)
    // 6 zichtbaar, 7e niet
    expect(container.textContent).toContain('Item 5')
    expect(container.textContent).not.toContain('Item 6')
    expect(MAX_BRIEFING_ENTRIES).toBe(6)
  })

  it('rendert body-tekst per entry', () => {
    render(
      <BriefingPanel
        entries={[
          makeEntry('observation', 'Vermogen +1.2%'),
          makeEntry('tip', 'Verschuif €3k'),
        ]}
      />,
    )
    expect(screen.getByText('Vermogen +1.2%')).toBeTruthy()
    expect(screen.getByText('Verschuif €3k')).toBeTruthy()
  })
})

describe('BriefingPanel — href en span', () => {
  it('rendert card als Link wanneer href gegeven', () => {
    const { container } = render(
      <BriefingPanel
        entries={[
          makeEntry('tip', 'Klik mij', { href: '/overzicht/cashflow' }),
        ]}
      />,
    )
    expect(container.querySelector('a[href="/overzicht/cashflow"]')).toBeTruthy()
  })

  it('rendert card als article zonder href', () => {
    const { container } = render(
      <BriefingPanel entries={[makeEntry('observation', 'Niet klikbaar')]} />,
    )
    expect(container.querySelector('article')).toBeTruthy()
    expect(container.querySelector('a')).toBeNull()
  })

  it('wide-span card krijgt sm:col-span-2 class', () => {
    const { container } = render(
      <BriefingPanel
        entries={[
          makeEntry('observation', 'Headline-item', { span: 'wide' }),
        ]}
      />,
    )
    expect(container.querySelector('.sm\\:col-span-2')).toBeTruthy()
  })

  it('narrow-span (default) krijgt geen col-span-2', () => {
    const { container } = render(
      <BriefingPanel entries={[makeEntry('observation', 'Standaard')]} />,
    )
    const article = container.querySelector('article')
    expect(article?.className.includes('col-span-2')).toBe(false)
  })
})

describe('BriefingPanel — hefboom-tag (plan T-3)', () => {
  it('rendert hefboom-icoon badge wanneer hefboom-veld gezet is', () => {
    const { container } = render(
      <BriefingPanel
        entries={[makeEntry('tip', 'Verlaag vaste lasten', { hefboom: 'cashflow' })]}
      />,
    )
    // HEFBOOM_CONFIG.cashflow tint = 'text-sky-700 bg-sky-50'
    expect(container.querySelector('.bg-sky-50')).toBeTruthy()
    // aria-label staat op de span
    expect(container.querySelector('[aria-label*="Cashflow"]')).toBeTruthy()
  })

  it('rendert GEEN hefboom-icoon zonder hefboom-veld', () => {
    const { container } = render(
      <BriefingPanel entries={[makeEntry('tip', 'Geen tag')]} />,
    )
    expect(container.querySelector('[aria-label*="Cashflow"]')).toBeNull()
    expect(container.querySelector('[aria-label*="Bezittingen"]')).toBeNull()
  })

  it('toont juiste tint per hefboom (bezittingen=emerald, schulden=amber, belasting=violet)', () => {
    const { container } = render(
      <BriefingPanel
        entries={[
          makeEntry('observation', 'a', { hefboom: 'bezittingen' }),
          makeEntry('tip', 'b', { hefboom: 'schulden' }),
          makeEntry('upcoming', 'c', { hefboom: 'belasting' }),
        ]}
      />,
    )
    expect(container.querySelector('.bg-emerald-50')).toBeTruthy()
    expect(container.querySelector('.bg-amber-50')).toBeTruthy()
    expect(container.querySelector('.bg-violet-50')).toBeTruthy()
  })
})

describe('BriefingPanel — kleur-codering per categorie', () => {
  it('observation = emerald, tip = violet, upcoming = sky', () => {
    const { container } = render(
      <BriefingPanel
        entries={[
          makeEntry('observation', 'A'),
          makeEntry('tip', 'B'),
          makeEntry('upcoming', 'C'),
        ]}
      />,
    )
    expect(container.querySelector('.bg-emerald-500')).toBeTruthy()
    expect(container.querySelector('.bg-violet-500')).toBeTruthy()
    expect(container.querySelector('.bg-sky-500')).toBeTruthy()
  })

  it('heads_up = amber, milestone = fuchsia, market = slate', () => {
    const { container } = render(
      <BriefingPanel
        entries={[
          makeEntry('heads_up', 'X'),
          makeEntry('milestone', 'Y'),
          makeEntry('market', 'Z'),
        ]}
      />,
    )
    expect(container.querySelector('.bg-amber-500')).toBeTruthy()
    expect(container.querySelector('.bg-fuchsia-500')).toBeTruthy()
    expect(container.querySelector('.bg-slate-500')).toBeTruthy()
  })
})

describe('BriefingPanel — narrative', () => {
  it('rendert narrative-card met tekst en Will-W badge', () => {
    render(
      <BriefingPanel
        entries={[makeEntry('observation', 'Vermogen +1.2%')]}
        narrative="Vorige week: vermogen +1.2%, schuld stabiel."
      />,
    )
    expect(screen.getByText(/Will — jouw briefing/i)).toBeTruthy()
    expect(screen.getByText(/Vorige week: vermogen/)).toBeTruthy()
  })

  it('toont "Eerdere briefings →" link naar /will', () => {
    const { container } = render(
      <BriefingPanel
        entries={[makeEntry('observation', 'X')]}
        narrative="Test narrative."
      />,
    )
    const link = container.querySelector('a[href="/will#briefing"]')
    expect(link).toBeTruthy()
    expect(link?.textContent).toMatch(/Eerdere briefings/i)
  })

  it('rendert geen narrative-card zonder text', () => {
    render(<BriefingPanel entries={[makeEntry('observation', 'X')]} />)
    expect(screen.queryByText(/Will — jouw briefing/i)).toBeNull()
  })
})
