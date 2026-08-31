import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { transactionFreshness, transactionAgeLabel } from '@/lib/transaction-staleness'

/**
 * "GEGEVENS VEROUDERD" — de transactie-tegenhanger van de "Prijzen verouderd"-
 * banner op de holdings-pagina (components/core/holdings-client.tsx).
 *
 * ── WAAROM (UR2-13) ────────────────────────────────────────────────────────
 * Een cijfer dat op maandenoude transacties rust ziet er precies zo uit als een
 * cijfer van gisteren. Op een testaccount stond op /overzicht "Cashflow 38 % ·
 * Op koers met sparen" terwijl de jongste boeking van vijf maanden terug was —
 * nergens in de app een aanduiding. Naast de deur deed de holdings-pagina het al
 * goed; dit is datzelfde patroon, op de andere grondslag.
 *
 * ── HET OORDEEL ZIT NIET HIER ──────────────────────────────────────────────
 * Wanneer data "verouderd" heet is één vraag met één antwoord, en dat staat in
 * `lib/transaction-staleness.ts`. Dit component rendert alleen; het bepaalt geen
 * drempel en rekent niets uit. Rendert `null` zodra de data vers is of er geen
 * historie bekend is (dan is een lege staat het juiste bericht, geen melding).
 *
 * BEWUST NIET MINIMALISEERBAAR. De minimaliseer-conventie (CLAUDE.md) geldt voor
 * status-DUIDING die de gebruiker niet meteen kan oplossen; deze melding is een
 * feitelijke gegevensconditie mét een directe uitweg (importeren of koppelen) en
 * verdwijnt vanzelf zodra die genomen is — net als de holdings-banner.
 */
export function StaleTransactionsBanner({
  latestTransactionMonth,
  now,
  className = '',
}: {
  /** `DashboardData.latestTransactionMonth` / `CashflowCardScalars.latestTransactionMonth`. */
  latestTransactionMonth: string | null | undefined
  /** Referentiemoment; laat leeg voor "nu" (server-render). */
  now?: Date
  className?: string
}) {
  const freshness = transactionFreshness(latestTransactionMonth, now)
  if (freshness.state !== 'stale') return null

  const age = transactionAgeLabel(freshness.monthsBehind)

  return (
    <div
      className={`flex items-start gap-3 border border-[var(--module-active-300)] bg-[var(--module-active-50)]/60 px-4 py-3 ${className}`}
      data-testid="stale-transactions-warning"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--module-active-700)]"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-[var(--module-active-700)]">
          Gegevens verouderd
        </p>
        <p className="mt-1 font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
          Je laatste boeking is van{' '}
          <span className="font-mono not-italic font-semibold text-[var(--ink)]">
            {freshness.latestMonthLabel}
          </span>
          {age ? ` (${age})` : ''}. Je cashflow, spaarquote en budgetstand rekenen met die
          transacties — tot je nieuwe toevoegt beschrijven ze niet je huidige situatie.{' '}
          <Link
            href="/core/cash/import"
            className="not-italic font-medium text-[var(--module-active-700)] underline underline-offset-2"
          >
            Transacties importeren
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
