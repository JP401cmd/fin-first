/**
 * FormError — inline veld-validatie onder een form input.
 *
 * Ontwerp-referentie: `.claude/commands/ui-ux.md` — sectie
 * "Error states & form-validatie" + "Accessibility diepte".
 *
 * Copy-formule: *wat ging mis + hoe fix je het*. Geef dus boodschappen
 * als "Vul een bedrag groter dan 0 in." — nooit "Ongeldige invoer".
 *
 * Gebruik:
 *   const errorId = formErrorId('amount')
 *   <input aria-invalid={!!error} aria-describedby={errorId} ... />
 *   <FormError id={errorId} message={error} />
 *
 * Accessibility:
 *  - severity="error" (default): `role="alert"` (implicit aria-live="assertive")
 *  - severity="warning": `role="status"` + expliciete `aria-live="polite"`
 *  - Render is no-op bij lege/null message — de caller kan onvoorwaardelijk
 *    mounten zonder extra guards.
 *
 * Design tokens:
 *  - Error: `text-negative` (var(--negative), oklch 0.50 0.09 25)
 *  - Warning: valt terug op `text-[var(--ink-3)]` — er is nog geen
 *    `--warning` token in globals.css. Zodra dat token bestaat kan de
 *    fallback eruit.
 *
 * Animatie: `animate-fade-in` (spotlight-fade-in, 0.3s) respecteert
 * `prefers-reduced-motion` via het bestaande media-query block in
 * globals.css (r400-410).
 */

import { AlertTriangle } from 'lucide-react'

export type FormErrorSeverity = 'error' | 'warning'

export interface FormErrorProps {
  /**
   * DOM id — moet matchen met de `aria-describedby` van het bijbehorende
   * input-element. Gebruik `formErrorId(fieldName)` voor consistentie.
   */
  id: string
  /**
   * De foutboodschap. Bij `null`, `undefined` of lege string rendert de
   * component niets (return null).
   */
  message?: string | null
  /**
   * `error` (default) = assertief, rood, icoon + tekst in `text-negative`.
   * `warning` = polite, zachter, icoon + tekst in `text-[var(--ink-3)]`.
   */
  severity?: FormErrorSeverity
}

/**
 * Bouw een consistente DOM-id voor een form-error element.
 *
 * Gebruik dit in plaats van ad-hoc string-concatenatie zodat
 * `aria-describedby` aan de input-kant en de `id` op <FormError /> altijd
 * gegarandeerd overeenkomen.
 */
export function formErrorId(fieldName: string): string {
  return `form-error-${fieldName}`
}

export function FormError({ id, message, severity = 'error' }: FormErrorProps) {
  // Empty message → niets renderen. Zo kan de caller <FormError />
  // onvoorwaardelijk mounten zonder guard — scheelt ternary-ruis in forms.
  if (!message) return null

  const isError = severity === 'error'

  // role="alert" heeft impliciet aria-live="assertive" + aria-atomic="true",
  // dus daar hoeven we niets bij te zetten. Voor warnings kiezen we
  // role="status" (polite) zodat niet-kritieke hints de gebruiker niet
  // onderbreken midden in een actie.
  const role = isError ? 'alert' : 'status'
  const ariaLive = isError ? undefined : 'polite'

  // Kleur-token: error gebruikt het semantische --negative token;
  // warning heeft (nog) geen eigen token, dus tijdelijk --ink-3.
  const textClass = isError ? 'text-negative' : 'text-[var(--ink-3)]'

  return (
    <p
      id={id}
      role={role}
      aria-live={ariaLive}
      className={`animate-fade-in mt-1.5 flex items-start gap-1.5 text-sm ${textClass}`}
    >
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      <span>{message}</span>
    </p>
  )
}
