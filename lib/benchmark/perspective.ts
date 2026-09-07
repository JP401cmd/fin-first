/**
 * Speelse perspectief-vergelijking: jij vs. Elon Musk. Ter relativering — op
 * wereldschaal is vermogen bijna onvoorstelbaar ongelijk verdeeld.
 *
 * ⚠️ Het Musk-bedrag schommelt enorm; bewust een afgerond, gedateerd richtcijfer
 * (centraal hier te actualiseren).
 */

import { calculateFreedomTime, FREEDOM_DAYS_PER_YEAR } from '@/lib/format'
import type { MuskComparison, BenchmarkSource } from '@/lib/benchmark-report-data'

/** Indicatief vermogen van Elon Musk in euro's (~$430 mld, EUR/USD ±1,08). */
export const MUSK_NET_WORTH_EUR = 400_000_000_000

export const SOURCE_MUSK: BenchmarkSource = {
  label: 'Forbes / Bloomberg Billionaires Index — Elon Musk',
  year: 2025,
  note: 'Sterk schommelend richtcijfer (~$430 mld); puur ter relativering.',
}

function formatBigMultiple(ratio: number): string {
  if (ratio >= 1_000_000) return `${(ratio / 1_000_000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} miljoen keer`
  if (ratio >= 1_000) return `${(ratio / 1_000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} duizend keer`
  return `${ratio.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} keer`
}

/**
 * Jaren op Musk-schaal in gewone taal. Zusje van `formatBigMultiple`, met
 * dezelfde drempels: onder de duizend een heel getal, daarboven "duizend"/
 * "miljoen" voluit. Miljoenen jaren zijn hier de regel, geen randgeval.
 */
export function formatBigYears(jaren: number): string {
  if (jaren >= 1_000_000) return `${(jaren / 1_000_000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} miljoen jaar`
  if (jaren >= 1_000) return `${(jaren / 1_000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} duizend jaar`
  return `${jaren.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} jaar`
}

/**
 * Bouw de jij-vs-Musk-vergelijking. `null` wanneer het eigen vermogen onbekend
 * of niet-positief is (dan is een verhouding zinloos).
 */
export function buildMuskComparison(
  userNetWorth: number | null,
  dailyExpenseRate: number,
): MuskComparison | null {
  if (userNetWorth == null) return null

  const ratio = userNetWorth > 0 ? MUSK_NET_WORTH_EUR / userNetWorth : null

  const caption = ratio != null
    ? `Elon Musk is ongeveer ${formatBigMultiple(ratio)} zo rijk als jij.`
    : 'Met een vermogen van nul is de afstand tot Musk letterlijk oneindig.'

  // Musks vermogen uitgedrukt in jaren vrijheid op jóuw uitgavenpatroon.
  //
  // BEWUST NIET via `formatFreedomTimeString(bd, …)`: de jaar/maand/dag-
  // DECOMPOSITIE van `calculateFreedomTime` is voor de weergave gekapt op 9999
  // jaar (lib/format.ts). Op deze schaal loopt élke gebruiker tegen die kap aan,
  // dus stond hier letterlijk "9999 jaar" — een verzonnen getal, en bovendien in
  // tegenspraak met de zin erachter ("meer dan honderdduizend mensenlevens";
  // 9999 jaar zijn er ~125). `totalDays` is als enige veld NIET gekapt, dus dat
  // is hier de bron; de kap blijft waar hij hoort — bij de decompositie.
  //
  // Het mensenlevens-superlatief is geschrapt: het was een niet-onderbouwde
  // claim naast een gekapt getal, en het echte getal draagt de relativering al.
  let freedomFraming: string | null = null
  if (dailyExpenseRate > 0) {
    const bd = calculateFreedomTime(MUSK_NET_WORTH_EUR, dailyExpenseRate)
    const jaren = bd.totalDays / FREEDOM_DAYS_PER_YEAR
    freedomFraming = `Zijn vermogen zou jou ${formatBigYears(jaren)} vrijheid geven op jouw huidige uitgaven.`
  }

  return {
    userNetWorth,
    muskNetWorth: MUSK_NET_WORTH_EUR,
    ratio,
    caption,
    freedomFraming,
    source: SOURCE_MUSK,
  }
}
