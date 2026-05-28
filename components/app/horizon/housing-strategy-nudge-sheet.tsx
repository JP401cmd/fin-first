'use client'

import { Home, Scissors, KeyRound, Sprout, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'

interface HousingStrategyNudgeSheetProps {
  /** Initiele open-state — moet `true` zijn als de sheet getoond moet worden. */
  open: boolean
  /** Wordt aangeroepen bij sluiten (close-button, escape, "Later" klik, "Strategie instellen" klik). */
  onDismiss: () => void
}

/**
 * Educatieve sheet die eenmaal verschijnt bij eerste Horizon-bezoek voor
 * gebruikers met een eigen woning + nog onbewuste housing-strategy-keuze
 * (mode = 'include_full' en housing_strategy_dismissed_at IS NULL).
 *
 * Inhoud: probleemstelling + 4 strategie-richtingen + CTA naar Instellingen.
 * Bij elke afsluitactie (knop of overlay-dismiss) wordt onDismiss() geroepen,
 * waarna de parent een PUT /api/housing-strategy { mark_dismissed: true }
 * uitvoert zodat de sheet niet terugkomt.
 */
export function HousingStrategyNudgeSheet({ open, onDismiss }: HousingStrategyNudgeSheetProps) {
  return (
    <ShellOverlay
      kind="sheet"
      size="lg"
      open={open}
      onClose={onDismiss}
      title="Je eigen woning in pensioenplanning"
    >
      <div className="space-y-5 px-4 py-2 sm:px-2">
        <p className="font-sans text-sm leading-relaxed text-[var(--ink-2)]">
          Op dit moment telt je eigen woning <strong>volledig</strong> mee in je FIRE-berekening.
          Dat geeft een vertekend beeld: je kunt het geld pas gebruiken als je het huis verkoopt
          of een opeethypotheek afsluit — beide hebben gevolgen voor je woonkosten.
        </p>

        <div className="border border-[var(--ink)] border-l-4 border-l-[var(--module-active-500)] bg-[var(--paper)] p-4 font-serif text-sm leading-snug text-[var(--ink-2)]">
          <p className="font-serif italic font-bold not-italic text-[var(--ink)]">Voorbeeld:</p>
          <p className="mt-1">
            €500K beleggingen + €300K overwaarde lijkt op €800K, maar je hebt feitelijk maar €500K
            om in te teren tenzij je het huis los maakt. Je FIRE-leeftijd ligt waarschijnlijk
            later dan je nu denkt.
          </p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Vier richtingen om uit te kiezen
          </p>
          <ul className="mt-3 space-y-3">
            <Bullet
              Icon={Home}
              title="Volledig meetellen"
              text="Huidige gedrag. Eenvoudig, maar onrealistisch."
            />
            <Bullet
              Icon={Sprout}
              title="Uitsluiten van FIRE-pot"
              text="Conservatief — past bij internationale FIRE-canon."
            />
            <Bullet
              Icon={Scissors}
              title="Verkopen op gekozen moment"
              text="Plan een verkoopleeftijd; opbrengst gaat naar belegbaar vermogen, een nieuwe woonlast verschijnt."
            />
            <Bullet
              Icon={KeyRound}
              title="Opeethypotheek"
              text="Blijf wonen; ontvang maandelijks geld uit de overwaarde."
            />
          </ul>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            Later beslissen
          </button>
          <Link
            href="/toekomst"
            onClick={onDismiss}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-colors hover:opacity-90"
          >
            Stel je strategie in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </ShellOverlay>
  )
}

function Bullet({
  Icon,
  title,
  text,
}: {
  Icon: typeof Home
  title: string
  text: string
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)] text-[var(--ink-2)]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        <p className="text-xs text-[var(--ink-3)]">{text}</p>
      </div>
    </li>
  )
}
