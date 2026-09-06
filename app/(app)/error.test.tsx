import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AppError, { resolveReturnTarget } from './error'

// next/link → simpele anchor (geen router-context nodig in jsdom).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// usePathname is per test instelbaar via de mock-variabele.
let mockPathname = '/overzicht'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

const dummyError = new Error('boom') as Error & { digest?: string }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveReturnTarget', () => {
  it.each([
    ['/toekomst', 'Terug naar Toekomst', '/toekomst'],
    ['/toekomst/lab', 'Terug naar Toekomst', '/toekomst'],
    ['/mijn/account', 'Terug naar Mijn', '/mijn'],
    ['/berichten', 'Terug naar Mijn', '/mijn'],
    ['/nieuws/artikel', 'Terug naar Mijn', '/mijn'],
    ['/rapportages', 'Terug naar Rapportages', '/rapportages'],
    ['/overzicht/budget', 'Naar Overzicht', '/overzicht'],
    ['/core/assets', 'Naar Overzicht', '/overzicht'],
    [null, 'Naar Overzicht', '/overzicht'],
  ])('mapt %s → %s (%s)', (path, label, href) => {
    const target = resolveReturnTarget(path as string | null)
    expect(target.label).toBe(label)
    expect(target.href).toBe(href)
  })
})

describe('AppError', () => {
  it('toont de module-terugkeer-CTA voor /toekomst', () => {
    mockPathname = '/toekomst/lab'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AppError error={dummyError} reset={() => {}} />)
    const link = screen.getByText('Terug naar Toekomst')
    expect(link).toHaveAttribute('href', '/toekomst')
  })

  it('valt terug op Overzicht buiten de bekende modules', () => {
    mockPathname = '/core/assets'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AppError error={dummyError} reset={() => {}} />)
    expect(screen.getByText('Naar Overzicht')).toHaveAttribute('href', '/overzicht')
  })

  it('roept reset() aan bij klik op "Probeer opnieuw"', () => {
    mockPathname = '/overzicht'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reset = vi.fn()
    render(<AppError error={dummyError} reset={reset} />)
    fireEvent.click(screen.getByText('Probeer opnieuw'))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('lekt de technische digest niet naar de UI', () => {
    mockPathname = '/overzicht'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const withDigest = Object.assign(new Error('x'), { digest: 'abc123' })
    render(<AppError error={withDigest} reset={() => {}} />)
    expect(screen.queryByText(/abc123/)).toBeNull()
  })
})
