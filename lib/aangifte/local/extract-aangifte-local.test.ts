// ── Lokale aangifte-extractie: oogst per venster + de nul-token-uitgang ──────
//
// De runtime wordt gemockt: deze suite toetst de LOGICA rond het model (snijden,
// gronden, opschonen, mergen), niet de inferentie zelf. De belangrijkste
// assertie is dat een document zonder aangifte-kopteksten NUL modelaanroepen
// kost — dat is de reden dat het lokale pad haalbaar is.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// `vi.hoisted` omdat de mock-factory naar de top van het bestand wordt gehesen:
// zonder dit staan de spies er nog niet als de factory draait.
const { generate, disposeSession } = vi.hoisted(() => ({
  generate: vi.fn<(...args: unknown[]) => Promise<string>>(),
  disposeSession: vi.fn(async () => {}),
}))

vi.mock('@/lib/ai/local/litert-runtime', () => ({
  loadModelSession: vi.fn(async () => ({ generate })),
  disposeSession,
}))

import {
  extractAangifteDataLocal,
  harvestWindow,
  mergeHarvests,
  detectRepaymentType,
  detectInterestRate,
  type WindowHarvest,
} from './extract-aangifte-local'
import type { AangifteSectionWindow } from './section-select'

const ASSET_WINDOW: AangifteSectionWindow = {
  kind: 'assets',
  heading: 'Bank- en spaartegoeden',
  page: 1,
  text: `Bank- en spaartegoeden          Waarde 01-01-2024
ING Bank betaalrekening         €     3.450
ASN Bank spaarrekening          €    18.200`,
}

const DEBT_WINDOW: AangifteSectionWindow = {
  kind: 'debts',
  heading: 'Eigenwoningschuld',
  page: 1,
  text: `Eigenwoningschuld saldo 01-01-2024  € 245.000
Aflossingsvorm                       Annuïteit
Rentepercentage                      3,8%`,
}

const BOX1_WINDOW: AangifteSectionWindow = {
  kind: 'box1',
  heading: 'Inkomen uit werk en woning',
  page: 2,
  text: `Inkomen uit werk en woning
Bruto loon werkgever                 € 65.000
AOW-uitkering                        € 16.450`,
}

beforeEach(() => {
  generate.mockReset()
  disposeSession.mockClear()
})

describe('harvestWindow — bedrag-grounding', () => {
  it('neemt een rij over waarvan het bedrag letterlijk in het venster staat', () => {
    const out = harvestWindow(
      ASSET_WINDOW,
      '[{"label":"ASN Bank spaarrekening","type":"savings","bedrag":"18.200"}]',
    )
    expect(out.assets).toHaveLength(1)
    expect(out.assets[0]).toMatchObject({
      name: 'ASN Bank spaarrekening',
      asset_type: 'savings',
      current_value: 18200,
    })
    expect(out.rejected).toBe(0)
  })

  it('VERWERPT een rij waarvan het bedrag NIET in het bronvenster staat', () => {
    const out = harvestWindow(
      ASSET_WINDOW,
      '[{"label":"ASN Bank spaarrekening","type":"savings","bedrag":"1.820"}]',
    )
    expect(out.assets).toEqual([])
    expect(out.rejected).toBe(1)
  })

  it('corrigeert niet naar het dichtstbijzijnde bedrag — het verwerpt', () => {
    const out = harvestWindow(ASSET_WINDOW, '[{"label":"Spaarrekening","type":"savings","bedrag":"18.201"}]')
    expect(out.assets).toEqual([])
  })

  it('verwerpt een bedrag dat wél in de tekst staat maar buiten het bereik valt', () => {
    // "2024" staat letterlijk in het venster (peildatum) maar is geen saldo …
    const out = harvestWindow(ASSET_WINDOW, '[{"label":"Spaarrekening","type":"savings","bedrag":"1"}]')
    expect(out.assets).toEqual([])
    expect(out.rejected).toBe(1)
  })

  it('hardt een onbekend type naar "other" in plaats van de rij te droppen', () => {
    const out = harvestWindow(ASSET_WINDOW, '[{"label":"ING Bank betaalrekening","type":"spaarpot","bedrag":"3.450"}]')
    expect(out.assets[0]!.asset_type).toBe('other')
  })

  it('houdt een IBAN uit het naamveld', () => {
    const out = harvestWindow(
      ASSET_WINDOW,
      '[{"label":"ING Bank betaalrekening NL91ABNA0417164300","type":"cash","bedrag":"3.450"}]',
    )
    expect(out.assets[0]!.name).toBe('ING Bank betaalrekening')
  })

  it('valt terug op een generiek label als de naam onbruikbaar wordt', () => {
    const out = harvestWindow(ASSET_WINDOW, '[{"label":"123456789","type":"savings","bedrag":"18.200"}]')
    expect(out.assets[0]!.name).toBe('Spaarrekening')
  })

  it('leest aflossingsvorm en rente DETERMINISTISCH uit het venster', () => {
    const out = harvestWindow(DEBT_WINDOW, '[{"label":"Hypotheek","type":"mortgage","bedrag":"245.000"}]')
    expect(out.debts[0]).toMatchObject({
      debt_type: 'mortgage',
      current_balance: 245000,
      repayment_type: 'annuiteit',
      interest_rate: 3.8,
      is_tax_deductible: true,
    })
  })

  it('zet eigen_huis zijn WOZ-waarde gelijk aan de waarde op peildatum', () => {
    const win: AangifteSectionWindow = {
      kind: 'assets',
      heading: 'Eigen woning',
      page: 1,
      text: 'Eigen woning\nWOZ-waarde hoofdverblijf € 425.000',
    }
    const out = harvestWindow(win, '[{"label":"Eigen woning","type":"eigen_huis","bedrag":"425.000"}]')
    expect(out.assets[0]).toMatchObject({ current_value: 425000, woz_value: 425000 })
  })

  it('splitst Box 1 in aparte inkomensbronnen en weigert een onbekende soort', () => {
    const out = harvestWindow(
      BOX1_WINDOW,
      '[{"label":"Bruto loon werkgever","type":"loon","bedrag":"65.000"},' +
        '{"label":"AOW-uitkering","type":"aow","bedrag":"16.450"},' +
        '{"label":"Arbeidskorting","type":"korting","bedrag":"65.000"}]',
    )
    expect(out.box1_components.map((c) => c.kind)).toEqual(['loon', 'aow'])
    expect(out.rejected).toBe(1)
  })

  it('overleeft markdown-fences en een <think>-preamble (parse.ts doet dat werk)', () => {
    const out = harvestWindow(
      ASSET_WINDOW,
      '<think>even kijken</think>\n```json\n[{"label":"ASN Bank spaarrekening","type":"savings","bedrag":"18.200"}]\n```',
    )
    expect(out.assets).toHaveLength(1)
  })
})

