/**
 * Smoke tests for WidgetEmpty.
 *
 * Covers the three axes the component was extended along:
 *  1. Backward compatibility — legacy `<WidgetEmpty icon message />` keeps
 *     rendering the same icon + description.
 *  2. New variant-aware API — title + description + data-variant attribute.
 *  3. Action rendering — Link for `href`, button for `onClick`, nothing
 *     when `action` is omitted.
 *  4. Dev warning — first-use without an action emits a console.warn in
 *     development (per the bible's "Geen CTA = doodlopend" rule).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Bell, LayoutGrid, Users } from 'lucide-react'
import { WidgetEmpty } from '../widget-empty'

// next/link is a client-only wrapper in the real app — render a plain
// <a> so the assertions can target a standard anchor with href.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe('WidgetEmpty', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Backward compatibility ────────────────────────────────────────
  it('renders legacy icon + message usage (backward compat)', () => {
    const { container } = render(
      <WidgetEmpty icon={Bell} message="Alles op orde — geen meldingen" />
    )

    // The message is rendered verbatim as the serif italic description.
    expect(
      screen.getByText('Alles op orde — geen meldingen')
    ).toBeInTheDocument()

    // Default variant is first-use, reflected as data-variant attribute
    // on the root so tests and CSS can branch on it.
    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('data-variant')).toBe('first-use')

    // Legacy usage never renders a CTA, so no link/button should exist.
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ── Variant + title + description ─────────────────────────────────
  it('renders title, description, and variant data-attribute', () => {
    const { container } = render(
      <WidgetEmpty
        variant="no-results"
        icon={Users}
        title="Geen resultaten"
        description="Nog geen gedeelde transacties in dit perspectief."
      />
    )

    expect(screen.getByText('Geen resultaten')).toBeInTheDocument()
    expect(
      screen.getByText('Nog geen gedeelde transacties in dit perspectief.')
    ).toBeInTheDocument()

    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('data-variant')).toBe('no-results')
  })

  // ── Default description per variant ───────────────────────────────
  it('falls back to the cleared default description when none supplied', () => {
    // cleared variant has a baked-in "Alles afgerond." default so the
    // caller does not need to repeat common copy.
    render(<WidgetEmpty variant="cleared" />)
    expect(screen.getByText('Alles afgerond.')).toBeInTheDocument()
  })

  it('falls back to the no-results default description when none supplied', () => {
    render(<WidgetEmpty variant="no-results" />)
    expect(
      screen.getByText('Geen resultaten. Pas je filters aan.')
    ).toBeInTheDocument()
  })

  // ── Action: Link variant ──────────────────────────────────────────
  it('renders a Link when action.href is provided', () => {
    render(
      <WidgetEmpty
        variant="first-use"
        icon={LayoutGrid}
        title="Nog geen budgetten"
        description="Maak je eerste budget aan."
        action={{
          label: 'Maak je eerste budget aan',
          href: '/core/budgets/new',
        }}
      />
    )

    const link = screen.getByRole('link', { name: 'Maak je eerste budget aan' })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/core/budgets/new')

    // No button should be rendered when href is present — href wins.
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ── Action: button variant ────────────────────────────────────────
  it('renders a button when only action.onClick is provided', () => {
    const handleClick = vi.fn()
    render(
      <WidgetEmpty
        variant="first-use"
        icon={LayoutGrid}
        description="Start hier."
        action={{ label: 'Start nu', onClick: handleClick }}
      />
    )

    const button = screen.getByRole('button', { name: 'Start nu' })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)

    // No link rendered when href is absent.
    expect(screen.queryByRole('link')).toBeNull()
  })

  // ── Action: omitted ───────────────────────────────────────────────
  it('renders no CTA element when action is omitted (cleared variant)', () => {
    // cleared without action is valid for dashboard widgets — not
    // "doodlopend" because the user just finished their queue.
    render(<WidgetEmpty variant="cleared" icon={Bell} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ── Dev warning ───────────────────────────────────────────────────
  it('logs a console.warn when first-use is rendered without an action (dev)', () => {
    // Vitest's default NODE_ENV is 'test', not 'production', so the
    // warning path in the component is active here.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<WidgetEmpty variant="first-use" icon={LayoutGrid} />)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    // Assert the warning text so a rename can't silently regress the
    // developer-facing guidance.
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/first-use variant/i)
  })

  it('does NOT warn when first-use has an action', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <WidgetEmpty
        variant="first-use"
        icon={LayoutGrid}
        description="Begin hier."
        action={{ label: 'Begin', href: '/core/budgets/new' }}
      />
    )

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does NOT warn for cleared or no-results without an action', () => {
    // These variants legitimately render without a CTA (cleared = user
    // finished queue, no-results = filter adjustment is the action).
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<WidgetEmpty variant="cleared" icon={Bell} />)
    render(<WidgetEmpty variant="no-results" icon={Users} />)

    expect(warnSpy).not.toHaveBeenCalled()
  })
})
