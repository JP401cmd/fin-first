'use client'

import { useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  Wallet,
  TrendingUp,
  CreditCard,
  PieChart,
  BarChart3,
  Receipt,
  RefreshCw,
  Compass,
  Target,
  Zap,
  Sparkles,
  LayoutDashboard,
  Newspaper,
  Rocket,
  LineChart,
  ArrowDownToLine,
  MessageSquare,
  Sun,
  Rss,
  Bell,
  FileText,
  Users,
  Scale,
  Settings,
  Smartphone,
  Home,
  type LucideIcon,
} from 'lucide-react'

/* ── Types ──────────────────────── */

interface NaslagwerkTopic {
  icon: LucideIcon
  title: string
  summary: string
  /** Anchor id to scroll to in the journey section */
  anchor?: string
}

interface NaslagwerkModule {
  id: string
  label: string
  color: string
  topics: NaslagwerkTopic[]
}

/* ── Topic data per module ──────────────────────── */

const MODULES: NaslagwerkModule[] = [
  {
    id: 'kern',
    label: 'De Kern',
    color: 'var(--color-kern-400)',
    topics: [
      {
        icon: Wallet,
        title: 'Bankrekeningen',
        summary: 'Beheer je betaal- en spaarrekeningen, importeer transacties en synchroniseer met je bank.',
        anchor: 'guide-reis-1',
      },
      {
        icon: TrendingUp,
        title: 'Vermogensbeheer',
        summary: 'Houd beleggingen, vastgoed en pensioen bij en volg je vermogensgroei.',
        anchor: 'guide-reis-1',
      },
      {
        icon: CreditCard,
        title: 'Schuldenbeheer',
        summary: 'Registreer hypotheek, leningen en creditcardschuld en plan je aflossing.',
        anchor: 'guide-reis-1',
      },
      {
        icon: PieChart,
        title: 'Netto vermogen',
        summary: 'Je totale bezittingen minus schulden, uitgedrukt in vrijheidstijd.',
        anchor: 'guide-reis-1',
      },
      {
        icon: BarChart3,
        title: 'Budgetteren',
        summary: 'Stel budgetten per categorie in en volg je uitgavenpatronen.',
        anchor: 'guide-reis-2',
      },
      {
        icon: Receipt,
        title: 'Belasting',
        summary: 'Inzicht in Box 3-belasting, fictief rendement en belastingdruk op je vermogen.',
        anchor: 'guide-reis-2',
      },
      {
        icon: Scale,
        title: 'Rebalancing & Allocatie',
        summary:
          'Herbalanceer je portfolio naar je doelallocatie. Begrijp drift, kleurcodes en Box 3 peildatumtips.',
        anchor: 'guide-reis-2',
      },
      {
        icon: BarChart3,
        title: 'Beleggingskosten & TER',
        summary:
          'Begrijp Total Expense Ratio, het compound effect van kosten en hoe je TER per fonds invoert.',
        anchor: 'guide-reis-2',
      },
      {
        icon: Home,
        title: 'Hypotheek vs Beleggen',
        summary:
          'Wanneer is extra aflossen beter dan beleggen? Leer over hypotheekrenteaftrek, Box 3 effect en breakeven rendement.',
        anchor: 'guide-reis-2',
      },
      {
        icon: RefreshCw,
        title: 'Check-in',
        summary: 'Maandelijkse routine om je saldi bij te werken en voortgang te meten.',
        anchor: 'guide-reis-2',
      },
      {
        icon: Compass,
        title: 'Wat komt er nog? (Kern)',
        summary: 'Automatische banksync, slimmere transactieherkenning en uitgebreidere rapportages.',
        anchor: 'guide-reis-2',
      },
    ],
  },
  {
    id: 'wil',
    label: 'De Wil',
    color: 'var(--color-wil-400)',
    topics: [
      {
        icon: Sparkles,
        title: 'Voorstellen',
        summary: 'AI-gegenereerde aanbevelingen op basis van je financiële situatie.',
        anchor: 'guide-reis-3',
      },
      {
        icon: Zap,
        title: 'Acties',
        summary: 'Concrete stappen om je financiën te verbeteren, met voortgangsregistratie.',
        anchor: 'guide-reis-3',
      },
      {
        icon: Target,
        title: 'Doelen',
        summary: 'Stel spaardoelen in en volg je voortgang richting specifieke bedragen.',
        anchor: 'guide-reis-3',
      },
      {
        icon: Receipt,
        title: 'Abonnementen',
        summary: 'Overzicht van terugkerende uitgaven en mogelijke besparingen.',
        anchor: 'guide-reis-3',
      },
      {
        icon: LayoutDashboard,
        title: 'Widgets overzicht',
        summary: 'Meer dan 26 widgets voor inzicht in vermogen, budget, acties en prognoses.',
        anchor: 'guide-reis-3',
      },
      {
        icon: Newspaper,
        title: 'Briefing (DAIshboard)',
        summary: 'AI-samengestelde dagelijkse briefing met persoonlijke financiële inzichten.',
        anchor: 'guide-reis-3',
      },
      {
        icon: Rocket,
        title: 'Dit komt eraan',
        summary: 'Uitgavenpatronen, financieel rapport en huishouden-samenwerking.',
        anchor: 'guide-reis-3',
      },
      {
        icon: MessageSquare,
        title: 'Will AI-chat',
        summary: 'Je persoonlijke financiële gesprekspartner met drie persoonlijkheden.',
        anchor: 'guide-reis-5',
      },
    ],
  },
  {
    id: 'horizon',
    label: 'De Horizon',
    color: 'var(--color-horizon-400)',
    topics: [
      {
        icon: LineChart,
        title: 'FIRE-projectie',
        summary: 'Bereken wanneer werken optioneel wordt op basis van je vermogensgroei.',
        anchor: 'guide-reis-4',
      },
      {
        icon: LineChart,
        title: 'Hoe de Horizon-grafiek werkt',
        summary: 'Volledige uitleg: fases, FIRE-leeftijd, belasting, eindstrategie (incl. pensioen-modus) en alle instelbare parameters.',
        anchor: 'guide-horizon-grafiek',
      },
      {
        icon: Compass,
        title: 'Levensgebeurtenissen',
        summary: 'Modelleer de financiële impact van kinderen, verhuizing, carrièreswitch.',
        anchor: 'guide-reis-4',
      },
      {
        icon: BarChart3,
        title: 'Monte Carlo & backtesting',
        summary: 'Per fase: slagingskans, waaiergrafiek, mediaan eindvermogen, kritische grens/SWR via binary search.',
        anchor: 'guide-reis-4',
      },
      {
        icon: BarChart3,
        title: 'Fase-analyses',
        summary: 'Per fase specifieke analyses: schulden, giften, gap-analyse, eerder stoppen, SORR, huis verkopen, koopkracht-erosie en meer.',
        anchor: 'guide-horizon-grafiek',
      },
      {
        icon: ArrowDownToLine,
        title: 'Onttrekkingsstrategie',
        summary: 'Kies hoe je je vermogen na FIRE of pensioen aanspreekt: deplete, legacy, perpetueel of pensioenleeftijd.',
        anchor: 'guide-reis-4',
      },
      {
        icon: MessageSquare,
        title: 'Droomscenario / What-If',
        summary: 'Experimenteer met alternatieve toekomsten en vertaal dromen naar plannen.',
        anchor: 'guide-reis-5',
      },
      {
        icon: Rocket,
        title: 'Wat komt er nog? (Horizon)',
        summary: 'Glijpad-visualisatie, scenario-vergelijker en geavanceerde pensioenplanning.',
        anchor: 'guide-reis-5',
      },
    ],
  },
  {
    id: 'algemeen',
    label: 'Algemeen',
    color: 'var(--ink-3)',
    topics: [
      {
        icon: Sun,
        title: 'Vrijheidsinsteek',
        summary: 'De filosofie achter TriFinity: geld is opgeslagen tijd.',
      },
      {
        icon: Rss,
        title: 'TriFinity Post',
        summary: 'Gepersonaliseerde financiële nieuwsfeed met AI-samenvattingen.',
      },
      {
        icon: Sparkles,
        title: 'Will — je AI-assistent',
        summary: 'Drie persoonlijkheden (FHIN, FINN, FFIN) voor context-aware financieel advies.',
      },
      {
        icon: Bell,
        title: 'Meldingen',
        summary: 'Budget alerts, inzichten, level-ups en horizon-waarschuwingen.',
      },
      {
        icon: FileText,
        title: 'Rapporten',
        summary: 'Perioderapport, balans, budgetrapport en jaaroverzicht met AI-inleiding.',
      },
      {
        icon: LayoutDashboard,
        title: 'Dashboard & Widgets',
        summary: 'Je persoonlijke cockpit met 26+ widgets die progressief ontgrendelen.',
      },
      {
        icon: Newspaper,
        title: 'DAIshboard / Briefing',
        summary: 'AI-briefing met tot 23 kaarttypes, tijdsbewust en progressief geladen.',
      },
      {
        icon: Settings,
        title: 'Profiel & Instellingen',
        summary: 'Persoonlijke gegevens, FIRE-parameters, widgets en weergaveopties.',
      },
      {
        icon: Users,
        title: 'Huishouden & Partner',
        summary: 'Deel financiën met je partner, met privacy per eigenaarschap.',
      },
      {
        icon: Smartphone,
        title: 'Mobiel',
        summary: 'Volledig responsive met bottom navigation en BottomSheets.',
      },
    ],
  },
]

