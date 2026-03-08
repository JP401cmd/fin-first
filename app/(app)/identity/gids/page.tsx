'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, LayoutDashboard, Landmark, Zap, Compass, BookOpen, MessageSquare, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        if (profile?.full_name) setFullName(profile.full_name)
      }
      setLoading(false)
    }
    loadUser()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ink-4)] border-t-[var(--ink)]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Hero */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] border border-[var(--border-ed)]">
            <BookOpen className="h-5 w-5 text-[var(--ink-2)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.02em' }}>
              Zo werkt TriFinity
            </h1>
            <p className="text-[12px] text-[var(--ink-3)]">
              {fullName ? `Welkom, ${fullName.split(' ')[0]}` : 'Rondleiding door de app'}
            </p>
          </div>
        </div>
      </div>

      {/* Filosofie */}
      <div className="mb-6 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4">
        <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          &ldquo;Geld is opgeslagen tijd.&rdquo; Elke euro die je verdient, spaart of uitgeeft
          vertegenwoordigt een stukje van je levenstijd. TriFinity vertaalt al je financiële
          gegevens naar <strong className="font-semibold text-[var(--ink)]">vrijheidstijd</strong> —
          dagen, maanden en jaren dat je niet hoeft te werken.
        </p>
      </div>

      {/* Drie module-pijlers */}
      <div className="mb-6 sm:mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          { id: 'kern', icon: Landmark, name: 'De Kern', tagline: 'Wat je hebt en uitgeeft', color: 'var(--kern-400, #b45309)', bg: 'var(--kern-50, #fffbeb)' },
          { id: 'wil', icon: Zap, name: 'De Wil', tagline: 'Wat je nu kunt doen', color: 'var(--wil-400, #2dd4bf)', bg: 'var(--wil-50, #f0fdfa)' },
          { id: 'horizon', icon: Compass, name: 'De Horizon', tagline: 'Waar je naartoe gaat', color: 'var(--horizon-400, #a855f7)', bg: 'var(--horizon-50, #faf5ff)' },
        ] as { id: string; icon: LucideIcon; name: string; tagline: string; color: string; bg: string }[]).map((mod) => {
          const Icon = mod.icon
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => {
                const el = document.getElementById(`guide-${mod.id}`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="card-editorial p-4 text-left transition-all hover:shadow-md group"
            >
              <div
                className="mb-2 flex h-9 w-9 items-center justify-center rounded-[var(--r)]"
                style={{ backgroundColor: mod.bg, color: mod.color }}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-sm font-semibold text-[var(--ink)] group-hover:underline">{mod.name}</p>
              <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{mod.tagline}</p>
            </button>
          )
        })}
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
            <GuideFeature title="Assets">
              Al je bezittingen op één plek — beleggingsportefeuille, spaargeld, crypto, vastgoed, pensioenfondsen, deelnemingen. Elke asset draagt bij aan je totale vrijheidstijd.
            </GuideFeature>
            <GuideFeature title="Budgetten">
              Vier weergaven voor je maandelijkse uitgaven: lijst, categorie, kalender en vergelijking met NIBUD-normen. Overschrijdingen kosten vrijheidsdagen; besparingen leveren ze op.
            </GuideFeature>
            <GuideFeature title="Schulden">
              Beheer je hypotheek, studieleningen, persoonlijke leningen en creditcardschuld. Vergelijk aflossingsstrategieën (sneeuwbal vs. lawine) en zie hoeveel vrijheidstijd elke betaling oplevert.
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
              Gepersonaliseerde suggesties op basis van je data — bespaartips, schuld-optimalisatie, beleggingskansen. Accepteer een aanbeveling om er een actie van te maken.
            </GuideFeature>
            <GuideFeature title="Acties">
              Je persoonlijke takenlijst voor financiële verbetering. Elke actie toont de geschatte vrijheidstijd-impact. Rond ze af om je FIRE-datum dichterbij te brengen.
            </GuideFeature>
            <GuideFeature title="Doelen">
              Stel spaardoelen in — vakantie, noodfonds, grote aankoop. Volg je voortgang en zie hoeveel vrijheidsdagen elk doel kost of oplevert.
            </GuideFeature>
            <GuideFeature title="NIBUD-vergelijking">
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
            <GuideFeature title="FIRE-projectie">
              Je persoonlijke FIRE-berekening: wanneer dekt je vermogen je uitgaven? Met pessimistisch, verwacht en optimistisch scenario. Zie je verwachte FIRE-leeftijd en het pad ernaartoe.
            </GuideFeature>
            <GuideFeature title="Levensgebeurtenissen">
              Voeg toekomstige gebeurtenissen toe — kinderen, verhuizing, pensioen, erfenis. Elk event verschuift je FIRE-datum. Zie het totale effect in het vermogensverloop.
            </GuideFeature>
            <GuideFeature title="Monte Carlo simulatie">
              1.000 willekeurige marktscenario&apos;s laten zien hoe robuust je plan is. Je backtestscore toont het slagingspercentage: het percentage scenario&apos;s waarin je FIRE-plan standhoudt.
            </GuideFeature>
            <GuideFeature title="What-if droomruimte">
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
            <GuideFeature title="De Kern">
              &ldquo;Dit is wat je hebt.&rdquo; Will analyseert je vermogen, budgetten en schulden. Hij vertaalt droge cijfers naar vrijheidstijd en wijst op kansen die je misschien over het hoofd ziet.
            </GuideFeature>
            <GuideFeature title="De Wil">
              &ldquo;Dit kun je nu doen.&rdquo; Will stelt concrete acties voor, helpt bij het prioriteren en houdt je gemotiveerd op je pad naar financiële vrijheid.
            </GuideFeature>
            <GuideFeature title="De Horizon">
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
  )
}
