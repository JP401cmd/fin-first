/**
 * Map over `items` met GEBONDEN concurrency: hoogstens `limit` aanroepen van
 * `fn` zijn tegelijk in-flight. Een gedeelde cursor (`next`) deelt het werk uit
 * over een pool van `limit` workers; elke worker pakt telkens het volgende item
 * tot de lijst op is.
 *
 * Waarom niet gewoon `Promise.all(items.map(fn))`? Dat zou ALLE items tegelijk
 * afvuren — bij honderden gebruikers of holdings overspoelt dat de DB-pool of
 * een externe rate-limit. De pool begrenst de piekbelasting terwijl de
 * wall-clock toch fors korter wordt dan seriële verwerking.
 *
 * Resultaten komen INDEX-GEORDEND terug (`results[i]` hoort bij `items[i]`),
 * onafhankelijk van de volgorde waarin de workers klaar zijn. Zo kan de
 * aanroeper de output veilig ná de pool samenvoegen zonder op interleaving van
 * gedeelde state te hoeven letten.
 *
 * BELANGRIJK: `fn` mag NIET throwen als één falend item de hele batch niet mag
 * laten crashen — één rejecte promise laat `Promise.all` rejecten en stopt de
 * overige workers. Laat `fn` per item een resultaat-object teruggeven (bv. met
 * een `error`-veld) en vang fouten binnenin op.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  const poolSize = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))
  return results
}
