import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/bank-connect/linked-accounts — de leeszijde van het correctiemoment
 * (fase 5). Verving de client-directe read op de success-pagina, die daarmee van
 * de grandfather-allowlist af is (ADR 0058).
 *
 * Twee dingen die hier vastgepind horen: de volledige IBAN verlaat de server niet
 * (alleen de laatste vier tekens), en een niet-ontsleutelbare legacy-ciphertext
 * laat deze route niet vallen op één rommelige rij.
 *
 * Sinds fase 7 komt er een derde bij: de route levert `provider_id` (de bank
 * waarmee het herstelpad opnieuw autoriseert) en het **oordeel** `health`, niet de
 * vier rauwe signalen. Dat oordeel wordt server-side afgeleid met de ENE functie
 * (`deriveBankLinkHealth`); de tests hieronder pinnen de uitkomst per toestand, dus
 * een tweede afleiding in deze route (of een hardgecodeerde `state`) valt op.
 */

const { mockCreateClient, mockDecryptField } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockDecryptField: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

vi.mock('@/lib/crypto/field-encryption', () => ({
  blindIndex: (s: string) => `hash:${s}`,
  encryptField: (s: string | null) => (s === null || s === undefined ? null : `enc:${s}`),
  decryptField: mockDecryptField,
}))

import { GET } from './route'

/**
 * `byTable` overschrijft het antwoord per tabel. Sinds fase 8 doet deze route een
 * tweede leesronde (`valuations`, de banksync-waardering van vandaag), dus één
 * antwoord voor élke tabel volstaat niet meer. Zonder override blijft het gedrag
 * exact zoals het was.
 */
function makeStub(
  result: { data: unknown; error?: unknown },
  user: unknown = { id: 'user-1' },
  byTable: Record<string, { data: unknown; error?: unknown }> = {},
) {
  function makeBuilder(table: string): any {
    const answer = byTable[table] ?? result
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(answer).then(resolve, reject),
    }
    return builder
  }

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from: (table: string) => makeBuilder(table),
  }
}

beforeEach(() => {
  mockCreateClient.mockReset()
  mockDecryptField.mockReset()
})

