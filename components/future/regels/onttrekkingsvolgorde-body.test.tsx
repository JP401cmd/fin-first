import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { WealthGroup } from '@/lib/wealth-composition'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import { OnttrekkingsvolgordeBody } from './onttrekkingsvolgorde-body'
import type { RegelEditActionsState } from './types'

const BALANCES: Record<WealthGroup, number> = {
  spaargeld: 20000,
  beleggingen: 50000,
  pensioen: 80000,
  vastgoed: 300000,
  overig: 5000,
}

function renderBody() {
  let latest: RegelEditActionsState = { canSave: false, saving: false, save: () => {} }
  render(
    <OnttrekkingsvolgordeBody
      potRules={POT_RULES_DEFAULTS}
      potBalances={BALANCES}
      onActionsChange={(s) => {
        latest = s
      }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
  return { getState: () => latest }
}

function card(title: string): HTMLButtonElement {
  return screen.getByText(title).closest('button') as HTMLButtonElement
}

describe('OnttrekkingsvolgordeBody — presets + opslaan', () => {
  it('start met opslaan uit (volgorde = default)', () => {
    const { getState } = renderBody()
    expect(getState().canSave).toBe(false)
  })

  it('een afwijkende preset activeert opslaan', () => {
    const { getState } = renderBody()
    fireEvent.click(card('Rendement beschermen'))
    expect(getState().canSave).toBe(true)
  })

  it('opnieuw "Liquide eerst" (= default) kiezen laat opslaan uit', () => {
    const { getState } = renderBody()
    fireEvent.click(card('Rendement beschermen'))
    expect(getState().canSave).toBe(true)
    fireEvent.click(card('Liquide eerst'))
    expect(getState().canSave).toBe(false)
  })

  it('toont het prioriteit-uitlegblok', () => {
    renderBody()
    expect(screen.getByText('Zo werkt de prioriteit')).toBeTruthy()
  })
})
