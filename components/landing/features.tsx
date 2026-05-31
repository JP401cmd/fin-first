'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ShieldCheck,
  Lock,
  Eye,
  Fingerprint,
  ArrowRight,
  HelpCircle,
  Sparkles,
  Wallet,
  Compass,
  Users,
  Briefcase,
  Heart,
  TrendingUp,
  Calculator,
  Calendar,
  Target,
  type LucideIcon,
} from 'lucide-react'

// ── Reveal on scroll ─────────────────────────────────────────────────

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        transition: visible ? 'opacity 0.7s ease-out, transform 0.7s ease-out' : 'none',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
      }}
      className={className}
    >
      {children}
    </div>
  )
}

// ── Sectie-scheidingslijn ────────────────────────────────────────────

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 px-6 py-8 md:px-12">
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
      <span className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

// ── Sectie-titel ─────────────────────────────────────────────────────

function SectionTitle({
  kicker,
  title,
  italics,
  intro,
}: {
  kicker: string
  title: string
  italics?: string
  intro?: string
}) {
  return (
    <div className="mb-10 text-center">
      <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {kicker}
      </p>
      <h2 className="font-display text-[2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-[2.6rem]">
        {title}
        {italics && (
          <>
            {' '}
            <em className="italic text-kern-600">{italics}</em>
          </>
        )}
      </h2>
      {intro && (
        <p className="mx-auto mt-5 max-w-2xl font-serif text-lg leading-relaxed text-[var(--ink-2)]">
          {intro}
        </p>
      )}
    </div>
  )
}

// ── Probleem-vraagkaart ──────────────────────────────────────────────

function VraagKaart({
  vraag,
  antwoord,
  accentColor,
}: {
  vraag: string
  antwoord: string
  accentColor: string
}) {
  return (
    <div
      className="rounded-[var(--r-lg)] border border-l-[4px] border-[var(--border-ed)] bg-[var(--paper)] p-6"
      style={{ borderLeftColor: accentColor }}
    >
      <p className="mb-2 font-display text-lg font-semibold leading-tight text-[var(--ink)]">
        &ldquo;{vraag}&rdquo;
      </p>
      <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
        {antwoord}
      </p>
    </div>
  )
}

// ── Module-kaart ─────────────────────────────────────────────────────

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
      className={`overflow-hidden rounded-[var(--r-lg)] border ${borderClass} bg-[var(--paper)]`}
    >
      {/* Kaart-header — krantenrubriek */}
      <div className={`flex items-center justify-between border-b-2 px-6 py-3 ${bgClass}`} style={{ borderBottomColor: kleur }}>
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: kleur }}>
          {rubriek}
        </p>
        <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
      </div>

      {/* Titel + ondertitel */}
      <div className="px-6 py-6">
        <h3 className="mb-1 font-display text-2xl font-bold leading-tight text-[var(--ink)]">
          {titel}
        </h3>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">
          {ondertitel}
        </p>
      </div>

      {/* Features */}
      <div className="border-t border-dashed border-[var(--border-ed)] px-6 py-5">
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 font-serif text-sm text-[var(--ink-2)]">
              <span aria-hidden="true" className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: kleur }} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Productdemo-screenshot mockup ────────────────────────────────────

function DemoMock({
  rubriek,
  titel,
  toelichting,
  children,
}: {
  rubriek: string
  titel: string
  toelichting: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col">
      <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s1)]">
        {/* Mock browser-chrome */}
        <div className="flex items-center justify-between border-b-2 border-[var(--ink)] bg-[var(--subtle)] px-4 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--ink-4)]/30" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--ink-4)]/30" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--ink-4)]/30" aria-hidden="true" />
          </div>
          <p className="font-mono text-[10px] text-[var(--ink-4)]">
            trifinity.app
          </p>
        </div>

        {/* Mock content */}
        <div className="bg-[var(--bg)] px-5 py-5">
          <p className="mb-3 font-sans text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            {rubriek}
          </p>
          {children}
        </div>
      </div>

      <div className="mt-4 px-1">
        <p className="font-display text-base font-semibold text-[var(--ink)]">
          {titel}
        </p>
        <p className="mt-1 font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
          {toelichting}
        </p>
      </div>
    </div>
  )
}

// ── Rekenhulp-titel-rij ──────────────────────────────────────────────

