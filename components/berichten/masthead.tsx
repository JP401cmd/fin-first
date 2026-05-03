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
    <header className="mb-6">
      {/* Editorial masthead \u2014 krant-stijl met dubbele lijn boven */}
      <div
        className="mb-3"
        style={{ borderTop: '4px double var(--ink)', height: '4px' }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-2)]">
          {jaargang != null
            ? `Jaargang ${jaargang} \u00B7 Editie ${displayEditionNr}`
            : `Editie ${displayEditionNr}`}
        </span>
        <span
          className="italic text-[12px] text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Persoonlijk financieel overzicht
        </span>
      </div>
      <h1
        className="mt-2 text-center text-3xl font-black italic tracking-[-0.025em] sm:text-4xl md:text-[2.75rem]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        TriFinity{' '}
        <span style={{ color: 'var(--color-horizon-500)' }}>.</span>
      </h1>
      <p
        className="mt-1.5 text-center italic text-sm text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {displayDateline}
      </p>
      {/* Dubbele afsluiting onder masthead */}
      <div className="mt-3 h-[2px] bg-[var(--ink)]" />
      <div className="mt-[3px] h-px bg-[var(--ink)]" />
    </header>
  )
}
