'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'

// ── Reveal on scroll ────────────────────────────────────────

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.12, rootMargin: '0px 0px -30px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-7'} ${className}`}
    >
      {children}
    </div>
  )
}

// ── Divider ─────────────────────────────────────────────────

function Divider() {
  return (
    <div className="flex items-center justify-center gap-4 py-6">
      <div className="h-px w-16 bg-zinc-200" />
      <div className="h-1 w-1 rounded-full bg-zinc-300" />
      <div className="h-px w-16 bg-zinc-200" />
    </div>
  )
}

// ── Feature card ────────────────────────────────────────────

const domainStyles = {
  kern: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', hoverBorder: 'hover:border-amber-300', hoverShadow: 'hover:shadow-amber-50' },
  wil: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-600', hoverBorder: 'hover:border-teal-300', hoverShadow: 'hover:shadow-teal-50' },
  horizon: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', hoverBorder: 'hover:border-purple-300', hoverShadow: 'hover:shadow-purple-50' },
}

function FeatureCard({ icon, title, description, domain }: {
  icon: ReactNode
  title: string
  description: string
  domain: 'kern' | 'wil' | 'horizon'
}) {
  const s = domainStyles[domain]
  return (
    <div className={`rounded-xl border ${s.border} bg-white p-6 transition-all ${s.hoverBorder} hover:shadow-lg ${s.hoverShadow}`}>
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${s.bg} text-lg`}>
        {icon}
      </div>
      <h4 className="mb-1 text-sm font-bold text-zinc-900">{title}</h4>
      <p className="text-sm leading-relaxed text-zinc-500">{description}</p>
    </div>
  )
}

// ── Main export ─────────────────────────────────────────────

