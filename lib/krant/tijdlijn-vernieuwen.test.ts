import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * verversEigenTijdlijn (Krant 1C fase 2, U11 "en een knop"; eindreview Y3 /
 * security Y1, 29-09: de rem is een ATOMAIRE claim op
 * nieuwsprofiel.tijdlijn_vernieuwd_at, losgekoppeld van de laatste editie).
 * Externe afhankelijkheden gemockt zoals in tijdlijn-run.test.ts /
 * cron/route.test.ts: de matcher-keten (editie-loader, tijdlijn-run) en de
 * aow-cache zijn elders bewezen. Hier telt de eigen logica: bronkeuze, de
 * atomaire rem, en "niets nieuws" — met de echte nep-client zodat de
 * `.or()`-claim en de `.eq()`-scoping écht worden uitgevoerd, niet alleen
 * beweerd.
 */

vi.mock('./editie-loader', () => ({ laadKandidaten: vi.fn(async () => ({ artikelen: [{ id: 'a1' }], ongeldig: 0 })) }))
vi.mock('@/lib/reference-cache', () => ({ getAowLeeftijden: vi.fn(async () => []) }))
const mockVervers = vi.fn()
const mockRuim = vi.fn()
vi.mock('./tijdlijn-run', () => ({
  ververs: (...a: unknown[]) => mockVervers(...a),
  ruimTijdlijnOp: (...a: unknown[]) => mockRuim(...a),
}))
const beta = { open: false }
vi.mock('./tijdlijn-beta', () => ({
  inTijdlijnBeta: (rol: string | null) => beta.open || rol === 'superadmin',
}))

import { laadKandidaten } from './editie-loader'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { maakNepClient } from './nep-client.fixture'
import { VERNIEUW_INTERVAL_MS, verversEigenTijdlijn } from './tijdlijn-vernieuwen'

const UID = 'user-a'
const NU = new Date('2026-09-29T12:00:00Z')

/**
 * Het echte or-filter van de atomaire claim (`tijdlijn_vernieuwd_at.is.null,
 * tijdlijn_vernieuwd_at.lt."<grens>"`) — geen `and()`-nesting, dus een simpele
 * komma-splitsing van twee termen volstaat (in tegenstelling tot het
 * drieledige cursor-filter van tijdlijn-lezen.ts).
 */
function claimPredicaat(expr: string, rij: Record<string, unknown>): boolean {
  return expr.split(',').some((term) => {
    const m = term.match(/^(\w+)\.(is|lt)\.(.*)$/)
    if (!m) throw new Error(`onverwachte or-term: ${term}`)
    const [, col, op, ruw] = m
    if (op === 'is') return ruw === 'null' ? rij[col] == null : rij[col] != null
    const waarde = ruw.startsWith('"') && ruw.endsWith('"') ? ruw.slice(1, -1) : ruw
    return (rij[col] as string) < waarde
  })
}

/**
 * Bouwt een nep-client met de drie tabellen die verversEigenTijdlijn leest.
 * `profiel: null` / `nieuwsprofiel: null` laat de rij helemaal weg (voor de
 * "geen rij"-gevallen); anders overschrijven de gegeven velden een realistische
 * standaard: Geheel-account, AI aan + abonnement, tijdlijn als gekozen variant.
 */
function maakClient(opts: {
  profiel?: Record<string, unknown> | null
  nieuwsprofiel?: Record<string, unknown> | null
  laatsteEditie?: string | null
  nieuwGeduidSindsVorige?: number
} = {}) {
  const profielRij =
    opts.profiel === null
      ? []
      : [{ id: UID, role: 'user', active_modules: null, ai_enabled: true, active_subscriptions: ['ai'], ...(opts.profiel ?? {}) }]
  const nieuwsprofielRij =
    opts.nieuwsprofiel === null ? [] : [{ user_id: UID, krant_variant: 'tijdlijn', ...(opts.nieuwsprofiel ?? {}) }]
  const kranteditiesRij = opts.laatsteEditie ? [{ id: 'ed-1', user_id: UID, bron: 'tijdlijn', created_at: opts.laatsteEditie }] : []
  const nieuwGeduid = opts.nieuwGeduidSindsVorige ?? 0
  const newsArticles = Array.from({ length: nieuwGeduid }, (_, i) => ({
    id: `art-${i}`,
    duiding_status: 'geduid',
    geduid_at: new Date(NU.getTime() + 1000).toISOString(),
  }))
  return maakNepClient(
    { profiles: profielRij, nieuwsprofiel: nieuwsprofielRij, krant_edities: kranteditiesRij, news_articles: newsArticles },
    { or: claimPredicaat },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  beta.open = false
  mockVervers.mockResolvedValue({ editieId: 'e1', profielType: 'x', leeg: false, items: 3 })
  mockRuim.mockResolvedValue(2)
})

