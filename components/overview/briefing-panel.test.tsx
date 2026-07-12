import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import type { ActiveSubscriptions } from '@/lib/feature-registry'
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

/**
 * Render binnen een FeatureAccessProvider zodat useModuleAccess() de opgegeven
 * abonnementen ziet. De AI-redactie-ververs zit achter het 'ai'-abonnement;
 * zonder provider valt subscriptions terug op [] (= geen AI).
 */
function renderWithSubs(ui: ReactElement, subscriptions: ActiveSubscriptions) {
  return render(
    <FeatureAccessProvider
      data={{
        features: {},
        phase: 'recovery',
        level: 0,
        subscriptions,
        netWorth: 0,
        monthlyExpenses: 0,
        freedomPct: 0,
        tier: subscriptions.includes('ai') ? 'ai' : 'gratis',
      }}
    >
      {ui}
    </FeatureAccessProvider>,
  )
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
    expect(screen.getByText('Binnenkort')).toBeTruthy()
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

describe('BriefingPanel — vrijheidstijd-hero + kop', () => {
  const hero = {
    totalFreedomDays: 1000,
    totalLabel: '2 jaar en 9 maanden',
    deltaDays: 12,
    isFirstWeek: false,
    sparkline: [],
    isInfinite: false,
    isDeficit: false,
  }

  it('rendert de hero wanneer freedomHero gegeven is', () => {
    render(<BriefingPanel entries={[makeEntry('observation', 'X')]} freedomHero={hero} />)
    expect(screen.getByText(/Jouw vrijheid deze week/i)).toBeTruthy()
    expect(screen.getByText(/2 jaar en 9 maanden/)).toBeTruthy()
  })

  it('rendert geen hero zonder freedomHero', () => {
    render(<BriefingPanel entries={[makeEntry('observation', 'X')]} />)
    expect(screen.queryByText(/Jouw vrijheid deze week/i)).toBeNull()
  })

  it('toont de kop-zin wanneer headline gegeven is', () => {
    render(
      <BriefingPanel
        entries={[makeEntry('observation', 'X')]}
        headline="Deze week 5 dagen vrijheid erbij."
      />,
    )
    expect(screen.getByText(/Deze week 5 dagen vrijheid erbij/)).toBeTruthy()
  })
})

describe('BriefingPanel — wekelijkse-briefing header + ververs', () => {
  it('rendert de sectiekop "Jouw wekelijkse briefing"', () => {
    render(<BriefingPanel entries={[makeEntry('observation', 'X')]} />)
    expect(screen.getByText(/Jouw wekelijkse briefing/i)).toBeTruthy()
  })

  it('toont een "Bijgewerkt …"-stempel wanneer refreshedAt gegeven is', () => {
    render(
      <BriefingPanel
        entries={[makeEntry('observation', 'X')]}
        refreshedAt={new Date().toISOString()}
      />,
    )
    expect(screen.getByText(/Bijgewerkt/i)).toBeTruthy()
  })

  it('toont altijd een Deel-knop in de header', () => {
    render(<BriefingPanel entries={[makeEntry('observation', 'X')]} />)
    expect(screen.getByRole('button', { name: /deel je vrijheidsweek/i })).toBeTruthy()
  })

  it('toont een actieve Ververs-knop wanneer canRefresh true is (AI-abonnee)', () => {
    renderWithSubs(
      <BriefingPanel entries={[makeEntry('observation', 'X')]} canRefresh />,
      ['ai'],
    )
    const btn = screen.getByRole('button', { name: /ververs je briefing/i })
    expect(btn).toBeTruthy()
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('toont geen Ververs-knop wanneer canRefresh false en nog niet gebruikt (AI-abonnee)', () => {
    renderWithSubs(<BriefingPanel entries={[makeEntry('observation', 'X')]} />, ['ai'])
    expect(screen.queryByRole('button', { name: /ververs/i })).toBeNull()
  })
})

describe('BriefingPanel — AI-abonnementspoort op de ververs', () => {
  const entry = [makeEntry('observation', 'Vermogen +1.2%')]

  it('non-AI-gebruiker: Ververs wordt een upsell-affordance (link → /mijn/account), geen POST-knop', () => {
    const { container } = renderWithSubs(
      <BriefingPanel entries={entry} canRefresh />,
      [],
    )
    // Geen ververs-button (POST) — wel een upsell-link naar het account
    expect(screen.queryByRole('button', { name: /ververs je briefing/i })).toBeNull()
    const link = screen.getByRole('link', { name: /ververs met will/i })
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/mijn/account')
    // De deterministische briefing eronder blijft gewoon zichtbaar (gratis)
    expect(container.textContent).toContain('Vermogen +1.2%')
  })

  it('AI-abonnee: geen upsell-link, wél de echte Ververs-knop', () => {
    renderWithSubs(<BriefingPanel entries={entry} canRefresh />, ['ai'])
    expect(screen.queryByRole('link', { name: /ververs met will/i })).toBeNull()
    expect(screen.getByRole('button', { name: /ververs je briefing/i })).toBeTruthy()
  })
})

describe('BriefingPanel — Eenvoudige weergave (simpleMode)', () => {
  const hero = {
    totalFreedomDays: 1000,
    totalLabel: '2 jaar en 9 maanden',
    deltaDays: 12,
    isFirstWeek: false,
    sparkline: [],
    isInfinite: false,
    isDeficit: false,
  }

  const sixEntries: BriefingEntry[] = [
    makeEntry('observation', 'Belangrijkste eerst', { id: 'top' }),
    makeEntry('tip', 'Tweede briefje', { id: 'two' }),
    makeEntry('upcoming', 'Derde briefje', { id: 'three' }),
    makeEntry('heads_up', 'Vierde briefje', { id: 'four' }),
    makeEntry('milestone', 'Vijfde briefje', { id: 'five' }),
    makeEntry('market', 'Zesde briefje', { id: 'six' }),
  ]

  it('toont in Eenvoudig alleen het eerste (belangrijkste) briefje', () => {
    const { container } = render(<BriefingPanel entries={sixEntries} simpleMode />)
    expect(container.textContent).toContain('Belangrijkste eerst')
    expect(container.textContent).not.toContain('Tweede briefje')
    expect(container.textContent).not.toContain('Zesde briefje')
  })

  it('rendert het ene briefje over de volle breedte (grid-cols-1, geen sm:grid-cols-3)', () => {
    const { container } = render(<BriefingPanel entries={sixEntries} simpleMode />)
    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('grid-cols-1')
    expect(grid?.className.includes('sm:grid-cols-3')).toBe(false)
  })

  it('verbergt "Jouw vrijheid deze week" in Eenvoudig, ook als freedomHero gegeven is', () => {
    render(<BriefingPanel entries={sixEntries} freedomHero={hero} simpleMode />)
    expect(screen.queryByText(/Jouw vrijheid deze week/i)).toBeNull()
  })

  it('toont in Volledig (default) wél alle 6 briefjes + de vrijheid-hero (geen regressie)', () => {
    const { container } = render(
      <BriefingPanel entries={sixEntries} freedomHero={hero} />,
    )
    expect(container.textContent).toContain('Belangrijkste eerst')
    expect(container.textContent).toContain('Zesde briefje')
    expect(screen.getByText(/Jouw vrijheid deze week/i)).toBeTruthy()
    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('sm:grid-cols-3')
  })
})
