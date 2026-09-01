/**
 * Component-test voor de reeks-regel bovenin de check-in-historie.
 *
 * Pint de zichtbaarheidsdrempel (N ≥ 2), de mijlpaal-kleur (N ≥ 3) en dat de
 * getoonde telling exact de uitkomst van `berekenReeks` is — geen tweede
 * reeks-implementatie in de weergavelaag.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ReeksRegel } from './reeks-regel'
import { berekenReeks } from '@/lib/checkin/reeks'

/** 15 maart 2026 — vaste "nu" zodat de maandsleutels deterministisch zijn. */
const NU = new Date(2026, 2, 15)

afterEach(cleanup)

describe('ReeksRegel', () => {
  it('toont niets bij een lege lijst', () => {
    const { container } = render(<ReeksRegel completedMonths={[]} nu={NU} />)
    expect(container.firstChild).toBeNull()
  })

  it('toont niets bij één maand (N < 2)', () => {
    const { container } = render(
      <ReeksRegel completedMonths={['2026-03']} nu={NU} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('toont niets wanneer de huidige maand ontbreekt', () => {
    const { container } = render(
      <ReeksRegel completedMonths={['2026-01', '2026-02']} nu={NU} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('toont de regel vanaf twee maanden op rij', () => {
    render(<ReeksRegel completedMonths={['2026-02', '2026-03']} nu={NU} />)
    expect(screen.getByText(/Je staat op/)).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText(/maanden op rij\./)).toBeTruthy()
  })

  it('houdt het cijfer neutraal bij N = 2 en kleurt het vanaf N = 3', () => {
    const { unmount } = render(
      <ReeksRegel completedMonths={['2026-02', '2026-03']} nu={NU} />,
    )
    expect(screen.getByText('2').className).not.toContain('text-wil-700')
    unmount()

    render(
      <ReeksRegel
        completedMonths={['2026-01', '2026-02', '2026-03']}
        nu={NU}
      />,
    )
    expect(screen.getByText('3').className).toContain('text-wil-700')
  })

  it('toont exact de uitkomst van berekenReeks — gat inbegrepen', () => {
    const maanden = ['2025-10', '2025-11', '2026-01', '2026-02', '2026-03']
    const verwacht = berekenReeks(maanden, NU)
    expect(verwacht).toBe(3)
    render(<ReeksRegel completedMonths={maanden} nu={NU} />)
    expect(screen.getByText(String(verwacht))).toBeTruthy()
  })
})
