import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { ExecutionModeState } from '@/lib/ai/local/use-execution-mode'

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// De uitvoerkeuze is de as waar deze suite om draait: hij bepaalt of er iets
// naar /api/pension/parse mag vertrekken. De zware kant (pdfjs, WebGPU) wordt
// gemockt — die is elders getest; hier gaat het om de BESTEMMING.

const executionState = { current: null as unknown as ExecutionModeState }
vi.mock('@/lib/ai/local/use-execution-mode', () => ({
  useExecutionMode: () => executionState.current,
}))

const extractPdfPageTexts = vi.fn<(f: File, o?: unknown) => Promise<string[]>>()
vi.mock('@/lib/pdf/extract-text', () => ({
  extractPdfPageTexts: (f: File, o?: unknown) => extractPdfPageTexts(f, o),
}))

const resolveLocal = vi.fn()
vi.mock('@/lib/ai/local/local-pension-resolver', () => ({
  createLocalPensionResolver: () => resolveLocal,
}))

const { PensionPdfUpload } = await import('./pension-pdf-upload')

function mode(overrides: Partial<ExecutionModeState>): ExecutionModeState {
  return {
    status: 'cloud',
    message: null,
    intended: 'cloud',
    canUseCloud: false,
    canUseLocal: false,
    refresh: () => {},
    ...overrides,
  }
}

function pdfFile(): File {
  return new File(['%PDF-1.7 nep'], 'upo.pdf', { type: 'application/pdf' })
}

/** Kies het bestand via de verborgen file-input (de dropzone is een klikvlak). */
function kiesBestand(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PensionPdfUpload — de uitvoerkeuze bepaalt de bestemming', () => {
  it('gaat in privé-modus NOOIT naar /api/pension/parse', async () => {
    executionState.current = mode({ status: 'lokaal', intended: 'lokaal', canUseLocal: true })
    extractPdfPageTexts.mockResolvedValue(['Pensioenuitvoerder ABP bruto 1.200,00 per maand'])
    resolveLocal.mockResolvedValue({
      ok: true,
      result: {
        aowBedrag: null,
        regelingen: [
          {
            fondsNaam: 'ABP',
            brutoBedrag: 1200,
            ingangLeeftijd: 68,
            isGeindexeerd: true,
            type: 'ouderdomspensioen',
          },
        ],
        nabestaandenpensioen: null,
        samenvatting: 'Op dit apparaat uitgelezen.',
      },
      onzeker: [[]],
      afgevallen: 0,
    })

    render(<PensionPdfUpload />)
    kiesBestand(pdfFile())

    await waitFor(() => expect(resolveLocal).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('past het resultaat niet toe zonder bevestiging in de reviewstap', async () => {
    const onParseResult = vi.fn()
    executionState.current = mode({ status: 'lokaal', intended: 'lokaal', canUseLocal: true })
    extractPdfPageTexts.mockResolvedValue(['tekst'])
    resolveLocal.mockResolvedValue({
      ok: true,
      result: {
        aowBedrag: null,
        regelingen: [
          {
            fondsNaam: 'ABP',
            brutoBedrag: 1200,
            ingangLeeftijd: 68,
            isGeindexeerd: true,
            type: 'ouderdomspensioen',
          },
        ],
        nabestaandenpensioen: null,
        samenvatting: 'Op dit apparaat uitgelezen.',
      },
      onzeker: [[]],
      afgevallen: 0,
    })

    render(<PensionPdfUpload onParseResult={onParseResult} />)
    kiesBestand(pdfFile())

    // Reviewstap zichtbaar, nog NIETS overgenomen.
    await waitFor(() => expect(screen.getByText(/Controleer wat we hebben gelezen/i)).toBeTruthy())
    expect(onParseResult).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Overnemen/i }))
    expect(onParseResult).toHaveBeenCalledTimes(1)
    expect(onParseResult.mock.calls[0][0]).toMatchObject({
      regelingen: [expect.objectContaining({ fondsNaam: 'ABP' })],
    })
  })

  it('meldt een PDF zonder tekstlaag eerlijk en valt niet terug op de cloud', async () => {
    executionState.current = mode({ status: 'lokaal', intended: 'lokaal', canUseLocal: true })
    extractPdfPageTexts.mockResolvedValue([''])
    resolveLocal.mockResolvedValue({
      ok: false,
      reden: 'geen-tekstlaag',
      message: 'Dit PDF-type kunnen we op dit apparaat niet lezen — er zit geen tekstlaag in.',
    })

    render(<PensionPdfUpload />)
    kiesBestand(pdfFile())

    await waitFor(() => expect(screen.getByText(/geen tekstlaag/i)).toBeTruthy())
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('verstuurt niets zolang de voorkeur nog wordt opgehaald (resolving)', async () => {
    executionState.current = mode({ status: 'resolving', intended: null })

    render(<PensionPdfUpload />)
    kiesBestand(pdfFile())

    await waitFor(() => expect(screen.getByText(/We controleren nog waar het uitlezen/i)).toBeTruthy())
    expect(global.fetch).not.toHaveBeenCalled()
    expect(extractPdfPageTexts).not.toHaveBeenCalled()
  })

  it('verstuurt niets wanneer lokaal gewenst is maar het toestel het niet kan (blocked)', async () => {
    executionState.current = mode({
      status: 'blocked',
      intended: 'lokaal',
      message: 'Dit toestel heeft geen WebGPU.',
    })

    render(<PensionPdfUpload />)
    kiesBestand(pdfFile())

    // getAllByText: de reden staat zowel in de inline-fout als in de
    // AVG-notice-variant voor 'blocked' — twee treffers is hier correct.
    await waitFor(() => expect(screen.getAllByText(/geen WebGPU/i).length).toBeGreaterThan(0))
    expect(global.fetch).not.toHaveBeenCalled()
    expect(extractPdfPageTexts).not.toHaveBeenCalled()
  })

  it('gebruikt de cloud-route ongewijzigd wanneer die gekozen is', async () => {
    executionState.current = mode({ status: 'cloud', intended: 'cloud', canUseCloud: true })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ aowBedrag: null, regelingen: [], nabestaandenpensioen: null, samenvatting: '' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PensionPdfUpload />)
    kiesBestand(pdfFile())

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/pension/parse')
    // De AVG-consent blijft aan het cloud-pad hangen (ADR 0035).
    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('consent')).toBe('pension_pdf_ai_v1')
    expect(resolveLocal).not.toHaveBeenCalled()
  })
})
