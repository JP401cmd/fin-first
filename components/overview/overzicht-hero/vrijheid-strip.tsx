'use client'

import Link from 'next/link'
import { Compass, Sparkles } from 'lucide-react'
import { ProgressMilestones } from '@/components/editorial/progress-milestones'
import type { FreedomFraming } from '@/lib/fire-strategy'

/**
 * Vrijheid-strip: % op weg naar financiële vrijheid → klik naar /toekomst.
 *
 * Varianten:
 *  - Lege staat (freedomPct === null): dashed CTA naar /mijn/profiel met
 *    Compass-icoon. Triggert wanneer DOB / inkomen / bestedingen ontbreken.
 *  - 'building' (default): gradient horizon bg + percentage + progress-bar,
 *    optioneel met "Nog X jaar"-aftelling — "% op weg naar vrijheid".
 *  - 'free' / 'pensioen': de gebruiker IS al vrij / met pensioen. Geen "% op
 *    weg" meer (dat is niet meer relevant): de kop schakelt naar een
 *    onttrekkings-framing ("Je bent vrij" / "Je bent met pensioen"), trouw aan
 *    "Geld is opgeslagen tijd". De `framing` wordt afgeleid door de gedeelde,
 *    consume-only vlag (`resolveFreedomFraming`) op de pagina en hier alleen
 *    weergegeven — geen herberekening in de component.
 *
 * Kleur: dit blok hoort bij de Toekomst-module (link naar /toekomst), dus
 * module-identiteit via `horizon-*` (gebruikersinstelbaar accent), nooit
 * hardcoded Tailwind-kleuren — zie CLAUDE.md "Kleurconventie".
 */
function formatCountdown(years: number, months: number): string {
  const yPart = years > 0 ? `${years} jaar` : ''
  const mPart = months > 0 ? `${months} maand${months === 1 ? '' : 'en'}` : ''
  if (!yPart && !mPart) return '<1 maand'
  if (yPart && mPart) return `${yPart} ${mPart}`
  return yPart || mPart
}

export function VrijheidStrip({
  freedomPct,
  currentAge,
  fireAge,
  framing = 'building',
}: {
  freedomPct: number | null
  /** Huidige leeftijd (gerond). Voor aftelling — optioneel. */
  currentAge?: number | null
  /** Vrijheidsleeftijd (gerond). Voor aftelling — optioneel. */
  fireAge?: number | null
  /**
   * Afgeleide framing uit de gedeelde vlag (resolveFreedomFraming). Default
   * 'building' (% op weg). 'free'/'pensioen' tonen de onttrekkings-staat.
   */
  framing?: FreedomFraming
}) {
  if (freedomPct == null) {
    return (
      <Link
        href="/mijn/profiel"
        className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-4 sm:p-6 hover:border-horizon-300 hover:shadow-sm transition-all group"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-horizon-50 flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5 text-horizon-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Op weg naar vrijheid
            </div>
            <div className="mt-0.5 text-sm sm:text-base text-[var(--ink-2)]">
              Vul je geboortedatum, inkomen en gewenste vrijheidsbestedingen in om je vrijheidsmoment te zien.
            </div>
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-horizon-700 group-hover:underline">
          Vul profiel aan →
        </span>
      </Link>
    )
  }

  // Reeds vrij / met pensioen: "% op weg" is niet meer relevant. Toon de
  // onttrekkings-framing in plaats van de voortgangsbalk. Filosofie blijft:
  // het opgebouwde vermogen is opgeslagen tijd die nu voor je werkt.
  if (framing === 'free' || framing === 'pensioen') {
    const isPensioen = framing === 'pensioen'
    const kicker = isPensioen ? 'Met pensioen' : 'Financieel vrij'
    const heading = isPensioen ? 'Je bent met pensioen.' : 'Je bent vrij.'
    const body = isPensioen
      ? 'Je hoeft niet meer te werken voor geld. Dit beeld toont je onttrekking tot het einde van je leven — niet meer je opbouw.'
      : 'Je hoeft niet meer te werken voor geld. Je vermogen — opgeslagen tijd — werkt nu voor jou; dit beeld toont je onttrekking, niet meer je opbouw.'

    return (
      <Link
        href="/toekomst"
        className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-ed)] bg-gradient-to-r from-horizon-50 to-stone-50 p-3 sm:p-4 hover:border-horizon-300 hover:shadow-sm transition-all group"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-horizon-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-horizon-700" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-horizon-700">
              {kicker}
            </div>
            <div className="mt-0.5 text-sm sm:text-base text-[var(--ink)]">
              <strong className="font-serif text-lg sm:text-xl text-horizon-700">
                {heading}
              </strong>{' '}
              {body}
            </div>
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-horizon-700 group-hover:underline">
          Bekijk →
        </span>
      </Link>
    )
  }

  // Aftelling-data: alleen tonen wanneer beide leeftijden bekend zijn en
  // fireAge > currentAge (anders is user al "vrij").
  const hasCountdown =
    currentAge != null &&
    fireAge != null &&
    fireAge > currentAge
  const yearsToFire = hasCountdown ? fireAge! - currentAge! : 0
  // Maanden-afronding: voor MVP gebruiken we hele jaren omdat we geen
  // exacte DOB-fractie hebben. Toekomstige iteratie: gebruik DOB voor
  // maand-precisie.
  const countdownText = hasCountdown
    ? formatCountdown(yearsToFire, 0)
    : null

  return (
    <Link
      href="/toekomst"
      className="mt-3 flex flex-col gap-2 rounded-2xl border border-[var(--border-ed)] bg-gradient-to-r from-horizon-50 to-stone-50 p-3 sm:p-4 hover:border-horizon-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-horizon-700">
            Op weg naar vrijheid
          </div>
          <div className="mt-0.5 text-sm sm:text-base text-[var(--ink)]">
            Je bent{' '}
            <strong className="font-serif text-lg sm:text-xl text-horizon-700">
              {Math.round(freedomPct)}%
            </strong>{' '}
            op weg naar het moment dat je niet meer hoeft te werken voor geld.
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {countdownText && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-horizon-700">
                Nog
              </div>
              <div className="font-serif text-sm sm:text-base font-semibold text-horizon-700 tabular-nums whitespace-nowrap">
                {countdownText}
              </div>
            </div>
          )}
          <span className="text-xs font-semibold text-horizon-700 group-hover:underline">
            Bekijk →
          </span>
        </div>
      </div>
      <div
        className="relative h-1.5 rounded-full bg-horizon-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(freedomPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Voortgang naar financiële vrijheid"
      >
        <div
          className="h-full bg-gradient-to-r from-horizon-500 to-horizon-700 transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, freedomPct))}%` }}
        />
        <ProgressMilestones />
      </div>
    </Link>
  )
}
