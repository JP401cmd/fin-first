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
 */
export function priorityDotClass(score: number | null): string {
  if (score === 5) return 'bg-wil-600'
  if (score === 4) return 'bg-wil-400'
  if (score === 3) return 'bg-[var(--ink-3)]'
  return 'bg-[var(--ink-4)]'
}
