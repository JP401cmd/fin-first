import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import {
  aggLatestMonth,
  getTxAgg12m,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { readMinimizedMap } from '@/lib/page-status/minimized-prefs'
import { transactionAgeLabel, transactionFreshness } from '@/lib/transaction-staleness'
import {
  STALE_TX_NOTICE_MINIMIZE_KEY,
  asStaleMinimizedMonths,
} from '@/lib/transaction-staleness-minimize'
import { StaleNoticeProvider } from '@/components/app/stale-notice-provider'

/**
 * StaleDataGuard — DE plek waar een scherm zegt: "mijn cijfers rusten op
 * transacties." Alles wat daarna nodig is om dat eerlijk te tonen, gebeurt hier.
 *
 * ── WAAROM DIT BESTAAT (UR3-22, eigenaarsbesluit "optie B") ────────────────
 * De "Gegevens verouderd"-melding was correct, maar OPT-IN: een scherm moest
 * zelf het maandaggregaat ophalen, `transactionFreshness` draaien, de
 * geminimaliseerd-voorkeur lezen, die smallen, de provider opzetten, de banner
 * plaatsen én het statuspunt plaatsen. Zeven stappen, en alleen /overzicht had
 * ze alle zeven. Van de dertien schermen die op transactie-afgeleide cijfers
 * rekenen droegen er twee de melding, en op het tweede scherm ontbrak het
 * terughaalpunt — waardoor één keer inklappen de melding dáár definitief
 * doofde. Dat is geen rekenfout maar een structuurfout: er was geen mechanisme
 * dat de melding meebracht.
 *
 * Dit component ís dat mechanisme. Een scherm wikkelt zijn inhoud erin en
 * plaatst twee vormen — `<StaleNoticeBanner/>` waar de melding hoort en
 * `<StaleNoticeDot/>` naast de pagina-'i'. Geen drempel, geen fetch, geen
 * voorkeur-plumbing per scherm.
 *
 * ── ÉÉN BRON, GEEN TWEEDE FETCH-PAD ────────────────────────────────────────
 * Het oordeel komt uit `transactionFreshness` op `aggLatestMonth(getTxAgg12m)` —
 * exact dezelfde keten die /overzicht en `loadCashflowKpis` al draaiden (bewaakt
 * door `lib/cashflow-kpis.parity.test.ts`). Beide leesacties zijn
 * React-`cache()`-gewrapt op dezelfde client, dus een scherm dat het aggregaat
 * of de voorkeurenmap tóch al ophaalt betaalt hier nul extra queries. Heeft een
 * scherm ze al in zijn eigen parallelle golf staan, dan geeft het ze via
 * `preloaded` mee en blijft de golf de golf.
 *
 * ── SERVER, NIET CLIENT ────────────────────────────────────────────────────
 * Het versheidsoordeel leest de klok. Dat hoort één keer server-side te
 * gebeuren; de client krijgt alleen kant-en-klare strings (zie de kop van
 * `stale-transactions-notice.tsx`). Vandaar dat dit een async servercomponent
 * is die de provider seedt — inclusief de labels, zodat de banner ze niet
 * opnieuw hoeft af te leiden.
 */

/** Reeds geladen bronnen, voor schermen die ze al in hun eigen golf hebben. */
export interface StaleDataPreload {
  /** `aggLatestMonth(txAgg12)` — de jongste maand mét boekingen, of null. */
  latestTransactionMonth: string | null
  /** De rauwe `profiles.status_banner_minimized`-map. */
  minimizedMap: Record<string, unknown>
}

export async function StaleDataGuard({
  children,
  active = true,
  preloaded,
}: {
  children: React.ReactNode
  /**
   * Mag deze render überhaupt iets over transactieversheid beweren? Zet op
   * false wanneer de getoonde cijfers een ándere scope hebben dan het
   * aggregaat: `getTxAgg12m` is RLS-breed (eigen + gedeeld huishouden) en kent
   * geen partner-variant, dus in het Huishouden-/Partner-perspectief zou een
   * melding over "jouw laatste boeking" een bewering doen die deze bron niet
   * kan onderbouwen. De provider hangt er dan nog steeds (geen conditionele
   * hook-boom), maar zegt 'none'.
   */
  active?: boolean
  preloaded?: StaleDataPreload
}) {
  let latestTransactionMonth: string | null = null
  let minimizedMap: Record<string, unknown> = {}

  if (active) {
    if (preloaded) {
      latestTransactionMonth = preloaded.latestTransactionMonth
      minimizedMap = preloaded.minimizedMap
    } else {
      const supabase = await createClient()
      const user = await getCachedUser(supabase)
      const [aggRes, map] = await Promise.all([
        getTxAgg12m(supabase),
        user
          ? readMinimizedMap(supabase, user.id)
          : Promise.resolve({} as Record<string, unknown>),
      ])
      // `realOnly` bewust op de default (false): voor "is hier iets geboekt?"
      // telt een maand met alleen transfers ook mee — zie `aggLatestMonth`.
      latestTransactionMonth = aggLatestMonth((aggRes.data ?? []) as TxMonthAggregateRow[])
      minimizedMap = map
    }
  }

  const freshness = transactionFreshness(latestTransactionMonth)
  const stale = active && freshness.state === 'stale'
  const monthsBehind = stale ? freshness.monthsBehind : null

  return (
    <StaleNoticeProvider
      monthsBehind={monthsBehind}
      initialMinimizedMonths={asStaleMinimizedMonths(
        minimizedMap[STALE_TX_NOTICE_MINIMIZE_KEY],
      )}
      latestMonthLabel={stale ? freshness.latestMonthLabel : null}
      ageLabel={stale ? transactionAgeLabel(freshness.monthsBehind) : null}
    >
      {children}
    </StaleNoticeProvider>
  )
}