export function Features() {
  return (
    <>
      {/* ── Fragmentatie-pijn ─────────────────────────────────── */}
      <section id="fragmentatie" className="px-6 py-24 md:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold leading-snug tracking-tight text-zinc-900 md:text-3xl lg:text-4xl mb-6">
            Je financiele leven is{' '}
            <span className="text-teal-600">versnipperd</span>
          </h2>
          <div className="grid gap-4 text-left sm:grid-cols-3 mb-8">
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-semibold text-zinc-900 mb-1">Losse apps</p>
              <p className="text-sm text-zinc-500 leading-relaxed">
                YNAB voor budgetten, Excel voor vermogen, broker-apps voor beleggen, pensioenportalen voor later.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-semibold text-zinc-900 mb-1">Geen totaalbeeld</p>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Niemand vertelt je hoeveel vrijheid je eigenlijk hebt. Alles staat los van elkaar.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-semibold text-zinc-900 mb-1">Handmatig werk</p>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Elke maand spreadsheets bijwerken, transacties categoriseren, zelf berekeningen maken.
              </p>
            </div>
          </div>
          <p className="text-base text-zinc-500 leading-relaxed">
            TriFinity brengt alles samen in een app — je vermogen, je keuzes en je toekomst.
            Vertaald naar wat echt telt:{' '}
            <strong className="text-zinc-700 font-medium">je tijd</strong>.
          </p>
        </Reveal>
      </section>

      <Divider />

      {/* ── Features intro ───────────────────────────────────── */}
      <section id="features" className="px-6 pt-16 pb-12 text-center">
        <Reveal>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 md:text-3xl">
            Alles wat je nodig hebt{' '}
            <span className="text-zinc-400 font-normal">in drie domeinen</span>
          </h2>
        </Reveal>
      </section>

      {/* ── DE KERN ────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="grid gap-12 md:grid-cols-2 mb-10 items-start">
              <div>
                <p className="mb-2 text-xs font-medium tracking-widest uppercase text-amber-600">
                  De Kern — Je fundament
                </p>
                <h3 className="text-2xl font-bold tracking-tight text-zinc-900 mb-4 md:text-3xl">
                  Je volledige <span className="text-amber-600">vermogen</span> in een oogopslag
                </h3>
                <p className="text-sm leading-relaxed text-zinc-500">
                  Rekeningen, beleggingen, pensioen, vastgoed, schulden — alles samengebracht
                  en vertaald naar jaren, maanden en dagen vrijheid. Niet verspreid over vijf apps,
                  maar op een plek.
                </p>
              </div>
              <div className="flex items-center">
                <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-6">
                  <p className="text-sm leading-relaxed text-zinc-700 italic">
                    &ldquo;Je vermogen is 14 jaar en 3 maanden vrijheid waard. Je vaste lasten kosten je 23 dagen per maand. Je spaarquote geeft je 8 dagen per maand terug.&rdquo;
                  </p>
                  <span className="mt-3 block text-xs font-medium uppercase tracking-wider text-amber-600">
                    — Hoe TriFinity spreekt
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard domain="kern" icon={<span>&#9201;</span>} title="Vrijheidstijdlijn" description="Je vermogen vertaald naar jaren, maanden en dagen vrijheid — zo voel je wat je hebt." />
              <FeatureCard domain="kern" icon={<span>&#128200;</span>} title="Vermogen & Beleggingen" description="Portfoliotracking met rendement in vrijheidsdagen. Zie wat je beleggingen je in tijd opleveren." />
              <FeatureCard domain="kern" icon={<span>&#8644;</span>} title="Geldstroom-visualisatie" description="Visuele geldstroom van inkomsten naar uitgaven. Klik op een stroom en je ziet de transacties." />
              <FeatureCard domain="kern" icon={<span>&#9878;</span>} title="Bewust besteden" description="Budgetten die niet beperken, maar laten zien waar je tijd naartoe vloeit. Kansen tonen, geen grenzen." />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── DE WIL ─────────────────────────────────────────── */}
      <section className="bg-zinc-50 px-6 pt-16 pb-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="grid gap-12 md:grid-cols-2 mb-10 items-start">
              <div className="order-2 md:order-1 flex items-center">
                <div className="w-full rounded-xl border border-teal-200 bg-teal-50 p-6">
                  <p className="text-sm leading-relaxed text-zinc-700 italic">
                    &ldquo;Die abonnementen kosten je 7 dagen vrijheid per jaar. Halveer ze, beleg het verschil, en je koopt jezelf een halfjaar eerder vrij. Wat kies je?&rdquo;
                  </p>
                  <span className="mt-3 block text-xs font-medium uppercase tracking-wider text-teal-600">
                    — Hoe Will je uitdaagt
                  </span>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <p className="mb-2 text-xs font-medium tracking-widest uppercase text-teal-600">
                  De Wil — Laat Will je helpen
                </p>
                <h3 className="text-2xl font-bold tracking-tight text-zinc-900 mb-4 md:text-3xl">
                  Persoonlijke <span className="text-teal-600">AI-coaching</span> die je vrijheid versnelt
                </h3>
                <p className="text-sm leading-relaxed text-zinc-500">
                  Geen generieke tips uit een spreadsheet. Will is je AI-coach die je volledige
                  financiele context kent en je helpt betere keuzes te maken — met concrete
                  impact in vrijheidsdagen.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard domain="wil" icon={<span>&#10024;</span>} title="Persoonlijke AI-coach" description="Will kent je vermogen, je keuzes en je doelen — en helpt je over alle domeinen heen." />
              <FeatureCard domain="wil" icon={<span>&#128161;</span>} title="Slimme aanbevelingen" description="AI analyseert je patronen en suggereert optimalisaties. Met euro-impact en vrijheidsdagen." />
              <FeatureCard domain="wil" icon={<span>&#128208;</span>} title="Scenario-analyse" description="Wat als je eerder stopt? Meer belegt? Een huis koopt? AI simuleert en legt uit." />
              <FeatureCard domain="wil" icon={<span>&#9889;</span>} title="Schuldversneller" description="Avalanche of snowball — simuleer strategieen en zie hoeveel maanden eerder je schuldenvrij bent." />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── DE HORIZON ─────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="grid gap-12 md:grid-cols-2 mb-10 items-start">
              <div>
                <p className="mb-2 text-xs font-medium tracking-widest uppercase text-purple-600">
                  De Horizon — Jouw toekomst
                </p>
                <h3 className="text-2xl font-bold tracking-tight text-zinc-900 mb-4 md:text-3xl">
                  <span className="text-purple-600">NL-specifiek</span> plannen naar financiele vrijheid
                </h3>
                <p className="text-sm leading-relaxed text-zinc-500">
                  Geen internationale tool die het Nederlandse systeem niet snapt.
                  TriFinity begrijpt Box 3, AOW, werkgeverspensioen en hypotheekrenteaftrek
                  — en vertaalt het naar jouw vrijheidspad.
                </p>
              </div>
              <div className="flex items-center">
                <div className="w-full rounded-xl border border-purple-200 bg-purple-50 p-6">
                  <p className="text-sm leading-relaxed text-zinc-700 italic">
                    &ldquo;Je bent op koers voor vrijheid op je 52e. Met je Box 3 optimalisatie bespaar je 14 maanden. Met je huidige acties haal je het op je 51e.&rdquo;
                  </p>
                  <span className="mt-3 block text-xs font-medium uppercase tracking-wider text-purple-600">
                    — Hoe Will navigeert
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard domain="horizon" icon={<span>&#128176;</span>} title="Box 3 optimalisatie" description="Bereken de belastingimpact op je vermogensgroei en optimaliseer je Box 3 strategie." />
              <FeatureCard domain="horizon" icon={<span>&#127981;</span>} title="AOW-bridge calculator" description="Hoeveel buffer heb je nodig tot de AOW-leeftijd? Bereken de gap en dicht hem." />
              <FeatureCard domain="horizon" icon={<span>&#128188;</span>} title="Werkgeverspensioen" description="Integreer je werkgeverspensioen voor een compleet totaalbeeld van je financiele toekomst." />
              <FeatureCard domain="horizon" icon={<span>&#8734;</span>} title="FIRE-datum tracker" description="Wanneer bereik je financiele onafhankelijkheid? Countdown in dagen, met optimistisch en pessimistisch scenario." />
            </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* ── AI COACH SHOWCASE ────────────────────────────────── */}
      <section id="ai-coaches" className="border-y border-zinc-200 bg-zinc-50 px-6 py-20">
        <Reveal className="mx-auto max-w-3xl">
          <p className="mb-4 text-center text-xs font-medium tracking-widest uppercase text-zinc-400">
            Je persoonlijke AI-coach
          </p>
          <h2 className="text-center text-2xl font-bold tracking-tight text-zinc-900 mb-4 md:text-3xl">
            Maak kennis met <span className="text-teal-600">Will</span>
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center text-sm text-zinc-500 leading-relaxed">
            Will is je AI-coach die je volledige financiele context kent. Geen generieke tips,
            maar gesprekken die aansluiten bij jouw vermogen, jouw keuzes en jouw toekomst.
            Stel een vraag in gewoon Nederlands — Will vertaalt het naar inzicht en actie.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-white p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-600">De Kern</p>
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-sm text-zinc-600 italic leading-relaxed">
                  &ldquo;Je vermogen is 14 maanden vrijheid waard — 2 maanden meer dan vorig kwartaal.&rdquo;
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-teal-200 bg-white p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-teal-600">De Wil</p>
              <div className="rounded-lg bg-teal-50 p-4">
                <p className="text-sm text-zinc-600 italic leading-relaxed">
                  &ldquo;Schrap twee streaming-abonnementen en beleg het verschil — 12 dagen vrijheid per jaar.&rdquo;
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-purple-200 bg-white p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-purple-600">De Horizon</p>
              <div className="rounded-lg bg-purple-50 p-4">
                <p className="text-sm text-zinc-600 italic leading-relaxed">
                  &ldquo;Met je huidige tempo bereik je FIRE op je 51e. Die extra aflossing versnelt dat 8 maanden.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── GEBOUWD VOOR NEDERLAND ────────────────────────────── */}
      <section className="px-6 py-24 md:py-32">
        <Reveal className="mx-auto max-w-4xl text-center">
          <p className="mb-2 text-xs font-medium tracking-widest uppercase text-zinc-400">
            Geen internationale tool die NL niet snapt
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-10 md:text-3xl">
            Gebouwd voor <span className="text-orange-600">Nederland</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:shadow-md">
              <p className="text-sm font-semibold text-zinc-900 mb-1">NL-bankintegratie</p>
              <p className="text-sm text-zinc-500">MT940 en CAMT.053 import van alle Nederlandse banken.</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:shadow-md">
              <p className="text-sm font-semibold text-zinc-900 mb-1">Box 3 berekening</p>
              <p className="text-sm text-zinc-500">Fictief rendement, vrijstelling en belastingdruk automatisch berekend.</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:shadow-md">
              <p className="text-sm font-semibold text-zinc-900 mb-1">AOW-integratie</p>
              <p className="text-sm text-zinc-500">AOW-leeftijd en uitkering meegenomen in je vrijheidsprojectie.</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:shadow-md">
              <p className="text-sm font-semibold text-zinc-900 mb-1">Werkgeverspensioen</p>
              <p className="text-sm text-zinc-500">Pensioenfonds-data integreren voor een compleet financieel beeld.</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:shadow-md">
              <p className="text-sm font-semibold text-zinc-900 mb-1">Euro-gebaseerd</p>
              <p className="text-sm text-zinc-500">Geen USD-omrekeningen. Alles in euro&apos;s, zoals het hoort.</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:shadow-md">
              <p className="text-sm font-semibold text-zinc-900 mb-1">Nederlandse taal</p>
              <p className="text-sm text-zinc-500">Volledig Nederlandstalig. Will spreekt je eigen taal.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── DOELGROEP-HERKENNING ──────────────────────────────── */}
      <section id="voor-wie" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <p className="mb-8 text-center text-xs font-medium tracking-widest uppercase text-zinc-400">
            Voor wie is TriFinity?
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:shadow-md">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-lg">
                <span>&#128293;</span>
              </div>
              <h4 className="font-bold text-zinc-900 mb-2">FIRE-strijder</h4>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Je wilt financiele onafhankelijkheid, maar mist een Nederlandse tool die Box 3,
                AOW en werkgeverspensioen meeneemt in je FIRE-berekening.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:shadow-md">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-lg">
                <span>&#128188;</span>
              </div>
              <h4 className="font-bold text-zinc-900 mb-2">Bewuste professional</h4>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Goed inkomen, maar geen grip op waar het naartoe gaat. Je wilt slimmer met geld
                omgaan zonder een tweede baan van spreadsheets.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:shadow-md">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-lg">
                <span>&#127758;</span>
              </div>
              <h4 className="font-bold text-zinc-900 mb-2">Expat in Nederland</h4>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Je navigeert het Nederlandse belastingstelsel en mist een tool die lokale regelgeving
                begrijpt en je totaalbeeld compleet maakt.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:shadow-md">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-lg">
                <span>&#128107;</span>
              </div>
              <h4 className="font-bold text-zinc-900 mb-2">Samen plannen</h4>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Als koppel jullie financiele toekomst vormgeven. Gezamenlijk overzicht, gedeelde
                doelen, en samen toewerken naar vrijheid.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── INFINITY ───────────────────────────────────────── */}
      <section className="px-6 py-24 text-center bg-zinc-50">
        <Reveal>
          <div className="mb-6 text-7xl font-bold leading-none bg-gradient-to-r from-amber-500 via-teal-500 to-purple-500 bg-clip-text text-transparent animate-[infinity-pulse_4s_ease-in-out_infinite] md:text-9xl">
            &#8734;
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 max-w-lg mx-auto mb-4 md:text-3xl">
            Het ultieme doel: je tijd is volledig van jou
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
            Het moment waarop je passief inkomen je uitgaven dekt. Niet om te stoppen
            met werken — maar om te kiezen of je het doet.
          </p>
        </Reveal>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────── */}
      <section id="start" className="px-6 pt-24 pb-32 text-center">
        <Reveal>
          {/* 5 unieke pijlers */}
          <div className="mx-auto mb-10 max-w-2xl grid grid-cols-2 gap-x-6 gap-y-3 text-left sm:grid-cols-3 md:flex md:justify-center md:gap-8 md:text-center">
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              Tijd-perspectief
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <div className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
              AI-coaching
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <div className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
              NL-specifiek
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0" />
              Drie domeinen
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-900 shrink-0" />
              FIRE-focus
            </div>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 max-w-2xl mx-auto mb-4 md:text-4xl lg:text-5xl">
            Klaar om te ontdekken hoeveel{' '}
            <span className="bg-gradient-to-r from-amber-500 via-teal-500 to-purple-500 bg-clip-text text-transparent">
              vrijheid
            </span>{' '}
            je al hebt?
          </h2>
          <p className="text-base text-zinc-500 max-w-md mx-auto mb-10 leading-relaxed">
            Financiële administratie, AI-coaching en FIRE-planning — gebouwd voor Nederland.
          </p>
          <Link
            href="/signup"
            className="inline-block rounded-lg bg-zinc-900 px-8 py-3.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Start gratis met TriFinity
          </Link>
        </Reveal>
      </section>
    </>
  )
}
