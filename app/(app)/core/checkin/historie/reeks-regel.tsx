'use client'

import { berekenReeks } from '@/lib/checkin/reeks'

/**
 * ReeksRegel — de lopende check-in-reeks, bovenin de historie.
 *
 * Eén rustige regel tussen hairlines, geen kaart: de historie is al een lijst
 * van kaarten en de reeks is een terzijde, geen KPI. Verschijnt pas vanaf twee
 * maanden op rij — bij één maand valt er niets te erkennen, en een reeks van 0
 * krijgt bewust géén melding (erkennen, niet straffen).
 *
 * Vanaf drie maanden — de eerste mijlpaal uit `REEKS_MIJLPALEN` — kleurt het
 * cijfer mee in het wil-accent. `wil-*` en niet `--module-active-*`: net als de
 * rest van dit blok valt de backing-route `/core/checkin` buiten de wil-route-
 * override, dus staat het accent hier expliciet.
 *
 * Rekent niet zelf: de telling komt uit `berekenReeks` — dezelfde bron als het
 * afsluitmoment na de check-in.
 */
export function ReeksRegel({
  completedMonths,
  nu = new Date(),
}: {
  /** `YYYY-MM`-lijst uit GET /api/monthly-checkin. */
  completedMonths: string[]
  /** Injecteerbaar voor tests; standaard de huidige datum. */
  nu?: Date
}) {
  const reeks = berekenReeks(completedMonths, nu)
  if (reeks < 2) return null

  const isMijlpaalKleur = reeks >= 3

  return (
    <p
      className="mb-4 border-y border-[var(--border-ed)] py-2.5 text-center font-serif text-sm italic leading-snug text-[var(--ink-2)]"
      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
    >
      Je staat op{' '}
      <span
        className={`font-mono not-italic tabular-nums font-semibold ${
          isMijlpaalKleur ? 'text-wil-700' : 'text-[var(--ink)]'
        }`}
      >
        {reeks}
      </span>{' '}
      maanden op rij.
    </p>
  )
}
