import { transactionFreshness, transactionAgeLabel } from '@/lib/transaction-staleness'
import { StaleNoticeCard } from '@/components/app/stale-transactions-notice'

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
 * ── MINIMALISEERBAAR (B-015) ───────────────────────────────────────────────
 * Deze melding was bewust NIET minimaliseerbaar, met als redenering: een
 * gegevensconditie mét een directe uitweg verdwijnt vanzelf zodra je die uitweg
 * neemt. Die redenering is herzien. De uitweg (importeren of koppelen) kán
 * maandenlang op zich laten wachten, en zolang staat de melding bovenaan élk
 * bezoek van /overzicht — bij de eigenaar inmiddels drie maanden. Ze volgt nu de
 * meldingen-conventie uit CLAUDE.md: inklappen tot een gekleurd punt naast de
 * pagina-'i', server-side onthouden, en automatisch heropenen zodra de
 * achterstand materieel groeit. De drempel en de sleutel staan in
 * `lib/transaction-staleness-minimize.ts`.
 *
 * Dit bestand is bewust GEEN client-component: het versheidsoordeel leest de
 * klok (`new Date()`) en hoort dus één keer, server-side, te draaien. De
 * zichtbare kaart (met de minimaliseer-knop en de context-consumptie) is
 * `StaleNoticeCard` — die krijgt alleen nog kant-en-klare strings.
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
  if (freshness.state !== 'stale' || !freshness.latestMonthLabel) return null

  return (
    <StaleNoticeCard
      latestMonthLabel={freshness.latestMonthLabel}
      ageLabel={transactionAgeLabel(freshness.monthsBehind)}
      className={className}
    />
  )
}
