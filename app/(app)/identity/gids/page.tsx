'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronDown, LayoutDashboard, Landmark, Zap, Compass, BookOpen, MessageSquare, Sparkles, Lock, Receipt, CheckCircle2, ArrowRight, Wallet, CreditCard, PieChart, Upload, RefreshCw, Target, TrendingUp, BarChart3, ClipboardCheck, MoreHorizontal, Newspaper, LineChart, ArrowDownToLine, Clock, Users, User, Settings, Bell, FileText, Smartphone, type LucideIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { DISCOVER_ITEMS, getVisitedFeaturesLocal, markFeatureVisitedLocal, type DiscoverItem } from '@/components/app/discover-carousel'
import { FEATURES, DEFAULT_MATRIX, PHASES, levelToPhaseId } from '@/lib/feature-phases'
import ConceptFlipCards from '@/components/app/concept-flip-cards'
import { OntdekkenSection } from '@/components/app/ontdekken-section'
import { GuideProgressBar } from '@/components/app/guide-progress-bar'
import GuideFaq from '@/components/app/guide-faq'
import GuideProTips from '@/components/app/guide-pro-tips'
import GuideTopicCard from '@/components/app/guide-topic-card'

/* ── Types ─────────────────────── */

interface GuideProgress {
  counts: {
    assets: number
    transactions: number
    completedActions: number
    lifeEvents: number
    budgets: number
    debts: number
    pendingRecommendations: number
    wonFreedomDays: number
  }
  financial: {
    netWorth: number
    dailyExpenseRate: number
    monthlyExpenses: number
    freedomDays: { days: number; months: number; years: number }
    fireAge: number | null
    fireTarget: number
    sovereigntyLevel: number
  }
  steps: {
    hasAssets: boolean
    hasTransactions: boolean
    hasBudgets: boolean
    hasCompletedActions: boolean
    hasLifeEvents: boolean
    hasFireData: boolean
    hasDebts: boolean
  }
}

/* ── Reis-stap card component ─────────────────────── */

function ReisStapCard({
  id,
  icon: Icon,
  title,
  color,
  howSteps,
  statusLines,
  valueSentence,
  ctaLabel,
  ctaHref,
  isComplete,
}: {
  id?: string
  icon: LucideIcon
  title: string
  color: string
  howSteps: { icon: LucideIcon; text: string }[]
  statusLines: string[]
  valueSentence: string
  ctaLabel: string
  ctaHref: string
  isComplete: boolean
}) {
  return (
    <div id={id} className="card-editorial overflow-hidden scroll-mt-28">
      {/* Top accent bar */}
      <div className="h-[3px]" style={{ backgroundColor: color }} />

      {/* Header */}
      <div className="flex items-center gap-3 p-3 pb-2.5 sm:p-4 sm:pb-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]"
          style={{ color }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        </div>
        {isComplete && (
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">Voltooid</span>
          </div>
        )}
      </div>

      {/* Hoe-stappen */}
      <div className="px-3 pb-2.5 sm:px-4 sm:pb-3">
        <p className="label-editorial text-[var(--ink-4)] mb-2">Hoe</p>
        <div className="space-y-2">
          {howSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {i + 1}
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{step.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Jouw status */}
      <div className="mx-3 mb-2.5 sm:mx-4 sm:mb-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 sm:p-3">
        <p className="label-editorial text-[var(--ink-4)] mb-1.5">Jouw status</p>
        {statusLines.map((line, i) => (
          <p key={i} className="text-[12px] leading-relaxed text-[var(--ink-2)]">
            {line.split(/(\d[\d.,]*)/g).map((part, j) =>
              /^\d/.test(part) ? <span key={j} className="font-mono tabular-nums">{part}</span> : part
            )}
          </p>
        ))}
      </div>

      {/* Waarde */}
      <div className="px-3 pb-2.5 sm:px-4 sm:pb-3">
        <p className="font-serif italic text-[12px] leading-relaxed text-[var(--ink-3)]">
          {valueSentence}
        </p>
      </div>

      {/* CTA */}
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-4 py-2.5 min-h-[44px] sm:py-2 sm:min-h-0 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: color }}
        >
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

/* ── Helper components ─────────────────────── */

function GuideAccordion({
  id,
  icon,
  title,
  tagline,
  color,
  open,
  onToggle,
  children,
}: {
  id: string
  icon: React.ReactNode
  title: string
  tagline: string
  color: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div id={`guide-${id}`} className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] scroll-mt-24" data-testid={`guide-${id}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 min-h-[44px] text-left transition-colors hover:bg-[var(--subtle)]/60"
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--subtle)]"
          style={{ color }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
          <p className="text-[11px] text-[var(--ink-3)]">{tagline}</p>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-[var(--border-ed)] px-3 pb-3 pt-2">
          {children}
        </div>
      )}
    </div>
  )
}

function GuideFeature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3">
      <p className="text-[12px] font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-2)]">{children}</p>
    </div>
  )
}

/* ── Main page ─────────────────────── */

