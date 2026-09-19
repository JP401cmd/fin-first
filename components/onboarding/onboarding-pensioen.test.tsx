import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import {
  OnboardingPensioen,
  INITIAL_PENSION_DRAFT,
  type PensionDraft,
} from './onboarding-pensioen'
import {
  estimateAccruedPensionFromNet,
  estimateAccruedPensionMonthly,
  roundToEstimateStep,
} from '@/lib/jaarruimte'
import { grossFromNet } from '@/lib/box1-tax'
import {
  ESTIMATE_ROUNDING_STEP,
  NL_AOW_MONTHLY,
  NL_AOW_MONTHLY_SAMENWONEND,
  NL_PENSIOENOPBOUW_STARTLEEFTIJD,
} from '@/lib/constants'
import { formatCurrency } from '@/lib/format'

// Mock PensionPdfUpload: één knop die een PensionParseResult via onParseResult
// teruggeeft — zo testen we het upload-pad zonder de echte file/fetch-flow.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('@/components/app/horizon/pension-pdf-upload', () => ({
  PensionPdfUpload: ({ onParseResult, context }: any) => (
    <button
      type="button"
      data-testid="pension-upload"
      data-context={context}
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

/** Intl zet een harde spatie tussen € en het getal; vergelijk op gewone spaties. */
const norm = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ')

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const footerButton = (name: string | RegExp) =>
  screen.getAllByRole('button', { name })[0] as HTMLButtonElement
const footerText = (text: string | RegExp) => screen.getAllByText(text)[0]

function Host({
  onNext = vi.fn(),
  onSkip = vi.fn(),
  samenwonend = false,
  aowAge,
  age,
  netMonthlyIncome,
  incomeIsEstimate,
  onData,
}: {
  onNext?: () => void
  onSkip?: () => void
  samenwonend?: boolean
  aowAge?: number
  age?: number | null
  netMonthlyIncome?: number
  incomeIsEstimate?: boolean
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
      age={age}
      netMonthlyIncome={netMonthlyIncome}
      incomeIsEstimate={incomeIsEstimate}
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

  it('upload-pad: geen PDF/AI in de onboarding — XML/JSON-copy en de upload in onboarding-context (V-002)', () => {
    const { container } = render(<Host />)
    expect(screen.getByText('XML of JSON van mijnpensioen.nl')).toBeTruthy()
    fireEvent.click(screen.getByText('Upload je overzicht'))
    expect(screen.getByTestId('pension-upload').getAttribute('data-context')).toBe('onboarding')
    expect(container.textContent).not.toMatch(/PDF of JSON/)
    // Geen link die de onboarding verlaat.
    expect(container.querySelector('a[href^="/mijn"]')).toBeNull()
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
    // €50.000, 15 jaar → 723 → op de schattingsstap €725 in het draft-bedrag.
    expect(Number(last.grossMonthly)).toBe(
      roundToEstimateStep(estimateAccruedPensionMonthly(50_000, 15)),
    )
    expect(Number(last.grossMonthly) % ESTIMATE_ROUNDING_STEP).toBe(0)
    expect(last.startAge).toBe('68')
    expect(last.isEstimate).toBe(true)
    // "Verder" is nu enabled — de schatting telt als ingevulde waarde.
    expect(footerButton('Verder').disabled).toBe(false)
  })

  // ── "Schat het voor me" (B-055): leeftijd + netto inkomen → vóórvulling ───

  it('"Schat het voor me" verschijnt alleen wanneer leeftijd én netto inkomen bekend zijn', () => {
    const { unmount } = render(<Host age={40} netMonthlyIncome={3000} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    expect(screen.getByRole('button', { name: /Schat het voor me/ })).toBeTruthy()
    expect(screen.queryByText(/Help me schatten/)).toBeNull()
    unmount()

    // Zonder geboortedatum: geen knop, wel de bescheiden link (geen verzonnen bedrag).
    const zonderLeeftijd = render(<Host age={null} netMonthlyIncome={3000} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    expect(screen.queryByRole('button', { name: /Schat het voor me/ })).toBeNull()
    expect(screen.getByText(/Help me schatten/)).toBeTruthy()
    zonderLeeftijd.unmount()

    // Zonder inkomen ("Later invullen"): idem.
    render(<Host age={40} netMonthlyIncome={0} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    expect(screen.queryByRole('button', { name: /Schat het voor me/ })).toBeNull()
  })

  it('"Schat het voor me" vult bruto jaarsalaris en jaren zichtbaar en bewerkbaar vóór, uit de canonieke compositie', () => {
    const { container } = render(<Host age={40} netMonthlyIncome={3000} aowAge={67} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    fireEvent.click(screen.getByRole('button', { name: /Schat het voor me/ }))

    const verwacht = estimateAccruedPensionFromNet({ netMonthly: 3000, age: 40 })
    const salary = screen.getByLabelText(/Bruto jaarsalaris/i) as HTMLInputElement
    const years = screen.getByLabelText(/Jaren pensioenopbouw/i) as HTMLInputElement
    // Bruto via grossFromNet — géén marginaal-tarief-benadering.
    expect(Number(salary.value)).toBe(grossFromNet(36_000, 2026))
    expect(Number(years.value)).toBe(40 - NL_PENSIOENOPBOUW_STARTLEEFTIJD)
    // De aanname over de loopbaanstart staat er in gewone taal bij.
    expect(screen.getByText(new RegExp(`vanaf je ${NL_PENSIOENOPBOUW_STARTLEEFTIJD}e`))).toBeTruthy()
    // Zelfde bedrag als de pure helper.
    expect(verwacht.monthly).toBeGreaterThan(0)
    expect(norm(container.textContent)).toContain(norm(formatCurrency(verwacht.monthly)))

    // Bewerkbaar: jaren overtypen verandert de uitkomst en haalt de voorvul-regel weg.
    fireEvent.change(years, { target: { value: '5' } })
    expect(screen.queryByText(/Voorgevuld:/)).toBeNull()
    expect(norm(container.textContent)).not.toContain(norm(formatCurrency(verwacht.monthly)))
  })

  it('de uitkomst zegt expliciet dat dit niet de AOW is, met het SVB-bedrag als contrast — en noemt de AOW niet in de bedragzin', () => {
    const { container } = render(<Host age={40} netMonthlyIncome={3000} aowAge={67} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    fireEvent.click(screen.getByRole('button', { name: /Schat het voor me/ }))

    expect(screen.getByText('Dit is niet je AOW.')).toBeTruthy()
    // De bedragzin zelf gaat over werkgeverspensioen en noemt de AOW niet.
    const bedragzin = screen.getByText(/bruto per maand aan werkgeverspensioen/)
    expect(bedragzin.textContent).not.toMatch(/AOW/)
    // Het SVB-bedrag voor een alleenstaande (lib/constants.ts, nooit lokaal).
    expect(norm(container.textContent)).toContain(norm(formatCurrency(NL_AOW_MONTHLY)))
    expect(norm(container.textContent)).not.toContain(norm(formatCurrency(NL_AOW_MONTHLY_SAMENWONEND)))
    expect(screen.getByText(/vanaf je AOW-leeftijd \(67 jaar\) bovenop/)).toBeTruthy()
    // Geen imperatief / productverwijzing (Wft): de tekst noemt de bron, niet een actie.
    expect(screen.getByText(/mijnpensioen\.nl-overzicht is de enige harde bron/)).toBeTruthy()
  })

  it('samenwonend: het AOW-contrast gebruikt het SVB-bedrag per persoon', () => {
    const { container } = render(<Host age={40} netMonthlyIncome={3000} samenwonend />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    fireEvent.click(screen.getByRole('button', { name: /Schat het voor me/ }))
    expect(norm(container.textContent)).toContain(norm(formatCurrency(NL_AOW_MONTHLY_SAMENWONEND)))
    expect(norm(container.textContent)).toContain('per persoon, samenwonend')
  })

  it('"Neem over" na "Schat het voor me" zet "(schatting)" op het bedragveld; overtypen haalt het weg (UR3-05 crit. 3)', () => {
    const updates: PensionDraft[] = []
    render(<Host age={40} netMonthlyIncome={3000} aowAge={67} onData={(d) => updates.push(d)} />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    fireEvent.click(screen.getByRole('button', { name: /Schat het voor me/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Neem over' }))

    const verwacht = estimateAccruedPensionFromNet({ netMonthly: 3000, age: 40 })
    expect(Number(updates[updates.length - 1].grossMonthly)).toBe(verwacht.monthly)
    expect(updates[updates.length - 1].isEstimate).toBe(true)
    expect(screen.getByText('(schatting)')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Geschat bruto pensioen per maand/i), {
      target: { value: '900' },
    })
    expect(updates[updates.length - 1].isEstimate).toBe(false)
    expect(screen.queryByText('(schatting)')).toBeNull()
    expect(screen.getByText('(huidige waarde)')).toBeTruthy()
  })

  it('een geschat inkomen maakt de hint "(geschatte)" — schatting op schatting wordt benoemd', () => {
    render(<Host age={40} netMonthlyIncome={3075} incomeIsEstimate />)
    fireEvent.click(screen.getByText('Schat het zelf'))
    expect(screen.getByText(/het \(geschatte\) netto/)).toBeTruthy()
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
