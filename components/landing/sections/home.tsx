import type { ComponentType } from 'react'
import Link from 'next/link'
import { ArrowRight, ShieldCheck, Lock, Eye, Fingerprint } from 'lucide-react'
import { SectionRule } from '../section-primitives'
import {
  BriefingDemo,
  TijdasDemo,
  CashflowInzichtDemo,
  BalansDemo,
} from '../demo-mocks'
import { Reveal } from '../reveal'

/**
 * Home-secties van de marketing-site, opgehangen aan de merkbelofte:
 * "Ontdek waar je staat, plan waar je heen gaat." De hero draagt de
 * belofte; de vier pijler-secties hieronder (Inzicht → Grip → Nu →
 * Toekomst) werken haar uit — van weten waar je staat naar sturen en
 * vooruitkijken — elk met een demo-visual en een deeplink naar de
 * gespiegelde sectie op /functies.
 *
 * Eén primaire CTA ("Begin gratis" → /signup) leeft in de Hero en de
 * afsluitende SlotCta (door de Footer gerenderd).
 */

// ── De vier pijlers van de belofte ───────────────────────────────────

interface Pijler {
  id: string
  naam: string
  deel: string
  titel: string
  italics: string
  body: string
  bullets: string[]
  accent: string
  linkLabel: string
  Visual: ComponentType
  subtle: boolean
  omgekeerd: boolean
}

const PIJLERS: Pijler[] = [
  {
    id: 'inzicht',
    naam: 'Inzicht',
    deel: 'Pijler 1 van 4',
    titel: 'Inzicht',
    italics: 'in elke euro',
    body:
      'Zien wat er werkelijk gebeurt is de eerste vorm van vrijheid. TriFinity houdt het overzicht voor je bij — jij hoeft alleen te kijken.',
    bullets: [
      'Transacties, automatisch gecategoriseerd',
      'Budgetten die meebewegen met je leven',
      'Je vermogen in één rustig beeld',
      'Groei zichtbaar in euro’s én vrijheidsdagen',
    ],
    accent: 'var(--color-kern-600)',
    linkLabel: 'Zo werkt inzicht in de app',
    Visual: CashflowInzichtDemo,
    subtle: true,
    omgekeerd: false,
  },
  {
    id: 'grip',
    naam: 'Grip',
    deel: 'Pijler 2 van 4',
    titel: 'Grip',
    italics: 'zonder spreadsheet-avonden',
    body:
      'Grip is niet alles zelf bijhouden — het is op tijd weten waar je iets van moet vinden. Fin, je AI-coach, let mee op jouw cijfers.',
    bullets: [
      'Gepersonaliseerde constateringen uit jouw cijfers',
      'Concrete suggesties bij doelen en keuzes',
      'Financieel nieuws dat over jouw situatie gaat',
      'Notificaties wanneer iets aandacht vraagt',
    ],
    accent: 'var(--color-wil-600)',
    linkLabel: 'Zo werkt grip in de app',
    Visual: BriefingDemo,
    subtle: false,
    omgekeerd: true,
  },
  {
    id: 'nu',
    naam: 'Nu',
    deel: 'Pijler 3 van 4',
    titel: 'Het nu',
    italics: 'scherp in beeld',
    body:
      'Vandaag op orde: wat heb je, wat geef je uit, en wat ligt er maandelijks vast? Je huidige vermogen en cashflow, zonder spreadsheet.',
    bullets: [
      'Bezittingen en schulden — je hele vermogen bij elkaar',
      'Cashflow met al je transacties',
      'Abonnementen en vaste lasten in beeld',
    ],
    accent: 'var(--color-kern-600)',
    linkLabel: 'Zo werkt het nu in de app',
    Visual: BalansDemo,
    subtle: true,
    omgekeerd: false,
  },
  {
    id: 'toekomst',
    naam: 'Toekomst',
    deel: 'Pijler 4 van 4',
    titel: 'De toekomst',
    italics: 'eerlijk doorgerekend',
    body:
      'De toekomst is geen belofte maar een berekening — met bandbreedte in plaats van een gladde lijn, op basis van jóuw wensen en plannen.',
    bullets: [
      'Eerlijke projectie van je vermogen',
      'Wensen en levensgebeurtenissen op je tijdas',
      'End-of-life voorkeuren: wat mag er overblijven?',
    ],
    accent: 'var(--color-horizon-600)',
    linkLabel: 'Zo werkt de toekomst in de app',
    Visual: TijdasDemo,
    subtle: false,
    omgekeerd: true,
  },
]