function CalcRow({
  titel,
  sterren,
  beschrijving,
}: {
  titel: string
  sterren: number
  beschrijving: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-[var(--border-ed)] py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="font-sans text-sm font-semibold text-[var(--ink)]">
          {titel}
        </p>
        <p className="mt-0.5 font-serif text-xs italic text-[var(--ink-3)]">
          {beschrijving}
        </p>
      </div>
      <span className="shrink-0 font-mono text-xs text-kern-600 tabular-nums">
        {'★'.repeat(sterren)}
        <span className="text-[var(--ink-4)]/40">
          {'★'.repeat(5 - sterren)}
        </span>
      </span>
    </div>
  )
}

// ── Privacy-bullet ───────────────────────────────────────────────────

function PrivacyBullet({
  Icon,
  titel,
  beschrijving,
}: {
  Icon: LucideIcon
  titel: string
  beschrijving: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]">
        <Icon className="h-4 w-4 text-[var(--ink-2)]" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-sans text-sm font-semibold text-[var(--ink)]">
          {titel}
        </p>
        <p className="mt-1 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
          {beschrijving}
        </p>
      </div>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────

export function Features() {
  return (
    <>
      {/* ── PROBLEEM → BELOFTE — Drie vragen ─────────────────────── */}
      <SectionRule label="Drie vragen" />
      <section id="probleem" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-5xl">
          <SectionTitle
            kicker="Het probleem"
            title="Drie vragen die elke maand terugkomen"
            italics="zonder helder antwoord"
          />

          <div className="mb-10 grid gap-4 md:grid-cols-3">
            <VraagKaart
              vraag="Kan ik dit betalen?"
              antwoord="Cashflow nu, met grenzen die je begrijpt."
              accentColor="var(--color-kern-300)"
            />
            <VraagKaart
              vraag="Spaar ik genoeg?"
              antwoord="Vrijheid morgen, vertaald naar jaren en dagen."
              accentColor="var(--color-wil-300)"
            />
            <VraagKaart
              vraag="Wanneer ben ik vrij?"
              antwoord="FIRE-prognose, met scenario's voor kinderen, verbouwing, pensioen."
              accentColor="var(--color-horizon-300)"
            />
          </div>

          <div className="mx-auto max-w-2xl rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--paper)] px-8 py-6 text-center">
            <p className="font-serif text-lg leading-relaxed text-[var(--ink-2)]">
              TriFinity beantwoordt ze met{' '}
              <strong className="font-semibold text-[var(--ink)]">jóuw</strong>{' '}
              cijfers, in{' '}
              <strong className="font-semibold text-[var(--ink)]">jouw</strong>{' '}
              tijd.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── TWEE MODULES ─────────────────────────────────────────── */}
      <SectionRule label="Twee modules" />
      <section id="modules" className="px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-6xl">
          <SectionTitle
            kicker="Hoe het werkt"
            title="Vandaag op orde,"
            italics="morgen in beeld"
            intro="TriFinity bestaat uit twee modules die naadloos op elkaar aansluiten. Samen geven ze inzicht in waar je nu staat én waar je naartoe gaat."
          />

          <div className="grid gap-6 md:grid-cols-2">
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
              ondertitel="Levensgebeurtenissen, scenario's en de Rekenhulp van Will."
              features={[
                'Tijdas met levensgebeurtenissen (kinderen, verhuizing, pensioen)',
                'FIRE-prognose met scenario-vergelijking',
                'Rekenhulp-bibliotheek met 12 prefab-calcs',
                'Vraag Will een eigen rekenhulp op maat',
              ]}
              bgClass="bg-horizon-50"
              borderClass="border-horizon-200"
              iconColor="text-horizon-600"
              Icon={Compass}
            />
          </div>
        </Reveal>
      </section>

      {/* ── PRODUCTDEMO ──────────────────────────────────────────── */}
      <SectionRule label="In de app" />
      <section id="demo" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-6xl">
          <SectionTitle
            kicker="Drie blikken"
            title="Zo ziet TriFinity"
            italics="er in de praktijk uit"
          />

          <div className="grid gap-6 md:grid-cols-3">
            <DemoMock
              rubriek="Overzicht · Briefing"
              titel="Dagelijkse briefing"
              toelichting="Zes inzichten per dag uit jouw cijfers — wat opvalt, wat je moet weten, wat ruimte geeft."
            >
              <div className="space-y-3">
                <div className="rounded border border-kern-200 bg-kern-50 p-3">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-kern-700">
                    Vandaag
                  </p>
                  <p className="mt-1 font-serif text-xs leading-relaxed text-[var(--ink-2)]">
                    Je netto vermogen groeide met €1.240 deze maand — vooral door je beleggingen (+€890).
                  </p>
                </div>
                <div className="rounded border border-wil-200 bg-wil-50 p-3">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-700">
                    Inzicht
                  </p>
                  <p className="mt-1 font-serif text-xs leading-relaxed text-[var(--ink-2)]">
                    Boodschappen-budget zit op 78% van de maand met nog 9 dagen te gaan.
                  </p>
                </div>
              </div>
            </DemoMock>

            <DemoMock
              rubriek="Toekomst · Tijdas"
              titel="Levensgebeurtenissen"
              toelichting="Plaats kinderen, verhuizing of pensioen op je tijdas — zie meteen wat het kost in geld én tijd."
            >
              <div className="relative space-y-2.5">
                <span aria-hidden="true" className="absolute left-3 top-2 bottom-2 w-px bg-[var(--border-md)]" />
                {[
                  { jaar: '2027', titel: 'Tweede kind', delta: '+18 mnd' },
                  { jaar: '2031', titel: 'Verbouwing', delta: '+8 mnd' },
                  { jaar: '2044', titel: 'FIRE', delta: '✓' },
                ].map((ev) => (
                  <div key={ev.jaar} className="relative flex items-center gap-3 pl-7">
                    <span aria-hidden="true" className="absolute left-2 h-2.5 w-2.5 rounded-full border-2 border-horizon-600 bg-[var(--paper)]" />
                    <span className="font-mono text-[10px] text-[var(--ink-3)] tabular-nums">{ev.jaar}</span>
                    <span className="flex-1 font-sans text-xs font-medium text-[var(--ink)]">{ev.titel}</span>
                    <span className="font-mono text-[10px] text-horizon-700 tabular-nums">{ev.delta}</span>
                  </div>
                ))}
              </div>
            </DemoMock>

            <DemoMock
              rubriek="Toekomst · Rekenhulp"
              titel="Aflossen vs. beleggen"
              toelichting="Sliders aan de kant, scenario's met winnaar-badge, vertaling naar jaren extra vrijheid."
            >
              <div className="space-y-2.5">
                <div className="rounded border border-[var(--border-ed)] bg-[var(--paper)] p-2.5">
                  <p className="font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                    Eindwaarde na 15 jaar
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <p className="font-sans text-[9px] text-[var(--ink-4)]">Aflossen</p>
                      <p className="font-mono font-semibold text-[var(--ink)] tabular-nums">€67k</p>
                    </div>
                    <div>
                      <p className="font-sans text-[9px] text-[var(--ink-4)]">5%</p>
                      <p className="font-mono font-semibold text-[var(--ink)] tabular-nums">€80k</p>
                    </div>
                    <div className="rounded bg-emerald-50 -mx-1 px-1">
                      <p className="font-sans text-[9px] text-emerald-700">8% ✓</p>
                      <p className="font-mono font-semibold text-emerald-800 tabular-nums">€103k</p>
                    </div>
                  </div>
                </div>
                <p className="font-serif text-[11px] italic leading-snug text-[var(--ink-2)] border-l-2 border-amber-400 pl-2">
                  Beleggen (8%) geeft 2 jr 4 mnd extra vrijheid.
                </p>
              </div>
            </DemoMock>
          </div>
        </Reveal>
      </section>

      {/* ── REKENHULP + BIBLIOTHEEK ──────────────────────────────── */}
      <SectionRule label="Rekenhulp van Will" />
      <section id="rekenhulp" className="px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-6xl">
          <SectionTitle
            kicker="De krachtigste laag"
            title="Een rekenhulp"
            italics="voor elke beslissing"
            intro="Wij geven je 12 kant-en-klare rekenhulpen — van aflossen vs. beleggen tot BV agio storten vs. privé beleggen. Maar het echte verhaal: je vraagt Will een eigen rekenhulp voor jouw dilemma, en hij bouwt 'm."
          />

          <div className="grid gap-6 md:grid-cols-2">
            {/* Bibliotheek-preview */}
            <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6">
              <div className="mb-4 flex items-center justify-between border-b border-dashed border-[var(--border-ed)] pb-3">
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  Uit de bibliotheek
                </p>
                <span className="font-mono text-[10px] text-[var(--ink-4)]">12 stuks</span>
              </div>

              <div className="space-y-0">
                <CalcRow
                  titel="Aflossen vs. beleggen"
                  sterren={1}
                  beschrijving="Hypotheek extra aflossen of die maandelijkse €X beleggen?"
                />
                <CalcRow
                  titel="Eerder met pensioen"
                  sterren={2}
                  beschrijving="Wanneer kan ik stoppen bij jouw inleg en uitgaven?"
                />
                <CalcRow
                  titel="Huren vs. kopen"
                  sterren={3}
                  beschrijving="Huren + beleggen of kopen + aflossen — netto na 10 jaar."
                />
                <CalcRow
                  titel="Schenken vs. erven"
                  sterren={4}
                  beschrijving="Jaarlijkse vrijstelling benutten of erfenis laten."
                />
                <CalcRow
                  titel="BV agio vs. privé box 3"
                  sterren={5}
                  beschrijving="Bruto opbouwen in de BV of eerst uitkeren naar privé?"
                />
              </div>

              <Link
                href="/toekomst/bibliotheek"
                className="mt-5 inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-kern-700 hover:text-kern-800 hover:underline"
              >
                Bekijk de bibliotheek
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {/* Will-prompt mock */}
            <div className="rounded-[var(--r-lg)] border-2 border-wil-200 bg-wil-50/40 p-6">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-wil-700" aria-hidden="true" />
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-wil-700">
                  Vraag het Will
                </p>
              </div>

              <div className="mb-4 rounded-[var(--r)] border border-wil-200 bg-[var(--paper)] p-3">
                <p className="font-mono text-[11px] text-[var(--ink-2)]">
                  &ldquo;auto private leasen vs auto kopen in de bv?&rdquo;
                </p>
              </div>

              <div className="space-y-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
                <p className="font-sans text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  Will bouwt een rekenhulp met:
                </p>
                <ul className="space-y-1.5 font-serif text-xs leading-snug text-[var(--ink-2)]">
                  <li>· 7 sliders (catalogus, lease p/m, bijtelling, looptijd, ...)</li>
                  <li>· 2 scenario&apos;s (private lease / kopen in BV)</li>
                  <li>· 6 outputs gegroepeerd in kosten + belasting + netto</li>
                  <li>· 1-zinnige conclusie bovenaan met winnaar</li>
                </ul>
              </div>

              <p className="mt-4 font-serif text-xs italic leading-relaxed text-[var(--ink-3)]">
                Je kunt &apos;m aanpassen, opslaan, en optioneel publiceren naar de bibliotheek.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── WILL — AI COACH ──────────────────────────────────────── */}
      <SectionRule label="Will" />
      <section id="coach" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-5xl">
          <SectionTitle
            kicker="Will, je AI-coach"
            title="Niet een chatbot."
            italics="Een tweede paar ogen."
            intro="Will leeft door je hele app heen — als suggestie naast een doel, als briefing-zin, als rekenhulp-bouwer. Altijd in dezelfde stem, altijd op basis van jóuw cijfers."
          />

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: Calculator, titel: 'Bouwt rekenhulpen', text: 'Beschrijf je dilemma, Will levert een werkende calc met scenario\'s en uitleg.' },
              { Icon: Calendar, titel: 'Stelt gebeurtenissen voor', text: 'Verbouwing, kind, verhuizing — Will vertaalt naar tijd en geld op je tijdas.' },
              { Icon: Target, titel: 'Suggereert acties', text: 'Bij elk doel een paar concrete stappen die er sneller bij brengen.' },
              { Icon: HelpCircle, titel: 'Beantwoordt vragen', text: 'In jouw context, met jouw cijfers — geen generieke financiële advies-tekst.' },
            ].map((it) => (
              <div key={it.titel} className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[var(--r)] border border-wil-200 bg-wil-50">
                  <it.Icon className="h-4 w-4 text-wil-700" aria-hidden="true" />
                </span>
                <p className="font-sans text-sm font-semibold text-[var(--ink)]">{it.titel}</p>
                <p className="mt-1 font-serif text-sm leading-relaxed text-[var(--ink-3)]">{it.text}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto max-w-2xl rounded-[var(--r-lg)] border border-l-[4px] border-l-wil-500 border-[var(--border-ed)] bg-[var(--paper)] px-6 py-5">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-wil-700">
              En wat Will <em>niet</em> doet
            </p>
            <p className="mt-2 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
              Geen beleggingsadvies, geen koop- of verkoopaanbevelingen, geen
              productpromotie. Will rekent en suggereert &mdash; jij beslist.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── VOOR WIE ─────────────────────────────────────────────── */}
      <SectionRule label="Voor wie" />
      <section id="voor-wie" className="px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-5xl">
          <SectionTitle
            kicker="Self-selection"
            title="Voor wie wel,"
            italics="en voor wie niet"
          />

          <div className="grid gap-6 md:grid-cols-2">
            {/* WEL */}
            <div className="rounded-[var(--r-lg)] border-2 border-kern-200 bg-kern-50/40 p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-100">
                  <TrendingUp className="h-4 w-4 text-kern-700" aria-hidden="true" />
                </span>
                <p className="font-sans text-sm font-bold uppercase tracking-[0.08em] text-kern-700">
                  Voor wie wel
                </p>
              </div>

              <ul className="space-y-3 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
                <li className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>Salarismannen/-vrouwen met de vraag &ldquo;kan ik dit betalen?&rdquo;</span>
                </li>
                <li className="flex items-start gap-2">
                  <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>Ondernemers / ZZP met BV-vraagstukken (dividend, agio, lijfrente)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Heart className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>30-50-jarigen met hypotheek, partner en kinderwens</span>
                </li>
                <li className="flex items-start gap-2">
                  <Compass className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>FIRE-aspiranten die concrete cijfers willen, geen memes</span>
                </li>
                <li className="flex items-start gap-2">
                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                  <span>Vermogenden met box 3, vastgoed of familievermogen</span>
                </li>
              </ul>
            </div>

            {/* NIET */}
            <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <p className="font-sans text-sm font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Voor wie niet
                </p>
              </div>

              <ul className="space-y-3 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                <li>
                  Mensen die enkel een betaalrekening willen &mdash; daar is je bank-app voor.
                </li>
                <li>
                  Active day-traders &mdash; wij rekenen over jaren, niet over minuten.
                </li>
                <li>
                  Wie financieel advies wil zonder zelf na te denken &mdash;
                  Will rekent, jij beslist.
                </li>
              </ul>

              <p className="mt-5 border-t border-dashed border-[var(--border-ed)] pt-4 font-serif text-xs italic text-[var(--ink-4)]">
                Eerlijk zijn over wat we niet zijn, bespaart frustratie aan beide kanten.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── PRIVACY & VERTROUWEN ─────────────────────────────────── */}
      <SectionRule label="Privacy & vertrouwen" />
      <section id="privacy" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <Reveal className="mx-auto max-w-5xl">
          <SectionTitle
            kicker="Hoe wij omgaan met jouw data"
            title="Jouw cijfers,"
            italics="jouw bezit"
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <PrivacyBullet
              Icon={ShieldCheck}
              titel="EU-hosted"
              beschrijving="Data leeft op Supabase-servers in Frankfurt. Geen overdracht buiten de EU, geen exotische subprocessors."
            />
            <PrivacyBullet
              Icon={Lock}
              titel="Wij verkopen je data niet"
              beschrijving="Punt. Geen ads, geen marketing-pixels, geen verkoop aan derden. Ons businessmodel is jouw abonnement, niet jouw data."
            />
            <PrivacyBullet
              Icon={Eye}
              titel="Open methodologie"
              beschrijving="De rekenhulp-formules zijn inspecteerbaar. Geen black box: je ziet welke aannames een uitkomst bepalen."
            />
            <PrivacyBullet
              Icon={Fingerprint}
              titel="Eigen export, altijd"
              beschrijving="Download al je data als JSON of CSV wanneer je wilt. Geen vendor-lock-in bij opzegging."
            />
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center font-serif text-xs italic leading-relaxed text-[var(--ink-4)]">
            TriFinity is een educatief reken-instrument, geen financieel advies in de zin van de Wft. Voor product-keuzes of fiscale planning blijft een erkend adviseur de aangewezen route.
          </p>
        </Reveal>
      </section>
    </>
  )
}
