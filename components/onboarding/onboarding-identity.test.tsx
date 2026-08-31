import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingIdentity, type IdentityData } from './onboarding-identity'

/**
 * Regressie L4 — "Twee foutmeldingen voor één veld".
 *
 * Sinds de begeleide flow (jun 2026, `field`-prop) toont stap 1 alleen de
 * naam en stap 2 alleen de geboortedatum. De samenvattings-banner ("Vul alle
 * verplichte velden correct in om door te gaan") herhaalt de inline-melding
 * dan alleen vager en hoort dus weg te blijven; op het gecombineerde scherm
 * (twee velden) blijft hij wél zinvol.
 */

const EMPTY: IdentityData = {
  full_name: '',
  date_of_birth: '',
  household_type: 'solo',
  number_of_children: 0,
  net_monthly_income: '',
  estimated_yearly_income: '',
  estimated_monthly_expenses: '',
}

function Host({ field }: { field?: 'naam' | 'dob' }) {
  const [data, setData] = useState<IdentityData>(EMPTY)
  return (
    <OnboardingIdentity
      data={data}
      onChange={setData}
      onNext={vi.fn()}
      field={field}
    />
  )
}

const BANNER = 'Vul alle verplichte velden correct in om door te gaan'
// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const verder = () => screen.getAllByRole('button', { name: 'Verder' })[0]

describe('OnboardingIdentity — één melding per veld (L4)', () => {
  it('naam-scherm: leeg + Verder toont alleen de inline-melding, geen banner', () => {
    render(<Host field="naam" />)
    fireEvent.click(verder())
    expect(screen.getByText('Naam is verplicht')).toBeTruthy()
    expect(screen.queryByText(BANNER)).toBeNull()
  })

  it('dob-scherm: leeg + Verder toont alleen de inline-melding, geen banner', () => {
    render(<Host field="dob" />)
    fireEvent.click(verder())
    expect(screen.getByText('Geboortedatum is verplicht')).toBeTruthy()
    expect(screen.queryByText(BANNER)).toBeNull()
  })

  it('gecombineerd scherm (twee velden): de banner blijft wél staan', () => {
    render(<Host />)
    fireEvent.click(verder())
    expect(screen.getByText(BANNER)).toBeTruthy()
    expect(screen.getByText('Naam is verplicht')).toBeTruthy()
  })
})

/**
 * Regressie L5 — "Uitleg spreekt het sterretje tegen". De deck-tekst boven het
 * naamveld mag niet ontkennen wat het sterretje + de validatie zeggen, en niet
 * méér vrijheid beloven dan de flow geeft: naast de naam is óók de
 * geboortedatum hard verplicht (`getFieldErrors`, de server-zod in
 * `app/api/onboarding/save-own-data/route.ts` en de AOW/FIRE-afleidingen die
 * eraan hangen). Een deck die "alleen je naam" zegt, laat de gebruiker één
 * scherm later tegen een blokkade lopen die hij niet zag aankomen.
 */
describe('OnboardingIdentity — deck noemt beide verplichte velden (L5)', () => {
  it('naam-scherm: de deck noemt naam én geboortedatum', () => {
    render(<Host field="naam" />)
    const deck = screen.getByText(/de rest van de vragen mag je overslaan/i)
    const tekst = (deck.textContent ?? '').toLowerCase()
    expect(tekst).toContain('naam')
    expect(tekst).toContain('geboortedatum')
  })

  it('naam-scherm: geen ontkennende taal naast het verplichte veld', () => {
    const { container } = render(<Host field="naam" />)
    expect(container.textContent).not.toContain('niets verplichts')
  })

  it('naam-scherm: belooft niet dat alléén de naam verplicht is', () => {
    const { container } = render(<Host field="naam" />)
    expect(container.textContent).not.toContain('Alleen je naam is verplicht')
  })
})
