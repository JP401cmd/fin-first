/**
 * De cijferbalk (`LifelineReadout`) staat alleen op desktop (spec §4.7): op mobiel
 * kostte hij ±290px boven de grafiek. Alleen in Volledig en alleen in Vermogen.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import type { ReadoutData } from '@/components/toekomst/state/types'
import type { CanvasModus } from '@/lib/horizon/katern-copy'

vi.mock('@/components/app/horizon/lifeline-readout', () => ({
  LifelineReadout: () => <div data-testid="lifeline-readout" />,
}))

import { CanvasUitleg } from './canvas-uitleg'

const readout = { age: 45 } as unknown as ReadoutData

function renderUitleg(modus: CanvasModus, mode: 'full' | 'simple' = 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <CanvasUitleg modus={modus} viewReadoutData={readout} lifelineAge={null} />
    </DisplayModeProvider>,
  )
}

describe('CanvasUitleg — de cijferbalk', () => {
  it('staat alleen vanaf lg in beeld (hidden lg:block)', () => {
    renderUitleg('vermogen')
    const balk = screen.getByTestId('canvas-readout')
    expect(balk.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'lg:block']))
    expect(balk.contains(screen.getByTestId('lifeline-readout'))).toBe(true)
  })

  it('niet buiten Vermogen', () => {
    renderUitleg('geldstroom')
    expect(screen.queryByTestId('canvas-readout')).toBeNull()
  })

  it('niet in Eenvoudig', () => {
    renderUitleg('vermogen', 'simple')
    expect(screen.queryByTestId('lifeline-readout')).toBeNull()
  })
})
