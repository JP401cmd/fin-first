'use client'

/**
 * JaaroverzichtClient — "Jouw <jaar> in vrijheid" op /mijn/jaaroverzicht.
 *
 * Een voorpagina over één afgelopen jaar: vier genummerde katernen (vrijheids-
 * dagen · vermogensgroei · spaarmaanden · naar volledige vrijheid) en een
 * afsluitende kassabon. Alles is historie — gerealiseerde bedragen, geen
 * projectie — dus er is bewust géén euro-weergave-deflator in het spel
 * (ADR 0090/0093 gaat over projectierijen).
 *
 * ── Datapad ────────────────────────────────────────────────────────────────
 * On-demand client-read via de bestaande API-route `/api/year-in-review`
 * (ADR 0058: lazy read die niet in een loader-bundel past loopt via `fetch`).
 * Géén directe Supabase-read uit de browser.
 *
 * ── Consume, don't recompute ───────────────────────────────────────────────
 * Elk getal op dit scherm komt kant-en-klaar uit de route: vrijheidsdagen,
 * beste/slechtste maand, vermogensdelta én -percentage, het vrijheids-
 * percentage begin/eind en de spaarquote. Dit bestand telt niets op en deelt
 * niets — het formatteert alleen. De enige afgeleide is de €→vrijheidstijd-
 * conversie, en die draait op de canonieke helpers uit `lib/format.ts`
 * (`dailyExpenseRate` + `calculateFreedomTime`) met de gerealiseerde uitgaven
 * van hetzelfde jaar als grondslag; zie `dagtariefVanJaar` hieronder.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { CalendarRange, Share2 } from 'lucide-react'
import type { YearInReviewData } from '@/app/api/year-in-review/route'
import {
  Button,
  ComparisonRow,
  OrnamentColophon,
  PageInfoButton,
  PageOpening,
  RekeningTag,
  SectionLabel,
} from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  calculateFreedomTime,
  credibleDailyExpense,
  dailyExpenseRate,
  formatFreedomTimeString,
  formatTimestamp,
} from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { PAGE_INFO } from '@/lib/page-info-content'

/**
 * De deel-sheet draagt de hele deel-flow (standen-keuze, kaart-preview,
 * ShareDialog) en trekt de canvas-renderer mee. Dynamisch geladen zodat die
 * bundel pas bij een klik binnenkomt — spiegelt `milestone-celebration-host`.
 */
const DeelKaartSheet = dynamic(
  () => import('@/components/app/deel-kaart-sheet').then((m) => m.DeelKaartSheet),
  { ssr: false },
)

// ── Formatters (weergave, geen rekenwerk) ───────────────────────────────────

const NL_1 = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

/** "12,5" — dagen en procenten in nl-NL, maximaal één decimaal. */
function nummer(value: number): string {
  return NL_1.format(value)
}

/** "23,4%" met expliciet teken wanneer gevraagd (delta's). */
function procent(value: number, metTeken = false): string {
  const teken = metTeken && value > 0 ? '+' : ''
  return `${teken}${NL_1.format(value)}%`
}

function dagenLabel(days: number): string {
  return `${nummer(days)} ${days === 1 ? 'dag' : 'dagen'}`
}

/**
 * Dagtarief (€/dag) waarmee dit scherm bedragen in vrijheidstijd uitdrukt.
 *
 * De conversie zelf is niet van hier: `dailyExpenseRate` is de app-brede
 * ×12/365-helper en `calculateFreedomTime` de canonieke decompositie. Wat dit
 * scherm kiest is de *grondslag*: de door de route geleverde `totalExpenses`
 * van hetzelfde jaar, herleid naar een maandlast via het aantal maanden mét
 * gegevens (zodat een lopend of half geïmporteerd jaar niet vertekent). Dat is bewust het jaar zelf
 * en niet het 12-maands rollende dagtarief van vandaag — een jaaroverzicht
 * hoort niet met de uitgaven van nú te meten.
 *
 * `credibleDailyExpense` laat een te dunne grondslag (een jaar met een paar
 * losse transacties) in de bekende "geen data"-staat vallen: 0 ⇒ geen
 * vrijheidstijd-regel, in plaats van een eeuw vrijheid uit centen per dag.
 */
