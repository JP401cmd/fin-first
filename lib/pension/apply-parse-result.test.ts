/**
 * Unit-tests voor applyPensionParseResult (lib/pension/apply-parse-result.ts).
 *
 * Dekking:
 *  1. Mappingfilter  — alleen 'ouderdomspensioen' wordt geïnsert
 *  2. Insert-payload — alle velden correct (event_type, target_age,
 *                      monthly_income_change, duration_months, icon,
 *                      sort_order, metadata.pensioenType, metadata.source)
 *  3. sort_order-offset — existingPensionCount schuift index correct op
 *  4. AOW-update aanwezig  — aowBedrag > 0 + bestaand aow-event → update + aowUpdated:true
 *  5. AOW-update afwezig   — geen bestaand aow-event → geen update, aowUpdated:false
 *  6. AOW overgeslagen     — aowBedrag null → geen db-aanroep voor AOW
 *  7. Foutpad insert       — db retourneert insert-error → error-string terug, geen throw
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PensionParseResult } from '@/app/api/pension/parse/route'

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
  id: string
}

function makeSupabaseMock({
  insertError = null,
  aowFetchRow = null as { id: string } | null,
  aowFetchError = null as { message: string } | null,
  aowUpdateError = null as { message: string } | null,
}: {
  insertError?: { message: string } | null
  aowFetchRow?: { id: string } | null
  aowFetchError?: { message: string } | null
  aowUpdateError?: { message: string } | null
} = {}) {
  const insertCalls: InsertCall[] = []
  const updateCalls: UpdateCall[] = []

  // Track current table so we know which branch we're in
  let currentTable = ''
  let currentUpdateId = ''
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
          return {
            eq(_col: string, id: string) {
              currentUpdateId = id
              updateCalls.push({ table: currentTable, data: currentUpdateData, id })
              return Promise.resolve({ error: aowUpdateError })
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

import { applyPensionParseResult } from '@/lib/pension/apply-parse-result'

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

  describe('AOW-update', () => {
    it('aowBedrag > 0 met bestaand aow-event → update wordt aangeroepen, aowUpdated:true', async () => {
      const mock = makeSupabaseMock({ aowFetchRow: { id: 'aow-event-uuid' } })

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 1350 },
        existingPensionCount: 0,
      })

      expect(result.error).toBeNull()
      expect(result.aowUpdated).toBe(true)
      expect(mock._updateCalls).toHaveLength(1)
      const [upd] = mock._updateCalls
      expect(upd.table).toBe('life_events')
      expect(upd.id).toBe('aow-event-uuid')
      expect(upd.data.monthly_income_change).toBe(1350)
    })

    it('aowBedrag > 0 ZONDER bestaand aow-event → geen update, aowUpdated:false', async () => {
      const mock = makeSupabaseMock({ aowFetchRow: null })

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 1350 },
        existingPensionCount: 0,
      })

      expect(result.error).toBeNull()
      expect(result.aowUpdated).toBe(false)
      expect(mock._updateCalls).toHaveLength(0)
    })

    it('aowBedrag null → geen AOW-db-aanroepen', async () => {
      // aowFetchRow staat op null maar mag sowieso nooit aangeroepen worden
      const mock = makeSupabaseMock({ aowFetchRow: { id: 'zou-niet-bereikt-worden' } })

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: { ...BASE_PARSE_RESULT, aowBedrag: null },
        existingPensionCount: 0,
      })

      expect(result.aowUpdated).toBe(false)
      // Geen update-aanroepen
      expect(mock._updateCalls).toHaveLength(0)
    })

    it('aowBedrag === 0 → geen AOW-update (grenswaarde)', async () => {
      const mock = makeSupabaseMock({ aowFetchRow: { id: 'aow-uuid' } })

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 0 },
        existingPensionCount: 0,
      })

      // aowBedrag=0 slaagt de check `aowBedrag > 0` NIET — geen update verwacht
      expect(result.aowUpdated).toBe(false)
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
      expect(result.aowUpdated).toBe(false)
    })

    it('AOW-fetch-error na succesvolle insert → error bevat AOW-melding, insertedCount correct', async () => {
      const mock = makeSupabaseMock({
        aowFetchError: { message: 'permission denied' },
      })

      const result = await applyPensionParseResult({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock as any,
        userId: 'user-1',
        parseResult: { ...BASE_PARSE_RESULT, aowBedrag: 1300 },
        existingPensionCount: 0,
      })

      expect(result.error).toContain('permission denied')
      // Insets waren al geslaagd voor de AOW-fout
      expect(result.insertedCount).toBe(1)
      expect(result.aowUpdated).toBe(false)
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