describe('GET /api/bank-connect/linked-accounts', () => {
  it('zonder sessie → 401', async () => {
    mockCreateClient.mockResolvedValue(makeStub({ data: [] }, null))

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('levert per koppeling de dragende TriFinity-rekening, en alleen de laatste 4 IBAN-tekens', async () => {
    // Twee verschillende ciphertexts, twee verschillende IBANs: de koppelrij en de
    // drager mogen niet uit dezelfde bron komen (dat was de fout die de
    // plaintext-terugval kon verbergen).
    mockDecryptField.mockImplementation((ct: string | null) =>
      ct === 'v1:cipher' ? 'NL91ABNA0417164300'
      : ct === 'v1:carrier' ? 'NL02RABO0123456789'
      : null,
    )
    mockCreateClient.mockResolvedValue(
      makeStub({
        data: [
          {
            id: 'link-1',
            account_name: 'Betaalrekening',
            iban_encrypted: 'v1:cipher',
            bank_account_id: 'ba-1',
            is_active: true,
            last_synced_at: null,
            bank_connections: {
              provider_name: 'ING',
              provider_logo: 'https://logo',
              provider_id: 'ob-ing',
              status: 'active',
              token_expires_at: '2099-01-01T00:00:00.000Z',
            },
            bank_accounts: { name: 'Mijn hoofdrekening', iban_encrypted: 'v1:carrier' },
          },
        ],
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0]).toMatchObject({
      id: 'link-1',
      account_name: 'Betaalrekening',
      iban_tail: '4300',
      provider_name: 'ING',
      provider_logo: 'https://logo',
      // Fase 7: het herstelpad slaat de bank-kiesstap over en heeft dus de
      // provider-id nodig.
      provider_id: 'ob-ing',
      bank_account_id: 'ba-1',
      carrier_name: 'Mijn hoofdrekening',
      carrier_iban_tail: '6789',
      last_synced_at: null,
    })

    // Het oordeel, niet de vier signalen. `expiringSoon: false` bij een
    // ver-in-de-toekomst-token is de assertie die een hardgecodeerde `health`
    // (bv. altijd `expiringSoon: true`) zou breken.
    expect(body.accounts[0].health.state).toBe('linked')
    expect(body.accounts[0].health.expiringSoon).toBe(false)
    expect(body.accounts[0].health.daysUntilExpiry).toBeGreaterThan(0)
    // `last_synced_at` reist zowel los als ín het oordeel: de gate van het
    // correctiemoment blijft waar hij was, de versheidstekst leest hetzelfde feit.
    expect(body.accounts[0].health.lastSyncedAt).toBeNull()
  })

  it('een verlopen verbindingsstatus levert state linked-broken — het herstelpad van fase 7', async () => {
    mockDecryptField.mockReturnValue(null)
    mockCreateClient.mockResolvedValue(
      makeStub({
        data: [
          {
            id: 'link-1',
            account_name: 'Betaalrekening',            iban_encrypted: null,
            bank_account_id: 'ba-1',
            is_active: true,
            last_synced_at: '2026-05-01T10:00:00.000Z',
            bank_connections: {
              provider_name: 'ING',
              provider_logo: null,
              provider_id: 'ob-ing',
              status: 'expired',
              token_expires_at: '2099-01-01T00:00:00.000Z',
            },
            bank_accounts: null,
          },
        ],
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(body.accounts[0].health.state).toBe('linked-broken')
    expect(body.accounts[0].health.lastSyncedAt).toBe('2026-05-01T10:00:00.000Z')
  })

  it('een verstreken autorisatie is kapot ook als de status nog active zegt', async () => {
    // Dit is precies waarom er twee regels zijn: `status` gaat pas op `expired` door
    // een mislukte token-refresh, en die draait alleen als er iemand
    // synchroniseert. Tot dat moment is de datum het enige eerlijke signaal — en
    // deze route moet dat oordeel doorgeven, niet zelf op `status` kijken.
    mockDecryptField.mockReturnValue(null)
    mockCreateClient.mockResolvedValue(
      makeStub({
        data: [
          {
            id: 'link-1',
            account_name: null,            iban_encrypted: null,
            bank_account_id: 'ba-1',
            is_active: true,
            last_synced_at: null,
            bank_connections: {
              provider_name: 'ING',
              provider_logo: null,
              provider_id: 'ob-ing',
              status: 'active',
              token_expires_at: '2020-01-01T00:00:00.000Z',
            },
            bank_accounts: null,
          },
        ],
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(body.accounts[0].health.state).toBe('linked-broken')
    expect(body.accounts[0].health.daysUntilExpiry).toBeLessThan(0)
    expect(body.accounts[0].health.expiringSoon).toBe(false)
  })

  it('een ontbrekende verbindingsembed levert een oordeel in plaats van een crash', async () => {
    mockDecryptField.mockReturnValue(null)
    mockCreateClient.mockResolvedValue(
      makeStub({
        data: [
          {
            id: 'link-1',
            account_name: null,            iban_encrypted: null,
            bank_account_id: 'ba-1',
            is_active: true,
            last_synced_at: null,
            bank_connections: null,
            bank_accounts: null,
          },
        ],
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.accounts[0].provider_id).toBeNull()
    // Zonder status én zonder einddatum is er geen bewijs dat de koppeling kapot is
    // — een rekening kapot verklaren op grond van een onleesbare kolom is erger dan
    // hem gezond noemen (zie de noot bij `daysUntil`).
    expect(body.accounts[0].health).toEqual({
      state: 'linked',
      daysUntilExpiry: null,
      expiringSoon: false,
      lastSyncedAt: null,
    })
  })

  it('niet-ontsleutelbare legacy-ciphertext → leeg staartje, geen 500', async () => {
    // Sinds de backfill rond is (0 rijen zonder `iban_encrypted`) leest deze route
    // uitsluitend de versleutelde kolom — de plaintext-terugval is weg, want díe
    // was precies de afhankelijkheid die de Stage-B-drop zou opblazen. Een
    // onleesbare rij mag deze GET nog steeds niet laten vallen: dan zou de
    // success-pagina haar hele correctiemoment verliezen. Het staartje is
    // cosmetisch, dus het degradeert naar `null`.
    mockDecryptField.mockImplementation(() => {
      throw new Error('[field-encryption] Ciphertext is missing the "v1:" version prefix.')
    })
    mockCreateClient.mockResolvedValue(
      makeStub({
        data: [
          {
            id: 'link-1',
            account_name: null,
            iban_encrypted: 'legacy-zonder-prefix',
            bank_account_id: null,
            last_synced_at: null,
            bank_connections: null,
            bank_accounts: null,
          },
        ],
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.accounts[0].iban_tail).toBeNull()
    // Geen drager: de aanmaak van de rekening is toen mislukt. De pagina toont dan
    // "een nieuwe rekening" in plaats van een correctie-actie aan te bieden op een
    // rij die niet bestaat.
    expect(body.accounts[0].bank_account_id).toBeNull()
    expect(body.accounts[0].carrier_name).toBeNull()
  })

  it('PostgREST-embed als array (to-one-inferentie) wordt platgeslagen', async () => {
    mockDecryptField.mockReturnValue(null)
    mockCreateClient.mockResolvedValue(
      makeStub({
        data: [
          {
            id: 'link-1',
            account_name: 'Spaar',            iban_encrypted: null,
            bank_account_id: 'ba-2',
            is_active: true,
            last_synced_at: '2026-07-29T10:00:00.000Z',
            bank_connections: [
              {
                provider_name: 'Rabobank',
                provider_logo: null,
                provider_id: 'ob-rabobank',
                status: 'active',
                token_expires_at: null,
              },
            ],
            bank_accounts: [{ name: 'Spaarpot', iban_encrypted: null }],
          },
        ],
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(body.accounts[0].provider_name).toBe('Rabobank')
    // Ook de nieuwe velden komen uit de platgeslagen embed, niet uit de array zelf.
    expect(body.accounts[0].provider_id).toBe('ob-rabobank')
    expect(body.accounts[0].health.state).toBe('linked')
    expect(body.accounts[0].carrier_name).toBe('Spaarpot')
    expect(body.accounts[0].iban_tail).toBeNull()
    // `last_synced_at` is de gate van het correctiemoment: hij komt uit de server,
    // niet uit clientstate, want anders heropent één refresh de grens.
    expect(body.accounts[0].last_synced_at).toBe('2026-07-29T10:00:00.000Z')
  })

  it('de drager-IBAN komt uit iban_encrypted wanneer die gevuld is (Stage B-proof)', async () => {
    mockDecryptField.mockImplementation((cipher: string) =>
      cipher === 'v1:carrier' ? 'NL02RABO0123459876' : 'NL91ABNA0417164300',
    )
    mockCreateClient.mockResolvedValue(
      makeStub({
        data: [
          {
            id: 'link-1',
            account_name: 'Betaal',            iban_encrypted: 'v1:bank',
            bank_account_id: 'ba-1',
            last_synced_at: null,
            bank_connections: { provider_name: 'ING', provider_logo: null },
            // Stage B dropt de plaintext-kolom; dan is dit het enige dat er staat.
            bank_accounts: { name: 'Hoofdrekening', iban_encrypted: 'v1:carrier' },
          },
        ],
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(body.accounts[0].carrier_iban_tail).toBe('9876')
    expect(JSON.stringify(body)).not.toContain('NL02RABO0123459876')
  })

  // ── Fase 8: het saldo dat de callback overnam, server-afgeleid ───────────
  // De callback schrijft het saldo vóórdat de success-pagina laadt, dus die
  // schrijfactie heeft geen respons om op mee te liften. Deze route is de enige
  // plek waar de gebruiker 'm alsnog te zien krijgt — en het bedrag komt uit het
  // grootboek, niet uit de redirect-URL.

  it('levert de banksaldo-overname van vandaag per dragende rekening', async () => {
    mockDecryptField.mockReturnValue(null)
    mockCreateClient.mockResolvedValue(
      makeStub(
        {
          data: [
            {
              id: 'link-1',
              account_name: 'Betaal',              iban_encrypted: null,
              bank_account_id: 'ba-1',
              is_active: true,
              last_synced_at: null,
              bank_connections: { provider_name: 'ING', provider_logo: null, provider_id: 'ob-ing', status: 'active', token_expires_at: null },
              bank_accounts: { name: 'Hoofdrekening', iban_encrypted: null, linked_asset_id: 'asset-1' },
            },
          ],
        },
        { id: 'user-1' },
        {
          valuations: {
            data: [
              { entity_id: 'asset-1', value: 2543.67, notes: 'bank-sync · vorige waarde 1000' },
            ],
          },
        },
      ),
    )

    const res = await GET()
    const body = await res.json()

    expect(body.accounts[0].balance_change).toEqual({ previous: 1000, current: 2543.67 })
  })

  it('geen banksync-waardering vandaag → balance_change null (geen melding uit het niets)', async () => {
    mockDecryptField.mockReturnValue(null)
    mockCreateClient.mockResolvedValue(
      makeStub(
        {
          data: [
            {
              id: 'link-1',
              account_name: 'Betaal',              iban_encrypted: null,
              bank_account_id: 'ba-1',
              is_active: true,
              last_synced_at: null,
              bank_connections: null,
              bank_accounts: { name: 'Hoofdrekening', iban_encrypted: null, linked_asset_id: 'asset-1' },
            },
          ],
        },
        { id: 'user-1' },
        // Een handmatige herwaardering van vandaag mag hier nooit als
        // "overgenomen van de bank" lezen.
        { valuations: { data: [{ entity_id: 'asset-1', value: 3000, notes: 'Waarde bijgewerkt van 1000 naar 3000' }] } },
      ),
    )

    const res = await GET()
    const body = await res.json()

    expect(body.accounts[0].balance_change).toBeNull()
  })

  it('leesfout → 500 met client-veilige tekst', async () => {
    mockCreateClient.mockResolvedValue(makeStub({ data: null, error: { message: 'relation does not exist' } }))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).not.toContain('relation does not exist')
  })
})
