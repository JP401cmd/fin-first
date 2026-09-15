import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/questionnaires — de vragenlijsten die voor DEZE gebruiker openstaan
 * (ADR 0147, gerichte verspreiding).
 *
 * Vastgelegd:
 *   - het oude gedrag blijft: een actieve lijst zónder verspreiding is voor
 *     iedereen zichtbaar, met exact dezelfde velden als vóór ADR 0147;
 *   - modus 'handmatig' toont de lijst alleen aan wie een uitnodigingsrij heeft;
 *   - modus 'regels' matcht compute-on-read en legt de uitnodiging vast met
 *     bron 'regel'; zonder match houdt een eigen OPEN sessie de lijst zichtbaar
 *     ("wat je begon, mag je afmaken");
 *   - een niet-uitgerolde uitnodigingstabel geeft het oude gedrag, geen 500;
 *   - modus 'groepen' (fase 3): statisch lid of dynamische regel-match maakt
 *     zichtbaar en legt een regel-rij met groep_ids vast; ontbrekende
 *     groepstabellen houden de lijst dicht; groepsqueries en de context
 *     (met of zonder stromen) alleen wanneer een lijst erom vraagt.
 */

type Resultaat = { data: unknown; error: unknown }

let resultaten: Record<string, Resultaat[]>
let inserts: { tabel: string; rij: Record<string, unknown> }[]
let gelezenTabellen: string[]
const mockClaims = vi.fn()

/** Minimale supabase-keten: elke afsluiter pakt het volgende resultaat van die tabel. */
function keten(tabel: string) {
  gelezenTabellen.push(tabel)
  const volgende = (): Resultaat => resultaten[tabel]?.shift() ?? { data: null, error: null }
  const k: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in', 'gte', 'order', 'limit']) k[m] = () => k
  k.maybeSingle = async () => volgende()
  k.single = async () => volgende()
  k.then = (resolve: (r: Resultaat) => unknown) => resolve(volgende())
  k.insert = (rij: Record<string, unknown>) => {
    inserts.push({ tabel, rij })
    return k
  }
  return k
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: (tabel: string) => keten(tabel) })),
  getAuthClaims: (...args: unknown[]) => mockClaims(...args),
}))

// De eigen-rij meta heeft zijn eigen tests; hier is hij een vaste fixture zodat
// de regels deterministisch matchen.
vi.mock('@/lib/questionnaires/gebruiker-context', () => ({
  laadGebruikerContext: vi.fn(async (_client: unknown, _userId: string, nu: Date = new Date()) => ({
    registratie: new Date(nu.getTime() - 30 * 86_400_000),
    actieveDagen30: 5,
    laatstActief: new Date(nu.getTime() - 86_400_000),
    dominanteStroom: null,
    nu,
  })),
}))

import { GET } from './route'
import { laadGebruikerContext } from '@/lib/questionnaires/gebruiker-context'

const USER = 'user-1'
const QID = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const SID = '3f2b6c1e-8a4d-4c2b-9f1e-2d3c4b5a6f70'

function lijst(verspreiding: unknown) {
  return {
    id: QID,
    title: 'Hoe bevalt Fin?',
    description: 'Vijf korte vragen',
    created_at: '2026-09-01T10:00:00.000Z',
    verspreiding,
    questionnaire_questions: [{ id: 'v1' }, { id: 'v2' }],
  }
}

/** Zet de drie wachtrijen die de route in deze volgorde leegtrekt. */
function stel(opties: {
  lijsten?: unknown[]
  sessies?: unknown[]
  uitnodigingen?: Resultaat
  insertResultaat?: Resultaat
  leden?: Resultaat
  groepen?: Resultaat
}) {
  resultaten = {
    questionnaires: [{ data: opties.lijsten ?? [], error: null }],
    questionnaire_sessions: [{ data: opties.sessies ?? [], error: null }],
    questionnaire_invitations: [
      opties.uitnodigingen ?? { data: [], error: null },
      ...(opties.insertResultaat ? [opties.insertResultaat] : []),
    ],
    user_group_members: [opties.leden ?? { data: [], error: null }],
    user_groups: [opties.groepen ?? { data: [], error: null }],
  }
}

async function body(res: Response) {
  return (await res.json()) as {
    questionnaires: Record<string, unknown>[]
    open_count: number
    popup_kandidaat_id: string | null
  }
}

beforeEach(() => {
  resultaten = {}
  inserts = []
  gelezenTabellen = []
  vi.mocked(laadGebruikerContext).mockClear()
  mockClaims.mockReset().mockResolvedValue({ sub: USER, email: 'user@test.nl' })
})

