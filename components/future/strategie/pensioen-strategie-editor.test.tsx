import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PensioenStrategieEditor } from './pensioen-strategie-editor'
import type { LifeEvent } from '@/lib/horizon-data'

/**
 * Tests voor de Pensioen-strategie-editor (list-view):
 *  - factor-A-uitvraag (bestaande 5 cases)
 *  - AOW-keuze na upload (bestaande 4 cases)
 *  - Reconciliatie review-paneel na upload (nieuw)
 *
 * Supabase en next/navigation worden gemockt.
 * De Supabase-mock is uitgebreid zodat:
 *  - from('profiles').update().eq()          → factor A opslaan (één .eq())
 *  - from('life_events').update().eq().eq()  → applyPensionPots update (twee .eq())
 *  - from('life_events').insert()            → applyPensionPots add
 *  - from('life_events').select()...         → AOW-fetch
 */

const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockGetUser = vi.fn()
const mockRefresh = vi.fn()
const mockInsert = vi.fn()

// Vangt payloads zodat we de bron kunnen asserten.
let lastUpdatePayload: Record<string, unknown> | null = null
let lastInsertPayload: unknown = null
// Alle life_events-update-aanroepen (voor reconciliatie-tests).
const lifeEventUpdateCalls: Array<{ data: Record<string, unknown>; eq1: unknown; eq2: unknown }> = []
// Configureerbare AOW-fetch-respons voor applyAowFromParseResult.
let aowFetchRow: { id: string; metadata?: Record<string, unknown> } | null = null

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      if (table === 'profiles') {
        // Eén .eq()-keten (factor A opslaan).
        return {
          update: (payload: Record<string, unknown>) => {
            lastUpdatePayload = payload
            mockUpdate(payload)
            return { eq: () => mockEq() }
          },
          // profiles heeft geen insert/select in de editor
          insert: () => Promise.resolve({ error: null }),
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        }
      }

      // table === 'life_events'
      return {
        update: (payload: Record<string, unknown>) => {
          lastUpdatePayload = payload
          mockUpdate(payload)
          const call: { data: Record<string, unknown>; eq1: unknown; eq2: unknown } = {
            data: payload,
            eq1: undefined,
            eq2: undefined,
          }
          lifeEventUpdateCalls.push(call)

          // Twee chained .eq() voor applyPensionPots (.eq('user_id',...).eq('id',...)).
          return {
            eq: (col1: string, val1: unknown) => {
              call.eq1 = { col: col1, val: val1 }
              return {
                // Tweede .eq() is de daadwerkelijke Promise.
                eq: (col2: string, val2: unknown) => {
                  call.eq2 = { col: col2, val: val2 }
                  return Promise.resolve({ error: null })
                },
                // Sommige paden (AOW-update) doen maar één .eq() en awaiten direct.
                then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
              }
            },
          }
        },
        insert: (payload: unknown) => {
          lastInsertPayload = payload
          mockInsert(payload)
          return Promise.resolve({ error: null })
        },
        // select().eq().eq().maybeSingle() voor de AOW-lookup.
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: aowFetchRow, error: null }),
            }),
          }),
        }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

// Stub de upload-component: één knop per scenario die onParseResult triggert,
// zodat we de upload-flow kunnen aansturen zonder echte file-upload.
let nextParseResult: unknown = null
vi.mock('@/components/app/horizon/pension-pdf-upload', () => ({
  PensionPdfUpload: ({ onParseResult }: { onParseResult: (r: unknown) => void }) => (
    <button type="button" onClick={() => onParseResult(nextParseResult)}>
      stub-upload
    </button>
  ),
}))

beforeEach(() => {
  lastUpdatePayload = null
  lastInsertPayload = null
  aowFetchRow = null
  lifeEventUpdateCalls.length = 0
  mockUpdate.mockReset()
  mockInsert.mockReset()
  mockEq.mockReset()
  mockEq.mockResolvedValue({ error: null })
  mockGetUser.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockRefresh.mockReset()
  nextParseResult = null
})

