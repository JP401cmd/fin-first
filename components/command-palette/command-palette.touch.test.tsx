import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommandPalette } from './command-palette'

/**
 * Regressie bij bevinding M18 — het commandopalet op touch.
 *
 * Twee onafhankelijke defecten, allebei op mobiel:
 *  1. label + sublabel deelden één baseline-rij met `truncate`, waardoor élke
 *     standaardactie afkapte ("Bedragen verber…", "Eenvoudige weergav…").
 *  2. de sneltoets-voettekst (↑↓ / ⏎ / Esc / ⌘K) rendeerde onvoorwaardelijk,
 *     ook op een apparaat zonder toetsenbord.
 *
 * Deze suite pint het gedrag dat de fix garandeert, niet de exacte
 * Tailwind-klassen als zodanig — behalve waar de klasse ZELF het gedrag is
 * (`truncate` vs. `line-clamp-2` is niet meetbaar in jsdom, dat rendert geen
 * layout). De touch-detectie is wél echt gedrag en wordt via `matchMedia`
 * aangestuurd, precies zoals het component 'm leest.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ open: vi.fn(), openWithMessage: vi.fn() }),
}))

vi.mock('@/components/sync/global-sync-provider', () => ({
  useGlobalSync: () => ({ triggerGlobalSync: vi.fn() }),
}))

vi.mock('@/components/app/feature-access-provider', () => ({
  useModuleAccess: () => ({
    activeModules: ['inzicht_acties'],
    subscriptions: [],
    isModuleActive: () => true,
    refreshModules: vi.fn(),
  }),
}))

const COARSE_QUERY = '(hover: none) and (pointer: coarse)'

/** Laat `matchMedia` alleen de coarse-pointer-query matchen (of juist niet). */
function zetPointer(coarse: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === COARSE_QUERY ? coarse : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const oorspronkelijkeMatchMedia = window.matchMedia

beforeEach(() => {
  // jsdom implementeert scrollIntoView niet; het auto-scroll-effect voor de
  // geselecteerde rij roept het aan bij mount.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: oorspronkelijkeMatchMedia,
  })
})

function paneel(): HTMLElement {
  return document.querySelector('[data-cmdk-panel]') as HTMLElement
}

describe('command-palette — touch-gedrag (M18)', () => {
  it('toont géén sneltoets-hints op een touch-apparaat', () => {
    zetPointer(true)
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)

    expect(screen.queryByText('Navigeer')).toBeNull()
    expect(screen.queryByText('Selecteer')).toBeNull()
    expect(screen.queryByText('Sluiten')).toBeNull()
    expect(screen.queryByText('⌘K')).toBeNull()
  })

  it('toont de sneltoets-hints wél op een apparaat met toetsenbord/hover', () => {
    zetPointer(false)
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)

    expect(screen.getByText('Navigeer')).toBeTruthy()
    expect(screen.getByText('Selecteer')).toBeTruthy()
    expect(screen.getByText('Sluiten')).toBeTruthy()
    expect(screen.getByText('⌘K')).toBeTruthy()
  })

  it('laat label en sublabel niet op één afkappende regel staan', () => {
    zetPointer(true)
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)

    // Pak een standaardactie die in de lege-query-staat altijd zichtbaar is en
    // die in de bevinding letterlijk afgekapt werd gerapporteerd.
    const label = screen.getAllByText('Open AI-chat')[0] as HTMLElement
    expect(label).toBeTruthy()

    // Het label zelf mag op mobiel niet meer op één regel worden afgekapt.
    // Let op: `md:truncate` MAG er staan (desktop behoudt de ellipsis) — het
    // gaat om de onvoorwaardelijke, breakpoint-loze variant.
    const klassen = Array.from(label.classList)
    expect(klassen).not.toContain('truncate')
    expect(klassen).toContain('line-clamp-2')
    expect(klassen).toContain('md:truncate')

    // …en de wrapper zet label/sublabel op mobiel onder elkaar, zodat ze niet
    // dezelfde regelbreedte delen. Vanaf `md` keert de baseline-rij terug.
    const wrapper = label.parentElement as HTMLElement
    expect(wrapper.className).toContain('flex-col')
    expect(wrapper.className).toContain('md:items-baseline')
  })
})
