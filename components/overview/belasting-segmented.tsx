'use client'

/**
 * Segmented control voor /overzicht/belasting — scroll-anchor links naar
 * de Box 3 (#box3) en Box 2 (#box2) secties binnen de BelastingPage.
 *
 * Geen route-changes: BelastingPage rendert beide boxen op één pagina,
 * dus de tabs scrollen naar de juiste section. "Alles" reset naar top.
 *
 * Bij toekomstige Box 1-implementatie wordt een derde anchor toegevoegd
 * (#box1). De huidige page bevat alleen Box 3 + Box 2 als zichtbare
 * sections; Box 1-data is verspreid in uitsluitingen.
 */
const SEGMENTS = [
  { label: 'Alles', anchor: '#top' },
  { label: 'Box 3', anchor: '#box3' },
  { label: 'Box 2', anchor: '#box2' },
] as const

export function BelastingSegmented() {
  const handleClick = (anchor: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (anchor === '#top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const target = document.querySelector(anchor)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <nav
      aria-label="Spring naar belasting-onderdeel"
      className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-[var(--border-ed)] bg-[var(--subtle)] p-1"
    >
      {SEGMENTS.map(({ label, anchor }) => (
        <a
          key={anchor}
          href={anchor}
          onClick={handleClick(anchor)}
          className="flex-1 min-w-[64px] text-center text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--paper)] transition-colors"
        >
          {label}
        </a>
      ))}
    </nav>
  )
}
