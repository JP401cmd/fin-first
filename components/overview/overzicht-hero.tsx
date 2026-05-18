'use client'

import { useState } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import Link from 'next/link'
import { Banknote, CreditCard, Wallet, Receipt, Target, CheckCircle2, AlertCircle, Activity, Compass } from 'lucide-react'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { HealthScoreReceipt } from '@/components/app/horizon/health-score-receipt'
import type { HealthScore } from '@/lib/financial-health'
import type { GoalWithBudget } from '@/lib/will-data-loader'

type GoalProgress = { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }

type OverzichtHeroProps = {
  userName?: string
  health: HealthScore | null
  goals?: GoalWithBudget[]
  goalProgresses?: GoalProgress[]
  /** Percentage op weg naar financiële vrijheid (0-100). Uit healthScoreInput. */
  freedomPct?: number | null
  /** Huidige leeftijd (afgerond) — null bij ontbrekende DOB. */
  currentAge?: number | null
  /** Vrijheidsleeftijd / pensioenleeftijd uit fireStrategy.endAge. */
  endAge?: number | null
  /** Pensioen-modus uit fireStrategy.strategy === 'pensioen'. */
  isPensioenMode?: boolean
}

const BAND_STYLES: Record<string, { ring: string; label: string; text: string; bgInner: string }> = {
  uitstekend: { ring: 'stroke-emerald-600',  label: 'Uitstekend',  text: 'text-emerald-700', bgInner: 'bg-emerald-50' },
  sterk:      { ring: 'stroke-emerald-500',  label: 'Sterk',       text: 'text-emerald-600', bgInner: 'bg-emerald-50' },
  redelijk:   { ring: 'stroke-amber-500',    label: 'Redelijk',    text: 'text-amber-700',   bgInner: 'bg-amber-50' },
  kwetsbaar:  { ring: 'stroke-orange-500',   label: 'Kwetsbaar',   text: 'text-orange-700',  bgInner: 'bg-orange-50' },
  kritiek:    { ring: 'stroke-red-600',      label: 'Kritiek',     text: 'text-red-700',     bgInner: 'bg-red-50' },
}

const HEFBOMEN: ReadonlyArray<{
  key: 'bezittingen' | 'schulden' | 'cashflow' | 'belasting'
  label: string
  href: string
  Icon: typeof Wallet
  accent: string
  /** Pillar-key uit HealthScore voor status-bepaling. null = altijd neutraal. */
  pillarKey: string | null
  /** Korte uitleg in title-tooltip (hover desktop, long-press mobile). */
  tooltip: string
}> = [
  { key: 'bezittingen', label: 'Bezittingen', href: '/overzicht/bezittingen', Icon: Wallet,     accent: 'text-emerald-700 bg-emerald-50', pillarKey: 'diversification', tooltip: 'Cash, beleggingen, eigen huis en pensioen — wat groeit voor je.' },
  { key: 'schulden',    label: 'Schulden',    href: '/overzicht/schulden',    Icon: CreditCard, accent: 'text-amber-700 bg-amber-50',     pillarKey: 'debt_ratio',      tooltip: 'Hypotheek, leningen, studieschuld — wat je terugbetaalt.' },
  { key: 'cashflow',    label: 'Cashflow',    href: '/overzicht/cashflow',    Icon: Banknote,   accent: 'text-sky-700 bg-sky-50',         pillarKey: 'savings_rate',    tooltip: 'In en uit per maand — het deel dat je opzij zet bepaalt je tempo.' },
  { key: 'belasting',   label: 'Belasting',   href: '/overzicht/belasting',   Icon: Receipt,    accent: 'text-violet-700 bg-violet-50',   pillarKey: null,              tooltip: 'Box 1, Box 2 en Box 3 — slim verdelen scheelt geld per jaar.' },
] as const

/**
 * Map pillar-score (0-100) naar status-codering. Drempels stemmen overeen
 * met de bandbreedtes uit financial-health.ts (Sterk ≥ 70, Redelijk 50-70,
 * Kwetsbaar/Kritiek < 50). Pillar zonder score → neutraal.
 */
/**
 * Vertaal score-pillars naar een tijds-anker. Voorkeur: fire_progress (voortgang
 * naar vrijheid), fallback: emergency_fund (maanden buffer). Filtert "0..."-
 * waardes uit zodat we geen verwarrende "0% op weg" / "0 maanden buffer" tonen.
 */
