'use client'

interface SectionDividerProps {
  /** Visual variant: 'line' renders a horizontal rule, 'asterisk' renders * * * */
  variant?: 'line' | 'asterisk'
  /** Additional CSS classes */
  className?: string
}

/**
 * Editorial section divider inspired by fd.nl horizontal rules and * * * separators.
 * Use between content blocks for visual breathing room.
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

  return (
    <hr
      className={`my-8 mx-auto max-w-[80%] border-t border-[var(--border-ed)] ${className}`}
    />
  )
}
