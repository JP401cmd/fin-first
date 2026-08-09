interface MastheadProps {
  editionNr?: number
  jaargang?: number
  dateline?: string
  /**
   * Overrides the left side of the meta row. The messages centre passes a
   * live status string here (e.g. "3 ongelezen") because "Editie/Jaargang"
   * is news-terminology that has no meaning without an edition.
   */
  metaLeft?: string
  /** Aantal artikelen in deze editie — getoond in de colofon-regel */
  articleCount?: number
  /** ISO-tijdstip waarop de editie is samengesteld — getoond als "Bijgewerkt …" */
  updatedAt?: string
  /** Grondslag-regel, bijv. "Gebaseerd op 38 bronartikelen" — transparantie over grounding */
  sourceNote?: string
  /**
   * Laat de editie-aanduiding links in de metaregel weg (NWS-1, Eenvoudig).
   * Editienummer en jaargang zijn krant-folklore: leuk voor wie de metafoor
   * herkent, betekenisloos voor wie gewoon wil weten wat er vandaag staat.
   * `metaLeft` (het berichtencentrum) wint hier nog steeds van — dat is een
   * live statusregel, geen editie-aanduiding.
   */
  hideEdition?: boolean
}

// Kapitaliseer de eerste letter — nl-NL geeft "maandag", krantdatelines zijn "Maandag …"
function capitalize(str: string): string {
  return str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : str
}

// "Bijgewerkt 08:14" als de editie van vandaag is, anders "Bijgewerkt 29 mei"
function formatUpdated(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const when = sameDay
    ? d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return `Bijgewerkt ${when}`
}

export function Masthead({ editionNr, jaargang, dateline, metaLeft, articleCount, updatedAt, sourceNote, hideEdition = false }: MastheadProps) {
  const now = new Date()
  const rawDateline = dateline ?? now.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const displayDateline = capitalize(rawDateline)

  // Fallback edition nr from date (backward compat)
  const launchDate = new Date(2026, 0, 1)
  const displayEditionNr = editionNr ?? Math.max(1, Math.floor((now.getTime() - launchDate.getTime()) / 86_400_000))

  const leftMeta = metaLeft ?? (hideEdition
    ? ''
    : jaargang != null
      ? `Jaargang ${jaargang} · Editie ${displayEditionNr}`
      : `Editie ${displayEditionNr}`)

  // Colofon-regel: aantal artikelen + bijgewerkt-tijd (alleen tonen wat beschikbaar is)
  const colophonParts = [
    articleCount && articleCount > 0
      ? `${articleCount} ${articleCount === 1 ? 'artikel' : 'artikelen'}`
      : null,
    updatedAt ? formatUpdated(updatedAt) : null,
    sourceNote ?? null,
  ].filter(Boolean) as string[]

  return (
    <header className="mb-6">
      {/* Editorial masthead \u2014 krant-stijl met dubbele lijn boven */}
      <div
        className="mb-3"
        style={{ borderTop: '4px double var(--ink)', height: '4px' }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-2)]">
          {leftMeta}
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
      {colophonParts.length > 0 && (
        <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-[var(--ink-4)]">
          {colophonParts.join(' · ')}
        </p>
      )}
      {/* Dubbele afsluiting onder masthead */}
      <div className="mt-3 h-[2px] bg-[var(--ink)]" />
      <div className="mt-[3px] h-px bg-[var(--ink)]" />
    </header>
  )
}
