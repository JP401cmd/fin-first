import { describe, it, expect, vi, afterEach } from 'vitest'
import { Component, type ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ForceErrorClient } from './force-error-client'

/**
 * Minimale error boundary die de rol van `app/(app)/error.tsx` speelt: ze
 * bewijst dat de fout TIJDENS DE RENDER wordt gegooid en dus door een
 * boundary te vangen is. Een throw in de onClick-handler zou hier NIET
 * gevangen worden — precies de valkuil die deze test vastlegt.
 */
class TestBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state: { message: string | null } = { message: null }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message }
  }

  render() {
    if (this.state.message !== null) {
      return <p>gevangen: {this.state.message}</p>
    }
    return this.props.children
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ForceErrorClient', () => {
  it('rendert de knop en gooit nog geen fout', () => {
    render(
      <TestBoundary>
        <ForceErrorClient />
      </TestBoundary>,
    )
    expect(screen.getByRole('button', { name: 'Fout forceren' })).toBeTruthy()
    expect(screen.queryByText(/gevangen:/)).toBeNull()
  })

  it('gooit na de klik een renderfout die een error boundary vangt', () => {
    // React logt een gevangen render-fout altijd naar console.error; dempen
    // houdt de testuitvoer leesbaar zonder de assertie te verzwakken.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <TestBoundary>
        <ForceErrorClient />
      </TestBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fout forceren' }))

    expect(
      screen.getByText(/UAT force-error: bewust getriggerde renderfout/),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fout forceren' })).toBeNull()
  })
})
