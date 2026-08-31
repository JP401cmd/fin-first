/**
 * Regressie H9 — "Bedragveld slikt fouten stil" — voor de quick-add-wizard.
 *
 * De bedragvelden in stap 3 waren `<input type="number">`. Dat laat de BROWSER
 * beslissen wat er met ongeldige invoer gebeurt: hij leegt `value` vóórdat
 * React iets ziet, dus de component kan er niets over zeggen. Getypt `abc`
 * leverde een leeg veld zonder melding op, en de lokale `parseNumberInput` las
 * bovendien de NL-notatie fout — `45.000` werd `45`, waarna elk afgeleid cijfer
 * op een bedrag rekende dat de gebruiker nooit heeft ingevoerd.
 *
 * Deze suite pint het gedrag van de canonieke `<AmountInput>` op alle drie de
 * bedragvelden van stap 3: het hoofdbedrag, het type-specifieke currency-veld
 * (field3) en de optionele aflossing per maand. De percentage-, jaar- en
 * datumvelden vallen bewust buiten deze suite — zie de toelichting bij
 * `parseDecimalInput` in `step-details.tsx`.
 *
 * L4 blijft gelden: één veldfout = één melding. Vandaar de expliciete telling
 * van meldingen naast het veld.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuickAddWizard } from '../quick-add-wizard'
import type { QuickAddInput } from '@/lib/quick-add/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

beforeEach(() => vi.clearAllMocks())

/** Belegging: currency-field3 ("Maandelijkse inleg") en géén koppel-prompt. */
function renderBelegging(onCollect: (item: QuickAddInput) => void) {
  return render(
    <QuickAddWizard
      open
      onClose={vi.fn()}
      initialIntent="asset"
      initialAssetType="investment"
      mode="collect"
      onCollect={onCollect}
    />,
  )
}

const toevoegen = () => screen.getByRole('button', { name: 'Toevoegen' })

describe('QuickAddWizard stap 3 — hoofdbedrag (H9)', () => {
  it('leest NL-notatie: "45.000" is 45000, niet 45', async () => {
    const onCollect = vi.fn()
    renderBelegging(onCollect)

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Indexfonds' } })
    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '45.000' } })
    fireEvent.click(toevoegen())

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    if (arg.kind !== 'asset') throw new Error(`verwachtte kind 'asset', kreeg '${arg.kind}'`)
    expect(arg.asset.current_value).toBe(45000)
  })

  it('leest een NL-bedrag met decimalen: "2.150,50" is 2150.5', async () => {
    const onCollect = vi.fn()
    renderBelegging(onCollect)

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Indexfonds' } })
    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '2.150,50' } })
    fireEvent.click(toevoegen())

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    if (arg.kind !== 'asset') throw new Error(`verwachtte kind 'asset', kreeg '${arg.kind}'`)
    expect(arg.asset.current_value).toBe(2150.5)
  })

  it('weigert ongeldige tekens ZICHTBAAR in plaats van stil', async () => {
    renderBelegging(vi.fn())

    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '12abc' } })

    const melding = await screen.findByText(/niet overgenomen/i)
    expect(melding.textContent).toContain('a')
    // Wat wél een bedrag is, blijft staan — het veld gooit niet alles weg.
    expect((screen.getByLabelText('Huidige waarde') as HTMLInputElement).value).toBe('12')
  })

  it('weigert een minteken zichtbaar (bedrag is positive-only)', async () => {
    renderBelegging(vi.fn())

    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '-500' } })

    expect(await screen.findByText(/negatief bedrag kan hier niet/i)).toBeTruthy()
    expect((screen.getByLabelText('Huidige waarde') as HTMLInputElement).value).toBe('500')
  })

  it('toont hooguit één melding tegelijk bij het bedrag-veld (L4)', async () => {
    renderBelegging(vi.fn())

    const bedrag = screen.getByLabelText('Huidige waarde')
    fireEvent.change(bedrag, { target: { value: 'abc' } })
    fireEvent.blur(bedrag)
    fireEvent.click(toevoegen())

    await screen.findByText(/niet overgenomen|geldig bedrag/i)
    const meldingen = screen
      .queryAllByRole('alert')
      .filter((el) => el.id.endsWith('-amount-melding'))
    expect(meldingen).toHaveLength(1)
  })
})