export default function GidsPage() {
  const supabase = createClient()
  const [guideSection, setGuideSection] = useState<string | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<GuideProgress | null>(null)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        if (profile?.full_name) setFullName(profile.full_name)
      }

      // Fetch guide progress data
      try {
        const res = await fetch('/api/guide-progress')
        if (res.ok) {
          const data = await res.json()
          setProgress(data)
        }
      } catch (e) {
        // Progress data is optional — cards still render without it
      }

      setLoading(false)
    }
    loadData()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ink-4)] border-t-[var(--ink)]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Hero */}
      <section className="card-editorial overflow-hidden mb-6 sm:mb-8">
        <div className="flex h-1.5">
          <div className="flex-1 bg-kern-500" />
          <div className="flex-1 bg-wil-500" />
          <div className="flex-1 bg-horizon-500" />
        </div>
        <div className="p-4 sm:p-6 md:p-8">
          <p className="label-editorial text-[var(--ink-3)] mb-1">Rondleiding</p>
          <h1 className="font-display text-[28px] sm:text-[36px] font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.02em' }}>
            Zo werkt TriFinity
          </h1>
          <p className="mt-1 font-serif italic text-[13px] text-[var(--ink-3)]">
            {fullName ? `Welkom, ${fullName.split(' ')[0]}` : 'Rondleiding door de app'}
          </p>
        </div>
      </section>

      {/* Voortgangsbalk */}
      <GuideProgressBar />

      {/* Filosofie + module-pijlers */}
      <div className="mb-6 sm:mb-8 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 lg:gap-6">
        {/* Filosofie-quote */}
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 max-w-prose self-start">
          <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
            &ldquo;Geld is opgeslagen tijd.&rdquo; Elke euro die je verdient, spaart of uitgeeft
            vertegenwoordigt een stukje van je levenstijd. TriFinity vertaalt al je financiële
            gegevens naar <strong className="font-semibold text-[var(--ink)]">vrijheidstijd</strong> —
            dagen, maanden en jaren dat je niet hoeft te werken.
          </p>
        </div>

        {/* Module-pijlers stack */}
        <div className="grid grid-cols-3 lg:grid-cols-1 lg:w-52 gap-3">
          {([
            { id: 'kern', icon: Landmark, name: 'De Kern', tagline: 'Wat je hebt en uitgeeft', color: 'var(--color-kern-400)' },
            { id: 'wil', icon: Zap, name: 'De Wil', tagline: 'Wat je nu kunt doen', color: 'var(--color-wil-400)' },
            { id: 'horizon', icon: Compass, name: 'De Horizon', tagline: 'Waar je naartoe gaat', color: 'var(--color-horizon-400)' },
          ] as { id: string; icon: LucideIcon; name: string; tagline: string; color: string }[]).map((mod) => {
            const Icon = mod.icon
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  const el = document.getElementById(`guide-${mod.id}`)
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="card-editorial p-4 text-left transition-all hover:shadow-md group min-h-[44px]"
              >
                <div
                  className="mb-2 flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]"
                  style={{ color: mod.color }}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <p className="text-sm font-semibold text-[var(--ink)] group-hover:underline">{mod.name}</p>
                <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{mod.tagline}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Kernconcepten — interactieve flip-cards */}
      <ConceptFlipCards />

      {/* ── Je reis — interactieve stappen ── */}
      <p className="label-editorial text-[var(--ink-3)] mb-3">Je reis</p>
      <div className="mb-6 sm:mb-8 space-y-6">
        {/* ── De Kern ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-kern-500" />
            <p className="label-editorial text-kern-600">De Kern</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Stap 1: Weet waar je staat */}
            <ReisStapCard
              id="guide-reis-1"
              icon={Landmark}
              title="Weet waar je staat"
              color="var(--color-kern-400)"

              howSteps={[
                { icon: Wallet, text: 'Voeg je bankrekeningen toe' },
                { icon: CreditCard, text: 'Registreer bezittingen en schulden' },
                { icon: PieChart, text: 'Schat je maanduitgaven of stel budgetten in' },
              ]}
              statusLines={
                progress
                  ? progress.steps.hasAssets || progress.steps.hasDebts
                    ? [
                        `Je hebt ${progress.counts.assets} bezitting${progress.counts.assets !== 1 ? 'en' : ''} en ${progress.counts.debts} schuld${progress.counts.debts !== 1 ? 'en' : ''} geregistreerd.`,
                        progress.financial.netWorth !== 0
                          ? `Netto vermogen: ${formatCurrency(progress.financial.netWorth)}`
                          : '',
                      ].filter(Boolean)
                    : ['Je hebt nog geen vermogen ingevoerd.']
                  : ['Laden...']
              }
              valueSentence="Je ziet voor het eerst je complete financiële plaatje in vrijheidstijd."
              ctaLabel="Bekijk je vermogen"
              ctaHref="/core"
              isComplete={!!progress?.steps.hasAssets}
            />

            {/* Stap 2: Begrijp je patronen */}
            <ReisStapCard
              id="guide-reis-2"
              icon={Receipt}
              title="Begrijp je patronen"
              color="var(--color-kern-400)"

              howSteps={[
                { icon: Upload, text: 'Importeer transacties (MT940/CSV)' },
                { icon: RefreshCw, text: 'Bekijk terugkerende kosten' },
                { icon: CreditCard, text: 'Ontdek je abonnementen' },
              ]}
              statusLines={
                progress
                  ? progress.steps.hasTransactions
                    ? [
                        `Je hebt ${progress.counts.transactions.toLocaleString('nl-NL')} transactie${progress.counts.transactions !== 1 ? 's' : ''} geïmporteerd.`,
                      ]
                    : ['Importeer je eerste transacties.']
                  : ['Laden...']
              }
              valueSentence="Ontdek waar je tijd weglekt zonder dat je het doorhebt."
              ctaLabel={progress?.steps.hasTransactions ? 'Bekijk je kas' : 'Importeer transacties'}
              ctaHref={progress?.steps.hasTransactions ? '/core/cash' : '/core/cash/import'}
              isComplete={!!progress?.steps.hasTransactions}
            />
          </div>
        </div>

        {/* ── De Wil ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-wil-500" />
            <p className="label-editorial text-wil-600">De Wil</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Stap 3: Onderneem actie */}
            <ReisStapCard
              id="guide-reis-3"
              icon={Zap}
              title="Onderneem actie"
              color="var(--color-wil-400)"

              howSteps={[
                { icon: Sparkles, text: 'Bekijk je aanbevelingen' },
                { icon: Zap, text: 'Accepteer en voer acties uit' },
                { icon: Target, text: 'Stel financiële doelen' },
              ]}
              statusLines={
                progress
                  ? progress.steps.hasCompletedActions
                    ? [
                        `Je hebt ${progress.counts.wonFreedomDays} vrijheidsdag${progress.counts.wonFreedomDays !== 1 ? 'en' : ''} gewonnen door ${progress.counts.completedActions} actie${progress.counts.completedActions !== 1 ? 's' : ''}.`,
                      ]
                    : progress.counts.pendingRecommendations > 0
                      ? [`Er staan ${progress.counts.pendingRecommendations} aanbeveling${progress.counts.pendingRecommendations !== 1 ? 'en' : ''} voor je klaar.`]
                      : ['Voeg eerst je financiële gegevens toe om aanbevelingen te ontvangen.']
                  : ['Laden...']
              }
              valueSentence="Elke afgeronde actie is een gewonnen vrijheidsdag."
              ctaLabel="Bekijk aanbevelingen"
              ctaHref="/will"
              isComplete={!!progress?.steps.hasCompletedActions}
            />
          </div>
        </div>

        {/* ── De Horizon ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-horizon-500" />
            <p className="label-editorial text-horizon-600">De Horizon</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Stap 4: Kijk vooruit */}
            <ReisStapCard
              id="guide-reis-4"
              icon={Compass}
              title="Kijk vooruit"
              color="var(--color-horizon-400)"

              howSteps={[
                { icon: Compass, text: 'Bekijk je FIRE-prognose' },
                { icon: Compass, text: 'Voeg levensgebeurtenissen toe' },
                { icon: Compass, text: 'Vergelijk scenario\u2019s' },
              ]}
              statusLines={
                progress?.financial.fireAge != null
                  ? [
                      `Je geschatte FIRE-leeftijd is ${progress.financial.fireAge}`,
                      `${progress.counts.lifeEvents} levensgebeurtenis${progress.counts.lifeEvents !== 1 ? 'sen' : ''} toegevoegd`,
                    ]
                  : ['Bereken wanneer werken optioneel wordt']
              }
              valueSentence="Zie wanneer werken optioneel wordt"
              ctaLabel="Bekijk je prognose"
              ctaHref="/horizon"
              isComplete={!!progress?.steps.hasFireData && !!progress?.steps.hasLifeEvents}
            />

            {/* Stap 5: Droom en plan */}
            <ReisStapCard
              id="guide-reis-5"
              icon={MessageSquare}
              title="Droom en plan"
              color="var(--color-horizon-400)"

              howSteps={[
                { icon: MessageSquare, text: 'Open een What-If scenario' },
                { icon: MessageSquare, text: 'Beschrijf je droom aan Will' },
                { icon: MessageSquare, text: 'Vraag om een reality-check' },
              ]}
              statusLines={['Probeer: \u201cIk wil over 5 jaar een huis kopen...\u201d']}
              valueSentence="Vertaal je dromen naar een concreet plan"
              ctaLabel="Start een scenario"
              ctaHref="/horizon/whatif"
              isComplete={false}
            />
          </div>
        </div>
      </div>

      <p className="label-editorial text-[var(--ink-3)] mb-3">De onderdelen</p>

      {/* ── De Kern ── */}
      <div id="guide-kern" className="mb-6 scroll-mt-24">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-kern-500" />
          <p className="label-editorial text-kern-600">De Kern</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <GuideAccordion
            id="kern-budgetteren"
            icon={<PieChart className="h-4 w-4" />}
            title="Budgetteren"
            tagline="Budgetplan, doeltypes, analyse en rapportage"
            color="var(--color-kern-700)"
            open={guideSection === 'kern-budgetteren'}
            onToggle={() => setGuideSection(guideSection === 'kern-budgetteren' ? null : 'kern-budgetteren')}
          >
            <div className="space-y-2">
              <GuideFeature title="Budgetplan instellen">
                Je begint met een standaard budgetplan van 6 hoofdcategorieën en 24 subcategorieën. Je kunt limieten aanpassen, categorieën toevoegen of verwijderen en de hiërarchie reorganiseren. Per budget kies je het interval (maandelijks, per kwartaal of jaarlijks), het limiettype (zacht waarschuwt, hard blokkeert) en een alertdrempel (standaard 80%). Optioneel stel je een maximumbedrag per losse transactie in.
              </GuideFeature>
              <GuideFeature title="Budgettypes">
                Elk budget heeft een type dat bepaalt hoe het wordt gemeten. <strong className="text-[var(--ink)]">Inkomsten</strong> — salaris, toeslagen, teruggaven. <strong className="text-[var(--ink)]">Uitgaven</strong> — maandelijkse bestedingen per categorie. <strong className="text-[var(--ink)]">Sparen</strong> — noodfonds, beleggingen, pensioen. <strong className="text-[var(--ink)]">Schulden</strong> — aflossingen op leningen en hypotheek. <strong className="text-[var(--ink)]">Verborgen</strong> — interne overboekingen tussen eigen rekeningen die niet meetellen in de analyse.
              </GuideFeature>
              <GuideFeature title="Doeltypes">
                Subcategorieën kunnen een doeltype krijgen dat bepaalt hoe het budget zich gedraagt. <strong className="text-[var(--ink)]">Vaste maandlast</strong> — toont of je inkomen deze dekt of tekortschiet. <strong className="text-[var(--ink)]">Bestedingslimiet</strong> — melding wanneer je de drempel nadert. <strong className="text-[var(--ink)]">Spaardoel</strong> — koppelt aan een doel uit De Wil met doelbedrag en einddatum. <strong className="text-[var(--ink)]">Maandelijkse reservering</strong> — overschot schuift automatisch door naar volgende maand. <strong className="text-[var(--ink)]">Periodieke last</strong> — voor jaarlijkse of halfjaarlijkse kosten, je reserveert maandelijks een deel.
              </GuideFeature>
              <GuideFeature title="Overschotbeheer">
                Wat gebeurt er met geld dat je niet uitgeeft? Per budget kies je: <strong className="text-[var(--ink)]">Reset</strong> — het overschot verdwijnt, het budget begint volgende maand op nul. <strong className="text-[var(--ink)]">Doorschuiven</strong> — het overschot telt op bij de limiet van volgende maand. <strong className="text-[var(--ink)]">Beleggen</strong> — het overschot wordt automatisch overgeheveld naar je beleggingsbudget. Bij het doeltype &lsquo;maandelijkse reservering&rsquo; wordt doorschuiven automatisch ingeschakeld.
              </GuideFeature>
              <GuideFeature title="Essentieel vs. niet-essentieel">
                Elk budget is gemarkeerd als essentieel of niet-essentieel. Essentiële uitgaven zijn je basisbehoeften — wonen, boodschappen, verzekeringen, vervoer, sparen, schulden. Niet-essentiële zijn keuzevrijheid — uit eten, hobby&apos;s, vakantie, kleding. Dit onderscheid is cruciaal: je FIRE-berekening gebruikt je essentiële uitgaven om te bepalen hoeveel vermogen je nodig hebt voor volledige vrijheid. Besparen op niet-essentieel brengt je FIRE-datum direct dichterbij.
              </GuideFeature>
              <GuideFeature title="Verbinding met transacties">
                Na het importeren van transacties koppelt TriFinity ze aan je budgetten. De AI categoriseert automatisch op basis van 24 herkenbare patronen en geeft een betrouwbaarheidsscore. Je kunt suggesties accepteren of handmatig toewijzen. Maak regels aan voor terugkerende tegenpartijen zodat toekomstige transacties vanzelf in de juiste categorie vallen. Inkomsten worden aan inkomstbudgetten gekoppeld, uitgaven aan bestedingscategorieën.
              </GuideFeature>
              <GuideFeature title="Budgetanalyse">
                Drie weergaven voor je budgetten. <strong className="text-[var(--ink)]">Boomweergave</strong> — hiërarchisch overzicht van hoofd- en subcategorieën met voortgangsbalken en gezondheidsindicatoren. <strong className="text-[var(--ink)]">Donutweergave</strong> — cirkeldiagram met de verdeling van je uitgaven per type. <strong className="text-[var(--ink)]">Sparkline-weergave</strong> — mini-trendlijnen over 6 maanden per categorie zodat je patronen herkent. Tik op een categorie voor het detailvenster met dekkingsgraad, variantie-analyse, prognose op basis van gewogen gemiddelden, vergelijking met vorige maand en een gezondheidsscore.
              </GuideFeature>
              <GuideFeature title="Meldingen">
                Bij elke budgetcategorie stel je een alertdrempel in (standaard 80% van het limiet). Bij uitgaven ontvang je een waarschuwing zodra je de drempel nadert en een overschrijdingsmelding wanneer je erover gaat. Bij spaar- en schuldbudgetten werkt het omgekeerd: je krijgt een alert als je achterloopt op je doel. Elke melding toont de impact in vrijheidsdagen wanneer het bedrag boven €100 ligt.
              </GuideFeature>
              <GuideFeature title="Budgetrapportage">
                Het maandelijkse budgetrapport geeft een compleet overzicht: scorecard met besteed percentage en 6-maanden sparkline, statusverdeling (op koers, let op, overschreden), en per categorie een detailregel met limiet, besteding, trend en gezondheid. Essentiële en niet-essentiële uitgaven worden apart opgeteld. Het rapport bevat ook het doorschuif-effect per budget, vergelijking met vorige maand en 3-maandsgemiddelde, jaar-tot-nu totalen, en de impact van je budgetprestaties uitgedrukt in gewonnen of verloren vrijheidsdagen.
              </GuideFeature>
              <GuideFeature title="Budget is optioneel">
                Je hoeft niet elke transactie bij te houden. Vul alleen je geschatte maanduitgaven in en TriFinity berekent je vrijheidsdoel, FIRE-pad en aanbevelingen op basis daarvan. De AI past zich automatisch aan en focust op vermogensgroei, spaarquote en langetermijnstrategie. Zet budgetteren later gewoon aan als je dieper wilt duiken.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="kern-cash"
            icon={<Wallet className="h-4 w-4" />}
            title="Cash rekeningen"
            tagline="Bankrekeningen, transacties en import"
            color="var(--color-kern-700)"
            open={guideSection === 'kern-cash'}
            onToggle={() => setGuideSection(guideSection === 'kern-cash' ? null : 'kern-cash')}
          >
            <div className="space-y-2">
              <GuideFeature title="Bankrekeningen">
                Voeg je betaal- en spaarrekeningen toe. Elke rekening draagt bij aan je netto vermogen en vrijheidstijd.
              </GuideFeature>
              <GuideFeature title="Transacties importeren">
                Importeer transacties via MT940, CSV of OFX bestanden. TriFinity categoriseert ze automatisch en toont je uitgavenpatronen.
              </GuideFeature>
              <GuideFeature title="Sankey-diagram">
                Visualiseer de stroom van je geld — van inkomen via categorieën naar individuele uitgaven. Zie in één oogopslag waar je vrijheidstijd naartoe gaat.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="kern-vermogensbeheer"
            icon={<TrendingUp className="h-4 w-4" />}
            title="Vermogensbeheer"
            tagline="Bezittingen, holdings en waardering"
            color="var(--color-kern-700)"
            open={guideSection === 'kern-vermogensbeheer'}
            onToggle={() => setGuideSection(guideSection === 'kern-vermogensbeheer' ? null : 'kern-vermogensbeheer')}
          >
            <div className="space-y-2">
              <GuideFeature title="Bezittingen">
                Registreer al je bezittingen — spaargeld, beleggingen, crypto, vastgoed, pensioenfondsen, deelnemingen en overig. Elk type heeft eigen velden en waarderingslogica.
              </GuideFeature>
              <GuideFeature title="Holdings en beleggingen">
                Volg individuele beleggingsposities met koersen, rendementen en allocatie. Bekijk je portfolio-opbouw en spreiding.
              </GuideFeature>
              <GuideFeature title="Waarderingsgeschiedenis">
                Houd de waardeontwikkeling van je bezittingen bij over tijd. Handmatige snapshots en automatische berekeningen geven een compleet beeld.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="kern-schuldenbeheer"
            icon={<CreditCard className="h-4 w-4" />}
            title="Schuldenbeheer"
            tagline="Aflossing, strategieën en simulatie"
            color="var(--color-kern-700)"
            open={guideSection === 'kern-schuldenbeheer'}
            onToggle={() => setGuideSection(guideSection === 'kern-schuldenbeheer' ? null : 'kern-schuldenbeheer')}
          >
            <div className="space-y-2">
              <GuideFeature title="Schulden registreren">
                Beheer je hypotheek, studieleningen, persoonlijke leningen, creditcardschuld en doorlopend krediet. Elk type heeft eigen renteberekening en looptijd.
              </GuideFeature>
              <GuideFeature title="Aflossingsstrategieën">
                Vergelijk sneeuwbal (kleinste schuld eerst) en lawine (hoogste rente eerst). Zie het verschil in totale rentekosten en vrijheidstijd.
              </GuideFeature>
              <GuideFeature title="Schuldafbouw-simulatie">
                Simuleer hoeveel sneller je schuldenvrij bent bij extra aflossingen. Elke euro extra aflossen is vrijheidstijd die je terugkoopt.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="kern-nettovermogen"
            icon={<BarChart3 className="h-4 w-4" />}
            title="Netto vermogen"
            tagline="Vermogensgrafiek en snapshots"
            color="var(--color-kern-700)"
            open={guideSection === 'kern-nettovermogen'}
            onToggle={() => setGuideSection(guideSection === 'kern-nettovermogen' ? null : 'kern-nettovermogen')}
          >
            <div className="space-y-2">
              <GuideFeature title="Nettovermogen-grafiek">
                Zie je totale vermogen (bezittingen minus schulden) over tijd in een overzichtelijke grafiek. Elke stijging is vrijheidstijd die je opbouwt.
              </GuideFeature>
              <GuideFeature title="Snapshots">
                Maak handmatige momentopnames of laat TriFinity ze automatisch genereren. Vergelijk periodes en ontdek trends in je vermogensgroei.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="kern-belasting"
            icon={<Receipt className="h-4 w-4" />}
            title="Belasting"
            tagline="Box 3 berekening en optimalisatie"
            color="var(--color-kern-700)"
            open={guideSection === 'kern-belasting'}
            onToggle={() => setGuideSection(guideSection === 'kern-belasting' ? null : 'kern-belasting')}
          >
            <div className="space-y-2">
              <GuideFeature title="Box 3 berekening">
                Automatische berekening van je vermogensrendementsheffing op basis van je bezittingen en schulden. Altijd up-to-date met de huidige fiscale parameters.
              </GuideFeature>
              <GuideFeature title="Fiscaal partnerschap">
                Simuleer het effect van fiscaal partnerschap op je Box 3 belasting. Verdeel de grondslag optimaal over twee partners.
              </GuideFeature>
              <GuideFeature title="Belastingjaren vergelijken">
                Bekijk je Box 3 belasting over meerdere jaren. Ontdek trends en ontvang tips om je belastingdruk te verlagen.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="kern-checkin"
            icon={<ClipboardCheck className="h-4 w-4" />}
            title="Checkin"
            tagline="Maandelijkse financiële check-in"
            color="var(--color-kern-700)"
            open={guideSection === 'kern-checkin'}
            onToggle={() => setGuideSection(guideSection === 'kern-checkin' ? null : 'kern-checkin')}
          >
            <div className="space-y-2">
              <GuideFeature title="Maandelijkse check-in">
                Een gestructureerd moment om je financiën te evalueren. Bekijk aandachtspunten, budget review en voortgang ten opzichte van vorige maand.
              </GuideFeature>
              <GuideFeature title="Gespreksstarters">
                Will bereidt contextbewuste gespreksonderwerpen voor op basis van je recente financiële veranderingen — ideaal als startpunt voor reflectie.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="kern-overig"
            icon={<MoreHorizontal className="h-4 w-4" />}
            title="Overig"
            tagline="Toekomstige Kern-features"
            color="var(--color-kern-700)"
            open={guideSection === 'kern-overig'}
            onToggle={() => setGuideSection(guideSection === 'kern-overig' ? null : 'kern-overig')}
          >
            <div className="space-y-2">
              <GuideFeature title="Binnenkort meer">
                Hier komen toekomstige uitbreidingen van De Kern — nieuwe inzichten, koppelingen en analyses rondom je financiële fundament.
              </GuideFeature>
            </div>
          </GuideAccordion>
        </div>
      </div>

      {/* ── De Wil ── */}
      <div id="guide-wil" className="mb-6 scroll-mt-24">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-wil-500" />
          <p className="label-editorial text-wil-600">De Wil</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <GuideAccordion
            id="wil-widgets"
            icon={<LayoutDashboard className="h-4 w-4" />}
            title="Widgets overzicht"
            tagline="Dashboard aanpassen en herschikken"
            color="var(--color-wil-700)"
            open={guideSection === 'wil-widgets'}
            onToggle={() => setGuideSection(guideSection === 'wil-widgets' ? null : 'wil-widgets')}
          >
            <div className="space-y-2">
              <GuideFeature title="Widget-grid">
                Je dashboard bestaat uit aanpasbare widgets — compacte inzichtkaarten die je financiële situatie samenvatten. Er zijn meer dan 25 widgets beschikbaar.
              </GuideFeature>
              <GuideFeature title="Aanpassen en herschikken">
                Voeg widgets toe, verwijder ze of sleep ze naar een andere positie. Beheer je widgetvoorkeuren via Identiteit → Instellingen → Widgets.
              </GuideFeature>
              <GuideFeature title="Jouw Pad">
                Een speciale widget die je soevereiniteitsniveau toont — van Herstel tot Meesterschap. Naarmate je financiële gezondheid groeit, ontgrendel je automatisch nieuwe functies.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="wil-briefing"
            icon={<Newspaper className="h-4 w-4" />}
            title="Briefing"
            tagline="Dagelijkse AI-samenvatting"
            color="var(--color-wil-700)"
            open={guideSection === 'wil-briefing'}
            onToggle={() => setGuideSection(guideSection === 'wil-briefing' ? null : 'wil-briefing')}
          >
            <div className="space-y-2">
              <GuideFeature title="Dagelijkse briefing">
                Elke dag genereert Will een persoonlijke briefing op basis van je financiële data — veranderingen, aandachtspunten en motivatie in één overzicht.
              </GuideFeature>
              <GuideFeature title="Briefingkaarten">
                De briefing bestaat uit kaarten per onderwerp: vermogensupdate, budgetcheck, marktnieuws en actiepunten. Alles afgestemd op jouw situatie.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="wil-voorstellen"
            icon={<Sparkles className="h-4 w-4" />}
            title="Voorstellen"
            tagline="AI-aanbevelingen met vrijheidstijd-impact"
            color="var(--color-wil-700)"
            open={guideSection === 'wil-voorstellen'}
            onToggle={() => setGuideSection(guideSection === 'wil-voorstellen' ? null : 'wil-voorstellen')}
          >
            <div className="space-y-2">
              <GuideFeature title="Vijf soorten aanbevelingen">
                Bespaartips, schuld-optimalisatie, beleggingskansen, inkomensmogelijkheden en gedragsaanpassingen. Elke aanbeveling toont de geschatte vrijheidsdagen-impact.
              </GuideFeature>
              <GuideFeature title="Accepteren, uitstellen of afwijzen">
                Kies wat je met een voorstel doet. Accepteren maakt er een actie van. Uitstellen bewaart het voor later. Afwijzen verwijdert het van je lijst.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="wil-acties"
            icon={<Zap className="h-4 w-4" />}
            title="Acties"
            tagline="Kanban-bord voor financiële stappen"
            color="var(--color-wil-700)"
            open={guideSection === 'wil-acties'}
            onToggle={() => setGuideSection(guideSection === 'wil-acties' ? null : 'wil-acties')}
          >
            <div className="space-y-2">
              <GuideFeature title="Actiebord">
                Je persoonlijke kanban-bord met drie kolommen: open, uitgesteld en voltooid. Sleep acties tussen kolommen of markeer ze als afgerond.
              </GuideFeature>
              <GuideFeature title="Vrijheidsdagen winnen">
                Elke voltooide actie levert vrijheidsdagen op. Rond ze af om je FIRE-datum dichterbij te brengen en je voortgang tastbaar te maken.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="wil-doelen"
            icon={<Target className="h-4 w-4" />}
            title="Doelen"
            tagline="Spaardoelen en voortgang"
            color="var(--color-wil-700)"
            open={guideSection === 'wil-doelen'}
            onToggle={() => setGuideSection(guideSection === 'wil-doelen' ? null : 'wil-doelen')}
          >
            <div className="space-y-2">
              <GuideFeature title="Spaardoelen instellen">
                Maak doelen aan voor vakantie, noodfonds, grote aankoop of iets anders. Koppel ze aan een asset of schuld om automatisch voortgang bij te houden.
              </GuideFeature>
              <GuideFeature title="Voortgang volgen">
                Zie per doel hoeveel je al gespaard hebt, hoeveel je nog nodig hebt en hoeveel vrijheidsdagen het doel je kost of oplevert.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="wil-abonnementen"
            icon={<RefreshCw className="h-4 w-4" />}
            title="Abonnementen"
            tagline="Terugkerende kosten en opzegadvies"
            color="var(--color-wil-700)"
            open={guideSection === 'wil-abonnementen'}
            onToggle={() => setGuideSection(guideSection === 'wil-abonnementen' ? null : 'wil-abonnementen')}
          >
            <div className="space-y-2">
              <GuideFeature title="Terugkerende kosten">
                TriFinity detecteert automatisch terugkerende uitgaven in je transacties — abonnementen, lidmaatschappen en vaste lasten die stilletjes vrijheidstijd kosten.
              </GuideFeature>
              <GuideFeature title="Opzegadvies">
                Krijg inzicht in welke abonnementen je het minst gebruikt en hoeveel vrijheidsdagen je zou winnen door ze op te zeggen.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="wil-overig"
            icon={<MoreHorizontal className="h-4 w-4" />}
            title="Overig"
            tagline="Toekomstige Wil-features"
            color="var(--color-wil-700)"
            open={guideSection === 'wil-overig'}
            onToggle={() => setGuideSection(guideSection === 'wil-overig' ? null : 'wil-overig')}
          >
            <div className="space-y-2">
              <GuideFeature title="Binnenkort meer">
                Hier komen toekomstige uitbreidingen van De Wil — nieuwe manieren om actie te ondernemen en je financiële vrijheid te versnellen.
              </GuideFeature>
            </div>
          </GuideAccordion>
        </div>
      </div>

      {/* ── De Horizon ── */}
      <div id="guide-horizon" className="mb-6 scroll-mt-24">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-horizon-500" />
          <p className="label-editorial text-horizon-600">De Horizon</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <GuideAccordion
            id="horizon-grafiek"
            icon={<LineChart className="h-4 w-4" />}
            title="Netto vermogen grafiek met levensgebeurtenissen"
            tagline="FIRE-projectie, scenario's en Monte Carlo"
            color="var(--color-horizon-700)"
            open={guideSection === 'horizon-grafiek'}
            onToggle={() => setGuideSection(guideSection === 'horizon-grafiek' ? null : 'horizon-grafiek')}
          >
            <div className="space-y-2">
              <GuideFeature title="FIRE-projectie">
                Je persoonlijke berekening: wanneer dekt je vermogen je uitgaven? Met pessimistisch, verwacht en optimistisch scenario. Zie je verwachte FIRE-leeftijd en het vermogenspad over 30 jaar.
              </GuideFeature>
              <GuideFeature title="Levensgebeurtenissen">
                Voeg toekomstige gebeurtenissen toe — kinderen, verhuizing, pensioen, erfenis. Elk event verschuift je FIRE-datum. Kies uit een catalogus of maak eigen events.
              </GuideFeature>
              <GuideFeature title="Scenario's vergelijken">
                Drie scenario&apos;s — drifter, koershouder en optimizer — laten zien hoe verschillende levensstijlen je vrijheidsdatum beïnvloeden.
              </GuideFeature>
              <GuideFeature title="Monte Carlo simulatie">
                1.000 willekeurige marktscenario&apos;s tonen hoe robuust je plan is. Je backtestscore geeft het slagingspercentage: het aandeel scenario&apos;s waarin je FIRE-plan standhoudt.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="horizon-droomscenario"
            icon={<MessageSquare className="h-4 w-4" />}
            title="Droomscenario"
            tagline="What-If builder en AI-chat"
            color="var(--color-horizon-700)"
            open={guideSection === 'horizon-droomscenario'}
            onToggle={() => setGuideSection(guideSection === 'horizon-droomscenario' ? null : 'horizon-droomscenario')}
          >
            <div className="space-y-2">
              <GuideFeature title="What-If builder">
                Experimenteer met alternatieve toekomsten via vijf schuifbalken en snelpresets. Zie direct het effect op je FIRE-datum en vermogenspad.
              </GuideFeature>
              <GuideFeature title="AI-chat met Will">
                Beschrijf je dromen aan Will — hij vertaalt ze naar concrete levensgebeurtenissen met FIRE-impact. Vraag om een reality-check of verken scenario&apos;s in gesprek.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="horizon-onttrekking"
            icon={<ArrowDownToLine className="h-4 w-4" />}
            title="Onttrekkingsstrategie"
            tagline="Hoe je vermogen opneemt na FIRE"
            color="var(--color-horizon-700)"
            open={guideSection === 'horizon-onttrekking'}
            onToggle={() => setGuideSection(guideSection === 'horizon-onttrekking' ? null : 'horizon-onttrekking')}
          >
            <div className="space-y-2">
              <GuideFeature title="Strategieën">
                Kies uit vier onttrekkingsmethoden: de klassieke 4%-regel, dynamische onttrekking, vloer-plafondmethode of bucket-strategie. Elk past bij een ander risicoprofiel.
              </GuideFeature>
              <GuideFeature title="Simulatie">
                Zie hoe lang je vermogen meegaat bij elke strategie en hoeveel flexibiliteit je hebt in slechte marktjaren.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="horizon-overig"
            icon={<MoreHorizontal className="h-4 w-4" />}
            title="Overig"
            tagline="Toekomstige Horizon-features"
            color="var(--color-horizon-700)"
            open={guideSection === 'horizon-overig'}
            onToggle={() => setGuideSection(guideSection === 'horizon-overig' ? null : 'horizon-overig')}
          >
            <div className="space-y-2">
              <GuideFeature title="Binnenkort meer">
                Hier komen toekomstige uitbreidingen van De Horizon — nieuwe simulaties, projecties en tools om je toekomst te verkennen.
              </GuideFeature>
            </div>
          </GuideAccordion>
        </div>
      </div>

      {/* ── Algemeen ── */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-[var(--ink-3)]" />
          <p className="label-editorial text-[var(--ink-2)]">Algemeen</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <GuideAccordion
            id="alg-vrijheid"
            icon={<Clock className="h-4 w-4" />}
            title="Vrijheidsinsteek"
            tagline="De filosofie achter TriFinity"
            color="var(--ink-2)"
            open={guideSection === 'alg-vrijheid'}
            onToggle={() => setGuideSection(guideSection === 'alg-vrijheid' ? null : 'alg-vrijheid')}
          >
            <div className="space-y-2">
              <GuideFeature title="Geld is opgeslagen tijd">
                Elke euro die je verdient, spaart of uitgeeft vertegenwoordigt een stukje levenstijd. TriFinity vertaalt al je financiële gegevens naar vrijheidstijd.
              </GuideFeature>
              <GuideFeature title="Vrijheidsdagen en vrijheidsgetal">
                Je vrijheidsgetal is het aantal dagen dat je kunt leven zonder te werken. Het vrijheidspercentage toont hoe dicht je bij volledige financiële onafhankelijkheid bent.
              </GuideFeature>
              <GuideFeature title="Bedragen vertalen naar tijd">
                Elk bedrag boven €100 toont automatisch het equivalent in vrijheidstijd. Zo wordt elke financiële beslissing een bewuste keuze over je levenstijd.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="alg-post"
            icon={<Newspaper className="h-4 w-4" />}
            title="TriFinity Post"
            tagline="AI-nieuwsfeed met persoonlijke context"
            color="var(--ink-2)"
            open={guideSection === 'alg-post'}
            onToggle={() => setGuideSection(guideSection === 'alg-post' ? null : 'alg-post')}
          >
            <div className="space-y-2">
              <GuideFeature title="Gepersonaliseerd financieel nieuws">
                Will selecteert financieel nieuws dat relevant is voor jouw situatie en vertaalt het naar persoonlijke impact en vrijheidstijd.
              </GuideFeature>
              <GuideFeature title="Context-aware analyse">
                Elk nieuwsitem bevat een analyse van wat het voor jou betekent — op basis van je vermogen, beleggingen en FIRE-plan.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideTopicCard
            icon={Sparkles}
            title="DAIshboard / Briefing"
            color="var(--ink-2)"
            description={
              <>
                Schakel over naar de DAIshboard-modus en je dashboard transformeert in een AI-samengestelde briefing. Will analyseert je financiële data en componeert een persoonlijk overzicht met tot 23 verschillende kaarttypes: metrics, sparklines, mijlpalen, inzichten, checklists, vergelijkingen, doelvoortgang, budgetbalken en meer. De briefing wordt progressief geladen — kaarten verschijnen zodra ze klaar zijn.
                {' '}
                Elke briefing is tijdsbewust: &apos;s ochtends focus op de dag, aan het einde van de maand op je maandresultaat. De briefing onthoudt wat je eerder hebt gezien en varieert de inhoud. Na 24 uur verschijnt een stale-banner zodat je weet dat de data niet meer actueel is.
              </>
            }
            howTo={{
              steps: [
                'Op je dashboard: wissel naar DAIshboard-modus via de toggle bovenaan',
                'De briefing genereert automatisch — kaarten verschijnen progressief',
                'Scroll door je persoonlijke briefing en tik op kaarten voor meer detail',
              ],
              tip: 'Check je briefing elke ochtend als financiële routine — het kost 30 seconden en houdt je scherp.',
            }}
          />

          <GuideAccordion
            id="alg-will"
            icon={<MessageSquare className="h-4 w-4" />}
            title="Will"
            tagline="Je persoonlijke financiële assistent"
            color="var(--ink-2)"
            open={guideSection === 'alg-will'}
            onToggle={() => setGuideSection(guideSection === 'alg-will' ? null : 'alg-will')}
          >
            <div className="space-y-2">
              <GuideFeature title="Drie persoonlijkheden">
                Will past zich aan per module: FHIN (De Kern) analyseert je data, FINN (De Wil) zet je aan tot actie en FFIN (De Horizon) helpt je dromen en plannen.
              </GuideFeature>
              <GuideFeature title="Context-aware per pagina">
                Will weet altijd waar je bent en welke data relevant is. Open de chat rechtsonder op elke pagina voor hulp die past bij wat je aan het doen bent.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideTopicCard
            icon={RefreshCw}
            title="Check-in"
            color="var(--ink-2)"
            description={
              <>
                Eén keer per maand neem je 10 minuten voor je financiële gezondheid. De check-in is een 7-stappen wizard: terugblik op vorige maand (vermogenswijziging, inkomsten, uitgaven, gewonnen vrijheidsdagen), bezittingen bijwerken, schulden bijwerken, doelen checken, budgetten evalueren, vooruitblik op komende maand, en een moment voor reflectie met vrije notities.
                {' '}
                Will bereidt gespreksstarters voor op basis van je recente financiële veranderingen — ideaal als startpunt voor reflectie of een gesprek met je partner. Je kunt eerdere check-ins terugbladeren om je groei over maanden te zien.
              </>
            }
            howTo={{
              steps: [
                'Ga naar De Kern → Check-in (of volg de herinnering in je meldingen)',
                'Stap 1: Bekijk de terugblik — vergelijk vorige maand met nu',
                'Stap 2-5: Werk bezittingen, schulden, doelen en budgetten bij',
                'Stap 6: Bekijk de vooruitblik met komende rekeningen en events',
                'Stap 7: Schrijf een korte reflectie — wat ging goed, wat kan beter?',
              ],
              tip: 'Plan je check-in op een vaste dag (bijv. de eerste zondag van de maand). Routine maakt het moeiteloos.',
            }}
          />

          <GuideAccordion
            id="alg-huishouden"
            icon={<Users className="h-4 w-4" />}
            title="Huishouden / partner"
            tagline="Gedeeld financieel beheer"
            color="var(--ink-2)"
            open={guideSection === 'alg-huishouden'}
            onToggle={() => setGuideSection(guideSection === 'alg-huishouden' ? null : 'alg-huishouden')}
          >
            <div className="space-y-2">
              <GuideFeature title="Partner uitnodigen">
                Nodig je partner uit voor een gedeeld huishouden. Beheer samen je financiën met respect voor individuele privacy.
              </GuideFeature>
              <GuideFeature title="Kostenverdeling en perspectief">
                Verdeel kosten, vergelijk individuele bijdragen en wissel van perspectief tussen persoonlijk en huishouden.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="alg-profiel"
            icon={<User className="h-4 w-4" />}
            title="Profiel instellingen"
            tagline="Persoonlijke gegevens en soevereiniteit"
            color="var(--ink-2)"
            open={guideSection === 'alg-profiel'}
            onToggle={() => setGuideSection(guideSection === 'alg-profiel' ? null : 'alg-profiel')}
          >
            <div className="space-y-2">
              <GuideFeature title="Persoonlijke gegevens">
                Je naam, geboortedatum, inkomen en huishoudprofiel. Deze gegevens vormen de basis voor alle berekeningen.
              </GuideFeature>
              <GuideFeature title="Soevereiniteitsniveaus">
                Van Herstel tot Meesterschap — je niveau wordt automatisch berekend op basis van je financiële gezondheid en ontgrendelt progressief nieuwe functies.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="alg-instellingen"
            icon={<Settings className="h-4 w-4" />}
            title="App instellingen"
            tagline="Widgets, FIRE-parameters en weergave"
            color="var(--ink-2)"
            open={guideSection === 'alg-instellingen'}
            onToggle={() => setGuideSection(guideSection === 'alg-instellingen' ? null : 'alg-instellingen')}
          >
            <div className="space-y-2">
              <GuideFeature title="Widgets beheer">
                Kies welke widgets je op je dashboard wilt zien en in welke volgorde. Meer dan 25 widgets beschikbaar.
              </GuideFeature>
              <GuideFeature title="FIRE-parameters">
                Stel je verwacht rendement en inflatiepercentage in. Deze parameters beïnvloeden al je FIRE-berekeningen en projecties.
              </GuideFeature>
              <GuideFeature title="Weergave en data">
                Pas de weergave aan, exporteer je data en beheer je notificatievoorkeuren.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideTopicCard
            icon={Bell}
            title="Meldingen"
            color="var(--ink-2)"
            description={
              <>
                TriFinity stuurt je meldingen wanneer het ertoe doet: budgetgrenzen die naderen, ongebruikelijke transacties, vermogensmijlpalen die je bereikt, level-ups in je soevereiniteit, en aanbevelingen die klaarstaan. Urgente alerts verschijnen bovenaan, dagelijkse meldingen daaronder, en eerdere meldingen zijn per dag terug te bladeren. Per type kun je meldingen aan of uitzetten.
              </>
            }
            howTo={{
              steps: [
                'Meldingen verschijnen via het bel-icoon in de navigatiebalk',
                'Tik op een melding om naar het relevante onderdeel te gaan',
                'Beheer je meldingsvoorkeuren via Identiteit → Instellingen → Notificaties',
              ],
              tip: 'Laat budgetalerts en mijlpalen aan staan — ze houden je gemotiveerd zonder overweldigd te raken.',
            }}
          />

          <GuideAccordion
            id="alg-rapporten"
            icon={<FileText className="h-4 w-4" />}
            title="Rapporten"
            tagline="Balans, budget en jaaroverzicht"
            color="var(--ink-2)"
            open={guideSection === 'alg-rapporten'}
            onToggle={() => setGuideSection(guideSection === 'alg-rapporten' ? null : 'alg-rapporten')}
          >
            <div className="space-y-2">
              <GuideFeature title="Balansrapport">
                Een overzicht van al je bezittingen en schulden op een peildatum — je persoonlijke balans in vrijheidstijd.
              </GuideFeature>
              <GuideFeature title="Budgetrapport en jaaroverzicht">
                Gedetailleerde rapportages van je uitgaven per categorie en een jaarlijks totaaloverzicht met trends en hoogtepunten.
              </GuideFeature>
            </div>
          </GuideAccordion>

          <GuideAccordion
            id="alg-mobiel"
            icon={<Smartphone className="h-4 w-4" />}
            title="Mobiel"
            tagline="App-ervaring op je telefoon"
            color="var(--ink-2)"
            open={guideSection === 'alg-mobiel'}
            onToggle={() => setGuideSection(guideSection === 'alg-mobiel' ? null : 'alg-mobiel')}
          >
            <div className="space-y-2">
              <GuideFeature title="Mobiele navigatie">
                Op mobiel gebruik je de bottom navigation om snel tussen modules te wisselen. Alle touch targets zijn minimaal 44px voor comfortabel gebruik.
              </GuideFeature>
              <GuideFeature title="Responsive ervaring">
                Alle pagina&apos;s en modals zijn geoptimaliseerd voor kleine schermen. BottomSheets schuiven van onderen omhoog en kunnen worden weggeveegd.
              </GuideFeature>
            </div>
          </GuideAccordion>
        </div>
      </div>

      {/* Veelgestelde vragen */}
      <GuideFaq />

      {/* Ontdekken sectie */}
      <OntdekkenSection />

      {/* Pro tips carrousel */}
      <GuideProTips />
    </div>
  )
}
