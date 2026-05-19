import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToekomstTabs } from './toekomst-tabs'

/**
 * Tests voor ToekomstTabs — segmented-control op /toekomst met 4 tabs
 * (Tijdas/Doelen/Gebeurtenissen/Voorkeuren). Tijdas = default, anderen
 * tonen placeholder-cards met deeplinks.
 */

const mockReplace = vi.fn()
const mockSearchParams = { get: vi.fn() }

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/toekomst',
}))

beforeEach(() => {
  mockReplace.mockReset()
  mockSearchParams.get.mockReset()
  mockSearchParams.get.mockReturnValue(null)
})

describe('ToekomstTabs — basis-render', () => {
  it('rendert vier tabs', () => {
    render(<ToekomstTabs tijdasView={<div data-testid="tijdas">Tijdas inhoud</div>} />)
    expect(screen.getByText('Tijdas')).toBeTruthy()
    expect(screen.getByText('Doelen')).toBeTruthy()
    expect(screen.getByText('Gebeurtenissen')).toBeTruthy()
    expect(screen.getByText('Voorkeuren')).toBeTruthy()
  })

  it('default = Tijdas-tab actief (geen tab param)', () => {
    mockSearchParams.get.mockReturnValue(null)
    render(<ToekomstTabs tijdasView={<div data-testid="tijdas">Tijdas inhoud</div>} />)
    expect(screen.getByTestId('tijdas')).toBeTruthy()
  })

  it('toont Doelen-placeholder bij ?tab=doelen', () => {
    mockSearchParams.get.mockReturnValue('doelen')
    render(<ToekomstTabs tijdasView={<div data-testid="tijdas">Tijdas inhoud</div>} />)
    expect(screen.queryByTestId('tijdas')).toBeNull()
    // Placeholder bevat "doelen" in kicker + h2
    expect(screen.getAllByText(/doelen/i).length).toBeGreaterThan(0)
  })

  it('toont Gebeurtenissen-placeholder bij ?tab=gebeurtenissen', () => {
    mockSearchParams.get.mockReturnValue('gebeurtenissen')
    render(<ToekomstTabs tijdasView={<div data-testid="tijdas">Tijdas inhoud</div>} />)
    expect(screen.queryByTestId('tijdas')).toBeNull()
    expect(screen.getAllByText(/gebeurtenissen/i).length).toBeGreaterThan(0)
  })

  it('toont Voorkeuren-placeholder bij ?tab=voorkeuren', () => {
    mockSearchParams.get.mockReturnValue('voorkeuren')
    render(<ToekomstTabs tijdasView={<div data-testid="tijdas">Tijdas inhoud</div>} />)
    expect(screen.queryByTestId('tijdas')).toBeNull()
    expect(screen.getAllByText(/voorkeuren/i).length).toBeGreaterThan(0)
  })

  it('onbekende tab valt terug op Tijdas', () => {
    mockSearchParams.get.mockReturnValue('onzin')
    render(<ToekomstTabs tijdasView={<div data-testid="tijdas">Tijdas inhoud</div>} />)
    expect(screen.getByTestId('tijdas')).toBeTruthy()
  })
})

describe('ToekomstTabs — navigatie', () => {
  it('klik op Doelen-tab roept router.replace met ?tab=doelen', () => {
    mockSearchParams.toString = vi.fn(() => '')
    render(<ToekomstTabs tijdasView={<div>x</div>} />)
    fireEvent.click(screen.getByText('Doelen'))
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('tab=doelen'),
      { scroll: false },
    )
  })

  it('klik op Tijdas-tab strip de tab-param (geen query)', () => {
    mockSearchParams.toString = vi.fn(() => 'tab=doelen')
    mockSearchParams.get.mockReturnValue('doelen')
    render(<ToekomstTabs tijdasView={<div>x</div>} />)
    fireEvent.click(screen.getByText('Tijdas'))
    // Wanneer geen overige params: alleen pathname zonder ?
    expect(mockReplace).toHaveBeenCalledWith('/toekomst', { scroll: false })
  })
})

describe('ToekomstTabs — placeholder deeplinks', () => {
  it('Doelen-placeholder linkt naar /overzicht en /will#goals', () => {
    mockSearchParams.get.mockReturnValue('doelen')
    const { container } = render(<ToekomstTabs tijdasView={<div>x</div>} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs.some((h) => h?.includes('/overzicht'))).toBe(true)
    expect(hrefs.some((h) => h?.includes('/will'))).toBe(true)
  })

  it('Gebeurtenissen-placeholder linkt naar /toekomst/strategie + /toekomst/whatif', () => {
    mockSearchParams.get.mockReturnValue('gebeurtenissen')
    const { container } = render(<ToekomstTabs tijdasView={<div>x</div>} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs.some((h) => h === '/toekomst/strategie')).toBe(true)
    expect(hrefs.some((h) => h === '/toekomst/whatif')).toBe(true)
  })

  it('Voorkeuren-placeholder linkt naar /identity/parameters', () => {
    mockSearchParams.get.mockReturnValue('voorkeuren')
    const { container } = render(<ToekomstTabs tijdasView={<div>x</div>} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs.some((h) => h === '/identity/parameters')).toBe(true)
  })
})
