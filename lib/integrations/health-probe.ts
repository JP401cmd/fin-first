// ── Health-probe bibliotheek ─────────────────────────────────────────────────
// Gedeeld door de admin-route en de dagelijkse cron. Raak NOOIT opgeslagen
// credentials aan — alleen publieke endpoints en admin-test via TrueLayer.
// "Opgeslagen credentials" zijn sleutels van gebruikers in de database; een
// app-sleutel uit de omgeving (COINGECKO_API_KEY) valt daar niet onder en gaat
// mee zodat de probe exact de aanroep van de app nabootst.
//
// Concurrency ≤ 4 om rate-limits te respecteren (CoinGecko demo ~30/min).
// Elke probe heeft een harde timeout van 5 seconden.

import { INTEGRATIONS } from '@/lib/architecture/integrations-model'
import { classifyExchangeError } from './exchange-adapter'
import { coingeckoHeaders } from './coingecko-client'
import { getBaseUrls, getProviders } from '@/lib/truelayer/client'
import { getServiceClient } from '@/lib/supabase/service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProbeCode =
  | 'ok'
  | 'timeout'
  | 'http_error'
  | 'network_error'
  | 'not_probeable'
  | 'admin_test_ok'
  | 'admin_test_failed'
  /**
   * De dienst antwoordde met een rate-limit (429). Telt als BEREIKBAAR, niet
   * als storing: een 429 is het antwoord van een lévende dienst — het enige
   * HTTP-antwoord dat bereikbaarheid juist bewijst. Zie `RATE_LIMIT_STATUSES`.
   */
  | 'rate_limited'
  | 'unknown'

/**
 * HTTP-statussen die "de dienst leeft, maar begrenst ons nu" betekenen —
 * geen storing. Bewust alléén 429 (Too Many Requests): dat is de enige status
 * waarvoor we een gemeten geval hebben. Zet hier niets speculatief bij — een
 * status die in werkelijkheid een permanente blokkade is (418 bij sommige
 * anti-bot-proxy's) zou een dode koppeling elke dag als bereikbaar tellen, en
 * dat is precies wat deze classificatie hoort te voorkomen. Uitbreiden mag,
 * maar alleen met een waargenomen voorbeeld én een test.
 */
const RATE_LIMIT_STATUSES = new Set([429])

export interface ProbeResult {
  id: string
  /** null voor not_probeable */
  ok: boolean | null
  latencyMs: number | null
  /** HTTP-status of null */
  status: number | null
  error?: string
  code: ProbeCode
  note?: string
}

// ── Hulpfunctie: concurrency-limiter ─────────────────────────────────────────

async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<ProbeResult>
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = []
  const queue = [...items]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift()!
      results.push(await fn(item))
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

// ── Enkelvoudige publieke probe ───────────────────────────────────────────────

async function probePublicUrl(id: string, url: string): Promise<ProbeResult> {
  const start = Date.now()
  try {
    // CoinGecko krijgt de headers van de echte koersophaal (Accept + optionele
    // demo-key, géén eigen User-Agent): de oude probe met eigen UA op `/ping`
    // stond maandenlang rood terwijl de koersophaal vanaf Vercel gewoon slaagde.
    const headers =
      id === 'coingecko' ? coingeckoHeaders() : { 'User-Agent': 'TriFinity-HealthCheck/1.0' }
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers,
    })
    const latencyMs = Date.now() - start
    const ok = res.status >= 200 && res.status < 300

    // Een rate-limit is géén storing. Gemeten 25 sep 2026: om 18:57:21 schreef
    // de koersophaal vijf CoinGecko-koersen weg, en dertien seconden later
    // verklaarde deze probe dezelfde dienst dood op een 429. Als storing geteld
    // hield dat `integraties-health` ruim drie maanden dagelijks rood — precies
    // de gewenning aan een rood meldkanaal die ADR 0178 wil voorkomen.
    if (!ok && RATE_LIMIT_STATUSES.has(res.status)) {
      return {
        id,
        ok: true,
        latencyMs,
        status: res.status,
        code: 'rate_limited',
        note: `Begrensd (HTTP ${res.status}) — dienst antwoordt, quotum bereikt`,
      }
    }

    return {
      id,
      ok,
      latencyMs,
      status: res.status,
      code: ok ? 'ok' : 'http_error',
      ...(ok ? {} : { error: `HTTP ${res.status}` }),
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    const classified = classifyExchangeError(err)
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError' || err.message.includes('timeout'))
    return {
      id,
      ok: false,
      latencyMs,
      status: null,
      error: classified.message,
      code: isTimeout ? 'timeout' : 'network_error',
    }
  }
}

