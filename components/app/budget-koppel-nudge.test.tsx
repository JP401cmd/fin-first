import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BudgetKoppelNudge, BUDGET_KOPPEL_NUDGE_SHOWN_SLUG } from './budget-koppel-nudge'

// next/link → simpele anchor (geen router-context nodig in jsdom).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe('BudgetKoppelNudge', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rendert niets als visible=false', () => {
    const { container } = render(<BudgetKoppelNudge visible={false} />)
    expect(container).toBeEmptyDOMElement()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('toont beide CTA-knoppen met de canonieke hrefs', async () => {
    render(<BudgetKoppelNudge visible />)

    const connect = await screen.findByTestId('nudge-cta-connect')
    const importCta = screen.getByTestId('nudge-cta-import')

    expect(connect).toHaveAttribute('href', '/core/cash/connect')
    expect(importCta).toHaveAttribute('href', '/core/cash/import')
    expect(screen.getByTestId('nudge-later')).toBeInTheDocument()
  })

  it('POST de eenmalige marker één keer bij mount', async () => {
    render(<BudgetKoppelNudge visible />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/feature-visits')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      feature_slug: BUDGET_KOPPEL_NUDGE_SHOWN_SLUG,
    })
  })

  it('sluit de nudge bij klik op "Later"', async () => {
    render(<BudgetKoppelNudge visible />)

    const later = await screen.findByTestId('nudge-later')
    fireEvent.click(later)

    await waitFor(
      () => expect(screen.queryByTestId('nudge-cta-connect')).not.toBeInTheDocument(),
      { timeout: 1500 },
    )
  })
})
