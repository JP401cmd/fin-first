'use client'

import { Fragment, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Info } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { GlossaryTerm } from '@/components/editorial/glossary-term'
import { GLOSSARY_ENTRIES } from '@/lib/glossary-data'
import type { PageInfoContent, PageInfoRelated, PageInfoWerking } from '@/lib/page-info-content'

/**
 * PageInfoButton — "Wat zie ik hier?" info-knop voor hoofdpagina's.
 *
 * Toont een klein i-icoon; bij klik/tap opent een ShellOverlay-sheet met
 * gelabelde secties. Vast: INZICHT (waarom deze pagina ertoe doet) en GRIP
 * (wat je hier concreet kunt doen) — de twee kernwoorden uit de belofte
 * "de vrijheid om met inzicht en grip keuzes te maken voor nu en de
 * toekomst". Optioneel daaronder: WERKING (hoe de functies werken en
 * wanneer je ze inzet), BEGRIPPEN (jargon-popovers uit de glossary) en
 * VERDER (verwante pagina's).
 *
 * Positie: absoluut t.o.v. parent (parent moet `relative` zijn).
 * Consistent rechts-boven geplaatst op alle hoofdpagina's.
 *
 * Bouwt op het verplichte overlay-systeem (ADR 0039) i.p.v. een bespoke
 * popover — dat geeft focus-trap, scroll-lock, safe-area-padding en het
 * automatisch verbergen van de FloatingNavButton gratis mee, en de
 * sheet-titel rendert al als `<h3>` (ADR 0110-conform, `bottom-sheet.tsx`).
 * De sectielabels hieronder zijn bewust kickers (`<span>`), geen koppen: dat
 * houdt de koppenvolgorde binnen de overlay intact.
 */

interface PageInfoButtonProps {
  /** INZICHT + GRIP (+ optioneel WERKING/BEGRIPPEN/VERDER) — zie lib/page-info-content.ts. */
  content: PageInfoContent
  /** Optionele titel boven de secties (default: "Wat zie ik hier?"). */
  label?: string
  /** Extra CSS-classes op de wrapper (bijv. voor positie-overrides). */
  className?: string
  /**
   * Optioneel: herstart een rondleiding op deze pagina. Alleen /overzicht geeft
   * 'm vandaag mee (ADR 0130). Aanwezig → een extra sectie RONDLEIDING onderaan
   * de sheet.
   *
   * Waarom hier en niet als losse knop op de pagina: de `i` is al de plek waar
   * "wat zie ik hier?" thuishoort, en een rondleiding is precies dat antwoord in
   * bewegende vorm. Een tweede permanente knop naast de `i` zou de
   * header-controls-rij laten groeien voor iets dat je één keer gebruikt.
   */
  onStartTour?: () => void
}

