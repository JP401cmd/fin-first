import type { ReactNode } from 'react'

/**
 * Sectie-primitive binnen `<AppSetupGate>`. Levert de visuele consistentie
 * over alle setup-schermen: kicker (uppercase eyebrow), titel (serif),
 * optionele hint (italic), en de sectie-inhoud zelf. Tussen secties
 * rendert `<AppSetupGate>` een dashed-divider — daarom heeft deze
 * primitive zelf geen border-bottom.
 *
 * Editorial Library convention: sentence-case, geen uitroeptekens,
 * `var(--ink-*)` voor tekst-hiërarchie.
 */
export function AppSetupSection({
  kicker,
  title,
  hint,
  children,
}: {
  kicker: string
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <header>
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {kicker}
        </p>
        <h3
          className="mt-1 font-serif text-lg font-semibold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {title}
        </h3>
        {hint && (
          <p className="mt-1 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
            {hint}
          </p>
        )}
      </header>
      <div>{children}</div>
    </section>
  )
}
