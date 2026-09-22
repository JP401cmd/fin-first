import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/admin/news-duiding/steekproef — de handmatige G7-registratie:
 * gate, validatie, en read-modify-write op één app_settings-sleutel.
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))

import { POST } from './route'
import { POORT_STEEKPROEF_KEY } from '@/lib/krant/duiding-beheer'

let bestaand: unknown = null
let geschreven: Array<Record<string, unknown>> = []
let leesFout: unknown = null
let auditRijen: Array<Record<string, unknown>> = []

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  bestaand = null
  leesFout = null
  geschreven = []
  auditRijen = []
  mockFrom.mockReset().mockImplementation((tabel: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = () => b
    b.eq = () => b
    b.maybeSingle = () => Promise.resolve({ data: bestaand === null ? null : { value: bestaand }, error: leesFout })
    b.upsert = (rij: Record<string, unknown>) => {
      geschreven.push(rij)
      return Promise.resolve({ error: null })
    }
    b.insert = (rij: Record<string, unknown>) => {
      if (tabel === 'admin_actions_log') auditRijen.push(rij)
      return Promise.resolve({ error: null })
    }
    return b
  })
})

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/admin/news-duiding/steekproef', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const GELDIG = { week: '2026-W38', gecontroleerd: 20, fouten: 1 }

describe('POST /api/admin/news-duiding/steekproef', () => {
  it('401/403 vóór de DB', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await post(GELDIG)).status).toBe(401)
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    expect((await post(GELDIG)).status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('weigert een ongeldige body met een 400 en de platte error-envelope', async () => {
    for (const body of [
      { week: '2026-38', gecontroleerd: 20, fouten: 0 },
      { week: '2026-W38', gecontroleerd: 20, fouten: 21 },
      { week: '2026-W38', gecontroleerd: 0, fouten: 0 },
      // strictObject: een veld dat de server zelf zet mag de client niet meesturen.
      { week: '2026-W38', gecontroleerd: 20, fouten: 0, op: '2026-09-21T10:00:00Z' },
    ]) {
      const res = await post(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
    expect(geschreven).toHaveLength(0)
  })

  // Eindreview 1F fase 2, M3: minder dan STEEKPROEF_OMVANG nalezen mag worden
  // VASTGELEGD — het telt alleen niet mee voor de poort. Eén plek beslist dat
  // (`steekproefWeekGehaald`), niet ook de route met een 400.
  it('legt een week onder de poortomvang wél vast; de poort beslist, niet de route', async () => {
    const res = await post({ week: '2026-W38', gecontroleerd: 12, fouten: 0 })
    expect(res.status).toBe(200)
    const register = JSON.parse(geschreven[0].value as string)
    expect(register['2026-W38']).toMatchObject({ gecontroleerd: 12, fouten: 0 })
  })

  it('schrijft de week met het moment, onder de vaste sleutel — zonder beheerder-id', async () => {
    const res = await post(GELDIG)
    expect(res.status).toBe(200)
    expect(geschreven).toHaveLength(1)
    expect(geschreven[0].key).toBe(POORT_STEEKPROEF_KEY)
    const register = JSON.parse(geschreven[0].value as string)
    expect(register['2026-W38']).toEqual({ gecontroleerd: 20, fouten: 1, op: expect.any(String) })
    // Alleen tellingen: geen artikel-id, geen kop, geen samenvatting.
    expect(geschreven[0].value).not.toMatch(/titel|samenvatting|artikel/i)
    // L2: de sleutel draagt geen uuid, dus élke `authenticated` rol kan deze rij
    // lezen. De beheerder-id hoort daarom in admin_actions_log, niet hier.
    expect(geschreven[0].value).not.toMatch(/admin-1/)
  })

  it('read-modify-write: andere weken blijven staan, dezelfde week wordt gecorrigeerd', async () => {
    bestaand = JSON.stringify({
      '2026-W37': { gecontroleerd: 20, fouten: 0, op: '2026-09-14T10:00:00Z' },
      '2026-W38': { gecontroleerd: 20, fouten: 5, op: '2026-09-21T10:00:00Z' },
    })
    await post(GELDIG)
    const register = JSON.parse(geschreven[0].value as string)
    expect(Object.keys(register).sort()).toEqual(['2026-W37', '2026-W38'])
    expect(register['2026-W37'].op).toBe('2026-09-14T10:00:00Z')
    expect(register['2026-W38']).toMatchObject({ fouten: 1 })
  })

  it('dezelfde invoer twee keer versturen levert hetzelfde register op (idempotent op de waarden)', async () => {
    await post(GELDIG)
    bestaand = geschreven[0].value
    await post(GELDIG)
    const eerste = JSON.parse(geschreven[0].value as string)['2026-W38']
    const tweede = JSON.parse(geschreven[1].value as string)['2026-W38']
    expect({ ...tweede, op: eerste.op }).toEqual(eerste)
  })

  // Security-review 1F fase 2, bevinding 3: het register bewaart alleen de
  // LAATSTE telling per week, dus zonder auditregel is een gefaalde week
  // achteraf spoorloos op "gehaald" te zetten — en G7 is de menselijke helft
  // van een poort die beslist of de Krant naar lezers mag.
  it('legt elke registratie vast in admin_actions_log, mét de overschreven telling', async () => {
    bestaand = JSON.stringify({
      '2026-W38': { gecontroleerd: 20, fouten: 5, op: '2026-09-21T10:00:00Z' },
    })
    await post(GELDIG)
    expect(auditRijen).toHaveLength(1)
    expect(auditRijen[0]).toMatchObject({ action: 'nieuws.duiding.steekproef', actor_id: 'admin-1', target_label: '2026-W38' })
    expect(auditRijen[0].detail).toMatchObject({
      week: '2026-W38',
      gecontroleerd: 20,
      fouten: 1,
      vorige: { gecontroleerd: 20, fouten: 5, op: '2026-09-21T10:00:00Z' },
    })
  })

  it('zonder overschrijving staat `vorige` op null — geen verzonnen voorgeschiedenis', async () => {
    await post(GELDIG)
    expect((auditRijen[0].detail as { vorige: unknown }).vorige).toBeNull()
  })

  it('een leesfout geeft een 500 met een generieke tekst en schrijft niets', async () => {
    leesFout = new Error('kapot')
    const res = await post(GELDIG)
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/kapot/)
    expect(geschreven).toHaveLength(0)
  })
})
