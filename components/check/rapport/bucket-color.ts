/**
 * Logische bucket → kleur (geen losse hexen):
 * beleggingen = GOUD (`--vrijgekocht`, groei) — bewust níet het toekomst-accent
 * (dat is nu paars en zou met pensioen botsen), pensioen = wil-paars,
 * cash = positief-groen (liquide buffer), huis = kern-bruin (fundament).
 * Onbekende buckets vallen terug op ink-soft.
 */
const BUCKET_COLORS: Record<string, string> = {
  beleggingen: 'var(--vrijgekocht)',
  pensioen: 'var(--color-wil-500)',
  cash: 'var(--green)',
  huis: 'var(--kern)',
}

export function bucketColor(bucket: string): string {
  return BUCKET_COLORS[bucket] ?? 'var(--ink-soft)'
}
