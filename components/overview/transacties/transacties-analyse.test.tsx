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
 *
 * We testen NIET de volledige render (GeldstroomGauge, heatmap, tijdlijn) —
 * die vereisen volledig geladen data en de bijbehorende sub-component-stubs.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransactiesAnalyse } from './transacties-analyse'

// ── Module-mocks ─────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/overzicht/cashflow/transacties',
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
      }),
    }),
  }),
}))

// loadPerspectiveTransactions: hangt ook — we willen geen data-state. De rest
// van de module blijft echt; `windowPerspectiveItems` wordt tijdens de render
// aangeroepen om de heatmap uit de gedeelde set te snijden.
vi.mock('@/lib/household/perspective-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/household/perspective-loader')>()),
  loadPerspectiveTransactions: () => new Promise(() => {}),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactiesAnalyse — actie-rij', () => {
  it('toont "Importeer transacties" en "Bank koppelen" bij 0 rekeningen', () => {
    render(<TransactiesAnalyse />)
    expect(screen.getByText('Importeer transacties')).toBeInTheDocument()
    expect(screen.getByText('Bank koppelen')).toBeInTheDocument()
  })

  it('verbergt "Nieuwe transactie" zolang er 0 rekeningen zijn', () => {
    render(<TransactiesAnalyse />)
    expect(screen.queryByText('Nieuwe transactie')).not.toBeInTheDocument()
  })

  it('link "Importeer transacties" verwijst naar /core/cash/import', () => {
    const { container } = render(<TransactiesAnalyse />)
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toContain('/core/cash/import')
  })

  it('link "Bank koppelen" verwijst naar /core/cash/connect', () => {
    const { container } = render(<TransactiesAnalyse />)
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toContain('/core/cash/connect')
  })
})
