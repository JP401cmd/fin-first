/**
 * intake-styles — gedeelde Tailwind-class-recepten voor de Vrijheidscheck-wizard.
 *
 * Eén bron van waarheid voor de knop-, invoer- en chip-stijlen zodat alle stappen
 * exact dezelfde Editorial-Finance-look van de app dragen (zie app/globals.css):
 *  • scherpe randen (radius 0), `--border-ed` hairlines
 *  • module-accent via kern/horizon-tokens (nooit kale Tailwind-kleuren)
 *  • primaire CTA = gevulde accentknop (géén zwarte slab), focus-ring in het accent
 *  • semantiek (fout) via `--color-negative`
 *
 * De check-intake is een fundament/Overzicht-oppervlak → KERN (bruin) is het
 * primaire accent. Toekomst-gerichte stappen (pensioen, gebeurtenissen, doel)
 * leunen op HORIZON (goud). Kies de variant per stap.
 */

type Accent = 'kern' | 'horizon' | 'wil'

/** Primaire CTA — gevulde accentknop in app-stijl (mirror van de app-knoppen). */
export function primaryBtn(accent: Accent = 'kern'): string {
  const map: Record<Accent, string> = {
    kern: 'bg-kern-600 hover:bg-kern-700 active:bg-kern-800 focus-visible:outline-kern-500',
    horizon: 'bg-horizon-600 hover:bg-horizon-700 active:bg-horizon-800 focus-visible:outline-horizon-500',
    wil: 'bg-wil-600 hover:bg-wil-700 active:bg-wil-800 focus-visible:outline-wil-500',
  }
  return [
    'w-full min-h-11 px-6 py-3 text-sm font-medium text-white transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:bg-[var(--ink-4)]',
    map[accent],
  ].join(' ')
}

/** Kleinere gevulde accentknop (inline "Toevoegen" in add-formulieren). */
export function inlineAddBtn(accent: Accent = 'kern'): string {
  const map: Record<Accent, string> = {
    kern: 'bg-kern-600 hover:bg-kern-700 active:bg-kern-800 focus-visible:outline-kern-500',
    horizon: 'bg-horizon-600 hover:bg-horizon-700 active:bg-horizon-800 focus-visible:outline-horizon-500',
    wil: 'bg-wil-600 hover:bg-wil-700 active:bg-wil-800 focus-visible:outline-wil-500',
  }
  return [
    'shrink-0 px-5 py-2 text-xs font-medium text-white transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    map[accent],
  ].join(' ')
}

/** Tertiaire "Terug"-knop — tekst-only, editorial onderstreping. */
export const backBtn =
  'w-full min-h-11 px-6 py-2 text-sm text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:underline disabled:opacity-50'

/** Secundaire omlijnde knop (bv. "Geen noodfonds"). */
export const ghostBtn =
  'w-full min-h-11 border border-[var(--border-ed)] px-6 py-2.5 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]'

/** Editorial veld-label (Source Serif, ink-2). */
export const fieldLabel = 'mb-1.5 block font-serif text-sm font-medium text-[var(--ink-2)]'

/** Eyebrow / sectiekop in label-editorial (uppercase, mono-achtig). */
export const eyebrow =
  'label-editorial font-mono text-[var(--ink-4)]'

/** Basis-invoerveld — hairline-rand, accent-focusring. */
export function inputBase(accent: Accent = 'kern'): string {
  const focus: Record<Accent, string> = {
    kern: 'focus:border-kern-500 focus:ring-kern-500',
    horizon: 'focus:border-horizon-500 focus:ring-horizon-500',
    wil: 'focus:border-wil-500 focus:ring-wil-500',
  }
  return `w-full border border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink)] outline-none focus:ring-1 ${focus[accent]}`
}

/** Foutvariant op invoer (semantisch negatief). */
export const inputError =
  'border-negative focus:border-negative focus:ring-negative'

/** Foutmelding-tekst. */
export const errorText = 'mt-1 font-serif text-xs text-negative'

/** Hint-tekst onder een veld. */
export const hintText = 'mt-1 font-serif text-xs italic text-[var(--ink-3)]'