function getTimeAnchor(
  health: HealthScore,
): { kind: 'fire' | 'buffer'; value: string } | null {
  const firePillar = health.pillars.find((p) => p.id === 'fire_progress')
  if (firePillar?.rawValue && !firePillar.rawValue.startsWith('0')) {
    return { kind: 'fire', value: firePillar.rawValue }
  }
  const bufferPillar = health.pillars.find((p) => p.id === 'emergency_fund')
  if (bufferPillar?.rawValue && !bufferPillar.rawValue.startsWith('0')) {
    return { kind: 'buffer', value: bufferPillar.rawValue }
  }
  return null
}

function pillarStatus(score: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  if (score == null) return 'neutral'
  if (score >= 70) return 'good'
  if (score >= 50) return 'warn'
  return 'bad'
}

const STATUS_DOT: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good:    'bg-emerald-500',
  warn:    'bg-amber-500',
  bad:     'bg-red-500',
  neutral: 'bg-stone-300',
}

const STATUS_LABEL: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good:    'Goed op koers',
  warn:    'Aandacht',
  bad:     'Risico',
  neutral: 'Geen score',
}

function formatDateNL(): string {
  const formatter = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  const parts = formatter.format(new Date())
  return parts.charAt(0).toUpperCase() + parts.slice(1)
}