describe('GET /api/questionnaires', () => {
  it('401 zonder sessie', async () => {
    mockClaims.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it('een lijst zonder verspreiding blijft voor iedereen zichtbaar, met de oude velden', async () => {
    stel({ lijsten: [lijst(null)] })

    const res = await GET()
    expect(res.status).toBe(200)
    const data = await body(res)

    expect(data.questionnaires).toHaveLength(1)
    expect(data.questionnaires[0]).toMatchObject({
      id: QID,
      title: 'Hoe bevalt Fin?',
      description: 'Vijf korte vragen',
      question_count: 2,
      answered_count: 0,
      has_open_session: false,
      has_completed: false,
      open: true,
      popup: { aan: false, kandidaat: false },
      invitation: null,
    })
    expect(data.open_count).toBe(1)
    // Geen popup aan → niemand is kandidaat, en er is niets vastgelegd.
    expect(data.popup_kandidaat_id).toBeNull()
    expect(inserts).toHaveLength(0)
  })

  it('een lijst zonder vragen blijft weggefilterd', async () => {
    stel({ lijsten: [{ ...lijst(null), questionnaire_questions: [] }] })
    const data = await body(await GET())
    expect(data.questionnaires).toHaveLength(0)
    expect(data.open_count).toBe(0)
  })

  it('modus handmatig: onzichtbaar zonder uitnodiging', async () => {
    stel({ lijsten: [lijst({ doelgroep: { modus: 'handmatig', regels: [], groep_ids: [] } })] })

    const data = await body(await GET())
    expect(data.questionnaires).toHaveLength(0)
    expect(data.open_count).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it('modus handmatig: zichtbaar mét een rij bron=handmatig', async () => {
    stel({
      lijsten: [lijst({ doelgroep: { modus: 'handmatig', regels: [], groep_ids: [] } })],
      uitnodigingen: {
        data: [
          {
            questionnaire_id: QID,
            bron: 'handmatig',
            invited_at: '2026-09-10T08:00:00.000Z',
            shown_at: null,
            snoozed_until: null,
            dismissed_at: null,
            dismiss_count: 0,
          },
        ],
        error: null,
      },
    })

    const data = await body(await GET())
    expect(data.questionnaires).toHaveLength(1)
    expect(data.questionnaires[0].invitation).toMatchObject({ bron: 'handmatig', dismiss_count: 0 })
    expect(data.open_count).toBe(1)
    // Een bestaande rij wordt nooit overschreven.
    expect(inserts).toHaveLength(0)
  })

  it('modus regels: match maakt de lijst zichtbaar én legt de uitnodiging vast (bron regel)', async () => {
    const verspreiding = {
      doelgroep: { modus: 'regels', regels: [{ soort: 'dagen_sinds_registratie', min: 7 }], groep_ids: [] },
      popup: { aan: true, cooldown_dagen: 14, snooze_dagen: 7, max_weigeringen: 2 },
    }
    stel({
      lijsten: [lijst(verspreiding)],
      insertResultaat: {
        data: {
          questionnaire_id: QID,
          bron: 'regel',
          invited_at: '2026-09-15T09:00:00.000Z',
          shown_at: null,
          snoozed_until: null,
          dismissed_at: null,
          dismiss_count: 0,
        },
        error: null,
      },
    })

    const data = await body(await GET())
    expect(data.questionnaires).toHaveLength(1)

    expect(inserts).toHaveLength(1)
    expect(inserts[0].tabel).toBe('questionnaire_invitations')
    expect(inserts[0].rij).toMatchObject({ questionnaire_id: QID, user_id: USER, bron: 'regel' })
    expect((inserts[0].rij.bron_detail as { gematcht: unknown[] }).gematcht).toHaveLength(1)

    // Popup aan, niets getoond/geweigerd → deze lijst is dé kandidaat.
    expect(data.questionnaires[0].popup).toEqual({ aan: true, kandidaat: true })
    expect(data.popup_kandidaat_id).toBe(QID)
  })

  it('modus regels: geen match → onzichtbaar, tenzij je er al een open sessie op hebt', async () => {
    const verspreiding = {
      doelgroep: { modus: 'regels', regels: [{ soort: 'dagen_sinds_registratie', min: 365 }], groep_ids: [] },
    }

    stel({ lijsten: [lijst(verspreiding)] })
    expect((await body(await GET())).questionnaires).toHaveLength(0)

    stel({
      lijsten: [lijst(verspreiding)],
      sessies: [
        { id: SID, questionnaire_id: QID, completed_at: null, questionnaire_responses: [{ question_id: 'v1' }] },
      ],
    })
    const data = await body(await GET())
    expect(data.questionnaires).toHaveLength(1)
    expect(data.questionnaires[0]).toMatchObject({ has_open_session: true, answered_count: 1 })
    // Zichtbaar via de open sessie, niet via een regel: geen uitnodigingsrij.
    expect(inserts).toHaveLength(0)
  })

  it('een afgeronde lijst telt niet meer mee als open', async () => {
    stel({
      lijsten: [lijst(null)],
      sessies: [{ id: SID, questionnaire_id: QID, completed_at: '2026-09-12T10:00:00.000Z' }],
    })
    const data = await body(await GET())
    expect(data.questionnaires[0]).toMatchObject({ has_completed: true, open: false })
    expect(data.open_count).toBe(0)
  })

  it('een falende uitnodigingsquery (tabel nog niet uitgerold) geeft nog steeds 200 met de lijst', async () => {
    stel({
      lijsten: [lijst(null)],
      uitnodigingen: { data: null, error: { code: '42P01', message: 'relation does not exist' } },
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const data = await body(res)
    expect(data.questionnaires).toHaveLength(1)
    expect(data.questionnaires[0].invitation).toBeNull()
    expect(data.open_count).toBe(1)
  })
})

describe('GET /api/questionnaires — groepen en waardestromen (ADR 0147, fase 2 en 3)', () => {
  const GROEP_S = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  const GROEP_D = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'

  function groepenLijst(groepIds: string[]) {
    return lijst({ doelgroep: { modus: 'groepen', regels: [], groep_ids: groepIds } })
  }

  it('statisch lid → zichtbaar, en de uitnodiging wordt vastgelegd als regel-rij met groep_ids', async () => {
    stel({
      lijsten: [groepenLijst([GROEP_S])],
      leden: { data: [{ group_id: GROEP_S }], error: null },
    })

    const data = await body(await GET())
    expect(data.questionnaires).toHaveLength(1)
    expect(data.open_count).toBe(1)

    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toEqual({
      tabel: 'questionnaire_invitations',
      rij: { questionnaire_id: QID, user_id: USER, bron: 'regel', bron_detail: { groep_ids: [GROEP_S] } },
    })
    // Alleen statisch in het spel → geen context nodig.
    expect(laadGebruikerContext).not.toHaveBeenCalled()
  })

  it('geen lid en geen dynamische match → onzichtbaar, niets vastgelegd', async () => {
    stel({
      lijsten: [groepenLijst([GROEP_S])],
      leden: { data: [{ group_id: 'cccccccc-dddd-4eee-8fff-000000000000' }], error: null },
    })

    const data = await body(await GET())
    expect(data.questionnaires).toHaveLength(0)
    expect(data.open_count).toBe(0)
    expect(inserts).toHaveLength(0)
  })

  it('dynamische groep met een matchende regel → zichtbaar via de context', async () => {
    stel({
      lijsten: [groepenLijst([GROEP_D])],
      groepen: {
        data: [{ id: GROEP_D, soort: 'dynamisch', regels: [{ soort: 'actieve_dagen_30', min: 3 }] }],
        error: null,
      },
    })

    const data = await body(await GET())
    expect(data.questionnaires).toHaveLength(1)
    expect(laadGebruikerContext).toHaveBeenCalledWith(expect.anything(), USER, expect.any(Date), { metStromen: false })
    expect((inserts[0].rij.bron_detail as { groep_ids: string[] }).groep_ids).toEqual([GROEP_D])
  })

  it('dynamische groep zonder match → onzichtbaar', async () => {
    stel({
      lijsten: [groepenLijst([GROEP_D])],
      groepen: {
        data: [{ id: GROEP_D, soort: 'dynamisch', regels: [{ soort: 'dagen_sinds_registratie', min: 365 }] }],
        error: null,
      },
    })
    expect((await body(await GET())).questionnaires).toHaveLength(0)
  })

  it('groepstabellen ontbreken → de lijst is onzichtbaar, geen 500', async () => {
    stel({
      lijsten: [groepenLijst([GROEP_S, GROEP_D])],
      leden: { data: null, error: { code: 'PGRST205', message: 'table not found' } },
      groepen: { data: null, error: { code: '42P01', message: 'relation does not exist' } },
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const data = await body(res)
    expect(data.questionnaires).toHaveLength(0)
    expect(inserts).toHaveLength(0)
  })

  it('een regel op de dominante stroom laadt de context mét stromen, en zonder groepen-lijst geen groepsqueries', async () => {
    stel({
      lijsten: [
        lijst({
          doelgroep: { modus: 'regels', regels: [{ soort: 'dominante_stroom', stroom: 'toekomst' }], groep_ids: [] },
        }),
      ],
    })

    await GET()
    expect(laadGebruikerContext).toHaveBeenCalledWith(expect.anything(), USER, expect.any(Date), { metStromen: true })
    expect(gelezenTabellen).not.toContain('user_group_members')
    expect(gelezenTabellen).not.toContain('user_groups')
  })

  it('een lijst op iedereen raakt geen groepstabellen en laadt geen context', async () => {
    stel({ lijsten: [lijst(null)] })
    await GET()
    expect(gelezenTabellen).not.toContain('user_group_members')
    expect(gelezenTabellen).not.toContain('user_groups')
    expect(laadGebruikerContext).not.toHaveBeenCalled()
  })
})
