'use client'

import { useState } from 'react'
import { ChevronDown, Home } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { leningdelenLabel } from '@/lib/debt-leningdelen'

/**
 * Groepskop voor één hypotheek met meerdere leningdelen (W-005 / ADR 0140).
 *
 * In het kaart-grid van `/overzicht/schulden` (en de categoriepagina
 * `/core/debts/mortgage`) staan de delen van één hypotheek niet meer als losse
 * kaarten naast elkaar, maar onder één inklapbare kop met het groepstotaal.
 * Dichtgeklapt lees je "Hypotheek Rabobank · 3 leningdelen — € 350.000";
 * opengeklapt verschijnen de delen als de gewone `<VermogenDebtCard>`s die ze
 * altijd al waren (`children`) — elk met hun eigen rente, aflossingsvorm en
 * detail-pane.
 *
 * PRESENTATIE-ONLY: dit component rekent niets uit. De host levert het
 * groepstotaal (`groepeerLeningdelen` + zijn eigen perspectief-weging) en de
 * kaarten. De hoofdrij is zélf een leningdeel en zit dus gewoon tussen de
 * children — er is geen "omhulsel-rij" met een totaal erin, precies zoals de
 * migratie voorschrijft (anders telt elk bedrag dubbel in de rekenmotoren).
 *
 * Vorm: `card-editorial no-hover-lift` (het vat is zelf niet klikbaar, alleen
 * de kop-knop), 3px negatieve accentstreep zoals elke schuldkaart, bedragen in
 * DM Mono via `MaskedAmount` zodat de privacy-mask blijft werken.
 */
interface DebtLeningdeelGroepProps {
  /** Naam van de hypotheek — de naam van de hoofdrij. */
  naam: string
  /** Aantal leden (hoofdrij + delen). */
  aantalLeden: number
  /** Som van de leden, perspectief-correct door de host aangeleverd. */
  totaal: number
  /** Som van de maandlasten over de leden; `0` → niet getoond. */
  maandlast?: number
  /** Start opengeklapt (bv. wanneer de gebruiker op een deel deeplinkt). */
  defaultOpen?: boolean
  staggerIndex?: number
  /** De kaarten van hoofdrij + delen, in volgorde. */
  children: React.ReactNode
}

export function DebtLeningdeelGroep({
  naam,
  aantalLeden,
  totaal,
  maandlast = 0,
  defaultOpen = false,
  staggerIndex = 0,
  children,
}: DebtLeningdeelGroepProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className="card-editorial no-hover-lift animate-fade-up relative w-full sm:col-span-2 lg:col-span-3"
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
      data-testid="debt-leningdeel-groep"
    >
      {/* 3px accentstreep — zelfde negatieve semantiek als elke schuldkaart. */}
      <div
        className="relative z-10 h-[3px] w-full"
        style={{ backgroundColor: 'var(--negative)' }}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="relative z-10 flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--subtle)]/30 sm:p-4"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-negative/15" aria-hidden="true">
          <Home className="h-4 w-4 text-negative" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--ink)]">{naam}</span>
          {/* Meta in italic Source Serif — mini-artikel-blueprint. */}
          <span
            className="block truncate text-[11px] italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {leningdelenLabel(aantalLeden)} · {open ? 'delen zichtbaar' : 'klik om de delen te zien'}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-negative">
            <MaskedAmount
              value={Math.abs(totaal)}
              signPrefix="-"
              tone="kern"
              className="text-sm font-bold"
            />
          </span>
          {maandlast > 0 && (
            <span className="block text-[var(--ink-3)]">
              <MaskedAmount value={maandlast} tone="kern" className="text-[10px] font-medium" />
              <span className="text-[var(--ink-4)]">/mnd</span>
            </span>
          )}
        </span>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="relative z-10 border-t border-[var(--border-md)]/40 p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
        </div>
      )}
    </div>
  )
}
