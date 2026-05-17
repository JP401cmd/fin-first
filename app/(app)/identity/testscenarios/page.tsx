'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Target, PiggyBank, TrendingUp, Wallet, Sparkles, ArrowRight, ChevronDown, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SectionDivider } from '@/components/app/section-divider'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

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
    title: 'De starter',
    persona: 'Daan Bakker',
    subtitle: 'Eerste budget, eerste belegging, eerste spaardoel',
    icon: Wallet,
    accentClass: 'text-wil-600',
    accentBgClass: 'bg-wil-500/10',
    borderClass: 'border-l-wil-500',
    barClass: 'bg-wil-500',
    scenarios: [
      {
        title: 'Pas je budgetplan aan',
        description: 'Ga naar De Kern \u2192 Budgetten en klik op een budget. Bewerk het limietbedrag, het type (vast/flex) of het interval.',
        insight: 'Past je budgetplan nog bij je huidige uitgavenpatroon?',
        href: '/core/budgets',
      },
      {
        title: 'Doe een maandelijkse check-in',
        description: 'Ga naar De Kern en klik op de check-in kaart. Reflecteer op je uitgaven van afgelopen maand en vergelijk met je budget.',
        insight: 'Zijn je uitgaven verbeterd ten opzichte van vorige maand?',
        href: '/core',
      },
      {
        title: 'Bekijk de 3 budget weergaves',
        description: 'Ga naar De Kern \u2192 Budgetten en wissel tussen de drie weergaves: Boom (overzicht), Donut (verdeling) en Heatmap (intensiteit).',
        insight: 'Welke weergave geeft jou het beste inzicht in je uitgaven?',
        href: '/core/budgets',
      },
      {
        title: 'Stel je eerste spaardoel in',
        description: 'Ga naar De Horizon en doorloop de FIRE-setup. Bij de spaardoel-stap kies je tussen een noodfonds, vermogen-overzicht of eerder-stoppen-doel.',
        insight: 'Welk doel motiveert jou het meest om vol te houden?',
        href: '/horizon',
      },
      {
        title: 'Voeg je eerste belegging toe',
        description: 'Ga naar De Kern \u2192 Bezittingen en voeg een fonds of ETF toe met koers en aantal stuks. Begin klein, bijvoorbeeld een indexfonds bij Meesman.',
        insight: 'Hoe verandert je nettovermogen wanneer je startkapitaal aan het werk zet?',
        href: '/core',
      },
      {
        title: 'Bekijk je TER op je fondsen',
        description: 'Open een fonds in je holdings en zoek het TER-veld (Total Expense Ratio). Lage kosten compounden net zo hard als rendement.',
        insight: 'Wat kost jouw fonds per jaar in procenten en hoeveel scheelt dat over 10 jaar?',
        href: '/core',
      },
    ],
  },
  {
    title: 'De gezinsverdeler',
    persona: 'Lisa de Groot',
    subtitle: 'Overzicht bezittingen, schulden, hypotheek vs. beleggen',
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
        description: 'Bekijk je holdings en de verdeling over asset classes (aandelen, obligaties, cash). Bij 13 verschillende bezittingen kan de mix snel afwijken van je target.',
        insight: 'Is je portefeuille in balans met je risicoprofiel?',
        href: '/core',
      },
      {
        title: 'Bereken je Box 3 belasting',
        description: 'Bekijk het Box 3 widget op je dashboard. Klik voor de volledige berekening per asset-categorie.',
        insight: 'Hoeveel belasting betaal je over je vermogen dit jaar?',
        href: '/dashboard',
      },
      {
        title: 'Onderzoek een te hoog budget',
        description: 'Zoek een budget dat over de limiet zit. Klik door naar de transacties en bekijk de tegenpartij-analyse: welke winkels of bedrijven drijven de kosten op?',
        insight: 'Welke tegenpartij is verantwoordelijk voor het grootste deel van de overschrijding?',
        href: '/core/budgets',
      },
      {
        title: 'Vergelijk hypotheek vs. beleggen',
        description: 'Open je hypotheek en bekijk de aflossingsstrategie. Vergelijk extra aflossen met inleggen in je indexfonds.',
        insight: 'Loont het om extra af te lossen of levert beleggen netto meer op?',
        href: '/core/debts/mortgage',
      },
      {
        title: 'Bekijk je persoonlijk-plan rapport',
        description: 'Ga naar Rapportages en genereer een persoonlijk plan. De AI analyseert je vermogensopbouw, schulden en lange-termijn pad.',
        insight: 'Welke acties heeft de AI ge\u00efdentificeerd om je plan te versnellen?',
        href: '/rapportages',
      },
    ],
  },
  {
    title: 'Bijna binnen',
    persona: 'Willem Jansen',
    subtitle: 'FIRE-parameters, Monte Carlo, onttrekkingsstrategie',
    icon: TrendingUp,
    accentClass: 'text-horizon-600',
    accentBgClass: 'bg-horizon-500/10',
    borderClass: 'border-l-horizon-500',
    barClass: 'bg-horizon-500',
    scenarios: [
      {
        title: 'Bereken je spaarquote',
        description: 'Ga naar De Kern en vergelijk je inkomen met je uitgaven. De spaarquote is de motor van je FIRE-datum.',
        insight: 'Wat is je maandelijkse spaarquote in procenten?',
        href: '/core',
      },
      {
        title: 'Draai een Monte Carlo backtest',
        description: 'Ga naar De Horizon en bekijk de backtesting score. Deze simuleert duizenden historische scenario\u2019s om je plan te stress-testen.',
        insight: 'Hoe groot is de kans dat je vermogen toereikend is in een slecht decennium?',
        href: '/horizon',
      },
      {
        title: 'Optimaliseer je fondskosten',
        description: 'Bekijk de TER van VWRL en je andere ETF\u2019s in je holdings overzicht. Bij grote portefeuilles tikken kosten zwaar door.',
        insight: 'Welk fonds is het duurst en hoeveel scheelt overstappen op jaarbasis?',
        href: '/core',
      },
      {
        title: 'Stel je FIRE-parameters in',
        description: 'Ga naar Instellingen \u2192 FIRE en pas je verwacht rendement en inflatie aan. Kleine aanpassingen verschuiven je FIRE-datum jaren.',
        insight: 'Hoe verandert je FIRE-datum bij andere aannames?',
        href: '/identity/instellingen',
      },
      {
        title: 'Plan je Coast FIRE',
        description: 'Bekijk de vrijheidsmijlpalen widget. Coast FIRE is het punt waarop je bestaand vermogen alleen al genoeg compoundt tot pensioen.',
        insight: 'Bij welk vermogen hoef je niet meer bij te leggen?',
        href: '/dashboard',
      },
      {
        title: 'Stel je onttrekkingsstrategie in',
        description: 'Ga naar Instellingen \u2192 FIRE en kies tussen guardrails, vast percentage of kapitaalbehoud. Dit bepaalt hoe je vermogen tijdens pensioen wordt verbruikt.',
        insight: 'Welke strategie past bij jouw risicoprofiel en gewenste pensioeninkomen?',
        href: '/identity/instellingen',
      },
    ],
  },
  {
    title: 'De gepensioneerde',
    persona: 'Marijke Vermeer',
    subtitle: 'AOW + ABP-pensioen, decumulatie, legacy-planning',
    icon: Target,
    accentClass: 'text-horizon-600',
    accentBgClass: 'bg-horizon-500/10',
    borderClass: 'border-l-horizon-500',
    barClass: 'bg-horizon-500',
    scenarios: [
      {
        title: 'Bekijk je AOW + ABP-pensioen + lijfrente',
        description: 'Ga naar De Horizon en open je levensgebeurtenissen. AOW, ABP-pensioen en lijfrente vormen samen je gegarandeerde inkomen.',
        insight: 'Hoeveel maandelijks inkomen is gedekt v\u00f3\u00f3rdat je je beleggingen aanspreekt?',
        href: '/horizon',
      },
      {
        title: 'Analyseer je passief inkomen',
        description: 'Bekijk het passief inkomen widget op je dashboard. Klik op het bedrag voor de kassabon.',
        insight: 'Hoeveel dividend, rente en pensioen ontvang je per maand?',
        href: '/dashboard',
      },
      {
        title: 'Plan een grote uitgave na pensioen',
        description: 'Ga naar De Horizon en voeg een levensgebeurtenis toe (bijv. wereldcruise of verbouwing badkamer). Bekijk het effect op je vermogenspad.',
        insight: 'Kun je die droomreis betalen zonder je pensioeninkomen aan te tasten?',
        href: '/horizon',
      },
      {
        title: 'Stel je onttrekkingsstrategie in',
        description: 'Ga naar Instellingen \u2192 FIRE en kies tussen kapitaalbehoud (legacy nalaten) of guardrails (flexibel onttrekken). Dit bepaalt wat er overblijft voor de kinderen.',
        insight: 'Welke balans tussen genieten en nalaten past bij jou?',
        href: '/identity/instellingen',
      },
      {
        title: 'Markeer eigen woning als niet-liquide',
        description: 'Ga naar De Kern \u2192 Bezittingen en markeer je eigen woning als niet-liquide. Bekijk hoe je belegbaar vermogen er zonder steen uitziet.',
        insight: 'Hoeveel belegbaar vermogen heb je als je je huis en hypotheek weglaat?',
        href: '/core',
      },
      {
        title: 'Plan stacaravan verkopen',
        description: 'Open de levensgebeurtenis "Stacaravan verkopen" in De Horizon. Bekijk hoe het verkoopmoment je vermogenspad en cashflow be\u00efnvloedt.',
        insight: 'Wanneer is het beste moment om de stacaravan om te zetten in liquide vermogen?',
        href: '/horizon',
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
    title: 'Ontdek je persoonlijke instellingen',
    description: 'Ga naar Identiteit \u2192 Instellingen \u2192 Weergave en pas je moduleKleuren en lettertype aan. Bekijk hoe de app er met jouw keuzes uitziet.',
    insight: 'Voelt de app meer \u201cvan jou\u201d met je eigen kleuren en typografie?',
    href: '/identity/instellingen',
  },
  {
    title: 'Probeer \u2318K command-palette',
    description: 'Druk op \u2318K (Mac) of Ctrl+K (Windows) om de command-palette te openen. Zoek pagina\u2019s, entiteiten en acties in \u00e9\u00e9n veld.',
    insight: 'Hoeveel sneller navigeer je door de app met de palette dan met de sidebar?',
    href: '/dashboard',
  },
  {
    title: 'Verken het stappenplan in Beheer',
    description: 'Ga naar Beheer en open het stappenplan. Hier zie je hoe modules samenhangen en welke volgende stappen logisch zijn na onboarding.',
    insight: 'Welke modules zijn voor jouw situatie de volgende logische stap?',
    href: '/beheer',
  },
]

// ── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'trifinity-test-scenarios-done'

const TOTAL_SCENARIOS =
  GENERAL_SCENARIOS.length + GROUPS.reduce((n, g) => n + g.scenarios.length, 0)

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TestScenariosPage() {
  const [completed, setCompleted] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setCompleted(new Set(JSON.parse(stored)))
    } catch { /* empty */ }
  }, [])

  const toggle = useCallback((title: string) => {
    setCompleted(prev => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const doneCount = completed.size
  const pct = Math.round((doneCount / TOTAL_SCENARIOS) * 100)

  return (
    <div className="mx-auto max-w-3xl">
      <NavStackMeta title="Testscenario's" bottomBar={{ kind: 'tabs' }} />
      {/* ── Editorial masthead — blueprint Type 2 ── */}
      <header className="mb-10 border-b border-[var(--border-ed)] pb-6 space-y-2">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Testscenario&rsquo;s
        </div>
        <h1
          className="font-bold text-3xl sm:text-4xl tracking-[-0.02em] leading-tight"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Ontdek{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            TriFinity
          </em>
        </h1>
        <p
          className="italic text-base leading-relaxed text-[var(--ink-2)] max-w-xl pl-4"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            borderLeft: '2px solid var(--module-active-500)',
          }}
        >
          Concrete opdrachten om de app te verkennen. Elke opdracht leidt naar een
          functie die een inzicht oplevert of invloed heeft op je financi&euml;le plaatje.
          Begin met de algemene opdrachten bovenaan, of kies de groep die bij je past.
        </p>
        <div className="mt-5 flex items-center gap-6 text-xs text-[var(--ink-4)]">
          <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">4</span> gebruikersgroepen</span>
          <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">31</span> opdrachten</span>
          <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">5</span> modules</span>
        </div>

        {/* ── Progress bar ── */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--ink-2)]">
              <span className="font-mono tabular-nums">{doneCount}</span> van <span className="font-mono tabular-nums">{TOTAL_SCENARIOS}</span> afgerond
            </span>
            <span className="font-mono tabular-nums font-semibold text-[var(--ink-3)]">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-kern-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      {/* ── General scenarios ── */}
      <GeneralSection completed={completed} onToggle={toggle} />

      <SectionDivider variant="asterisk" />

      {/* ── Persona groups ── */}
      {GROUPS.map((group, gi) => (
        <div key={group.title}>
          {gi > 0 && <SectionDivider variant="asterisk" />}
          <ScenarioSection group={group} completed={completed} onToggle={toggle} />
        </div>
      ))}

      {/* ── Feedback CTA ── */}
      <SectionDivider variant="asterisk" />
      <section className="mb-8 text-center">
        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
          Hoe bevalt TriFinity?
        </h2>
        <p className="mt-2 font-serif text-sm text-[var(--ink-3)]">
          Deel je ervaring en help ons de app te verbeteren.
        </p>
        <Link
          href="/identity/testscenarios/vragenlijsten"
          className="mt-4 inline-flex items-center gap-2 border border-[var(--border-md)] bg-[var(--paper)] px-6 py-3 text-sm font-semibold text-[var(--ink)] transition-all hover:-translate-y-px hover:shadow-[var(--s1)]"
        >
          Naar vragenlijsten
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  )
}

