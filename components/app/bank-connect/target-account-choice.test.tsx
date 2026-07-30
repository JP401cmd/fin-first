import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TargetAccountOption } from '@/lib/truelayer/target-account'
import {
  TargetAccountChoice,
  type TargetAccountChoiceProps,
  type TargetSelection,
} from './target-account-choice'

/**
 * Tests voor TargetAccountChoice — de doelrekening-keuze in stap 2 van de
 * bank-koppelwizard (specs/bank-connect-doelrekening/plan.md, fase 4).
 *
 * Wat hier gepind wordt is precies wat de gebruiker verkeerd kan begrijpen:
 * dat "nieuwe rekening" een échte optie is en geen restpost, dat de
 * historie-regel de sámenvoeging beschrijft die hij accepteert, en dat de
 * ophaal-regel de door de server berekende startdatum letterlijk overneemt
 * (geen tweede "−3 dagen" in de UI).
 */

function makeAccount(overrides: Partial<TargetAccountOption> = {}): TargetAccountOption {
  return {
    id: 'acc-1',
    name: 'Betaalrekening',
    bank_name: 'ING',
    iban_tail: '4321',
    transaction_count: 412,
    oldest_transaction_date: '2024-07-17',
    newest_transaction_date: '2026-07-28',
    budget_tracking: true,
    linked_provider_name: null,
    fetch_plan: { mode: 'incremental', start_date: '2026-07-25' },
    ...overrides,
  }
}

function renderChoice(overrides: Partial<TargetAccountChoiceProps> = {}) {
  const onSelect = vi.fn()
  const onToggleBudgetTracking = vi.fn()
  const props: TargetAccountChoiceProps = {
    accounts: [],
    loading: false,
    loadError: null,
    selection: { kind: 'new' } as TargetSelection,
    onSelect,
    enableBudgetTracking: true,
    onToggleBudgetTracking,
    providerName: 'ING',
    ...overrides,
  }
  const view = render(<TargetAccountChoice {...props} />)
  return { ...view, onSelect, onToggleBudgetTracking }
}

describe('TargetAccountChoice — geen kandidaten', () => {
  it('toont geen radiogroep of opties, wél de nieuwe-rekening-mededeling', () => {
    renderChoice({ accounts: [] })

    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(
      screen.getByText(/nog geen rekening om aan te koppelen/i),
    ).toBeTruthy()
    expect(
      screen.getByText(/ING verschijnt als nieuwe rekening in TriFinity/i),
    ).toBeTruthy()
  })
})

