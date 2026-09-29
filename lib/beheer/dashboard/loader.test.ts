import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * De leesacties van het beheerdashboard: toegang, leesfouten en wat er van een
 * rij overblijft.
 *
 * Twee sloten (spiegelt lib/ai/ai-health-loader.test.ts): zonder superadmin-rol
 * wordt de service-role nooit aangemaakt en raakt geen enkele functie de
 * database.
 */

const { mockIsSuperAdmin, mockCreateClient, mockGetServiceClient, mockLoadAiHealth, mockGebruik } = vi.hoisted(
  () => ({
    mockIsSuperAdmin: vi.fn(),
    mockCreateClient: vi.fn(),
    mockGetServiceClient: vi.fn(),
    mockLoadAiHealth: vi.fn(),
    mockGebruik: vi.fn(),
  }),
)

// Geen memoïsatie in de test: elke aanroep leest opnieuw, zodat de gevallen
// elkaar niet beïnvloeden.
vi.mock('react', () => ({ cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn }))
vi.mock('@/lib/admin', () => ({ isSuperAdmin: mockIsSuperAdmin, SUPERADMIN_ROLE: 'superadmin' }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mockGetServiceClient }))
vi.mock('@/lib/ai/ai-health-loader', () => ({ loadAiHealth: mockLoadAiHealth }))
vi.mock('@/lib/beheer/gebruik-analyse/loader', () => ({ laadGebruikAnalyse: mockGebruik }))

import { run, stand as stand_ } from './fixture'
import {
  AI_MAX_PAGINAS,
  laadAiAanroepen,
  laadDashboardFeiten,
  laadFoutMomenten,
  laadGebruik,
  laadIngrepen,
  laadVitalsReeks,
  magDashboardZien,
  probeUit,
} from './loader'

interface Antwoord {
  data?: unknown
  error?: unknown
  count?: number | null
}

type Beantwoord = (tabel: string, filters: Record<string, unknown>) => Antwoord

/** Een awaitable query-keten die bijhoudt welke tabel en welke filters gevraagd zijn. */
function maakClient(beantwoord: Beantwoord) {
  const tabellen: string[] = []
  const rpcs: string[] = []
  const client = {
    from(tabel: string) {
      tabellen.push(tabel)
      const filters: Record<string, unknown> = {}
      const antwoord = () => Promise.resolve({ data: null, error: null, count: null, ...beantwoord(tabel, filters) })
      const keten: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'limit']) keten[m] = () => keten
      keten.range = (van: number, tot: number) => {
        filters.range = [van, tot]
        return keten
      }
      keten.not = (kolom: string, operator: string, waarde: unknown) => {
        filters[`not.${operator}:${kolom}`] = waarde
        return keten
      }
      for (const m of ['eq', 'in', 'gte', 'lt', 'lte', 'is']) {
        keten[m] = (kolom: string, waarde: unknown) => {
          filters[`${m}:${kolom}`] = waarde
          return keten
        }
      }
      // `maybeSingle` geeft één rij of null, nooit een lijst.
      keten.maybeSingle = () =>
        antwoord().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }))
      keten.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) => antwoord().then(ok, nok)
      return keten
    },
    rpc(naam: string) {
      rpcs.push(naam)
      return Promise.resolve({ data: null, error: null, ...beantwoord(`rpc:${naam}`, {}) })
    },
  }
  return { client, tabellen, rpcs }
}

const LEEG: Beantwoord = (tabel) => (tabel.startsWith('rpc:') ? { data: [] } : { data: [], count: 0 })

function alsBeheerder(beantwoord: Beantwoord = LEEG) {
  const sessie = maakClient(beantwoord)
  const service = maakClient(beantwoord)
  mockIsSuperAdmin.mockResolvedValue(true)
  mockCreateClient.mockResolvedValue(sessie.client)
  mockGetServiceClient.mockReturnValue(service.client)
  return { sessie, service }
}

