import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { EindsituatieDuiding } from '@/lib/horizon/eindsituatie-duiding'

/**
 * Plan 17 sep (D) — de eindsituatie-melding op /toekomst.
 *  A. tonen / niet tonen (geen duiding, geminimaliseerd);
 *  B. Fin-knop alleen bij `!eenduidig` ∧ AI actief (abonnement ∧ uitvoermodus);
 *  C. bedragen exact één keer gedeflateerd, vraag zonder bedragen;
 *  D. minimaliseren via de provider → statuspunt → heropenen, op het bestaande PUT-pad.
 */

const access = vi.hoisted(() => ({ subscriptions: ['ai'] as string[] }))
const exec = vi.hoisted(() => ({ canUseCloud: true, canUseLocal: false, lastActive: undefined as boolean | undefined }))
const chat = vi.hoisted(() => ({ openWithMessage: vi.fn() }))

vi.mock('@/lib/feature-access/context', () => ({
  useModuleAccess: () => ({
    activeModules: [],
    subscriptions: access.subscriptions,
    isModuleActive: () => true,
    refreshModules: () => {},
  }),
}))

vi.mock('@/lib/ai/local/use-execution-mode', () => ({
  useExecutionMode: (_group: string, active?: boolean) => {
    exec.lastActive = active
    return { canUseCloud: exec.canUseCloud, canUseLocal: exec.canUseLocal }
  },
}))

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContextOptional: () => chat,
}))

import { EindsituatieNotice } from './eindsituatie-notice'
import {
  EindsituatieNoticeDot,
  EindsituatieNoticeProvider,
  useEindsituatieNotice,
} from './eindsituatie-notice-provider'
import { EuroViewProvider } from '@/lib/hooks/use-euro-view'

function duiding(overrides: Partial<EindsituatieDuiding> = {}): EindsituatieDuiding {
  return {
    eindAge: 90,
    overschot: { age: 90, bedrag: 400_000, inflationFactor: 2 },
    dieptepunt: null,
    oorzaken: [{ id: 'later-inkomen', age: 68, bedrag: null }],
    context: { huis: { age: 90, bedrag: 600_000, inflationFactor: 2 }, opeetschuld: null },
    eenduidig: false,
    ...overrides,
  }
}

const basisProps = {
  endForm: 'deplete' as const,
  display: 'expanded' as const,
  canMinimize: false,
  onMinimize: () => {},
  canonicalDailyRate: 100,
  overschotIsLiquide: true,
}

beforeEach(() => {
  access.subscriptions = ['ai']
  exec.canUseCloud = true
  exec.canUseLocal = false
  exec.lastActive = undefined
  chat.openWithMessage.mockReset()
})

describe('EindsituatieNotice — tonen', () => {
  it('toont kop (h3), samenvatting, oorzaak, context, instellingen-link en disclaimer', () => {
    render(<EindsituatieNotice {...basisProps} duiding={duiding({ eenduidig: true })} />)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Aan het eind blijft er meer over dan "vermogen opeten" doet verwachten' }),
    ).toBeTruthy()
    const melding = screen.getByTestId('eindsituatie-melding').textContent ?? ''
    expect(melding).toContain('Op je 90e staat er in deze berekening')
    expect(melding).toContain('Vanaf je 68e dekt je inkomen')
    expect(melding).toContain('je huis (')
    expect(melding).toContain('Indicatie, geen advies')
    const link = screen.getByRole('link', { name: 'Bekijk of wijzig je plan →' })
    expect(link.getAttribute('href')).toBe('/toekomst/voorkeuren?regel=eindstrategie')
  })

  it('rendert niets zichtbaars zonder duiding, maar houdt de aria-live-regio gemount', () => {
    const { container } = render(<EindsituatieNotice {...basisProps} duiding={null} display="none" />)
    expect(screen.queryByTestId('eindsituatie-melding')).toBeNull()
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy()
  })

  it('geminimaliseerd: geen melding, wel een sr-only aankondiging', () => {
    render(<EindsituatieNotice {...basisProps} duiding={duiding()} display="minimized" />)
    expect(screen.queryByTestId('eindsituatie-melding')).toBeNull()
    expect(screen.getByText(/geminimaliseerd/)).toBeTruthy()
  })
})

describe('EindsituatieNotice — euro-weergave en vrijheidstijd', () => {
  it("deflateert elk bedrag exact één keer in 'real' (400.000 / 2 = 200.000)", () => {
    render(
      <EuroViewProvider initialView="real">
        <EindsituatieNotice {...basisProps} duiding={duiding()} />
      </EuroViewProvider>,
    )
    const tekst = screen.getByTestId('eindsituatie-melding').textContent ?? ''
    expect(tekst).toMatch(/200\.000 meer/)
    expect(tekst).not.toMatch(/400\.000/)
    expect(tekst).toMatch(/je huis \(€\s?300\.000\)/)
    // 200.000 reëel / €100 per dag = 2.000 dagen ≈ 5 jaar en 5 maanden.
    expect(tekst).toContain('Dat is ongeveer 5 jaar en 5 maanden vrijheid.')
  })

  it('nominaal: bedragen ongedeflateerd, vrijheidstijd blijft real-verankerd', () => {
    render(<EindsituatieNotice {...basisProps} duiding={duiding()} />)
    const tekst = screen.getByTestId('eindsituatie-melding').textContent ?? ''
    expect(tekst).toMatch(/400\.000 meer/)
    expect(tekst).toContain('Dat is ongeveer 5 jaar en 5 maanden vrijheid.')
  })

  it('geen vrijheidstijd op een niet-liquide grondslag (nalatenschap incl. huis)', () => {
    render(<EindsituatieNotice {...basisProps} endForm="legacy" overschotIsLiquide={false} duiding={duiding()} />)
    expect(screen.getByTestId('eindsituatie-melding').textContent).not.toMatch(/vrijheid\./)
  })
})

