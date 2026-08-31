import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createDraftWriter,
  fetchDraft,
  takeLegacyLocalDraft,
  LEGACY_DRAFT_STORAGE_KEY,
} from './draft-transport'
import { sanitizeStoredDraft, type OnboardingDraft } from './draft-persistence'

/**
 * Transport van het onboarding-concept (kaart UR2-01).
 *
 * Twee eigenschappen die geen enkele andere test dekt en die allebei stil
 * kunnen breken:
 *
 *  · **Volgorde** — het persisteer-effect kan sneller vuren dan een round-trip
 *    duurt. Zonder ketening landt een oudere schrijf ná een nieuwere en draait
 *    het concept terug naar een eerdere stand.
 *  · **Verzegelen** — bij afronden en afbreken wissen we het concept. Een
 *    gedebouncede schrijf die op dát moment nog onderweg is, zou het meteen
 *    daarna opnieuw aanmaken — mét de gevoelige antwoorden, ná een uitlog.
 */

function draftMet(step: string): OnboardingDraft {
  return sanitizeStoredDraft({ version: 2, lastStep: step })!
}

/** Volgorde waarin de server de aanroepen zag: 'PUT:<stap>' of 'DELETE'. */
let waargenomen: string[]
/** Per PUT een handmatig los te laten vertraging, zodat de test kan kruisen. */
let vertragingen: Array<() => void>

beforeEach(() => {
  waargenomen = []
  vertragingen = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as { draft: OnboardingDraft }
        // Houd de eerste PUT vast tot de test 'm loslaat.
        await new Promise<void>((resolve) => vertragingen.push(resolve))
        waargenomen.push(`PUT:${body.draft.lastStep}`)
      } else {
        waargenomen.push(method)
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

/**
 * Laat de opgehouden aanroepen één voor één door. Elke ronde wacht een echte
 * macrotask af: de volgende schakel in de keten roept `fetch` pas aan nádat de
 * vorige geland is, dus microtask-tellen is hier te broos.
 */
async function laatDoor() {
  for (let i = 0; i < 10; i++) {
    vertragingen.splice(0).forEach((los) => los())
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('createDraftWriter — volgorde', () => {
  it('houdt schrijven in volgorde, ook als ze elkaar inhalen', async () => {
    const writer = createDraftWriter()
    void writer.write(draftMet('naam'))
    void writer.write(draftMet('inkomen'))
    const laatste = writer.write(draftMet('bezittingen'))
    await laatDoor()
    await laatste

    expect(waargenomen).toEqual(['PUT:naam', 'PUT:inkomen', 'PUT:bezittingen'])
  })
})

describe('createDraftWriter — verzegelen', () => {
  it('wist pas nádat de lopende schrijf geland is', async () => {
    const writer = createDraftWriter()
    void writer.write(draftMet('bezittingen'))
    const gewist = writer.clear()
    await laatDoor()
    await gewist

    expect(waargenomen).toEqual(['PUT:bezittingen', 'DELETE'])
  })

  it('negeert elke schrijf ná het wissen — een concept blijft weg', async () => {
    const writer = createDraftWriter()
    await writer.clear()
    void writer.write(draftMet('bezittingen'))
    await laatDoor()

    expect(waargenomen).toEqual(['DELETE'])
  })
})

describe('fetchDraft', () => {
  it('geeft null terug wanneer de server niets bewaart', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ draft: null }), { status: 200 })),
    )
    expect(await fetchDraft()).toBeNull()
  })

  it('geeft null terug bij een foutstatus — een concept is een vangnet, geen contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect(await fetchDraft()).toBeNull()
  })

  it('geeft null terug wanneer het netwerk wegvalt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect(await fetchDraft()).toBeNull()
  })

  it('saniteert wat de server teruggeeft', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ draft: { lastStep: 'pensioen', horizon: { fire_end_age: 'x' } } }),
            { status: 200 },
          ),
      ),
    )
    const draft = await fetchDraft()
    expect(draft?.lastStep).toBe('pensioen')
    expect(draft?.horizon.fire_end_age).toBe(90)
  })
})

describe('takeLegacyLocalDraft — eenmalige migratie', () => {
  it('leest het oude localStorage-concept en wist de sleutel', () => {
    localStorage.setItem(
      LEGACY_DRAFT_STORAGE_KEY,
      JSON.stringify({ lastStep: 'bezittingen', deferredFields: ['income'] }),
    )
    const draft = takeLegacyLocalDraft()
    expect(draft?.lastStep).toBe('bezittingen')
    expect(draft?.deferredFields).toEqual(['income'])
    expect(localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('wist de sleutel ook wanneer de inhoud onbruikbaar is', () => {
    localStorage.setItem(LEGACY_DRAFT_STORAGE_KEY, 'geen json')
    expect(takeLegacyLocalDraft()).toBeNull()
    expect(localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('geeft null terug wanneer er niets stond', () => {
    expect(takeLegacyLocalDraft()).toBeNull()
  })
})