function dagtariefVanJaar(totalExpenses: number, maandenMetGegevens: number): number {
  if (!Number.isFinite(totalExpenses) || totalExpenses <= 0) return 0
  // Delen door de maanden MÉT gegevens, nooit vast door 12: het lopende jaar
  // (of een jaar waarin de import halverwege begon) heeft minder maanden aan
  // uitgaven, en /12 zou het dagtarief dan structureel te laag maken — en elke
  // vrijheidstijd-regel dus te hoog (review-🔴 31 aug 2026, factor ~1,5 op
  // 31 augustus). Geen maanden met gegevens ⇒ geen regel.
  if (!Number.isFinite(maandenMetGegevens) || maandenMetGegevens <= 0) return 0
  return credibleDailyExpense(dailyExpenseRate(totalExpenses / maandenMetGegevens))
}

/** "3 jaar en 2 maanden" — of null wanneer de grondslag niet geloofwaardig is. */
function vrijheidstijd(bedrag: number, dagtarief: number): string | null {
  if (dagtarief <= 0) return null
  const breakdown = calculateFreedomTime(bedrag, dagtarief)
  if (breakdown.isInfinite) return null
  return formatFreedomTimeString(breakdown, 'long')
}

// ── Jaarkiezer ──────────────────────────────────────────────────────────────

/** Huidig jaar t/m huidig−3. Nooit de toekomst: de route weigert die met een 400. */
export function kiesbareJaren(nu: Date = new Date()): number[] {
  const jaar = nu.getFullYear()
  return [jaar, jaar - 1, jaar - 2, jaar - 3]
}