describe('QuickAddWizard stap 3 — type-specifiek bedrag (field3, H9)', () => {
  it('leest "1.200" in de maandelijkse inleg als 1200', async () => {
    const onCollect = vi.fn()
    renderBelegging(onCollect)

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Indexfonds' } })
    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: '30000' } })
    fireEvent.change(screen.getByLabelText('Maandelijkse inleg'), { target: { value: '1.200' } })
    fireEvent.click(toevoegen())

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    if (arg.kind !== 'asset') throw new Error(`verwachtte kind 'asset', kreeg '${arg.kind}'`)
    expect(arg.asset.field3).toBe(1200)
  })

  it('weigert ongeldige tekens in de maandelijkse inleg zichtbaar', async () => {
    renderBelegging(vi.fn())

    fireEvent.change(screen.getByLabelText('Maandelijkse inleg'), { target: { value: '5oo' } })

    expect(await screen.findByText(/niet overgenomen/i)).toBeTruthy()
  })
})

describe('QuickAddWizard stap 3 — aflossing per maand (H9)', () => {
  it('leest "1.250" als 1250 in plaats van 1,25', async () => {
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
    fireEvent.change(screen.getByLabelText('Huidig saldo'), { target: { value: '28.700' } })
    fireEvent.change(screen.getByLabelText(/Aflossing per maand/), { target: { value: '1.250' } })
    fireEvent.click(toevoegen())

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    if (arg.kind !== 'debt') throw new Error(`verwachtte kind 'debt', kreeg '${arg.kind}'`)
    expect(arg.debt.current_balance).toBe(28700)
    expect(arg.debt.monthly_payment).toBe(1250)
  })

  it('weigert een minteken in de aflossing zichtbaar', async () => {
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="debt"
        initialDebtType="car_loan"
        mode="collect"
        onCollect={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Aflossing per maand/), { target: { value: '-50' } })

    expect(await screen.findByText(/negatief bedrag kan hier niet/i)).toBeTruthy()
  })
})

/**
 * Het `€`-teken staat absoluut gepositioneerd ten opzichte van een
 * `relative`-box. `<AmountInput>` draagt een altijd-gemounte meldingsregel;
 * zat die in diezelfde box, dan groeide de box zodra er iets te melden viel en
 * zakte het euroteken mee naar het midden van de nieuwe hoogte — zichtbaar
 * scheef, precies op het moment dat het veld al iets fout heeft. De component
 * plaatst het prefix daarom zelf, met de melding erbuiten. Alle drie de
 * bedragvelden van deze stap moeten dat pad gebruiken.
 */
describe('QuickAddWizard stap 3 — het euroteken blijft staan bij een melding', () => {
  function verwachtPrefixBuitenMelding(label: string | RegExp) {
    const veld = screen.getByLabelText(label)
    const box = veld.parentElement
    expect(box?.className).toContain('relative')
    // De positioned box bevat alleen het teken en de input, niets anders.
    expect(box?.textContent).toBe('€')
    const melding = document.getElementById(`${veld.id}-melding`)
    expect(melding).not.toBeNull()
    expect(box?.contains(melding)).toBe(false)
  }

  it('hoofdbedrag en het type-specifieke bedrag', () => {
    renderBelegging(vi.fn())
    verwachtPrefixBuitenMelding('Huidige waarde')
    verwachtPrefixBuitenMelding('Maandelijkse inleg')
  })

  it('aflossing per maand', () => {
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="debt"
        initialDebtType="car_loan"
        mode="collect"
        onCollect={vi.fn()}
      />,
    )
    verwachtPrefixBuitenMelding(/Aflossing per maand/)
  })

  it('het teken blijft in dezelfde box zodra er wel een melding staat', async () => {
    renderBelegging(vi.fn())
    fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: 'abc' } })
    await screen.findByText(/niet overgenomen/i)
    verwachtPrefixBuitenMelding('Huidige waarde')
  })
})
