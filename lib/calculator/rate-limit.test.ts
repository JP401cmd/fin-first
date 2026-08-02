import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkAndIncrement, getUsage, type UsageKind } from './rate-limit'

/**
 * De weekteller van de AI-rekenhulp — atomair (ADR 0076, tweede vindplaats).
 *
 * ## Wat er stuk was
 *
 * `checkAndIncrement` las `generations, refinements`, vergeleek met 10/5 en
 * schreef daarna een in TypeScript berekende `n + 1` terug via een UPSERT.
 * Tussen lezen en schrijven paste een heel tweede verzoek: twee gelijktijdige
 * generaties zagen allebei ruimte, gingen allebei door en schreven allebei
 * dezelfde waarde — twee LLM-aanroepen, één tik. En omdat de UPSERT de héle
 * rij meestuurde (óók de teller die dít verzoek niet ophoogde), kon een
 * gelijktijdige verfijning een generatie-ophoging zelfs terugdraaien.
 *
 * ## Wat deze tests bewijzen — en wat niet
 *
 * De atomariteit zelf ligt in de DATABASE: één
 * `INSERT … ON CONFLICT DO UPDATE … WHERE <teller> < <limiet> … RETURNING`
 * onder de rijvergrendeling (migratie 20260803090000). Een unit-test kan geen
 * echte rijvergrendeling naspelen. Wat ze wél kan — en hieronder ook doet — is
 * vastleggen dat de APPLICATIE geen oordeel meer velt:
 *
 *  1. de uitkomst volgt uitsluitend de RPC;
 *  2. de aanroeper stuurt geen limiet, geen gebruiker en geen weeksleutel mee,
 *     en kan de rem dus niet oprekken;
 *  3. de module raakt de tabel nergens meer rechtstreeks aan;
 *  4. bij twee ECHT interleavende aanroepen — beide binnen vóórdat er één heeft
 *     geschreven, wat de test expliciet vaststelt — komt er samen niet meer dan
 *     de limiet doorheen.
 *
 * De stub hieronder modelleert de kritieke sectie synchroon (de JS-eventloop is
 * single-threaded); dat is de tegenhanger van de rijvergrendeling. Zou de
 * module nog steeds zelf lezen-en-ophogen, dan zou test 4 twee keer `allowed`
 * opleveren.
 */

type Row = { generations: number; refinements: number }

/** Maandag; de echte waarde komt uit `date_trunc('week', …)` in de database. */
const WEEK = '2026-08-03'

interface DbOptions {
  row?: Row
  genLimit?: number
  refLimit?: number
  /** Slagboom vóór de kritieke sectie — alleen voor de race-test. */
  gate?: () => Promise<void>
  rpcError?: { message: string }
}