describe('EindsituatieNotice — Fin-knop', () => {
  it('verschijnt bij !eenduidig ∧ abonnement ai ∧ uitvoermodus actief, met de vraag zonder bedragen', () => {
    render(<EindsituatieNotice {...basisProps} duiding={duiding({ eenduidig: false })} />)
    expect(exec.lastActive).toBe(true)
    const knop = screen.getByRole('button', { name: /met Fin/ })
    expect(screen.getByText('Er is uit de berekening niet één regel aan te wijzen die dit verklaart.')).toBeTruthy()
    fireEvent.click(knop)
    expect(chat.openWithMessage).toHaveBeenCalledTimes(1)
    const bericht = chat.openWithMessage.mock.calls[0][0] as string
    expect(bericht).toContain('Hoe komt dat?')
    expect(bericht).toContain('De uitleg bij mijn plan noemt deze oorzaken')
    expect(bericht).not.toMatch(/€|\d{3}\.\d{3}/)
  })

  it('verschijnt ook bij alleen lokale uitvoering', () => {
    exec.canUseCloud = false
    exec.canUseLocal = true
    render(<EindsituatieNotice {...basisProps} duiding={duiding()} />)
    expect(screen.getByRole('button', { name: /met Fin/ })).toBeTruthy()
  })

  it('niet bij een eenduidige oorzaak (en de uitvoermodus wordt dan niet eens opgevraagd)', () => {
    render(<EindsituatieNotice {...basisProps} duiding={duiding({ eenduidig: true })} />)
    expect(screen.queryByRole('button', { name: /met Fin/ })).toBeNull()
    expect(exec.lastActive).toBe(false)
  })

  it('niet zonder AI-abonnement', () => {
    access.subscriptions = []
    render(<EindsituatieNotice {...basisProps} duiding={duiding()} />)
    expect(screen.queryByRole('button', { name: /met Fin/ })).toBeNull()
    expect(exec.lastActive).toBe(false)
  })

  it('niet wanneer AI uit staat (uitvoermodus kan cloud noch lokaal)', () => {
    exec.canUseCloud = false
    exec.canUseLocal = false
    render(<EindsituatieNotice {...basisProps} duiding={duiding()} />)
    expect(screen.queryByRole('button', { name: /met Fin/ })).toBeNull()
    expect(screen.queryByText(/niet één regel/)).toBeNull()
  })
})

describe('EindsituatieNoticeProvider — minimaliseren', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function Host({ d }: { d: EindsituatieDuiding | null }) {
    const n = useEindsituatieNotice(d != null)
    return (
      <EindsituatieNotice
        {...basisProps}
        duiding={d}
        display={n.display}
        canMinimize={n.canMinimize}
        onMinimize={n.minimize}
      />
    )
  }

  it('minimaliseert naar het statuspunt, schrijft vlag 1 op de eigen sleutel en heropent', async () => {
    render(
      <EindsituatieNoticeProvider>
        <EindsituatieNoticeDot />
        <Host d={duiding({ eenduidig: true })} />
      </EindsituatieNoticeProvider>,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(screen.queryByTestId('eindsituatie-melding')).toBeNull()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ route: '/toekomst/eindsituatie', level: 1 })
    const punt = screen.getByRole('button', { name: /toon de uitleg/ })
    expect(punt.querySelector('span')?.className).toContain('bg-horizon-500')
    await act(async () => {
      fireEvent.click(punt)
    })
    expect(screen.getByTestId('eindsituatie-melding')).toBeTruthy()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ route: '/toekomst/eindsituatie', level: null })
  })

  it('start geminimaliseerd bij een server-geseede vlag (geen flits, geen fetch)', () => {
    render(
      <EindsituatieNoticeProvider initialMinimizedFlag={1}>
        <EindsituatieNoticeDot />
        <Host d={duiding()} />
      </EindsituatieNoticeProvider>,
    )
    expect(screen.queryByTestId('eindsituatie-melding')).toBeNull()
    expect(screen.getByRole('button', { name: /toon de uitleg/ })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('zonder provider: uitgeklapt, geen minimaliseer-knop', () => {
    render(<Host d={duiding()} />)
    expect(screen.getByTestId('eindsituatie-melding')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Minimaliseren' })).toBeNull()
  })
})
