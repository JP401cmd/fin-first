'use client'

import { ArrowRight, Briefcase, Compass, Home, Wallet } from 'lucide-react'
import type { ManagedStrategy } from '@/lib/strategy-events'

/**
 * De vier levensstrategieën (AOW, Pensioen, Huis, Werk) als kaartenraster op
 * /toekomst/voorkeuren. Puur presentatie: de host (VoorkeurenView) beheert welke
 * editor open is en de `?strategie=`-deeplink.
 *
 * Verhuisd van /toekomst/gebeurtenissen op 17 sep 2026 (besluit eigenaar:
 * verhuizen, geen dubbeling). Strategieën zijn instellingen die over je hele
 * tijdas gelden — geen punt-in-tijd-gebeurtenissen — en horen daarom bij je
 * voorkeuren.
 *
 * BEWUST GEEN <HideInSimple> (S6). Twee zichtbare teksten op
 * /overzicht/belasting/box1 dragen de opdracht "vul je factor A in bij je
 * pensioen-strategie" en deeplinken hierheen (`?strategie=pensioen`). Hard
 * verbergen maakte daar een eenrichtingsdeeplink van: de editor opende wél,
 * maar ná sluiten was er in Eenvoudig geen zichtbare ingang meer.
 *
 * B-024: Eenvoudig reduceert de VÓRM, niet het aantal keuzes — alle vier de
 * strategieën staan in béíde modi; Eenvoudig krijgt een compacter raster (twee
 * kolommen vanaf de smalste viewport, strakkere padding).
 *
 * Kleur: het icoonvlak draagt het Toekomst-accent (`horizon-*`-tokens, door de
 * gebruiker instelbaar) — één toon voor alle vier, geen losse Tailwind-hues.
 */

const LEVENSSTRATEGIEEN: {
  key: ManagedStrategy
  label: string
  description: string
  Icon: typeof Compass
}[] = [
  {
    key: 'aow',
    label: 'AOW-strategie',
    description:
      'Ingangsleeftijd, leefsituatie en opbouwkorting (jaren buiten NL). Standaard = wettelijk.',
    Icon: Compass,
  },
  {
    key: 'pensioen',
    label: 'Pensioen-strategie',
    description:
      'Werknemerspensioen, lijfrente en banksparen — beheer al je pensioenpotten op één plek.',
    Icon: Wallet,
  },
  {
    key: 'huis',
    label: 'Huis-strategie',
    description:
      'Volledig meetellen, uitsluiten, verkopen of opeethypotheek — hoe je woning meetelt in je vrijheid.',
    Icon: Home,
  },
  {
    key: 'werk',
    label: 'Werk-strategie',
    description:
      'Salarisgroei, een plafond, minder werken en promotie-sprongen — je inkomenslijn over de jaren.',
    Icon: Briefcase,
  },
]

export function LevensstrategieenSection({
  simple,
  onOpen,
}: {
  /** Weergavemodus Eenvoudig → compacter raster (B-024), niet minder kaarten. */
  simple: boolean
  onOpen: (key: ManagedStrategy) => void
}) {
  return (
    <div>
      <header className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Toekomst — levensstrategieën
        </div>
        <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
          AOW, pensioen, huis en werk
        </h2>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Anders dan losse gebeurtenissen hebben strategieën eigen instellingen en
          gelden ze over je hele tijdas. Klik een strategie om hem in te stellen.
        </p>
      </header>

      <div
        className={
          simple
            ? 'grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4'
            : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'
        }
      >
        {LEVENSSTRATEGIEEN.map((strat) => {
          const Icon = strat.Icon
          return (
            <button
              key={strat.key}
              type="button"
              onClick={() => onOpen(strat.key)}
              className={`rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] flex flex-col text-left w-full hover:border-[var(--ink-3)] hover:shadow-sm transition-all ${
                simple ? 'p-3' : 'p-4 sm:p-5'
              }`}
            >
              <span
                aria-hidden="true"
                className={`${simple ? 'w-7 h-7 mb-2' : 'w-9 h-9 mb-3'} rounded-lg bg-horizon-50 text-horizon-700 flex items-center justify-center`}
              >
                <Icon className={simple ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
              </span>
              <h3 className="text-sm font-semibold text-[var(--ink)] mb-1.5">{strat.label}</h3>
              <p
                className={`${simple ? 'text-[11px]' : 'text-xs'} text-[var(--ink-2)] leading-snug flex-1`}
              >
                {strat.description}
              </p>
              <span className="mt-3 text-[11px] font-semibold text-horizon-700 inline-flex items-center gap-1">
                Bijwerken
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
