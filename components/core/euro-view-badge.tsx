'use client'

/**
 * Euro-weergave-badge — toont op een oppervlak WELKE euro-weergave geldt.
 *
 * BEWUST ONZICHTBAAR IN NOMINAAL: in `'nominal'` rendert dit component `null`.
 * Nominaal is de default en exact het beeld van vandaag; een badge die daar
 * altijd staat is pure ruis en zou elk bestaand scherm veranderen. Alleen als
 * de gebruiker actief naar "huidige euro's" is geschakeld verschijnt de badge —
 * dan is hij juist noodzakelijk, omdat de getoonde bedragen dan afwijken van de
 * nominale projectie.
 *
 * Klikbaar: de badge is meteen de weg terug (toggle naar nominaal), zodat een
 * gebruiker die zich afvraagt "waarom staat hier een ander bedrag?" het in één
 * klik kan vergelijken.
 *
 * Kleur volgt het module-accent van de actieve route (`--module-active-*`) — de
 * badge hangt vooral op /toekomst-oppervlakken (horizon), maar wordt in wave 3
 * ook op /overzicht gebruikt. Geen Tailwind-standaardkleuren (CLAUDE.md).
 */

import { Wallet } from 'lucide-react'
import { useEuroView } from '@/lib/hooks/use-euro-view'

export function EuroViewBadge({ className = '' }: { className?: string }) {
  const { view, toggle } = useEuroView()

  // Nominaal = het huidige beeld → geen badge, geen ruis.
  if (view === 'nominal') return null

  return (
    <button
      type="button"
      onClick={toggle}
      title="Bedragen staan in koopkracht van vandaag. Klik om terug te gaan naar toekomstige euro's."
      aria-label="Weergave: huidige euro's. Klik om toekomstige euro's te tonen."
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[11px] font-medium leading-none transition-colors',
        'border-[var(--module-active-200)] bg-[var(--module-active-50)] text-[var(--module-active-700)]',
        'hover:bg-[var(--module-active-100)]',
        className,
      ].join(' ')}
    >
      <Wallet className="h-3 w-3" aria-hidden="true" />
      Huidige euro&rsquo;s
    </button>
  )
}
