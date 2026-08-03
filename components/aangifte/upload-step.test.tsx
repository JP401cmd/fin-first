// ── UploadStep: fail-closed bij 'lokaal' ─────────────────────────────────────
//
// De harde regel van het hele privé-modus-ontwerp: staat 'documenten' op lokaal
// en kan het toestel dat niet (model niet gedownload, geen WebGPU) of weten we
// het nog niet ('resolving'), dan vertrekt er NIETS. Niet naar de GPU, en al
// helemaal niet "even via de cloud". Deze suite pint dat gedrag vast op de plek
// waar het misgaat als iemand ooit een `=== 'lokaal'`-vergelijking terugzet.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ExecutionModeState } from '@/lib/ai/local/use-execution-mode'

const execState = vi.fn<() => ExecutionModeState>()
const modelState = vi.fn<() => Promise<{ state: string; bytes: number | null }>>()
const extractLocal = vi.fn()

vi.mock('@/lib/ai/local/use-execution-mode', () => ({
  useExecutionMode: () => execState(),
}))
vi.mock('@/lib/ai/local/model-manager', () => ({
  getLocalModelState: () => modelState(),
}))
vi.mock('@/lib/aangifte/local/extract-aangifte-local', () => ({
  extractAangifteDataLocal: (...args: unknown[]) => extractLocal(...args),
}))
// pdfjs raakt in deze suite nooit aan bod (de gate zit ervóór), maar de import
// moet wel resolven in jsdom.
vi.mock('@/lib/pdf/extract-text', () => ({
  extractPdfPageTexts: vi.fn(async () => ['Aangifte inkomstenbelasting 2024']),
}))

import { UploadStep } from './upload-step'

function mode(partial: Partial<ExecutionModeState>): ExecutionModeState {
  return {
    status: 'resolving',
    message: null,
    intended: null,
    canUseCloud: false,
    canUseLocal: false,
    refresh: vi.fn(),
    ...partial,
  }
}

function dropPdf() {
  const zone = screen.getByLabelText('PDF uploaden of slepen')
  const file = new File(['%PDF-1.4'], 'aangifte.pdf', { type: 'application/pdf' })
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
}

function renderStep() {
  render(
    <UploadStep
      fallbackTaxYear={2024}
      onExtracted={vi.fn()}
      onSwitchToManual={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

beforeEach(() => {
  execState.mockReset()
  modelState.mockReset()
  extractLocal.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

describe('UploadStep — fail-closed', () => {
  it("stuurt NIETS naar de cloud zolang de voorkeur nog wordt bepaald ('resolving')", async () => {
    execState.mockReturnValue(mode({ status: 'resolving' }))
    renderStep()
    dropPdf()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(fetch).not.toHaveBeenCalled()
    expect(extractLocal).not.toHaveBeenCalled()
  })

  it("stuurt NIETS naar de cloud wanneer lokaal is gekozen maar het model ontbreekt", async () => {
    execState.mockReturnValue(
      mode({ status: 'lokaal', intended: 'lokaal', canUseLocal: true }),
    )
    modelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    renderStep()
    await waitFor(() => expect(modelState).toHaveBeenCalled())
    dropPdf()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(fetch).not.toHaveBeenCalled()
    expect(extractLocal).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('lokale model')
  })

  it("stuurt NIETS wanneer het toestel lokaal niet aankan ('blocked')", async () => {
    execState.mockReturnValue(
      mode({ status: 'blocked', intended: 'lokaal', message: 'Dit toestel heeft geen WebGPU.' }),
    )
    renderStep()
    dropPdf()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(fetch).not.toHaveBeenCalled()
    expect(extractLocal).not.toHaveBeenCalled()
  })

  it('leest ON-DEVICE uit wanneer lokaal is gekozen én het model klaarstaat', async () => {
    execState.mockReturnValue(mode({ status: 'lokaal', intended: 'lokaal', canUseLocal: true }))
    modelState.mockResolvedValue({ state: 'klaar', bytes: null })
    extractLocal.mockResolvedValue({
      assets: [],
      debts: [],
      box1_components: [],
      peildatum: '2024-01-01',
      tax_year: 2024,
    })
    renderStep()
    await waitFor(() => expect(modelState).toHaveBeenCalled())
    dropPdf()
    await waitFor(() => expect(extractLocal).toHaveBeenCalled())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('gebruikt de cloud-route wanneer de gebruiker daarvoor koos', async () => {
    execState.mockReturnValue(mode({ status: 'cloud', intended: 'cloud', canUseCloud: true }))
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ assets: [], debts: [], box1_components: [], peildatum: '2024-01-01', tax_year: 2024 }),
    })
    renderStep()
    dropPdf()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(extractLocal).not.toHaveBeenCalled()
  })
})