export function PageInfoButton({
  content,
  label = 'Wat zie ik hier?',
  className = '',
  onStartTour,
}: PageInfoButtonProps) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  /**
   * Sheet eerst dicht, dán starten. De ShellOverlay houdt zolang hij open staat
   * de scroll-lock én het overlay-signaal vast, en de rondleiding verbergt
   * zichzelf precies zolang die teller boven nul staat — meteen starten zou dus
   * een onzichtbare spotlight geven. De vertraging dekt de sluit-animatie.
   */
  const startTour = () => {
    close()
    window.setTimeout(() => onStartTour?.(), 350)
  }

  const werking = content.werking ?? []
  const terms = (content.terms ?? []).filter((term) => Boolean(GLOSSARY_ENTRIES[term]))
  const related = content.related ?? []

  const sections: { key: string; node: ReactNode }[] = []
  if (content.insight) {
    sections.push({ key: 'insight', node: <InfoSection kicker="INZICHT" text={content.insight} /> })
  }
  if (content.grip) {
    sections.push({ key: 'grip', node: <InfoSection kicker="GRIP" text={content.grip} /> })
  }
  if (werking.length > 0) {
    sections.push({ key: 'werking', node: <WerkingSection items={werking} /> })
  }
  if (terms.length > 0) {
    sections.push({ key: 'terms', node: <BegrippenSection terms={terms} /> })
  }
  if (related.length > 0) {
    sections.push({ key: 'related', node: <VerderSection items={related} onNavigate={close} /> })
  }
  if (onStartTour) {
    sections.push({ key: 'tour', node: <RondleidingSection onStart={startTour} /> })
  }

  // Alleen een gevulde WERKING-lijst rechtvaardigt de bredere sheet; korte
  // entries houden exact de compacte sheet die ze hadden.
  const size = werking.length > 0 ? 'md' : 'sm'

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-haspopup="dialog"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] transition-all hover:border-[var(--module-active-500)] hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      <ShellOverlay open={open} onClose={close} kind="sheet" size={size} title={label}>
        <div className="space-y-5">
          {sections.map((section, i) => (
            <Fragment key={section.key}>
              {i > 0 && <div className="border-t border-[var(--border-ed)]" />}
              {section.node}
            </Fragment>
          ))}
        </div>
      </ShellOverlay>
    </div>
  )
}

const SERIF = { fontFamily: 'var(--font-source-serif, Georgia, serif)' } as const

function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-px w-4"
        style={{ background: 'var(--module-active-500)' }}
      />
      <span className="text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
        {children}
      </span>
    </div>
  )
}

function InfoSection({ kicker, text }: { kicker: string; text: string }) {
  return (
    <div>
      <Kicker>{kicker}</Kicker>
      <p className="text-[13px] leading-relaxed text-[var(--ink-2)]" style={SERIF}>
        {text}
      </p>
    </div>
  )
}

/** WERKING — definitielijst: functienaam + wat 'ie doet en wanneer je 'm inzet. */
function WerkingSection({ items }: { items: PageInfoWerking[] }) {
  return (
    <div>
      <Kicker>WERKING</Kicker>
      <dl className="space-y-3">
        {items.map((item) => (
          <div key={item.title}>
            <dt className="text-[12px] font-semibold leading-snug text-[var(--ink)]">
              {item.title}
            </dt>
            <dd className="mt-0.5 text-[13px] leading-relaxed text-[var(--ink-2)]" style={SERIF}>
              {item.text}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** BEGRIPPEN — jargon uit deze pagina, uitgelegd via de bestaande popovers. */
function BegrippenSection({ terms }: { terms: string[] }) {
  return (
    <div>
      <Kicker>BEGRIPPEN</Kicker>
      <ul className="flex flex-wrap gap-x-3 gap-y-2">
        {terms.map((term) => (
          <li
            key={term}
            className="rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-[12px] text-[var(--ink-2)]"
          >
            <GlossaryTerm term={term} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** RONDLEIDING — herstart de interactieve rondleiding op deze pagina. */
function RondleidingSection({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <Kicker>RONDLEIDING</Kicker>
      <p className="text-[13px] leading-relaxed text-[var(--ink-2)]" style={SERIF}>
        Fin loopt in twee minuten met je langs de blokken op deze pagina en vertelt
        wat je cijfers betekenen.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-2.5 inline-flex min-h-[44px] items-center gap-1.5 border border-[var(--module-active-500)] px-3.5 py-2 text-[13px] font-medium text-[var(--module-active-700)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        Start de rondleiding opnieuw
      </button>
    </div>
  )
}

/** VERDER — verwante pagina's; navigeren sluit de sheet. */
function VerderSection({
  items,
  onNavigate,
}: {
  items: PageInfoRelated[]
  onNavigate: () => void
}) {
  return (
    <div>
      <Kicker>VERDER</Kicker>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className="group flex min-h-[36px] items-center gap-2 text-[13px] text-[var(--ink-2)] transition-colors hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <ArrowRight
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-[var(--module-active-500)]"
              />
              <span style={SERIF}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