/* ── Scroll helper ──────────────────────── */

function scrollToAnchor(anchor: string) {
  const el = document.getElementById(anchor)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/* ── Topic list item (compact reference style) ──────────────────────── */

function NaslagwerkItem({
  topic,
  color,
  index = 0,
}: {
  topic: NaslagwerkTopic
  color: string
  index?: number
}) {
  const hasAnchor = !!topic.anchor
  const isEven = index % 2 === 0

  return (
    <button
      type="button"
      onClick={hasAnchor ? () => scrollToAnchor(topic.anchor!) : undefined}
      disabled={!hasAnchor}
      className={`flex items-start gap-2.5 w-full text-left py-2.5 px-2.5 rounded-[var(--r-sm)] transition-colors ${
        isEven ? 'bg-[var(--subtle)]/20' : ''
      } ${
        hasAnchor
          ? 'hover:bg-[var(--subtle)]/60 cursor-pointer'
          : 'cursor-default'
      }`}
    >
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--subtle)]"
        style={{ color }}
      >
        <topic.icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--ink)]">
          {topic.title}
        </p>
        <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
          {topic.summary}
        </p>
      </div>
      {hasAnchor && (
        <span className="text-[10px] text-[var(--ink-4)] shrink-0 mt-0.5">
          ↗
        </span>
      )}
    </button>
  )
}

