import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import type { ActiveSubscriptions } from '@/lib/feature-registry'
import {
  BriefingPanel,
  MAX_BRIEFING_ENTRIES,
  herschrevenNotice,
  localeVoortgangTekst,
  type BriefingEntry,
} from './briefing-panel'

/**
 * Tests voor BriefingPanel — 3-koloms grid (max 6) voor wekelijkse briefing.
 * Categorieën: observation/tip/upcoming/heads_up/milestone/market.
 */

// ── Uitvoermodus-stub ────────────────────────────────────────────────────────
//
// De ververs-knop hangt sinds de on-device briefing aan `useExecutionMode`:
// die bepaalt of de redactie in de cloud of op het toestel draait, en is
// FAIL-CLOSED (in 'resolving'/'blocked' vertrekt er niets). De echte hook doet
// een fetch + GPU-check; hier zetten we de uitkomst per test.
type ExecStatus = 'resolving' | 'cloud' | 'lokaal' | 'blocked'
const execState: { status: ExecStatus; message: string | null } = {
  status: 'cloud',
  message: null,
}

function setExecMode(status: ExecStatus, message: string | null = null) {
  execState.status = status
  execState.message = message
}

vi.mock('@/lib/ai/local/use-execution-mode', () => ({
  useExecutionMode: () => ({
    status: execState.status,
    message: execState.message,
    intended: execState.status === 'cloud' ? 'cloud' : 'lokaal',
    canUseCloud: execState.status === 'cloud',
    canUseLocal: execState.status === 'lokaal',
    refresh: () => {},
  }),
}))

// ── Deel-sheet-stub ──────────────────────────────────────────────────────────
//
// De Deel-knop opent sinds "Deelkaart 2.0" de deel-sheet in plaats van zelf de
// vrijheidskaart op te halen en meteen de ShareDialog te openen. De echte sheet
// sleept de canvas-renderer en de deel-dialoog mee; hier volstaat een marker om
// te bewijzen dát hij opent — en dat het paneel zelf niets meer fetcht.
vi.mock('@/components/app/deel-kaart-sheet', () => ({
  DeelKaartSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="deel-kaart-sheet" /> : null,
}))

const redactBriefingLocally = vi.fn()
vi.mock('@/lib/ai/local/local-briefing-resolver', () => ({
  redactBriefingLocally: (...args: unknown[]) => redactBriefingLocally(...args),
}))

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

