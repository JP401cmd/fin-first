// lib/ai/context/data-freshness.ts
// ---------------------------------------------------------------------------
// HET VOORBEHOUD DAT FIN MEEKRIJGT — de AI-tegenhanger van de "Gegevens
// verouderd"-banner.
//
// DE AANLEIDING (UR3-22). Een grep over `lib/ai/context/**` gaf nul treffers op
// `transactionFreshness` / `latestTransactionMonth`: geen enkele contextbouwer
// vertelde het model hoe oud de cijfers waren die hij eronder zette. Fin kon dus
// stellig "je hebt deze maand € X uitgegeven" zeggen over een maand waarin niets
// geboekt was. Dat is van alle dertien gaten het grootste risico, want een
// AI-uitspraak leest als vaststaand feit — een banner is tenminste zichtbaar een
// voorbehoud, een zin van Fin niet.
//
// ÉÉN OORDEEL, TWEE VORMEN. De drempel en de teksten komen uit exact dezelfde
// canonieke module als de banner (`lib/transaction-staleness.ts`): dezelfde
// `TX_STALE_AFTER_MONTHS`, dezelfde maandkorrel, dezelfde
// `latestMonthLabel`/`transactionAgeLabel`. Het scherm en Fin kunnen daardoor
// niet uiteenlopen over de vraag óf de data verouderd is — alleen over de vorm
// waarin ze dat zeggen.
//
// WAAROM EEN EIGEN MODULE. Puur (geen Supabase, geen React), zodat de exacte
// bewoording los van `buildSharedContext` getest kan worden, én zodat de
// resterende contextbouwers uit de UR3-22-fasering (check-in, horizon, briefing)
// hem straks kunnen hergebruiken in plaats van hun eigen zin te schrijven.
// ---------------------------------------------------------------------------

import {
  transactionAgeLabel,
  transactionFreshness,
} from '@/lib/transaction-staleness'

/**
 * De contextregel over de ouderdom van de transactiedata, of `null` wanneer er
 * niets te melden is (verse data, of geen historie in het venster).
 *
 * De regel doet drie dingen die het model zelf niet kan afleiden: hij noemt de
 * jongste maand, benoemt WELKE getallen eronder daarop rusten, en verbiedt de
 * "deze maand"-lezing die het model anders aanneemt.
 *
 * @param latestTransactionMonth `CorePageData.latestTransactionMonth` —
 *   'YYYY-MM' of null.
 * @param now Referentiemoment; parameter (geen interne `new Date()`) zodat de
 *   regel deterministisch te testen is, net als het oordeel zelf.
 */
export function buildDataFreshnessLine(
  latestTransactionMonth: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const freshness = transactionFreshness(latestTransactionMonth, now)
  if (freshness.state !== 'stale' || !freshness.latestMonthLabel) return null

  const age = transactionAgeLabel(freshness.monthsBehind)
  const ageSuffix = age ? ` (${age})` : ''

  return (
    `LET OP — GEGEVENS VEROUDERD: de jongste geboekte transactie is van ${freshness.latestMonthLabel}${ageSuffix}. ` +
    'Alle transactie-afgeleide cijfers hieronder (maandinkomen, maanduitgaven, spaarquote, dagtarief) rekenen dáár nog mee. ' +
    'Presenteer ze NOOIT als "deze maand", "op dit moment" of "afgelopen maand": zeg er expliciet bij dat ze op de administratie ' +
    `tot en met ${freshness.latestMonthLabel} rusten, en nodig uit om transacties te importeren of een rekening te koppelen. ` +
    'Vermogens- en schuldbedragen komen uit een andere bron en zijn wél actueel.'
  )
}