function renderEditor(
  overrides: {
    grossYearlyIncome?: number
    pensioenFactorA?: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allEvents?: any[]
    pensionEvents?: LifeEvent[]
    currentAge?: number | null
    inflationRate?: number
  } = {},
) {
  return render(
    <PensioenStrategieEditor
      pensionEvents={overrides.pensionEvents ?? []}
      allEvents={overrides.allEvents ?? []}
      baseline={null}
      dailyExpenses={50}
      aowAge={67}
      grossYearlyIncome={overrides.grossYearlyIncome ?? 45000}
      pensioenFactorA={overrides.pensioenFactorA ?? 0}
      currentAge={overrides.currentAge ?? 45}
      inflationRate={overrides.inflationRate ?? 0.02}
      onClose={() => {}}
    />,
  )
}

function openUitvraag() {
  fireEvent.click(screen.getByRole('button', { name: /Bereken je fiscale ruimte/i }))
}

async function flush() {
  await new Promise((r) => setTimeout(r, 10))
}

describe('Pensioen-strategie-editor — factor-A-uitvraag', () => {
  it('toont de uitvraag pas na openklikken', () => {
    renderEditor()
    expect(screen.queryByLabelText(/factor A/i)).toBeNull()
    openUitvraag()
    expect(screen.getByLabelText(/factor A/i)).toBeTruthy()
  })

  it('framet als bovengrens wanneer factor A onbekend is', () => {
    renderEditor({ pensioenFactorA: 0 })
    openUitvraag()
    expect(screen.getByText(/Bovengrens vóór aftrek werkgeverspensioen/i)).toBeTruthy()
  })

  it('handmatige invoer slaat op met pension_factor_a_source: upo', async () => {
    renderEditor({ pensioenFactorA: 0 })
    openUitvraag()
    const input = screen.getByLabelText(/factor A/i)
    fireEvent.change(input, { target: { value: '1200' } })
    fireEvent.click(screen.getByText(/Factor A opslaan/i))
    await flush()
    expect(mockUpdate).toHaveBeenCalled()
    expect(lastUpdatePayload).toEqual({
      pension_factor_a: 1200,
      pension_factor_a_source: 'upo',
    })
    expect(mockEq).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('salaris-schatter vult factor A en slaat op met estimated', async () => {
    const { estimateFactorAFromSalary } = await import('@/lib/jaarruimte')
    const verwacht = estimateFactorAFromSalary(45000, { year: 2026 })

    renderEditor({ pensioenFactorA: 0 })
    openUitvraag()
    // Open salaris-alternatief
    fireEvent.click(screen.getByText(/Schat 'm uit je salaris/i))
    const salaris = screen.getByLabelText(/Bruto jaarsalaris/i)
    fireEvent.change(salaris, { target: { value: '45000' } })
    fireEvent.click(screen.getByText(/^Schat factor A$/i))

    // Het factor-A-veld is nu gevuld met de schatting (afgerond).
    const input = screen.getByLabelText(/factor A/i) as HTMLInputElement
    expect(input.value).toBe(String(Math.round(verwacht)))
    expect(screen.getByText(/Indicatie op basis van je salaris/i)).toBeTruthy()

    fireEvent.click(screen.getByText(/Factor A opslaan/i))
    await flush()
    expect(lastUpdatePayload).toEqual({
      pension_factor_a: Math.round(verwacht),
      pension_factor_a_source: 'estimated',
    })
  })

  it('leeg opslaan schrijft null/null (terug naar onbekend)', async () => {
    renderEditor({ pensioenFactorA: 1200 })
    openUitvraag()
    const input = screen.getByLabelText(/factor A/i)
    // Wis het voorgevulde getal.
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByText(/Factor A opslaan/i))
    await flush()
    expect(lastUpdatePayload).toEqual({
      pension_factor_a: null,
      pension_factor_a_source: null,
    })
    expect(mockRefresh).toHaveBeenCalled()
  })
})

describe('Pensioen-strategie-editor — AOW-keuze na upload', () => {
  // N.B.: de AOW-keuze is nu geïntegreerd in het unified review-paneel (pendingReview).
  // De gebruiker ziet een AOW-checkbox + "Toepassen"-knop, GEEN afzonderlijke
  // "AOW overnemen"/"Niet nu"-knoppen meer. Tests bijgewerkt naar nieuwe UI.
  function triggerUpload() {
    fireEvent.click(screen.getByText(/stub-upload/i))
  }

  it('toont de AOW-checkbox in het review-paneel na upload met aowLeeftijd, en past pas toe na "Toepassen"', async () => {
    nextParseResult = {
      aowBedrag: 1400,
      regelingen: [],
      nabestaandenpensioen: null,
      samenvatting: '',
      aowLeeftijd: 67,
      aowLeefsituatie: 'samenwonend',
    }
    aowFetchRow = null // geen bestaand event → aanmaken
    renderEditor({ allEvents: [] })
    triggerUpload()
    await flush()

    // Review-paneel met AOW-checkbox zichtbaar, nog geen db-schrijfactie.
    expect(screen.getByText(/AOW overnemen/i)).toBeTruthy()
    expect(mockInsert).not.toHaveBeenCalled()

    // Klik "Toepassen" (AOW-checkbox staat standaard aan)
    fireEvent.click(screen.getByRole('button', { name: /Toepassen/i }))
    await flush()

    // Insert van een aow-event gebeurde.
    expect(mockInsert).toHaveBeenCalled()
    const inserted = lastInsertPayload as Record<string, unknown>
    expect(inserted.event_type).toBe('aow')
    expect(inserted.target_age).toBe(67)
    expect(inserted.monthly_income_change).toBe(1400)
    expect(mockRefresh).toHaveBeenCalled()
    // Paneel gesloten na toepassen.
    expect(screen.queryByText(/AOW overnemen/i)).toBeNull()
  })

  it('toont "bijwerken"-tekst in AOW-rij als er al een aow-event is en werkt bij na "Toepassen"', async () => {
    nextParseResult = {
      aowBedrag: 1500,
      regelingen: [],
      nabestaandenpensioen: null,
      samenvatting: '',
      // geen aowLeeftijd nodig: er bestaat al een event
    }
    aowFetchRow = { id: 'aow-1', metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 3 } }
    renderEditor({
      allEvents: [{ id: 'aow-1', event_type: 'aow', name: 'AOW' } as LifeEvent],
    })
    triggerUpload()
    await flush()

    // AOW-rij: toont bijwerk-tekst (aowBestaatAl=true → "Je AOW bijwerken naar …")
    expect(screen.getByText(/AOW overnemen/i)).toBeTruthy()
    expect(screen.getByText(/Je AOW bijwerken naar/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Toepassen/i }))
    await flush()

    expect(mockUpdate).toHaveBeenCalled()
    expect(lastUpdatePayload?.monthly_income_change).toBe(1500)
  })

  it('"Annuleren" in het review-paneel sluit het paneel zonder AOW te schrijven', async () => {
    nextParseResult = {
      aowBedrag: 1400,
      regelingen: [],
      nabestaandenpensioen: null,
      samenvatting: '',
      aowLeeftijd: 67,
      aowLeefsituatie: 'samenwonend',
    }
    aowFetchRow = null
    renderEditor({ allEvents: [] })
    triggerUpload()
    await flush()

    expect(screen.getByText(/AOW overnemen/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Annuleren/i }))
    await flush()

    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    // Paneel gesloten
    expect(screen.queryByText(/AOW overnemen/i)).toBeNull()
  })

  it('geen AOW-rij als er geen aowLeeftijd én geen bestaand aow-event is (PDF-pad)', async () => {
    nextParseResult = {
      aowBedrag: 1400,
      regelingen: [],
      nabestaandenpensioen: null,
      samenvatting: '',
      // geen aowLeeftijd → PDF-pad, geen bestaand event
    }
    aowFetchRow = null
    renderEditor({ allEvents: [] })
    triggerUpload()
    await flush()

    // Geen review-paneel (ook geen potten), geen AOW-rij
    expect(screen.queryByText(/AOW overnemen/i)).toBeNull()
  })
})

