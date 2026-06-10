import Link from 'next/link'
import { TrendingDown, ArrowRight, Compass } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { STRATEGY_LABELS, type FireEndStrategy } from '@/lib/fire-strategy'

/**
 * AfbouwOverzichtCard — toont de afbouw-fase als getallen-vergelijking
 * tussen "Bij vrijheid" (fireAge) en "Bij eindleeftijd" (endAge).
 *
 * Plan F-2 (Tier-3 #17 / §6.3 Tab 1): "Tijdas gaat door tot 90+, toont
 * vermogensafbouw, withdrawal-pad, eindsaldo. Niet als sub-tab maar als
 * integraal deel van de tijdas."
 *
 * MVP-scope: geen full tijdas-chart (die leeft in HorizonPage); wel een
 * snelle getallen-blik die laat zien hoeveel vermogen wordt verbruikt
 * tussen vrijheidsmoment en eindleeftijd. Past in VoorkeurenView omdat
 * eindstrategie + onttrekking de afbouw-dynamiek bepalen.
 */
export function AfbouwOverzichtCard({
  fireAge,
  endAge,
  fireAgeBalance,
  endBalance,
  strategy,
}: {
  /** Vrijheidsleeftijd (round) uit dashboardData.fireAgeFractional. */
  fireAge: number | null
  /** Eindleeftijd uit fireStrategy.endAge. */
  endAge: number
  /** Portfolio-waarde op fireAge (uit simRows). */
  fireAgeBalance: number | null
  /** Portfolio-waarde op endAge (uit simRows). */
  endBalance: number | null
  /** FireEndStrategy uit fireStrategy.strategy — voor context-label. */
  strategy: FireEndStrategy
}) {
  if (fireAge == null || fireAgeBalance == null || endBalance == null) {
    return null
  }

  const consumed = Math.max(0, fireAgeBalance - endBalance)
  const remaining = endBalance
  const years = endAge - fireAge
  const stratMeta = STRATEGY_LABELS[strategy]

  return (
    <section>
      <header className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Afbouw — eindsaldo
        </div>
        <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
          Van vrijheid tot eindleeftijd
        </h2>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          {years} jaar afbouw onder strategie {' '}
          <strong className="text-[var(--ink-2)]">{stratMeta?.name ?? strategy}</strong>.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Bij vrijheid */}
        <article className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 sm:p-5">
          <header className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 text-violet-700">
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-violet-700">
              Bij vrijheid · {fireAge}
            </div>
          </header>
          <div className="font-serif text-lg sm:text-xl font-semibold text-[var(--ink)] tabular-nums">
            {formatCurrency(Math.round(fireAgeBalance))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--ink-2)] leading-snug">
            Startbedrag voor de afbouw-fase.
          </p>
        </article>

        {/* Verbruik */}
        <article className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
          <header className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 text-amber-700">
              <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
              Verbruik · {years} jaar
            </div>
          </header>
          <div className="font-serif text-lg sm:text-xl font-semibold text-amber-700 tabular-nums">
            −{formatCurrency(Math.round(consumed))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--ink-2)] leading-snug">
            Wat je opneemt en aan kosten betaalt.
          </p>
        </article>

        {/* Bij eindleeftijd */}
        <article className="rounded-2xl border border-positive/20 bg-positive/5 p-4 sm:p-5">
          <header className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-positive/15 text-positive text-xs font-bold">
              {endAge}
            </span>
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-positive">
              Bij eindleeftijd
            </div>
          </header>
          <div className="font-serif text-lg sm:text-xl font-semibold text-[var(--ink)] tabular-nums">
            {formatCurrency(Math.round(remaining))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--ink-2)] leading-snug">
            {remaining > 0
              ? 'Restant — nalatenschap of buffer.'
              : strategy === 'deplete'
                ? 'Vermogen volledig opgemaakt — strategie geslaagd.'
                : 'Vermogen op — eerder dan gepland.'}
          </p>
        </article>
      </div>

      <Link
        href="/toekomst"
        className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline"
      >
        Volledige tijdas met afbouw-curve
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>

      <p className="mt-2 text-[10px] italic text-[var(--ink-4)] leading-snug">
        Berekening uit horizon-engine met {stratMeta?.subtitle?.toLowerCase()}.
      </p>
    </section>
  )
}
