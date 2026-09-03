import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regressietests voor de moderatie-acties van /beheer/calculator-reports.
 *
 * WAT HIER BEWAAKT WORDT. Beide acties draaien op de anon RLS-client mét de
 * sessie van de beheerder; `isSuperAdmin()` is een applicatiecontrole, geen
 * databaserecht. Tot migratie `20260903110000` ontbrak de UPDATE-policy op
 * `calculator_reports` volledig en was die op `custom_calculators` strikt
 * eigen-rij, dus beide updates raakten 0 rijen op andermans content. Een
 * Supabase-`.update()` die 0 rijen raakt geeft `error: null` — de acties
 * meldden daardoor succes terwijl er niets gebeurde.
 *
 * Deze suite zet vast dat 0 geraakte rijen een FOUT is en geen succes. Dat is
 * bewust een test op het aantal geraakte rijen en niet op de policy zelf: de
 * policy kan alleen in de database bewezen worden, maar dát de code een lege
 * uitkomst niet als succes verkoopt, hoort hier.
 */

const mockFrom = vi.fn()
const mockIsSuperAdmin = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { markReviewedAction, hideCalculatorAction } from './actions'

/** Per tabel het resultaat dat de await-terminal oplevert. */
let resultByTable: Record<string, { data: unknown; error: unknown }> = {}
let updatedTables: string[] = []

/**
 * Chainbare query-builder: elke methode geeft zichzelf terug en het object is
 * zelf awaitable, zodat zowel `.eq().eq().select()` als `.eq().eq()` als
 * terminal werkt (de twee vormen die actions.ts gebruikt).
 */
function builder(table: string) {
  const result = resultByTable[table] ?? { data: [], error: null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    update: () => {
      updatedTables.push(table)
      return b
    },
    eq: () => b,
    select: () => b,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return b
}

beforeEach(() => {
  vi.clearAllMocks()
  resultByTable = {}
  updatedTables = []
  mockIsSuperAdmin.mockResolvedValue(true)
  mockFrom.mockImplementation((table: string) => builder(table))
})

describe('markReviewedAction', () => {
  it('slaagt wanneer de melding daadwerkelijk is bijgewerkt', async () => {
    resultByTable['calculator_reports'] = { data: [{ id: 'r1' }], error: null }
    await expect(markReviewedAction('r1')).resolves.toEqual({ ok: true })
  })

  it('meldt GEEN succes wanneer 0 rijen zijn geraakt', async () => {
    // De kern: dit was de stille no-op. `error: null` + lege data mag nooit
    // als geslaagde triage terugkomen.
    resultByTable['calculator_reports'] = { data: [], error: null }
    const res = await markReviewedAction('r1')
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('weigert een niet-superadmin zonder de database aan te raken', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await markReviewedAction('r1')
    expect(res).toEqual({ ok: false, error: 'Geen rechten.' })
    expect(updatedTables).toEqual([])
  })
})

describe('hideCalculatorAction', () => {
  it('verbergt de rekenhulp en markeert de meldingen', async () => {
    resultByTable['custom_calculators'] = { data: [{ id: 'c1' }], error: null }
    resultByTable['calculator_reports'] = { data: [{ id: 'r1' }], error: null }
    await expect(hideCalculatorAction('r1', 'c1')).resolves.toEqual({ ok: true })
    expect(updatedTables).toEqual(['custom_calculators', 'calculator_reports'])
  })

  it('faalt — en laat de meldingen met rust — als verbergen 0 rijen raakt', async () => {
    // Het gevaarlijkste geval: zou stap 1 stil falen en stap 2 wél doorgaan,
    // dan verdwijnt de melding uit de inbox terwijl de gemelde rekenhulp
    // gewoon publiek blijft staan.
    resultByTable['custom_calculators'] = { data: [], error: null }
    const res = await hideCalculatorAction('r1', 'c1')
    expect(res.ok).toBe(false)
    expect(updatedTables).toEqual(['custom_calculators'])
  })

  it('accepteert 0 openstaande meldingen nadat het verbergen is geslaagd', async () => {
    // Hier is leeg juist géén fout: de rekenhulp staat niet meer publiek, en
    // dat een parallelle beheerder de melding al had afgevinkt verandert dat
    // niet.
    resultByTable['custom_calculators'] = { data: [{ id: 'c1' }], error: null }
    resultByTable['calculator_reports'] = { data: [], error: null }
    await expect(hideCalculatorAction('r1', 'c1')).resolves.toEqual({ ok: true })
  })
})
