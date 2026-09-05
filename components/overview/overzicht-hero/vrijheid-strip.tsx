'use client'

import Link from 'next/link'
import { Compass, Hourglass, Sparkles } from 'lucide-react'
import { ProgressMilestones } from '@/components/editorial/progress-milestones'
import { useFlashChange } from '@/lib/hooks/use-flash-change'
import type { FreedomFraming } from '@/lib/fire-strategy'
import type { NuStoppenReach } from '@/lib/horizon/nu-stoppen-copy'
import {
  ankerReachYear,
  ankerTitel,
  ankerZin,
  formatStopAge,
  type AnkerReach,
  type AnkerStop,
} from '@/lib/horizon/anker-copy'
import { heroFireAgeYear } from '@/lib/horizon/hero-fire-age'
import {
  HORIZON_MISSENDE_GEGEVENS_HINTS,
  HORIZON_MISSENDE_GEGEVENS_LABEL,
} from '@/lib/horizon/outcome-guard'

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
  freeAsPensioen = false,
  dataIssue = false,
  nuStoppenReach = null,
  ankerReach = null,
  ankerStop = null,
  solvedFireAge = null,
  planEndAge = null,
}: {
  freedomPct: number | null
  /** Huidige leeftijd (gerond). Voor aftelling — optioneel. */
  currentAge?: number | null
  /** Vrijheidsleeftijd (gerond). Voor aftelling — optioneel. */
  fireAge?: number | null
  /**
   * Afgeleide framing uit de gedeelde vlag (resolveFreedomFraming). Default
   * 'building' (% op weg). 'free' toont de onttrekkings-staat; 'anchored' (ADR 0129:
   * vast anker, nog niet vrij) volgt in F3b — tot dan rendert het als 'building'.
   */
  framing?: FreedomFraming
  /**
   * ADR 0129 — onder 'free': "Je bent met pensioen" (op/voorbij de AOW) i.p.v. "Je
   * bent vrij". Consume-only, afgeleid met `isAtOrPastAow` op de pagina; het
   * vroegere framing-label 'pensioen' droeg dit onderscheid, nu een aparte vlag.
   */
  freeAsPensioen?: boolean
  /**
   * M6-vangrail (consume-only, uit `resolveFreedomAgeView`): de motor gaf een
   * vrijheidsleeftijd die niet kán kloppen. Dan geen percentage/aftelling maar
   * de gegevensmelding — een onmogelijke uitkomst is geen resultaat.
   */
  dataIssue?: boolean
  /**
   * ADR 0127 — eindstrategie 'Nu stoppen'. Gezet zodra die strategie actief is,
   * ONGEACHT de tijdsdekking: `framing` schakelt pas naar 'nu-stoppen' bij 100%
   * dekking, dus zonder deze prop zou de niet-gedekte substaat terugvallen op
   * "X% op weg naar het moment dat je niet meer hoeft te werken" — terwijl de
   * gebruiker per aanname al gestopt is. Consume-only: afgeleid uit de
   * stop-nu-runway van dezelfde request (`nuStoppenReachFromRunway`).
   */
  nuStoppenReach?: NuStoppenReach | null
  /**
   * ADR 0129 F3b — het bereik onder ÉLK vast anker (aow/now/age), uit de plan-runway
   * van hetzelfde request. Stuurt de anker-strip: gedekt "Plan gedekt tot je {eind}e ·
   * stopmoment {stop} · vrij mogelijk vanaf {vrij}" of tekort "Reikt tot je {reikt}e ·
   * stopmoment {stop} · plan loopt tot {eind}". `null` onder `solved`; `nuStoppenReach`
   * is de F3a-alias voor het nu-anker.
   */
  ankerReach?: AnkerReach | null
  /** Het stopmoment bij `ankerReach`; weggelaten ⇒ het nu-anker. */
  ankerStop?: AnkerStop | null
  /** "Vrij mogelijk vanaf" (D7, tweede run) — `null` = niet beschikbaar (dan valt dat deel weg). */
  solvedFireAge?: number | null
  /** Eindleeftijd van het plan (voor "plan loopt tot {eind}" wanneer het bereik hem niet draagt). */
  planEndAge?: number | null
}) {
  // Flash-puls op het hoofdpercentage bij waardeverandering (flash-up/flash-down,
  // respecteert prefers-reduced-motion). Hook vóór de early returns — rules-of-hooks.
  const { flashClass } = useFlashChange(freedomPct)
  // Anker-generiek: de oude nu-stoppen-prop is een alias van het bereik onder het nu-anker.
  const reach: AnkerReach | null = ankerReach ?? nuStoppenReach
  const stop: AnkerStop = ankerStop ?? { kind: 'now' }

  // M6: onmogelijke uitkomst → gegevensmelding i.p.v. een getal. Vóór de
  // freedomPct-tak: een percentage naast een onberekenbaar vrijheidsmoment leest
  // als een hard antwoord.
  if (dataIssue) {
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
              <strong className="font-semibold text-[var(--ink)]">
                {HORIZON_MISSENDE_GEGEVENS_LABEL}
              </strong>{' '}
              {HORIZON_MISSENDE_GEGEVENS_HINTS['buiten-horizon']}
            </div>
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-horizon-700 group-hover:underline">
          Vul profiel aan →
        </span>
      </Link>
    )
  }

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

  // Vast anker (ADR 0129 F3b — aow/now/age), nog niet 'free': het stopmoment ligt al
  // vast, dus "% op weg naar vrijheid" is hier geen vraag meer. De strip toont het
  // BEREIK in de drieslag uit de ADR-bijlage: gedekt "Plan gedekt tot je {eind}e ·
  // stopmoment {stop} · vrij mogelijk vanaf {vrij}" of tekort "Reikt tot je {reikt}e ·
  // stopmoment {stop} · plan loopt tot {eind}". Onder `now` valt "stopmoment" weg (het
  // is vandaag); zonder tweede run valt "vrij mogelijk vanaf" weg (D7). "Je bent vrij"
  // staat alleen bij framing 'free' (anker bereikt ∧ dekking ≥ 100, D8) — de tak
  // hieronder — en nooit omdat het geld toevallig twee jaar reikt.
  // Het nu-anker is de uitzondering op 'free' (ADR 0127 D6, gehandhaafd in 0129): bij
  // volledige dekking staat de D8-gate open, maar "Je bent vrij" is dan juist mis —
  // het plan ís al stoppen; de informatieve uitspraak blijft het bereik. Zelfde
  // uitzondering als `showFreeHero` op /toekomst.
  if (reach != null && reach.kind !== 'onbekend' && (framing !== 'free' || stop.kind === 'now')) {
    const gedekt = reach.kind === 'gedekt'
    const eind =
      reach.kind === 'gedekt' || reach.kind === 'reikt-tot' ? (reach.endAge ?? planEndAge) : planEndAge
    const reikt = ankerReachYear(reach)
    const delen: string[] = []
    if (gedekt) {
      delen.push(eind != null ? `Plan gedekt tot je ${heroFireAgeYear(eind)}e` : 'Plan gedekt tot het einde')
    } else if (reach.kind === 'reikt-tot' && reikt != null) {
      delen.push(`Reikt tot je ${reikt}e`)
    } else {
      delen.push('Vandaag al niet gedekt')
    }
    if (stop.kind !== 'now') delen.push(`stopmoment ${formatStopAge(stop.stopAge)}`)
    if (gedekt) {
      if (solvedFireAge != null && Number.isFinite(solvedFireAge)) {
        delen.push(`vrij mogelijk vanaf ${heroFireAgeYear(solvedFireAge)}`)
      }
    } else if (eind != null) {
      delen.push(`plan loopt tot ${heroFireAgeYear(eind)}`)
    }
    return (
      <Link
        href="/toekomst"
        data-testid="vrijheid-strip-anker"
        className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-ed)] bg-gradient-to-r from-horizon-50 to-stone-50 p-3 sm:p-4 hover:border-horizon-300 hover:shadow-sm transition-all group"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-horizon-100 flex items-center justify-center shrink-0">
            {gedekt ? (
              <Sparkles className="w-5 h-5 text-horizon-700" aria-hidden="true" />
            ) : (
              <Hourglass className="w-5 h-5 text-horizon-700" aria-hidden="true" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-horizon-700">
              {ankerTitel(stop)}
            </div>
            <div className="mt-0.5 text-sm sm:text-base text-[var(--ink)]">
              <strong className="font-semibold">{delen.join(' · ')}</strong>
            </div>
            <div className="mt-0.5 text-xs text-[var(--ink-2)]">{ankerZin(reach, stop)}</div>
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-horizon-700 group-hover:underline">
          Bekijk →
        </span>
      </Link>
    )
  }

  // Reeds vrij / met pensioen: "% op weg" is niet meer relevant. Toon de
  // onttrekkings-framing in plaats van de voortgangsbalk. Filosofie blijft:
  // het opgebouwde vermogen is opgeslagen tijd die nu voor je werkt.
  if (framing === 'free') {
    const isPensioen = freeAsPensioen
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
            <strong className={`font-serif text-lg sm:text-xl text-horizon-700 ${flashClass}`}>
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
