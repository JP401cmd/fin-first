import { memo } from 'react'

export const KassabonShell = memo(function KassabonShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        'rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 px-3 py-3 font-mono text-xs sm:px-4 sm:py-4 sm:text-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
})
