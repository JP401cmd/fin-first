/**
 * Component-test voor de QuickAddWizard in collect-modus (onboarding).
 *
 * Borgt het nieuwe gedrag: een eigen woning toont óók in collect-modus de
 * "Heeft deze woning een hypotheek?"-vervolgvraag, en bij "Ja" wordt het huis
 * + de hypotheek als één `asset_with_debt`-paar via `onCollect` teruggegeven
 * (geen DB-write). "Nee" geeft alleen het huis terug.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuickAddWizard } from '../quick-add-wizard'
import type { QuickAddInput } from '@/lib/quick-add/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

beforeEach(() => vi.clearAllMocks())

function renderCollect(onCollect: (item: QuickAddInput) => void) {
  return render(
    <QuickAddWizard
      open
      onClose={vi.fn()}
      initialIntent="asset"
      initialAssetType="eigen_huis"
      mode="collect"
      onCollect={onCollect}
    />,
  )
}

describe('QuickAddWizard — collect-modus, eigen woning', () => {
  it('toont de hypotheek-vervolgvraag na het invoeren van een eigen woning', async () => {
    renderCollect(vi.fn())

    // Bedrag invullen (naam is voor-ingevuld via ASSET_DEFAULT_NAMES).
    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '500000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    // De koppel-prompt verschijnt — in collect-modus, zónder DB-write.
    expect(await screen.findByText('Heeft deze woning een hypotheek?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ja, hypotheek toevoegen' })).toBeTruthy()
  })

  it('"Ja" → geeft huis + hypotheek als asset_with_debt-paar via onCollect', async () => {
    const onCollect = vi.fn()
    renderCollect(onCollect)

    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '500000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Ja, hypotheek toevoegen' }))

    // Hypotheek-formulier: restschuld invullen (naam is voor-ingevuld).
    fireEvent.change(await screen.findByLabelText('Huidig saldo'), { target: { value: '300000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Koppelen' }))

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    expect(arg.kind).toBe('asset_with_debt')
    if (arg.kind === 'asset_with_debt') {
      expect(arg.asset.asset_type).toBe('eigen_huis')
      expect(arg.asset.current_value).toBe(500000)
      expect(arg.debt.debt_type).toBe('mortgage')
      expect(arg.debt.current_balance).toBe(300000)
    }
  })

  it('spaarrekening: geeft de ingevoerde rente mee als asset.expected_return', async () => {
    const onCollect = vi.fn()
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="asset"
        initialAssetType="savings"
        mode="collect"
        onCollect={onCollect}
      />,
    )

    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '15000' } })
    // Bank blijft invulbaar (field3) NAAST de rente.
    fireEvent.change(screen.getByLabelText('Bank / instelling'), { target: { value: 'bunq' } })
    fireEvent.change(screen.getByLabelText('Rente (%)'), { target: { value: '3.6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    expect(arg.kind).toBe('asset')
    if (arg.kind === 'asset') {
      expect(arg.asset.asset_type).toBe('savings')
      expect(arg.asset.current_value).toBe(15000)
      expect(arg.asset.field3).toBe('bunq')
      expect(arg.asset.expected_return).toBe(3.6)
    }
  })

  it('spaarrekening: rente-veld toont de 2,5%-default als voorinvulling', () => {
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="asset"
        initialAssetType="savings"
        mode="collect"
        onCollect={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('Rente (%)') as HTMLInputElement).value).toBe('2.5')
  })

  it('autolening: optioneel aflossing-veld → monthly_payment in de collect-payload', async () => {
    const onCollect = vi.fn()
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="debt"
        initialDebtType="car_loan"
        mode="collect"
        onCollect={onCollect}
      />,
    )

    // Autolening heeft géén default-naam (anders dan hypotheek) — invullen dus.
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Auto' } })
    fireEvent.change(screen.getByLabelText('Huidig saldo'), { target: { value: '28700' } })
    fireEvent.change(screen.getByLabelText(/Aflossing per maand/), { target: { value: '450' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    expect(arg.kind).toBe('debt')
    if (arg.kind === 'debt') {
      expect(arg.debt.debt_type).toBe('car_loan')
      expect(arg.debt.current_balance).toBe(28700)
      expect(arg.debt.monthly_payment).toBe(450)
    }
  })

  it('autolening: aflossing-veld leeg laten → geen monthly_payment in de payload (default-pad)', async () => {
    const onCollect = vi.fn()
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="debt"
        initialDebtType="car_loan"
        mode="collect"
        onCollect={onCollect}
      />,
    )

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Auto' } })
    fireEvent.change(screen.getByLabelText('Huidig saldo'), { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    if (arg.kind === 'debt') {
      expect(arg.debt.monthly_payment == null).toBe(true)
    }
  })

  it('autolening: negatieve aflossing blokkeert submit met een veldfout (noValidate-vangnet)', async () => {
    const onCollect = vi.fn()
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="debt"
        initialDebtType="car_loan"
        mode="collect"
        onCollect={onCollect}
      />,
    )

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Auto' } })
    fireEvent.change(screen.getByLabelText('Huidig saldo'), { target: { value: '10000' } })
    const aflossing = screen.getByLabelText(/Aflossing per maand/)
    fireEvent.change(aflossing, { target: { value: '-50' } })

    // Zelfde patroon als de overige velden: de submit-knop disable't live op
    // de fout, en de veldfout verschijnt bij blur (touched).
    expect(
      (screen.getByRole('button', { name: 'Toevoegen' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.blur(aflossing)
    expect(await screen.findByText('Bedrag mag niet negatief zijn')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    expect(onCollect).not.toHaveBeenCalled()
  })

  it('creditcard: géén aflossing-veld (type buiten DEBT_MONTHLY_PAYMENT_FIELD_TYPES)', () => {
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="debt"
        initialDebtType="credit_card"
        mode="collect"
        onCollect={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/Aflossing per maand/)).toBeNull()
  })

  it('"Nee, overslaan" → geeft alleen het huis terug (huis zonder hypotheek blijft geldig)', async () => {
    const onCollect = vi.fn()
    renderCollect(onCollect)

    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '420000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Nee, overslaan' }))

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    expect(arg.kind).toBe('asset')
    if (arg.kind === 'asset') {
      expect(arg.asset.asset_type).toBe('eigen_huis')
      expect(arg.asset.current_value).toBe(420000)
    }
  })
})
