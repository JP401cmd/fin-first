'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown } from 'lucide-react'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { KaternMelding as KaternMeldingData } from '@/lib/horizon/katern-meldingen'
import { katernMeldingGeminimaliseerdSr, katernMeldingNogLabel } from '@/lib/horizon/katern-copy'
import type { BannerDisplay } from '@/lib/page-status/display'
import {
  PageStatusBannerBody,
  statusBannerTone,
} from '@/components/app/page-status-banner-body'

/**
 * KaternMelding — het meldingenslot bovenaan een katern op /toekomst (ADR 0179 D6,
 * spec §4.8). Presentational: de host geeft de gesorteerde meldingen van dít katern
 * (`wijsMeldingenToe(...)[katern].meldingen`) en de weergave uit
 * `useKaternMeldingMinimize`.
 *
 * - Hoogstens één melding uitgeklapt: de eerste (hoogste ernst). Het aantal staat bij het
 *   punt op de katern-kop. De overige staan ingeklapt onder "Nog N" (fixronde C1): een
 *   tweede melding mag de eerste niet onbereikbaar maken — in Instellingen is de
 *   gegevensmelding de enige ingang naar /mijn/profiel, in Plan staat de tekort-lening
 *   onder "niet haalbaar". Uitgeklapt zijn het dezelfde kaarten, zonder eigen
 *   Minimaliseren (dat geldt per katern).
 * - Geminimaliseerd rendert het slot niets zichtbaars; het punt op de katern-kop blijft.
 * - De kaart zelf is `PageStatusBannerBody` (`variant="compact"`), dezelfde component
 *   als `PageStatusBanner`: één uiterlijk, geen tweede variant (CLAUDE.md,
 *   meldingen-conventie). Desktop: de banner-look; mobiel: één regel van 44px (titel +
 *   actie + minimaliseren), de uitleg na een tik. Stoplichtklassen voor warn/bad/good;
 *   informatief (neutral) in de horizon-toon, net als de informatieve vrijheidsbanner.
 * - De `aria-live`-regio is altijd gemount; minimaliseren en heropenen worden
 *   aangekondigd.
 */
export interface KaternMeldingProps {
  meldingen: readonly KaternMeldingData[]
  display: BannerDisplay | 'none'
  onMinimize: () => void
  /** Zonder host die het onthoudt geen knop die niets doet. Default `true`. */
  canMinimize?: boolean
  className?: string
}

/** Kicker zoals `PageStatusBanner`: alleen bij alarm; informatief draagt de titel het. */
function kicker(ernst: LeverageStatus): string | null {
  if (ernst === 'bad') return 'Actie nodig'
  if (ernst === 'warn') return 'Aandacht'
  return null
}

export function KaternMelding({
  meldingen,
  display,
  onMinimize,
  canMinimize = true,
  className = '',
}: KaternMeldingProps) {
  const [melding, ...overige] = meldingen
  const zichtbaar = melding != null && display === 'expanded'

  return (
    <section role="status" aria-live="polite" className={className} data-testid="katern-melding">
      {melding != null && display === 'minimized' && (
        <span className="sr-only">{katernMeldingGeminimaliseerdSr(melding.katern)}</span>
      )}
      {zichtbaar && (
        <MeldingKaart melding={melding} onMinimize={canMinimize ? onMinimize : undefined} />
      )}
      {/* Per katern een eigen uitklapstand: `key` zet hem terug bij een katernwissel
          (het slot blijft in de layout gemount). */}
      {zichtbaar && overige.length > 0 && <OverigeMeldingen key={melding.katern} meldingen={overige} />}
    </section>
  )
}

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

/**
 * Eén melding als kaart: `PageStatusBannerBody` compact, het enige uiterlijk.
 *
 * Een tweede actie (spec §4.8, "Stopmoment →") staat vanaf `lg` in de actie-rij naast
 * de eerste (`extraActions`). Mobiel is de kaart één regel (titel · actie ·
 * minimaliseren); daar staat de tweede actie onder de uitleg, na een tik op de titel —
 * dezelfde plek als de uitleg zelf. Elke actie wijst naar één plek; beide varianten
 * dragen dezelfde href.
 */
function MeldingKaart({ melding, onMinimize }: { melding: KaternMeldingData; onMinimize?: () => void }) {
  const uitleg = melding.uitleg || null
  const tweede = melding.actie != null ? (melding.tweedeActie ?? null) : null
  return (
    <PageStatusBannerBody
      variant="compact"
      tone={statusBannerTone(melding.ernst, melding.ernst === 'neutral')}
      kicker={kicker(melding.ernst)}
      title={melding.titel}
      explanation={
        tweede == null ? (
          uitleg
        ) : (
          <>
            {uitleg}
            <span className="flex lg:hidden">
              <Link
                href={tweede.href}
                className={`inline-flex min-h-[44px] items-center gap-1 font-sans text-[12px] font-semibold not-italic text-[var(--ink)] underline underline-offset-4 ${FOCUS_RING}`}
              >
                {tweede.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </span>
          </>
        )
      }
      action={melding.actie}
      extraActions={
        tweede != null ? (
          <Link
            href={tweede.href}
            className={`inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] ${FOCUS_RING}`}
          >
            {tweede.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : undefined
      }
      onMinimize={onMinimize}
      rootProps={{ 'data-testid': `katern-melding-${melding.id}`, 'data-ernst': melding.ernst }}
    />
  )
}

/**
 * "Nog N meldingen" met uitklap. `aria-live="off"`: een klik van de gebruiker hoeft de
 * statusregio niet opnieuw voor te lezen — de knop meldt de stand zelf (`aria-expanded`).
 */
function OverigeMeldingen({ meldingen }: { meldingen: readonly KaternMeldingData[] }) {
  const [open, setOpen] = useState(false)
  const lijstId = useId()
  return (
    <div aria-live="off" data-testid="katern-melding-overige">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={lijstId}
        className="inline-flex min-h-[44px] items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {katernMeldingNogLabel(meldingen.length)}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        // Mobiel 8px tussen de kaarten; vanaf `lg` draagt elke kaart zelf `mt-4`.
        <ul id={lijstId} className="space-y-2 lg:space-y-0">
          {meldingen.map((m) => (
            <li key={m.id}>
              <MeldingKaart melding={m} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
