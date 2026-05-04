export function SectionKicker({
  module,
  title,
  subtitle,
}: {
  /**
   * Accepted for backwards-compatibility — preserves the `report-{module}-accent`
   * print-fallback class so the printed sparkline strokes still pick up the
   * correct hex color even on cross-module routes. The on-screen kicker color
   * is driven by `--module-active-700` (cross-module fallback: ink) so the
   * cards stay neutral on /rapportages and only get module-tinted on the
   * /core, /will, /horizon module-routes.
   */
  module: 'kern' | 'wil' | 'horizon'
  title: string
  subtitle?: string
}) {
  const printAccentClass = module === 'kern'
    ? 'report-kern-accent'
    : module === 'wil'
      ? 'report-wil-accent'
      : 'report-horizon-accent'

  return (
    <div className="report-kicker mb-4 border-b border-dashed border-[var(--border-ed)] pb-2">
      <p className={`font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--module-active-700)] ${printAccentClass}`}>
        {title}
        {subtitle && (
          <span className="font-normal text-[var(--ink-4)] ml-2">&middot; {subtitle}</span>
        )}
      </p>
    </div>
  )
}
