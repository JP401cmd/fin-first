export function Footer() {
  return (
    <footer className="border-t-2 border-[var(--ink)] bg-[var(--bg)] px-6 py-8 md:px-12">
      <div className="mx-auto max-w-6xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        {/* Wordmark: tf. */}
        <div className="flex items-center">
          <span className="font-display text-[22px] font-bold leading-none text-[var(--ink)]">t</span>
          <span className="font-display text-[22px] font-bold leading-none text-kern-600">f.</span>
          <span className="ml-2 font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
            TriFinity
          </span>
        </div>

        {/* Tagline */}
        <span className="font-serif italic text-sm text-[var(--ink-3)]">
          Geld is opgeslagen tijd
        </span>

        {/* Module-indicators — verborgen op mobiel */}
        <div className="hidden items-center gap-5 md:flex">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-kern-600">
            De Kern
          </span>
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-600">
            De Wil
          </span>
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
            De Horizon
          </span>
        </div>

        <span className="font-sans text-xs text-[var(--ink-4)]">
          &copy; {new Date().getFullYear()} TriFinity
        </span>
      </div>
    </footer>
  )
}
