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

/** Een geldig UUID — de route eist die vorm, zodat onzin een 400 geeft i.p.v. een 500. */
const ASSET_ID = '11111111-2222-4333-8444-555555555555'

let keten: Ketenstap[] = []
let ingelogdeGebruiker: { id: string } | null = { id: 'gebruiker-1' }
/** Wat `.maybeSingle()` teruggeeft — `null` = rij niet gevonden of niet van mij. */
let rijResultaat: { data: unknown; error: unknown } = { data: { id: ASSET_ID }, error: null }

function bouwKeten(): Record<string, unknown> {
  const doel: Record<string, unknown> = {
    maybeSingle: async () => rijResultaat,
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

import { POST, GET } from './route'

function verzoek(body: unknown): Request {
  return new Request('http://localhost/api/assets/account-number', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function leesVerzoek(query: string): Request {
  return new Request(`http://localhost/api/assets/account-number${query}`)
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
  rijResultaat = { data: { id: ASSET_ID }, error: null }
})

describe('POST /api/assets/account-number', () => {
  it('weigert zonder ingelogde gebruiker, met de app-brede 401-tekst', async () => {
    ingelogdeGebruiker = null
    const res = await POST(verzoek({ id: ASSET_ID, iban: 'NL01BANK0000000001' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Niet ingelogd' })
    // En vooral: geen enkele schrijfpoging.
    expect(keten.some((s) => s.methode === 'update')).toBe(false)
  })

  it('schrijft alle drie de kolommen in één keer — ciphertext ontsleutelt terug', async () => {
    const res = await POST(verzoek({ id: ASSET_ID, iban: 'NL01BANK0000000001' }))
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
    await POST(verzoek({ id: ASSET_ID, iban: '' }))
    expect(updatePayload()).toEqual({
      account_number: null,
      account_number_encrypted: null,
      account_number_hash: null,
    })

    keten = []
    await POST(verzoek({ id: ASSET_ID, iban: null }))
    expect(updatePayload()).toEqual({
      account_number: null,
      account_number_encrypted: null,
      account_number_hash: null,
    })
  })

  it('scoopt de update op de eigen rij, niet alleen op het id', async () => {
    await POST(verzoek({ id: ASSET_ID, iban: 'NL01BANK0000000001' }))
    const filters = eqFilters()
    expect(filters).toContainEqual(['id', ASSET_ID])
    // Zonder dit filter kan een gedeelde bezitting van de partner geraakt worden.
    expect(filters).toContainEqual(['user_id', 'gebruiker-1'])
  })

  it('geeft 404 wanneer de rij niet bestaat of niet van deze gebruiker is', async () => {
    rijResultaat = { data: null, error: null }
    const res = await POST(verzoek({ id: '99999999-2222-4333-8444-555555555555', iban: 'NL01BANK0000000001' }))
    // Niet 200: een update die nul rijen raakt is geen succes.
    expect(res.status).toBe(404)
  })

  it('weigert een body zonder id', async () => {
    const res = await POST(verzoek({ iban: 'NL01BANK0000000001' }))
    expect(res.status).toBe(400)
    expect(keten.some((s) => s.methode === 'update')).toBe(false)
  })
})

describe('GET /api/assets/account-number', () => {
  it('weigert zonder ingelogde gebruiker', async () => {
    ingelogdeGebruiker = null
    const res = await GET(leesVerzoek(`?id=${ASSET_ID}`))
    expect(res.status).toBe(401)
    expect(keten.some((s) => s.methode === 'select')).toBe(false)
  })

  it('weigert een ontbrekend of ongeldig id met 400, niet met een 500', async () => {
    expect((await GET(leesVerzoek(''))).status).toBe(400)
    keten = []
    // Zonder de vormcontrole zou dit een Postgres-castfout worden → 500.
    expect((await GET(leesVerzoek('?id=geen-uuid'))).status).toBe(400)
    expect(keten.some((s) => s.methode === 'select')).toBe(false)
  })

  it('scoopt de lezing op de eigen rij', async () => {
    rijResultaat = { data: { account_number: 'NL01BANK0000000001', account_number_encrypted: null }, error: null }
    await GET(leesVerzoek(`?id=${ASSET_ID}`))
    const filters = eqFilters()
    expect(filters).toContainEqual(['id', ASSET_ID])
    // Dít is de reden dat de lezing hierheen verhuisde: rechtstreeks vanuit de
    // browser was hij ongescoopt, en de SELECT-policy is huishoud-verbreed.
    expect(filters).toContainEqual(['user_id', 'gebruiker-1'])
  })

  it('ontsleutelt wanneer alleen de ciphertext gevuld is — het bankgekoppelde geval', async () => {
    // Sinds `20260802093000` maakt de auto-link-trigger een cash-bezitting aan
    // met UITSLUITEND ciphertext. Las het scherm alleen de plaintext-kolom, dan
    // kwam zo'n rekening binnen als "geen rekeningnummer".
    const { accountNumberWriteColumns } = await import('@/lib/asset-account-number')
    const kolommen = accountNumberWriteColumns('NL99BANK0000000009')
    rijResultaat = {
      data: { account_number: null, account_number_encrypted: kolommen.account_number_encrypted },
      error: null,
    }
    const res = await GET(leesVerzoek(`?id=${ASSET_ID}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ accountNumber: 'NL99BANK0000000009' })
  })

  it('geeft 404 wanneer de rij niet bestaat of niet van deze gebruiker is', async () => {
    rijResultaat = { data: null, error: null }
    const res = await GET(leesVerzoek('?id=99999999-2222-4333-8444-555555555555'))
    expect(res.status).toBe(404)
  })
})
