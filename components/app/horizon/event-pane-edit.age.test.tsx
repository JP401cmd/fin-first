import { describe, it, expect, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventPaneEdit, initFormState, type EditFormState } from './event-pane-edit'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

vi.mock('./event-preview-sim', () => ({
  EMPTY_SIM_RESULT: { rows: [], fireAgeFractional: null },
  previewSimResult: () => ({ rows: [], fireAgeFractional: null }),
}))
vi.mock('./event-impact-preview', () => ({
  EventImpactPreview: () => null,
}))

// Geboren 1986 → 40 jaar op de testdatum (2026). Bewust een vaste DOB zodat
// currentAge in het formulier 40 is en de story-default (35) eronder ligt.
const baselineInput = { dateOfBirth: '1986-01-01' } as unknown as FinancialInput
const baselineInput30 = { dateOfBirth: '1996-01-01' } as unknown as FinancialInput

let latest: EditFormState | null = null

function Harness({ initial, input = baselineInput }: { initial: EditFormState; input?: FinancialInput }) {
  const [state, setState] = useState(initial)
  // Buiten de render bijwerken (react-hooks/globals) — de tests lezen de laatste state.
  useEffect(() => {
    latest = state
  }, [state])
  return (
    <EventPaneEdit
      state={state}
      setState={setState}
      existingEvent={null}
      baselineEvents={[]}
      baselineInput={input}
      baselineFire={null}
      fireParams={{} as FireParams}
      fireStrategy={{} as FireStrategyConfig}
      withdrawalStrategy={{} as WithdrawalStrategyConfig}
      endAge={90}
      saving={false}
      saveError={null}
      onSave={() => {}}
      onDelete={() => {}}
    />
  )
}

/**
 * Bug 2 sep 2026: het veld "Leeftijd" klemde elke toetsaanslag direct af —
 * leegmaken sprong naar de huidige leeftijd, doortypen naar de eindleeftijd —
 * en de story-vraag "Vanaf welke leeftijd?" overschreef het veld weer stil.
 */
describe('EventPaneEdit — leeftijd is typbaar en loopt gelijk met de story-vraag', () => {
  it('een leeftijd kan gewoon getypt worden (leeg → 4 → 45)', () => {
    render(<Harness initial={initFormState('world_trip', null, 40)} />)
    const veld = screen.getByLabelText('Leeftijd') as HTMLInputElement
    fireEvent.change(veld, { target: { value: '' } })
    fireEvent.change(veld, { target: { value: '4' } })
    fireEvent.change(veld, { target: { value: '45' } })
    expect(veld.value).toBe('45')
    expect(latest?.shared_age).toBe(45)
    // en de story-vraag loopt mee
    expect(latest?.storyAnswers?.startAge).toBe(45)
    const storyVeld = screen.getByLabelText('Vanaf welke leeftijd?') as HTMLInputElement
    expect(storyVeld.value).toBe('45')
  })

  it('de story-vraag is per toetsaanslag typbaar vanaf een startwaarde ≠ huidige leeftijd en stuurt het bovenste veld', () => {
    render(<Harness initial={initFormState('world_trip', null, 40)} />)
    const storyVeld = screen.getByLabelText('Vanaf welke leeftijd?') as HTMLInputElement
    // Start = nu+5 (45), dus élke klem-terugsprong zou hier zichtbaar worden.
    expect(storyVeld.value).toBe('45')
    fireEvent.focus(storyVeld)
    fireEvent.change(storyVeld, { target: { value: '' } })
    expect(storyVeld.value).toBe('')
    fireEvent.change(storyVeld, { target: { value: '5' } })
    expect(storyVeld.value).toBe('5')
    fireEvent.change(storyVeld, { target: { value: '52' } })
    expect(storyVeld.value).toBe('52')
    expect(latest?.shared_age).toBe(52)
    expect((screen.getByLabelText('Leeftijd') as HTMLInputElement).value).toBe('52')
  })

  it('het bovenste veld is per toetsaanslag typbaar terwijl het focus heeft (30-jarige, default 35)', () => {
    render(<Harness initial={initFormState('world_trip', null, 30)} input={baselineInput30} />)
    const veld = screen.getByLabelText('Leeftijd') as HTMLInputElement
    expect(veld.value).toBe('35')
    fireEvent.focus(veld)
    fireEvent.change(veld, { target: { value: '' } })
    fireEvent.change(veld, { target: { value: '4' } })
    expect(veld.value).toBe('4')
    fireEvent.change(veld, { target: { value: '48' } })
    expect(veld.value).toBe('48')
    expect(latest?.storyAnswers?.startAge).toBe(48)
  })

  it('leeg verlaten veld springt bij blur terug naar de laatste waarde', () => {
    render(<Harness initial={initFormState('world_trip', null, 40)} />)
    const veld = screen.getByLabelText('Leeftijd') as HTMLInputElement
    fireEvent.focus(veld)
    fireEvent.change(veld, { target: { value: '' } })
    fireEvent.blur(veld)
    expect(veld.value).toBe('45')
    expect(latest?.shared_age).toBe(45)
  })

  it('een decimale leeftijd is ongeldig (target_age is INT)', () => {
    render(<Harness initial={initFormState('world_trip', null, 40)} />)
    const veld = screen.getByLabelText('Leeftijd') as HTMLInputElement
    fireEvent.change(veld, { target: { value: '45.5' } })
    expect(veld.getAttribute('aria-invalid')).toBe('true')
  })

  it('een leeftijd buiten het venster toont de foutmelding en blokkeert niet het typen', () => {
    render(<Harness initial={initFormState('world_trip', null, 40)} />)
    const veld = screen.getByLabelText('Leeftijd') as HTMLInputElement
    fireEvent.change(veld, { target: { value: '30' } })
    expect(veld.value).toBe('30')
    expect(veld.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/Kies een leeftijd tussen 40 en 90/)).toBeTruthy()
  })
})
