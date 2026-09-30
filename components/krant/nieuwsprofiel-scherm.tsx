'use client'

// ── /mijn/nieuwsprofiel: je nieuwsprofiel bekijken en wijzigen ───────────────
//
// Krant 2C (ADR 0192). Host nummer twee van de gedeelde `ProfielBody`: alle vijf
// groepen onder elkaar, elk als h3-sectie onder de h2-aanhef van de pagina.
//
// Opslaan SLAAT ALLEEN OP (besluit eigenaar 29 sep, keuze 2A): wat al in je
// tijdlijn staat blijft een momentopname (U12). Een wijziging geldt vanaf de
// volgende verversing; wie niet wil wachten drukt "Nu vernieuwen" — dezelfde
// route als de knop op /nieuws (POST /api/krant/tijdlijn/vernieuwen, met zijn
// rem van tien minuten).
//
// Muteren via de API (ADR 0058): PUT /api/krant/profiel. Geen client-read: het
// profiel komt als prop van de server-page.

import { useState } from 'react'
import type { NieuwsprofielV1 } from '@/lib/krant/profiel'
import type { Herkomst } from '@/lib/krant/profiel-afleiding'
import { PROFIEL_GROEPEN, ProfielBody, putBodyUitConcept, useProfielConcept } from './profiel-body'

const ROMEINS = ['i.', 'ii.', 'iii.', 'iv.', 'v.'] as const

type Melding = { soort: 'ok' | 'fout'; tekst: string } | null

export interface NieuwsprofielSchermProps {
  start: NieuwsprofielV1
  herkomst: Herkomst
}

export function NieuwsprofielScherm({ start, herkomst: startHerkomst }: NieuwsprofielSchermProps) {
  const { profiel, gewijzigd, zet, opgeslagen } = useProfielConcept(start)
  const [herkomst, setHerkomst] = useState<Herkomst>(startHerkomst)
  const [bezig, setBezig] = useState<null | 'opslaan' | 'vernieuwen'>(null)
  const [opslagMelding, setOpslagMelding] = useState<Melding>(null)
  const [vernieuwMelding, setVernieuwMelding] = useState<Melding>(null)

  const aantalGewijzigd = gewijzigd.size

  async function opslaan() {
    const body = putBodyUitConcept(profiel, gewijzigd)
    if (!body) return
    setBezig('opslaan')
    setOpslagMelding(null)
    try {
      const res = await fetch('/api/krant/profiel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { profiel: NieuwsprofielV1; herkomst: Herkomst }
      opgeslagen(data.profiel)
      setHerkomst(data.herkomst)
      setOpslagMelding({ soort: 'ok', tekst: 'Opgeslagen. Het geldt vanaf je volgende verversing.' })
    } catch {
      setOpslagMelding({ soort: 'fout', tekst: 'Opslaan lukte niet. Probeer het nog eens.' })
    } finally {
      setBezig(null)
    }
  }

  async function vernieuwen() {
    setBezig('vernieuwen')
    setVernieuwMelding(null)
    try {
      const res = await fetch('/api/krant/tijdlijn/vernieuwen', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string }
      if (res.status === 429) {
        setVernieuwMelding({ soort: 'fout', tekst: data.error ?? 'Je hebt net vernieuwd. Probeer het over een paar minuten opnieuw.' })
      } else if (!res.ok) {
        setVernieuwMelding({ soort: 'fout', tekst: 'Vernieuwen lukte niet. Probeer het later nog eens.' })
      } else if (data.status === 'niets-nieuws') {
        setVernieuwMelding({ soort: 'ok', tekst: 'Er is sinds je vorige verversing geen nieuw bericht bijgekomen.' })
      } else {
        setVernieuwMelding({ soort: 'ok', tekst: 'Je tijdlijn is vernieuwd met je huidige profiel.' })
      }
    } catch {
      setVernieuwMelding({ soort: 'fout', tekst: 'Vernieuwen lukte niet. Probeer het later nog eens.' })
    } finally {
      setBezig(null)
    }
  }

  return (
    <div className="mt-8">
      <div className="space-y-12">
        {PROFIEL_GROEPEN.map((groep, i) => (
          <section key={groep.id} aria-labelledby={`nieuwsprofiel-${groep.id}`}>
            <div className="mb-6 flex items-center justify-between border-b border-[var(--rule-soft)] pb-2">
              <h3
                id={`nieuwsprofiel-${groep.id}`}
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--module-active-700)]"
              >
                {groep.titel}
              </h3>
              <span aria-hidden className="text-sm italic text-[var(--module-active-700)]" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
                {ROMEINS[i]}
              </span>
            </div>
            <ProfielBody profiel={profiel} velden={groep.velden} zet={zet} gewijzigd={gewijzigd} herkomst={herkomst} />
          </section>
        ))}

        <section aria-labelledby="nieuwsprofiel-tijdlijn" className="border-t border-[var(--border-ed)] pt-6">
          <h3 id="nieuwsprofiel-tijdlijn" className="text-[17px] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
            Je tijdlijn
          </h3>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
            Een wijziging in je profiel geldt vanaf je volgende verversing. Wat al in je tijdlijn staat, blijft staan zoals
            het toen was. Wil je niet wachten, vernieuw dan nu; dat kan eens per tien minuten.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void vernieuwen()}
              disabled={bezig !== null || aantalGewijzigd > 0}
              className="min-h-11 border border-[var(--ink)] bg-[var(--paper)] px-5 py-2.5 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {bezig === 'vernieuwen' ? 'Vernieuwen…' : 'Nu vernieuwen'}
            </button>
            {aantalGewijzigd > 0 && <span className="text-[13px] italic text-[var(--ink-3)]">Sla eerst je wijzigingen op.</span>}
          </div>
          <p aria-live="polite" className={`mt-2 min-h-5 text-[13px] ${vernieuwMelding?.soort === 'fout' ? 'text-negative' : 'text-[var(--ink-2)]'}`}>
            {vernieuwMelding?.tekst ?? ''}
          </p>
        </section>
      </div>

      {/* Sticky opslaanbalk: ook bij een lang formulier altijd bereikbaar. De
          bodem houdt ruimte voor de zwevende nav-pill (--mobile-nav-clearance,
          pagina-content — geen overlay). */}
      <div className="sticky bottom-0 z-10 mt-8 border-t border-[var(--border-ed)] bg-[var(--bg)] pt-3 pb-[calc(0.75rem_+_var(--mobile-nav-clearance,0px))]">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void opslaan()}
            disabled={bezig !== null || aantalGewijzigd === 0}
            className="min-h-11 bg-[var(--ink)] px-6 py-2.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {bezig === 'opslaan' ? 'Opslaan…' : 'Opslaan'}
          </button>
          <p aria-live="polite" className={`text-[13px] ${opslagMelding?.soort === 'fout' ? 'text-negative' : 'text-[var(--ink-2)]'}`}>
            {/* Een nieuwe wijziging na het opslaan gaat vóór de melding "Opgeslagen" (eindreview 0.92.28). */}
            {opslagMelding?.soort === 'fout'
              ? opslagMelding.tekst
              : aantalGewijzigd > 0
                ? `${aantalGewijzigd} ${aantalGewijzigd === 1 ? 'wijziging' : 'wijzigingen'} nog niet opgeslagen`
                : (opslagMelding?.tekst ?? '')}
          </p>
        </div>
      </div>
    </div>
  )
}