describe('detectRepaymentType / detectInterestRate', () => {
  it('herkent de drie aflossingsvormen', () => {
    expect(detectRepaymentType('Aflossingsvorm Annuïteit')).toBe('annuiteit')
    expect(detectRepaymentType('Aflossingsvorm Lineair')).toBe('lineair')
    expect(detectRepaymentType('Aflossingsvrij')).toBe('aflossingsvrij')
    expect(detectRepaymentType('Geen vermelding')).toBeNull()
  })

  it('leest de rente alleen als die er letterlijk staat', () => {
    expect(detectInterestRate('Rentepercentage 3,8%')).toBe(3.8)
    expect(detectInterestRate('Geen rente vermeld')).toBeNull()
  })

  it('weigert een percentage buiten bereik', () => {
    expect(detectInterestRate('Dekking 70%')).toBeNull()
  })
})

describe('mergeHarvests', () => {
  it('dedupliceert dezelfde rij uit twee overlappende vensters', () => {
    const h: WindowHarvest = {
      assets: [{ name: 'Eigen woning', asset_type: 'eigen_huis', current_value: 425000, subtype: null, woz_value: 425000 }],
      debts: [],
      box1_components: [],
      rejected: 0,
    }
    const merged = mergeHarvests([h, structuredClone(h)])
    expect(merged.assets).toHaveLength(1)
  })
})

describe('extractAangifteDataLocal — de nul-token-uitgang', () => {
  it('geeft bij GEEN aangifte-kopteksten een leeg resultaat ZONDER modelaanroep', async () => {
    const result = await extractAangifteDataLocal(
      ['Jaaropgaaf 2024 — Werkgever ACME B.V.\nLoon SV € 65.000\nLoonheffing € 18.250'],
      2023,
    )
    expect(generate).not.toHaveBeenCalled()
    expect(result.assets).toEqual([])
    expect(result.debts).toEqual([])
    expect(result.box1_components).toEqual([])
    // "Jaaropgaaf 2024" is bewust GEEN jaar-patroon: alleen een aangifte-titel,
    // een "Belastingjaar"-regel of een peildatum telt. Een jaaropgaaf mag het
    // aangiftejaar dus niet stiekem overschrijven — de jaarkiezer wint.
    expect(result.tax_year).toBe(2023)
    expect(result.peildatum).toBe('2023-01-01')
  })

  it('valt terug op de jaarkiezer als de tekst geen jaar noemt', async () => {
    const result = await extractAangifteDataLocal(['een lege bladzijde'], 2021)
    expect(generate).not.toHaveBeenCalled()
    expect(result.tax_year).toBe(2021)
  })

  it('roept het model één keer per venster aan en levert een geldig resultaat', async () => {
    generate
      .mockResolvedValueOnce('[{"label":"ASN Bank spaarrekening","type":"savings","bedrag":"18.200"}]')
      .mockResolvedValueOnce('[{"label":"Studieschuld DUO","type":"student_loan","bedrag":"8.300"}]')

    const result = await extractAangifteDataLocal(
      [
        `Aangifte inkomstenbelasting 2024
Bank- en spaartegoeden
ASN Bank spaarrekening € 18.200
Schulden in Box 3
Studieschuld DUO € 8.300`,
      ],
      2023,
    )

    expect(generate).toHaveBeenCalledTimes(2)
    expect(result.assets).toHaveLength(1)
    expect(result.debts).toHaveLength(1)
    expect(result.debts[0]!.is_tax_deductible).toBe(false)
    expect(result.tax_year).toBe(2024)
  })

  it('herstelt de sessie en probeert één keer opnieuw wanneer een venster crasht', async () => {
    generate
      .mockRejectedValueOnce(new Error('unaligned accesses'))
      .mockResolvedValueOnce('[{"label":"ASN Bank spaarrekening","type":"savings","bedrag":"18.200"}]')

    const result = await extractAangifteDataLocal(
      ['Aangifte inkomstenbelasting 2024\nBank- en spaartegoeden\nASN Bank spaarrekening € 18.200'],
      2023,
    )

    expect(disposeSession).toHaveBeenCalledTimes(1)
    expect(result.assets).toHaveLength(1)
  })

  it('werpt (fail-closed) wanneer een venster ook ná sessieherstel faalt — geen cloud-uitwijk', async () => {
    generate.mockRejectedValue(new Error('device lost'))
    await expect(
      extractAangifteDataLocal(
        ['Aangifte inkomstenbelasting 2024\nBank- en spaartegoeden\nASN Bank spaarrekening € 18.200'],
        2023,
      ),
    ).rejects.toThrow('device lost')
  })
})