/* ── Mobile accordion section ──────────────────────── */

function AccordionModule({
  module: mod,
  open,
  onToggle,
}: {
  module: NaslagwerkModule
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-[var(--border-ed)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 py-3 px-3 min-h-[44px] text-left transition-colors hover:bg-[var(--subtle)]/40"
        aria-expanded={open}
      >
        {/* Module color dot */}
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: mod.color }}
        />
        <span className="flex-1 text-[12px] font-semibold text-[var(--ink)]">
          {mod.label}
        </span>
        <span className="text-[11px] text-[var(--ink-4)] tabular-nums font-mono mr-1">
          {mod.topics.length}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Animated expand/collapse */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-1 pb-3 space-y-0.5">
            {mod.topics.map((topic, i) => (
              <NaslagwerkItem
                key={topic.title}
                topic={topic}
                color={mod.color}
                index={i}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────── */

/**
 * Naslagwerk (reference index) — groups all guide topics by module.
 *
 * Desktop (lg+): horizontal tab bar with module-colored active state.
 * Mobile (<lg): vertical accordions that expand/collapse.
 *
 * Each topic is a compact reference item (icon + title + one-line summary)
 * that scrolls to the relevant journey section when clicked.
 */
export default function GuideNaslagwerk() {
  const [activeTab, setActiveTab] = useState(MODULES[0].id)
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())

  const activeModule = MODULES.find((m) => m.id === activeTab) ?? MODULES[0]

  function toggleAccordion(id: string) {
    setOpenAccordions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="mt-6 mb-1">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-[var(--ink-3)]" />
        <p className="label-editorial text-[var(--ink-3)]">Naslagwerk</p>
      </div>

      {/* ── Desktop: tabbed view (lg+) ── */}
      <div className="hidden lg:block rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]">
        {/* Tab bar */}
        <div className="flex border-b border-[var(--border-ed)]">
          {MODULES.map((mod) => {
            const isActive = activeTab === mod.id
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setActiveTab(mod.id)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold transition-colors ${
                  isActive
                    ? 'text-[var(--ink)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                {/* Module color dot */}
                <div
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: mod.color }}
                />
                {mod.label}
                <span className="text-[10px] text-[var(--ink-4)] tabular-nums font-mono">
                  {mod.topics.length}
                </span>

                {/* Active indicator line */}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ backgroundColor: mod.color }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="p-3 space-y-0.5">
          {activeModule.topics.map((topic, i) => (
            <NaslagwerkItem
              key={topic.title}
              topic={topic}
              color={activeModule.color}
              index={i}
            />
          ))}
        </div>
      </div>

      {/* ── Mobile: accordion view (<lg) ── */}
      <div className="lg:hidden rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]">
        {MODULES.map((mod) => (
          <AccordionModule
            key={mod.id}
            module={mod}
            open={openAccordions.has(mod.id)}
            onToggle={() => toggleAccordion(mod.id)}
          />
        ))}
      </div>
    </div>
  )
}
