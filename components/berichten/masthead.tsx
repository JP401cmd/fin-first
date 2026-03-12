interface MastheadProps {
  editionNr?: number
  jaargang?: number
  dateline?: string
}

export function Masthead({ editionNr, jaargang, dateline }: MastheadProps) {
  const now = new Date()
  const displayDateline = dateline ?? now.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Fallback edition nr from date (backward compat)
  const launchDate = new Date(2026, 0, 1)
  const displayEditionNr = editionNr ?? Math.max(1, Math.floor((now.getTime() - launchDate.getTime()) / 86_400_000))

  return (
    <div className="mb-6">
      <div className="mb-3 h-[3px] bg-[var(--ink)]" />
      <div className="flex items-center justify-between">
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          {jaargang != null
            ? `Jaargang ${jaargang} \u00B7 Editie ${displayEditionNr}`
            : `Editie ${displayEditionNr}`}
        </span>
        <span className="font-source-serif text-[12px] italic text-[var(--ink-3)]">
          Persoonlijk financieel overzicht
        </span>
      </div>
      <h1
        className="mt-2 text-center font-playfair text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl md:text-[2.75rem]"
        style={{ letterSpacing: '-0.03em' }}
      >
        TriFinity Berichten
      </h1>
      <p className="mt-1.5 text-center font-source-serif text-sm italic text-[var(--ink-2)]">
        {displayDateline}
      </p>
      <div className="mt-3 flex items-center gap-0">
        <div className="h-[2px] flex-1 bg-[var(--ink)]" />
      </div>
      <div className="mt-[3px] h-px bg-[var(--ink)]" />
    </div>
  )
}
