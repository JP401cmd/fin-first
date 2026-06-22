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
}: {
  onNext?: () => void
  onSkip?: () => void
  samenwonend?: boolean
}) {
  const [data, setData] = useState<PensionDraft>(INITIAL_PENSION_DRAFT)
  return (
    <OnboardingPensioen
      data={data}
      onChange={setData}
      samenwonend={samenwonend}
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
})
