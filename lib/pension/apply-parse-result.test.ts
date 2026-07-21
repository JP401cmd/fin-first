/**
 * Unit-tests voor applyPensionParseResult + applyAowFromParseResult
 * (lib/pension/apply-parse-result.ts).
 *
 * Dekking applyPensionParseResult (ALLEEN potten — AOW is afgesplitst):
 *  1. Mappingfilter  — alleen 'ouderdomspensioen' wordt geïnsert
 *  2. Insert-payload — alle velden correct (event_type, target_age,
 *                      monthly_income_change, duration_months, icon,
 *                      sort_order, metadata.pensioenType, metadata.source)
 *  3. sort_order-offset — existingPensionCount schuift index correct op
 *  4. Foutpad insert  — db retourneert insert-error → error-string terug, geen throw
 *  5. AOW raakt de potten-helper NIET meer aan (geen update/insert van aow)
 *
 * Dekking applyAowFromParseResult (expliciete gebruikerskeuze):
 *  - bestaand aow-event → update monthly_income_change + leefsituatie → 'updated'
 *  - geen event + aowLeeftijd → insert volgens conventie → 'created'
 *  - geen event + geen leeftijd → 'none'
 *  - aowBedrag null/0 → 'none', geen db-aanroep
 */

import { describe, it, expect } from 'vitest'
import type { PensionParseResult } from '@/lib/pension/types'

// ── Minimale Supabase-stub ──────────────────────────────────────────────────
// We moeten de Supabase-client nabootsen zonder de echte SDK/server-omgeving
// te laden. De helper accepteert de client als argument, wat mocking triviaal
// maakt: we geven een plain object terug dat de fluent API simuleert.

function makeInsertResult(error: { message: string } | null = null) {
  return { error }
}

interface InsertCall {
  table: string
  rows: unknown[]
}

interface UpdateCall {
  table: string
  data: Record<string, unknown>
  /** De waarde die in de EERSTE .eq()-aanroep wordt doorgegeven (user_id bij de AOW-update). */
  id: string
  /** Alle .eq()-aanroepen in volgorde, zodat we zowel user_id als event-id kunnen asserten. */
  eqCalls: Array<{ col: string; val: unknown }>
}

function makeSupabaseMock({
  insertError = null,
  aowFetchRow = null as { id: string; metadata?: Record<string, unknown> } | null,
  aowFetchError = null as { message: string } | null,
  aowUpdateError = null as { message: string } | null,
}: {
  insertError?: { message: string } | null
  aowFetchRow?: { id: string; metadata?: Record<string, unknown> } | null
  aowFetchError?: { message: string } | null
  aowUpdateError?: { message: string } | null
} = {}) {
  const insertCalls: InsertCall[] = []
  const updateCalls: UpdateCall[] = []

  // Track current table so we know which branch we're in
  let currentTable = ''
  let currentUpdateData: Record<string, unknown> = {}

  const client = {
    from(table: string) {
      currentTable = table
      return {
        insert(rows: unknown[]) {
          insertCalls.push({ table, rows: rows as unknown[] })
          return Promise.resolve(makeInsertResult(insertError))
        },
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                eq(_col2: string, _val2: unknown) {
                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: aowFetchRow,
                        error: aowFetchError,
                      })
                    },
                  }
                },
              }
            },
          }
        },
        update(data: Record<string, unknown>) {
          currentUpdateData = data
          const eqCalls: Array<{ col: string; val: unknown }> = []
          const entry: UpdateCall = {
            table: currentTable,
            data: currentUpdateData,
            id: '',
            eqCalls,
          }
          updateCalls.push(entry)

          // Chainable .eq(): ondersteunt .eq('user_id', ...).eq('id', ...)
          // (twee aanroepen, zoals applyAowFromParseResult nu doet).
          const chain = {
            eq(col: string, val: unknown) {
              eqCalls.push({ col, val })
              if (!entry.id) entry.id = String(val)
              return Promise.resolve({ error: aowUpdateError })
            },
          }
          return {
            eq(col: string, val: unknown) {
              eqCalls.push({ col, val })
              if (!entry.id) entry.id = String(val)
              return chain
            },
          }
        },
      }
    },
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
  }

  return client
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const BASE_PARSE_RESULT: PensionParseResult = {
  aowBedrag: null,
  nabestaandenpensioen: null,
  samenvatting: 'Test overzicht',
  regelingen: [
    {
      fondsNaam: 'ABP',
      brutoBedrag: 850,
      ingangLeeftijd: 67,
      isGeindexeerd: true,
      type: 'ouderdomspensioen',
    },
    {
      fondsNaam: 'Weduwe fonds',
      brutoBedrag: 300,
      ingangLeeftijd: 67,
      isGeindexeerd: false,
      type: 'nabestaandenpensioen',
    },
  ],
}