describe('geen-tijdlijn', () => {
  it('bron "ai" (1E): de Krant MET AI is dezelfde tijdlijn — ververst, en de AI-stap gaat mee', async () => {
    beta.open = true
    const nep = maakClient({ nieuwsprofiel: { krant_variant: 'ai' } })
    const aiStap = vi.fn()
    mockVervers.mockResolvedValueOnce({ editieId: 'e1', profielType: 'x', leeg: false, items: 3, ai: { uitkomst: 'met-ai', reden: null, tellers: {} } })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU, aiStap })
    expect(uit).toEqual({ status: 'ververst', items: 3, leeg: false, ai: 'met-ai' })
    expect(mockVervers).toHaveBeenCalledTimes(1)
    expect(mockVervers.mock.calls[0][1]).toMatchObject({ userId: UID, aiStap })
  })

  it('bron "tijdlijn" (zonder AI): de meegegeven AI-stap wordt NIET doorgegeven (K2 — standaard zonder AI)', async () => {
    beta.open = true
    const nep = maakClient({ nieuwsprofiel: { krant_variant: null } })
    const aiStap = vi.fn()
    await verversEigenTijdlijn(nep.client as never, UID, { now: NU, aiStap })
    expect(mockVervers.mock.calls[0][1]).toMatchObject({ aiStap: null })
  })

  it('variant "ai" zonder AI toegestaan (kill-switch uit): bron valt terug op tijdlijn, geen AI-stap', async () => {
    beta.open = true
    const nep = maakClient({ profiel: { ai_enabled: false }, nieuwsprofiel: { krant_variant: 'ai' } })
    const aiStap = vi.fn()
    await verversEigenTijdlijn(nep.client as never, UID, { now: NU, aiStap })
    expect(mockVervers.mock.calls[0][1]).toMatchObject({ aiStap: null })
  })

  it('zonder module nieuws: geen-tijdlijn, ook al zou de bronkeuze verder tijdlijn zijn', async () => {
    beta.open = true
    const nep = maakClient({ profiel: { active_modules: ['budgetteren'] } })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'geen-tijdlijn' })
    expect(mockVervers).not.toHaveBeenCalled()
  })

  // Security-run 0.92.28 🟡-1: een geblokkeerd account ververst niets, ook binnen de bèta.
  it('geblokkeerd account → geen-tijdlijn, zonder claim of verversing', async () => {
    beta.open = true
    const nep = maakClient({ profiel: { active_modules: ['nieuws'], blocked_at: '2026-10-01T00:00:00Z' } })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'geen-tijdlijn' })
    expect(mockVervers).not.toHaveBeenCalled()
  })

  it('geen profielrij → geen-tijdlijn', async () => {
    const nep = maakClient({ profiel: null })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'geen-tijdlijn' })
    expect(mockVervers).not.toHaveBeenCalled()
  })

  it('bèta dicht en gewone user: geen-tijdlijn (bepaalKrantBron geeft "oud", de oude Krant)', async () => {
    const nep = maakClient()
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'geen-tijdlijn' })
  })
})

describe('de rem: een atomaire claim op nieuwsprofiel.tijdlijn_vernieuwd_at', () => {
  it('te snel: minder dan 10 min geleden geclaimd → te-snel met de juiste opnieuwVanaf', async () => {
    beta.open = true
    const vorigeClaim = new Date(NU.getTime() - (VERNIEUW_INTERVAL_MS - 1000)).toISOString()
    const nep = maakClient({ nieuwsprofiel: { tijdlijn_vernieuwd_at: vorigeClaim } })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'te-snel', opnieuwVanaf: new Date(new Date(vorigeClaim).getTime() + VERNIEUW_INTERVAL_MS).toISOString() })
    expect(mockVervers).not.toHaveBeenCalled()
  })

  it('rand: PRECIES 10 minuten geleden geclaimd is NOG "te snel" — het or-filter gebruikt strikt .lt(), niet .lte() (bestand:regel lib/krant/tijdlijn-vernieuwen.ts:83)', async () => {
    // Vastgelegd, geen defect-fix: de oude implementatie (`verschil < INTERVAL`)
    // liet de rand net WEL toe (inclusief); de atomaire claim vergelijkt met
    // een strikte `.lt("<grens>")`, dus exact-op-de-rand faalt de claim nu. Een
    // instant-brede edge case zonder praktisch effect, maar wel een omgekeerde
    // rand ten opzichte van vóór de herschrijving — hier vastgelegd zodat een
    // volgende wijziging het bewust moet aanraken, niet stil opnieuw omdraait.
    beta.open = true
    const vorigeClaim = new Date(NU.getTime() - VERNIEUW_INTERVAL_MS).toISOString()
    const nep = maakClient({ nieuwsprofiel: { tijdlijn_vernieuwd_at: vorigeClaim } })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit.status).toBe('te-snel')
  })

  it('net ná de rand (10 min + 1ms geleden) mag wél — de eerste moment waarop .lt() de claim doorlaat', async () => {
    beta.open = true
    const vorigeClaim = new Date(NU.getTime() - VERNIEUW_INTERVAL_MS - 1).toISOString()
    const nep = maakClient({ nieuwsprofiel: { tijdlijn_vernieuwd_at: vorigeClaim } })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit.status).not.toBe('te-snel')
  })

  it('een nieuwe lezer zonder nieuwsprofiel-rij claimt de rem meteen (upsert garandeert eerst de rij)', async () => {
    beta.open = true
    const nep = maakClient({ nieuwsprofiel: null })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit.status).not.toBe('te-snel')
    expect(nep.rijen('nieuwsprofiel')).toHaveLength(1)
  })

  it('twee claims op hetzelfde moment: precies één wint (1 rij), de ander krijgt 0 rijen → te-snel', async () => {
    beta.open = true
    const nep = maakClient() // geen tijdlijn_vernieuwd_at nog: de eerste claim is vrij.
    const eerste = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(eerste.status).not.toBe('te-snel')
    // Dezelfde client, hetzelfde moment: de rem staat nu al op NU → de tweede
    // claim krijgt 0 rijen terug (net als een race tussen twee gelijktijdige klikken).
    const tweede = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(tweede).toEqual({ status: 'te-snel', opnieuwVanaf: new Date(NU.getTime() + VERNIEUW_INTERVAL_MS).toISOString() })
    expect(mockVervers).toHaveBeenCalledTimes(1)
  })
})