beforeEach(() => {
  setExecMode('cloud')
  redactBriefingLocally.mockReset()
})

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
          makeEntry('tip', 'Klik mij', { href: '/overzicht/budget' }),
        ]}
      />,
    )
    expect(container.querySelector('a[href="/overzicht/budget"]')).toBeTruthy()
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
    expect(container.querySelector('[aria-label*="Budget"]')).toBeTruthy()
  })

  it('rendert GEEN hefboom-icoon zonder hefboom-veld', () => {
    const { container } = render(
      <BriefingPanel entries={[makeEntry('tip', 'Geen tag')]} />,
    )
    expect(container.querySelector('[aria-label*="Budget"]')).toBeNull()
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

describe('BriefingPanel — kop-zin (week-vrijheid-blok verwijderd, UR2-09)', () => {
  // UR2-09: het blok "JOUW VRIJHEID DEZE WEEK" is op eigenaar-besluit
  // verwijderd. Het bevroor een week lang één getal naast live-herrekenende
  // kerngetallen, waardoor /overzicht binnen vijf minuten drie waarden voor
  // dezelfde vrijheidstijd toonde. Deze test is de grendel: geen enkele
  // prop-combinatie mag het terugbrengen.
  it('rendert nergens meer een week-vrijheid-blok', () => {
    render(
      <BriefingPanel
        entries={[makeEntry('observation', 'X')]}
        headline="Je vermogen staat voor 2 jaar en 9 maanden aan vrijheid."
      />,
    )
    expect(screen.queryByText(/Jouw vrijheid deze week/i)).toBeNull()
    expect(screen.queryByText(/dagen vrijheid erbij/i)).toBeNull()
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
  it('rendert de krant-masthead "De briefing"', () => {
    render(<BriefingPanel entries={[makeEntry('observation', 'X')]} />)
    expect(screen.getByText(/De briefing/i)).toBeTruthy()
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

  // H5: het freeze-model is by design, maar zonder deze hint leest de divergentie
  // tussen bevroren briefingtekst en live gezondheidspijler als een tegenspraak.
  it('toont de versheidshint bij dataChanged, met verversverwijzing als dat mag', () => {
    render(
      <BriefingPanel
        entries={[makeEntry('observation', 'X')]}
        refreshedAt={new Date().toISOString()}
        dataChanged
      />,
    )
    expect(screen.getByText(/je cijfers zijn sindsdien veranderd/i)).toBeTruthy()
  })

  it('zwijgt over versheid wanneer dataChanged false is', () => {
    render(
      <BriefingPanel
        entries={[makeEntry('observation', 'X')]}
        refreshedAt={new Date().toISOString()}
      />,
    )
    expect(screen.queryByText(/je cijfers zijn sindsdien veranderd/i)).toBeNull()
  })

  it('toont altijd een Deel-knop in de header', () => {
    render(<BriefingPanel entries={[makeEntry('observation', 'X')]} />)
    expect(screen.getByRole('button', { name: /deel je vrijheidsweek/i })).toBeTruthy()
  })

  it('opent met de Deel-knop de deel-sheet en fetcht zelf niets meer', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      render(<BriefingPanel entries={[makeEntry('observation', 'X')]} />)
      expect(screen.queryByTestId('deel-kaart-sheet')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /deel je vrijheidsweek/i }))

      // De sheet komt via next/dynamic binnen — findBy wacht daarop.
      expect(await screen.findByTestId('deel-kaart-sheet')).toBeTruthy()
      // De vrijheidskaart wordt door de sheet opgehaald, niet meer hier.
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
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

  // ── L9: de Ververs-knop mag niet verdwijnen na een remount ────────
  //
  // BEWUST HERZIEN (besluit eigenaar 26-08-2026). Deze test heette eerder
  // "toont geen Ververs-knop wanneer canRefresh false en nog niet gebruikt" en
  // was groen — maar hij legde het DEFECT vast als verwacht gedrag. `canRefresh`
  // is namelijk ook false in een weergave waar de ververs simpelweg niet van
  // toepassing is, dus die ene boolean kon "niet van toepassing" en "vandaag al
  // gebruikt" niet uit elkaar houden. De knop overleefde daardoor alleen via de
  // ephemere `usedToday`-clientstate, die bij elke remount (F5, nieuwe tab,
  // later dezelfde dag) terugvalt naar false.
  //
  // De twee gevallen staan nu naast elkaar: zonder reden blijft de knop terecht
  // weg, met 'used_today' blijft hij staan — uitgeschakeld, met uitleg.

  it('toont geen Ververs-knop wanneer de ververs niet van toepassing is (geen reden)', () => {
    renderWithSubs(<BriefingPanel entries={[makeEntry('observation', 'X')]} />, ['ai'])
    expect(screen.queryByRole('button', { name: /ververs/i })).toBeNull()
  })

  it('houdt de knop na een remount zichtbaar-maar-uit bij refreshState "used_today"', () => {
    // Exact de post-reload-toestand: de server zegt "vandaag al ververst"
    // (canRefresh blijft false) en de ephemere clientstate is weg (verse mount).
    renderWithSubs(
      <BriefingPanel entries={[makeEntry('observation', 'X')]} refreshState="used_today" />,
      ['ai'],
    )
    const btn = screen.getByRole('button', { name: /vandaag al gebruikt, morgen weer/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(btn.getAttribute('title')).toMatch(/vandaag al ververst/i)
  })

  it('een actieve ververs blijft mogelijk zolang de server "available" zegt', () => {
    renderWithSubs(
      <BriefingPanel
        entries={[makeEntry('observation', 'X')]}
        canRefresh
        refreshState="available"
      />,
      ['ai'],
    )
    const btn = screen.getByRole('button', { name: /ververs je briefing/i })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('zonder AI-abonnement toont "used_today" de upsell, niet de POST-knop', () => {
    renderWithSubs(
      <BriefingPanel entries={[makeEntry('observation', 'X')]} refreshState="used_today" />,
      [],
    )
    expect(screen.queryByRole('button', { name: /ververs je briefing/i })).toBeNull()
    expect(screen.getByRole('link', { name: /AI-abonnement/i })).toBeTruthy()
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
    const link = screen.getByRole('link', { name: /ververs met fin/i })
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/mijn/account')
    // De deterministische briefing eronder blijft gewoon zichtbaar (gratis)
    expect(container.textContent).toContain('Vermogen +1.2%')
  })

  it('AI-abonnee: geen upsell-link, wél de echte Ververs-knop', () => {
    renderWithSubs(<BriefingPanel entries={entry} canRefresh />, ['ai'])
    expect(screen.queryByRole('link', { name: /ververs met fin/i })).toBeNull()
    expect(screen.getByRole('button', { name: /ververs je briefing/i })).toBeTruthy()
  })
})

// ── On-device redactie (uitvoergroep 'briefing' op lokaal) ───────────────────

describe('BriefingPanel — waar de redactie draait (fail-closed)', () => {
  const entry = [makeEntry('observation', 'Je vermogen groeide met €1.234.')]
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Alle URL's waarnaar deze test een POST zag vertrekken. */
  function postedUrls(): string[] {
    return fetchMock.mock.calls.map((c) => String(c[0]))
  }

  it("'lokaal': er vertrekt GEEN cloud-ververs — alleen de compose/persist-stappen", async () => {
    setExecMode('lokaal')
    redactBriefingLocally.mockResolvedValue({
      headline: 'Een rustige week.',
      texts: [{ id: entry[0].id, text: 'Je vermogen groeide met €1.234.' }],
      totaal: 1,
      fouten: 0,
    })
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('stap=compose')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ allowed: true, entries: entry, directivesBlock: '' }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          allowed: true,
          entries: entry,
          refreshedAt: '2026-08-02T10:00:00.000Z',
          headline: 'Een rustige week.',
          herschreven: 1,
          totaal: 1,
        }),
      })
    })

    renderWithSubs(<BriefingPanel entries={entry} canRefresh />, ['ai'])
    fireEvent.click(screen.getByRole('button', { name: /ververs je briefing/i }))

    await waitFor(() => expect(postedUrls().length).toBe(2))

    // DE KERN: geen enkele aanroep zonder ?stap= — dat zou de cloud-route zijn.
    expect(postedUrls().some((u) => !u.includes('stap='))).toBe(false)
    expect(postedUrls()[0]).toContain('stap=compose')
    expect(postedUrls()[1]).toContain('stap=persist')
    expect(redactBriefingLocally).toHaveBeenCalledTimes(1)
  })

  it("'lokaal': de persist-POST stuurt de on-device teksten mee", async () => {
    setExecMode('lokaal')
    redactBriefingLocally.mockResolvedValue({
      headline: 'Kop van Fin.',
      texts: [{ id: entry[0].id, text: 'Herschreven met €1.234.' }],
      totaal: 1,
      fouten: 0,
    })
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          String(url).includes('stap=compose')
            ? { allowed: true, entries: entry, directivesBlock: 'RICHTLIJN' }
            : { allowed: true, entries: entry, refreshedAt: 'x', headline: null, herschreven: 1, totaal: 1 },
      }),
    )

    renderWithSubs(<BriefingPanel entries={entry} canRefresh />, ['ai'])
    fireEvent.click(screen.getByRole('button', { name: /ververs je briefing/i }))
    await waitFor(() => expect(postedUrls().length).toBe(2))

    // Het gecondenseerde directives-blok van de server gaat naar de resolver…
    expect(redactBriefingLocally).toHaveBeenCalledWith(
      entry,
      expect.objectContaining({ directivesBlock: 'RICHTLIJN' }),
    )
    // …en de uitkomst gaat als body mee naar de persist-stap.
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(body.texts).toEqual([{ id: entry[0].id, text: 'Herschreven met €1.234.' }])
    expect(body.headline).toBe('Kop van Fin.')
  })

  it("'blocked': knop staat uit en er vertrekt niets", () => {
    setExecMode('blocked', 'Dit toestel ondersteunt geen WebGPU.')
    renderWithSubs(<BriefingPanel entries={entry} canRefresh />, ['ai'])

    const btn = screen.getByRole('button', {
      name: /dit toestel ondersteunt geen webgpu/i,
    }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("'resolving': knop staat uit en er vertrekt niets (geen stille cloud-uitwijk)", () => {
    setExecMode('resolving')
    renderWithSubs(<BriefingPanel entries={entry} canRefresh />, ['ai'])

    const btn = screen.getByRole('button', { name: /even bepalen waar je ai draait/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(btn)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("'cloud': ongewijzigd — één POST zonder stap-parameter", async () => {
    setExecMode('cloud')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        allowed: true,
        entries: entry,
        refreshedAt: 'x',
        headline: null,
        herschreven: 1,
        totaal: 1,
      }),
    })

    renderWithSubs(<BriefingPanel entries={entry} canRefresh />, ['ai'])
    fireEvent.click(screen.getByRole('button', { name: /ververs je briefing/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(postedUrls()[0]).toBe('/api/briefing/refresh')
    expect(redactBriefingLocally).not.toHaveBeenCalled()
  })

  it('toont eerlijk hoeveel briefjes zijn herschreven (server-telling)', async () => {
    setExecMode('lokaal')
    redactBriefingLocally.mockResolvedValue({ headline: null, texts: [], totaal: 6, fouten: 0 })
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          String(url).includes('stap=compose')
            ? { allowed: true, entries: entry, directivesBlock: '' }
            : {
                allowed: true,
                entries: entry,
                refreshedAt: 'x',
                headline: null,
                // De server keurde 2 van de 6 goed — dát is wat de gebruiker leest.
                herschreven: 2,
                totaal: 6,
              },
      }),
    )

    renderWithSubs(<BriefingPanel entries={entry} canRefresh />, ['ai'])
    fireEvent.click(screen.getByRole('button', { name: /ververs je briefing/i }))

    await waitFor(() => expect(screen.getByText(/2 van de 6 briefjes/i)).toBeTruthy())
  })
})

describe('herschrevenNotice — eerlijke uitkomst', () => {
  it('0 herschreven: benoemt dat er niets herschreven is, maar de cijfers vers zijn', () => {
    expect(herschrevenNotice(0, 6, true)).toContain('geen enkel briefje')
    expect(herschrevenNotice(0, 6, true)).toContain('verse cijfers')
  })

  it('alles herschreven: noemt het totaal', () => {
    expect(herschrevenNotice(6, 6, true)).toContain('alle 6')
  })

  it('deels herschreven: noemt beide getallen', () => {
    expect(herschrevenNotice(2, 6, false)).toContain('2 van de 6')
  })

  it('lokaal vs cloud verschilt alleen in de plaatsbepaling', () => {
    expect(herschrevenNotice(6, 6, true)).toContain('op je eigen toestel')
    expect(herschrevenNotice(6, 6, false)).not.toContain('op je eigen toestel')
  })

  it('geen telling beschikbaar → geen melding', () => {
    expect(herschrevenNotice(undefined, undefined, true)).toBeNull()
    expect(herschrevenNotice(0, 0, true)).toBeNull()
  })
})

describe('localeVoortgangTekst', () => {
  it('meldt de trage eerste modelload apart', () => {
    expect(localeVoortgangTekst({ fase: 'model-laden', gedaan: 0, van: 1 })).toMatch(
      /eerste keer duurt dit even/i,
    )
  })

  it('telt de briefjes 1-based', () => {
    expect(localeVoortgangTekst({ fase: 'briefjes', gedaan: 0, van: 6 })).toContain('1 van 6')
    expect(localeVoortgangTekst({ fase: 'briefjes', gedaan: 5, van: 6 })).toContain('6 van 6')
    // Niet over het totaal heen tellen bij de afsluitende melding.
    expect(localeVoortgangTekst({ fase: 'briefjes', gedaan: 6, van: 6 })).toContain('6 van 6')
  })

  it('benoemt de kopzin-fase', () => {
    expect(localeVoortgangTekst({ fase: 'kopzin', gedaan: 0, van: 1 })).toMatch(/kop/i)
  })
})

describe('BriefingPanel — Eenvoudige weergave (simpleMode)', () => {
  const sixEntries: BriefingEntry[] = [
    makeEntry('observation', 'Belangrijkste eerst', { id: 'top' }),
    makeEntry('tip', 'Tweede briefje', { id: 'two' }),
    makeEntry('upcoming', 'Derde briefje', { id: 'three' }),
    makeEntry('heads_up', 'Vierde briefje', { id: 'four' }),
    makeEntry('milestone', 'Vijfde briefje', { id: 'five' }),
    makeEntry('market', 'Zesde briefje', { id: 'six' }),
  ]

  const weekHistory = [
    {
      week: '2026-W31',
      headline: 'Vorige week',
      entries: [makeEntry('observation', 'Briefje uit week 31', { id: 'w31' })],
      freedomDays: 980,
    },
  ]

  it('toont in Eenvoudig de drie belangrijkste briefjes (1–3), niet de rest', () => {
    const { container } = render(<BriefingPanel entries={sixEntries} simpleMode />)
    expect(container.textContent).toContain('Belangrijkste eerst')
    expect(container.textContent).toContain('Tweede briefje')
    expect(container.textContent).toContain('Derde briefje')
    expect(container.textContent).not.toContain('Vierde briefje')
    expect(container.textContent).not.toContain('Zesde briefje')
  })

  it('rendert de drie briefjes naast elkaar in hetzelfde 3-koloms grid als de volledige weergave', () => {
    const { container } = render(<BriefingPanel entries={sixEntries} simpleMode />)
    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('sm:grid-cols-3')
  })

  it('verbergt de "Vorige weken"-terugblik in Eenvoudig', () => {
    render(<BriefingPanel entries={sixEntries} weekHistory={weekHistory} simpleMode />)
    expect(screen.queryByText(/Vorige weken/i)).toBeNull()
  })

  it('toont de "Vorige weken"-terugblik wél in Volledig (geen regressie)', () => {
    render(<BriefingPanel entries={sixEntries} weekHistory={weekHistory} />)
    expect(screen.getByText(/Vorige weken/i)).toBeTruthy()
  })

  it('rouleert het venster één plek op per rotationOffset (2-3-4, dan 3-4-5)', () => {
    const tweede = render(
      <BriefingPanel entries={sixEntries} simpleMode rotationOffset={1} />,
    )
    expect(tweede.container.textContent).not.toContain('Belangrijkste eerst')
    expect(tweede.container.textContent).toContain('Tweede briefje')
    expect(tweede.container.textContent).toContain('Vierde briefje')
    tweede.unmount()

    const derde = render(
      <BriefingPanel entries={sixEntries} simpleMode rotationOffset={2} />,
    )
    expect(derde.container.textContent).toContain('Derde briefje')
    expect(derde.container.textContent).toContain('Vijfde briefje')
    expect(derde.container.textContent).not.toContain('Tweede briefje')
  })

  it('loopt cyclisch door: bij 5 toont hij 6-1-2', () => {
    const { container } = render(
      <BriefingPanel entries={sixEntries} simpleMode rotationOffset={5} />,
    )
    expect(container.textContent).toContain('Zesde briefje')
    expect(container.textContent).toContain('Belangrijkste eerst')
    expect(container.textContent).toContain('Tweede briefje')
    expect(container.textContent).not.toContain('Derde briefje')
  })

  it('toont op mobiel maar één briefje: kaart 2 en 3 zijn hidden sm:flex', () => {
    const { container } = render(<BriefingPanel entries={sixEntries} simpleMode />)
    const cards = Array.from(container.querySelectorAll('article'))
    expect(cards).toHaveLength(3)
    expect(cards[0].className).not.toContain('hidden')
    expect(cards[1].className).toContain('hidden sm:flex')
    expect(cards[2].className).toContain('hidden sm:flex')
  })

  it('verbergt in Volledig niets op mobiel (geen regressie)', () => {
    const { container } = render(<BriefingPanel entries={sixEntries} />)
    const cards = Array.from(container.querySelectorAll('article'))
    expect(cards).toHaveLength(6)
    expect(cards.every((c) => !c.className.includes('hidden'))).toBe(true)
  })

  it('schuift de cursor in de cookie op voor de volgende vernieuwing', () => {
    render(<BriefingPanel entries={sixEntries} simpleMode rotationOffset={2} />)
    expect(document.cookie).toContain('tf_briefing_rot=3')
  })

  it('schrijft geen cursor in Volledig (daar rouleert niets)', () => {
    document.cookie = 'tf_briefing_rot=; path=/; max-age=0'
    render(<BriefingPanel entries={sixEntries} rotationOffset={2} />)
    expect(document.cookie).not.toContain('tf_briefing_rot=3')
  })

  it('toont in Volledig (default) wél alle 6 briefjes (geen regressie)', () => {
    const { container } = render(<BriefingPanel entries={sixEntries} />)
    expect(container.textContent).toContain('Belangrijkste eerst')
    expect(container.textContent).toContain('Zesde briefje')
    // UR2-09: ook in Volledig staat er geen week-vrijheid-blok meer boven.
    expect(screen.queryByText(/Jouw vrijheid deze week/i)).toBeNull()
    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('sm:grid-cols-3')
  })
})
