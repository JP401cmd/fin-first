/**
 * OnboardingSuccess — het scherm ná de opslag en ná de afrondingsstappen
 * budget/bank (ADR 0156). Laatste halte vóór het homescherm en de rondleiding.
 *
 * ══ Wat hier staat en waarom (W-015, 19 sep 2026) ═════════════════════════
 *
 * Tot deze datum vertelde dit scherm dat "TriFinity uit twee modules bestaat",
 * met twee feature-kaarten die een kopie waren van een landingssectie uit juni.
 * Twee problemen: die indeling bestáát niet meer (het menu is sinds 15 sep plat
 * — Home, vier hefbomen, De toekomst; `lib/nav-config.ts`), en de featurelijst
 * was al van de landing weggedreven. Een nieuwe gebruiker kreeg dus een kaart
 * van een gebouw dat één klik later anders blijkt te zijn.
 *
 * Nu staan hier de vier WAARDES uit `lib/onboarding/waardes.ts` — dezelfde vier
 * die tot 19 sep in de welkomstpopup vóór stap 1 stonden. Ze zijn verhuisd naar
 * dít moment omdat ze hier iets anders doen: vóór de onboarding zijn het
 * beloftes zonder referentie, erna heeft de gebruiker ze net zelf gevuld
 * (bezittingen/schulden/pensioen, inkomen/uitgaven, stop-anker, Fin) en de vier
 * accenten per stapgroep ervaren (`STEP_ACCENT`). De winst is herkenning, en de
 * brug naar de rondleiding op /overzicht, die dezelfde indeling mét eigen
 * cijfers laat zien (ADR 0130).
 *
 * **Eigen cijfers (B-065, eigenaarsbesluit 27 sep 2026).** Het scherm zet
 * verwachtingen: wat de app nu voor je doet, met je eigen startpunt erbij. De
 * twee tijdgetallen komen uit dezelfde canonieke helpers als het klaar-scherm
 * en de meelopende teller (`computeFreedomTicker` / `computeMonthlyFreedomBuildup`
 * in `lib/freedom-ticker.ts`), berekend door de orchestrator — hier wordt niets
 * opgeteld of gedeeld. De /overzicht-bundel (`DashboardData`) bestaat op dit
 * moment nog niet: dit scherm leeft in de (onboarding)-groep, vóór de eerste
 * app-load. Op het bank-herlaadpad zijn de sessie-antwoorden weg; beide props
 * zijn dan `null` en het blok valt terug op één beschrijvende zin.
 *
 * **Geen `colorVars`-prop**, anders dan bij de popup: dit scherm portalt niet
 * maar staat in de page-wrapper met `stepTintStyle`, dus `var(--color-kern-500)`
 * en de rest lossen vanzelf op naar de accenten van déze gebruiker.
 */

import { FinDots } from '@/components/app/fin-dots'
import { Button } from '@/components/editorial'
import { WAARDES } from '@/lib/onboarding/waardes'
import type { MonthlyFreedomBuildup } from '@/lib/freedom-ticker'

export interface OnboardingSuccessProps {
  onDashboard: () => void
  /**
   * Korte vrijheidstijd van wat je nu hebt ("1j 3m 16d") uit
   * `computeFreedomTicker`. `null` = niets eerlijks te tonen (geen vermogen,
   * geen inkomen/uitgaven, een tekort, of de sessie-antwoorden zijn weg).
   */
  freedomLabel?: string | null
  /** Vrijheid die er per maand bijkomt (`computeMonthlyFreedomBuildup`); `null` bij tekort of onbekend. */
  monthlyBuildup?: MonthlyFreedomBuildup | null
}