describe('niets nieuws sinds de vorige verversing', () => {
  it('0 artikelen geduid sinds de vorige editie → niets-nieuws, geen ververs-aanroep, geen kandidaten geladen', async () => {
    beta.open = true
    const vorigeEditie = new Date(NU.getTime() - 2 * VERNIEUW_INTERVAL_MS).toISOString()
    const nep = maakClient({ laatsteEditie: vorigeEditie, nieuwGeduidSindsVorige: 0 })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'niets-nieuws' })
    expect(mockVervers).not.toHaveBeenCalled()
    expect(laadKandidaten).not.toHaveBeenCalled()
  })

  it('wél artikelen geduid sinds de vorige editie → ververst', async () => {
    beta.open = true
    const vorigeEditie = new Date(NU.getTime() - 2 * VERNIEUW_INTERVAL_MS).toISOString()
    const nep = maakClient({ laatsteEditie: vorigeEditie, nieuwGeduidSindsVorige: 2 })
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'ververst', items: 3, leeg: false })
  })

  it('eerste verversing (geen vorige editie): de telling wordt overgeslagen, ververst meteen', async () => {
    beta.open = true
    const nep = maakClient()
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'ververst', items: 3, leeg: false })
    expect(mockVervers).toHaveBeenCalledTimes(1)
  })
})

describe('een echte verversing', () => {
  it('laadt kandidaten + AOW, ververst, ruimt op, en geeft het resultaat door', async () => {
    beta.open = true
    const nep = maakClient()
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'ververst', items: 3, leeg: false })
    expect(laadKandidaten).toHaveBeenCalledTimes(1)
    expect(getAowLeeftijden).toHaveBeenCalledTimes(1)
    expect(mockRuim).toHaveBeenCalledTimes(1)
    expect(mockRuim.mock.calls[0][1]).toBe(UID)
  })

  it('23505 (race met de cron of een tweede klik) → niets-nieuws, geen throw', async () => {
    beta.open = true
    mockVervers.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "krant_editie_items_tijdlijn_lezer_artikel_key"'))
    const nep = maakClient()
    const uit = await verversEigenTijdlijn(nep.client as never, UID, { now: NU })
    expect(uit).toEqual({ status: 'niets-nieuws' })
  })

  it('een andere fout gooit door (geen stille niets-nieuws)', async () => {
    beta.open = true
    mockVervers.mockRejectedValueOnce(new Error('kapot'))
    const nep = maakClient()
    await expect(verversEigenTijdlijn(nep.client as never, UID, { now: NU })).rejects.toThrow('kapot')
  })
})

describe('elke query op de eigen id', () => {
  it('profiel (id), nieuwsprofiel (user_id, elke query) en de laatste editie (user_id) zijn alle gescoped op de eigen id', async () => {
    beta.open = true
    const nep = maakClient()
    await verversEigenTijdlijn(nep.client as never, UID, { now: NU })

    const profielQueries = nep.queriesOp('profiles')
    expect(profielQueries.length).toBeGreaterThan(0)
    for (const q of profielQueries) expect(q.stappen.filter((s) => s.m === 'eq').map((s) => s.args)).toContainEqual(['id', UID])

    const nieuwsprofielQueries = nep.queriesOp('nieuwsprofiel')
    expect(nieuwsprofielQueries.length).toBeGreaterThanOrEqual(2) // select-variant + de atomaire update
    for (const q of nieuwsprofielQueries) {
      const eqArgs = q.stappen.filter((s) => s.m === 'eq').map((s) => s.args)
      const upsertPayload = q.stappen.find((s) => s.m === 'upsert')?.args[0] as { user_id?: string } | undefined
      const opEigenId = eqArgs.some(([k, v]) => k === 'user_id' && v === UID) || upsertPayload?.user_id === UID
      expect(opEigenId, `nieuwsprofiel-query zonder scoping op ${UID}: ${JSON.stringify(q.stappen)}`).toBe(true)
    }

    const editieQueries = nep.queriesOp('krant_edities')
    for (const q of editieQueries) expect(q.stappen.filter((s) => s.m === 'eq').map((s) => s.args)).toContainEqual(['user_id', UID])
  })
})
