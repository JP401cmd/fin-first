'use client'

import { Clock } from 'lucide-react'
import {
  formatCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import type { Box1Result } from '@/lib/box1-tax'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { Kicker } from '@/components/editorial'

/**
 * Box1Waterfall — bruto → netto besteedbaar als verspringende balk-weergave.
 *
 * Filosofie: laat zien hoe je bruto-inkomen door de heffing zakt en door de
 * heffingskortingen weer een stukje terugkomt — een visuele "watervalk" van
 * vrijheid (loon) → afroming (heffing) → teruggave (kortingen) → wat je
 * écht overhoudt (netto besteedbaar).
 *
 * Stappen (uit computeBox1Tax):
 *   bruto inkomen
 *     − heffing vóór kortingen   (de schijven-druk)
 *     + heffingskortingen        (algemeen + arbeid + IACK)
 *     = netto besteedbaar
 *
 * Vormgeving: editorial — papier + ink-hiërarchie, scherpe hoeken, Playfair
 * bedragen, mono labels. Balken groeien in via `useInViewAnimation` (entree-
 * reveal, respecteert prefers-reduced-motion). De box-accentkleur komt uit de
 * route-layout via `var(--module-active-*)`; semantische waarden (heffing,
 * kortingen) blijven semantisch.
 */

interface WaterfallStap {
  label: string
  /** Bedrag van deze stap (positief = optellen, negatief = aftrekken). */
  delta: number
  /** Cumulatieve waarde ná deze stap (voor de balk-hoogte). */
  cumulatief: number
  /** Type bepaalt de kleur: basis (loon), aftrek (heffing), bijtelling
   *  (kortingen) of totaal (netto besteedbaar). */
  kind: 'basis' | 'aftrek' | 'bijtelling' | 'totaal'
}

export function Box1Waterfall({
  result,
  dailyExpenses = 0,
}: {
  result: Box1Result
  /** Dagelijkse uitgaven voor de vrijheidstijd-vertaling van het netto; 0 → geen regel. */
  dailyExpenses?: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  const bruto = result.grossYearlyIncome
  const heffing = result.heffingVoorKortingen
  const kortingen = result.totaleHeffingskortingen
  const netto = result.nettoBesteedbaar

  // Verspringende stappen: elke balk start waar de vorige eindigde.
  const stappen: WaterfallStap[] = [
    { label: 'Bruto inkomen', delta: bruto, cumulatief: bruto, kind: 'basis' },
    {
      label: 'Heffing (schijven)',
      delta: -heffing,
      cumulatief: bruto - heffing,
      kind: 'aftrek',
    },
    {
      label: 'Heffingskortingen',
      delta: kortingen,
      cumulatief: bruto - heffing + kortingen,
      kind: 'bijtelling',
    },
    { label: 'Netto besteedbaar', delta: netto, cumulatief: netto, kind: 'totaal' },
  ]

  // Gedeelde schaal = bruto-inkomen (de grootste waarde).
  const maxValue = Math.max(bruto, 1)

  const freedom =
    dailyExpenses > 0
      ? formatFreedomTimeString(calculateFreedomTime(netto, dailyExpenses))
      : null

  return (
    <div ref={ref} className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Bruto → netto besteedbaar</Kicker>
      <p
        className="mt-2 mb-5 text-sm italic text-[var(--ink-2)] leading-snug max-w-[52ch]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Hoe je inkomen door de heffing zakt en door de heffingskortingen weer
        een stukje terugkomt.
      </p>

      <div className="flex flex-col gap-3.5">
        {stappen.map((stap, i) => {
          const isTotaal = stap.kind === 'totaal'
          // Voor de aftrek/bijtelling tonen we de delta-grootte als balk;
          // voor basis/totaal de cumulatieve waarde.
          const barValue =
            stap.kind === 'aftrek' || stap.kind === 'bijtelling'
              ? Math.abs(stap.delta)
              : stap.cumulatief
          const pct = Math.min(Math.max((barValue / maxValue) * 100, 0), 100)
          // Linker-offset zodat de balk "verspringt" vanaf het vorige niveau.
          const offsetPct =
            stap.kind === 'aftrek'
              ? Math.min(Math.max((stap.cumulatief / maxValue) * 100, 0), 100)
              : stap.kind === 'bijtelling'
                ? Math.min(
                    Math.max(((stap.cumulatief - stap.delta) / maxValue) * 100, 0),
                    100,
                  )
                : 0

          const barColor =
            stap.kind === 'aftrek'
              ? 'var(--negative)' // wat de schatkist afroomt (kost)
              : stap.kind === 'bijtelling'
                ? 'var(--positive)' // wat je terugkrijgt (voordeel)
                : 'var(--module-active-500)' // box-accent: loon en netto

          return (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`text-[11px] uppercase tracking-[0.08em] font-mono ${
                    isTotaal ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-3)]'
                  }`}
                >
                  {stap.label}
                </span>
                <span
                  className={`tabular-nums tracking-[-0.01em] ${
                    isTotaal
                      ? 'text-[18px] font-black text-[var(--ink)]'
                      : 'text-[14px] font-bold text-[var(--ink-2)]'
                  }`}
                  style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                >
                  {stap.delta < 0 ? '−' : ''}
                  {formatCurrency(Math.abs(stap.delta))}
                </span>
              </div>
              <div
                className={`relative h-3.5 w-full overflow-hidden ${
                  isTotaal ? 'bg-[var(--subtle)] ring-1 ring-[var(--ink)]' : 'bg-[var(--subtle)]'
                }`}
              >
                <div
                  className="absolute top-0 h-full"
                  style={{
                    left: `${offsetPct}%`,
                    width: hasEntered ? `${pct}%` : '0%',
                    backgroundColor: barColor,
                    opacity: isTotaal ? 1 : 0.85,
                    transition: 'width 600ms cubic-bezier(.22,1,.36,1)',
                    transitionDelay: `${i * 90}ms`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {freedom && (
        <div className="mt-5 flex items-center gap-1.5 border-t border-[var(--border-ed)] pt-3 text-sm text-[var(--ink-2)]">
          <Clock className="h-4 w-4 shrink-0" style={{ color: 'var(--module-active-700)' }} aria-hidden="true" />
          Je netto besteedbare inkomen is ≈{' '}
          <span className="font-medium text-[var(--ink)]">{freedom}</span> aan vrijheid per jaar.
        </div>
      )}

      <p
        className="mt-3 text-[12px] italic text-[var(--ink-3)] leading-snug"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Indicatie, geen advies — o.b.v. de schijven en heffingskortingen {result.year}.
      </p>
    </div>
  )
}
