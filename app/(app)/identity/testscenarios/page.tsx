'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Target, PiggyBank, TrendingUp, Wallet, Sparkles, ArrowRight, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SectionDivider } from '@/components/app/section-divider'

// ── Scenario data ────────────────────────────────────────────────────────────

interface Scenario {
  title: string
  description: string
  insight: string
  href: string
}

interface ScenarioGroup {
  title: string
  persona: string
  subtitle: string
  icon: LucideIcon
  accentClass: string
  accentBgClass: string
  borderClass: string
  barClass: string
  scenarios: Scenario[]
}

const GROUPS: ScenarioGroup[] = [
  {
    title: 'De pensioenplanner',
    persona: 'Ronald Hoekstra',
    subtitle: 'AOW-leeftijd, pensioengat, onttrekkingsstrategie',
    icon: Target,
    accentClass: 'text-horizon-600',
    accentBgClass: 'bg-horizon-500/10',
    borderClass: 'border-l-horizon-500',
    barClass: 'bg-horizon-500',
    scenarios: [
      {
        title: 'Bekijk je AOW-leeftijd en pensioengat',
        description: 'Ga naar De Horizon en bekijk je pensioenprognose. Vergelijk je verwachte AOW-leeftijd met je gewenste stopmoment.',
        insight: 'Hoeveel jaar zit er tussen stoppen met werken en je AOW-datum?',
        href: '/horizon',
      },
      {
        title: 'Haal je eigen huis uit je nettovermogen',
        description: 'Ga naar De Kern \u2192 Bezittingen en markeer je eigen woning als niet-liquide. Bekijk hoe je nettovermogen er zonder steen uitziet.',
        insight: 'Hoeveel belegbaar vermogen heb je als je je huis en hypotheek weglaat?',
        href: '/core',
      },
      {
        title: 'Stel je onttrekkingsstrategie in',
        description: 'Ga naar Instellingen \u2192 FIRE en kies tussen guardrails, vast percentage of kapitaalbehoud.',
        insight: 'Welke strategie past bij jouw pensioeninkomen?',
        href: '/identity/instellingen',
      },
      {
        title: 'Analyseer je passief inkomen',
        description: 'Bekijk het passief inkomen widget op je dashboard. Klik op het bedrag voor de kassabon.',
        insight: 'Hoeveel dividend, rente en pensioen ontvang je per maand?',
        href: '/dashboard',
      },
      {
        title: 'Plan een grote uitgave na pensioen',
        description: 'Ga naar De Horizon en voeg een levensgebeurtenis toe (bijv. campertrip of verbouwing). Bekijk het effect op je vermogenspad.',
        insight: 'Kun je die droomreis betalen zonder je pensioeninkomen aan te tasten?',
        href: '/horizon',
      },
    ],
  },
  {
    title: 'De vermogensverdeler',
    persona: 'Bas Mulder',
    subtitle: 'Overzicht bezittingen, schulden, allocatie',
    icon: PiggyBank,
    accentClass: 'text-kern-600',
    accentBgClass: 'bg-kern-500/10',
    borderClass: 'border-l-kern-500',
    barClass: 'bg-kern-500',
    scenarios: [
      {
        title: 'Bekijk je nettovermogen',
        description: 'Ga naar De Kern en bekijk je totale vermogen. Klik op het bedrag voor de uitsplitsing.',
        insight: 'Hoeveel bezit je minus je schulden?',
        href: '/core',
      },
      {
        title: 'Controleer je vermogensallocatie',
        description: 'Bekijk je holdings en de verdeling over asset classes (aandelen, obligaties, cash).',
        insight: 'Is je portefeuille in balans met je risicoprofiel?',
        href: '/core',
      },
      {
        title: 'Bereken je Box 3 belasting',
        description: 'Bekijk het Box 3 widget op je dashboard. Klik voor de volledige berekening.',
        insight: 'Hoeveel belasting betaal je over je vermogen dit jaar?',
        href: '/dashboard',
      },
      {
        title: 'Voeg een belegging toe',
        description: 'Ga naar bezittingen en voeg een nieuw fonds of ETF toe met koers en aantal stuks.',
        insight: 'Hoe verandert je nettovermogen en allocatie?',
        href: '/core',
      },
      {
        title: 'Vergelijk hypotheek vs. beleggen',
        description: 'Bekijk je hypotheek naast je beleggingen. Bereken het rendementsverschil.',
        insight: 'Loont het om extra af te lossen of juist te beleggen?',
        href: '/dashboard',
      },
    ],
  },
  {
    title: 'De budgetteerder',
    persona: 'Leo Pietersen',
    subtitle: 'Grip op uitgaven, patronen, abonnementen',
    icon: Wallet,
    accentClass: 'text-wil-600',
    accentBgClass: 'bg-wil-500/10',
    borderClass: 'border-l-wil-500',
    barClass: 'bg-wil-500',
    scenarios: [
      {
        title: 'Bekijk je budgetoverzicht',
        description: 'Ga naar De Kern en bekijk je budgetten. Klik op een categorie voor de transacties.',
        insight: 'In welke categorie geef je het meest uit?',
        href: '/core',
      },
      {
        title: 'Ontdek je abonnementen',
        description: 'Ga naar De Wil en bekijk je terugkerende uitgaven. Elk abonnement toont de vrijheidstijd-impact.',
        insight: 'Welke abonnementen kosten je de meeste vrijheidstijd?',
        href: '/will',
      },
      {
        title: 'Vraag AI-aanbevelingen op',
        description: 'Ga naar De Wil \u2192 Inzicht en klik op \u201cAnalyseren\u201d. Will analyseert je profiel.',
        insight: 'Welke concrete besparingen stelt Will voor?',
        href: '/will',
      },
      {
        title: 'Maak een actie aan',
        description: 'Ga naar De Wil \u2192 Acties en maak een handmatige actie aan (bijv. \u201cGym opzeggen\u201d). Plan hem in voor deze week.',
        insight: 'Hoeveel vrijheidsdagen levert deze actie op?',
        href: '/will',
      },
      {
        title: 'Doe een maandelijkse check-in',
        description: 'Ga naar De Kern en klik op de check-in kaart. Reflecteer op je uitgaven van afgelopen maand.',
        insight: 'Zijn je uitgaven verbeterd ten opzichte van vorige maand?',
        href: '/core',
      },
    ],
  },
  {
    title: 'De FIRE-strijder',
    persona: 'Jochen Brouwer',
    subtitle: 'Spaarquote, rendement, FIRE-datum',
    icon: TrendingUp,
    accentClass: 'text-horizon-600',
    accentBgClass: 'bg-horizon-500/10',
    borderClass: 'border-l-horizon-500',
    barClass: 'bg-horizon-500',
    scenarios: [
      {
        title: 'Bereken je spaarquote',
        description: 'Ga naar De Kern en vergelijk je inkomen met je uitgaven.',
        insight: 'Wat is je maandelijkse spaarquote in procenten?',
        href: '/core',
      },
      {
        title: 'Draai een Monte Carlo simulatie',
        description: 'Ga naar De Horizon en bekijk de backtesting score. Deze simuleert duizenden scenario\u2019s.',
        insight: 'Hoe groot is de kans dat je vermogen toereikend is?',
        href: '/horizon',
      },
      {
        title: 'Optimaliseer je fondskosten',
        description: 'Bekijk de TER (Total Expense Ratio) van je fondsen in je holdings overzicht.',
        insight: 'Welk fonds is het duurst en hoeveel scheelt overstappen?',
        href: '/core',
      },
      {
        title: 'Stel je FIRE-parameters in',
        description: 'Ga naar Instellingen \u2192 FIRE en pas je verwacht rendement en inflatie aan.',
        insight: 'Hoe verandert je FIRE-datum bij andere aannames?',
        href: '/identity/instellingen',
      },
      {
        title: 'Plan je Coast FIRE',
        description: 'Bekijk de vrijheidsmijlpalen widget. Coast FIRE is het punt waarop je kunt stoppen met inleggen.',
        insight: 'Bij welk vermogen hoef je niet meer bij te leggen?',
        href: '/dashboard',
      },
    ],
  },
]

