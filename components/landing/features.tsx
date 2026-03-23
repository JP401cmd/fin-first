'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, ShieldCheck, Lock, Eye, Fingerprint, DatabaseZap, ToggleRight, Hourglass, BarChart3, ArrowDownToLine, TrendingUp, Sparkles, Lightbulb, GitBranch, Zap, Landmark, ArrowRightLeft, Briefcase, Flame } from 'lucide-react'

// ── Reveal on scroll ─────────────────────────────────────────

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
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

// ── Sectie-scheidingslijn ─────────────────────────────────────

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

// ── Klikbare feature card ─────────────────────────────────────

type CardExpanded = {
  explanation: string
  example?: {
    label: string
    lines: string[]
  }
}

function FeatureCard({
  icon,
  title,
  description,
  iconClass,
  expanded,
}: {
  icon: ReactNode
  title: string
  description: string
  iconClass: string
  expanded: CardExpanded
}) {
  const [open, setOpen] = useState(false)

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className={`w-full rounded-[var(--r-lg)] border bg-[var(--paper)] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--s1)] ${
        open
          ? 'border-[var(--border-md)] shadow-[var(--s1)]'
          : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
      }`}
    >
      {/* Kaart-header */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] border text-base ${iconClass}`}
        >
          {icon}
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </div>

      <h4 className="mb-1 mt-3 font-sans text-sm font-semibold text-[var(--ink)]">{title}</h4>
      <p className="font-serif text-sm leading-relaxed text-[var(--ink-3)]">{description}</p>

      {/* Uitklapbare inhoud */}
      {open && (
        <div className="mt-4 border-t border-dashed border-[var(--border-ed)] pt-4">
          <p className="mb-3 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
            {expanded.explanation}
          </p>
          {expanded.example && (
            <div className="rounded-[var(--r-sm)] bg-[var(--subtle)] px-3 py-2.5">
              <p className="mb-1.5 font-sans text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-4)]">
                {expanded.example.label}
              </p>
              {expanded.example.lines.map((line, i) => (
                <p key={i} className="font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
                  {line}
                </p>
              ))}
            </div>
          )}
          <p className="mt-3 font-sans text-[10px] font-medium text-[var(--ink-4)]">
            Klik nogmaals om te sluiten ↑
          </p>
        </div>
      )}
    </button>
  )
}

// ── Citaat-blok ───────────────────────────────────────────────

function QuoteBlock({
  quote,
  attribution,
  borderColor,
  bgClass,
  borderClass,
}: {
  quote: string
  attribution: string
  borderColor: string
  bgClass: string
  borderClass: string
}) {
  return (
    <div className={`rounded-[var(--r-lg)] border p-6 ${borderClass} ${bgClass}`}>
      <div className="border-l-[3px] pl-4" style={{ borderLeftColor: borderColor }}>
        <p className="font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
          {quote}
        </p>
      </div>
      <span
        className="mt-4 block font-sans text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color: borderColor }}
      >
        {attribution}
      </span>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────

export function Features() {
  return (
    <>
      {/* ── HET PROBLEEM ─────────────────────────────────────── */}
      <section id="pijn" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-28">
        <Reveal className="mx-auto max-w-5xl">
          <p className="mb-4 text-center font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Het probleem
          </p>
          <h2 className="mb-10 text-center font-display text-[2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-[2.6rem]">
            Je financiële leven staat verspreid{' '}
            <em className="italic text-wil-600">over zeven apps</em>
          </h2>

          <div className="mb-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: 'Losse apps',
                body: 'YNAB voor budgetten. Excel voor vermogen. Broker-apps voor beleggen. Pensioenportalen voor later. Alles staat los.',
                accentColor: 'var(--color-kern-300)',
              },
              {
                title: 'Geen tijdperspectief',
                body: 'Niemand vertelt je hoeveel vrijheid je hebt. Hoeveel maanden kun je leven van je vermogen? Je weet het niet.',
                accentColor: 'var(--color-wil-300)',
              },
              {
                title: 'Handmatig bijhouden',
                body: 'Elke maand spreadsheets bijwerken, transacties categoriseren, zelf berekeningen maken. Financiën als bijbaan.',
                accentColor: 'var(--color-horizon-300)',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[var(--r-lg)] border border-l-[4px] border-[var(--border-ed)] bg-[var(--paper)] p-5"
                style={{ borderLeftColor: item.accentColor }}
              >
                <p className="mb-2 font-sans text-sm font-semibold text-[var(--ink)]">{item.title}</p>
                <p className="font-serif text-sm leading-relaxed text-[var(--ink-3)]">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto max-w-2xl rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--paper)] px-8 py-6 text-center">
            <p className="font-serif text-lg leading-relaxed text-[var(--ink-2)]">
              TriFinity geeft je inzicht, grip en vooruitzicht op je financiële
              leven &mdash; alles op één plek, in één taal:{' '}
              <strong className="font-semibold text-[var(--ink)]">tijd</strong>.
            </p>
          </div>
        </Reveal>
      </section>

      <SectionRule label="Drie domeinen" />

      {/* ── DOMEINEN INTRO ────────────────────────────────────── */}
      <section id="domeinen" className="px-6 pb-4 text-center md:px-12">
        <Reveal>
          <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Hoe TriFinity werkt
          </p>
          <h2 className="font-display text-[1.8rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2.2rem]">
            Alles wat je nodig hebt — in drie domeinen
          </h2>
          <p className="mx-auto mt-3 max-w-xl font-serif text-base leading-relaxed text-[var(--ink-3)]">
            Klik op een kaart voor meer uitleg en een concreet voorbeeld.
          </p>
        </Reveal>
      </section>

      {/* ── DE KERN ──────────────────────────────────────────── */}
      <section className="px-6 pt-14 pb-20 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="mb-4 h-1 w-12 rounded-full bg-kern-500" />
            <div className="mb-8 grid items-start gap-10 md:grid-cols-2 md:gap-16">
              <div>
                <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-kern-600">
                  De Kern — Ken je werkelijkheid
                </p>
                <h3 className="mb-4 font-display text-[1.7rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2rem]">
                  Je nettovermogen, bezittingen en{' '}
                  <span className="text-kern-600">uitgaven</span> — <em>helder en eerlijk</em>
                </h3>
                <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
                  Wat bezit je, wat ben je schuldig, wat geef je uit? De Kern brengt
                  alles samen: je nettovermogen in euro&apos;s, je vrijheidstijd in
                  maanden en jaren, je budget als je dat wilt. Begin simpel of ga zo
                  diep als je wilt.
                </p>
              </div>
              <QuoteBlock
                quote='"Je vaste lasten kosten je 23 vrijheidsdagen per maand. Je boodschappenbudget nog eens 4,1 dagen. Je spaarquote geeft je 8 dagen terug. Per saldo bouw je 0,9 dag vrijheid per maand op."'
                attribution="— Hoe TriFinity je maand samenvat"
                borderColor="var(--color-kern-500)"
                bgClass="bg-kern-50/60"
                borderClass="border-kern-200"
              />
            </div>
          </Reveal>
          <Reveal>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                icon={<Hourglass className="h-4 w-4" />}
                title="Vrijheidstijdlijn"
                description="Je totale vermogen vertaald naar jaren en maanden vrijheid — direct zichtbaar wat je hebt opgebouwd."
                iconClass="bg-kern-50 border-kern-100 text-kern-600"
                expanded={{
                  explanation:
                    'Elk onderdeel van je vermogen wordt omgezet naar vrijheidstijd op basis van je persoonlijke maanduitgaven. Netto vermogen in jaren. Maanduitgaven in dagequivalenten. Zo zie je niet alleen wat je hebt, maar hoe lang je ervan kunt leven.',
                  example: {
                    label: 'Voorbeeld berekening',
                    lines: [
                      '€ 280.000 netto vermogen',
                      '÷ € 3.200 / maand uitgaven',
                      '= 87,5 maanden = 7 jr 3 mnd vrijheid',
                      '',
                      'Maandlasten: 32 dgn → te hoog',
                      'Spaarquote 22% → +7 dgn/mnd',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<BarChart3 className="h-4 w-4" />}
                title="Budgetbeheer"
                description="Stel budgetten in per categorie en zie hoeveel vrijheidsdagen elke euro kost. Vier visualisatiemodi."
                iconClass="bg-kern-50 border-kern-100 text-kern-600"
                expanded={{
                  explanation:
                    'Vier visualisatiemodi: lijstweergave, boomdiagram, Sankey-geldstroom en maandvergelijking. Klik op een categorie voor de onderliggende transacties. Elk budget toont niet alleen een euro-bedrag, maar ook het equivalent in vrijheidsdagen — zodat je voelt wat een keuze echt kost.',
                  example: {
                    label: 'Budget deze maand',
                    lines: [
                      'Boodschappen  €412 / €480 = 4,1 dgn',
                      'Transport     €198 / €220 = 2,0 dgn',
                      'Abonnementen  €87  / €80  = 0,9 dgn ⚠',
                      'Uit eten      €230 / €200 = 2,3 dgn ⚠',
                      '',
                      'Totaal uitgaven: 21,4 vrijheidsdagen',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<ArrowDownToLine className="h-4 w-4" />}
                title="Transacties & Import"
                description="Importeer bankbestanden van alle NL-banken. Automatische categorisatie en AI-patroonherkenning."
                iconClass="bg-kern-50 border-kern-100 text-kern-600"
                expanded={{
                  explanation:
                    'Importeer via MT940, CAMT.053 of CSV van alle Nederlandse banken. TriFinity categoriseert automatisch op basis van beschrijving en tegenpartij. AI herkent terugkerende patronen, abonnementen en ongebruikelijke uitgaven. Zoek, filter en tag transacties.',
                  example: {
                    label: 'Import ING-bankrekening',
                    lines: [
                      '① Download MT940 in ING Mijn ING',
                      '② Upload in TriFinity (drag & drop)',
                      '③ 127 transacties geïmporteerd',
                      '④ 94% automatisch gecategoriseerd',
                      '⑤ 3 nieuwe abonnementen herkend',
                      '⏱  Doorlooptijd: ~12 seconden',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<TrendingUp className="h-4 w-4" />}
                title="Vermogen & Schulden"
                description="Volledig netto-vermogensoverzicht: beleggingen, spaargeld, vastgoed, pensioenopbouw en schulden."
                iconClass="bg-kern-50 border-kern-100 text-kern-600"
                expanded={{
                  explanation:
                    'Alle assets op één plek: spaarrekeningen, beleggingsportefeuille, crypto, vastgoed en pensioenopbouw. Schulden met afbouwgrafiek en resterende looptijd. Het nettovermogen is je werkelijke vrijheidskapitaal — en groeit elke maand zichtbaar.',
                  example: {
                    label: 'Netto-vermogensoverzicht',
                    lines: [
                      'Beleggingen (IBKR)  + €45.200',
                      'Spaargeld           + €22.800',
                      'Eigen woning WOZ    +€182.000',
                      'Hypotheek           − €141.500',
                      'Studielening        −   €8.400',
                      '─────────────────────────────',
                      'Netto vrijheidskapitaal €100.100',
                      '= 31 maanden vrijheid',
                    ],
                  },
                }}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── DE WIL ───────────────────────────────────────────── */}
      <section className="bg-[var(--subtle)] px-6 pt-14 pb-20 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="mb-4 h-1 w-12 rounded-full bg-wil-500" />
            <div className="mb-8 grid items-start gap-10 md:grid-cols-2 md:gap-16">
              <div className="order-2 md:order-1">
                <QuoteBlock
                  quote='"Die abonnementen kosten je 7 dagen vrijheid per jaar. Halveer ze, beleg het verschil, en je koopt jezelf een halfjaar eerder vrij. Wat kies je?"'
                  attribution="— Hoe Will je uitdaagt"
                  borderColor="var(--color-wil-500)"
                  bgClass="bg-wil-50/60"
                  borderClass="border-wil-200"
                />
              </div>
              <div className="order-1 md:order-2">
                <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-wil-600">
                  De Wil — Neem de regie
                </p>
                <h3 className="mb-4 font-display text-[1.7rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2rem]">
                  Gepersonaliseerde{' '}
                  <span className="text-wil-600"><em>inzichten en acties</em></span>{' '}
                  voor jouw situatie
                </h3>
                <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
                  De Wil combineert jouw financiële data met AI om je te laten zien
                  wat je nu kunt doen. Persoonlijke inzichten over je uitgaven, maar
                  ook signalen van buiten: belastingwijzigingen, rentestand en
                  marktontwikkelingen — vertaald naar impact op jou.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                icon={<Sparkles className="h-4 w-4" />}
                title="Persoonlijke AI-coach"
                description="Will kent je complete situatie en helpt je over alle domeinen heen. Stel vragen in gewoon Nederlands."
                iconClass="bg-wil-50 border-wil-100 text-wil-600"
                expanded={{
                  explanation:
                    'Will heeft toegang tot je volledige financiële context: vermogen, budgethistorie, uitgavenpatronen, schulden en toekomstdoelen. Stel elke financiële vraag in gewoon Nederlands — Will geeft een concreet antwoord dat specifiek op jouw situatie is afgestemd, niet op een gemiddelde.',
                  example: {
                    label: 'Voorbeeldgesprek met Will',
                    lines: [
                      'Jij: "Kan ik me een sabbatical van',
                      '      3 maanden veroorloven?"',
                      '',
                      'Will: "Ja, maar je FIRE-datum schuift',
                      '       4,2 maanden op. Alternatief:',
                      '       verlof kopen via werkgever →',
                      '       impact slechts 1,1 maand."',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<Lightbulb className="h-4 w-4" />}
                title="Slimme aanbevelingen"
                description="AI analyseert je patronen en presenteert kansen — met euro-impact én vrijheidsdagen per aanbeveling."
                iconClass="bg-wil-50 border-wil-100 text-wil-600"
                expanded={{
                  explanation:
                    'Elke maand analyseert Will je financiële gedrag en genereert prioritaire aanbevelingen. Elke tip toont de inspanning (laag/midden/hoog), de euro-impact en het equivalent in vrijheidsdagen — zodat je zelf kunt prioriteren wat de meeste impact heeft.',
                  example: {
                    label: '3 aanbevelingen deze maand',
                    lines: [
                      '① Herverdeel €200 → ETF',
                      '   = +8 vrijheidsdagen/jaar  ★★★',
                      '',
                      '② Verhoog hypotheekaflossing',
                      '   = 4 mnd eerder vrij  ★★☆',
                      '',
                      '③ Optimaliseer Box 3 verdeling',
                      '   = €340 belastingbesparing  ★☆☆',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<GitBranch className="h-4 w-4" />}
                title="Scenario-analyse"
                description="Wat als je eerder stopt? Parttime gaat? Een huis koopt? Will simuleert en vergelijkt scenario's."
                iconClass="bg-wil-50 border-wil-100 text-wil-600"
                expanded={{
                  explanation:
                    "Speel scenario's door: eerder stoppen, jobchange, huis kopen, kind krijgen, sabbatical. Will simuleert de impact op je FIRE-datum, spaarquote en maandelijkse vrijheidstijd. Vergelijk maximaal drie scenario's naast elkaar in een overzichtelijke tijdlijn.",
                  example: {
                    label: "Scenario vergelijking",
                    lines: [
                      'A (huidig pad)    → FIRE op 52e',
                      'B (+€500/mnd sparen) → FIRE op 49e',
                      'C (parttime op 45e)  → FIRE op 53e',
                      '',
                      'Verschil A→B: 3 jaar eerder vrij',
                      'Kosten: €500/mnd = 5 dgn/mnd offer',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<Zap className="h-4 w-4" />}
                title="Schuldversneller"
                description="Avalanche of snowball — simuleer strategieën en zie hoeveel maanden eerder je schuldenvrij bent."
                iconClass="bg-wil-50 border-wil-100 text-wil-600"
                expanded={{
                  explanation:
                    'Voer al je schulden in met rente en minimumbetaling. Kies je strategie: Avalanche (hoogste rente eerst = minder totaalrente) of Snowball (kleinste schuld eerst = snelste motivatiemomenten). Zie het verschil in totale rentekosten en in maanden vrijheidsdatum.',
                  example: {
                    label: 'Voorbeeld: €18.000 schuld @ 6,5%',
                    lines: [
                      'Snowball: schuldenvrij in 37 mnd',
                      '  Totale rente: €3.240',
                      '',
                      'Avalanche: schuldenvrij in 34 mnd',
                      '  Totale rente: €2.890',
                      '  Besparing: €350 = 1,4 dgn vrijheid',
                    ],
                  },
                }}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── DE HORIZON ───────────────────────────────────────── */}
      <section className="px-6 pt-14 pb-20 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="mb-4 h-1 w-12 rounded-full bg-horizon-500" />
            <div className="mb-8 grid items-start gap-10 md:grid-cols-2 md:gap-16">
              <div>
                <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-horizon-600">
                  De Horizon — Zie je vrijheid groeien
                </p>
                <h3 className="mb-4 font-display text-[1.7rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2rem]">
                  Je <span className="text-horizon-600"><em>toekomst</em></span>{' '}
                  in jaren en maanden — elke keuze telt
                </h3>
                <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
                  Of je doel nu &apos;grip krijgen&apos; of &apos;met 50 stoppen&apos;
                  is — De Horizon laat je zien waar je naartoe gaat. What-if
                  scenario&apos;s, levensgebeurtenissen, en je vrijheidsgetal dat maand
                  na maand groeit.
                </p>
              </div>
              <QuoteBlock
                quote='"Je bent op koers voor vrijheid op je 52e. Met je Box 3 optimalisatie bespaar je 14 maanden. Met je huidige acties haal je het op je 51e."'
                attribution="— Hoe Will navigeert"
                borderColor="var(--color-horizon-500)"
                bgClass="bg-horizon-50/60"
                borderClass="border-horizon-200"
              />
            </div>
          </Reveal>
          <Reveal>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                icon={<Landmark className="h-4 w-4" />}
                title="Box 3 optimalisatie"
                description="Bereken je belastingdruk op werkelijk vermogen en optimaliseer je vermogensmix voor minimale Box 3 heffing."
                iconClass="bg-horizon-50 border-horizon-100 text-horizon-600"
                expanded={{
                  explanation:
                    'TriFinity berekent je fictief rendement op basis van je werkelijke vermogensverdeling (spaargeld, beleggingen, overig). Het toont je huidige belastingdruk en simuleert alternatieven: groene beleggingen (vrijstelling), Pillar-3 producten en optimale verdeling binnen je huishouden.',
                  example: {
                    label: 'Box 3 analyse dit jaar',
                    lines: [
                      'Vermogen 1 jan:   € 240.000',
                      'Heffingsvrij:     −  € 57.000',
                      'Belast:           € 183.000',
                      '',
                      'Huidig: €1.847 belasting/jaar',
                      'Geoptimaliseerd:  €1.240/jaar',
                      'Besparing: €607 = 2,3 dgn/jaar',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<ArrowRightLeft className="h-4 w-4" />}
                title="AOW-bridge calculator"
                description="Bereken de buffer die je nodig hebt tussen je FIRE-datum en de AOW-leeftijd — inclusief inflatie."
                iconClass="bg-horizon-50 border-horizon-100 text-horizon-600"
                expanded={{
                  explanation:
                    'Als je FIRE bereikt vóór je 67e, heb je een buffer nodig tot de AOW-leeftijd. TriFinity berekent de exacte gap op basis van je persoonlijke uitgaven, inflatiecorrectie (2% standaard) en de verwachte AOW-hoogte. Zo weet je precies hoeveel je moet hebben vóór je kunt stoppen.',
                  example: {
                    label: 'Bridge-berekening',
                    lines: [
                      'FIRE op 52e, AOW op 67e = 15 jr gap',
                      'Uitgaven: €2.400/mnd × 15 jr',
                      '+ inflatie (2%)  = € 497.000 nodig',
                      '',
                      'Huidig op koers: €380.000 @ 52e',
                      'Tekort: €117.000 → 4,5 jr extra',
                      'OF: spaar €650/mnd extra',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<Briefcase className="h-4 w-4" />}
                title="Werkgeverspensioen"
                description="Voer je UPO in en zie hoe je pensioen bijdraagt aan je totale vrijheidsprojectie en maandinkomen."
                iconClass="bg-horizon-50 border-horizon-100 text-horizon-600"
                expanded={{
                  explanation:
                    'Voer je Uniform Pensioen Overzicht (UPO) handmatig in of gebruik je jaarlijkse pensioenopgave. TriFinity rekent je verwachte uitkering mee in het totaalvermogen en de vrijheidsprojectie. Zo zie je wat je al "vastzit" en welk deel je zelf nog moet opbouwen.',
                  example: {
                    label: 'Pensioenintegratie',
                    lines: [
                      'Werkgeverspensioen: €890/mnd',
                      'AOW (verwacht):   +€1.350/mnd',
                      '─────────────────────────────',
                      'Passief inkomen 67e: €2.240/mnd',
                      '= 93% van huidige uitgaven',
                      '',
                      'Eigen FIRE-buffer nodig: €52.000',
                      '(alleen voor gap vóór 67e)',
                    ],
                  },
                }}
              />
              <FeatureCard
                icon={<Flame className="h-4 w-4" />}
                title="FIRE-datum tracker"
                description="Persoonlijke FIRE-projectie met drie rendementscenario's en een dagcountdown naar financiële onafhankelijkheid."
                iconClass="bg-horizon-50 border-horizon-100 text-horizon-600"
                expanded={{
                  explanation:
                    'Je FIRE-datum wordt berekend op basis van je actuele spaarquote, huidig vermogen en drie rendementscenario\'s. De projectie houdt rekening met AOW, werkgeverspensioen en inflatie. Elke euro extra die je spaart of belegt, verschuift de datum — TriFinity toont precies hoeveel.',
                  example: {
                    label: 'Jouw FIRE-projectie',
                    lines: [
                      'Pessimistisch (3%): FIRE op 54e',
                      'Realistisch   (5%): FIRE op 51e ✓',
                      'Optimistisch  (7%): FIRE op 49e',
                      '',
                      'Realistisch: 3 april 2039',
                      '= nog 4.721 dagen',
                      '',
                      '+€100/mnd extra → 2,8 mnd eerder',
                    ],
                  },
                }}
              />
            </div>
          </Reveal>
        </div>
      </section>

      <SectionRule label="Will — Je AI-coach" />

      {/* ── AI COACH SHOWCASE ────────────────────────────────── */}
      <section id="coach" className="px-6 py-16 md:px-12">
        <Reveal className="mx-auto max-w-4xl">
          <p className="mb-3 text-center font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Je persoonlijke AI-coach
          </p>
          <h2 className="mb-3 text-center font-display text-[1.8rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2.2rem]">
            Maak kennis met <span className="text-wil-600">Will</span>
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center font-serif text-base leading-relaxed text-[var(--ink-3)]">
            Will kent je volledige financiële context. Geen generieke tips — gesprekken die
            aansluiten bij jouw vermogen, jouw keuzes en jouw toekomst.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: 'De Kern',
                colorClass: 'text-kern-600',
                borderClass: 'border-kern-200',
                bgClass: 'bg-kern-50/70',
                borderL: 'var(--color-kern-400)',
                quote:
                  '"Je boodschappenbudget staat op €412 van €480. Maar je abonnementen zijn al €7 boven budget gegaan — wil je zien welke dat zijn?"',
              },
              {
                label: 'De Wil',
                colorClass: 'text-wil-600',
                borderClass: 'border-wil-200',
                bgClass: 'bg-wil-50/70',
                borderL: 'var(--color-wil-400)',
                quote:
                  '"Schrap twee streaming-abonnementen en beleg het verschil — dat levert je 12 vrijheidsdagen per jaar op."',
              },
              {
                label: 'De Horizon',
                colorClass: 'text-horizon-600',
                borderClass: 'border-horizon-200',
                bgClass: 'bg-horizon-50/70',
                borderL: 'var(--color-horizon-400)',
                quote:
                  '"Met je huidige tempo bereik je FIRE op je 51e. Die extra aflossing van €200/mnd versnelt dat met 8 maanden."',
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-[var(--r-lg)] border bg-[var(--paper)] p-5 ${item.borderClass}`}
              >
                <p
                  className={`mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.12em] ${item.colorClass}`}
                >
                  {item.label}
                </p>
                <div
                  className={`rounded-[var(--r)] p-4 border-l-[3px] ${item.bgClass}`}
                  style={{ borderLeftColor: item.borderL }}
                >
                  <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
                    {item.quote}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <SectionRule label="Gebouwd voor Nederland" />

      {/* ── NEDERLAND ────────────────────────────────────────── */}
      <section className="px-6 py-16 md:px-12">
        <Reveal className="mx-auto max-w-5xl">
          <p className="mb-3 text-center font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Geen internationale tool die NL niet snapt
          </p>
          <h2 className="mb-10 text-center font-display text-[1.8rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2.2rem]">
            Gebouwd voor <span className="text-kern-600">Nederland</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'NL-bankintegratie',
                body: 'MT940 en CAMT.053 import van alle Nederlandse banken. Geen handmatig overschrijven.',
              },
              {
                title: 'Box 3 berekening',
                body: 'Fictief rendement, vrijstelling en belastingdruk automatisch berekend op je werkelijke vermogen.',
              },
              {
                title: 'AOW-integratie',
                body: 'AOW-leeftijd en verwachte uitkering meegenomen in je volledige vrijheidsprojectie.',
              },
              {
                title: 'Werkgeverspensioen',
                body: 'Pensioenfonds-data integreren voor een compleet financieel beeld inclusief pensioen.',
              },
              {
                title: 'Euro-gebaseerd',
                body: "Geen USD-omrekeningen. Alles in euro's, nl-NL locale. Zoals het hoort.",
              },
              {
                title: 'Volledig Nederlands',
                body: 'Volledig Nederlandstalig. Will spreekt je eigen taal — geen "free days" maar "vrijheidsdagen".',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 transition-all duration-200 hover:border-[var(--border-md)] hover:shadow-[var(--s1)]"
              >
                <p className="mb-1.5 font-sans text-sm font-semibold text-[var(--ink)]">{item.title}</p>
                <p className="font-serif text-sm leading-relaxed text-[var(--ink-3)]">{item.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <SectionRule label="Voor wie" />

      {/* ── VOOR WIE ─────────────────────────────────────────── */}
      <section id="voor-wie" className="bg-[var(--subtle)] px-6 py-16 md:px-12">
        <Reveal className="mx-auto max-w-5xl">
          <p className="mb-3 text-center font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Voor wie is TriFinity?
          </p>
          <h2 className="mb-4 text-center font-display text-[1.8rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2.2rem]">
            Voor iedereen die meer wil bereiken met z&apos;n geld
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center font-serif text-base leading-relaxed text-[var(--ink-3)]">
            Je hoeft geen financieel expert te zijn. TriFinity is er voor iedereen die met
            een beetje inzicht en hulp meer uit z&apos;n geld &mdash; en z&apos;n tijd &mdash; wil halen.
          </p>

          {/* Vier persona-kaarten */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* De pensioenplanner */}
            <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--s1)]">
              <div className="mb-4 h-1 w-10 bg-horizon-500" />
              <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-horizon-600">
                Persona
              </p>
              <h4 className="mb-2 font-display text-base font-semibold text-[var(--ink)]">
                De pensioenplanner
              </h4>
              <p className="mb-1 font-serif text-sm font-medium text-[var(--ink-2)]">
                Wil weten of het pensioen straks genoeg is
              </p>
              <p className="mb-4 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                Wil het pensioengat in kaart brengen, weten of de AOW en werkgeverspensioen
                samen genoeg zijn, en wat extra inleggen oplevert.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'FIRE-prognose',
                  'AOW-integratie',
                  'Levensgebeurtenissen',
                  'What-if scenario\u2019s',
                  'Onttrekkingsstrategie',
                ].map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-horizon-500/10 px-2.5 py-0.5 text-[11px] font-medium text-horizon-700"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* De vermogensverdeler */}
            <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--s1)]">
              <div className="mb-4 h-1 w-10 bg-kern-500" />
              <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-kern-600">
                Persona
              </p>
              <h4 className="mb-2 font-display text-base font-semibold text-[var(--ink)]">
                De vermogensverdeler
              </h4>
              <p className="mb-1 font-serif text-sm font-medium text-[var(--ink-2)]">
                Op zoek naar overzicht over bezittingen en schulden
              </p>
              <p className="mb-4 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                Wil alles bij elkaar zien: spaargeld, beleggingen, hypotheek, schulden &mdash;
                en begrijpen hoe het samenhangt.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Nettovermogen',
                  'Portefeuille & allocatie',
                  'Schulden tracking',
                  'Box 3 berekening',
                  'Vermogensontwikkeling',
                ].map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-kern-500/10 px-2.5 py-0.5 text-[11px] font-medium text-kern-700"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* De budgetteerder */}
            <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--s1)]">
              <div className="mb-4 h-1 w-10 bg-wil-500" />
              <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-wil-600">
                Persona
              </p>
              <h4 className="mb-2 font-display text-base font-semibold text-[var(--ink)]">
                De budgetteerder
              </h4>
              <p className="mb-1 font-serif text-sm font-medium text-[var(--ink-2)]">
                Gedreven om grip te krijgen op uitgaven
              </p>
              <p className="mb-4 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                Wil weten waar het geld naartoe gaat, patronen herkennen, en bewust keuzes
                maken.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Bankimport',
                  'Automatische categorisatie',
                  'Budgetten',
                  'Uitgavenpatronen',
                  'Abonnementen-inzicht',
                ].map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-wil-500/10 px-2.5 py-0.5 text-[11px] font-medium text-wil-700"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
            {/* De financiële onafhankelijkheidsstrijder */}
            <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--s1)]">
              <div className="mb-4 h-1 w-10 bg-horizon-500" />
              <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-horizon-600">
                Persona
              </p>
              <h4 className="mb-2 font-display text-base font-semibold text-[var(--ink)]">
                De financi&euml;le onafhankelijkheidsstrijder
              </h4>
              <p className="mb-1 font-serif text-sm font-medium text-[var(--ink-2)]">
                Actief op weg naar financi&euml;le vrijheid en eerder stoppen
              </p>
              <p className="mb-4 font-serif text-sm leading-relaxed text-[var(--ink-3)]">
                Maximaliseert de spaarquote, optimaliseert rendement en wil zo snel mogelijk de
                FIRE-datum bereiken.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'FIRE-countdown',
                  'Spaarquote tracking',
                  'Rendement optimalisatie',
                  'Monte Carlo simulatie',
                  'Eerder stoppen analyse',
                ].map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-horizon-500/10 px-2.5 py-0.5 text-[11px] font-medium text-horizon-700"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Belofte-strip */}
          <div className="mt-8 border-t border-b border-[var(--border-ed)] bg-[var(--paper)] px-6 py-5 text-center">
            <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
              <strong className="font-semibold text-[var(--ink)]">De belofte:</strong>{' '}
              TriFinity past zich aan jou aan. Wil je alleen overzicht? Dat is genoeg. Wil je
              actief sturen? De app helpt. Droom je van financiële vrijheid? Je ziet het
              naderen.
            </p>
          </div>
        </Reveal>
      </section>

      <SectionRule label="Privacy & vertrouwen" />

      {/* ── PRIVACY & VERTROUWEN ──────────────────────────────── */}
      <section id="privacy" className="px-6 py-16 md:px-12">
        <Reveal className="mx-auto max-w-5xl">
          <p className="mb-3 text-center font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Privacy & vertrouwen
          </p>
          <h2 className="mb-4 text-center font-display text-[1.8rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2.2rem]">
            Jouw data, jouw controle
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center font-serif text-base leading-relaxed text-[var(--ink-3)]">
            TriFinity is gebouwd met privacy als fundament — niet als bijzaak.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                title: 'Geen namen of rekeningnummers naar AI',
                body: 'Alleen samenvattingen en geaggregeerde bedragen worden gedeeld met de AI-coach. Je persoonlijke gegevens, bankrekeningnummers en transactiedetails verlaten nooit de beveiligde omgeving.',
              },
              {
                icon: <Lock className="h-5 w-5" />,
                title: 'Zero-retention API',
                body: 'Je financiële data wordt niet bewaard door AI-providers en niet gebruikt voor training. Elk gesprek met Will is vluchtig — na het antwoord wordt de context gewist.',
              },
              {
                icon: <Eye className="h-5 w-5" />,
                title: 'Volledige controle',
                body: 'AI is volledig uitschakelbaar. TriFinity werkt zonder AI net zo goed — alle berekeningen, budgetten en projecties draaien lokaal. Jij bepaalt wat je deelt.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 transition-all duration-200 hover:border-[var(--border-md)] hover:shadow-[var(--s1)]"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)]">
                  {item.icon}
                </div>
                <h4 className="mb-2 font-sans text-sm font-semibold text-[var(--ink)]">{item.title}</h4>
                <p className="font-serif text-sm leading-relaxed text-[var(--ink-3)]">{item.body}</p>
              </div>
            ))}
          </div>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: <Fingerprint className="h-3.5 w-3.5" />, label: 'Privacy by Design' },
              { icon: <DatabaseZap className="h-3.5 w-3.5" />, label: 'Zero Data Retention' },
              { icon: <ToggleRight className="h-3.5 w-3.5" />, label: 'AI Opt-out' },
            ].map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-1.5 font-sans text-[11px] font-medium text-[var(--ink-3)]"
              >
                {badge.icon}
                {badge.label}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── VRIJHEID — HET ULTIEME DOEL ──────────────────────── */}
      <section className="px-6 py-28 text-center md:px-12">
        <Reveal>
          <div
            className="mb-6 font-display text-[6rem] font-bold leading-none text-[var(--ink-4)] md:text-[9rem]"
            aria-hidden="true"
          >
            ∞
          </div>
          <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
            Het ultieme doel
          </p>
          <h2 className="mx-auto mb-4 max-w-lg font-display text-[1.8rem] font-bold tracking-[-0.02em] text-[var(--ink)] md:text-[2.2rem]">
            Het moment waarop je tijd volledig van jou is
          </h2>
          <p className="mx-auto max-w-md font-serif text-base leading-relaxed text-[var(--ink-3)]">
            Niet om te stoppen met werken — maar om te kiezen of je het doet. Dat is financiële
            vrijheid. En het begint vandaag.
          </p>
        </Reveal>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────── */}
      <section
        id="start"
        className="border-t-2 border-[var(--ink)] bg-[var(--ink)] px-6 pb-28 pt-20 text-center md:px-12"
      >
        <Reveal>
          <div className="mx-auto mb-10 flex flex-wrap justify-center gap-x-8 gap-y-2">
            {[
              { label: 'Budgetbeheer', color: 'bg-kern-400' },
              { label: 'AI-coaching', color: 'bg-wil-400' },
              { label: 'FIRE-focus', color: 'bg-horizon-400' },
              { label: 'NL-specifiek', color: 'bg-[var(--ink-3)]' },
              { label: 'Transactie-import', color: 'bg-[var(--ink-2)]' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.color}`} />
                <span className="font-sans text-sm text-[var(--ink-4)]">{item.label}</span>
              </div>
            ))}
          </div>

          <h2 className="mx-auto mb-4 max-w-2xl font-display text-[2.2rem] font-bold tracking-[-0.02em] text-[var(--bg)] md:text-[2.8rem] lg:text-[3.2rem]">
            Klaar om te ontdekken hoeveel{' '}
            <em className="italic text-horizon-400">vrijheid</em>{' '}
            je al hebt?
          </h2>
          <p className="mx-auto mb-10 max-w-md font-serif text-base leading-relaxed text-[var(--ink-3)]">
            Financiële administratie, AI-coaching en FIRE-planning — gebouwd voor Nederland.
          </p>

          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-[var(--r)] border-2 border-[var(--bg)] bg-[var(--bg)] px-8 py-4 font-sans text-sm font-semibold text-[var(--ink)] transition-all hover:bg-[var(--subtle)] hover:shadow-[var(--s2)]"
          >
            Start gratis met TriFinity
          </Link>

          <p className="mt-6 font-serif italic text-sm text-[var(--ink-3)]">
            Geen creditcard vereist · Volledig privé · Gebouwd voor Nederland
          </p>
        </Reveal>
      </section>
    </>
  )
}
