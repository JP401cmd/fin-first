import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { deriveBankLinkState, type CashBankLink } from '@/lib/bank-connection-status'

/**
 * SERVER-LOADER voor de koppelstatus per cash-rekening (fase 7).
 *
 * ## Waarom dit een loader is en geen client-read
 *
 * Tot fase 7 leidden `components/app/cash-overview.tsx` en
 * `components/app/cash-account-view.tsx` de koppelstatus élk zélf af, met elk een
 * eigen `.from('bank_connection_accounts')` uit de browser. Twee afleidingen van
 * hetzelfde feit, twee kansen op drift, en een derde erbij (de rekeningkaart had
 * er één nodig) zou de latere ADR-0058-slice strikt moeilijker maken. Weergavedata
 * hoort via de loader — dit is dat pad, met `lib/bank-connection-status.ts` als de
 * ene afleiding erachter.
 *
 * Scheelt bovendien een client-roundtrip op een warme pagina: de cashflow-landing
 * deed 'm ná hydratatie, nu komt de status mee in de eerste render.
 *
 * ## Scope
 *
 * `bank_connection_accounts` is own-row (`auth.uid() = user_id`). `bank_accounts`
 * is dat NIET — die policy is huishoud-verbreed (eigen rijen OF `ownership =
 * 'shared'` binnen hetzelfde huishouden). Hier staat `.eq('user_id', …)` er
 * daarom BEWUST bij, en dat is een echte versmalling: deze loader beantwoordt
 * "de koppelstatus van MIJN rekeningen", en een gedeelde rekening van de partner
 * heeft geen koppelrij die deze gebruiker mag zien (`bank_connection_accounts` is
 * own-row) — die zou dus altijd als `manual` terugkomen en een onterecht
 * "handmatig bijgehouden" op de partnerkaart zetten.
 *
 * Let op het verschil met de saldo-optelling: die telt gedeelde huishoudrekeningen
 * juist WÉL mee en mag daarom geen user-filter hebben (`lib/unlinked-cash.ts`).
 * Scope-vraag en saldo-vraag zijn hier bewust niet hetzelfde.
 */

/**
 * Bovengrens op de leesronde. Het aantal `bank_accounts`-rijen is niet door ons
 * bepaald (de INSERT-policy staat een sessie toe er willekeurig veel aan te
 * maken), en een cashflow-pagina met meer dan zoveel rekeningen is als UI toch
 * onbruikbaar. De ordening is deterministisch, dus de afkap is stabiel.
 */
const MAX_CASH_ACCOUNTS = 200

type BankAccountRow = { id: string; linked_asset_id: string | null }

type LinkRow = {
  id: string
  bank_account_id: string | null
  last_synced_at: string | null
  bank_connections:
    | { provider_name: string | null; status: string | null; token_expires_at: string | null }
    | { provider_name: string | null; status: string | null; token_expires_at: string | null }[]
    | null
}

/** PostgREST levert een to-one embed soms als array (afhankelijk van de relatie-inferentie). */
function one<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

/**
 * De koppelstatus van élke bankrekening van deze gebruiker.
 *
 * Er wordt alleen op ACTIEVE koppelrijen gelezen, en dat is geen afkorting maar
 * regel 1+2 van de afleiding samengevouwen in de query: geen actieve rij =
 * `manual`, of dat nu is omdat er nooit een koppeling was of omdat de gebruiker
 * haar zelf verbrak (die twee zijn voor de gebruiker dezelfde toestand — zie
 * `BankLinkSignals.linkIsActive`). De verdere afleiding blijft van
 * `deriveBankLinkState`: `linkIsActive: true` wordt dóórgegeven en niet
 * weggelaten, zodat er hier geen tweede regel ontstaat.
 *
 * Rekeningen zónder actieve koppeling komen wél in het resultaat, als `manual`.
 * Dat maakt het antwoord volledig: `cash-account-view` moet "handmatig" kunnen
 * onderscheiden van "nog niet geladen".
 */
export async function loadCashBankLinksUncached(supabase: SupabaseClient): Promise<CashBankLink[]> {
  const user = await getCachedUser(supabase)
  if (!user) return []

  const [{ data: accounts, error: accountsError }, { data: links, error: linksError }] = await Promise.all([
    supabase
      .from('bank_accounts')
      .select('id, linked_asset_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(MAX_CASH_ACCOUNTS),
    supabase
      .from('bank_connection_accounts')
      .select('id, bank_account_id, last_synced_at, bank_connections(provider_name, status, token_expires_at)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .not('bank_account_id', 'is', null),
  ])

  // Een gefaalde leesronde levert bewust een lege lijst en geen throw: de
  // koppelstatus is een verrijking op de rekeningkaarten, geen voorwaarde om de
  // cashflow-pagina te kunnen tonen. `manual` is dan de val-terug — het icoon
  // verdwijnt, en er verschijnt géén onterecht "verbinding kwijt".
  if (accountsError || linksError) {
    console.error('[bank-link-loader] koppelstatus laden mislukt:', accountsError ?? linksError)
    return []
  }

  const linkByAccount = new Map<string, LinkRow>()
  for (const row of (links ?? []) as unknown as LinkRow[]) {
    if (row.bank_account_id) linkByAccount.set(row.bank_account_id, row)
  }

  return ((accounts ?? []) as unknown as BankAccountRow[]).map((account) => {
    const link = linkByAccount.get(account.id) ?? null
    const connection = one(link?.bank_connections ?? null)

    const state = deriveBankLinkState(
      link
        ? {
            linkIsActive: true,
            connectionStatus: connection?.status ?? null,
            tokenExpiresAt: connection?.token_expires_at ?? null,
            lastSyncedAt: link.last_synced_at,
          }
        : null,
    )

    return {
      bankAccountId: account.id,
      assetId: account.linked_asset_id,
      state,
      connectionAccountId: state === 'manual' ? null : link?.id ?? null,
      providerName: state === 'manual' ? null : connection?.provider_name ?? null,
    }
  })
}

/**
 * React `cache()`-variant: dedupt per request, zodat meerdere server-pagina's op
 * dezelfde render dezelfde leesronde delen (spiegelt `loadCashflowData`).
 */
export const loadCashBankLinks = cache(loadCashBankLinksUncached)
