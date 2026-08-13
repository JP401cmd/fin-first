import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { useRef, useState } from 'react'
import { useSwipeToDismiss } from './use-swipe-to-dismiss'

/**
 * Regressietests voor twee bevindingen uit de code-review op de
 * BottomSheet/ChatPanel-extractie (aug 2026): de hook moet zichzelf
 * beschermen tegen (1) een dubbele overlappende dismiss en (2) `enabled` dat
 * halverwege een actieve sleep uitgaat — zonder dat een consumer daar zelf
 * iets extra's voor hoeft te doen (`onDismissStart` blijft optioneel).
 */

function swipe(el: HTMLElement, fromY: number, toY: number) {
  fireEvent.touchStart(el, { touches: [{ clientY: fromY }] })
  fireEvent.touchMove(el, { touches: [{ clientY: toY }] })
  fireEvent.touchEnd(el)
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

function mockSheetHeight(px: number) {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: px })
}

afterEach(() => {
  cleanup()
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
  }
})

describe('useSwipeToDismiss — robuustheid', () => {
  it('roept onDismiss maar één keer aan bij een tweede sleep die start terwijl de eerste dismiss nog animeert', async () => {
    mockSheetHeight(800)
    const onDismiss = vi.fn()

    function Harness() {
      const sheetRef = useRef<HTMLDivElement>(null)
      const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToDismiss({
        sheetRef,
        onDismiss,
      })
      return (
        <div
          ref={sheetRef}
          data-testid="sheet"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      )
    }

    const { getByTestId } = render(<Harness />)
    const sheet = getByTestId('sheet')

    // Eerste sleep: ruim voorbij de 30%-drempel → start de dismiss-animatie.
    swipe(sheet, 100, 600)
    // Tweede sleep start onmiddellijk, terwijl de eerste nog bezig is.
    swipe(sheet, 100, 600)

    // Ruim langer dan de langste dismiss-duur (350ms + marge).
    await new Promise((r) => setTimeout(r, 450))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('veert de sheet terug (geen vastzittende transform) als enabled halverwege een actieve sleep uitgaat', () => {
    mockSheetHeight(800)
    const onDismiss = vi.fn()

    function ToggleHarness() {
      const [enabled, setEnabled] = useState(true)
      const sheetRef = useRef<HTMLDivElement>(null)
      const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToDismiss({
        sheetRef,
        onDismiss,
        enabled,
      })
      return (
        <div>
          <div
            ref={sheetRef}
            data-testid="sheet"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
          <button data-testid="disable" onClick={() => setEnabled(false)}>uit</button>
        </div>
      )
    }

    const { getByTestId } = render(<ToggleHarness />)
    const sheet = getByTestId('sheet')

    // Korte sleep — drag is actief (60px), maar géén touchend: de vinger
    // "hangt" nog op het scherm wanneer enabled uitgaat.
    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(sheet, { touches: [{ clientY: 160 }] })
    expect(sheet.style.transform).not.toBe('')

    fireEvent.click(getByTestId('disable'))

    expect(sheet.style.transform).toBe('')
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
