'use client'

interface SectionDividerProps {
  /** Visual variant:
   *  - `'line'` (default) — thin horizontal rule, neutraal
   *  - `'asterisk'` — redactioneel * * * separator
   *  - `'double-rule'` — krant-masthead-stijl: 4px double + 1px solid (Type 1/10 hero) */
  variant?: 'line' | 'asterisk' | 'double-rule'
  /** Additional CSS classes */
  className?: string
}

/**
 * Editorial section divider met drie varianten.
 * Gebruik 'double-rule' voor hero-koppen op editorial pagina's
 * (gids, briefing, rapportage, jaaroverzicht). Niet voor chrome (TopBar/Sidebar).
 */
export function SectionDivider({ variant = 'line', className = '' }: SectionDividerProps) {
  if (variant === 'asterisk') {
    return (
      <div
        className={`my-8 text-center text-[var(--ink-4)] select-none ${className}`}
        style={{ letterSpacing: '0.5em' }}
        aria-hidden="true"
      >
        *&nbsp;*&nbsp;*
      </div>
    )
  }

  if (variant === 'double-rule') {
    return (
      <hr
        className={`my-7 border-0 ${className}`}
        style={{
          borderTop: '4px double var(--ink)',
          borderBottom: '1px solid var(--ink)',
          height: '6px',
        }}
        aria-hidden="true"
      />
    )
  }

  return (
    <hr
      className={`my-8 mx-auto max-w-[80%] border-t border-[var(--border-ed)] ${className}`}
    />
  )
}
