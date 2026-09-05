import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingShell } from './onboarding-shell'
import { OnboardingIdentity, type IdentityData } from './onboarding-identity'
import {
  DATA_NOTE_LINK_LABEL,
  DATA_NOTE_PRIVACY_HREF,
  dataNoteFor,
} from '@/lib/onboarding/data-note-copy'

/**
 * Vertrouwen op het moment zelf (UR3-15, AC1): elke stap die om gegevens
 * vraagt zegt wat ermee gebeurt en dat het later aan te passen is — met een
 * link naar de PUBLIEKE privacyverklaring, niet naar /mijn/privacy (die kaatst
 * tijdens de onboarding terug naar /onboarding, WF-START-11).
 *
 * De test pint de gerénderde regel tegen de canonieke copy-module, zodat een
 * stap die zijn eigen geruststelling gaat schrijven zichtbaar wordt.
 */
function renderShell(dataNote?: string) {
  return render(
    <OnboardingShell
      kicker="Profiel"
      title="Vraag"
      deck="Deck"
      dataNote={dataNote}
      factsPanel={null}
      footer={null}
      currentStep={1}
      totalSteps={7}
    >
      <div />
    </OnboardingShell>,
  )
}

describe('OnboardingShell — de gegevensregel', () => {
  it('toont de regel plus de link naar de publieke privacyverklaring', () => {
    renderShell(dataNoteFor('inkomen'))

    expect(screen.getByText(new RegExp(dataNoteFor('inkomen')))).toBeTruthy()

    const link = screen.getByRole('link', { name: DATA_NOTE_LINK_LABEL })
    expect(link.getAttribute('href')).toBe(DATA_NOTE_PRIVACY_HREF)
    expect(link.getAttribute('href')).not.toBe('/mijn/privacy')
    // Opent in een nieuw tabblad: de gebruiker verliest zijn stap niet.
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('blijft weg op een stap zonder gegevensregel', () => {
    renderShell(undefined)
    expect(screen.queryByRole('link', { name: DATA_NOTE_LINK_LABEL })).toBeNull()
  })
})

const EMPTY_IDENTITY = {
  full_name: '',
  date_of_birth: '',
  household_type: 'solo',
  number_of_children: 0,
  net_monthly_income: '',
  estimated_yearly_income: '',
  estimated_monthly_expenses: '',
} as unknown as IdentityData

describe('OnboardingIdentity — waarom vragen we dit (AC1)', () => {
  it('zegt op het naam-scherm waaróm, houdt de verplichting, en draagt de gegevensregel', () => {
    render(
      <OnboardingIdentity
        data={EMPTY_IDENTITY}
        onChange={vi.fn()}
        onNext={vi.fn()}
        field="naam"
      />,
    )

    const deck = screen.getByText(/Je naam gebruik ik om je aan te spreken/)
    // De waarom-zin komt erbij; de verplichting blijft staan (UAT L5).
    expect(deck.textContent).toMatch(/vrijheid in tijd/)
    expect(deck.textContent).toMatch(/hebben we nodig/)

    expect(screen.getByText(new RegExp(dataNoteFor('naam')))).toBeTruthy()
    expect(
      screen.getByRole('link', { name: DATA_NOTE_LINK_LABEL }).getAttribute('href'),
    ).toBe('/privacy')
  })

  it('draagt op het geboortedatum-scherm dezelfde belofte', () => {
    render(
      <OnboardingIdentity
        data={EMPTY_IDENTITY}
        onChange={vi.fn()}
        onNext={vi.fn()}
        field="dob"
      />,
    )
    expect(screen.getByText(new RegExp(dataNoteFor('geboortedatum')))).toBeTruthy()
  })
})
