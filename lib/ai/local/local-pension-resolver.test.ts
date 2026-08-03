import { describe, it, expect, vi, beforeEach } from 'vitest'

// De runtime wordt gemockt: deze suite bewijst het GEDRAG rond de generatie
// (wanneer er wél en vooral wanneer er NIET een modelaanroep vertrekt), niet de
// WebGPU-inferentie zelf.
const generate = vi.fn<(messages: unknown, maxNewTokens: number) => Promise<string>>()
const loadModelSession = vi.fn(async () => ({ generate }))
const disposeSession = vi.fn(async () => {})

vi.mock('./litert-runtime', () => ({
  loadModelSession: (...args: unknown[]) => loadModelSession(...(args as [])),
  disposeSession: () => disposeSession(),
}))

const { createLocalPensionResolver, GEEN_TEKSTLAAG_MELDING } = await import('./local-pension-resolver')

/** Een pagina met genoeg tekst om de tekstlaag-drempel te halen. */
function pagina(inhoud: string): string {
  return `${inhoud} ${'Uw opgebouwde pensioenaanspraken per peildatum met toelichting. '.repeat(4)}`
}

const ABP_ANTWOORD = JSON.stringify({
  fondsNaam: 'ABP',
  bedrag: '1.200,00',
  periode: 'maand',
  ingangLeeftijd: 68,
  geindexeerd: true,
  type: 'ouderdomspensioen',
})

beforeEach(() => {
  vi.clearAllMocks()
  generate.mockResolvedValue(ABP_ANTWOORD)
})

describe('lege tekstlaag → eerlijke melding, ZONDER modelaanroep', () => {
  it('stopt bij een PDF zonder tekstlaag', async () => {
    const resolve = createLocalPensionResolver()
    const uitkomst = await resolve([])

    expect(uitkomst).toEqual({ ok: false, reden: 'geen-tekstlaag', message: GEEN_TEKSTLAAG_MELDING })
    // DE KERN: een gescande UPO kost geen minutenlange decode om alsnog niets
    // te kunnen zeggen — en er vertrekt al helemaal niets naar de cloud.
    expect(loadModelSession).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('stopt ook bij een handvol tekens watermerkruis', async () => {
    const resolve = createLocalPensionResolver()
    const uitkomst = await resolve(['UPO', '2026', ' '])

    expect(uitkomst.ok).toBe(false)
    if (uitkomst.ok) return
    expect(uitkomst.reden).toBe('geen-tekstlaag')
    expect(generate).not.toHaveBeenCalled()
  })

  it('noemt de JSON-export als concrete uitweg', () => {
    expect(GEEN_TEKSTLAAG_MELDING).toContain('geen tekstlaag')
    expect(GEEN_TEKSTLAAG_MELDING).toContain('JSON-export van mijnpensioen.nl')
  })
})

describe('gelukkig pad — het model levert labels, de code levert getallen', () => {
  it('levert een schema-gevalideerd resultaat met de onzekerheid per regeling', async () => {
    const resolve = createLocalPensionResolver()
    const uitkomst = await resolve([pagina('Pensioenuitvoerder ABP bruto 1.200,00 per maand')])

    expect(uitkomst.ok).toBe(true)
    if (!uitkomst.ok) return
    expect(uitkomst.result.regelingen).toHaveLength(1)
    expect(uitkomst.result.regelingen[0]).toMatchObject({
      fondsNaam: 'ABP',
      brutoBedrag: 1200,
      ingangLeeftijd: 68,
      type: 'ouderdomspensioen',
    })
    expect(uitkomst.onzeker).toEqual([[]])
    // De samenvatting is in TS geschreven, niet gegenereerd — geen zwevende cijfers.
    expect(uitkomst.result.samenvatting).toContain('Op dit apparaat uitgelezen')
  })

  it('rekent jaar→maand deterministisch, ook als het model een jaarbedrag teruggeeft', async () => {
    generate.mockResolvedValue(
      JSON.stringify({
        fondsNaam: 'ABP',
        bedrag: '14.400,00',
        periode: 'jaar',
        ingangLeeftijd: 68,
        geindexeerd: false,
        type: 'ouderdomspensioen',
      }),
    )
    const resolve = createLocalPensionResolver()
    const uitkomst = await resolve([pagina('Pensioenuitvoerder ABP bruto 14.400,00 per jaar')])

    expect(uitkomst.ok).toBe(true)
    if (!uitkomst.ok) return
    // 14.400 / 12 = 1.200 — door de code, niet door het model.
    expect(uitkomst.result.regelingen[0].brutoBedrag).toBe(1200)
  })

  it('haalt de AOW uit de regelingen zodat die niet dubbel telt', async () => {
    generate.mockResolvedValue(
      JSON.stringify({
        fondsNaam: 'AOW',
        bedrag: '1.500,00',
        periode: 'maand',
        ingangLeeftijd: 67,
        geindexeerd: true,
        type: 'ouderdomspensioen',
      }),
    )
    const resolve = createLocalPensionResolver()
    const uitkomst = await resolve([pagina('Pensioenuitvoerder AOW bruto 1.500,00 per maand')])

    expect(uitkomst.ok).toBe(true)
    if (!uitkomst.ok) return
    expect(uitkomst.result.aowBedrag).toBe(1500)
    expect(uitkomst.result.regelingen).toHaveLength(0)
  })

  it('telt een blok met een onwaarschijnlijk bedrag als afgevallen i.p.v. het over te nemen', async () => {
    generate.mockResolvedValue(
      JSON.stringify({
        fondsNaam: 'ABP',
        bedrag: '1234567',
        periode: 'maand',
        ingangLeeftijd: 68,
        geindexeerd: false,
        type: 'ouderdomspensioen',
      }),
    )
    const resolve = createLocalPensionResolver()
    const uitkomst = await resolve([pagina('Pensioenuitvoerder ABP')])

    expect(uitkomst.ok).toBe(false)
    if (uitkomst.ok) return
    expect(uitkomst.reden).toBe('geen-regelingen')
  })

  it('markeert een onbetrouwbare leeftijd als minder zeker i.p.v. die stil over te nemen', async () => {
    generate.mockResolvedValue(
      JSON.stringify({
        fondsNaam: 'ABP',
        bedrag: '1.200,00',
        periode: 'maand',
        ingangLeeftijd: 2026,
        geindexeerd: true,
        type: 'ouderdomspensioen',
      }),
    )
    const resolve = createLocalPensionResolver()
    const uitkomst = await resolve([pagina('Pensioenuitvoerder ABP')])

    expect(uitkomst.ok).toBe(true)
    if (!uitkomst.ok) return
    expect(uitkomst.onzeker[0]).toContain('ingangLeeftijd')
  })
})

describe('fail-closed: geen stille terugval', () => {
  it('probeert na een inferentiefout één keer opnieuw en werpt daarna', async () => {
    generate.mockRejectedValue(new Error('device lost'))
    const resolve = createLocalPensionResolver()

    await expect(resolve([pagina('Pensioenuitvoerder ABP')])).rejects.toThrow('device lost')
    // Sessieherstel + precies één retry — daarna eerlijk falen.
    expect(disposeSession).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('geeft geen resultaat wanneer het model alleen onbruikbare tekst levert', async () => {
    generate.mockResolvedValue('Ik kan dit niet lezen, sorry.')
    const resolve = createLocalPensionResolver()
    const uitkomst = await resolve([pagina('Pensioenuitvoerder ABP')])

    expect(uitkomst.ok).toBe(false)
    if (uitkomst.ok) return
    expect(uitkomst.reden).toBe('geen-regelingen')
  })
})
