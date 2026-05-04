'use client'

/**
 * `EquityBuildupBar` — drie-laagse stacked bar die de samenstelling van het
 * eigen huis toont: marktwaarde / restschuld / equity (eigen vermogen).
 *
 * Visuele opbouw (krant-stijl):
 *   ┌───────────────────────────────────────────────────────────┐
 *   │                  schuld (kern-300, grijs)        │ equity │
 *   │                                                  │ (kern  │
 *   │                                                  │ -700)  │
 *   └───────────────────────────────────────────────────────────┘
 *   ←─────────────  marktwaarde (totaal, 100%) ─────────────→
 *
 * - Geen `rounded-*` op de bar (krant-discipline).
 * - Animatie: bars groeien van 0% → doel-percentage met `useInViewAnimation`.
 *   60ms stagger tussen schuld-segment en equity-segment voor visuele
 *   ritme; matcht de patroon-gids "60ms per rij".
 * - Labels staan **buiten** de bar (boven en onder) zodat de bar zelf
 *   schoon blijft en getallen leesbaar in DM Mono + tabular-nums.
 *
 * Naast de bar tonen we de "maandelijkse equity-buildup" — een afgeleide
 * van rente vs aflossing (de aflossings-component is per definitie equity-
 * groei tegen 0% kosten). Dit cijfer geeft de gebruiker het waarom van
 * elke maandlast: "Je bouwt €X equity per maand op."
 */

import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

interface EquityBuildupBarProps {
  /** Huidige marktwaarde van het huis (€). */
  marketValue: number
  /** Resterende hypotheekschuld (€). */
  debtBalance: number
  /** Maandelijkse aflossing — toont "+€X equity/mnd" onder de bar. */
  monthlyPrincipal: number
  /** Optionele kicker (default "Vermogensopbouw"). */
  kicker?: string
}

export function EquityBuildupBar({
  marketValue,
  debtBalance,
  monthlyPrincipal,
  kicker = 'Vermogensopbouw',
}: EquityBuildupBarProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // Equity = marktwaarde minus schuld, niet onder 0 (overwaarde-only). Bij
  // onderwaarde zou de berekening moeten omkeren — voor nu klampen we omdat
  // negatieve equity een ander UI-pattern verdient (waarschuwing, niet
  // proportionele bar). Edge-case wordt zelden geraakt en het krant-pattern
  // verdraagt geen rode bars zonder context.
  const equity = Math.max(0, marketValue - debtBalance)
  const safeMarket = Math.max(1, marketValue) // voorkomt deling door 0
  const debtPct = Math.max(0, Math.min(100, (debtBalance / safeMarket) * 100))
  const equityPct = Math.max(0, Math.min(100, (equity / safeMarket) * 100))

  // Animatie: bar fadet/groeit in zodra hij in beeld komt. 700ms is genoeg
  // om de stack-overgang voelbaar te maken zonder traag aan te voelen.
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  return (
    <section ref={ref} className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {kicker}
        </p>
        <p className="font-mono tabular-nums text-[11px] text-[var(--ink-3)]">
          {fc(marketValue)} totaal
        </p>
      </header>

      {/* Stacked bar — 18px hoog, scherpe hoeken, geen border om de
          continuiteit te bewaren. Twee segmenten: schuld + equity. */}
      <div
        role="img"
        aria-label={`Marktwaarde ${fc(marketValue)}, waarvan ${fc(debtBalance)} schuld en ${fc(equity)} eigen vermogen`}
        className="relative h-[18px] w-full overflow-hidden bg-[var(--subtle)]"
      >
        {/* Schuld-segment — grijze tint (kern-300 bewust laag in de
            laddertje voor "vast/illiquide" volgens asset-color-systeem). */}
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 block h-full"
          style={{
            width: hasEntered ? `${debtPct}%` : '0%',
            backgroundColor: 'oklch(0.666 0.0311 34.7)', // kern-300
            transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
          }}
        />
        {/* Equity-segment — kern-700, donkerste tint. Begint waar schuld
            eindigt (`left: debtPct%`). 60ms stagger zodat het gevoel van
            "opbouwen" subtiel zichtbaar wordt. */}
        <span
          aria-hidden="true"
          className="absolute top-0 block h-full"
          style={{
            left: hasEntered ? `${debtPct}%` : '0%',
            width: hasEntered ? `${equityPct}%` : '0%',
            backgroundColor: 'oklch(0.345 0.0571 34.7)', // kern-700
            transition: 'left 700ms cubic-bezier(.22,1,.36,1) 60ms, width 700ms cubic-bezier(.22,1,.36,1) 60ms',
          }}
        />
      </div>

      {/* Onder-labels — drie kolommen: schuld | equity | maandelijkse buildup */}
      <div className="grid grid-cols-3 gap-3 text-[11px]">
        <Stat
          label="Schuld"
          value={fc(debtBalance)}
          tone="muted"
        />
        <Stat
          label="Eigen vermogen"
          value={fc(equity)}
          tone="primary"
        />
        <Stat
          label="Per maand"
          value={`+${fc(monthlyPrincipal)}`}
          tone="positive"
          help="Aflossingsdeel van je maandlast — direct equity-opbouw."
        />
      </div>
    </section>
  )
}

// ── Stat sub-component ───────────────────────────────────────

/**
 * Kleine metriek-blok met label boven en bedrag onder. Drie tonen:
 *  - `muted`: schuld, in `--ink-3`
 *  - `primary`: equity, in `--ink` (donkerste)
 *  - `positive`: groei, in `--positive` (semantische groene tint)
 *
 * `help` toont een optionele één-regel uitleg in `--ink-4` — alleen
 * gebruikt voor de "per maand"-kolom waar de afleiding niet vanzelf
 * spreekt. Geen tooltip want dat doorbreekt de scan-flow op desktop én
 * werkt slecht op touch.
 */
function Stat({
  label,
  value,
  tone,
  help,
}: {
  label: string
  value: string
  tone: 'muted' | 'primary' | 'positive'
  help?: string
}) {
  const valueClass =
    tone === 'primary'
      ? 'text-[var(--ink)]'
      : tone === 'positive'
        ? 'text-positive'
        : 'text-[var(--ink-3)]'

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        {label}
      </p>
      <p className={`mt-0.5 font-mono tabular-nums text-[13px] font-semibold ${valueClass}`}>
        {value}
      </p>
      {help && (
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--ink-4)]">
          {help}
        </p>
      )}
    </div>
  )
}
