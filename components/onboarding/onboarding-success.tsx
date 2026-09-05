import { FinDots } from '@/components/app/fin-dots'
import { Wallet, Compass, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/editorial'

export function OnboardingSuccess({
  onDashboard,
}: {
  onDashboard: () => void
}) {
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
        &ldquo;Geld is opgeslagen tijd &mdash; en jouw reis naar vrijheid begint nu.&rdquo;
      </p>

      {/* Editorial divider */}
      <div className="mx-auto mt-8 mb-8 h-px w-16 bg-[var(--border-md)]" />

      {/* Twee modules — overzicht van vandaag + de toekomst */}
      <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">
        Vandaag op orde, <em className="italic text-kern-600">morgen in beeld</em>
      </h2>
      <p className="mx-auto mt-3 max-w-md font-serif text-sm leading-relaxed text-[var(--ink-2)] sm:text-base">
        TriFinity bestaat uit twee modules die naadloos op elkaar aansluiten. Samen geven ze inzicht in waar je nu staat én waar je naartoe gaat.
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <ModuleKaart
          kleur="var(--color-kern-600)"
          rubriek="Het Overzicht · Vandaag"
          titel="Wat heb ik, wat geef ik uit?"
          ondertitel="Alles wat je hebt en uitgeeft, in één rustig beeld."
          features={[
            'Bezittingen, schulden, cashflow en belasting',
            'Dagelijkse briefing met zes inzichten',
            'Doelen gekoppeld aan échte rekeningen',
            'Samen-modus voor wie financiën deelt',
          ]}
          bgClass="bg-kern-50"
          borderClass="border-kern-200"
          iconColor="text-kern-600"
          Icon={Wallet}
        />
        <ModuleKaart
          kleur="var(--color-horizon-600)"
          rubriek="De Toekomst · Morgen + later"
          titel="Wat brengt mijn vrijheid dichterbij?"
          ondertitel="Levensgebeurtenissen, scenario's en de Rekenhulp van Fin."
          features={[
            'Tijdas met levensgebeurtenissen (kinderen, verhuizing, pensioen)',
            'FIRE-prognose met scenario-vergelijking',
            'Rekenhulp-bibliotheek met 12 kant-en-klare rekenhulpen',
            'Vraag Fin een eigen rekenhulp op maat',
          ]}
          bgClass="bg-horizon-50"
          borderClass="border-horizon-200"
          iconColor="text-horizon-600"
          Icon={Compass}
        />
      </div>

      {/* Fin's closing — font-serif italic */}
      <div className="mx-auto mt-10 max-w-md border-y border-[var(--border-ed)] px-4 py-4">
        <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
          Veel ontdekkingen! Elke bewuste keuze brengt je dichter bij vrijheid.
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
        Rustig beginnen of meteen alle detail? Je weergave kies je later bij{' '}
        <span className="font-semibold text-[var(--ink-2)]">Mijn &rarr; Uiterlijk</span>.
      </p>

      {/* Decorative color bar — twee modules (Overzicht + Toekomst) */}
      <div className="mt-8 flex w-full max-w-xs items-center gap-0">
        <div className="h-0.5 flex-1 bg-kern-300" />
        <div className="h-0.5 flex-1 bg-horizon-300" />
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

/* ── Module-kaart — krantenrubriek-stijl (mirror van de landingspagina) ── */

function ModuleKaart({
  kleur,
  rubriek,
  titel,
  ondertitel,
  features,
  bgClass,
  borderClass,
  iconColor,
  Icon,
}: {
  kleur: string
  rubriek: string
  titel: string
  ondertitel: string
  features: string[]
  bgClass: string
  borderClass: string
  iconColor: string
  Icon: LucideIcon
}) {
  return (
    <div
      className={`overflow-hidden rounded-[var(--r-lg)] border ${borderClass} bg-[var(--paper)] text-left`}
    >
      {/* Kaart-header — krantenrubriek */}
      <div
        className={`flex items-center justify-between border-b-2 px-4 py-2.5 ${bgClass}`}
        style={{ borderBottomColor: kleur }}
      >
        <p
          className="font-sans text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: kleur }}
        >
          {rubriek}
        </p>
        <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
      </div>

      {/* Titel + ondertitel */}
      <div className="px-4 py-4">
        <h3 className="mb-1 font-display text-lg font-bold leading-tight text-[var(--ink)]">
          {titel}
        </h3>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">{ondertitel}</p>
      </div>

      {/* Features */}
      <div className="border-t border-dashed border-[var(--border-ed)] px-4 py-4">
        <ul className="space-y-2">
          {features.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 font-serif text-sm text-[var(--ink-2)]"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: kleur }}
              />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
