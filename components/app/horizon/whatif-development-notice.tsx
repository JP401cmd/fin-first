import { Construction } from 'lucide-react'

/**
 * WhatIfDevelopmentNotice — "in ontwikkeling"-indicatie voor de Wat-Als-ervaring.
 *
 * Gedeelde, niet-sluitbare notice die bovenaan de what-if-ervaring verschijnt op
 * BEIDE oppervlakken: de volledige pagina (whatif-page-client) én het inline
 * `?whatif=open`-collapsible-paneel (via WhatIfSlidersCollapsible, de enige
 * gedeelde what-if-child die horizon-client daar rendert).
 *
 * Bewust semantiek, geen module-accent: neutrale editorial-tokens (`--subtle`,
 * `--border-ed`, `--ink-*`) i.p.v. een module-identiteitskleur — dit is een
 * status-mededeling, niet "hoort bij Toekomst". `role="note"` + hairline-kicker
 * houden 'm rustig maar duidelijk zichtbaar.
 */
export function WhatIfDevelopmentNotice({ className = '' }: { className?: string }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-3 border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3 ${className}`}
    >
      <Construction className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-2)]">
          Nog in ontwikkeling
        </p>
        <p className="mt-1 font-sans text-xs leading-relaxed text-[var(--ink-2)]">
          De Wat-Als-simulator is nog niet af. Je kunt hier vrij verkennen, maar
          de uitkomsten kunnen nog veranderen terwijl we deze functie afmaken.
        </p>
      </div>
    </div>
  )
}