// ── Importeer SUT laat (na mock-setup is al klaar via argument-injection) ───

import { applyPensionParseResult, applyAowFromParseResult, applyPensionPots } from '@/lib/pension/apply-parse-result'
import type { PensionPotApplyItem } from '@/lib/pension/apply-parse-result'
import type { Regeling } from '@/lib/pension/reconcile'

// ── Supabase-stub voor applyPensionPots ────────────────────────────────────
// applyPensionPots gebruikt .update().eq('user_id', x).eq('id', y) (twee .eq()-aanroepen).
// De bestaande makeSupabaseMock heeft maar één .eq() in de update-keten; deze variant
// ondersteunt het dubbele patroon en registreert de volledige update-keten.

interface UpdateCallV2 {
  table: string
  data: Record<string, unknown>
  eqCalls: Array<{ col: string; val: unknown }>
}

function makeSupabaseMockV2({
  insertError = null as { message: string } | null,
  updateError = null as { message: string } | null,
} = {}) {
  const insertCalls: InsertCall[] = []
  const updateCalls: UpdateCallV2[] = []

  let currentTable = ''

  const client = {
    from(table: string) {
      currentTable = table
      return {
        insert(rows: unknown[]) {
          insertCalls.push({ table, rows: rows as unknown[] })
          return Promise.resolve({ error: insertError })
        },
        update(data: Record<string, unknown>) {
          const eqCalls: Array<{ col: string; val: unknown }> = []
          const entry: UpdateCallV2 = { table: currentTable, data, eqCalls }
          updateCalls.push(entry)

          // Chainable .eq(): elke .eq()-aanroep registreert zichzelf en retourneert
          // het chain-object opnieuw, zodat .eq().eq() werkt.
          const chain = {
            eq(col: string, val: unknown) {
              eqCalls.push({ col, val })
              return Promise.resolve({ error: updateError })
            },
          }
          // Eerste .eq() retourneert een object dat ook .eq() heeft.
          return {
            eq(col: string, val: unknown) {
              eqCalls.push({ col, val })
              return chain
            },
          }
        },
        // select-keten voor AOW — niet gebruikt door applyPensionPots, wel veilig stub.
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                eq(_col2: string, _val2: unknown) {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: null, error: null })
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
  }

  return client
}

// ── Fixture-helper voor applyPensionPots ──────────────────────────────────

function makeRegeling(overrides: Partial<Regeling> = {}): Regeling {
  return {
    fondsNaam: 'ABP',
    brutoBedrag: 850,
    ingangLeeftijd: 67,
    isGeindexeerd: true,
    type: 'ouderdomspensioen',
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('applyPensionParseResult', () => {
  describe('mappingfilter — alleen ouderdomspensioen geïnsert', () => {
    it('insert bevat slechts het ouderdomspensioen, nabestaandenpensioen wordt weggefiltered', async () => {
      const mock = makeSupabaseMock()

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: BASE_PARSE_RESULT,
        existingPensionCount: 0,
      })

      expect(result.error).toBeNull()
      expect(result.insertedCount).toBe(1)
      expect(mock._insertCalls).toHaveLength(1)
      const [call] = mock._insertCalls
      expect(call.table).toBe('life_events')
      expect(Array.isArray(call.rows)).toBe(true)
      expect((call.rows as unknown[]).length).toBe(1)
    })

    it('insert-payload bevat correcte kern-velden', async () => {
      const mock = makeSupabaseMock()

      await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-42',
        parseResult: BASE_PARSE_RESULT,
        existingPensionCount: 0,
      })

      const inserted = (mock._insertCalls[0].rows as Record<string, unknown>[])[0]
      expect(inserted.user_id).toBe('user-42')
      expect(inserted.event_type).toBe('pension')
      expect(inserted.target_age).toBe(67)
      expect(inserted.monthly_income_change).toBe(850)
      expect(inserted.duration_months).toBe(0)
      // ABP → ouderdomspensioen → normalizePensionType('ouderdomspensioen') = 'bedrijf'
      // → icon = 'Landmark'
      expect(inserted.icon).toBe('Landmark')
      expect(inserted.is_active).toBe(true)
    })

    it('metadata bevat pensioenType en source:upo_upload', async () => {
      const mock = makeSupabaseMock()

      await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: BASE_PARSE_RESULT,
        existingPensionCount: 0,
      })

      const inserted = (mock._insertCalls[0].rows as Record<string, unknown>[])[0]
      const meta = inserted.metadata as Record<string, unknown>
      expect(meta.pensioenType).toBe('bedrijf')
      expect(meta.source).toBe('upo_upload')
      expect(meta.uitkeringsduur).toBe('levenslang')
      expect(meta.partnerUitkeringPct).toBe(70)
      expect(meta.inlegBedrag).toBe(0)
    })
  })

  describe('sort_order-offset', () => {
    it('met existingPensionCount=2 en twee ouderdomsregelingen → sort_order 3 en 4', async () => {
      const parseResult: PensionParseResult = {
        aowBedrag: null,
        nabestaandenpensioen: null,
        samenvatting: 'Twee regelingen',
        regelingen: [
          {
            fondsNaam: 'Fonds A',
            brutoBedrag: 600,
            ingangLeeftijd: 67,
            isGeindexeerd: false,
            type: 'ouderdomspensioen',
          },
          {
            fondsNaam: 'Fonds B',
            brutoBedrag: 400,
            ingangLeeftijd: 68,
            isGeindexeerd: true,
            type: 'ouderdomspensioen',
          },
        ],
      }

      const mock = makeSupabaseMock()

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult,
        existingPensionCount: 2,
      })

      expect(result.error).toBeNull()
      expect(result.insertedCount).toBe(2)
      const rows = mock._insertCalls[0].rows as Record<string, unknown>[]
      expect(rows[0].sort_order).toBe(3) // existingPensionCount(2) + index(0) + 1
      expect(rows[1].sort_order).toBe(4) // existingPensionCount(2) + index(1) + 1
    })

    it('met existingPensionCount=0 en één regeling → sort_order 1', async () => {
      const mock = makeSupabaseMock()

      await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: BASE_PARSE_RESULT,
        existingPensionCount: 0,
      })

      const row = (mock._insertCalls[0].rows as Record<string, unknown>[])[0]
      expect(row.sort_order).toBe(1)
    })
  })

  describe('icon — PiggyBank voor niet-bedrijf-types', () => {
    it('lijfrente_levenslang regeling (type=lijfrente) → icon PiggyBank', async () => {
      const parseResult: PensionParseResult = {
        aowBedrag: null,
        nabestaandenpensioen: null,
        samenvatting: 'Lijfrente',
        regelingen: [
          {
            fondsNaam: 'NN Lijfrente',
            brutoBedrag: 500,
            ingangLeeftijd: 67,
            isGeindexeerd: false,
            // 'lijfrente' → normalizePensionType → 'lijfrente_levenslang' → icon PiggyBank
            type: 'ouderdomspensioen', // type-enum heeft geen 'lijfrente' — zie ADR
            // We testen het icon-pad via een fondsNaam-conventie: type=ouderdomspensioen
            // normaliseert altijd naar 'bedrijf' (= Landmark). Om PiggyBank te testen
            // moeten we een regeling maken waarbij de canonical type NIET 'bedrijf' is.
            // Dat kan via de editor-paden maar de parse-route enum laat alleen
            // 'ouderdomspensioen' toe. Dit is een bewuste scope-beperking: de parse-route
            // levert altijd 'ouderdomspensioen' → 'bedrijf' → Landmark.
            // De PiggyBank-tak is bedoeld voor handmatige editor-paden. We documenteren
            // dit hier expliciet zodat het geen blinde vlek is.
          },
        ],
      }

      // 'ouderdomspensioen' → normalizePensionType → 'bedrijf' → Landmark
      const mock = makeSupabaseMock()
      await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult,
        existingPensionCount: 0,
      })
      const row = (mock._insertCalls[0].rows as Record<string, unknown>[])[0]
      // Via UPO-pad is type altijd 'ouderdomspensioen' → altijd 'bedrijf' → Landmark
      expect(row.icon).toBe('Landmark')
    })
  })

  describe('AOW raakt de potten-helper niet meer aan', () => {
    it('aowBedrag > 0 → geen update/insert van een aow-event door applyPensionParseResult', async () => {
      const mock = makeSupabaseMock({ aowFetchRow: { id: 'aow-event-uuid' } })

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 1350 },
        existingPensionCount: 0,
      })

      expect(result.error).toBeNull()
      // Alleen de pensioenpot-insert; geen AOW-update.
      expect(result.insertedCount).toBe(1)
      expect(mock._updateCalls).toHaveLength(0)
    })
  })

  describe('foutpaden', () => {
    it('insert-error → retourneert error-string, geen throw, insertedCount=0', async () => {
      const mock = makeSupabaseMock({ insertError: { message: 'duplicate key value' } })

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: BASE_PARSE_RESULT,
        existingPensionCount: 0,
      })

      expect(result.error).toBe('duplicate key value')
      expect(result.insertedCount).toBe(0)
    })

    it('lege regelingen-array → insertedCount=0, geen db-aanroep, geen error', async () => {
      const mock = makeSupabaseMock()

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: { ...BASE_PARSE_RESULT, regelingen: [] },
        existingPensionCount: 0,
      })

      expect(result.error).toBeNull()
      expect(result.insertedCount).toBe(0)
      expect(mock._insertCalls).toHaveLength(0)
    })

    it('alleen nabestaandenpensioen in regelingen → insertedCount=0, geen insert', async () => {
      const mock = makeSupabaseMock()

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: {
          ...BASE_PARSE_RESULT,
          regelingen: [
            {
              fondsNaam: 'Nabestaanden fonds',
              brutoBedrag: 400,
              ingangLeeftijd: 67,
              isGeindexeerd: false,
              type: 'nabestaandenpensioen',
            },
          ],
        },
        existingPensionCount: 0,
      })

      expect(result.error).toBeNull()
      expect(result.insertedCount).toBe(0)
      expect(mock._insertCalls).toHaveLength(0)
    })
  })
})

