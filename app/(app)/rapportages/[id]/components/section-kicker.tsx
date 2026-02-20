export function SectionKicker({
  module,
  title,
  subtitle,
}: {
  module: 'kern' | 'wil' | 'horizon'
  title: string
  subtitle?: string
}) {
  const accentClass = module === 'kern'
    ? 'text-kern-600 report-kern-accent'
    : module === 'wil'
      ? 'text-wil-600 report-wil-accent'
      : 'text-horizon-600 report-horizon-accent'

  return (
    <div className="report-kicker mb-4 border-b border-dashed border-[var(--border-ed)] pb-2">
      <p className={`font-inter text-[10px] font-bold uppercase tracking-[0.08em] ${accentClass}`}>
        {title}
        {subtitle && (
          <span className="font-normal text-[var(--ink-4)] ml-2">&middot; {subtitle}</span>
        )}
      </p>
    </div>
  )
}
