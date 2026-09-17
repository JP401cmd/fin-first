import { openBankAuth, type BankAuthLaunch } from '@/lib/truelayer/open-bank-auth'
import type { TargetAccountOption, TargetAssetOption } from '@/lib/truelayer/target-account'

/**
 * EEN KOPPELPOGING STARTEN, clientkant — gedeeld door de koppelwizard
 * (`app/(app)/core/cash/connect/page.tsx`) en de onboarding-stap
 * (`components/onboarding/onboarding-bank.tsx`).
 *
 * Twee oppervlakken die elk hun eigen body voor `POST /api/bank-connect/auth-link`
 * bouwen lopen ooit uiteen — en dan stuurt de ene een doelrekening mee die de
 * andere vergeet, precies het soort stille keuze dat de doelrekening-fase wegnam.
 * Hier staat de body-opbouw, de foutvertaling en de sprong naar de bank op één plek;
 * de schermen houden alleen hun eigen stap-toestand.
 */

/** Een bank uit `GET /api/bank-connect/providers` (de vorm die `BankSelector` levert). */
export type BankConnectProvider = { id: string; name: string; logo: string }

/**
 * Waar de koppeling landt.
 *
 *  - `none` — nog niets gekozen; verbinden kan dan niet.
 *  - `new` — expliciet een nieuwe rekening (FR13).
 *  - `existing` — een bestaande `bank_accounts`-rij.
 *  - `asset` — een cash-bezit zonder companion (bv. uit de onboarding); de server
 *    maakt de rekening-rij aan.
 */
export type TargetSelection =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'existing'; id: string }
  | { kind: 'asset'; id: string }

/** Vaste NL-fallback: de UI toont nooit een rauwe fetch-/SDK-/database-string. */
export const BANK_CONNECT_GENERIC_ERROR = 'Verbinding maken is niet gelukt — probeer het later opnieuw.'

/** De body voor `auth-link`. Puur, zodat hij los te testen is. */
export function buildAuthLinkBody(
  provider: BankConnectProvider,
  selection: TargetSelection,
  enableBudgetTracking: boolean,
): Record<string, unknown> {
  return {
    provider_id: provider.id,
    provider_name: provider.name,
    provider_logo: provider.logo,
    // "Nieuw" is de afwezigheid van een voorkeur, precies zoals de callback het al
    // deed; alleen een gekozen rekening of bezit reist mee.
    ...(selection.kind === 'existing'
      ? { target_bank_account_id: selection.id, enable_budget_tracking: enableBudgetTracking }
      : selection.kind === 'asset'
        ? { target_asset_id: selection.id, enable_budget_tracking: enableBudgetTracking }
        : {}),
  }
}

export type StartBankConnectResult =
  | { ok: true; launch: BankAuthLaunch; connectionId: string | null }
  | { ok: false; error: string; code?: string }

/**
 * Vraag de autorisatie-URL op en ga naar de bank.
 *
 * `launch === 'window'`: de geïnstalleerde app opende de bank in een apart venster
 * — de aanroeper toont `BankAuthWaiting` voor `connectionId`. `'same-tab'`: deze
 * pagina wordt verlaten.
 *
 * Een 4xx/5xx levert de NL-melding van de server (die komt al vertaald uit
 * `auth-link`, bv. de 409 met uitweg), anders de vaste fallback.
 */
export async function startBankConnect(input: {
  provider: BankConnectProvider
  selection: TargetSelection
  enableBudgetTracking: boolean
}): Promise<StartBankConnectResult> {
  if (input.selection.kind === 'none') return { ok: false, error: BANK_CONNECT_GENERIC_ERROR }

  try {
    const res = await fetch('/api/bank-connect/auth-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAuthLinkBody(input.provider, input.selection, input.enableBudgetTracking)),
    })
    const data = await res.json().catch(() => null)

    if (!res.ok || !data?.auth_url) {
      console.error('Bank-connect auth-link mislukt', { status: res.status, error: data?.error })
      return {
        ok: false,
        error: typeof data?.error === 'string' ? data.error : BANK_CONNECT_GENERIC_ERROR,
        // `connected_required` (ADR 0157): de aanroeper opent de beta-keuze en probeert daarna opnieuw.
        ...(typeof data?.code === 'string' ? { code: data.code } : {}),
      }
    }

    const connectionId = typeof data.connection_id === 'string' ? data.connection_id : null
    return { ok: true, launch: openBankAuth(data.auth_url, connectionId), connectionId }
  } catch (err) {
    // Netwerk-/parse-fouten (bv. "Failed to fetch") nooit rauw tonen.
    console.error('Bank-connect verzoek mislukt', err)
    return { ok: false, error: BANK_CONNECT_GENERIC_ERROR }
  }
}

export type TargetOptions = { accounts: TargetAccountOption[]; assets: TargetAssetOption[] }

/**
 * De doelopties uit `GET /api/bank-connect/accounts`. `null` = niet te laden; de
 * aanroeper valt dan terug op "nieuwe rekening" en zegt dat.
 */
export async function fetchTargetOptions(): Promise<TargetOptions | null> {
  try {
    const res = await fetch('/api/bank-connect/accounts')
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      console.error('Doelrekeningen laden mislukt', { status: res.status, error: data?.error })
      return null
    }
    return {
      accounts: Array.isArray(data?.accounts) ? data.accounts : [],
      assets: Array.isArray(data?.assets) ? data.assets : [],
    }
  } catch (err) {
    console.error('Doelrekeningen verzoek mislukt', err)
    return null
  }
}
