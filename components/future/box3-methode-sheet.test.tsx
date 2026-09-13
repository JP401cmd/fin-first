import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Box3MethodeSheet, BOX3_METHOD_INTRO, BOX3_METHOD_UITLEG } from './box3-methode-sheet'
import { BOX3_METHODS } from '@/lib/box3-method'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

/**
 * TPR-10 — `profiles.box3_method` krijgt een scherm. De sheet schrijft UITSLUITEND
 * via `PUT /api/parameters` (zod-enum aan de serverkant) met alleen dit veld in de
 * body; geen client-direct pad naar `profiles` (ADR 0058). De uitleg volgt de
 * eigenaarsnorm keuze · effect · waarom en blijft beschrijvend (Wft).
 */
const mockFetch = vi.fn()

function okResponse() {
  return { ok: true, status: 200, json: async () => ({ success: true, box3_method: 'werkelijk' }) } as unknown as Response
}
function errorResponse(status: number, body: unknown) {
  return { ok: false, status, json: async () => body } as unknown as Response
}

beforeEach(() => {
  mockRefresh.mockReset()
  mockFetch.mockReset()
  // Zoals de route: echoot wat er is weggeschreven (de body controleert dat bij het heffingvrije inkomen).
  mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => ({
    ...okResponse(),
    json: async () => ({ success: true, ...JSON.parse(String(init?.body ?? '{}')) }),
  }))
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function lastRequestBody(): Record<string, unknown> {
  const [, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit]
  return JSON.parse(String(init.body))
}

function optionButton(label: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${label}`) }) as HTMLButtonElement
}

describe('Box3MethodeSheet — render', () => {
  it('toont beide methoden, de huidige voorgeselecteerd', () => {
    render(<Box3MethodeSheet current="forfaitair" onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(optionButton('Forfaitair').getAttribute('aria-pressed')).toBe('true')
    expect(optionButton('Werkelijk rendement').getAttribute('aria-pressed')).toBe('false')
  })

  it('draagt de uitleg per methode én de intro (keuze · effect · waarom)', () => {
    render(<Box3MethodeSheet current="forfaitair" onClose={() => {}} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain(BOX3_METHOD_INTRO)
    for (const m of BOX3_METHODS) expect(text).toContain(BOX3_METHOD_UITLEG[m])
    // Norm: keuze, effect (in vrijheidstijd), waarom.
    expect(BOX3_METHOD_INTRO).toMatch(/Je kiest/)
    expect(BOX3_METHOD_INTRO).toMatch(/wanneer je vrij bent/)
    expect(BOX3_METHOD_INTRO).toMatch(/Relevant omdat/)
  })

  it('is beschrijvend, niet aansporend (Wft): geen aanbeveling in de teksten', () => {
    const alles = [BOX3_METHOD_INTRO, ...Object.values(BOX3_METHOD_UITLEG)].join(' ')
    expect(alles).not.toMatch(/aanbevolen|aangeraden|past bij jou|kies voor|beste keuze|slimmer/i)
  })

  it('Opslaan staat uit zolang er niets gewijzigd is', () => {
    render(<Box3MethodeSheet current="forfaitair" onClose={() => {}} />)
    const save = screen.getByRole('button', { name: /^Opslaan/ }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(optionButton('Werkelijk rendement'))
    expect(save.disabled).toBe(false)
  })
})

describe('Box3MethodeSheet — submit', () => {
  it('schrijft via PUT /api/parameters met ALLEEN box3_method, en ververst', async () => {
    const onClose = vi.fn()
    render(<Box3MethodeSheet current="forfaitair" onClose={onClose} />)
    fireEvent.click(optionButton('Werkelijk rendement'))
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/parameters')
    expect(init.method).toBe('PUT')
    expect(lastRequestBody()).toEqual({ box3_method: 'werkelijk' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('toont de platte envelope-tekst van de route en sluit niet', async () => {
    const onClose = vi.fn()
    render(<Box3MethodeSheet current="forfaitair" onClose={onClose} />)
    mockFetch.mockResolvedValueOnce(errorResponse(400, { error: 'Box 3-methode moet "forfaitair" of "werkelijk" zijn' }))
    fireEvent.click(optionButton('Werkelijk rendement'))
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan/ }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Box 3-methode moet'))
    expect(onClose).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('vangt een netwerkfout af met een client-veilige tekst', async () => {
    render(<Box3MethodeSheet current="forfaitair" onClose={() => {}} />)
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    fireEvent.click(optionButton('Werkelijk rendement'))
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan/ }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toMatch(/verbinding/i)
    expect(screen.getByRole('alert').textContent).not.toContain('Failed to fetch')
  })
})

describe('Box3MethodeSheet — heffingvrij inkomen (TPR-12)', () => {
  it('toont het veld alleen onder werkelijk rendement, met de kernel-default als placeholder', () => {
    render(<Box3MethodeSheet current="forfaitair" onClose={() => {}} />)
    expect(screen.queryByLabelText(/Heffingvrij inkomen in euro/)).toBeNull()
    fireEvent.click(optionButton('Werkelijk rendement'))
    const input = screen.getByLabelText(/Heffingvrij inkomen in euro/) as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('1800')
    expect(document.body.textContent).toMatch(/Je kiest welk deel van het werkelijke rendement/)
    expect(document.body.textContent).toMatch(/Geldt alleen onder werkelijk rendement/)
  })

  it('stuurt methode én bedrag samen in één PUT wanneer beide wijzigen', async () => {
    const onClose = vi.fn()
    render(<Box3MethodeSheet current="forfaitair" onClose={onClose} />)
    fireEvent.click(optionButton('Werkelijk rendement'))
    fireEvent.change(screen.getByLabelText(/Heffingvrij inkomen in euro/), { target: { value: '2500' } })
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(lastRequestBody()).toEqual({ box3_method: 'werkelijk', box3_heffingvrij_inkomen: 2500 })
  })

  it('alleen het bedrag wijzigen onder werkelijk → alleen dat veld in de body; leeg = null (default)', async () => {
    const onClose = vi.fn()
    render(<Box3MethodeSheet current="werkelijk" currentHeffingvrijInkomen={2500} onClose={onClose} />)
    const input = screen.getByLabelText(/Heffingvrij inkomen in euro/) as HTMLInputElement
    expect(input.value).toBe('2500')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(lastRequestBody()).toEqual({ box3_heffingvrij_inkomen: null })
  })

  it('echoot de route het bedrag niet (kolom ontbreekt nog), dan geen "opgeslagen": foutregel en de sheet blijft open', async () => {
    const onClose = vi.fn()
    mockFetch.mockResolvedValueOnce(okResponse())
    render(<Box3MethodeSheet current="werkelijk" currentHeffingvrijInkomen={2500} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/Heffingvrij inkomen in euro/), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: /^Opslaan/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Het heffingvrije inkomen kon niet worden opgeslagen')
    expect(onClose).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('weigert een bedrag buiten de band client-side (servernorm) zonder te schrijven', () => {
    render(<Box3MethodeSheet current="werkelijk" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Heffingvrij inkomen in euro/), { target: { value: '500000' } })
    const save = screen.getByRole('button', { name: /^Opslaan/ }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(document.body.textContent).toMatch(/Heffingvrij inkomen moet tussen/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('Box3MethodeSheet — sluiten', () => {
  it('Annuleer-knop roept onClose zonder te schrijven', () => {
    const onClose = vi.fn()
    render(<Box3MethodeSheet current="werkelijk" onClose={onClose} />)
    fireEvent.click(screen.getByText('Annuleer'))
    expect(onClose).toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