function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Goedenacht'
  if (h < 12) return 'Goedemorgen'
  if (h < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

/**
 * OverzichtHero — visuele hero op /overzicht (Tier-2 #4 + #8).
 *
 * Bevat: begroeting + datum, financiële gezondheidsscore (ring + label
 * + trend), vier-hefbomen-rij met klikbare tegels naar verdiepingen.
 * Komt bovenop de bestaande WillLanding-content (briefing + acties +
 * widget-dashboard) — geen vervanging, wel verrijking.
 *
 * Toekomstige uitbreidingen (Tier-2 #9 + #5):
 *  - Netto-vermogen-tijdslijn-strip naast Health Score (scope tot
 *    vrijheidsmoment, klik → /toekomst voor volledige projectie)
 *  - "Wat zie ik hier?"-knop rechtsboven met inline uitleg
 *  - Status-dots op hefboom-tegels (groen/oranje/rood) op basis van
 *    LeverScores zodra die in scope zijn van /overzicht/page.tsx
 */
export function OverzichtHero({
  userName,
  health,
  goals,
  goalProgresses,
  freedomPct,
  currentAge,
  endAge,
  isPensioenMode,
}: OverzichtHeroProps) {
  const [receiptOpen, setReceiptOpen] = useState(false)

  // Bouw doelen-display: koppel goals met hun progress op index, sorteer
  // achterop-achter doelen eerst (krijgen meer aandacht). Skip voltooide.
  // Type-guard predicate narrowt het type zodat we daarna geen `!` nodig hebben.
  const goalDisplay = (goals ?? [])
    .map((g, i) => ({ goal: g, progress: goalProgresses?.[i] ?? null }))
    .filter((g): g is { goal: GoalWithBudget; progress: GoalProgress } =>
      g.progress != null && g.progress.pct < 100,
    )
    .sort((a, b) => Number(!a.progress.onTrack) - Number(!b.progress.onTrack))
    .slice(0, 3)

  return (
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2 md:pt-8 md:pb-4">
      {/* "Wat zie ik hier?"-knop rechtsboven (Tier-1 #5) */}
      <PageInfoButton
        description={PAGE_INFO['/overzicht'] ?? ''}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />

      {/* Header: datum + begroeting */}
      <header className="mb-6 pr-12 sm:pr-16">
        <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-4)]">
          {formatDateNL()}
        </div>
        <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)] leading-tight">
          {greetingByHour()}{userName ? `, ${userName}` : ''}
        </h1>
        {/* Data-summary onder begroeting — toont enkel doelen-aantal want
            de vrijheid-strip onderaan toont al freedomPct. Geen dubbele
            data-weergave; bij geen doelen verbergt de regel volledig. */}
        {goalDisplay.length > 0 && (
          <p className="mt-2 text-sm sm:text-base text-[var(--ink-2)]">
            <strong className="font-semibold text-[var(--ink)]">
              {goalDisplay.length}
            </strong>{' '}
            {goalDisplay.length === 1 ? 'actief doel' : 'actieve doelen'} — kijk hoever je bent.
          </p>
        )}
      </header>

      {/* Vier-hefbomen-rij — klikbare tegels naar verdiepingen met status-dot */}
      <nav aria-label="Vier hefbomen" className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {HEFBOMEN.map(({ key, label, href, Icon, accent, pillarKey, tooltip }) => {
          // Zoek pillar-score uit health voor deze hefboom. Belasting heeft
          // (nog) geen eigen pillar → gebruik overall health.score als proxy
          // zodat de tegel niet altijd "neutraal" toont voor users met data.
          // Andere hefbomen gebruiken hun eigen pillar uit HEFBOMEN-config.
          const pillar = pillarKey && health
            ? health.pillars.find((p) => p.id === pillarKey)
            : undefined
          const proxyScore = !pillarKey && health ? health.total : null
          const status = pillarStatus(pillar?.score ?? proxyScore)
          return (
            <Link
              key={key}
              href={href}
              title={tooltip}
              className="group relative flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
            >
              {/* Status-dot rechtsboven — sub-overline-label maakt het al
                  zichtbaar voor screen readers; dot zelf is decoratief. */}
              <span
                className={`absolute right-2.5 top-2.5 sm:right-3 sm:top-3 w-2 h-2 rounded-full ${STATUS_DOT[status]}`}
                aria-hidden="true"
                title={STATUS_LABEL[status]}
              />
              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${accent}`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              {/* Status-tekst als overline — toont per-tegel info (geen herhaling
                  van section-naam). Bij geen meting: "Onbekend"; anders STATUS_LABEL. */}
              <div className="mt-2 text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
                {status === 'neutral' ? 'Geen meting' : STATUS_LABEL[status]}
              </div>
              <div className="text-sm sm:text-base font-semibold text-[var(--ink)] mt-0.5 group-hover:text-[var(--ink-0)]">
                {label}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Health Score + Voortgang doelen — 2-kolom op desktop, stacked op mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {health ? (
          <HealthScoreCard
            health={health}
            onOpenReceipt={() => setReceiptOpen(true)}
          />
        ) : (
          <HealthScoreEmptyState />
        )}
        {goalDisplay.length > 0 ? (
          <VoortgangDoelenCard items={goalDisplay} />
        ) : (
          <DoelenEmptyState />
        )}
      </div>

      {/* Vrijheid-strip: % op weg naar financiële vrijheid → klik naar Toekomst.
          Bij ontbrekende freedomPct (geen DOB / geen FIRE-target / geen netto-
          inkomen): toon dashed CTA naar /mijn/profiel om profile te completeren. */}
      {freedomPct == null && (
        <Link
          href="/mijn/profiel"
          className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-5 sm:p-6 hover:border-violet-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5 text-violet-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                Op weg naar vrijheid
              </div>
              <div className="mt-0.5 text-sm sm:text-base text-[var(--ink-2)]">
                Vul je geboortedatum, inkomen en gewenste vrijheidsbestedingen in om je vrijheidsmoment te zien.
              </div>
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold text-violet-700 group-hover:underline">
            Vul profiel aan →
          </span>
        </Link>
      )}
      {freedomPct != null && (
        <Link
          href="/toekomst"
          className="mt-3 flex flex-col gap-2 rounded-2xl border border-[var(--border-ed)] bg-gradient-to-r from-violet-50 to-stone-50 p-3 sm:p-4 hover:border-violet-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
                Op weg naar vrijheid
              </div>
              <div className="mt-0.5 text-sm sm:text-base text-[var(--ink)]">
                Je bent <strong className="font-serif text-lg sm:text-xl text-violet-700">{Math.round(freedomPct)}%</strong>
                {' '}op weg naar het moment dat je niet meer hoeft te werken voor geld.
              </div>
            </div>
            <span className="shrink-0 text-xs font-semibold text-violet-700 group-hover:underline">
              Bekijk projectie →
            </span>
          </div>
          {/* Visuele progress-bar — toont freedomPct als geleidelijke vulling
              van violet-300. Klein detail dat het percentage tastbaar maakt. */}
          <div
            className="h-1.5 rounded-full bg-violet-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(freedomPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Voortgang naar financiële vrijheid"
          >
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-violet-700 transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(0, freedomPct))}%` }}
            />
          </div>
        </Link>
      )}

      {/* Mini-tijdslijn-strip: van vandaag naar vrijheid in leeftijd-jaren.
          Klikbaar naar /toekomst voor volledige tijdas. Verbergt bij
          ontbrekende DOB OF endAge zodat hero altijd compleet rendert. */}
      {currentAge != null && endAge != null && endAge > currentAge && (
        <MiniTimelineStrip
          currentAge={currentAge}
          endAge={endAge}
          freedomPct={freedomPct ?? 0}
          isPensioenMode={isPensioenMode ?? false}
        />
      )}

      {/* Drill-down sheet: kassabon met pillars per sub-score */}
      {health && (
        <BottomSheet
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          title="Financiële gezondheid"
          size="lg"
        >
          <HealthScoreReceipt health={health} />
        </BottomSheet>
      )}

      {/* Filosofie-tagline als hero-footer — visueel afsluitend op alle
          breakpoints, na alle content en de sheet-mount. pb-4 geeft het
          ademruimte naar WillLanding die direct hieronder rendert. */}
      <p className="mt-6 pb-4 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] font-medium">
        Geld is opgeslagen tijd
      </p>
    </section>
  )
}

