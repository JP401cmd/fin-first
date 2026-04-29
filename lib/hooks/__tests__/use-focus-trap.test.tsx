/**
 * Smoke test for useFocusTrap — extracted from bottom-sheet.tsx (feb 2026).
 *
 * Covers:
 *  1. When active, initial focus moves into the container (first focusable).
 *  2. Tab from last focusable wraps to first.
 *  3. Shift+Tab from first focusable wraps to last.
 *  4. When active flips false, focus returns to the previously-focused trigger.
 *  5. No-op when container has zero focusable descendants.
 */
import { describe, it, expect } from 'vitest'
import { act, render } from '@testing-library/react'
import { createRef, useRef } from 'react'
import { useFocusTrap } from '../use-focus-trap'

function Harness({ active, empty = false }: { active: boolean; empty?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap({ active, containerRef: ref })
  return (
    <div>
      <button data-testid="trigger">trigger</button>
      <div ref={ref} data-testid="container">
        {!empty && (
          <>
            <button data-testid="first">first</button>
            <button data-testid="middle">middle</button>
            <button data-testid="last">last</button>
          </>
        )}
      </div>
    </div>
  )
}

function press(key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

async function flushRaf() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  })
}

describe('useFocusTrap', () => {
  it('moves initial focus to first focusable when active', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { getByTestId } = render(<Harness active />)
    await flushRaf()

    expect(document.activeElement).toBe(getByTestId('first'))
    trigger.remove()
  })

  it('wraps Tab from last → first', async () => {
    const { getByTestId } = render(<Harness active />)
    await flushRaf()
    const last = getByTestId('last') as HTMLButtonElement
    last.focus()

    const event = press('Tab')

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(getByTestId('first'))
  })

  it('wraps Shift+Tab from first → last', async () => {
    const { getByTestId } = render(<Harness active />)
    await flushRaf()
    const first = getByTestId('first') as HTMLButtonElement
    first.focus()

    const event = press('Tab', true)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(getByTestId('last'))
  })

  it('returns focus to the original trigger on deactivation', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { rerender } = render(<Harness active />)
    await flushRaf()
    expect(document.activeElement).not.toBe(trigger)

    rerender(<Harness active={false} />)
    await flushRaf()

    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('no-ops when container has no focusable descendants', async () => {
    render(<Harness active empty />)
    await flushRaf()

    const before = document.activeElement
    const event = press('Tab')

    // Event should not be prevented when there's nothing to wrap to.
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(before)
  })
})
