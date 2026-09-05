import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import {
  OnboardingPensioen,
  INITIAL_PENSION_DRAFT,
  type PensionDraft,
} from './onboarding-pensioen'

// Mock PensionPdfUpload: één knop die een PensionParseResult via onParseResult
// teruggeeft — zo testen we het upload-pad zonder de echte file/fetch-flow.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('@/components/app/horizon/pension-pdf-upload', () => ({
  PensionPdfUpload: ({ onParseResult }: any) => (
    <button
      type="button"
      data-testid="pension-upload"
      onClick={() =>
        onParseResult({
          aowBedrag: null,
          regelingen: [
            { fondsNaam: 'ABP', brutoBedrag: 800, ingangLeeftijd: 67, isGeindexeerd: true, type: 'ouderdomspensioen' },
          ],
          nabestaandenpensioen: null,
          samenvatting: 'mock',
        })
      }
    >
      upload
    </button>
  ),
}))

afterEach(() => vi.clearAllMocks())

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const footerButton = (name: string | RegExp) =>
  screen.getAllByRole('button', { name })[0] as HTMLButtonElement
const footerText = (text: string | RegExp) => screen.getAllByText(text)[0]

function Host({
  onNext = vi.fn(),
  onSkip = vi.fn(),
  samenwonend = false,
  aowAge,
  onData,
}: {
  onNext?: () => void
  onSkip?: () => void
  samenwonend?: boolean
  aowAge?: number
  /** Spy op elke draft-update — voor asserts op de toegepaste schatting. */
  onData?: (data: PensionDraft) => void
}) {
  const [data, setData] = useState<PensionDraft>(INITIAL_PENSION_DRAFT)
  return (
    <OnboardingPensioen
      data={data}
      onChange={(next) => {
        setData(next)
        onData?.(next)
      }}
      samenwonend={samenwonend}
      aowAge={aowAge}
      onNext={onNext}
      onSkip={onSkip}
      onBack={vi.fn()}
    />
  )
}

describe('OnboardingPensioen', () => {
  it('stelt de pensioen-vraag met drie uitwegen', () => {
    const { container } = render(<Host />)
    expect(container.textContent).toContain('Heb je al')
    expect(screen.getByText('Schat het zelf')).toBeTruthy()
    expect(screen.getByText('Upload je overzicht')).toBeTruthy()
    expect(footerText(/Kan altijd later nog/)).toBeTruthy()
  })

  it('"Kan altijd later nog" roept onSkip aan', () => {
    const onSkip = vi.fn()
    render(<Host onSkip={onSkip} />)
    fireEvent.click(footerText(/Kan altijd later nog/))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('schatting-pad: invullen enabelt "Verder" en roept onNext aan', () => {
    const onNext = vi.fn()
    render(<Host onNext={onNext} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    const gross = screen.getByLabelText(/Geschat bruto pensioen per maand/i)
    // Voor invoer is Verder disabled.
    expect(footerButton('Verder').disabled).toBe(true)
    fireEvent.change(gross, { target: { value: '1500' } })
    expect(footerButton('Verder').disabled).toBe(false)
    fireEvent.click(footerButton('Verder'))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('upload-pad: een parse-resultaat enabelt "Verder"', () => {
    render(<Host />)
    fireEvent.click(screen.getByText('Upload je overzicht'))
    expect(footerButton('Verder').disabled).toBe(true)
    fireEvent.click(screen.getByTestId('pension-upload'))
    expect(footerButton('Verder').disabled).toBe(false)
  })

  // ── Inschat-hulp (salaris × NL-opbouw × jaren) ─────────────────────────

  it('inschat-hulp: salaris + jaren → "Neem over" vult bedrag én zet ingangsleeftijd op de AOW-leeftijd', () => {
    const updates: PensionDraft[] = []
    render(<Host aowAge={68} onData={(d) => updates.push(d)} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    fireEvent.click(screen.getByText(/Help me schatten/))

    fireEvent.change(screen.getByLabelText(/Bruto jaarsalaris/i), {
      target: { value: '50000' },
    })
    fireEvent.change(screen.getByLabelText(/Jaren pensioenopbouw/i), {
      target: { value: '15' },
    })

    // Indicatie verschijnt met de geformuleerde AOW-leeftijd in de zin
    // (default-label "68 jaar" — display-drift-lock: nooit een kale ceil).
    expect(screen.getByText(/vanaf je AOW-leeftijd \(68 jaar\)/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Neem over' }))
    const last = updates[updates.length - 1]
    // Zelfde canonieke helper als de component gebruikt (lib/jaarruimte):
    // €50.000, 15 jaar → > 0 en gelijk aan het draft-bedrag.
    expect(Number(last.grossMonthly)).toBeGreaterThan(0)
    expect(last.startAge).toBe('68')
    // "Verder" is nu enabled — de schatting telt als ingevulde waarde.
    expect(footerButton('Verder').disabled).toBe(false)
  })

  it('inschat-hulp: salaris onder de AOW-franchise toont de €0-uitleg zonder overneem-knop', () => {
    render(<Host />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    fireEvent.click(screen.getByText(/Help me schatten/))

    fireEvent.change(screen.getByLabelText(/Bruto jaarsalaris/i), {
      target: { value: '15000' },
    })
    fireEvent.change(screen.getByLabelText(/Jaren pensioenopbouw/i), {
      target: { value: '10' },
    })

    expect(screen.getByText(/onder de drempel waar de AOW/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Neem over' })).toBeNull()
  })

  it('inschat-hulp: de uitlegtekst bevat geen onverklaard fiscaal jargon (UR3-12)', () => {
    render(<Host />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    fireEvent.click(screen.getByText(/Help me schatten/))

    const hint = screen.getByText(/Jaren in loondienst waarin je pensioen opbouwde/)
    expect(hint.textContent).not.toMatch(/middelloon/i)
    expect(hint.textContent).not.toMatch(/AOW-franchise/i)
    expect(hint.textContent).not.toMatch(/fiscale maximum/i)
  })

  it('leeftijdsveld: placeholder en hint volgen de aangeleverde AOW-leeftijd', () => {
    render(<Host aowAge={68} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    const age = screen.getByLabelText(/Verwachte ingangsleeftijd/i) as HTMLInputElement
    expect(age.placeholder).toBe('68')
    expect(screen.getByText(/Leeg laten = je AOW-leeftijd \(68 jaar\)/)).toBeTruthy()
  })

  it('leeftijdsveld: een expliciet aowAgeLabel ("67 jaar en 3 maanden") wint van de default', () => {
    render(
      <OnboardingPensioen
        data={{ ...INITIAL_PENSION_DRAFT, mode: 'estimate' }}
        onChange={vi.fn()}
        samenwonend={false}
        aowAge={68}
        aowAgeLabel="67 jaar en 3 maanden"
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    // Functionele waarde (ceil, 68) blijft de placeholder; de lopende tekst
    // toont de exacte SVB-formulering.
    const age = screen.getByLabelText(/Verwachte ingangsleeftijd/i) as HTMLInputElement
    expect(age.placeholder).toBe('68')
    expect(
      screen.getByText(/Leeg laten = je AOW-leeftijd \(67 jaar en 3 maanden\)/),
    ).toBeTruthy()
  })
})
