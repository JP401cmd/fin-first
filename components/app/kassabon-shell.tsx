export function KassabonShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        'rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
