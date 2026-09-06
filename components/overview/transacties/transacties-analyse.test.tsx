/**
 * Focused tests voor de actie-rij in TransactiesAnalyse.
 *
 * TransactiesAnalyse is een zwaar client-component met async Supabase-fetches,
 * Next.js router en een perspectief-context. We mocken die afhankelijkheden
 * minimaal zodat de component rendert zonder echte netwerk-aanroepen.
 *
 * Getest gedrag:
 * (a) Bij 0 rekeningen (laad-staat — Supabase-promise hangt) is "Nieuwe
 *     transactie" NIET zichtbaar; "Importeer transacties" en "Bank koppelen"
 *     WEL zichtbaar met de juiste hrefs.
 * (b) Hrefs zijn exact /core/cash/import en /core/cash/connect.
 * (c) TXN-1 — de weergavemodus bepaalt hoevéél acties er in de rij staan:
 *     Volledig houdt de drie knoppen naast elkaar, Eenvoudig laat er één staan
 *     plus een "…"-menu waarin de andere twee te vinden blijven.
 *
 * De modus komt uit een échte `DisplayModeProvider` (het enige leespad); zonder
 * provider zou `useDisplayMode()` op de 'simple'-fallback landen en zouden de
 * Volledig-asserties stilzwijgend de verkeerde modus meten.
 *
 * We testen NIET de volledige render (GeldstroomGauge, heatmap, tijdlijn) —
 * die vereisen volledig geladen data en de bijbehorende sub-component-stubs.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { TransactiesAnalyse } from './transacties-analyse'

// ── Module-mocks ─────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/overzicht/budget/transacties',
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal' as const }),
}))

// Supabase client: elke query retourneert een eeuwig hangend promise zodat
// `accounts` op [] blijft — precies de toestand die we willen observeren.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({ eq: () => new Promise(() => {}) }),
        eq: () => ({ eq: () => ({ order: () => new Promise(() => {}) }) }),
        // De rekening-lijst haalt sinds ADR 0082 óók de archief-rekening op met
        // `.or('is_active.eq.true,is_archive_bucket.eq.true')`. Zonder deze tak
        // gaf de keten `undefined` en belandde de laadronde in het catch-blok:
        // de test slaagde dan nog steeds, maar via de foutweg in plaats van via
        // het hangende promise dat ze wíl observeren.
        or: () => ({ order: () => new Promise(() => {}) }),
      }),
    }),
  }),
}))

// loadPerspectiveTransactions: hangt ook — we willen geen data-state.
vi.mock('@/lib/household/perspective-loader', () => ({
  loadPerspectiveTransactions: () => new Promise(() => {}),
}))

function renderAnalyse(mode: DisplayMode = 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <TransactiesAnalyse />
    </DisplayModeProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactiesAnalyse — actie-rij (Volledig)', () => {
  it('toont "Importeer transacties" en "Bank koppelen" bij 0 rekeningen', () => {
    renderAnalyse()
    expect(screen.getByText('Importeer transacties')).toBeInTheDocument()
    expect(screen.getByText('Bank koppelen')).toBeInTheDocument()
  })

  it('verbergt "Nieuwe transactie" zolang er 0 rekeningen zijn', () => {
    renderAnalyse()
    expect(screen.queryByText('Nieuwe transactie')).not.toBeInTheDocument()
  })

  it('link "Importeer transacties" verwijst naar /core/cash/import', () => {
    const { container } = renderAnalyse()
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toContain('/core/cash/import')
  })

  it('link "Bank koppelen" verwijst naar /core/cash/connect', () => {
    const { container } = renderAnalyse()
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toContain('/core/cash/connect')
  })

  it('kent geen "…"-menu — alle acties staan al in de rij', () => {
    renderAnalyse()
    expect(screen.queryByRole('button', { name: 'Meer acties' })).not.toBeInTheDocument()
  })
})

/**
 * TXN-1 is op 28 aug 2026 OMGEKEERD (M40, besluit eigenaar 26 aug). De oude
 * versie van dit blok pinde het tegenovergestelde: importeren en bank koppelen
 * uit de rij, achter het "…"-menu. Dat besluit (9 aug 2026) ging ervan uit dat
 * die twee zeldzame beheer-acties zijn; M40 stelt vast dat het juist de twee
 * vul-routes zijn die een beginner — per default in Eenvoudig — nodig heeft,
 * terwijl de KoppelRekeningBanner alleen de 0-rekeningen-stand dekt. Het
 * herschrijven van deze asserties is dus de bedoelde uitkomst, geen regressie;
 * de audit-regel TXN-1 in docs/eenvoudige-weergave-audit.md is meegedraaid.
 */
describe('TransactiesAnalyse — actie-rij (Eenvoudig, TXN-1 herzien via M40)', () => {
  it('houdt importeren en bank koppelen in de rij', () => {
    const { container } = renderAnalyse('simple')
    expect(screen.getByText('Importeer transacties')).toBeInTheDocument()
    expect(screen.getByText('Bank koppelen')).toBeInTheDocument()
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toContain('/core/cash/import')
    expect(links).toContain('/core/cash/connect')
  })

  it('haalt "Zoeken en bulkbewerken" uit de rij en zet het achter het "…"-menu', () => {
    renderAnalyse('simple')
    expect(screen.queryByText('Zoeken en bulkbewerken')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Meer acties' }))

    const menu = screen.getByRole('dialog')
    expect(within(menu).getByText('Zoeken en bulkbewerken')).toBeInTheDocument()
  })

  it('zet géén vul-route meer in het "…"-menu', () => {
    renderAnalyse('simple')
    fireEvent.click(screen.getByRole('button', { name: 'Meer acties' }))

    const menu = screen.getByRole('dialog')
    expect(within(menu).queryAllByRole('link')).toHaveLength(0)
    expect(within(menu).queryByText('Importeer transacties')).not.toBeInTheDocument()
    expect(within(menu).queryByText('Bank koppelen')).not.toBeInTheDocument()
  })
})
