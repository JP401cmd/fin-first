/**
 * Begrens een op-datum-gegroepeerde transactielijst tot `visibleCount` rijen,
 * geteld óver de dag-groepen heen. Houdt de DOM klein bij lange lijsten
 * (transacties per rekening, holding-log) zonder een virtualisatie-library.
 *
 * Pure helper — losstaand van React zodat de cap-logica direct unit-testbaar is
 * (de consumerende components zijn te zwaar om volledig te mounten).
 *
 * Spiegelt het `cappedGroups`-patroon uit
 * `components/overview/transacties/transactie-tijdlijn.tsx`.
 */
export function capDateGroups<T>(
  sortedDates: string[],
  byDate: Record<string, T[]>,
  visibleCount: number,
): { dates: string[]; byDate: Record<string, T[]> } {
  let budget = Math.max(0, visibleCount)
  const dates: string[] = []
  const outByDate: Record<string, T[]> = {}

  for (const dateStr of sortedDates) {
    if (budget <= 0) break
    const rows = byDate[dateStr] ?? []
    if (rows.length <= budget) {
      dates.push(dateStr)
      outByDate[dateStr] = rows
      budget -= rows.length
    } else {
      dates.push(dateStr)
      outByDate[dateStr] = rows.slice(0, budget)
      budget = 0
    }
  }

  return { dates, byDate: outByDate }
}
