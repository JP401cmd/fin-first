import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { DensityToggle, useListDensity } from './density-toggle'

/**
 * Tests voor de gedeelde dichtheidsschakelaar (M-08). Verifieert dat de toggle
 * wisselt, per lijst-key persisteert en dat verschillende keys onafhankelijk
 * zijn. Default is 'ruim' (regressie-eis: bestaand uiterlijk blijft ongewijzigd).
 */

// Kleine harness: koppelt de hook aan de component voor één lijst-key.
function Harness({ listKey }: { listKey: string }) {
  const { density, setDensity } = useListDensity(listKey)
  return (
    <div>
      <span data-testid={`current-${listKey}`}>{density}</span>
      <DensityToggle density={density} onChange={setDensity} />
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  cleanup()
})

describe('useListDensity + DensityToggle', () => {
  it('default is "ruim"', async () => {
    render(<Harness listKey="a" />)
    await waitFor(() => expect(screen.getByTestId('current-a').textContent).toBe('ruim'))
    expect(screen.getByTestId('density-option-ruim').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('density-option-compact').getAttribute('aria-pressed')).toBe('false')
  })

  it('klik op "Compact" wisselt de dichtheid en zet aria-pressed', async () => {
    render(<Harness listKey="a" />)
    await waitFor(() => expect(screen.getByTestId('current-a').textContent).toBe('ruim'))

    fireEvent.click(screen.getByTestId('density-option-compact'))

    await waitFor(() => expect(screen.getByTestId('current-a').textContent).toBe('compact'))
    expect(screen.getByTestId('density-option-compact').getAttribute('aria-pressed')).toBe('true')
  })

  it('persisteert de keuze per lijst-key in localStorage', async () => {
    render(<Harness listKey="mijn-lijst" />)
    fireEvent.click(screen.getByTestId('density-option-compact'))
    await waitFor(() =>
      expect(window.localStorage.getItem('tf-list-density:mijn-lijst')).toBe('compact'),
    )
  })

  it('leest de opgeslagen keuze terug bij een verse mount', async () => {
    window.localStorage.setItem('tf-list-density:b', 'compact')
    render(<Harness listKey="b" />)
    await waitFor(() => expect(screen.getByTestId('current-b').textContent).toBe('compact'))
  })

  it('verschillende lijst-keys zijn onafhankelijk', async () => {
    const { unmount } = render(<Harness listKey="lijst-1" />)
    fireEvent.click(screen.getByTestId('density-option-compact'))
    await waitFor(() =>
      expect(window.localStorage.getItem('tf-list-density:lijst-1')).toBe('compact'),
    )
    unmount()

    render(<Harness listKey="lijst-2" />)
    // lijst-2 is nog nooit aangeraakt → default 'ruim'.
    await waitFor(() => expect(screen.getByTestId('current-lijst-2').textContent).toBe('ruim'))
    expect(window.localStorage.getItem('tf-list-density:lijst-2')).toBeNull()
  })

  it('synchroniseert instanties met dezelfde key via het change-event', async () => {
    render(
      <div>
        <Harness listKey="sync" />
        <Harness listKey="sync" />
      </div>,
    )
    const [firstCompact] = screen.getAllByTestId('density-option-compact')
    act(() => {
      fireEvent.click(firstCompact)
    })
    await waitFor(() => {
      const values = screen.getAllByTestId('current-sync').map((n) => n.textContent)
      expect(values).toEqual(['compact', 'compact'])
    })
  })
})