describe('Pensioen-strategie-editor — reconciliatie review-paneel', () => {
  function triggerUpload() {
    fireEvent.click(screen.getByText(/stub-upload/i))
  }

  it('nieuwe pot (geen bestaande match) toont review-paneel met "Nieuw" en "Toepassen"', async () => {
    nextParseResult = {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'BPF Bouw',
          brutoBedrag: 700,
          ingangLeeftijd: 67,
          isGeindexeerd: true,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    // Geen bestaande pension-events → geen match
    renderEditor({ pensionEvents: [], allEvents: [] })
    triggerUpload()
    await flush()

    // Review-paneel verschijnt
    expect(screen.getByText(/Dit vonden we/i)).toBeTruthy()
    // "Nieuw"-badge + toelichting in het paneel
    expect(screen.getByText(/^Nieuw$/i)).toBeTruthy()
    expect(screen.getByText(/nog niet in je overzicht/i)).toBeTruthy()
    // "Toepassen"-knop aanwezig
    expect(screen.getByRole('button', { name: /Toepassen/i })).toBeTruthy()
    // Nog GEEN insert (alleen na "Toepassen")
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('"Toepassen" bij nieuwe pot roept insert aan en triggert router.refresh()', async () => {
    nextParseResult = {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'BPF Bouw',
          brutoBedrag: 700,
          ingangLeeftijd: 67,
          isGeindexeerd: false,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    renderEditor({ pensionEvents: [], allEvents: [] })
    triggerUpload()
    await flush()

    fireEvent.click(screen.getByRole('button', { name: /Toepassen/i }))
    await flush()

    expect(mockInsert).toHaveBeenCalled()
    const rows = lastInsertPayload as Record<string, unknown>[]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows[0].event_type).toBe('pension')
    expect(rows[0].monthly_income_change).toBe(700)
    expect(rows[0].target_age).toBe(67)
    expect(mockRefresh).toHaveBeenCalled()
    // Paneel gesloten na toepassen
    expect(screen.queryByText(/Dit vonden we/i)).toBeNull()
  })

  it('bestaande pot (match via genormaliseerde naam) toont "Bestaat al" en roept update aan via "Toepassen"', async () => {
    const existingEvent: LifeEvent = {
      id: 'ev-abp',
      name: 'ABP',
      event_type: 'pension',
      target_age: 67,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: 800,
      duration_months: 0,
      icon: 'Landmark',
      is_active: true,
      sort_order: 1,
      is_indexed: true,
      metadata: { pensioenType: 'bedrijf', source: 'upo_upload' },
    }
    nextParseResult = {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'ABP',  // normaliseert naar 'abp' — matcht event.name 'ABP'
          brutoBedrag: 900,
          ingangLeeftijd: 67,
          isGeindexeerd: true,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    renderEditor({ pensionEvents: [existingEvent], allEvents: [existingEvent] })
    triggerUpload()
    await flush()

    // Review-paneel: "Bestaat al" zichtbaar (default action = update)
    expect(screen.getByText(/Bestaat al/i)).toBeTruthy()

    // "Toepassen" → update (geen insert)
    fireEvent.click(screen.getByRole('button', { name: /Toepassen/i }))
    await flush()

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
    expect(lastUpdatePayload?.monthly_income_change).toBe(900)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('"Overslaan" op een pot → geen insert en geen update na "Toepassen"', async () => {
    nextParseResult = {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'BPF Bouw',
          brutoBedrag: 700,
          ingangLeeftijd: 67,
          isGeindexeerd: false,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    renderEditor({ pensionEvents: [], allEvents: [] })
    triggerUpload()
    await flush()

    // Klik op "Overslaan"
    fireEvent.click(screen.getByRole('button', { name: /Overslaan/i }))
    await flush()

    // Dan "Toepassen"
    fireEvent.click(screen.getByRole('button', { name: /Toepassen/i }))
    await flush()

    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('AOW-rij verschijnt als kanAow=true (aowBedrag > 0 + aowLeeftijd aanwezig)', async () => {
    nextParseResult = {
      aowBedrag: 1400,
      aowLeeftijd: 67,
      aowLeefsituatie: 'alleenstaand',
      regelingen: [],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    aowFetchRow = null
    renderEditor({ pensionEvents: [], allEvents: [] })
    triggerUpload()
    await flush()

    // AOW-rij (checkbox label) zichtbaar
    expect(screen.getByText(/AOW overnemen/i)).toBeTruthy()
  })

  it('"Toepassen" met AOW aangevinkt roept ook applyAowFromParseResult aan', async () => {
    nextParseResult = {
      aowBedrag: 1400,
      aowLeeftijd: 67,
      aowLeefsituatie: 'alleenstaand',
      regelingen: [],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    aowFetchRow = null
    renderEditor({ pensionEvents: [], allEvents: [] })
    triggerUpload()
    await flush()

    // Checkbox staat standaard aangevinkt (aowIncluded=kanAow=true)
    fireEvent.click(screen.getByRole('button', { name: /Toepassen/i }))
    await flush()

    // AOW insert verwacht (aowFetchRow=null, aowLeeftijd aanwezig → 'created')
    expect(mockInsert).toHaveBeenCalled()
    const insertedAow = lastInsertPayload as Record<string, unknown>
    expect(insertedAow.event_type).toBe('aow')
    expect(insertedAow.target_age).toBe(67)
    expect(insertedAow.monthly_income_change).toBe(1400)
  })

  it('geen AOW-rij als aowBedrag null/0 (kanAow=false)', async () => {
    nextParseResult = {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'BPF Bouw',
          brutoBedrag: 700,
          ingangLeeftijd: 67,
          isGeindexeerd: false,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    renderEditor({ pensionEvents: [], allEvents: [] })
    triggerUpload()
    await flush()

    // Geen AOW-rij
    expect(screen.queryByText(/AOW overnemen/i)).toBeNull()
  })

  it('"Annuleren" → geen DB-schrijfactie, paneel verdwijnt', async () => {
    nextParseResult = {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'BPF Bouw',
          brutoBedrag: 700,
          ingangLeeftijd: 67,
          isGeindexeerd: false,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    renderEditor({ pensionEvents: [], allEvents: [] })
    triggerUpload()
    await flush()

    expect(screen.getByText(/Dit vonden we/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Annuleren/i }))
    await flush()

    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    // Paneel gesloten
    expect(screen.queryByText(/Dit vonden we/i)).toBeNull()
  })

  it('regressie: potten worden NIET auto-geïnsert bij upload (alleen na "Toepassen")', async () => {
    nextParseResult = {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'ABP',
          brutoBedrag: 850,
          ingangLeeftijd: 67,
          isGeindexeerd: true,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: '',
    }
    renderEditor({ pensionEvents: [], allEvents: [] })
    triggerUpload()
    await flush()

    // Upload gedaan — maar nog GEEN insert aangeroepen
    expect(mockInsert).not.toHaveBeenCalled()
    // Review-paneel zichtbaar (wacht op gebruikersbeslissing)
    expect(screen.getByText(/Dit vonden we/i)).toBeTruthy()
  })
})
