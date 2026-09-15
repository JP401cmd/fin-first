/**
 * De gedeelde regel-editor (ADR 0147). Hij schrijft de discriminated union uit
 * `lib/questionnaires/verspreiding.ts`; een verkeerde veldnaam matcht stil
 * niemand, dus de vorm ligt hier vast.
 */

import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RegelSchema, type Regel } from '@/lib/questionnaires/verspreiding'
import { RegelEditor, type StroomKeuze } from './regel-editor'

const STROMEN: StroomKeuze[] = [
  { id: 'vermogen', naam: 'Vermogen' },
  { id: 'toekomst', naam: 'Toekomst' },
]

function Harnas({
  begin = [],
  stromen = STROMEN,
  spion,
}: {
  begin?: Regel[]
  stromen?: StroomKeuze[]
  spion: (r: Regel[]) => void
}) {
  const [regels, setRegels] = useState<Regel[]>(begin)
  return (
    <RegelEditor
      regels={regels}
      stromen={stromen}
      onChange={(r) => {
        spion(r)
        setRegels(r)
      }}
    />
  )
}

const laatste = (spion: ReturnType<typeof vi.fn>) => spion.mock.calls.at(-1)?.[0] as Regel[]

describe('RegelEditor', () => {
  it('voegt een regel toe en verwijdert hem weer', () => {
    const spion = vi.fn()
    render(<Harnas spion={spion} />)
    expect(screen.getByText(/Nog geen regels/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Regel' }))
    expect(laatste(spion)).toEqual([{ soort: 'dagen_sinds_registratie', min: 7 }])

    fireEvent.click(screen.getByRole('button', { name: 'Regel 1 verwijderen' }))
    expect(laatste(spion)).toEqual([])
  })

  it('begrenst de waarde volgens het schema', () => {
    const spion = vi.fn()
    render(<Harnas spion={spion} begin={[{ soort: 'actieve_dagen_30', min: 5 }]} />)
    fireEvent.change(screen.getByLabelText('Regel 1 — waarde'), { target: { value: '99' } })
    expect(laatste(spion)).toEqual([{ soort: 'actieve_dagen_30', min: 30 }])
  })

  it('dominante stroom: kiest een stroom op id en optioneel minstens … dagen', () => {
    const spion = vi.fn()
    render(<Harnas spion={spion} begin={[{ soort: 'dagen_sinds_registratie', min: 7 }]} />)

    fireEvent.change(screen.getByLabelText('Regel 1 — soort'), { target: { value: 'dominante_stroom' } })
    expect(laatste(spion)).toEqual([{ soort: 'dominante_stroom', stroom: 'vermogen' }])

    fireEvent.change(screen.getByLabelText('Regel 1 — stroom'), { target: { value: 'toekomst' } })
    fireEvent.change(screen.getByLabelText('Regel 1 — minstens dagen'), { target: { value: '4' } })
    const regel = laatste(spion)[0]
    expect(regel).toEqual({ soort: 'dominante_stroom', stroom: 'toekomst', min_dagen: 4 })
    expect(RegelSchema.safeParse(regel).success).toBe(true)

    // Leegmaken = het veld weg, niet 0.
    fireEvent.change(screen.getByLabelText('Regel 1 — minstens dagen'), { target: { value: '' } })
    expect(laatste(spion)).toEqual([{ soort: 'dominante_stroom', stroom: 'toekomst' }])
  })

  it('zonder stromen is de stroomregel niet te kiezen', () => {
    const spion = vi.fn()
    render(<Harnas spion={spion} stromen={[]} begin={[{ soort: 'dagen_sinds_registratie', min: 7 }]} />)
    const optie = screen.getByRole('option', { name: /Dominante waardestroom.*stel eerst waardestromen in/ })
    expect(optie).toBeDisabled()
    expect(screen.getByRole('link', { name: 'stel eerst waardestromen in' })).toHaveAttribute(
      'href',
      '/beheer/waardestromen',
    )
  })

  it('een regel op een verwijderde stroom blijft zichtbaar als "bestaat niet meer"', () => {
    render(<Harnas spion={vi.fn()} begin={[{ soort: 'dominante_stroom', stroom: 'oud' }]} />)
    expect(screen.getByRole('option', { name: 'oud (bestaat niet meer)' })).toBeInTheDocument()
  })
})