function makeDb(opts: DbOptions = {}) {
  const genLimit = opts.genLimit ?? 10
  const refLimit = opts.refLimit ?? 5
  let row: Row | null = opts.row ? { ...opts.row } : null

  const calls: { name: string; args: unknown }[] = []
  /** Stand van de betrokken teller op het moment dat een verzoek binnenkwam. */
  const seenOnEntry: number[] = []

  async function reserve(kind: UsageKind) {
    const limit = kind === 'generation' ? genLimit : refLimit
    const read = (r: Row | null) =>
      r ? (kind === 'generation' ? r.generations : r.refinements) : 0

    seenOnEntry.push(read(row))
    if (opts.gate) await opts.gate()

    // ── Kritieke sectie — geen `await` hierbinnen ────────────────────────────
    // Tegenhanger van INSERT … ON CONFLICT DO UPDATE onder de
    // rijvergrendeling: aanmaken-of-ophogen en de limiettoets zijn ondeelbaar.
    if (!row) row = { generations: 0, refinements: 0 }
    const current = read(row)
    const allowed = current < limit
    if (allowed) {
      if (kind === 'generation') row.generations += 1
      else row.refinements += 1
    }
    const used = read(row)
    return {
      slot_allowed: allowed,
      slot_kind: kind,
      slot_limit: limit,
      slot_used: used,
      slot_remaining: Math.max(0, limit - used),
      slot_generations: row.generations,
      slot_refinements: row.refinements,
      slot_week_start: WEEK,
    }
  }

  const client = {
    // De module hoort de tabel niet meer rechtstreeks aan te raken; dat wás
    // het gebrek. Een aanroep hier is dus geen mock-gat maar een testfout.
    from: vi.fn(() => {
      throw new Error('rate-limit.ts mag ai_calculator_usage niet rechtstreeks lezen of schrijven')
    }),
    rpc: vi.fn(async (name: string, args?: unknown) => {
      calls.push({ name, args })
      if (opts.rpcError) return { data: null, error: opts.rpcError }
      if (name === 'reserve_ai_calculator_slot') {
        const kind = (args as { p_kind: UsageKind }).p_kind
        return { data: [await reserve(kind)], error: null }
      }
      if (name === 'ai_calculator_week_usage') {
        return {
          data: [
            {
              usage_week_start: WEEK,
              usage_generations: row?.generations ?? 0,
              usage_refinements: row?.refinements ?? 0,
              usage_generation_limit: genLimit,
              usage_refinement_limit: refLimit,
            },
          ],
          error: null,
        }
      }
      return { data: null, error: { message: `onbekende rpc: ${name}` } }
    }),
  }

  return {
    client: client as unknown as SupabaseClient,
    calls,
    seenOnEntry,
    current: () => row,
    from: client.from,
  }
}

