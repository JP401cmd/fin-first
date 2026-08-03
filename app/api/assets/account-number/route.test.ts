import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { __resetKeyCacheForTests, decryptField } from '@/lib/crypto/field-encryption'

// Echte sleutels, geen mock: deze route schrijft ciphertext + blinde index via
// `accountNumberWriteColumns`, en juist dát is wat hier bewezen moet worden.
// Zelfde patroon als lib/asset-account-number.test.ts.
beforeAll(() => {
  process.env.ENCRYPTION_KEY_V1 = 'aa'.repeat(32)
  process.env.IBAN_INDEX_KEY_V1 = 'bb'.repeat(32)
  __resetKeyCacheForTests()
})

/**
 * `POST /api/assets/account-number` — de server-kant van het IBAN-veld op het
 * bewerkscherm van een cash-bezitting.
 *
 * ## Wat hier vastligt, en waarom het ertoe doet
 *
 * 1. **Alle drie de kolommen in één schrijfactie.** Dat is de hele reden dat deze
 *    route bestaat. De browser kon alleen `account_number` zetten, waardoor de
 *    ciphertext bij elke IBAN-bewerking verouderde — stil, want
 *    `resolveAssetAccountNumber` geeft plaintext voorrang. Zou deze route dat
 *    patroon herhalen, dan blijft de plaintext-kolom onmisbaar en is de
 *    Stage B-drop nog steeds geblokkeerd (ADR 0077).
 *
 * 2. **Eigen-rij-filter náást RLS.** De SELECT-policy op `assets` is
 *    huishoud-verbreed; zonder `.eq('user_id', …)` zou een gebruiker het
 *    rekeningnummer van een GEDEELDE bezitting van zijn partner kunnen
 *    overschrijven. De UPDATE-policy vangt dat af, maar dan als stille no-op.
 *
 * 3. **Niet-gevonden geeft 404, geen 200.** Een `update` die nul rijen raakt
 *    levert geen fout op. Zonder de expliciete controle zou de route "gelukt"
 *    melden terwijl er niets is weggeschreven.
 *
 * 4. **Lege invoer wist alle drie.** Een lege string versleutelen zou een blinde
 *    index opleveren die voor élk leeg nummer identiek is — waarna een
 *    hash-lookup twee ongerelateerde bezittingen als dezelfde rekening ziet.
 */

type Ketenstap = { methode: string; args: unknown[] }

let keten: Ketenstap[] = []
let ingelogdeGebruiker: { id: string } | null = { id: 'gebruiker-1' }
/** Wat `.maybeSingle()` teruggeeft — `null` = rij niet gevonden of niet van mij. */
let updateResultaat: { data: unknown; error: unknown } = { data: { id: 'asset-1' }, error: null }

function bouwKeten(): Record<string, unknown> {
  const doel: Record<string, unknown> = {
    maybeSingle: async () => updateResultaat,
  }
  return new Proxy(doel, {
    get(t, prop: string) {
      if (prop in t) return (t as Record<string, unknown>)[prop]
      return (...args: unknown[]) => {
        keten.push({ methode: prop, args })
        return bouwKeten()
      }
    },
  })
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: ingelogdeGebruiker }, error: null }) },
    from: (tabel: string) => {
      keten.push({ methode: 'from', args: [tabel] })
      return bouwKeten()
    },
  }),
}))

import { POST } from './route'

function verzoek(body: unknown): Request {
  return new Request('http://localhost/api/assets/account-number', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** De payload van de `update(...)`-aanroep. */
function updatePayload(): Record<string, unknown> | undefined {
  return keten.find((s) => s.methode === 'update')?.args[0] as Record<string, unknown> | undefined
}

/** Alle `.eq(kolom, waarde)`-paren uit de keten. */
function eqFilters(): Array<[string, unknown]> {
  return keten
    .filter((s) => s.methode === 'eq')
    .map((s) => [s.args[0] as string, s.args[1]] as [string, unknown])
}

beforeEach(() => {
  keten = []
  ingelogdeGebruiker = { id: 'gebruiker-1' }
  updateResultaat = { data: { id: 'asset-1' }, error: null }
})

describe('POST /api/assets/account-number', () => {
  it('weigert zonder ingelogde gebruiker, met de app-brede 401-tekst', async () => {
    ingelogdeGebruiker = null
    const res = await POST(verzoek({ id: 'asset-1', iban: 'NL01BANK0000000001' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Niet ingelogd' })
    // En vooral: geen enkele schrijfpoging.
    expect(keten.some((s) => s.methode === 'update')).toBe(false)
  })

  it('schrijft alle drie de kolommen in één keer — ciphertext ontsleutelt terug', async () => {
    const res = await POST(verzoek({ id: 'asset-1', iban: 'NL01BANK0000000001' }))
    expect(res.status).toBe(200)

    const payload = updatePayload()!
    expect(Object.keys(payload).sort()).toEqual([
      'account_number',
      'account_number_encrypted',
      'account_number_hash',
    ])
    expect(payload.account_number).toBe('NL01BANK0000000001')
    // Niet "er staat iets": het moet het ECHTE nummer terug opleveren.
    expect(decryptField(payload.account_number_encrypted as string)).toBe('NL01BANK0000000001')
    expect(payload.account_number_hash).toBeTypeOf('string')
    expect(payload.account_number_hash).not.toBe('NL01BANK0000000001')
  })

  it('wist alle drie de kolommen bij een lege waarde', async () => {
    await POST(verzoek({ id: 'asset-1', iban: '' }))
    expect(updatePayload()).toEqual({
      account_number: null,
      account_number_encrypted: null,
      account_number_hash: null,
    })

    keten = []
    await POST(verzoek({ id: 'asset-1', iban: null }))
    expect(updatePayload()).toEqual({
      account_number: null,
      account_number_encrypted: null,
      account_number_hash: null,
    })
  })

  it('scoopt de update op de eigen rij, niet alleen op het id', async () => {
    await POST(verzoek({ id: 'asset-1', iban: 'NL01BANK0000000001' }))
    const filters = eqFilters()
    expect(filters).toContainEqual(['id', 'asset-1'])
    // Zonder dit filter kan een gedeelde bezitting van de partner geraakt worden.
    expect(filters).toContainEqual(['user_id', 'gebruiker-1'])
  })

  it('geeft 404 wanneer de rij niet bestaat of niet van deze gebruiker is', async () => {
    updateResultaat = { data: null, error: null }
    const res = await POST(verzoek({ id: 'van-iemand-anders', iban: 'NL01BANK0000000001' }))
    // Niet 200: een update die nul rijen raakt is geen succes.
    expect(res.status).toBe(404)
  })

  it('weigert een body zonder id', async () => {
    const res = await POST(verzoek({ iban: 'NL01BANK0000000001' }))
    expect(res.status).toBe(400)
    expect(keten.some((s) => s.methode === 'update')).toBe(false)
  })
})
