'use client'

import type { LeverageStatus } from '@/lib/leverage-status'
import type { KaternMelding as KaternMeldingData } from '@/lib/horizon/katern-meldingen'
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
 *   punt op de katern-kop, niet hier.
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

const GEMINIMALISEERD_SR =
  'Melding geminimaliseerd. Activeer het statuspunt op de katern-kop om de melding opnieuw te tonen.'

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
  const melding = meldingen[0] ?? null
  const zichtbaar = melding != null && display === 'expanded'

  return (
    <section role="status" aria-live="polite" className={className} data-testid="katern-melding">
      {melding != null && display === 'minimized' && <span className="sr-only">{GEMINIMALISEERD_SR}</span>}
      {zichtbaar && (
        <PageStatusBannerBody
          variant="compact"
          tone={statusBannerTone(melding.ernst, melding.ernst === 'neutral')}
          kicker={kicker(melding.ernst)}
          title={melding.titel}
          explanation={melding.uitleg || null}
          action={melding.actie}
          onMinimize={canMinimize ? onMinimize : undefined}
          rootProps={{ 'data-testid': `katern-melding-${melding.id}`, 'data-ernst': melding.ernst }}
        />
      )}
    </section>
  )
}