const GENERAL_SCENARIOS: Scenario[] = [
  {
    title: 'Lees de TriFinity Post',
    description: 'Ga naar Berichten en lees het laatste financi\u00eble nieuws. Kies een artikel dat je raakt en bespreek het met Will via de chat.',
    insight: 'Wat betekent dit nieuws voor jouw financi\u00eble situatie?',
    href: '/berichten',
  },
  {
    title: 'Pas je dashboard aan',
    description: 'Ga naar Instellingen \u2192 Widgets en voeg een widget toe of verwijder er een. Experimenteer met formaten.',
    insight: 'Welke widgets zijn het meest nuttig voor jouw situatie?',
    href: '/identity/instellingen',
  },
  {
    title: 'Bekijk je vrijheidstijd',
    description: 'Hoeveel dagen financi\u00eble vrijheid vertegenwoordigt je vermogen? Bekijk het hero-getal op je dashboard.',
    insight: 'Als je morgen stopt met werken, hoelang kun je leven van je vermogen?',
    href: '/dashboard',
  },
  {
    title: 'Genereer een rapportage',
    description: 'Ga naar Rapportages en maak een maandoverzicht aan. De AI analyseert je financi\u00eble data.',
    insight: 'Welke trends en inzichten vallen op in je rapportage?',
    href: '/rapportages',
  },
  {
    title: 'Ontdek de gids',
    description: 'Ga naar Identiteit \u2192 Gids en lees de uitleg van een module die je nog niet kent. Probeer de interactieve conceptkaarten.',
    insight: 'Welk concept was nieuw voor je?',
    href: '/identity/gids',
  },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TestScenariosPage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* ── Masthead ── */}
      <header className="mb-10 border-b border-[var(--border-ed)] pb-6">
        <p className="label-editorial text-[var(--ink-3)]">Testscenario&rsquo;s</p>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-[var(--ink)] sm:text-4xl">
          Ontdek TriFinity
        </h1>
        <p className="mt-3 max-w-xl font-serif text-base leading-relaxed text-[var(--ink-3)]">
          Concrete opdrachten om de app te verkennen. Elke opdracht leidt naar een
          functie die een inzicht oplevert of invloed heeft op je financi&euml;le plaatje.
          Kies de groep die bij je past, of begin met de algemene opdrachten onderaan.
        </p>
        <div className="mt-5 flex items-center gap-6 text-xs text-[var(--ink-4)]">
          <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">4</span> gebruikersgroepen</span>
          <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">25</span> opdrachten</span>
          <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">5</span> modules</span>
        </div>
      </header>

      {/* ── Persona groups ── */}
      {GROUPS.map((group, gi) => (
        <div key={group.title}>
          {gi > 0 && <SectionDivider variant="asterisk" />}
          <ScenarioSection group={group} />
        </div>
      ))}

      <SectionDivider variant="asterisk" />

      {/* ── General scenarios ── */}
      <GeneralSection />
    </div>
  )
}

