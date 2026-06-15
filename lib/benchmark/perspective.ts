/**
 * Speelse perspectief-vergelijking: jij vs. Elon Musk. Ter relativering — op
 * wereldschaal is vermogen bijna onvoorstelbaar ongelijk verdeeld.
 *
 * ⚠️ Het Musk-bedrag schommelt enorm; bewust een afgerond, gedateerd richtcijfer
 * (centraal hier te actualiseren).
 */

import {
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
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
  let freedomFraming: string | null = null
  if (dailyExpenseRate > 0) {
    const bd = calculateFreedomTime(MUSK_NET_WORTH_EUR, dailyExpenseRate)
    const tijd = formatFreedomTimeString(bd, 'long', false)
    freedomFraming = `Zijn vermogen zou jou ${tijd} vrijheid geven — meer dan honderdduizend mensenlevens.`
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