function PijlerSectie({ pijler }: { pijler: Pijler }) {
  const { Visual } = pijler
  return (
    <>
      <SectionRule label={pijler.naam} />
      <section
        id={pijler.id}
        className={`px-6 py-16 md:px-12 md:py-20 ${pijler.subtle ? 'bg-[var(--subtle)]' : ''}`}
      >
        <Reveal className="mx-auto max-w-6xl">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
            {/* Tekstkolom */}
            <div className={pijler.omgekeerd ? 'md:order-2' : ''}>
              <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                {pijler.deel}
              </p>
              <h2 className="mb-4 font-display text-[1.8rem] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-[2.2rem]">
                {pijler.titel}{' '}
                <em className="italic text-kern-600">{pijler.italics}</em>
              </h2>
              <p className="mb-6 max-w-md font-serif text-base leading-relaxed text-[var(--ink-2)]">
                {pijler.body}
              </p>
              <ul className="mb-7 space-y-2.5">
                {pijler.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 font-serif text-sm text-[var(--ink-2)]">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: pijler.accent }}
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/functies#${pijler.id}`}
                className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-kern-700 hover:underline"
              >
                {pijler.linkLabel}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>

            {/* Visual */}
            <div className={pijler.omgekeerd ? 'md:order-1' : ''}>
              <div className="mx-auto max-w-md">
                <Visual />
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}

export function BeloftePijlers() {
  return (
    <>
      {PIJLERS.map((p) => (
        <PijlerSectie key={p.id} pijler={p} />
      ))}
    </>
  )
}

// ── Filosofie — waarom zo ────────────────────────────────────────────

export function Filosofie() {
  return (
    <>
      <SectionRule label="Waarom zo" />
      <section id="filosofie" className="bg-[var(--subtle)] px-6 py-16 md:px-12 md:py-20">
        <Reveal className="mx-auto max-w-3xl">
          <div className="border-l-[3px] border-kern-400 pl-6 md:pl-8">
            <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              De kerngedachte
            </p>

            {/* Groot serif-citaat — de kern van de filosofie */}
            <p className="mb-6 font-display text-[1.7rem] font-bold italic leading-tight tracking-[-0.01em] text-[var(--ink)] md:text-[2.1rem]">
              Geld is opgeslagen{' '}
              <span className="text-kern-600">tijd.</span>
            </p>

            <div className="space-y-4 font-serif text-base leading-relaxed text-[var(--ink-2)] md:text-lg">
              <p>
                Achter elk bedrag op je rekening zit iets eenvoudigs en
                menselijks: tijd. Tijd die je hebt gewerkt — en tijd die je
                straks vrij kunt besteden.
              </p>
              <p>
                Daarom rekent TriFinity je financiën niet alleen om naar
                euro&apos;s, maar naar vrijheid in jaren, maanden en dagen. Niet
                om je te laten schrikken, maar om elke keuze betekenis te geven:{' '}
                <em className="italic text-[var(--ink)]">
                  dit kost me drie vrijheidsdagen, dit levert er dertig op.
                </em>
              </p>
            </div>

            <div className="mt-7">
              <Link
                href="/veiligheid#methodologie"
                className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-kern-700 hover:underline"
              >
                Lees hoe we rekenen
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}

// ── Trust-strip — vertrouwen ─────────────────────────────────────────

const TRUST_ITEMS = [
  { Icon: ShieldCheck, label: 'EU-hosted (Ierland)' },
  { Icon: Lock, label: 'Wij verkopen je data niet' },
  { Icon: Eye, label: 'Open methodologie' },
  { Icon: Fingerprint, label: 'Export altijd mogelijk' },
] as const

export function TrustStrip() {
  return (
    <>
      <SectionRule label="Vertrouwen" />
      <section
        id="vertrouwen"
        className="border-y border-[var(--border-ed)] bg-[var(--subtle)] px-6 py-12 md:px-12"
      >
        <Reveal className="mx-auto max-w-4xl text-center">
          {/* Vier korte, ware trust-items naast elkaar */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {TRUST_ITEMS.map(({ Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 font-sans text-xs font-medium text-[var(--ink-2)]"
              >
                <Icon className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>

          {/* Eén eerlijke zin — geen verzonnen badges of aantallen */}
          <p className="mx-auto mt-7 max-w-xl font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
            Geen advies in de zin van de Wft — wel eerlijk rekenwerk.
          </p>
          <div className="mt-4">
            <Link
              href="/veiligheid"
              className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-kern-700 hover:underline"
            >
              Lees hoe we met je data omgaan
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  )
}

// ── Prijs-teaser — wat ───────────────────────────────────────────────

export function PrijsTeaser() {
  return (
    <>
      <SectionRule label="Prijs" />
      <section id="prijs" className="px-6 py-16 md:px-12 md:py-20">
        <Reveal className="mx-auto max-w-2xl">
          <div className="rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--paper)] px-8 py-8 text-center">
            <p className="font-serif text-lg leading-relaxed text-[var(--ink-2)]">
              Gratis om te beginnen.{' '}
              <strong className="font-semibold text-[var(--ink)]">
                Pro voor €9 per maand
              </strong>
              , wanneer je verder wilt.
            </p>
            <div className="mt-5">
              <Link
                href="/prijzen"
                className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-kern-700 hover:underline"
              >
                Bekijk de prijzen
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}