export function OnboardingSuccess({
  onDashboard,
  freedomLabel = null,
  monthlyBuildup = null,
}: OnboardingSuccessProps) {
  const heeftCijfers = Boolean(freedomLabel) || monthlyBuildup !== null
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center py-8 text-center sm:py-12">
      {/* Fin's avatar — celebration emphasis with subtle pulse */}
      <div className="mb-6 animate-[pulse_3s_ease-in-out_1]">
        <FinDots size={140} />
      </div>

      {/* Celebration heading — font-display */}
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-3xl">
        Welkom bij TriFinity!
      </h1>

      {/* Philosophical closing — font-serif italic */}
      <p className="mt-3 max-w-sm font-serif text-base italic leading-relaxed text-[var(--ink-2)] sm:text-lg">
        &ldquo;Geld levert tijd op &mdash; en jouw reis naar vrijheid begint nu.&rdquo;
      </p>

      {/* Editorial divider */}
      <div className="mx-auto mt-8 mb-8 h-px w-16 bg-[var(--border-md)]" />

      {/* Vandaag op orde, morgen in beeld — vandaag = wat je hebt + wat er
          omgaat, morgen = waar het op uitloopt + waar je op kunt sturen. De
          kop overspant dus precies de vier waardes hieronder. */}
      <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">
        Vandaag op orde, <em className="italic text-kern-600">morgen in beeld</em>
      </h2>
      <p className="mx-auto mt-3 max-w-md font-serif text-sm leading-relaxed text-[var(--ink-2)] sm:text-base">
        Dit houdt TriFinity vanaf nu voor je bij. Vul je later iets aan of verandert er iets, dan
        rekent de app meteen mee.
      </p>

      {/* B-065: je eigen startpunt — uitsluitend canonieke uitkomsten, geen
          eigen som. Zonder cijfers één beschrijvende terugvalzin. */}
      <div
        className="mx-auto mt-6 w-full max-w-md border-y border-[var(--border-ed)] px-4 py-4 text-left"
        data-testid="success-startpunt"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)]">Jouw startpunt</p>
        {heeftCijfers ? (
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--ink-2)]">
            {freedomLabel && (
              <li>
                Wat je nu hebt, staat voor{' '}
                <span className="font-mono font-semibold tabular-nums text-[var(--ink)]">{freedomLabel}</span>{' '}
                vrijheid.
              </li>
            )}
            {monthlyBuildup && (
              <li>
                Wat je nu per maand overhoudt, levert elke maand{' '}
                <span className="font-mono font-semibold tabular-nums text-[var(--ink)]">
                  {monthlyBuildup.daysPerMonth} {monthlyBuildup.daysPerMonth === 1 ? 'dag' : 'dagen'}
                </span>{' '}
                vrijheid op.
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
            Je eigen cijfers staan op je overzicht, ook in tijd: hoe lang je uitgaven gedekt zijn.
          </p>
        )}
      </div>

      {/* De vier waardes — elk met de kicker-streep in zijn eigen accent
          (editorial patroon-kaart *Kicker-streep*), identiek aan hoe ze in de
          welkomstpopup stonden. 2×2 op desktop, één kolom op mobiel;
          `text-left` omdat de container gecentreerd is en lopende tekst links
          hoort uit te lijnen. */}
      <ul className="mt-8 grid w-full grid-cols-1 gap-x-8 gap-y-6 text-left sm:grid-cols-2">
        {WAARDES.map((waarde) => (
          <li key={waarde.kicker} className="flex gap-3">
            <span
              aria-hidden
              className="mt-[9px] h-px w-5 shrink-0"
              style={{ background: `var(--color-${waarde.accent}-500)` }}
            />
            <div className="min-w-0">
              <p
                className="font-mono text-[10px] uppercase tracking-[0.20em]"
                style={{ color: `var(--color-${waarde.accent}-700)` }}
              >
                {waarde.kicker}
              </p>
              <p className="mt-1 font-serif text-[15px] leading-snug text-[var(--ink)]">{waarde.zin}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Fin's closing — font-serif italic */}
      <div className="mx-auto mt-10 max-w-md border-y border-[var(--border-ed)] px-4 py-4">
        <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
          Alles wat je net invulde, staat nu op zijn plek. Wat je vandaag niet uitgeeft, levert tijd
          op — en dat zie je voortaan terug.
        </p>
      </div>

      {/* APP-2 (eenvoudige-weergave-audit) — de tweede plek waar de app zelf
          vertelt dát er een weergavekeuze is; de eerste is de welkomstgids op
          /overzicht. Juist hier, want een vers account start op 'simple' en
          weet anders niet dat er meer ís.

          Twee bewuste beperkingen:
          · GEEN modus-afhankelijke tekst. De `DisplayModeProvider` hangt alleen
            in `app/(app)/layout.tsx`; dit scherm leeft in de (onboarding)-groep
            en zou dus stilzwijgend op de 'simple'-fallback landen (ADR 0026).
            Deze zin klopt daarom in beide standen.
          · GEEN <Link>. De CTA hiernaast draait bewust `clearLocalStorage()` +
            een HARDE navigatie: een soft-navigation vlak na het schrijven van
            `onboarding_completed` kan door de onboarding-poort teruggekaatst
            worden, en zou de concept-staat laten staan. Een pad in tekst is
            hier veiliger dan een klikbare route. */}
      <p className="mx-auto mt-4 max-w-md font-sans text-xs leading-relaxed text-[var(--ink-3)]">
        Liever rustig beginnen of meteen alle details? Dat kies je bij{' '}
        <span className="font-semibold text-[var(--ink-2)]">Mijn &rarr; Weergave en uiterlijk</span>.
      </p>

      {/* Sierbalk — vier segmenten in de volgorde van de waardes hierboven,
          zodat de kleurtaal die de gebruiker in de stappen zag hier als
          geheel terugkomt. */}
      <div className="mt-8 flex w-full max-w-xs items-center gap-0" aria-hidden="true">
        {WAARDES.map((waarde) => (
          <div
            key={waarde.accent}
            className="h-0.5 flex-1"
            style={{ background: `var(--color-${waarde.accent}-300)` }}
          />
        ))}
      </div>

      {/* CTA — naar het eigen homescherm (ADR 0130).
          `onDashboard` navigeert HARD naar /dashboard; de middleware vertaalt dat
          naar `profiles.home_screen` (standaard /overzicht), waar de rondleiding
          klaarstaat. Bewust geen vaste route in de tekst: wie zijn homescherm
          heeft omgezet, komt op zíjn scherm uit en niet op het onze. */}
      <Button
        variant="moment"
        onClick={onDashboard}
        className="mt-6 w-full max-w-xs sm:w-auto sm:min-w-[200px]"
      >
        Naar je overzicht
      </Button>
    </div>
  )
}
