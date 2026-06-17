// ── Health-probe bibliotheek ─────────────────────────────────────────────────
// Gedeeld door de admin-route en de dagelijkse cron. Raak NOOIT opgeslagen
// credentials aan — alleen publieke endpoints en admin-test via TrueLayer.
//
// Concurrency ≤ 4 om rate-limits te respecteren (CoinGecko demo ~30/min).
// Elke probe heeft een harde timeout van 5 seconden.

import { INTEGRATIONS } from '@/lib/architecture/integrations-model'
import { classifyExchangeError } from './exchange-adapter'
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
  | 'unknown'

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
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'TriFinity-HealthCheck/1.0' },
    })
    const latencyMs = Date.now() - start
    const ok = res.status >= 200 && res.status < 300
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
