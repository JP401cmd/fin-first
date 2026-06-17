/**
 * Logische bucket → kleur uit de rapport-palet. Spoort met het ontwerp:
 * beleggingen=groen, pensioen=horizon-paars, cash=blauw, huis=kern-bruin.
 * Onbekende buckets vallen terug op ink-soft.
 */
const BUCKET_COLORS: Record<string, string> = {
  beleggingen: '#3E7A4E',
  pensioen: '#5B3A8C',
  cash: '#3A6B8C',
  huis: '#6B4A2E',
}

export function bucketColor(bucket: string): string {
  return BUCKET_COLORS[bucket] ?? 'var(--ink-soft)'
}
