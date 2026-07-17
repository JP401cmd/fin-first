/**
 * Gedeelde prioriteitskleur voor de Wil-widgets (Tips/Acties).
 *
 * `priority_score` loopt 1-5 (hoger = belangrijker); beide widgets sorteren
 * aflopend, dus de zwaarste tint hoort bij de hoogste score. Retourneert een
 * Tailwind `bg-*`-class in de Wil-module-accentschaal; callers die tekst
 * kleuren doen `.replace('bg-', 'text-')`.
 *
 * Eén bron zodat Tips en Acties niet uit elkaar lopen (voorheen dekte de
 * Tips-widget alleen 1-3, waardoor score 4/5 kleurloos terugviel).
 *
 * Vijf onderscheidende stappen zodat de volledige 1-5-invoerschaal
 * (`action-form.tsx`) zichtbaar terugkomt: hoog (5/4/3) in aflopend
 * Wil-accent, laag (2/1) in neutraal grijs, en een nóg lichtere fallback
 * voor `null`/0 zodat "geen prioriteit" niet samenvalt met score 1.
 */
export function priorityDotClass(score: number | null): string {
  if (score === 5) return 'bg-wil-600'
  if (score === 4) return 'bg-wil-500'
  if (score === 3) return 'bg-wil-400'
  if (score === 2) return 'bg-[var(--ink-3)]'
  if (score === 1) return 'bg-[var(--ink-4)]'
  return 'bg-[var(--border-md)]'
}