// ── TrueLayer admin-test ──────────────────────────────────────────────────────

async function probeTruelayer(id: string): Promise<ProbeResult> {
  const start = Date.now()
  try {
    // Service-role client: in de dagelijkse cron is er geen cookie-sessie,
    // dus de sessie-client (createClient) is unauth en leest de verkeerde
    // TrueLayer-omgeving uit app_settings. getServiceClient() is synchroon
    // en bypast RLS, zodat de cron altijd de juiste omgevingsinstelling vindt.
    const supabase = getServiceClient()
    const { authUrl } = await getBaseUrls(supabase)
    const providers = await getProviders(authUrl)
    const latencyMs = Date.now() - start
    return {
      id,
      ok: true,
      latencyMs,
      status: 200,
      code: 'admin_test_ok',
      note: `${providers.length} banken beschikbaar`,
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    return {
      id,
      ok: false,
      latencyMs,
      status: null,
      error: err instanceof Error ? err.message : 'Onbekende fout',
      code: 'admin_test_failed',
    }
  }
}

// ── Samenvatting ──────────────────────────────────────────────────────────────

export interface ProbeSummary {
  probed: number
  /** Bereikbaar — inclusief de begrensde (`rate_limited`) probes. */
  ok: number
  /** Écht onbereikbaar. Dít getal bepaalt of de job-run rood wordt. */
  failed: number
  /** Deelverzameling van `ok`: bereikbaar, maar de dienst begrensde ons. */
  rateLimited: number
  /** Vereist credentials of heeft geen publiek endpoint. */
  notProbeable: number
  /** Per integratie: latency bij groen, anders de code. */
  perId: Record<string, number | string>
  /** Alleen de échte storingen, met status en fouttekst. */
  failures: Record<string, { code: ProbeCode; status: number | null; error: string | null }>
}

/**
 * Vat probe-resultaten samen voor de cron-job-rij én de beheerpagina. Eén bron,
 * zodat "wat telt als storing" niet per consument kan gaan afwijken.
 */
export function summarizeProbes(results: ProbeResult[]): ProbeSummary {
  const perId: ProbeSummary['perId'] = {}
  const failures: ProbeSummary['failures'] = {}
  let ok = 0
  let failed = 0
  let rateLimited = 0
  let notProbeable = 0

  for (const r of results) {
    if (r.ok === true) {
      ok++
      if (r.code === 'rate_limited') {
        rateLimited++
        // Bewust de code en niet de latency: anders verdwijnt de begrenzing
        // achter een onschuldig getal en is een quotum-probleem onzichtbaar.
        perId[r.id] = 'rate_limited'
      } else {
        perId[r.id] = r.latencyMs ?? 'ok'
      }
    } else if (r.ok === false) {
      failed++
      perId[r.id] = r.code ?? 'error'
      failures[r.id] = { code: r.code, status: r.status, error: r.error ?? null }
    } else {
      notProbeable++
      perId[r.id] = r.code ?? 'not_probeable'
    }
  }

  return { probed: results.length, ok, failed, rateLimited, notProbeable, perId, failures }
}

// ── Hoofdfunctie ──────────────────────────────────────────────────────────────

/**
 * Probeert alle (of een subset van) integraties. Concurrency ≤ 4.
 * Raakt NOOIT opgeslagen credentials aan.
 *
 * @param ids Optionele subset van integratie-ids. Zonder argument: alle probeerbare.
 */
export async function probeIntegrations(ids?: string[]): Promise<ProbeResult[]> {
  const entries = ids
    ? INTEGRATIONS.filter((e) => ids.includes(e.id))
    : INTEGRATIONS

  return withConcurrency(entries, 4, async (entry) => {
    const { id, healthProbe } = entry

    if (healthProbe.kind === 'public' && healthProbe.url) {
      return probePublicUrl(id, healthProbe.url)
    }

    if (healthProbe.kind === 'admin-test' && id === 'truelayer') {
      return probeTruelayer(id)
    }

    // kind === 'none' of 'authed'
    return {
      id,
      ok: null,
      latencyMs: null,
      status: null,
      code: 'not_probeable' as ProbeCode,
      note: healthProbe.note,
    }
  })
}
