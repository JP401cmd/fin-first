import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { WealthGroup } from '@/lib/wealth-composition'
import {
  WITHDRAWAL_ORDER_PRESETS,
  DEFAULT_GROUP_ORDER,
  detectOrderPreset,
} from '@/lib/pot-rules'
import { OrderPresetPicker } from './order-preset-picker'

const BALANCES: Record<WealthGroup, number> = {
  spaargeld: 20000,
  beleggingen: 50000,
  pensioen: 80000,
  vastgoed: 300000,
  overig: 5000,
}

/** Controlled harness — mirror hoe een body de order-state bezit. */
function Harness({ initial }: { initial: WealthGroup[] }) {
  const [order, setOrder] = useState<WealthGroup[]>(initial)
  return (
    <OrderPresetPicker
      presets={WITHDRAWAL_ORDER_PRESETS}
      order={order}
      balances={BALANCES}
      onChange={setOrder}
    />
  )
}

function card(title: string): HTMLButtonElement {
  return screen.getByText(title).closest('button') as HTMLButtonElement
}

describe('OrderPresetPicker', () => {
  it('toont alle vier presets + de Aangepast-kaart', () => {
    render(<Harness initial={DEFAULT_GROUP_ORDER} />)
    expect(screen.getByText('Liquide eerst')).toBeTruthy()
    expect(screen.getByText('Rendement beschermen')).toBeTruthy()
    expect(screen.getByText('Fiscaal gunstig (Box 3 eerst)')).toBeTruthy()
    expect(screen.getByText('Pensioen sparen')).toBeTruthy()
    expect(screen.getByText('Aangepast')).toBeTruthy()
  })

  it('default-volgorde markeert "Liquide eerst" actief en verbergt de sleep-editor', () => {
    render(<Harness initial={DEFAULT_GROUP_ORDER} />)
    expect(card('Liquide eerst').getAttribute('aria-pressed')).toBe('true')
    expect(card('Aangepast').getAttribute('aria-pressed')).toBe('false')
    // Geen sleep-editor zichtbaar (arrow-knoppen ontbreken).
    expect(screen.queryByLabelText(/omhoog$/i)).toBeNull()
  })

  it('preset kiezen herordent de editor + markeert de preset actief', () => {
    render(<Harness initial={DEFAULT_GROUP_ORDER} />)
    fireEvent.click(card('Fiscaal gunstig (Box 3 eerst)'))
    expect(card('Fiscaal gunstig (Box 3 eerst)').getAttribute('aria-pressed')).toBe('true')
    expect(card('Liquide eerst').getAttribute('aria-pressed')).toBe('false')
    // Open de editor om de nieuwe volgorde te inspecteren: Beleggingen staat nu bovenaan.
    fireEvent.click(card('Aangepast'))
    const rows = screen.getAllByText(/^(Spaargeld|Beleggingen|Pensioen|Vastgoed|Overig)$/)
    expect(rows[0].textContent).toBe('Beleggingen')
  })

  it('"Aangepast" opent de sleep-editor', () => {
    render(<Harness initial={DEFAULT_GROUP_ORDER} />)
    expect(screen.queryByLabelText(/omhoog$/i)).toBeNull()
    fireEvent.click(card('Aangepast'))
    expect(card('Aangepast').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Beleggingen omhoog')).toBeTruthy()
  })

  it('een custom volgorde toont meteen "Aangepast" (geen preset actief)', () => {
    // Volgorde die met geen preset matcht.
    const custom: WealthGroup[] = ['pensioen', 'spaargeld', 'beleggingen', 'overig', 'vastgoed']
    expect(detectOrderPreset(custom, WITHDRAWAL_ORDER_PRESETS)).toBe('aangepast')
    render(<Harness initial={custom} />)
    expect(card('Aangepast').getAttribute('aria-pressed')).toBe('true')
    for (const t of ['Liquide eerst', 'Rendement beschermen', 'Fiscaal gunstig (Box 3 eerst)', 'Pensioen sparen']) {
      expect(card(t).getAttribute('aria-pressed')).toBe('false')
    }
  })

  it('handmatig herordenen in de editor houdt "Aangepast" actief', () => {
    render(<Harness initial={DEFAULT_GROUP_ORDER} />)
    fireEvent.click(card('Aangepast'))
    // Sleep Beleggingen omhoog → order wijkt af van elke preset.
    fireEvent.click(screen.getByLabelText('Beleggingen omhoog'))
    const editor = screen.getByLabelText('Spaargeld omhoog').closest('div')
    expect(editor).toBeTruthy()
    expect(card('Aangepast').getAttribute('aria-pressed')).toBe('true')
    // Eerste editor-rij is nu Beleggingen (omhoog geschoven).
    const rows = within(document.body).getAllByText(
      /^(Spaargeld|Beleggingen|Pensioen|Vastgoed|Overig)$/,
    )
    expect(rows[0].textContent).toBe('Beleggingen')
  })
})