// ── Components ───────────────────────────────────────────────────────────────

function ScenarioSection({ group, completed, onToggle, defaultOpen = false }: { group: ScenarioGroup; completed: Set<string>; onToggle: (t: string) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const groupDone = group.scenarios.filter(s => completed.has(s.title)).length
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
            <span className="ml-2 font-mono text-xs font-normal tabular-nums text-[var(--ink-4)]">{groupDone}/{group.scenarios.length}</span>
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
              checked={completed.has(scenario.title)}
              onToggle={() => onToggle(scenario.title)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function GeneralSection({ completed, onToggle }: { completed: Set<string>; onToggle: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  const groupDone = GENERAL_SCENARIOS.filter(s => completed.has(s.title)).length
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
            <span className="ml-2 font-mono text-xs font-normal tabular-nums text-[var(--ink-4)]">{groupDone}/{GENERAL_SCENARIOS.length}</span>
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
              checked={completed.has(scenario.title)}
              onToggle={() => onToggle(scenario.title)}
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
  checked,
  onToggle,
}: {
  index: number
  scenario: Scenario
  borderClass: string
  staggerIndex: number
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`group relative border border-[var(--border-ed)] border-l-4 ${borderClass} bg-[var(--paper)] transition-all duration-150 animate-fade-up ${checked ? 'opacity-60' : 'hover:-translate-y-px hover:border-[var(--border-md)] hover:shadow-[var(--s1)]'}`}
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
    >
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Checkbox */}
        <button
          type="button"
          onClick={onToggle}
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border transition-colors duration-150 ${
            checked
              ? 'border-kern-500 bg-kern-500 text-white'
              : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
          }`}
        >
          {checked
            ? <Check className="h-4 w-4" />
            : <span className="font-mono text-xs font-bold tabular-nums">{index}</span>
          }
        </button>

        {/* Content — links to the page */}
        <Link
          href={scenario.href}
          className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wil-500 focus-visible:ring-offset-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-semibold ${checked ? 'line-through text-[var(--ink-3)]' : 'text-[var(--ink)]'}`}>
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
        </Link>
      </div>
    </div>
  )
}