/**
 * Mini-tijdslijn-strip: horizontale balk van vandaag → vrijheidsleeftijd.
 * Eindlabel toont "Pensioen" of "Vrijheid" afhankelijk van fireStrategy.
 * Klikbaar naar /toekomst voor volledige tijdas-projectie.
 *
 * Visuele compositie:
 *  - Links: kicker + "Vandaag · X jaar"
 *  - Midden: progress-bar (h-2 rounded-full) met freedomPct-fill
 *           + age-marker per 5 jaar als verticale ticks
 *  - Rechts: "Vrijheid · Y jaar" met aantal jaren-te-gaan in micro-copy
 */
function MiniTimelineStrip({
  currentAge,
  endAge,
  freedomPct,
  isPensioenMode,
}: {
  currentAge: number
  endAge: number
  freedomPct: number
  isPensioenMode: boolean
}) {
  const yearsToGo = Math.max(0, endAge - currentAge)
  const pct = Math.max(0, Math.min(100, freedomPct))
  const endLabel = isPensioenMode ? 'Pensioen' : 'Vrijheid'
  return (
    <Link
      href="/toekomst"
      className="mt-3 flex flex-col gap-2 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-violet-300 hover:shadow-sm transition-all group"
      aria-label={`Tijdslijn van ${currentAge} jaar nu naar ${endAge} jaar ${endLabel.toLowerCase()}`}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Vandaag
          </span>
          <span className="font-mono text-sm font-semibold text-[var(--ink)]">{currentAge} jaar</span>
        </div>
        <div className="text-center">
          <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
            {yearsToGo === 0 ? 'Bereikt' : `${yearsToGo} jaar te gaan`}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            {endLabel}
          </span>
          <span className="font-mono text-sm font-semibold text-[var(--ink)]">{endAge} jaar</span>
        </div>
      </div>
      {/* Visuele balk met voortgang-fill (violet) en ticks */}
      <div
        className="relative h-2 rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Voortgang naar ${endLabel.toLowerCase()}`}
      >
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-violet-700 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  )
}

/**
 * Gedeelde lege-staat-card voor de hero. Geïdentificeerde
 * empty-states (Health, Doelen) deelden ~80% markup — dit
 * extracteer-component houdt copy + styling op één plek.
 */
function EmptyStateCard({
  icon: Icon,
  iconColor,
  iconBg,
  kicker,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  icon: typeof Activity
  iconColor: string
  iconBg: string
  kicker: string
  title: string
  body: string
  ctaHref: string
  ctaLabel: string
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            {kicker}
          </div>
          <div className="text-base font-semibold text-[var(--ink)]">
            {title}
          </div>
        </div>
      </div>
      <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">
        {body}
      </p>
      <Link
        href={ctaHref}
        className="self-start inline-flex items-center gap-2 bg-stone-900 text-white px-4 py-2.5 rounded-lg text-sm font-semibold min-h-[44px] hover:bg-stone-800 transition-colors"
      >
        {ctaLabel}
      </Link>
    </article>
  )
}

function HealthScoreEmptyState() {
  return (
    <EmptyStateCard
      icon={Activity}
      iconColor="text-amber-700"
      iconBg="bg-amber-50"
      kicker="Gezondheid"
      title="Nog geen score"
      body="Voeg bezittingen of een schuld toe en je financiële gezondheid verschijnt — vier pijlers (buffer, schuld, sparen, vrijheid) die samen één cijfer vormen."
      ctaHref="/overzicht/bezittingen"
      ctaLabel="Voeg bezitting toe →"
    />
  )
}

function DoelenEmptyState() {
  return (
    <EmptyStateCard
      icon={Target}
      iconColor="text-violet-700"
      iconBg="bg-violet-50"
      kicker="Doelen"
      title="Stel je eerste doel"
      body="Een doel maakt zichtbaar waar je naar toe werkt — vrijheid op je 62e, kind in 2027, of een ander mijlpaal. Voortgang zie je dan elke keer dat je inlogt."
      ctaHref="/toekomst"
      ctaLabel="Maak een doel →"
    />
  )
}

