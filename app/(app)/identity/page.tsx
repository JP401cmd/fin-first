'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { computeSovereigntyLevel, PHASES, levelToPhaseId } from '@/lib/feature-phases'
import { NL_SWR, ageAtDate } from '@/lib/horizon-data'
import { ChevronRight, ChevronDown, LayoutDashboard, Landmark, Zap, Compass, BookOpen, MessageSquare } from 'lucide-react'
import {
  temporalLevels,
  chronologyPhases,
  chronologyLevels,
  phaseColors,
  levelCriteriaMap,
  featureIcons,
  getFeaturesPerPhase,
} from '@/lib/identity-constants'

/* ── Helper components for user guide ─────────────────────── */

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
    <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]" data-testid={`guide-${id}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--subtle)]/60"
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)]"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
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

function GuideItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--ink-3)]" />
      <span>{children}</span>
    </li>
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

export default function IdentityPage() {
  const router = useRouter()
  const supabase = createClient()

  // Profile state (minimal for overview)
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null)
  const [householdType, setHouseholdType] = useState('solo')
  const [temporalBalance, setTemporalBalance] = useState(3)

  // Financial state for sovereignty level
  const [sovereigntyLevel, setSovereigntyLevel] = useState(0)
  const [financialData, setFinancialData] = useState({ netWorth: 0, monthsCovered: 0, freedomPct: 0, hasConsumerDebt: false })

  // Feature roadmap
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null)
  const featuresPerPhase = getFeaturesPerPhase()


  // Demo user state
  const [isDemoUser, setIsDemoUser] = useState(false)
  const [showSwitchDialog, setShowSwitchDialog] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideSection, setGuideSection] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, household_type, temporal_balance, is_demo_user, date_of_birth')
        .eq('id', user.id)
        .single()

      if (profile) {
        setFullName(profile.full_name ?? '')
        setHouseholdType(profile.household_type ?? 'solo')
        setTemporalBalance(profile.temporal_balance ?? 3)
        setIsDemoUser(profile.is_demo_user ?? false)
        setDateOfBirth(profile.date_of_birth ?? null)
      }

      // Financial data for sovereignty level
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const dateStr = threeMonthsAgo.toISOString().split('T')[0]

      const [assetsRes, debtsRes, txRes] = await Promise.all([
        supabase.from('assets').select('current_value').eq('is_active', true),
        supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
        supabase.from('transactions').select('amount, is_income').gte('date', dateStr),
      ])

      const totalAssets = (assetsRes.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
      const debts = debtsRes.data ?? []
      const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance), 0)
      const netWorth = totalAssets - totalDebts

      const expenses = (txRes.data ?? [])
        .filter(t => !t.is_income)
        .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
      const months = Math.max(1, 3)
      const monthlyExpenses = expenses / months
      const monthsCovered = monthlyExpenses > 0 ? netWorth / monthlyExpenses : 0

      const yearlyExpenses = monthlyExpenses * 12
      const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0
      const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0

      const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
      const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)

      setSovereigntyLevel(computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt))
      setFinancialData({ netWorth, monthsCovered, freedomPct, hasConsumerDebt })

      setLoading(false)
    }
    loadData()
  }, [supabase])

  // Save temporal balance immediately on change
  const updateTemporalBalance = useCallback(async (value: number) => {
    setTemporalBalance(value)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        temporal_balance: value,
        updated_at: new Date().toISOString(),
      })
  }, [supabase])

  const activeLevel = temporalLevels[temporalBalance - 1]

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
        </div>
      </div>
    )
  }

  const householdLabel = householdType === 'solo' ? 'Solo' : householdType === 'samen' ? 'Samen' : 'Gezin'
  const age = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const initials = fullName
    ? fullName.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '?'

  // Sovereignty level label
  const levelLabel = sovereigntyLevel <= 0
    ? 'Herstel'
    : sovereigntyLevel <= 2
    ? `Niveau ${sovereigntyLevel}: Stabiliteit`
    : sovereigntyLevel <= 4
    ? `Niveau ${sovereigntyLevel}: Momentum`
    : `Niveau ${sovereigntyLevel}: Meesterschap`

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Page header */}
      <div className="mb-5 sm:mb-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Persoonlijk profiel</p>
        <h1 className="font-display text-[32px] font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.03em' }}>
          Identiteit &amp; Vrijheidspad
        </h1>
        <p className="mt-1 font-serif italic text-[13px] text-[var(--ink-3)]">
          Wie ben je en hoe sta je in het leven? Jouw positie op de reis naar vrijheid.
        </p>
      </div>

      {/* ── Demo user banner ──────────────────────────────────────── */}
      {isDemoUser && (
        <section className="mb-3 sm:mb-6 rounded-[var(--r-lg)] border-2 border-wil-200 bg-wil-50/50 p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wil-100">
              <svg className="h-5 w-5 text-wil-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-wil-800">
                Je verkent de app met voorbeelddata
              </h3>
              <p className="mt-1 text-sm text-wil-700">
                Klaar om je eigen gegevens in te voeren? Je demo data wordt gewist en je doorloopt de onboarding met je eigen informatie.
              </p>
              <button
                onClick={() => setShowSwitchDialog(true)}
                disabled={switching}
                className="mt-3 rounded-lg bg-wil-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:opacity-50"
              >
                {switching ? 'Bezig...' : 'Eigen data invoeren'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Switch from demo dialog */}
      {showSwitchDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Overstappen naar eigen data?</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Alle demo data wordt gewist. Je doorloopt de onboarding opnieuw met je eigen informatie.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowSwitchDialog(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  setShowSwitchDialog(false)
                  setSwitching(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setSwitching(false)
                    setSwitchError('Overstappen mislukt. Probeer opnieuw.')
                  }
                }}
                className="rounded-lg bg-wil-600 px-4 py-2 text-sm font-medium text-white hover:bg-wil-700 transition-colors"
              >
                Overstappen
              </button>
            </div>
          </div>
        </div>
      )}

      {switchError && (
        <p className="mb-4 text-sm text-red-600">{switchError}</p>
      )}

      {/* ── Profielsamenvatting strip ─────────────────────────────── */}
      <Link href="/identity/profiel" className="group mb-5 sm:mb-8 block card-editorial p-4 transition-all hover:border-wil-300 hover:shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Avatar initiaal cirkel */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-sm font-semibold text-[var(--paper)]">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {fullName || 'Geen naam'}
                {age !== null && <span className="ml-1.5 font-normal text-[var(--ink-3)]">&middot; {age} jaar</span>}
                <span className="ml-1.5 font-normal text-[var(--ink-3)]">&middot; {householdLabel}</span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">{levelLabel}</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
        </div>
      </Link>

      {/* ── Zo werkt TriFinity — gebruikersinstructies ──────────── */}
      <section className="mb-5 sm:mb-8 card-editorial overflow-hidden">
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          className="flex w-full items-center justify-between p-4 sm:p-8 text-left transition-colors hover:bg-[var(--subtle)]/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] border border-[var(--border-ed)]">
              <BookOpen className="h-4 w-4 text-[var(--ink-2)]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.02em' }}>
                Zo werkt TriFinity
              </h2>
              <p className="text-[12px] text-[var(--ink-3)]">Rondleiding door de app</p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${guideOpen ? 'rotate-180' : ''}`} />
        </button>

        {guideOpen && (
          <div className="border-t border-[var(--border-ed)] px-4 pb-5 pt-4 sm:px-8 sm:pb-8">
            {/* Filosofie */}
            <div className="mb-5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4">
              <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
                &ldquo;Geld is opgeslagen tijd.&rdquo; Elke euro die je verdient, spaart of uitgeeft
                vertegenwoordigt een stukje van je levenstijd. TriFinity vertaalt al je financiële
                gegevens naar <strong className="font-semibold text-[var(--ink)]">vrijheidstijd</strong> —
                dagen, maanden en jaren dat je niet hoeft te werken.
              </p>
            </div>

            {/* Kernbegrippen — snelle rij */}
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Vrijheidsdagen', desc: 'Dagen die je vermogen dekt' },
                { label: 'Kassabon', desc: 'Tik op een getal → zie hoe het berekend is' },
                { label: 'Soevereiniteit', desc: 'Je niveau op de reis naar vrijheid' },
                { label: 'FIRE', desc: 'Het moment dat werken optioneel wordt' },
              ].map((item) => (
                <div key={item.label} className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-2.5">
                  <p className="text-[11px] font-semibold text-[var(--ink)]">{item.label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-3)]">{item.desc}</p>
                </div>
              ))}
            </div>

            <p className="label-editorial text-[var(--ink-3)] mb-3">De onderdelen</p>

            {/* Onderdelen — accordion */}
            <div className="space-y-2">
              {/* Dashboard */}
              <GuideAccordion
                id="dashboard"
                icon={<LayoutDashboard className="h-4 w-4" />}
                title="Dashboard"
                tagline="Alles in één oogopslag"
                color="var(--ink-2)"
                open={guideSection === 'dashboard'}
                onToggle={() => setGuideSection(guideSection === 'dashboard' ? null : 'dashboard')}
              >
                <p className="mb-3 text-[12px] text-[var(--ink-3)]">
                  Je startpagina met een samenvatting van alle drie de modules.
                </p>
                <div className="space-y-2">
                  <GuideFeature title="Modulekaarten">
                    Drie kaarten bovenaan tonen de kernmetric van elke module — je financiële fundament, openstaande acties en je FIRE-countdown. Tik op een kaart om naar de module te gaan.
                  </GuideFeature>
                  <GuideFeature title="Widgets">
                    Onder de modulekaarten vind je aanpasbare widgets — compacte inzichtkaarten die je kunt toevoegen, verwijderen en herschikken. Er zijn meer dan 25 widgets beschikbaar. Beheer ze via Identiteit → Instellingen → Widgets.
                  </GuideFeature>
                  <GuideFeature title="Jouw Pad">
                    Een speciale widget die je soevereiniteitsniveau toont — van Herstel tot Meesterschap. Naarmate je financiële gezondheid groeit, ontgrendel je automatisch nieuwe functies.
                  </GuideFeature>
                </div>
              </GuideAccordion>

              {/* De Kern */}
              <GuideAccordion
                id="kern"
                icon={<Landmark className="h-4 w-4" />}
                title="De Kern"
                tagline="Je financiële fundament"
                color="var(--kern-t, #58362d)"
                open={guideSection === 'kern'}
                onToggle={() => setGuideSection(guideSection === 'kern' ? null : 'kern')}
              >
                <p className="mb-3 text-[12px] text-[var(--ink-3)]">
                  Hier staat alles wat je hebt en wat er binnenkomt en uitgaat — vertaald naar vrijheidstijd.
                </p>
                <div className="space-y-2">
                  <GuideFeature title="Overzicht">
                    Je netto vermogen, vrijheidspercentage, spaarquote en FIRE-bedrag in één oogopslag. Elk getal is klikbaar — tik erop voor een kassabon met de volledige berekening.
                  </GuideFeature>
                  <GuideFeature title="Budgetten">
                    Stel maandbudgetten in per categorie en volg je uitgaven in realtime. Vier weergaven: boom (hiërarchisch), organisme (blob), stroom (Sankey) en ring (donut). Niet-uitgegeven budget rolt automatisch door naar de volgende maand.
                  </GuideFeature>
                  <GuideFeature title="Kas">
                    Al je transacties en bankrekeningen op één plek. Importeer bankbestanden (MT940, CSV, OFX) of koppel je bank. TriFinity herkent automatisch terugkerende transacties en stelt categorieregels voor.
                  </GuideFeature>
                  <GuideFeature title="Bezittingen">
                    Vastgoed, beleggingen, crypto, spaargeld en pensioen bijhouden met waardehistorie en groeiprojecties. Duik dieper in individuele holdings met dagkoersen en dividendhistorie.
                  </GuideFeature>
                  <GuideFeature title="Schulden">
                    Overzicht van leningen met aflosstrategieën: sneeuwbal (kleinste schuld eerst), lawine (hoogste rente eerst) of extra aflossing. Schulden worden geframed als vrijheid die je terugkoopt.
                  </GuideFeature>
                  <GuideFeature title="Belasting">
                    Automatische Box 3 berekening op basis van je bezittingen en schulden. Vergelijk belastingjaren, simuleer fiscaal partnerschap en ontvang optimalisatietips.
                  </GuideFeature>
                </div>
              </GuideAccordion>

              {/* De Wil */}
              <GuideAccordion
                id="wil"
                icon={<Zap className="h-4 w-4" />}
                title="De Wil"
                tagline="Wat je nu kunt doen"
                color="var(--will-t, #2e2437)"
                open={guideSection === 'wil'}
                onToggle={() => setGuideSection(guideSection === 'wil' ? null : 'wil')}
              >
                <p className="mb-3 text-[12px] text-[var(--ink-3)]">
                  De module die je financiën omzet in concrete acties. Elke voltooide actie levert vrijheidsdagen op.
                </p>
                <div className="space-y-2">
                  <GuideFeature title="Aanbevelingen">
                    Will analyseert je situatie en genereert persoonlijke suggesties — van budgetoptimalisatie tot schuldversnelling. Elke aanbeveling toont het verwachte effect in vrijheidsdagen. Accepteer, stel uit of wijs af.
                  </GuideFeature>
                  <GuideFeature title="Acties">
                    Concrete stappen die je kunt uitvoeren. Komen uit aanbevelingen, of maak ze zelf aan. Vink een actie af en je vrijheidsdagenteller gaat omhoog. Bij abonnement-acties krijg je een voorgevulde opzegbrief.
                  </GuideFeature>
                  <GuideFeature title="Doelen">
                    Vier soorten: spaardoel, schuld aflossen, netto vermogen laten groeien of vrijheidsdagen opbouwen. Koppel een doel aan een bezitting of schuld voor automatische voortgang.
                  </GuideFeature>
                  <GuideFeature title="Abonnementen">
                    Automatisch gedetecteerde terugkerende kosten uit je transactiehistorie. Vraag Will om advies — hij beoordeelt elk abonnement op nut en overlap, en stelt opzegacties voor.
                  </GuideFeature>
                  <GuideFeature title="NIBUD Benchmark">
                    Vergelijk je uitgaven per categorie met de NIBUD-richtlijnen. Zie of je boven of onder de norm zit en hoeveel vrijheidsdagen je zou winnen bij NIBUD-niveau.
                  </GuideFeature>
                </div>
              </GuideAccordion>

              {/* De Horizon */}
              <GuideAccordion
                id="horizon"
                icon={<Compass className="h-4 w-4" />}
                title="De Horizon"
                tagline="Je pad naar vrijheid"
                color="var(--hor-t, #8a6e42)"
                open={guideSection === 'horizon'}
                onToggle={() => setGuideSection(guideSection === 'horizon' ? null : 'horizon')}
              >
                <p className="mb-3 text-[12px] text-[var(--ink-3)]">
                  Kijk verder dan vandaag — wanneer wordt werken optioneel?
                </p>
                <div className="space-y-2">
                  <GuideFeature title="FIRE Countdown">
                    Je vrijheidsleeftijd, doelbedrag, opnamerate en aftelling in dagen. Gebaseerd op je echte data — inkomen, uitgaven, vermogen en rendement.
                  </GuideFeature>
                  <GuideFeature title="Vermogenspad">
                    Interactieve grafiek van je vermogensgroei tot aan en voorbij je FIRE-datum. Schakel scenario-overlays in: drifter (lifestyle creep), huidige koers en optimizer.
                  </GuideFeature>
                  <GuideFeature title="Levensgebeurtenissen">
                    Voeg AOW, pensioen, kinderen, een huis of sabbatical toe en zie direct het effect op je FIRE-datum. Elke gebeurtenis verschijnt als marker op je vermogensgrafiek.
                  </GuideFeature>
                  <GuideFeature title="Simulaties &amp; Backtesting">
                    Monte Carlo analyse draait 1.000 simulaties met willekeurige rendementen. Backtesting toetst je plan aan alle 30-jaarsperiodes sinds 1970.
                  </GuideFeature>
                  <GuideFeature title="Onttrekkingsstrategie">
                    Vergelijk vier opnamestrategieën na FIRE: klassiek 4%, variabel, Guyton-Klinger guardrails en het bucket-model met drie emmers.
                  </GuideFeature>
                  <GuideFeature title="Wat-als Planner">
                    Experimenteer met alternatieve toekomsten via vijf schuifbalken en snelpresets. Beschrijf je dromen aan Will — hij vertaalt ze naar concrete levensgebeurtenissen met FIRE-impact.
                  </GuideFeature>
                </div>
              </GuideAccordion>

              {/* Will — AI assistent */}
              <GuideAccordion
                id="will-assistent"
                icon={<MessageSquare className="h-4 w-4" />}
                title="Will"
                tagline="Je persoonlijke financiële assistent"
                color="var(--will-t, #2e2437)"
                open={guideSection === 'will-assistent'}
                onToggle={() => setGuideSection(guideSection === 'will-assistent' ? null : 'will-assistent')}
              >
                <p className="mb-3 text-[12px] text-[var(--ink-3)]">
                  Will is je enige begeleider in TriFinity — bereikbaar via de chatknop rechtsonder op elke pagina.
                </p>
                <div className="space-y-2">
                  <GuideFeature title="De spiegel">
                    &ldquo;Dit is waar je staat.&rdquo; Will geeft een eerlijk, feitelijk overzicht van je financiële situatie — zonder oordeel. Vraag naar je vermogen, spaarquote of vrijheidstijd.
                  </GuideFeature>
                  <GuideFeature title="De coach">
                    &ldquo;Dit is wat je kunt doen.&rdquo; Will stelt proactief concrete acties voor op basis van je data. Acties verschijnen als klikbare kaarten die je direct kunt inplannen.
                  </GuideFeature>
                  <GuideFeature title="De strateeg">
                    &ldquo;Dit is waar je naartoe gaat.&rdquo; Will rekent scenario&apos;s door en laat zien hoe keuzes van vandaag je toekomst veranderen.
                  </GuideFeature>
                </div>
              </GuideAccordion>
            </div>

            {/* Pro tips */}
            <div className="mt-5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4">
              <p className="label-editorial text-[var(--ink-3)] mb-2">Snelle tips</p>
              <ul className="space-y-1">
                {[
                  'Tik op elk bedrag om de kassabon te openen — een stapsgewijze berekening van het getal.',
                  'Bedragen boven €100 tonen ook het vrijheidstijd-equivalent in jaren, maanden of dagen.',
                  'Dashboard-widgets zijn aanpasbaar — schakel ze aan of uit via Identiteit → Instellingen.',
                  'Nieuwe features ontgrendelen automatisch als je soevereiniteitsniveau stijgt.',
                  'Stel Will een vraag via de chatknop rechtsonder — hij kent de context van je pagina.',
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
                    <span className="mt-0.5 shrink-0 text-[var(--ink-3)]">{i + 1}.</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* ── The Temporal Balance ──────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 card-editorial p-4 sm:p-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Temporeel evenwicht</p>
        <h2 className="font-display text-xl font-bold text-[var(--ink)] mb-1" style={{ letterSpacing: '-0.02em' }}>
          Hoeveel &lsquo;Nu&rsquo; ruil je in voor &lsquo;Later&rsquo;?
        </h2>
        <p className="mb-5 sm:mb-8 font-serif italic text-[13px] text-[var(--ink-3)]">
          Jouw persoonlijke balans tussen genieten van het heden en bouwen aan de toekomst.
        </p>

        {/* Slider */}
        <div className="mb-5 sm:mb-8">
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={temporalBalance}
            onChange={(e) => updateTemporalBalance(Number(e.target.value))}
            className="w-full cursor-pointer accent-[var(--ink)]"
          />
          <div className="mt-2 flex justify-between text-xs text-[var(--ink-3)]">
            {temporalLevels.map((l) => (
              <span
                key={l.level}
                className={temporalBalance === l.level ? 'font-semibold text-[var(--ink)]' : ''}
              >
                {l.icon}
              </span>
            ))}
          </div>
        </div>

        {/* Active level card */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-5">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{activeLevel.icon}</span>
            <div>
              <h3 className="font-display text-lg font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.02em' }}>
                {activeLevel.nameNl}
              </h3>
              <p className="text-xs label-editorial text-[var(--ink-3)] mt-0.5">{activeLevel.name}</p>
              <p className="mt-2 font-serif italic text-sm text-[var(--ink-2)] leading-relaxed border-l-2 border-[var(--border-md)] pl-3">
                &ldquo;{activeLevel.tagline}&rdquo;
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                {activeLevel.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Chronologische Schaal ─────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 card-editorial p-4 sm:p-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Vrijheidsreis</p>
        <h2 className="font-display text-xl font-bold text-[var(--ink)] mb-1" style={{ letterSpacing: '-0.02em' }}>
          Chronologische Schaal
        </h2>
        <p className="mb-5 sm:mb-6 font-serif italic text-[13px] text-[var(--ink-3)]">
          Elk niveau vertegenwoordigt een stap dichter bij volledige tijdsoevereiniteit.
        </p>

        {/* Progress overview bar */}
        <div className="mb-4 sm:mb-6 rounded-[var(--r-lg)] bg-[var(--subtle)] border border-[var(--border-ed)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-mono text-[var(--ink-3)]">Lvl {chronologyLevels[0].level}: {chronologyLevels[0].name}</span>
            <span className="text-[11px] font-mono text-[var(--ink-3)]">Lvl {chronologyLevels[chronologyLevels.length - 1].level}: {chronologyLevels[chronologyLevels.length - 1].name}</span>
          </div>
          <div className="relative h-[5px] w-full overflow-visible rounded-full bg-[var(--border-ed)]">
            {chronologyPhases.map((phase, pi) => {
              const levels = chronologyLevels.filter(l => l.phase === phase.phase)
              const startIdx = chronologyLevels.indexOf(levels[0])
              const endIdx = chronologyLevels.indexOf(levels[levels.length - 1])
              const step = chronologyLevels.length - 1
              const left = pi === 0 ? 0 : ((startIdx - 0.5) / step) * 100
              const right = pi === chronologyPhases.length - 1 ? 100 : ((endIdx + 0.5) / step) * 100
              const activeIdx = chronologyLevels.findIndex(l => l.level === sovereigntyLevel)
              const isReached = activeIdx >= startIdx
              const colors = phaseColors[phase.color]
              return (
                <div
                  key={pi}
                  className={`absolute top-0 h-full ${isReached ? colors.activeDot : 'bg-[var(--border-ed)]'}`}
                  style={{ left: `${left}%`, width: `${right - left}%`, opacity: isReached ? 1 : 0.4 }}
                />
              )
            })}
            {(() => {
              const idx = chronologyLevels.findIndex(l => l.level === sovereigntyLevel)
              const pct = idx >= 0 ? (idx / (chronologyLevels.length - 1)) * 100 : 0
              return (
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--paper)] bg-[var(--ink)] shadow-md"
                  style={{ left: `${pct}%` }}
                />
              )
            })()}
          </div>
          <div className="mt-2.5 flex justify-between">
            {chronologyPhases.map((phase) => {
              const colors = phaseColors[phase.color]
              return (
                <span key={phase.phase} style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }} className={colors.text}>
                  {phase.name}
                </span>
              )
            })}
          </div>
        </div>

        {/* Next milestone card */}
        {(() => {
          const nextLevel = chronologyLevels.find(l => l.level === sovereigntyLevel + 1)
          if (!nextLevel) return null
          const nextPhase = chronologyPhases.find(p => p.phase === nextLevel.phase)
          const colors = nextPhase ? phaseColors[nextPhase.color] : phaseColors.wil
          return (
            <div className={`mb-4 sm:mb-6 rounded-[var(--r-lg)] border p-4 ${colors.badge}`}>
              <p className="label-editorial mb-1">Volgende mijlpaal</p>
              <p className="font-display font-bold text-[var(--ink)]" style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>
                Niveau {nextLevel.level}: {nextLevel.name}
              </p>
              <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
                Focus: {nextLevel.focus} — {nextLevel.metaphor}
              </p>
            </div>
          )
        })()}

        <div className="space-y-2" data-testid="chronology-phases">
          {chronologyPhases.map((phase) => {
            const levels = chronologyLevels.filter((l) => l.phase === phase.phase)
            const colors = phaseColors[phase.color]
            const phaseId = PHASES[phase.phase - 1]?.id ?? ''
            const phaseFeatures = featuresPerPhase[phaseId] ?? []
            const currentPhaseId = levelToPhaseId(sovereigntyLevel)
            const currentPhaseIdx = PHASES.findIndex(p => p.id === currentPhaseId)
            const thisPhaseIdx = PHASES.findIndex(p => p.id === phaseId)
            const isPhaseUnlocked = thisPhaseIdx <= currentPhaseIdx
            const isPhaseExpanded = expandedPhase === phaseId

            return (
              <div key={phase.phase} data-testid={`phase-${phaseId}`}>
                {/* Phase header */}
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex rounded-[var(--r-sm)] border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${colors.badge}`}>
                    Fase {phase.phase}
                  </span>
                  <span className="text-sm font-semibold text-[var(--ink-2)]">{phase.name}</span>
                  <span className="text-xs text-[var(--ink-3)]">&mdash; {phase.subtitle}</span>
                </div>

                {/* Feature roadmap icons for this phase */}
                {phaseFeatures.length > 0 && (
                  <div className="mb-3 ml-3" data-testid={`feature-roadmap-${phaseId}`}>
                    <button
                      onClick={() => setExpandedPhase(isPhaseExpanded ? null : phaseId)}
                      className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
                      data-testid={`feature-roadmap-toggle-${phaseId}`}
                    >
                      <span className="text-xs">{isPhaseExpanded ? '▼' : '▶'}</span>
                      <span>{phaseFeatures.length} feature{phaseFeatures.length !== 1 ? 's' : ''} worden ontgrendeld</span>
                      {isPhaseUnlocked ? (
                        <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-200">
                          ✓ Beschikbaar
                        </span>
                      ) : (
                        <span className="ml-1 inline-flex items-center rounded-[var(--r-sm)] bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-3)] border border-[var(--border-ed)]">
                          Vergrendeld
                        </span>
                      )}
                    </button>

                    {/* Feature icon pills */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {phaseFeatures.map((feature) => {
                        const icon = featureIcons[feature.id] ?? '⚡'
                        return (
                          <div
                            key={feature.id}
                            className={`group relative inline-flex items-center gap-1 rounded-[var(--r-sm)] px-2 py-0.5 text-[11px] font-medium border transition-all ${
                              isPhaseUnlocked
                                ? `${colors.badge} opacity-100`
                                : 'bg-[var(--subtle)] text-[var(--ink-3)] border-[var(--border-ed)] opacity-60'
                            }`}
                            data-testid={`feature-pill-${feature.id}`}
                            data-unlocked={isPhaseUnlocked ? 'true' : 'false'}
                          >
                            <span className="text-xs">{icon}</span>
                            <span className="hidden sm:inline">{feature.label}</span>
                            <div className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 -translate-x-1/2 w-48 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-2 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                              <p className="text-[11px] font-semibold text-[var(--ink-2)]">{feature.label}</p>
                              <p className="text-[10px] text-[var(--ink-3)]">{feature.description}</p>
                              {isPhaseUnlocked ? (
                                <p className="mt-1 text-[10px] font-semibold text-emerald-600">✓ Ontgrendeld</p>
                              ) : (
                                <p className="mt-1 text-[10px] font-semibold text-[var(--ink-3)]">Beschikbaar vanaf {phase.name}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Expanded feature list */}
                    {isPhaseExpanded && (
                      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3 mb-2" data-testid={`feature-list-${phaseId}`}>
                        <p className="label-editorial text-[var(--ink-3)] mb-2">
                          Features in {phase.name}
                        </p>
                        <div className="space-y-1.5">
                          {phaseFeatures.map((feature) => {
                            const icon = featureIcons[feature.id] ?? '⚡'
                            return (
                              <div
                                key={feature.id}
                                className={`flex items-start gap-2 rounded-[var(--r)] p-1.5 ${isPhaseUnlocked ? '' : 'opacity-50'}`}
                                data-testid={`feature-detail-${feature.id}`}
                              >
                                <span className="text-sm shrink-0 mt-0.5">{icon}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-[var(--ink-2)]">{feature.label}</span>
                                    {isPhaseUnlocked ? (
                                      <span className="text-[10px] text-emerald-600 font-medium">✓</span>
                                    ) : (
                                      <span className="text-[10px] text-[var(--ink-3)]">—</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-[var(--ink-3)] leading-snug">{feature.description}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Levels in this phase */}
                <div className="ml-3 border-l-2 border-[var(--border-ed)] pl-6 pb-6">
                  {levels.map((lvl) => {
                    const isActive = lvl.level === sovereigntyLevel
                    const isPast = lvl.level < sovereigntyLevel
                    const isFuture = lvl.level > sovereigntyLevel
                    const criteria = levelCriteriaMap[lvl.level]
                    const progressPct = isPast ? 100 : criteria ? criteria.progress(financialData) : 0

                    return (
                      <div
                        key={lvl.level}
                        className={`relative mb-4 last:mb-0 ${isFuture ? 'opacity-40' : ''}`}
                      >
                        <div
                          className={`absolute -left-[calc(1.5rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full ${
                            isActive ? colors.activeDot : isPast ? colors.dot : 'bg-[var(--border-md)]'
                          }`}
                          style={isActive ? { boxShadow: `0 0 0 3px var(--paper), 0 0 0 5px currentColor` } : {}}
                        />

                        <div className={`rounded-[var(--r-lg)] p-3 ${isActive ? 'bg-[var(--subtle)] border border-[var(--border-ed)]' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-mono font-bold ${isActive ? colors.text : 'text-[var(--ink-3)]'}`}>
                              Niv. {lvl.level}
                            </span>
                            <span className={`text-sm font-semibold ${isActive ? 'text-[var(--ink)]' : isPast ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}`}>
                              {lvl.name}
                            </span>
                            {isActive && (
                              <span className={`rounded-[var(--r-sm)] px-2 py-0.5 text-[10px] font-bold uppercase border ${colors.badge}`}>
                                Huidige positie
                              </span>
                            )}
                            {criteria && (
                              <div className="group relative ml-auto shrink-0">
                                <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[var(--border-md)] text-[10px] font-bold text-[var(--ink-3)] transition-colors group-hover:border-[var(--ink-2)] group-hover:text-[var(--ink-2)]">
                                  i
                                </div>
                                <div className="pointer-events-none absolute right-0 bottom-full z-20 mb-2 w-64 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                                  <p className="mb-1.5 text-[11px] font-semibold text-[var(--ink-2)]">
                                    {criteria.label}
                                  </p>
                                  <ul className="mb-2 space-y-0.5">
                                    {criteria.criteria.map((c, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--ink-3)]">
                                        <span className="mt-0.5 shrink-0">
                                          {progressPct >= 100 ? '✓' : '○'}
                                        </span>
                                        {c}
                                      </li>
                                    ))}
                                  </ul>
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          progressPct >= 100 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-horizon-400' : 'bg-[var(--border-md)]'
                                        }`}
                                        style={{ width: `${Math.min(100, progressPct)}%` }}
                                      />
                                    </div>
                                    <span className={`text-[11px] font-mono font-bold tabular-nums ${
                                      progressPct >= 100 ? 'text-emerald-600' : 'text-[var(--ink-3)]'
                                    }`}>
                                      {Math.min(100, progressPct)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                            <span className="font-medium">Focus:</span> {lvl.focus}
                          </p>
                          {(isActive || isPast) && (
                            <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
                              {lvl.metaphor}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

    </div>
  )
}