describe('TargetAccountChoice — kandidatenlijst', () => {
  const twee = [
    makeAccount(),
    makeAccount({
      id: 'acc-2',
      name: 'Spaarrekening',
      bank_name: 'Rabobank',
      iban_tail: '9876',
      transaction_count: 3,
      oldest_transaction_date: '2026-01-05',
      newest_transaction_date: '2026-06-30',
      // Incrementeel, want een rekening MÉT historie krijgt per definitie het
      // B9-startpunt: de server levert `historical` alleen als er geen nieuwste
      // transactiedatum is. De fixtures houden die koppeling waar, zodat ze geen
      // toestand documenteren die niet kan bestaan.
      fetch_plan: { mode: 'incremental', start_date: '2026-06-27' },
    }),
  ]

  it('rendert beide rekeningen met telling en periode, plus de nieuwe-rekening-optie', () => {
    renderChoice({ accounts: twee })

    expect(screen.getByRole('radiogroup')).toBeTruthy()
    // Twee bestaande rekeningen + "Nieuwe rekening aanmaken" = drie gelijkwaardige opties.
    expect(screen.getAllByRole('radio')).toHaveLength(3)

    expect(screen.getByText('Betaalrekening')).toBeTruthy()
    expect(screen.getByText('Spaarrekening')).toBeTruthy()
    expect(screen.getByText('412 transacties · 17 jul 2024 – 28 jul 2026')).toBeTruthy()
    expect(screen.getByText('3 transacties · 5 jan 2026 – 30 jun 2026')).toBeTruthy()
    expect(screen.getByText('Nieuwe rekening aanmaken')).toBeTruthy()
    // Gemaskeerde IBAN — nooit meer dan de staart.
    expect(screen.getByText(/···· 4321/)).toBeTruthy()
  })

  it('toont "nog geen transacties" bij een lege rekening', () => {
    renderChoice({
      accounts: [
        makeAccount({
          transaction_count: 0,
          oldest_transaction_date: null,
          newest_transaction_date: null,
        }),
      ],
    })

    expect(screen.getByText('nog geen transacties')).toBeTruthy()
  })

  it('een al gekoppelde rekening is zichtbaar maar uitgeschakeld, mét reden én uitweg (FR5)', () => {
    const { onSelect } = renderChoice({
      accounts: [makeAccount({ linked_provider_name: 'Rabobank' })],
      selection: { kind: 'none' },
    })

    // Zichtbaar, niet weggelaten: een verdwenen optie is verwarrender dan een
    // uitgelegde optie — wie zijn eigen rekening niet ziet, gaat zoeken.
    expect(screen.getByText('Betaalrekening')).toBeTruthy()
    const radio = screen.getByRole('radio', { name: /Betaalrekening/ }) as HTMLInputElement
    expect(radio.disabled).toBe(true)

    // De REDEN staat binnen het label, dus in de toegankelijke naam van de radio.
    expect(radio.labels?.[0]?.textContent).toMatch(/Al gekoppeld aan Rabobank/i)

    // De UITWEG staat eronder als échte link, buiten het label (een link binnen een
    // label dat een radio omsluit vecht met de radio om de klik). Zonder die link is
    // "verbreek die koppeling eerst" een instructie zonder pad.
    const exit = screen.getByRole('link', { name: /koppeling te verbreken/i }) as HTMLAnchorElement
    expect(exit.getAttribute('href')).toBe('/core/assets/cash/acc-1')
    expect(exit.getAttribute('target')).toBe('_blank')

    // Bewust GEEN `fireEvent.click`-assertie op de radio: fireEvent dispatcht
    // rechtstreeks op de node en negeert `disabled` (jsdom-eigenaardigheid), dus zo'n
    // test bewijst niets over een echte browser. Het `disabled`-attribuut is de
    // garantie, en de server-409 is de grens — zie auth-link/route.test.ts.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('een vrije rekening krijgt géén ontkoppel-uitweg', () => {
    renderChoice({ accounts: [makeAccount()], selection: { kind: 'none' } })

    expect(screen.queryByRole('link', { name: /koppeling te verbreken/i })).toBeNull()
  })

  it('staat élke bestaande rekening op bezet, dan zegt de wizard dat ook', () => {
    renderChoice({
      accounts: [
        makeAccount({ linked_provider_name: 'Rabobank' }),
        makeAccount({ id: 'acc-2', name: 'Spaarrekening', linked_provider_name: 'ING' }),
      ],
      selection: { kind: 'none' },
    })

    // Anders is het een lijst met louter grijze opties zonder duiding, en is
    // "Nieuwe rekening aanmaken" geen keuze meer maar de uitkomst.
    expect(screen.getByText(/Al je bestaande rekeningen dragen al een bankkoppeling/i)).toBeTruthy()
  })

  it('"Nieuwe rekening aanmaken" blijft kiesbaar als élke bestaande rekening bezet is', () => {
    const { onSelect } = renderChoice({
      accounts: [
        makeAccount({ linked_provider_name: 'Rabobank' }),
        makeAccount({ id: 'acc-2', name: 'Spaarrekening', linked_provider_name: 'ING' }),
      ],
      selection: { kind: 'none' },
    })

    fireEvent.click(screen.getByRole('radio', { name: /Nieuwe rekening aanmaken/ }))

    expect(onSelect).toHaveBeenCalledWith({ kind: 'new' })
  })

  it('roept onSelect met de gekozen bestaande rekening', () => {
    const { onSelect } = renderChoice({ accounts: twee })

    fireEvent.click(screen.getByRole('radio', { name: /Spaarrekening/ }))

    expect(onSelect).toHaveBeenCalledWith({ kind: 'existing', id: 'acc-2' })
  })

  it('roept onSelect met { kind: "new" } voor de nieuwe rekening', () => {
    const { onSelect } = renderChoice({
      accounts: twee,
      selection: { kind: 'existing', id: 'acc-1' },
    })

    fireEvent.click(screen.getByRole('radio', { name: /Nieuwe rekening aanmaken/ }))

    expect(onSelect).toHaveBeenCalledWith({ kind: 'new' })
  })

  it('legt bij de gekozen nieuwe rekening uit dat er een rekening en cash-bezit bijkomt', () => {
    renderChoice({ accounts: twee, selection: { kind: 'new' } })

    expect(
      screen.getByText(/nieuwe rekening en een nieuw cash-bezit aan/i),
    ).toBeTruthy()
  })

  it('schakelt alle controls uit wanneer disabled', () => {
    renderChoice({ accounts: twee, disabled: true })

    for (const radio of screen.getAllByRole('radio')) {
      expect((radio as HTMLInputElement).disabled).toBe(true)
    }
  })
})