describe('applyAowFromParseResult', () => {
  it('bestaand aow-event → update monthly_income_change + leefsituatie behoudt jarenBuitenNL → updated', async () => {
    const mock = makeSupabaseMock({
      aowFetchRow: { id: 'aow-uuid', metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 5 } },
    })

    const result = await applyAowFromParseResult({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      userId: 'user-1',
      parseResult: {
        ...BASE_PARSE_RESULT,
        aowBedrag: 1400,
        aowLeefsituatie: 'samenwonend',
      },
    })

    expect(result.error).toBeNull()
    expect(result.aowApplied).toBe('updated')
    expect(mock._updateCalls).toHaveLength(1)
    const [upd] = mock._updateCalls
    expect(upd.data.monthly_income_change).toBe(1400)
    // leefsituatie bijgewerkt, jarenBuitenNL behouden
    const meta = upd.data.metadata as Record<string, unknown>
    expect(meta.leefsituatie).toBe('samenwonend')
    expect(meta.jarenBuitenNL).toBe(5)
    // Security: AOW update is nu gescoped op ZOWEL user_id als event id (two-eq keten).
    expect(upd.eqCalls).toHaveLength(2)
    expect(upd.eqCalls[0]).toEqual({ col: 'user_id', val: 'user-1' })
    expect(upd.eqCalls[1]).toEqual({ col: 'id', val: 'aow-uuid' })
    // Geen pot-insert
    expect(mock._insertCalls).toHaveLength(0)
  })

  it('geen event + aowLeeftijd aanwezig → insert volgens conventie → created', async () => {
    const mock = makeSupabaseMock({ aowFetchRow: null })

    const result = await applyAowFromParseResult({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      userId: 'user-9',
      parseResult: {
        ...BASE_PARSE_RESULT,
        aowBedrag: 2000,
        aowLeeftijd: 68,
        aowLeefsituatie: 'alleenstaand',
      },
    })

    expect(result.error).toBeNull()
    expect(result.aowApplied).toBe('created')
    expect(mock._updateCalls).toHaveLength(0)
    expect(mock._insertCalls).toHaveLength(1)
    const inserted = mock._insertCalls[0].rows as unknown as Record<string, unknown>
    expect(inserted.user_id).toBe('user-9')
    expect(inserted.event_type).toBe('aow')
    expect(inserted.target_age).toBe(68)
    expect(inserted.monthly_income_change).toBe(2000)
    expect(inserted.icon).toBe('Landmark')
    expect(inserted.is_indexed).toBe(true)
    const meta = inserted.metadata as Record<string, unknown>
    expect(meta.leefsituatie).toBe('alleenstaand')
    expect(meta.jarenBuitenNL).toBe(0)
  })

  it('geen event + leefsituatie ontbreekt → insert met fallback leefsituatie alleenstaand', async () => {
    const mock = makeSupabaseMock({ aowFetchRow: null })

    const result = await applyAowFromParseResult({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      userId: 'user-1',
      parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 1500, aowLeeftijd: 67 },
    })

    expect(result.aowApplied).toBe('created')
    const inserted = mock._insertCalls[0].rows as unknown as Record<string, unknown>
    expect((inserted.metadata as Record<string, unknown>).leefsituatie).toBe('alleenstaand')
  })

  it('geen event + geen aowLeeftijd (PDF-pad) → none, geen insert', async () => {
    const mock = makeSupabaseMock({ aowFetchRow: null })

    const result = await applyAowFromParseResult({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      userId: 'user-1',
      parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 1500 },
    })

    expect(result.error).toBeNull()
    expect(result.aowApplied).toBe('none')
    expect(mock._insertCalls).toHaveLength(0)
    expect(mock._updateCalls).toHaveLength(0)
  })

  it('aowBedrag null → none, geen db-aanroep', async () => {
    const mock = makeSupabaseMock({ aowFetchRow: { id: 'zou-niet-bereikt-worden' } })

    const result = await applyAowFromParseResult({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      userId: 'user-1',
      parseResult: { ...BASE_PARSE_RESULT, aowBedrag: null },
    })

    expect(result.aowApplied).toBe('none')
    expect(mock._updateCalls).toHaveLength(0)
    expect(mock._insertCalls).toHaveLength(0)
  })

  it('aowBedrag 0 → none (grenswaarde)', async () => {
    const mock = makeSupabaseMock({ aowFetchRow: { id: 'aow-uuid' } })

    const result = await applyAowFromParseResult({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      userId: 'user-1',
      parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 0 },
    })

    expect(result.aowApplied).toBe('none')
    expect(mock._updateCalls).toHaveLength(0)
  })

  it('fetch-error → none met foutmelding, geen throw', async () => {
    const mock = makeSupabaseMock({ aowFetchError: { message: 'permission denied' } })

    const result = await applyAowFromParseResult({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      userId: 'user-1',
      parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 1400, aowLeeftijd: 67 },
    })

    expect(result.aowApplied).toBe('none')
    expect(result.error).toContain('permission denied')
  })
})