function Jaarkiezer({
  jaren,
  actief,
  onKies,
  disabled,
}: {
  jaren: number[]
  actief: number | null
  onKies: (jaar: number) => void
  disabled: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Kies een jaar"
      className="inline-flex min-h-11 items-center gap-0.5 border border-[var(--border-ed)] bg-[var(--paper)] p-0.5"
    >
      {jaren.map((jaar) => {
        const isActief = actief === jaar
        return (
          <button
            key={jaar}
            type="button"
            onClick={() => onKies(jaar)}
            disabled={disabled}
            aria-pressed={isActief}
            className={[
              'inline-flex min-h-9 items-center px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ink)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isActief
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {jaar}
          </button>
        )
      })}
    </div>
  )
}

// ── Grafieken (pure SVG/CSS, canonieke animatie-timing) ─────────────────────

const BEZIER = 'cubic-bezier(.22,1,.36,1)'

/** Staafjes per maand. Stagger 60ms per staaf, fill 700ms — de canonieke timing. */
function VrijheidsdagenPerMaand({
  maanden,
  besteMaand,
  jaar,
}: {
  maanden: YearInReviewData['freedomDaysByMonth']
  besteMaand: YearInReviewData['bestFreedomMonth']
  jaar: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 + 11 * 60 })
  const max = maanden.reduce((hoogste, m) => Math.max(hoogste, m.days), 0)
  if (max <= 0) return null

  return (
    <div ref={ref} className="mt-5">
      <p className="sr-only">Vrijheidsdagen per maand in {jaar}</p>
      <ul className="flex h-24 items-end gap-1 border-b border-[var(--rule-soft)] sm:gap-1.5">
        {maanden.map((m, i) => {
          const isBeste = besteMaand?.month === m.month && m.days > 0
          return (
            <li key={m.month} className="flex h-full flex-1 flex-col justify-end">
              <span className="sr-only">
                {m.label}: {dagenLabel(m.days)}
              </span>
              <span
                aria-hidden
                className="block w-full"
                style={{
                  height: hasEntered ? `${(m.days / max) * 100}%` : '0%',
                  minHeight: m.days > 0 ? '2px' : '0px',
                  background: isBeste
                    ? 'var(--module-active-700)'
                    : 'var(--module-active-500)',
                  transition: hasEntered
                    ? `height 700ms ${BEZIER} ${i * 60}ms`
                    : 'none',
                }}
              />
            </li>
          )
        })}
      </ul>
      <ul aria-hidden className="mt-1.5 flex gap-1 sm:gap-1.5">
        {maanden.map((m) => (
          <li
            key={m.month}
            className="flex-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]"
          >
            {m.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

const VERLOOP_W = 420
const VERLOOP_H = 64
const VERLOOP_PAD = 6

/**
 * Verloopje uit de vastgelegde waarderingen. Geen assen, geen bedragen in het
 * label: de vorm is het verhaal, de cijfers staan eronder in de tekst (en
 * blijven zo ook in privacy-modus gemaskeerd).
 */
function VermogensVerloop({
  punten,
  jaar,
}: {
  punten: YearInReviewData['netWorthByMonth']
  jaar: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  const pad = useMemo(() => {
    if (punten.length < 2) return null
    const waarden = punten.map((p) => p.value)
    const min = Math.min(...waarden)
    const max = Math.max(...waarden)
    const span = max - min || 1
    return punten
      .map((p, i) => {
        const x =
          VERLOOP_PAD + (i / (punten.length - 1)) * (VERLOOP_W - 2 * VERLOOP_PAD)
        const y =
          VERLOOP_PAD +
          (1 - (p.value - min) / span) * (VERLOOP_H - 2 * VERLOOP_PAD)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [punten])

  if (!pad) return null

  return (
    <div ref={ref} className="mt-5">
      {/* Uniform schalen (géén `preserveAspectRatio="none"`, géén
          `non-scaling-stroke`): met een niet-uniforme rek rekent Chrome de
          `pathLength`-genormaliseerde streepjespatroon in apparaat-ruimte om,
          waardoor de lijn halverwege afbreekt. Breedte als attribuut, want een
          `<svg>` met viewBox valt zonder expliciete breedte terug op zijn
          intrinsieke maat. */}
      <svg
        viewBox={`0 0 ${VERLOOP_W} ${VERLOOP_H}`}
        width="100%"
        className="block h-auto"
        role="img"
        aria-label={`Verloop van je netto vermogen door ${jaar}`}
      >
        <path
          d={pad}
          fill="none"
          stroke="var(--module-active-500)"
          strokeWidth={0.9}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          style={{
            transition: hasEntered
              ? `stroke-dashoffset 700ms ${BEZIER}`
              : 'none',
          }}
        />
      </svg>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {punten.length} vastgelegde waardering{punten.length === 1 ? '' : 'en'}
      </p>
    </div>
  )
}

/** Balk van begin- naar eindpercentage, met een hairline op het startpunt. */
function VrijheidsBalk({ start, eind }: { start: number; eind: number }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  const klem = (v: number) => Math.min(Math.max(v, 0), 100)

  return (
    <div ref={ref} className="mt-5">
      <div className="relative h-3 w-full border border-[var(--ink)] bg-[var(--paper)]">
        <div
          aria-hidden
          className="absolute inset-y-0 left-0"
          style={{
            width: hasEntered ? `${klem(eind)}%` : '0%',
            background: 'var(--module-active-500)',
            transition: hasEntered ? `width 700ms ${BEZIER}` : 'none',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 w-px bg-[var(--ink)]"
          style={{ left: `${klem(start)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[var(--ink-3)]">
        <span>begin {procent(start)}</span>
        <span>eind {procent(eind)}</span>
      </div>
    </div>
  )
}

// ── Kleine bouwstenen ───────────────────────────────────────────────────────

/** Eén regel in de kassabon: label links, waarde rechts, gestippeld ritme. */
function BonRegel({
  label,
  waarde,
  nadruk = false,
}: {
  label: string
  waarde: React.ReactNode
  nadruk?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-[var(--rule-soft)] py-2 last:border-b-0">
      <span
        className={
          nadruk
            ? 'text-sm font-medium text-[var(--ink)]'
            : 'text-sm text-[var(--ink-2)]'
        }
      >
        {label}
      </span>
      <span
        className={
          nadruk
            ? 'text-[17px] font-bold text-[var(--ink)]'
            : 'text-sm text-[var(--ink)]'
        }
      >
        {waarde}
      </span>
    </div>
  )
}

/** Eerlijke regel voor een katern zonder gegevens — nooit een €0 als prestatie. */
function OnvoldoendeGegevens({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-sm italic leading-snug text-[var(--ink-3)]"
      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
    >
      {children}
    </p>
  )
}

/**
 * Katern-kop: de zichtbare `SectionLabel` (component-eerst) plus een sr-only
 * `<h2>` met dezelfde tekst. `SectionLabel` rendert bewust een `<span>` in een
 * `<div>` — visueel precies goed, maar zonder koppenstructuur. De app-brede
 * koppenconventie (CLAUDE.md, ADR 0110) wil secties op `h2`; de shell houdt de
 * enige `h1`. Vandaar deze combinatie in plaats van een tweede kop-variant.
 */
function KaternKop({
  children,
  num,
}: {
  children: string
  num?: string
}) {
  return (
    <>
      <h2 className="sr-only">{children}</h2>
      {/* De zichtbare label-variant is decoratief naast de sr-only kop —
          anders leest een schermlezer elke katernkop dubbel. */}
      <span aria-hidden="true">
        <SectionLabel num={num}>{children}</SectionLabel>
      </span>
    </>
  )
}

// ── Staten ──────────────────────────────────────────────────────────────────

function Skelet() {
  return (
    <div className="mt-8 space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Je jaaroverzicht wordt opgehaald</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-2 w-32 animate-pulse bg-[var(--subtle)]" />
          <div className="h-10 w-48 animate-pulse bg-[var(--subtle)]" />
          <div className="h-20 w-full animate-pulse bg-[var(--subtle)]" />
        </div>
      ))}
    </div>
  )
}

function NietIngelogd() {
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <p
        className="text-[19px] leading-snug text-[var(--ink)]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        Je bent niet meer ingelogd
      </p>
      <p
        className="mx-auto mt-2 max-w-prose text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Je jaaroverzicht staat achter je account. Log opnieuw in, dan staat het
        er weer.
      </p>
      <div className="mt-5 flex justify-center">
        <Button href="/login">Opnieuw inloggen</Button>
      </div>
    </div>
  )
}

function Foutmelding({ onOpnieuw }: { onOpnieuw: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <p
        className="text-[19px] leading-snug text-[var(--ink)]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        Je jaaroverzicht kwam niet binnen
      </p>
      <p
        className="mx-auto mt-2 max-w-prose text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Er ging iets mis bij het ophalen. Je gegevens zijn ongewijzigd.
      </p>
      <div className="mt-5 flex justify-center">
        <Button type="button" onClick={onOpnieuw}>
          Opnieuw proberen
        </Button>
      </div>
    </div>
  )
}

function LegeStaat({ jaar }: { jaar: number }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <CalendarRange
        className="mx-auto h-9 w-9 text-[var(--ink-3)]"
        aria-hidden
      />
      <p
        className="mt-4 text-[19px] leading-snug text-[var(--ink)]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        Nog geen gegevens over {jaar}
      </p>
      <p
        className="mx-auto mt-2 max-w-prose text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        In dat jaar staan geen transacties, geen vastgelegde waarderingen en
        geen afgeronde acties. Kies hierboven een ander jaar, of vul je
        gegevens aan.
      </p>
      <div className="mt-5 flex justify-center">
        <Button href="/mijn/koppelingen">Vul je gegevens aan</Button>
      </div>
    </div>
  )
}

// ── Hoofdcomponent ──────────────────────────────────────────────────────────

type Fout = { soort: 'auth' } | { soort: 'algemeen' }

export function JaaroverzichtClient() {
  const [gekozenJaar, setGekozenJaar] = useState<number | null>(null)
  const [data, setData] = useState<YearInReviewData | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<Fout | null>(null)
  const [poging, setPoging] = useState(0)
  const [deelOpen, setDeelOpen] = useState(false)

  const jaren = useMemo(() => kiesbareJaren(), [])

  useEffect(() => {
    let afgebroken = false
    setLaden(true)
    setFout(null)

    // Zonder expliciete keuze bepaalt de route zelf het jaar (vorig jaar, of
    // het huidige vanaf december). Dat defaultjaar hier nabouwen zou een tweede
    // bron van waarheid opleveren — we lezen het gewoon terug uit het antwoord.
    const url = gekozenJaar
      ? `/api/year-in-review?year=${gekozenJaar}`
      : '/api/year-in-review'

    fetch(url)
      .then(async (res) => {
        if (afgebroken) return
        if (res.status === 401) {
          setData(null)
          setFout({ soort: 'auth' })
          return
        }
        if (!res.ok) {
          setData(null)
          setFout({ soort: 'algemeen' })
          return
        }
        const json = (await res.json()) as YearInReviewData
        if (afgebroken) return
        setData(json)
      })
      .catch(() => {
        if (afgebroken) return
        setData(null)
        setFout({ soort: 'algemeen' })
      })
      .finally(() => {
        if (afgebroken) return
        setLaden(false)
      })

    return () => {
      afgebroken = true
    }
  }, [gekozenJaar, poging])

  const opnieuw = useCallback(() => setPoging((p) => p + 1), [])

  // De zojuist aangeklikte pill is meteen de actieve — niet pas wanneer de
  // respons binnen is (review-🟡: op een trage verbinding las de wissel als
  // "klik niet aangekomen"). De default blijft uit het antwoord komen.
  const actiefJaar = gekozenJaar ?? data?.year ?? null

  return (
    <section className="bg-editorial relative mx-auto max-w-4xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8">
      <PageInfoButton
        description={PAGE_INFO['/mijn/jaaroverzicht'] ?? ''}
        className="absolute right-4 top-4 sm:right-6"
      />

      <PageOpening
        className="mb-6 pr-12 sm:pr-14"
        kicker={actiefJaar ? `Jaaroverzicht · ${actiefJaar}` : 'Jaaroverzicht'}
        titleBefore={actiefJaar ? `Jouw ${actiefJaar} in ` : 'Jouw jaar in '}
        emphasis="vrijheid"
        titleAfter=""
        deck="Een jaar terugkijken in tijd: welke dagen vrijheid je won, wat je vermogen deed, en wat er onder de streep overbleef."
      />

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Jaarkiezer
          jaren={jaren}
          actief={actiefJaar}
          onKies={setGekozenJaar}
          disabled={laden}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setDeelOpen(true)}
        >
          <Share2 className="mr-2 h-4 w-4" aria-hidden />
          Deel je vrijheid
        </Button>
      </div>

      {laden ? (
        <Skelet />
      ) : fout?.soort === 'auth' ? (
        <NietIngelogd />
      ) : fout ? (
        <Foutmelding onOpnieuw={opnieuw} />
      ) : data ? (
        <Jaarinhoud data={data} />
      ) : null}

      {deelOpen && <DeelKaartSheet open onClose={() => setDeelOpen(false)} />}
    </section>
  )
}

// ── De inhoud van één jaar ──────────────────────────────────────────────────

function Jaarinhoud({ data }: { data: YearInReviewData }) {
  // Het lopende jaar is een TUSSENSTAND, geen afgesloten jaar: de teksten
  // hieronder wisselen dan van "eind" naar "nu" (review-🟡: afgeronde-jaar-taal
  // over 8 van 12 maanden presenteerde de tussenstand als eindstand).
  const isLopendJaar = data.year === new Date().getFullYear()
  const jaar = data.year

  const heeftGegevens =
    data.freedomDaysWon > 0 ||
    data.netWorthByMonth.length > 0 ||
    data.actionsCompleted > 0 ||
    data.monthlyOverview.some((m) => m.income > 0 || m.expenses > 0)

  if (!heeftGegevens) return <LegeStaat jaar={jaar} />

  // Maanden waarin daadwerkelijk iets gebeurde — de noemer van het dagtarief
  // én de eerlijke toets voor "is er iets om naast elkaar te leggen".
  const maandenMetGegevens = data.monthlyOverview.filter(
    (m) => m.income > 0 || m.expenses > 0,
  ).length

  const dagtarief = dagtariefVanJaar(data.totalExpenses, maandenMetGegevens)

  const vermogenCompleet =
    data.netWorthStart != null &&
    data.netWorthEnd != null &&
    data.netWorthGrowth != null &&
    // Eén enkele waardering maakt begin === eind en "€ 0 groei" — dat is geen
    // verloop maar €0-theater; dan liever de onvoldoende-gegevens-staat.
    data.netWorthByMonth.length >= 2

  const vermogenVrijheid =
    data.netWorthEnd != null ? vrijheidstijd(data.netWorthEnd, dagtarief) : null

  const gespaardVrijheid = vrijheidstijd(Math.abs(data.totalSaved), dagtarief)

  // Op het AANTAL maanden met gegevens toetsen, niet op best === zwakst: twee
  // maanden met exact gelijk spaarsaldo wijzen allebei naar de eerste maand en
  // lazen dan onterecht als "maar één maand met transacties" (review-🟡).
  const eenMaand = maandenMetGegevens === 1

  // `bestMonth`/`worstMonth` dragen alleen maand+label+savings; de bijbehorende
  // in- en uitgaven staan in dezelfde rij van `monthlyOverview`. Opzoeken op de
  // maandsleutel, niet naast elkaar leggen op index.
  const besteRij =
    data.monthlyOverview.find((m) => m.month === data.bestMonth?.month) ?? null
  const zwaksteRij =
    data.monthlyOverview.find((m) => m.month === data.worstMonth?.month) ?? null

  return (
    <div className="space-y-10">
      {/* ── I. Vrijheidsdagen ──────────────────────────────────────────── */}
      <section>
        <KaternKop num="i.">Vrijheidsdagen</KaternKop>
        {data.freedomDaysWon > 0 ? (
          <>
            <p className="flex items-baseline gap-2">
              {/* Hoofdcijfer in DM Mono + tabular-nums — de canonieke maat van
                  het hairline-cijferblok (ui-ux: editorial pagina-opening).
                  Alle drie de hoofdcijfers op deze pagina dragen dezelfde
                  familie, zodat de katernen als één kolom lezen. */}
              <span className="font-mono text-[40px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)] sm:text-[52px]">
                {nummer(data.freedomDaysWon)}
              </span>
              <span className="text-sm text-[var(--ink-3)]">
                {data.freedomDaysWon === 1 ? 'dag' : 'dagen'}
              </span>
            </p>
            <p
              className="mt-2 text-[13px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Vrijheid die je acties in {jaar} opleverden.
            </p>
            <VrijheidsdagenPerMaand
              maanden={data.freedomDaysByMonth}
              besteMaand={data.bestFreedomMonth}
              jaar={jaar}
            />
            {data.bestFreedomMonth && (
              <p className="mt-4 border-t border-[var(--border-ed)] pt-3 text-sm text-[var(--ink-2)]">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--module-active-700)]">
                  Beste maand
                </span>
                <span className="ml-3 text-[var(--ink)]">
                  {data.bestFreedomMonth.label} — {dagenLabel(data.bestFreedomMonth.days)}
                </span>
              </p>
            )}
          </>
        ) : (
          <OnvoldoendeGegevens>
            In {jaar} rondde je geen acties af waar vrijheidsdagen aan hangen.
          </OnvoldoendeGegevens>
        )}
      </section>

      {/* ── II. Vermogensgroei ─────────────────────────────────────────── */}
      <section>
        <KaternKop num="ii.">Vermogensgroei</KaternKop>
        {vermogenCompleet ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                Begin
              </span>
              <MaskedAmount
                value={data.netWorthStart}
                className="text-[17px] text-[var(--ink-2)]"
              />
              <span aria-hidden className="text-[var(--ink-3)]">
                &rarr;
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                {isLopendJaar ? 'Nu' : 'Eind'}
              </span>
              <MaskedAmount
                value={data.netWorthEnd}
                className="text-[17px] font-medium text-[var(--ink)]"
              />
            </div>

            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <MaskedAmount
                value={data.netWorthGrowth}
                signPrefix={(data.netWorthGrowth ?? 0) > 0 ? '+' : undefined}
                className="text-[32px] font-bold leading-none tracking-[-0.02em] text-[var(--ink)] sm:text-[40px]"
                tone="ink"
              />
              {data.netWorthGrowthPct != null && (
                <span className="font-mono text-sm tabular-nums text-[var(--ink-3)]">
                  {procent(data.netWorthGrowthPct, true)}
                </span>
              )}
            </p>

            <VermogensVerloop punten={data.netWorthByMonth} jaar={jaar} />

            {vermogenVrijheid && (
              <p
                className="mt-3 text-[13px] italic leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isLopendJaar ? <>Tot nu toe staat je vermogen dit jaar voor{' '}</> : <>Aan het eind van {jaar} stond je vermogen voor{' '}</>}
                <span className="not-italic text-[var(--ink-2)]">
                  {vermogenVrijheid}
                </span>{' '}
                vrijheid, gemeten aan je uitgaven in dat jaar.
              </p>
            )}
          </>
        ) : (
          <OnvoldoendeGegevens>
            Over {jaar} zijn geen vermogenswaarderingen vastgelegd, dus is er
            geen begin- en eindstand om naast elkaar te zetten.
          </OnvoldoendeGegevens>
        )}
      </section>

      {/* ── III. Spaarmaanden ──────────────────────────────────────────── */}
      <section>
        <KaternKop num="iii.">Spaarmaanden</KaternKop>
        {besteRij && zwaksteRij ? (
          <div className="space-y-1">
            <SpaarmaandRegel
              kicker="Meeste overgehouden"
              maand={besteRij}
              uitgelicht
            />
            {!eenMaand && (
              <SpaarmaandRegel kicker="Minste overgehouden" maand={zwaksteRij} />
            )}
            {eenMaand && (
              <p
                className="pt-2 text-[13px] italic text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                In {jaar} staat er maar één maand met transacties, dus is er
                niets om naast te leggen.
              </p>
            )}
          </div>
        ) : (
          <OnvoldoendeGegevens>
            In {jaar} staan geen transacties, dus is er geen maand om uit te
            lichten.
          </OnvoldoendeGegevens>
        )}
      </section>

      {/* ── IV. Naar volledige vrijheid ────────────────────────────────── */}
      <section>
        <KaternKop num="iv.">Naar volledige vrijheid</KaternKop>
        {data.fireStart && data.fireEnd ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)] sm:text-[40px]">
                {procent(data.fireEnd.percentage)}
              </span>
              {data.fireProgressDelta != null && (
                <span className="font-mono text-sm tabular-nums text-[var(--ink-3)]">
                  {data.fireProgressDelta > 0 ? '+' : ''}
                  {nummer(data.fireProgressDelta)} procentpunt in {jaar}
                </span>
              )}
            </p>
            <VrijheidsBalk
              start={data.fireStart.percentage}
              eind={data.fireEnd.percentage}
            />
            <p
              className="mt-3 text-[13px] italic leading-snug text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Volledige vrijheid staat bij{' '}
              <MaskedAmount
                value={data.fireEnd.fireTarget}
                monoWhenVisible={false}
                tone="ink"
                className="not-italic text-[var(--ink-2)]"
              />{' '}
              — het vermogen waarbij je essentiële lasten zichzelf dragen.
            </p>
          </>
        ) : (
          <OnvoldoendeGegevens>
            Voor je vrijheidspercentage zijn essentiële budgetten én een
            vermogenswaardering nodig; over {jaar} ontbreken die.
          </OnvoldoendeGegevens>
        )}
      </section>

      {/* ── De rekening ────────────────────────────────────────────────── */}
      <section>
        <KaternKop>Onder de streep</KaternKop>
        <RekeningTag label={isLopendJaar ? `de tussenstand van ${jaar}` : `de rekening van ${jaar}`}>
          <BonRegel
            label="Inkomsten"
            waarde={<MaskedAmount value={data.totalIncome} tone="ink" />}
          />
          {/* Negatief bedrag i.p.v. een eigen `-`-prefix: zo staat het minteken
              app-breed op dezelfde plek (`formatCurrency` zet 'm ná het euro-
              teken, zoals ook bij een negatieve spaarmaand). `signPrefix` blijft
              gereserveerd voor het expliciete `+` op een delta. */}
          <BonRegel
            label="Uitgaven"
            waarde={<MaskedAmount value={-data.totalExpenses} tone="ink" />}
          />
          <BonRegel
            label="Overgehouden"
            nadruk
            waarde={
              <MaskedAmount
                value={data.totalSaved}
                signPrefix={data.totalSaved > 0 ? '+' : undefined}
                tone="ink"
              />
            }
          />
          <BonRegel
            label="Spaarquote"
            waarde={
              data.savingsRate != null ? (
                <span className="font-mono tabular-nums">
                  {procent(data.savingsRate)}
                </span>
              ) : (
                <span className="text-[var(--ink-3)]">niet te bepalen</span>
              )
            }
          />
          <BonRegel
            label="Afgeronde acties"
            waarde={
              <span className="font-mono tabular-nums">
                {data.actionsCompleted}
              </span>
            }
          />

          {gespaardVrijheid && data.totalSaved !== 0 && (
            <p
              className="mt-4 border-t border-[var(--border-ed)] pt-3 text-[13px] italic leading-snug text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {data.totalSaved > 0 ? (
                <>
                  Wat je overhield staat voor{' '}
                  <span className="not-italic text-[var(--ink-2)]">
                    {gespaardVrijheid}
                  </span>{' '}
                  vrijheid, gemeten aan je uitgaven in {jaar}.
                </>
              ) : (
                <>
                  Je gaf meer uit dan er binnenkwam: het verschil staat voor{' '}
                  <span className="not-italic text-[var(--ink-2)]">
                    {gespaardVrijheid}
                  </span>{' '}
                  vrijheid, gemeten aan je uitgaven in {jaar}.
                </>
              )}
            </p>
          )}
        </RekeningTag>
      </section>

      <OrnamentColophon
        module="Mijn"
        text={`Opgemaakt ${formatTimestamp(data.generatedAt)}`}
      />
    </div>
  )
}

/**
 * Eén uitgelichte maand. Neemt bewust de rij uit `monthlyOverview` — dáár staan
 * `income`/`expenses` in het contract; `bestMonth`/`worstMonth` dragen alleen
 * maand, label en savings. Zelfde rij, expliciet opgezocht op `month`.
 */
function SpaarmaandRegel({
  kicker,
  maand,
  uitgelicht = false,
}: {
  kicker: string
  maand: YearInReviewData['monthlyOverview'][number]
  uitgelicht?: boolean
}) {
  return (
    <ComparisonRow highlight={uitgelicht}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dotted border-[var(--rule-soft)] py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--module-active-700)]">
            {kicker}
          </p>
          <p className="mt-0.5 text-base text-[var(--ink)]">{maand.label}</p>
        </div>
        <div className="text-right">
          <MaskedAmount
            value={maand.savings}
            signPrefix={maand.savings > 0 ? '+' : undefined}
            tone="ink"
            className="text-[19px] font-bold text-[var(--ink)]"
          />
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
            in{' '}
            <MaskedAmount
              value={maand.income}
              tone="ink"
              className="text-[10px]"
            />{' '}
            · uit{' '}
            <MaskedAmount
              value={maand.expenses}
              tone="ink"
              className="text-[10px]"
            />
          </p>
        </div>
      </div>
    </ComparisonRow>
  )
}
