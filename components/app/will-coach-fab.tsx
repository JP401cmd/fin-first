'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageSquare, X, Sparkles, ArrowRight } from 'lucide-react'

/**
 * WillCoachFAB — Floating Action Button rechtsonder die Will (de AI-
 * persona) op elke pagina toegankelijk maakt.
 *
 * Plan §6.5: "Will is zowel de stem (briefing in natuurlijke taal) als
 * de interactie-modus (chat overal contextueel). De gebruiker ervaart
 * één entiteit, niet zes losse AI-features."
 *
 * MVP-scope: visuele scaffolding + sheet met intro-content + deeplinks
 * naar de bestaande Will-outputs (briefing op /overzicht). Echte chat-
 * interface met LLM-call komt later (plan T-1 vervolg).
 *
 * `print:hidden` zodat de FAB niet op PDF-exports terechtkomt
 * (consistent met PrintTijdasButton).
 */
export function WillCoachFAB() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Vraag Will (coach-chat)"
        title="Vraag Will"
        className="print:hidden fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 hover:scale-105 active:scale-95 transition-all"
      >
        <MessageSquare className="w-5 h-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Will coach-chat"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-end sm:justify-end bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-violet-100 text-violet-700 text-sm font-bold">
                  W
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
                    Will — coach
                  </div>
                  <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5">
                    Hoe kan ik helpen?
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Sluiten"
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </header>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/60 to-stone-50 p-3 mb-4">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-violet-700 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-[var(--ink-2)] leading-relaxed">
                  Wil je een gesprek over je vermogen of plannen? De chat-
                  flow is in ontwikkeling. Voor nu vind je mijn samenvatting
                  in de briefing op het overzicht.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Link
                href="/overzicht"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] px-4 py-3 transition-all"
              >
                <span className="text-sm font-medium text-[var(--ink-2)]">
                  Bekijk briefing op overzicht
                </span>
                <ArrowRight className="w-4 h-4 text-[var(--ink-3)]" aria-hidden="true" />
              </Link>
              <Link
                href="/toekomst"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] px-4 py-3 transition-all"
              >
                <span className="text-sm font-medium text-[var(--ink-2)]">
                  Tijdas-projectie met scenarios
                </span>
                <ArrowRight className="w-4 h-4 text-[var(--ink-3)]" aria-hidden="true" />
              </Link>
              <Link
                href="/will"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] px-4 py-3 transition-all"
              >
                <span className="text-sm font-medium text-[var(--ink-2)]">
                  Acties + voorstellen (legacy)
                </span>
                <ArrowRight className="w-4 h-4 text-[var(--ink-3)]" aria-hidden="true" />
              </Link>
            </div>

            <p className="mt-4 text-[10px] italic text-[var(--ink-4)] leading-snug">
              Will is de AI-persona van TriFinity — één stem voor briefing,
              tips en straks coach-chat.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
