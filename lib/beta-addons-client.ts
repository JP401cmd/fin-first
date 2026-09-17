import {
  BETA_ADDON_ROUTE,
  BETA_ADDON_SAVE_ERROR,
  type BetaAddonRequest,
  type BetaAddonResponse,
  type BetaAddonSource,
  type BetaAddonTier,
} from '@/lib/beta-addons'

export type PostBetaAddonResult = { ok: true; data: BetaAddonResponse } | { ok: false; error: string }

/**
 * De ene client-aanroep van `POST /api/beta/addon` (ADR 0157), gedeeld door de
 * popup, de onboarding en /mijn/account. Gooit nooit: een niet-ok antwoord geeft
 * de `error` uit de envelope, een netwerkfout de generieke tekst.
 */
export async function postBetaAddon(
  tier: BetaAddonTier,
  active: boolean,
  source: BetaAddonSource,
): Promise<PostBetaAddonResult> {
  const body: BetaAddonRequest = { tier, active, source }
  try {
    const res = await fetch(BETA_ADDON_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as
      | (Partial<BetaAddonResponse> & { error?: unknown })
      | null
    if (!res.ok || !data || data.ok !== true) {
      const error = typeof data?.error === 'string' && data.error ? data.error : BETA_ADDON_SAVE_ERROR
      return { ok: false, error }
    }
    return { ok: true, data: data as BetaAddonResponse }
  } catch {
    return { ok: false, error: BETA_ADDON_SAVE_ERROR }
  }
}
