import { Info } from 'lucide-react'

/**
 * DisclaimerStrip — Wft-disclaimer banner.
 *
 * Verschijnt onderaan iedere bibliotheek-surface (lijst + detail) en
 * herinnert bezoekers eraan dat een rekenhulp geen financieel advies is.
 * Twee varianten:
 *  - `card`   → eigen banner met border + subtle bg (op zichzelf staand)
 *  - `inline` → minimale variant zonder eigen container, voor gebruik
 *                binnen bestaande cards/footers
 *
 * Tekst staat hard in de component zodat we 'm centraal kunnen
 * wijzigen wanneer de Wft-tekst herzien wordt.
 */
const DISCLAIMER_TEXT =
  'Educatief, geen financieel advies. Cijfers zijn vereenvoudigingen — gebruik ze als richtlijn, niet als beslissing.'

export function DisclaimerStrip({
  variant = 'card',
}: {
  variant?: 'card' | 'inline'
}) {
  if (variant === 'inline') {
    return (
      <p className="inline-flex items-center gap-1.5 text-[11px] italic text-[var(--ink-3)] leading-snug">
        <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>{DISCLAIMER_TEXT}</span>
      </p>
    )
  }

  return (
    <aside
      role="note"
      className="mt-6 flex items-start gap-2 rounded-2xl border border-[var(--border-ed)] bg-[var(--subtle)]/60 px-4 py-3"
    >
      <Info
        className="w-4 h-4 shrink-0 mt-0.5 text-[var(--ink-3)]"
        aria-hidden="true"
      />
      <p className="text-[11px] italic text-[var(--ink-3)] leading-snug">
        {DISCLAIMER_TEXT}
      </p>
    </aside>
  )
}
