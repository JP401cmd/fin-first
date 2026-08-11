'use client'

/**
 * SpendLimitTransactionList — de losse boekingen achter één periode van een
 * grenzenpot, onder de aggregaat-uitsplitsing in "Waar zat het in".
 *
 * euro-view: exempt (gerealiseerde historie, geen geprojecteerde bedragen)
 *
 * ── DOM PRESENTATIE-COMPONENT ───────────────────────────────────────────────
 * Geen fetch, geen state, geen som. De aanroeper (de prestatieweergave) haalt de
 * data op via GET /api/spend-limits/[id]/transactions en geeft 'm hier als prop
 * binnen — hetzelfde patroon als `NameBreakdownList` ernaast.
 *
 * ── BEWUST GEEN HERGEBRUIK VAN DE TRANSACTIELIJSTEN ─────────────────────────
 * `TransactieTijdlijn` en `TransactiesFeed` dragen filters, zoeken, paginatie,
 * categoriseren en bewerken. Hier is de vraag veel kleiner en volledig afgebakend:
 * "welke boekingen zaten in dít bedrag". Die componenten hierheen trekken zou hun
 * hele interactiemodel meebrengen in een leesoppervlak dat er niets mee kan — en
 * elke wijziging daar zou dit venster stil kunnen veranderen.
 *
 * ── CONSUME, DON'T RECOMPUTE ────────────────────────────────────────────────
 * `totalCount` en `totalMatchedAmount` komen uit de motor (`computePeriodOutcome`)
 * en niet uit deze rijen. "Er zijn er meer dan we tonen" is daarom
 * `totalCount > rows.length` — een vergelijking tussen de canonieke telling en wat
 * er staat, niet een vlag die de SQL zelf zou moeten meesturen. Hier wordt dus
 * NIETS opgeteld; ook niet "even" ter controle.
 *
 * ── BUDGETNAAM ZONDER TWEEDE FETCH ──────────────────────────────────────────
 * De rij draagt alleen een `budgetId`. De naam komt uit `budgetNameById`, die de
 * aanroeper samenstelt uit data die al op de pagina staat (`SpendLimitWithReport`).
 * Een id zonder naam toont bewust NIETS in plaats van een uuid of "onbekend": de
 * omschrijving en de tegenpartij vertellen het verhaal al.
 */

import { MaskedAmount } from '@/components/app/masked-amount'
import { formatDateShort } from '@/lib/format'
import type { SpendLimitTransactionsResponse } from '@/lib/spend-limits/types'

/** Laadstaat per periode; de aanroeper houdt de map bij. */
export type SpendLimitTransactionsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SpendLimitTransactionsResponse }

export interface SpendLimitTransactionListProps {
  /** `undefined` ⇒ nog niet opgevraagd; wordt als "laden" getoond. */
  state: SpendLimitTransactionsState | undefined
  /** Label van de gekozen periode ('augustus 2026', 'week 33, 2026', …). */
  label: string
  /** Budget-id → naam, uit data die al op de pagina staat. Geen tweede fetch. */
  budgetNameById: ReadonlyMap<string, string>
}

export function SpendLimitTransactionList({
  state,
  label,
  budgetNameById,
}: SpendLimitTransactionListProps) {
  if (!state || state.status === 'loading') {
    return (
      <p aria-live="polite" className="text-sm text-[var(--ink-3)]">
        Boekingen van <span className="capitalize">{label}</span> worden opgehaald…
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-negative">
        {state.message}
      </p>
    )
  }

  // Een antwoord zonder rij-array is een MISLUKTE laadbeurt, geen lege periode.
  // Zonder deze poort viel `rows.length` over `undefined` en nam de crash de hele
  // prestatieweergave mee — de gebruiker verloor dus het scherm in plaats van dit
  // ene blokje. Dat kan bij deploy-scheefstand of een proxy die een foutpagina
  // met status 200 teruggeeft; de aanroeper cast het antwoord ongecontroleerd.
  const { rows, totalCount } = state.data ?? {}
  if (!Array.isArray(rows) || typeof totalCount !== 'number') {
    return (
      <p role="alert" className="text-sm text-negative">
        De boekingen konden niet worden geladen.
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-3)]">
        Geen losse boekingen in <span className="capitalize">{label}</span>.
      </p>
    )
  }

  const hidden = totalCount - rows.length

  return (
    <div className="space-y-1.5">
      <ul className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
        {rows.map((t) => {
          const budgetName = t.budgetId ? budgetNameById.get(t.budgetId) : undefined
          // De tegenpartij herhalen zodra ze letterlijk gelijk is aan de
          // omschrijving levert twee keer hetzelfde woord op — dat is geen uitleg.
          const counterparty =
            t.counterpartyName && t.counterpartyName !== t.description ? t.counterpartyName : null
          const meta = [counterparty, budgetName].filter(Boolean).join(' · ')

          return (
            <li key={t.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                  {formatDateShort(t.date)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[var(--ink)]">
                    {t.description || 'Zonder omschrijving'}
                  </span>
                  {meta && (
                    <span className="block truncate text-[11px] text-[var(--ink-3)]">{meta}</span>
                  )}
                </span>
              </span>
              <MaskedAmount value={t.matchedAmount} tone="inherit" className="shrink-0 text-[var(--ink)]" />
            </li>
          )
        })}
      </ul>

      {hidden > 0 && (
        <p className="text-[11px] text-[var(--ink-3)]">
          Je ziet de {rows.length} nieuwste van {totalCount} boekingen die in deze periode meetelden;{' '}
          {hidden} {hidden === 1 ? 'boeking staat' : 'boekingen staan'} er niet bij. Het bedrag
          hierboven telt ze allemaal mee.
        </p>
      )}
      <p className="text-[11px] text-[var(--ink-3)]">
        Gedeelde huishoudboekingen tellen hier ongeschaald mee, net als in de rest van je pot.
      </p>
    </div>
  )
}