// ── Components ───────────────────────────────────────────────────────────────

function ScenarioSection({ group, defaultOpen = false }: { group: ScenarioGroup; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="mb-2">
      {/* Clickable section header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className={`mb-3 h-1 w-10 ${group.barClass}`} />
          <p className={`font-sans text-[10px] font-bold uppercase tracking-[0.12em] ${group.accentClass}`}>
            {group.persona}
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[var(--ink)]">
            {group.title}
          </h2>
          <p className="mt-1 font-serif text-sm text-[var(--ink-3)]">
            {group.subtitle}
          </p>
        </div>
        <ChevronDown className={`mt-6 h-5 w-5 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`} />
      </button>

      {/* Collapsible scenario cards */}
      {open && (
        <div className="space-y-3">
          {group.scenarios.map((scenario, i) => (
            <ScenarioCard
              key={scenario.title}
              index={i + 1}
              scenario={scenario}
              borderClass={group.borderClass}
              staggerIndex={i}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function GeneralSection() {
  const [open, setOpen] = useState(false)
  return (
    <section className="mb-8">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-3 h-1 w-10 bg-[var(--border-md)]" />
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Alle groepen
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[var(--ink)]">
            Algemene opdrachten
          </h2>
          <p className="mt-1 font-serif text-sm text-[var(--ink-3)]">
            Voor elke gebruiker &mdash; ongeacht je financi&euml;le situatie.
          </p>
        </div>
        <ChevronDown className={`mt-6 h-5 w-5 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="space-y-3">
          {GENERAL_SCENARIOS.map((scenario, i) => (
            <ScenarioCard
              key={scenario.title}
              index={i + 1}
              scenario={scenario}
              borderClass="border-l-[var(--border-md)]"
              staggerIndex={i}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ScenarioCard({
  index,
  scenario,
  borderClass,
  staggerIndex,
}: {
  index: number
  scenario: Scenario
  borderClass: string
  staggerIndex: number
}) {
  return (
    <Link
      href={scenario.href}
      className={`group block border border-[var(--border-ed)] border-l-4 ${borderClass} bg-[var(--paper)] px-5 py-4 transition-all duration-150 hover:border-[var(--border-md)] hover:-translate-y-px hover:shadow-[var(--s1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wil-500 focus-visible:ring-offset-2 animate-fade-up`}
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
    >
      <div className="flex items-start gap-4">
        {/* Number */}
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--border-ed)] font-mono text-xs font-bold tabular-nums text-[var(--ink-3)]">
          {index}
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              {scenario.title}
            </h3>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--ink-3)]" />
          </div>
          <p className="mt-1 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
            {scenario.description}
          </p>
          <p className="mt-2 border-t border-dotted border-[var(--border-ed)] pt-2 font-serif text-xs italic text-[var(--ink-2)]">
            {scenario.insight}
          </p>
        </div>
      </div>
    </Link>
  )
}
