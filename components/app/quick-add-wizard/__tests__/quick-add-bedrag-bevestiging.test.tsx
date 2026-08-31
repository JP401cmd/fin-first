/**
 * Regressie H8 — "geen wedervraag bij een onwaarschijnlijk groot bedrag" —
 * voor de quick-add-wizard.
 *
 * De volledige AssetForm vraagt sinds H8 door zodra een waarde
 * `ASSET_AMOUNT_CONFIRM_THRESHOLD` haalt: geen harde cap (die zou een
 * legitieme UHNW-gebruiker blokkeren), maar een vraag. De quick-add-wizard —
 * het pad waarlangs de meeste bezittingen binnenkomen, inclusief de hele
 * onboarding — sloeg die vraag over, dus daar kon één nul te veel ongemerkt
 * in de projectie belanden.
 *
 * De check zit in `proceedFromAssetDetails`, waar commit-modus én collect-modus
 * (onboarding) allebei doorheen lopen; deze suite dekt beide.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuickAddWizard } from '../quick-add-wizard'
import { ASSET_AMOUNT_CONFIRM_THRESHOLD } from '@/lib/asset-parameter-bands'
import type { QuickAddInput } from '@/lib/quick-add/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

beforeEach(() => vi.clearAllMocks())

/** Belegging: geen koppel-prompt, dus het submit-pad is één stap. */
function renderBelegging(
  onCollect: (item: QuickAddInput) => void,
  onClose: () => void = vi.fn(),
) {
  return render(
    <QuickAddWizard
      open
      onClose={onClose}
      initialIntent="asset"
      initialAssetType="investment"
      mode="collect"
      onCollect={onCollect}
    />,
  )
}

function vulIn(bedrag: string) {
  fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Indexfonds' } })
  fireEvent.change(screen.getByLabelText('Huidige waarde'), { target: { value: bedrag } })
  fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
}

const BOVEN_DREMPEL = String(ASSET_AMOUNT_CONFIRM_THRESHOLD)
const ONDER_DREMPEL = String(ASSET_AMOUNT_CONFIRM_THRESHOLD - 1)

describe('QuickAddWizard — wedervraag bij een groot bedrag (H8)', () => {
  it('houdt de submit tegen en stelt de vraag zodra de drempel gehaald wordt', async () => {
    const onCollect = vi.fn()
    renderBelegging(onCollect)

    vulIn(BOVEN_DREMPEL)

    expect(await screen.findByText('Klopt dit bedrag?')).toBeTruthy()
    expect(onCollect).not.toHaveBeenCalled()
  })

  it('"Ja, dit klopt" laat het bedrag alsnog door', async () => {
    const onCollect = vi.fn()
    renderBelegging(onCollect)

    vulIn(BOVEN_DREMPEL)
    fireEvent.click(await screen.findByTestId('quick-add-bedrag-bevestigen'))

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    const arg = onCollect.mock.calls[0][0] as QuickAddInput
    if (arg.kind !== 'asset') throw new Error(`verwachtte kind 'asset', kreeg '${arg.kind}'`)
    expect(arg.asset.current_value).toBe(ASSET_AMOUNT_CONFIRM_THRESHOLD)
  })

  it('"Aanpassen" sluit de vraag zonder op te slaan', async () => {
    const onCollect = vi.fn()
    renderBelegging(onCollect)

    vulIn(BOVEN_DREMPEL)
    fireEvent.click(await screen.findByRole('button', { name: 'Aanpassen' }))

    await waitFor(() => expect(screen.queryByText('Klopt dit bedrag?')).toBeNull())
    expect(onCollect).not.toHaveBeenCalled()
  })

  it('vraagt niets bij een bedrag onder de drempel', async () => {
    const onCollect = vi.fn()
    renderBelegging(onCollect)

    vulIn(ONDER_DREMPEL)

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Klopt dit bedrag?')).toBeNull()
  })
})

/**
 * De wedervraag is een tweede overlay bovenop de wizard-sheet. Zolang die
 * onderste sheet blijft meeluisteren naar Escape, sluit één toetsaanslag beide
 * lagen: de wizard verdwijnt met de getypte naam en het bedrag erin, en in
 * collect-modus (onboarding) vuurt `onCollect` dus nooit. De onderste laag hoort
 * terug te treden zolang de vraag openstaat — `BottomSheet.suspended`.
 */
describe('QuickAddWizard — Escape op de wedervraag (H8)', () => {
  it('sluit alleen de vraag; de wizard en de ingevulde velden blijven', async () => {
    const onClose = vi.fn()
    const onCollect = vi.fn()
    renderBelegging(onCollect, onClose)

    vulIn(BOVEN_DREMPEL)
    await screen.findByText('Klopt dit bedrag?')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByText('Klopt dit bedrag?')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(onCollect).not.toHaveBeenCalled()
    // De invoer staat er nog: de wizard is nooit ge-unmount.
    expect((screen.getByLabelText('Huidige waarde') as HTMLInputElement).value).toBe(
      BOVEN_DREMPEL,
    )
    expect((screen.getByLabelText('Naam') as HTMLInputElement).value).toBe('Indexfonds')
  })

  it('laat de wizard daarna gewoon weer bedienbaar achter', async () => {
    const onCollect = vi.fn()
    renderBelegging(onCollect)

    vulIn(BOVEN_DREMPEL)
    await screen.findByText('Klopt dit bedrag?')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Klopt dit bedrag?')).toBeNull())

    // Bedrag corrigeren naar iets onder de drempel en alsnog opslaan.
    fireEvent.change(screen.getByLabelText('Huidige waarde'), {
      target: { value: ONDER_DREMPEL },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
  })
})