describe('checkAndIncrement — de reservering', () => {
  it('eerste verzoek van de week (nog geen rij) → toegestaan, teller op 1', async () => {
    const db = makeDb()

    const r = await checkAndIncrement(db.client, 'generation')

    expect(r.allowed).toBe(true)
    expect(r.limit).toBe(10)
    expect(r.used).toBe(1)
    expect(r.remaining).toBe(9)
    expect(db.current()).toEqual({ generations: 1, refinements: 0 })
  })

  it('een verfijning hoogt de ANDERE teller op, met haar eigen lagere plafond', async () => {
    const db = makeDb({ row: { generations: 3, refinements: 1 } })

    const r = await checkAndIncrement(db.client, 'refinement')

    expect(r.allowed).toBe(true)
    expect(r.limit).toBe(5)
    expect(r.used).toBe(2)
    // De generatie-teller blijft ongemoeid. Dat was met de oude UPSERT niet
    // gegarandeerd: die stuurde beide kolommen mee vanaf een eerder gelezen
    // momentopname en kon een gelijktijdige generatie terugdraaien.
    expect(db.current()).toEqual({ generations: 3, refinements: 2 })
  })

  it('op het maximum → geweigerd, en de teller beweegt niet', async () => {
    const db = makeDb({ row: { generations: 10, refinements: 0 } })

    const r = await checkAndIncrement(db.client, 'generation')

    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.used).toBe(10)
    expect(db.current()).toEqual({ generations: 10, refinements: 0 })
  })

  it('de twee tellers zijn onafhankelijk: generaties op, verfijnen mag nog', async () => {
    const db = makeDb({ row: { generations: 10, refinements: 0 } })

    const geweigerd = await checkAndIncrement(db.client, 'generation')
    const toegestaan = await checkAndIncrement(db.client, 'refinement')

    expect(geweigerd.allowed).toBe(false)
    expect(toegestaan.allowed).toBe(true)
  })

  it('laat samen niet meer dan de limiet door bij twee ECHT gelijktijdige verzoeken', async () => {
    // Slagboom: geen van beide verzoeken mag de kritieke sectie in vóórdat het
    // ándere ook binnen is. Zo is de race deterministisch gelopen in plaats van
    // "meestal wel" — een timing-afhankelijke test die soms per ongeluk slaagt
    // bewijst hier niets.
    let arrived = 0
    let openBarrier!: () => void
    const bothArrived = new Promise<void>((resolve) => {
      openBarrier = resolve
    })
    const gate = async () => {
      arrived += 1
      if (arrived >= 2) openBarrier()
      await bothArrived
    }

    // Limiet op 1 zodat "één te veel" meteen zichtbaar is.
    const db = makeDb({ genLimit: 1, gate })

    const [a, b] = await Promise.all([
      checkAndIncrement(db.client, 'generation'),
      checkAndIncrement(db.client, 'generation'),
    ])

    // De race is écht gelopen: beide verzoeken stonden bij de rem terwijl de
    // teller nog op 0 stond — precies de toestand waarin de oude
    // read-then-write twee keer "er is ruimte" concludeerde.
    expect(db.seenOnEntry).toEqual([0, 0])

    // En tóch komt er maar één doorheen.
    expect([a.allowed, b.allowed].sort()).toEqual([false, true])
    expect(db.current()).toEqual({ generations: 1, refinements: 0 })
  })

  it('stuurt geen limiet, geen gebruiker en geen weeksleutel mee — de rem is niet op te rekken', async () => {
    // De functie staat via PostgREST open voor elke ingelogde gebruiker. Zat de
    // limiet in de signatuur, dan riep iemand haar aan met p_limit => 999999.
    // De gebruiker komt uit auth.uid(), de week uit date_trunc() in de database.
    const db = makeDb()

    await checkAndIncrement(db.client, 'generation')

    expect(db.calls).toHaveLength(1)
    expect(db.calls[0]).toEqual({
      name: 'reserve_ai_calculator_slot',
      args: { p_kind: 'generation' },
    })
  })

  it('raakt de tabel nergens meer rechtstreeks aan', async () => {
    const db = makeDb()

    await checkAndIncrement(db.client, 'generation')

    expect(db.from).not.toHaveBeenCalled()
  })

  it('bij een DB-fout: geweigerd MÉT foutsignaal — nooit stil doorlaten', async () => {
    // Fail-closed by construction: wie de error-controle vergeet, weigert de
    // actie. De route vertaalt dit naar een 500, niet naar een 429 — "je
    // limiet is bereikt" zou hier een leugen zijn.
    const db = makeDb({ rpcError: { message: 'boom' } })

    const r = await checkAndIncrement(db.client, 'generation')

    expect(r.allowed).toBe(false)
    expect(r.error).toEqual({ message: 'boom' })
  })
})

describe('getUsage — de badge', () => {
  it('zonder rij → nullen, met de limieten uit de database', async () => {
    const db = makeDb()

    const u = await getUsage(db.client)

    expect(u).toEqual({
      generations: 0,
      refinements: 0,
      maxGenerations: 10,
      maxRefinements: 5,
      weekStart: WEEK,
    })
  })

  it('leest de plafonds uit de RPC en niet uit een TypeScript-constante', async () => {
    // Stonden 10/5 óók in TypeScript, dan zou een migratie die de rem verandert
    // deze badge stil laten liegen. Deze database zegt 3/2 — dus zegt de badge
    // dat ook.
    const db = makeDb({ genLimit: 3, refLimit: 2, row: { generations: 1, refinements: 1 } })

    const u = await getUsage(db.client)

    expect(u).toMatchObject({
      generations: 1,
      refinements: 1,
      maxGenerations: 3,
      maxRefinements: 2,
    })
  })

  it('vraagt de week niet zelf uit: de RPC krijgt geen argumenten', async () => {
    const db = makeDb()

    await getUsage(db.client)

    expect(db.calls).toEqual([{ name: 'ai_calculator_week_usage', args: undefined }])
  })

  it('bij een leesfout → foutsignaal, zodat de badge zich verbergt in plaats van gokt', async () => {
    const db = makeDb({ rpcError: { message: 'boom' } })

    const u = await getUsage(db.client)

    expect(u.error).toEqual({ message: 'boom' })
    expect(u.maxGenerations).toBe(0)
  })
})