beforeEach(() => {
  for (const m of [mockIsSuperAdmin, mockCreateClient, mockGetServiceClient, mockLoadAiHealth, mockGebruik]) {
    m.mockReset()
  }
  mockLoadAiHealth.mockResolvedValue({ status: 'ok', sinceAt: null, failureCount: 0, lastSuccessAt: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('toegang — fail-closed', () => {
  it('zonder superadmin-rol: geen feiten, geen service-role, geen enkele query', async () => {
    const sessie = maakClient(LEEG)
    mockIsSuperAdmin.mockResolvedValue(false)
    mockCreateClient.mockResolvedValue(sessie.client)

    expect(await magDashboardZien()).toBe(false)
    expect(await laadDashboardFeiten()).toBeNull()
    expect(mockGetServiceClient).not.toHaveBeenCalled()
    expect(sessie.tabellen).toEqual([])
    expect(sessie.rpcs).toEqual([])
    expect(mockLoadAiHealth).not.toHaveBeenCalled()
  })

  it('zonder rol geeft elke reeks een leesfout, nooit een lege reeks', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    mockCreateClient.mockResolvedValue(maakClient(LEEG).client)

    expect(await laadAiAanroepen(30)).toEqual({ soort: 'fout' })
    expect(await laadFoutMomenten()).toEqual({ soort: 'fout' })
    expect(await laadVitalsReeks(30)).toEqual({ soort: 'fout' })
    expect(await laadIngrepen(30)).toEqual({ soort: 'fout' })
    expect((await laadGebruik()).status).toBe('fout')
    expect(mockGetServiceClient).not.toHaveBeenCalled()
    expect(mockGebruik).not.toHaveBeenCalled()
  })

  it('een rolcheck die zelf faalt, telt als geen rol', async () => {
    mockCreateClient.mockResolvedValue(maakClient(LEEG).client)
    mockIsSuperAdmin.mockRejectedValue(new Error('auth down'))

    expect(await magDashboardZien()).toBe(false)
    expect(await laadDashboardFeiten()).toBeNull()
    expect(mockGetServiceClient).not.toHaveBeenCalled()
  })

  it('met rol: toegang, en de service-role wordt pas dan aangemaakt', async () => {
    alsBeheerder()
    expect(await magDashboardZien()).toBe(true)
    expect(mockGetServiceClient).toHaveBeenCalled()
  })
})

describe('laadDashboardFeiten — bronnen', () => {
  it('leest alleen tabellen waarvan beheer logs, tellingen of tijdstempels mag zien', async () => {
    const { sessie, service } = alsBeheerder()
    await laadDashboardFeiten()

    const gelezen = new Set([...sessie.tabellen, ...service.tabellen])
    const toegestaan = new Set([
      'app_settings',
      'job_runs',
      'error_logs',
      'error_log_resolutions',
      'mail_log',
      'user_reports',
      'feedback',
      'calculator_reports',
      'bank_sync_log',
      'exchange_connections',
      'broker_connections',
      'wallet_addresses',
      'bank_connections',
    ])
    expect([...gelezen].filter((t) => !toegestaan.has(t))).toEqual([])
    // Financiële inhoud en chat horen hier nooit bij.
    for (const verboden of ['assets', 'debts', 'transactions', 'bank_accounts', 'chat_messages', 'profiles']) {
      expect(gelezen.has(verboden), verboden).toBe(false)
    }
    expect(service.rpcs).toEqual(['web_vitals_p75_summary'])
  })

  it('één onleesbare bron trekt de andere niet mee', async () => {
    alsBeheerder((tabel) =>
      tabel === 'mail_log' ? { error: { message: 'permission denied' } } : LEEG(tabel, {}),
    )
    const feiten = await laadDashboardFeiten()
    expect(feiten?.mail).toEqual({ soort: 'fout' })
    expect(feiten?.taken.soort).toBe('ok')
    expect(feiten?.fouten.soort).toBe('ok')
    expect(feiten?.meldingen.soort).toBe('ok')
  })

  it('een telling zonder getal is een leesfout, geen nul', async () => {
    alsBeheerder((tabel) => (tabel === 'user_reports' ? { data: null, count: null } : LEEG(tabel, {})))
    expect((await laadDashboardFeiten())?.meldingen).toEqual({ soort: 'fout' })
  })

  it('een ontbrekende functie is "niet uitgerold", geen leesfout', async () => {
    alsBeheerder((tabel) =>
      tabel === 'rpc:web_vitals_p75_summary' ? { error: { code: 'PGRST202' } } : LEEG(tabel, {}),
    )
    expect((await laadDashboardFeiten())?.vitals).toEqual({ soort: 'niet-uitgerold' })
  })

  it('een AI-lezing die een fout gooit, wordt "onbekend"', async () => {
    alsBeheerder()
    mockLoadAiHealth.mockRejectedValue(new Error('boom'))
    expect((await laadDashboardFeiten())?.ai.status).toBe('unknown')
  })

  it('leest de platform-status en de brongezondheid uit één instellingenronde', async () => {
    const { service } = alsBeheerder((tabel) =>
      tabel === 'app_settings'
        ? {
            data: [
              {
                key: 'platform_status',
                value: JSON.stringify({ maintenance: { enabled: true, message: 'Even geduld' } }),
                updated_at: '2026-09-28T08:00:00Z',
              },
              {
                key: 'news_source_health',
                value: JSON.stringify({
                  checkedAt: '2026-09-29T05:25:00Z',
                  sources: [
                    { label: 'CBS', items: 3, oorzaak: 'ok' },
                    { label: 'AFM', items: 0, oorzaak: 'http_fout' },
                    { label: 'DNB', items: 0, oorzaak: 'leeg' },
                  ],
                }),
                updated_at: '2026-09-29T05:25:00Z',
              },
            ],
          }
        : LEEG(tabel, {}),
    )
    const feiten = await laadDashboardFeiten()

    expect(service.tabellen.filter((t) => t === 'app_settings')).toHaveLength(1)
    expect(feiten?.platform).toMatchObject({
      soort: 'ok',
      data: { gewijzigdOp: '2026-09-28T08:00:00Z', status: { maintenance: { enabled: true } } },
    })
    expect(feiten?.krant).toEqual({
      soort: 'ok',
      data: {
        bronnen: {
          gecontroleerdOp: '2026-09-29T05:25:00Z',
          totaal: 3,
          nietGoed: [
            { label: 'AFM', klasse: 'fout', oorzaak: 'HTTP-fout' },
            { label: 'DNB', klasse: 'let-op', oorzaak: 'opgehaald, niets gevonden' },
          ],
        },
        wachtrij: null,
      },
    })
  })

  it('onleesbare brongezondheid is "geen ophaalronde", geen crash', async () => {
    alsBeheerder((tabel) =>
      tabel === 'app_settings'
        ? { data: [{ key: 'news_source_health', value: '{kapot', updated_at: null }] }
        : LEEG(tabel, {}),
    )
    expect((await laadDashboardFeiten())?.krant).toEqual({ soort: 'ok', data: { bronnen: null, wachtrij: null } })
  })
})

describe('probeUit — de bereikbaarheidsmeting', () => {
  const stand = (summary: unknown) => [
    stand_('integraties-health', 'ok', run('integraties-health', 'success', '2026-09-28T18:57:00Z', { summary })),
  ]

  it('telt alleen meetbare diensten in de noemer: 6 van 14 is geen uitval als er 8 niet te meten zijn', () => {
    // De vorm zoals de cron hem vastlegt (summarizeProbes zonder notProbeable).
    const probe = probeUit(stand({ probed: 14, ok: 6, failed: 0, rateLimited: 1, perId: {}, failures: {} }))
    expect(probe).toEqual({
      gemetenOp: '2026-09-28T18:57:00Z',
      gemeten: 6,
      bereikbaar: 6,
      onbereikbaar: [],
      begrensd: 1,
      nietMeetbaar: 8,
    })
  })

  it('noemt de onbereikbare diensten bij naam', () => {
    const probe = probeUit(
      stand({
        probed: 14,
        ok: 4,
        failed: 2,
        failures: { kraken: { code: 'timeout' }, bitvavo: { code: 'http_error' } },
      }),
    )
    expect(probe).toMatchObject({ gemeten: 6, bereikbaar: 4, onbereikbaar: ['bitvavo', 'kraken'], nietMeetbaar: 8 })
  })

  it('zonder run of met een onverwachte vorm is er geen meting, geen nul', () => {
    expect(probeUit([])).toBeNull()
    expect(probeUit(stand(null))).toBeNull()
    expect(probeUit(stand({ iets: 'anders' }))).toBeNull()
    expect(probeUit(stand({ probed: '14', ok: 6 }))).toBeNull()
  })
})

describe('banksynchronisatie — per gebruiker de laatste poging', () => {
  it('telt de gebruiker van wie de meest recente synchronisatie mislukte, en niet wie daarna weer slaagde', async () => {
    alsBeheerder((tabel) =>
      tabel === 'bank_sync_log'
        ? {
            // Nieuwste eerst, zoals de query sorteert.
            data: [
              { user_id: 'a', status: 'success', created_at: '2026-09-29T08:00:00Z' },
              { user_id: 'b', status: 'error', created_at: '2026-09-29T07:00:00Z' },
              { user_id: 'a', status: 'error', created_at: '2026-09-28T08:00:00Z' },
              { user_id: 'b', status: 'success', created_at: '2026-09-27T08:00:00Z' },
              { user_id: 'c', status: 'partial', created_at: '2026-09-27T07:00:00Z' },
            ],
          }
        : LEEG(tabel, {}),
    )
    const feiten = await laadDashboardFeiten()
    expect(feiten?.koppelingen).toMatchObject({
      soort: 'ok',
      data: {
        banksync: {
          soort: 'ok',
          data: { pogingen: 5, mislukt: 2, gebruikers: 3, gebruikersLaatsteMislukt: 1 },
        },
      },
    })
  })

  it('geen enkel gebruikers-id verlaat de loader', async () => {
    alsBeheerder((tabel) =>
      tabel === 'bank_sync_log'
        ? { data: [{ user_id: 'geheim-gebruikers-id', status: 'error', created_at: '2026-09-29T07:00:00Z' }] }
        : LEEG(tabel, {}),
    )
    const feiten = await laadDashboardFeiten()
    expect(JSON.stringify(feiten?.koppelingen)).not.toContain('geheim-gebruikers-id')
  })

  it('een lezing die haar bovengrens raakt, zegt dat de aantallen een ondergrens zijn', async () => {
    const vol = Array.from({ length: 1000 }, (_, i) => ({
      user_id: `u${i % 40}`,
      status: 'success',
      created_at: '2026-09-29T07:00:00Z',
    }))
    alsBeheerder((tabel) => (tabel === 'bank_sync_log' ? { data: vol } : LEEG(tabel, {})))
    const vol_ = await laadDashboardFeiten()
    expect(vol_?.koppelingen).toMatchObject({ data: { banksync: { data: { pogingen: 1000, afgekapt: true } } } })

    alsBeheerder((tabel) => (tabel === 'bank_sync_log' ? { data: vol.slice(0, 999) } : LEEG(tabel, {})))
    const net = await laadDashboardFeiten()
    expect(net?.koppelingen).toMatchObject({ data: { banksync: { data: { pogingen: 999, afgekapt: false } } } })
  })
})

describe('foutregels — het gebruikers-id stopt in de loader', () => {
  it('de feiten dragen geen gebruikers-id, ook niet in de telgegevens per foutregel', async () => {
    alsBeheerder((tabel) =>
      tabel === 'error_logs'
        ? {
            data: [
              {
                id: 'r1',
                context: 'window.onerror',
                message: 'Kan eigenschap niet lezen',
                level: 'error',
                url: '/overzicht',
                stack: null,
                user_id: '6f1c2a9e-geheim-gebruikers-id',
                created_at: '2026-09-29T07:00:00Z',
              },
              {
                id: 'r2',
                context: 'window.onerror',
                message: 'Kan eigenschap niet lezen',
                level: 'error',
                url: '/overzicht',
                stack: null,
                user_id: '0b7d44c1-geheim-gebruikers-id',
                created_at: '2026-09-29T06:00:00Z',
              },
            ],
            count: 2,
          }
        : LEEG(tabel, {}),
    )
    const feiten = await laadDashboardFeiten()
    if (feiten?.fouten.soort !== 'ok') throw new Error('verwachtte een geslaagde lezing')
    // De telling klopt nog: twee verschillende gebruikers.
    expect(feiten.fouten.data.soorten[0]).toMatchObject({ gebruikers: 2, zonderGebruiker: 0 })
    expect(feiten.fouten.data.voorvallen.map((v) => v.gebruiker)).toEqual([1, 2])
    // De foutregels dragen na de loader geen id meer. (Dit bewijst het voor de
    // foutregels en de banksynchronisatie; de uitkomst van een taak, `summary`
    // en `error` uit job_runs, gaat ongefilterd mee in de feiten. Die bron
    // schrijft alleen de server zelf.)
    expect(JSON.stringify(feiten)).not.toContain('geheim-gebruikers-id')
  })
})

describe('leesvensters hebben een bovenkant', () => {
  // In error_logs en bank_sync_log mag een ingelogde gebruiker zelf schrijven,
  // met een zelfgekozen tijdstip. Zonder bovenkant vullen rijen met een datum in
  // de toekomst het venster en drukken ze de echte regels eruit.
  it('het foutvenster, de telling erbij en het banklogboek reiken niet voorbij nu', async () => {
    const gezien: { tabel: string; totEnMet: unknown }[] = []
    alsBeheerder((tabel, filters) => {
      if (tabel === 'error_logs' || tabel === 'bank_sync_log') {
        gezien.push({ tabel, totEnMet: filters['lte:created_at'] })
      }
      return LEEG(tabel, {})
    })
    const voor = Date.now()
    await laadDashboardFeiten()

    // Twee lezingen op error_logs (de rijen en de telling) en één op het banklogboek.
    expect(gezien.filter((g) => g.tabel === 'error_logs')).toHaveLength(2)
    expect(gezien.filter((g) => g.tabel === 'bank_sync_log')).toHaveLength(1)
    for (const g of gezien) {
      expect(typeof g.totEnMet, g.tabel).toBe('string')
      const ms = Date.parse(String(g.totEnMet))
      expect(ms, g.tabel).toBeGreaterThanOrEqual(voor)
      expect(ms, g.tabel).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000)
    }
  })
})

describe('omgeving', () => {
  it('de feiten zeggen op welke omgeving het scherm draait', async () => {
    alsBeheerder()
    vi.stubEnv('VERCEL_ENV', 'production')
    expect((await laadDashboardFeiten())?.omgeving).toBe('production')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect((await laadDashboardFeiten())?.omgeving).toBe('development')
    vi.unstubAllEnvs()
  })
})

describe('laadAiAanroepen', () => {
  it('maakt van de gebruiker alleen "systeem of niet"', async () => {
    alsBeheerder((tabel) =>
      tabel === 'ai_token_usage'
        ? {
            data: [
              {
                created_at: '2026-09-28T08:00:00Z',
                feature: 'chat',
                provider: 'anthropic',
                model: 'claude-sonnet-4-5',
                input_tokens: 100,
                output_tokens: 20,
                cache_read_tokens: null,
                cache_write_tokens: 5,
                user_id: 'geheim-gebruikers-id',
              },
              {
                created_at: '2026-09-28T09:00:00Z',
                feature: 'nieuws_duiding',
                provider: 'anthropic',
                model: 'claude-sonnet-4-5',
                input_tokens: 300,
                output_tokens: 40,
                cache_read_tokens: 10,
                cache_write_tokens: null,
                user_id: null,
              },
            ],
          }
        : LEEG(tabel, {}),
    )
    const bron = await laadAiAanroepen(7)
    if (bron.soort !== 'ok') throw new Error('verwachtte een geslaagde lezing')
    expect(bron.data.rijen.map((a) => a.systeem)).toEqual([false, true])
    expect(bron.data.rijen[0]).toMatchObject({ input: 100, output: 20, cacheRead: 0, cacheWrite: 5 })
    expect(bron.data.afgekaptVanaf).toBeNull()
    expect(JSON.stringify(bron.data)).not.toContain('geheim-gebruikers-id')
  })

  const aiRij = (created_at: string) => ({
    created_at,
    feature: 'chat',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    input_tokens: 1,
    output_tokens: 1,
    cache_read_tokens: null,
    cache_write_tokens: null,
    user_id: null,
  })

  it('leest door over de grens van 1000 rijen en stopt bij een korte pagina', async () => {
    const paginas: number[] = []
    alsBeheerder((tabel, filters) => {
      if (tabel !== 'ai_token_usage') return LEEG(tabel, {})
      const [van] = filters.range as [number, number]
      paginas.push(van)
      return { data: Array.from({ length: van === 0 ? 1000 : 250 }, () => aiRij('2026-09-28T08:00:00Z')) }
    })
    const bron = await laadAiAanroepen(30)
    if (bron.soort !== 'ok') throw new Error('verwachtte een geslaagde lezing')
    expect(paginas).toEqual([0, 1000])
    expect(bron.data.rijen).toHaveLength(1250)
    expect(bron.data.afgekaptVanaf).toBeNull()
  })

  it('heeft een bovengrens en zegt het als die geraakt is', async () => {
    let gevraagd = 0
    alsBeheerder((tabel) => {
      if (tabel !== 'ai_token_usage') return LEEG(tabel, {})
      gevraagd += 1
      return { data: Array.from({ length: 1000 }, () => aiRij(`2026-09-${String(29 - gevraagd).padStart(2, '0')}T08:00:00Z`)) }
    })
    const bron = await laadAiAanroepen(90)
    if (bron.soort !== 'ok') throw new Error('verwachtte een geslaagde lezing')
    expect(gevraagd).toBe(AI_MAX_PAGINAS)
    expect(bron.data.rijen).toHaveLength(AI_MAX_PAGINAS * 1000)
    // De oudste gelezen rij markeert waar de lezing ophield.
    expect(bron.data.afgekaptVanaf).toBe(bron.data.rijen[bron.data.rijen.length - 1].created_at)
  })

  it('het leesvenster heeft een vaste bovenkant, zodat nieuwe aanroepen de paginas niet opschuiven', async () => {
    let filtersGezien: Record<string, unknown> = {}
    alsBeheerder((tabel, filters) => {
      if (tabel === 'ai_token_usage') filtersGezien = { ...filters }
      return LEEG(tabel, {})
    })
    await laadAiAanroepen(7)
    expect(typeof filtersGezien['gte:created_at']).toBe('string')
    expect(typeof filtersGezien['lte:created_at']).toBe('string')
  })

  it('een leesfout is geen lege reeks', async () => {
    alsBeheerder((tabel) => (tabel === 'ai_token_usage' ? { error: { message: 'boom' } } : LEEG(tabel, {})))
    expect(await laadAiAanroepen(30)).toEqual({ soort: 'fout' })
  })
})

describe('laadIngrepen', () => {
  it('voegt beheeracties en releases samen; inzage valt weg', async () => {
    alsBeheerder((tabel) =>
      tabel === 'admin_actions_log'
        ? {
            data: [
              { id: '1', action: 'config.update', target_label: 'platform_status', created_at: new Date().toISOString() },
              { id: '2', action: 'user.activity', target_label: 'Jan Jansen', created_at: new Date().toISOString() },
            ],
          }
        : LEEG(tabel, {}),
    )
    const bron = await laadIngrepen(7)
    if (bron.soort !== 'ok') throw new Error('verwachtte een geslaagde lezing')
    const acties = bron.data.ingrepen.filter((i) => i.soort === 'beheeractie')
    expect(acties.map((i) => i.id)).toEqual(['actie-1'])
    expect(bron.data.actiesAfgekaptVanaf).toBeNull()
    expect(JSON.stringify(bron.data)).not.toContain('Jan Jansen')
  })

  it('filtert inzage al in de query, zodat veel inzage de wijzigingen niet uit het venster drukt', async () => {
    let filtersGezien: Record<string, unknown> = {}
    alsBeheerder((tabel, filters) => {
      if (tabel === 'admin_actions_log') filtersGezien = { ...filters }
      return LEEG(tabel, {})
    })
    await laadIngrepen(30)
    const uitgesloten = String(filtersGezien['not.in:action'])
    for (const actie of ['user.activity', 'group.leden.inzage', 'news-feedback.read']) {
      expect(uitgesloten).toContain(`"${actie}"`)
    }
    // Een wijziging staat er niet tussen.
    expect(uitgesloten).not.toContain('config.update')
  })

  it('zegt het als de bovengrens van de audit-trail is geraakt', async () => {
    const rijen = Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      action: 'config.update',
      target_label: 'platform_status',
      created_at: new Date(Date.now() - i * 60_000).toISOString(),
    }))
    alsBeheerder((tabel) => (tabel === 'admin_actions_log' ? { data: rijen } : LEEG(tabel, {})))
    const bron = await laadIngrepen(7)
    if (bron.soort !== 'ok') throw new Error('verwachtte een geslaagde lezing')
    expect(bron.data.actiesAfgekaptVanaf).toBe(rijen[499].created_at)
  })
})