function VoortgangDoelenCard({
  items,
}: {
  items: Array<{ goal: GoalWithBudget; progress: GoalProgress | null }>
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      <header className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Voortgang doelen
          </div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-[var(--ink)] flex items-center gap-2">
            <Target className="w-5 h-5 text-[var(--ink-3)]" />
            {items.length} {items.length === 1 ? 'doel actief' : 'doelen actief'}
          </div>
        </div>
        <Link
          href="/toekomst"
          className="text-xs font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline shrink-0"
        >
          Bekijk →
        </Link>
      </header>

      <ul className="flex-1 space-y-2.5">
        {items.map(({ goal, progress }) => {
          if (!progress) return null
          const pct = Math.max(0, Math.min(100, progress.pct))
          const status = progress.onTrack ? 'ontrack' : 'achter'
          const StatusIcon = status === 'ontrack' ? CheckCircle2 : AlertCircle
          const statusColor = status === 'ontrack' ? 'text-emerald-600' : 'text-amber-600'
          const barColor = status === 'ontrack' ? 'bg-emerald-500' : 'bg-amber-500'

          return (
            <li key={goal.id} className="flex items-center gap-2.5">
              <StatusIcon className={`w-4 h-4 shrink-0 ${statusColor}`} aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--ink)] truncate">
                    {goal.name || 'Doel'}
                  </span>
                  <span className="text-xs font-mono text-[var(--ink-3)] shrink-0">
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

function HealthScoreCard({
  health,
  onOpenReceipt,
}: {
  health: HealthScore
  onOpenReceipt: () => void
}) {
  // Normaliseer label naar BAND_STYLES-key. Combining-marks-range ̀-ͯ
  // strips diakritische tekens. Whitelist-pattern: alleen geldige keys passen;
  // onbekende labels (bv. nieuwe band uit financial-health.ts) vallen veilig
  // terug op 'redelijk' i.p.v. silent te crashen.
  const normalized = health.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const band: keyof typeof BAND_STYLES = (normalized in BAND_STYLES ? normalized : 'redelijk') as keyof typeof BAND_STYLES
  const style = BAND_STYLES[band] ?? BAND_STYLES.redelijk!

  // SVG ring math
  const size = 96
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(100, health.total)) / 100
  const dashOffset = circumference * (1 - progress)

  // Animeer de stroke-vulling bij eerste view (respecteert prefers-reduced-motion).
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  // Tijds-anker voor onder de label-regel (uit pillars). Null als geen pillars
  // beschikbaar OF alle anker-pillars 0 zijn.
  const timeAnchor = getTimeAnchor(health)

  const trend = health.trend
  const trendLabel =
    trend > 0 ? `+${trend.toFixed(0)} punten t.o.v. vorige maand`
    : trend < 0 ? `${trend.toFixed(0)} punten t.o.v. vorige maand`
    : 'gelijk aan vorige maand'

  return (
    <button
      type="button"
      onClick={onOpenReceipt}
      aria-label="Open detail van financiële gezondheidsscore"
      className={`flex items-center gap-4 sm:gap-6 rounded-2xl border border-[var(--border-ed)] ${style.bgInner} p-4 sm:p-6 text-left hover:border-[var(--ink-3)] hover:shadow-sm transition-all w-full`}
    >
      <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-[var(--border-ed)]"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={hasEntered ? dashOffset : circumference}
            className={style.ring}
            style={{
              transition: hasEntered
                ? 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)'
                : 'none',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-2xl font-bold text-[var(--ink)] leading-none">{Math.round(health.total)}</span>
          <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)] mt-0.5">van 100</span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Financiële gezondheid
        </div>
        <div className={`mt-0.5 text-lg sm:text-xl font-semibold ${style.text}`}>
          {style.label}
        </div>
        {health.previousMonth !== null && (
          <div className="text-xs text-[var(--ink-3)] mt-1">{trendLabel}</div>
        )}
        {/* Filosofie-ankerpunt: vertaal de score-context naar tijd via
            getTimeAnchor-helper. Maakt de score concreet conform de project-
            filosofie "Geld is opgeslagen tijd". */}
        {timeAnchor && (
          <div className="text-[11px] text-[var(--ink-3)] mt-1 italic">
            {timeAnchor.kind === 'fire' ? `${timeAnchor.value} op weg` : `${timeAnchor.value} buffer`}
          </div>
        )}
        <div className="text-[11px] text-[var(--ink-3)] mt-2 underline decoration-dotted underline-offset-2">
          Toon onderverdeling →
        </div>
      </div>
    </button>
  )
}