// ── applyPensionPots — beslissingsgestuurde schrijffunctie ───────────────────

describe('applyPensionPots', () => {
  describe("action 'add' — insert-payload", () => {
    it('voegt correcte kern-velden in en telt inserted', async () => {
      const mock = makeSupabaseMockV2()
      const regeling = makeRegeling({ fondsNaam: 'ABP', brutoBedrag: 850, ingangLeeftijd: 67, isGeindexeerd: true })
      const item: PensionPotApplyItem = { regeling, action: 'add' }

      const result = await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 0,
      })

      expect(result.error).toBeNull()
      expect(result.inserted).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.skipped).toBe(0)

      expect(mock._insertCalls).toHaveLength(1)
      const rows = mock._insertCalls[0].rows as Record<string, unknown>[]
      expect(rows).toHaveLength(1)
      const row = rows[0]

      expect(row.user_id).toBe('user-1')
      expect(row.event_type).toBe('pension')
      expect(row.monthly_income_change).toBe(850)
      expect(row.target_age).toBe(67)
      expect(row.is_indexed).toBe(true)
      expect(row.sort_order).toBe(1) // existingPensionCount(0) + index(0) + 1
    })

    it('metadata bevat source:upo_upload en mijnpensioenBron (genormaliseerde naam)', async () => {
      const mock = makeSupabaseMockV2()
      const regeling = makeRegeling({ fondsNaam: 'ABP (deels indicatief)' })
      const item: PensionPotApplyItem = { regeling, action: 'add' }

      await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 0,
      })

      const rows = mock._insertCalls[0].rows as Record<string, unknown>[]
      const meta = rows[0].metadata as Record<string, unknown>
      expect(meta.source).toBe('upo_upload')
      expect(meta.mijnpensioenBron).toBe('abp') // normalizePensionFondsNaam('ABP (deels indicatief)')
    })

    it('metadata bevat de vereiste velden incl. pensioenType, inlegBedrag, uitkeringsduur, partnerUitkeringPct', async () => {
      const mock = makeSupabaseMockV2()
      const regeling = makeRegeling({ fondsNaam: 'ABP', brutoBedrag: 850, ingangLeeftijd: 67, isGeindexeerd: true })
      const item: PensionPotApplyItem = { regeling, action: 'add' }

      await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 0,
      })

      const meta = (mock._insertCalls[0].rows as Record<string, unknown>[])[0].metadata as Record<string, unknown>
      expect(meta.pensioenType).toBe('bedrijf') // normalizePensionType('ouderdomspensioen')
      expect(meta.inlegBedrag).toBe(0)
      expect(meta.uitkeringsduur).toBe('levenslang')
      expect(meta.partnerUitkeringPct).toBe(70)
      expect(meta.ingangLeeftijd).toBe(67)
      expect(meta.brutoBedrag).toBe(850)
      expect(meta.isGeindexeerd).toBe(true)
    })

    it('sort_order houdt rekening met existingPensionCount', async () => {
      const mock = makeSupabaseMockV2()
      const items: PensionPotApplyItem[] = [
        { regeling: makeRegeling({ fondsNaam: 'Fonds A' }), action: 'add' },
        { regeling: makeRegeling({ fondsNaam: 'Fonds B' }), action: 'add' },
      ]

      await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items,
        existingPensionCount: 3,
      })

      const rows = mock._insertCalls[0].rows as Record<string, unknown>[]
      expect(rows[0].sort_order).toBe(4) // existingPensionCount(3) + index(0) + 1
      expect(rows[1].sort_order).toBe(5) // existingPensionCount(3) + index(1) + 1
    })
  })

  describe("action 'update' — update-payload en metadata-merge", () => {
    it("update werkt via .update().eq('user_id').eq('id') en telt updated", async () => {
      const mock = makeSupabaseMockV2()
      const regeling = makeRegeling({ fondsNaam: 'ABP', brutoBedrag: 900, ingangLeeftijd: 67, isGeindexeerd: false })
      const existingMetadata = {
        pensioenType: 'bedrijf',
        inlegBedrag: 0,
        uitkeringsduur: 'levenslang',
        partnerUitkeringPct: 70,
        source: 'upo_upload',
        jarenBuitenNL: 0, // extra veld dat behouden moet blijven
      }
      const item: PensionPotApplyItem = {
        regeling,
        action: 'update',
        matchEventId: 'event-uuid-123',
        existingMetadata,
      }

      const result = await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 1,
      })

      expect(result.error).toBeNull()
      expect(result.updated).toBe(1)
      expect(result.inserted).toBe(0)
      expect(result.skipped).toBe(0)

      expect(mock._insertCalls).toHaveLength(0) // geen insert
      expect(mock._updateCalls).toHaveLength(1)

      const upd = mock._updateCalls[0]
      expect(upd.data.monthly_income_change).toBe(900)
      expect(upd.data.target_age).toBe(67)
      expect(upd.data.is_indexed).toBe(false)
      // .eq()-keten: user_id scope + id scope
      expect(upd.eqCalls).toHaveLength(2)
      expect(upd.eqCalls[0]).toEqual({ col: 'user_id', val: 'user-1' })
      expect(upd.eqCalls[1]).toEqual({ col: 'id', val: 'event-uuid-123' })
    })

    it('metadata-merge behoudt pensioenType, inlegBedrag, uitkeringsduur, partnerUitkeringPct, source', async () => {
      const mock = makeSupabaseMockV2()
      const existingMetadata = {
        pensioenType: 'bedrijf',
        inlegBedrag: 5000,
        uitkeringsduur: 'levenslang',
        partnerUitkeringPct: 60,
        source: 'upo_upload',
      }
      const item: PensionPotApplyItem = {
        regeling: makeRegeling({ fondsNaam: 'ABP', brutoBedrag: 900, ingangLeeftijd: 68, isGeindexeerd: true }),
        action: 'update',
        matchEventId: 'ev-1',
        existingMetadata,
      }

      await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 1,
      })

      const mergedMeta = mock._updateCalls[0].data.metadata as Record<string, unknown>

      // Behouden uit existingMetadata:
      expect(mergedMeta.pensioenType).toBe('bedrijf')
      expect(mergedMeta.inlegBedrag).toBe(5000)
      expect(mergedMeta.uitkeringsduur).toBe('levenslang')
      expect(mergedMeta.partnerUitkeringPct).toBe(60)
      expect(mergedMeta.source).toBe('upo_upload')

      // Bijgewerkt naar nieuwe waarden:
      expect(mergedMeta.brutoBedrag).toBe(900)
      expect(mergedMeta.ingangLeeftijd).toBe(68)
      expect(mergedMeta.isGeindexeerd).toBe(true)
      expect(mergedMeta.mijnpensioenBron).toBe('abp')
    })

    it('update bevat GEEN name-veld (name wordt niet overschreven via update)', async () => {
      const mock = makeSupabaseMockV2()
      const item: PensionPotApplyItem = {
        regeling: makeRegeling({ fondsNaam: 'ABP' }),
        action: 'update',
        matchEventId: 'ev-1',
        existingMetadata: { pensioenType: 'bedrijf', source: 'upo_upload' },
      }

      await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 1,
      })

      const updateData = mock._updateCalls[0].data
      expect(Object.keys(updateData)).not.toContain('name')
    })

    it("update zonder matchEventId → behandeld als skip (defensief pad)", async () => {
      const mock = makeSupabaseMockV2()
      const item: PensionPotApplyItem = {
        regeling: makeRegeling(),
        action: 'update',
        matchEventId: null, // geen id → defensief
        existingMetadata: {},
      }

      const result = await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 0,
      })

      expect(result.updated).toBe(0)
      expect(result.skipped).toBe(1)
      expect(mock._updateCalls).toHaveLength(0)
    })
  })

  describe("action 'skip' — geen DB-aanroep", () => {
    it('skip → geen insert of update, telt skipped', async () => {
      const mock = makeSupabaseMockV2()
      const item: PensionPotApplyItem = { regeling: makeRegeling(), action: 'skip' }

      const result = await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 0,
      })

      expect(result.skipped).toBe(1)
      expect(result.inserted).toBe(0)
      expect(result.updated).toBe(0)
      expect(mock._insertCalls).toHaveLength(0)
      expect(mock._updateCalls).toHaveLength(0)
    })
  })

  describe('gemengde batch (1 add + 1 update + 1 skip)', () => {
    it('geeft correcte counts terug; add gaat naar één batch-insert', async () => {
      const mock = makeSupabaseMockV2()
      const items: PensionPotApplyItem[] = [
        { regeling: makeRegeling({ fondsNaam: 'Nieuw Fonds' }), action: 'add' },
        {
          regeling: makeRegeling({ fondsNaam: 'ABP' }),
          action: 'update',
          matchEventId: 'ev-abp',
          existingMetadata: { pensioenType: 'bedrijf', source: 'upo_upload' },
        },
        { regeling: makeRegeling({ fondsNaam: 'Overgeslagen Fonds' }), action: 'skip' },
      ]

      const result = await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items,
        existingPensionCount: 2,
      })

      expect(result.inserted).toBe(1)
      expect(result.updated).toBe(1)
      expect(result.skipped).toBe(1)
      expect(result.error).toBeNull()

      // add → één batch insert
      expect(mock._insertCalls).toHaveLength(1)
      const insertedRows = mock._insertCalls[0].rows as Record<string, unknown>[]
      expect(insertedRows).toHaveLength(1)
      // sort_order voor de add: existingPensionCount(2) + addIndex(0) + 1 = 3
      expect(insertedRows[0].sort_order).toBe(3)

      // update → één update-aanroep
      expect(mock._updateCalls).toHaveLength(1)
    })
  })

  describe('foutpaden', () => {
    it('insert-error → geeft error terug, geen throw, inserted=0', async () => {
      const mock = makeSupabaseMockV2({ insertError: { message: 'unique violation' } })
      const item: PensionPotApplyItem = { regeling: makeRegeling(), action: 'add' }

      const result = await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items: [item],
        existingPensionCount: 0,
      })

      expect(result.error).toBe('unique violation')
      expect(result.inserted).toBe(0)
    })

    it('update-error → geeft error terug, counts-tot-nu behouden, geen throw', async () => {
      const mock = makeSupabaseMockV2({ updateError: { message: 'rls violation' } })
      const items: PensionPotApplyItem[] = [
        {
          regeling: makeRegeling({ fondsNaam: 'Fonds 1' }),
          action: 'update',
          matchEventId: 'ev-1',
          existingMetadata: { pensioenType: 'bedrijf' },
        },
        {
          regeling: makeRegeling({ fondsNaam: 'Fonds 2' }),
          action: 'update',
          matchEventId: 'ev-2',
          existingMetadata: { pensioenType: 'bedrijf' },
        },
      ]

      const result = await applyPensionPots({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        items,
        existingPensionCount: 2,
      })

      expect(result.error).toBe('rls violation')
      // Eerste update mislukt direct → updated=0, lus stopt
      expect(result.updated).toBe(0)
    })
  })
})