describe('TargetAccountChoice — ophaal-regel volgt fetch_plan', () => {
  it('incremental toont de door de server geleverde startdatum', () => {
    renderChoice({
      accounts: [makeAccount({ fetch_plan: { mode: 'incremental', start_date: '2026-07-25' } })],
      selection: { kind: 'existing', id: 'acc-1' },
    })

    expect(screen.getByText('We halen transacties op vanaf 25 jul 2026.')).toBeTruthy()
    expect(screen.queryByText(/zo ver terug/i)).toBeNull()
  })

  /** Lege rekening: de enige toestand waarin de server `historical` levert. */
  const leeg = {
    transaction_count: 0,
    oldest_transaction_date: null,
    newest_transaction_date: null,
    fetch_plan: { mode: 'historical' as const, start_date: '2024-07-29' },
  }

  it('historical toont de "zo ver terug"-tekst zonder datum', () => {
    renderChoice({
      accounts: [makeAccount(leeg)],
      selection: { kind: 'existing', id: 'acc-1' },
    })

    expect(screen.getByText('We halen zo ver terug op als je bank geeft.')).toBeTruthy()
    expect(screen.queryByText(/We halen transacties op vanaf/i)).toBeNull()
  })

  it('toont de ophaal-regel alleen bij de geselecteerde rekening', () => {
    renderChoice({
      accounts: [
        makeAccount({ id: 'acc-1' }),
        makeAccount({ id: 'acc-2', name: 'Spaarrekening', ...leeg }),
      ],
      selection: { kind: 'existing', id: 'acc-1' },
    })

    expect(screen.getByText('We halen transacties op vanaf 25 jul 2026.')).toBeTruthy()
    expect(screen.queryByText(/zo ver terug/i)).toBeNull()
  })
})

describe('TargetAccountChoice — B2-budgetvinkje', () => {
  const zonderTracking = makeAccount({ budget_tracking: false })
  const vinkje = /Neem deze rekening mee in mijn budgetten/i

  it('verschijnt bij een geselecteerde rekening zonder budget-tracking', () => {
    renderChoice({
      accounts: [zonderTracking],
      selection: { kind: 'existing', id: 'acc-1' },
      enableBudgetTracking: true,
    })

    const box = screen.getByRole('checkbox', { name: vinkje }) as HTMLInputElement
    expect(box.checked).toBe(true)
  })

  it('verschijnt niet zolang die rekening niet geselecteerd is', () => {
    renderChoice({ accounts: [zonderTracking], selection: { kind: 'new' } })

    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('verschijnt niet bij een rekening die de budgetten al volgt', () => {
    renderChoice({
      accounts: [makeAccount({ budget_tracking: true })],
      selection: { kind: 'existing', id: 'acc-1' },
    })

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText(vinkje)).toBeNull()
  })

  it('roept onToggleBudgetTracking met false bij uitvinken', () => {
    const { onToggleBudgetTracking } = renderChoice({
      accounts: [zonderTracking],
      selection: { kind: 'existing', id: 'acc-1' },
      enableBudgetTracking: true,
    })

    fireEvent.click(screen.getByRole('checkbox', { name: vinkje }))

    expect(onToggleBudgetTracking).toHaveBeenCalledWith(false)
  })
})

describe('TargetAccountChoice — laden en laadfout', () => {
  it('toont een skeleton en geen opties tijdens laden', () => {
    renderChoice({ accounts: [], loading: true })

    expect(screen.getByText('Rekeningen laden')).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('toont de laadfout en geen keuzelijst, mét de nieuwe-rekening-uitkomst', () => {
    renderChoice({
      accounts: [makeAccount()],
      loadError: 'Je rekeningen konden niet worden geladen.',
    })

    expect(screen.getByText('Je rekeningen konden niet worden geladen.')).toBeTruthy()
    expect(screen.getByText(/landt daarom op een nieuwe rekening/i)).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByText('Betaalrekening')).toBeNull()
  })
})
