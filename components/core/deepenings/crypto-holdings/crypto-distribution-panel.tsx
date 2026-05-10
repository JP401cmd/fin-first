'use client'

// crypto-distribution-panel.tsx — één hostend paneel voor de vier
// "verdelings"-views op de crypto Holdings-app.
//
// Vóór deze refactor stonden vier secties verticaal gestapeld op de pagina:
// allocation-donut · source-breakdown · spread-section · heatmap. Allemaal
// vertelden ze "hoe is dit portfolio verdeeld" maar elk vanuit een andere
// invalshoek (per coin / per bron / coin × bron / oppervlakte × 24u). Samen
// bezetten ze ~4 verticale schermen tussen KPI en holdings-grid.
//
// Nu één blok met segmented-control rechts in de header. Default = "Per
// coin" (donut, krachtigste eerste view); de andere drie zijn één klik weg.
// De vier child-componenten blijven onaangeraakt; dit paneel routeert er
// alleen tussen.
//
// Krant-esthetiek:
//   - Scherpe hoeken (geen rounded behalve `rounded-full` indien nodig — hier niet)
//   - Segmented control identiek aan de PeriodToggle in `crypto-kpi-strip.tsx`
//     (h-8, font 11px UPPERCASE tracking-[0.06em], `bg-kern-100 text-kern-800`
//     active state)
//   - Mobile: control scrollt horizontaal als de vier labels niet passen
//   - Geen animatie tussen views — gebruiker-getriggerd, abrupt OK

import { useMemo, useState } from 'react'
import type {
  CryptoHoldingPeriodReturn,
  CryptoHoldingRow,
  CryptoSpreadEntry,
} from '@/lib/crypto-holdings-data'
import { CryptoAllocationChart } from './crypto-allocation-chart'
import { CryptoHeatmap } from './crypto-heatmap'
import {
  CryptoSourceBreakdown,
  labelForSource,
} from './crypto-source-breakdown'
import { CryptoSpreadSection } from './crypto-spread-section'

type DistributionView = 'coin' | 'source' | 'spread' | 'heatmap'

interface ViewOption {
  key: DistributionView
  label: string
}

// Volgorde stuurt de tab-volgorde + segmented-control-volgorde. "Per coin"
// eerst omdat de donut de meest scan-vriendelijke view is — wat de meeste
// gebruikers willen weten ("hoeveel BTC vs ETH zit erin?"). De overige drie
// zijn analytische verdiepingen.
const VIEW_OPTIONS: readonly ViewOption[] = [
  { key: 'coin', label: 'Per coin' },
  { key: 'source', label: 'Per bron' },
  { key: 'spread', label: 'Spreiding' },
  { key: 'heatmap', label: 'Heatmap' },
] as const

export interface CryptoDistributionPanelProps {
  holdings: CryptoHoldingRow[]
  totalValue: number
  spread: CryptoSpreadEntry[]
  /** 24h per-holding rendementen — gevoed naar de heatmap-view. Ontbreken → grijze tegels. */
  perHoldingChange24h?: CryptoHoldingPeriodReturn[]
  /** Actieve bron-filter — gedeeld met de holdings-grid via de host. */
  sourceFilter: string | null
  onSourceFilterChange: (label: string | null) => void
}

export function CryptoDistributionPanel({
  holdings,
  totalValue,
  spread,
  perHoldingChange24h,
  sourceFilter,
  onSourceFilterChange,
}: CryptoDistributionPanelProps) {
  const [view, setView] = useState<DistributionView>('coin')

  // Aantal unieke bronnen — nodig voor de "Per bron"-regressiegate.
  // `CryptoSourceBreakdown` rendert `null` bij ≤1 bron (zie regel 37 van dat
  // bestand). Zonder onderschepping zou de gebruiker op "Per bron" klikken
  // en een leeg paneel zien. Wij vangen dat hier op met een placeholder
  // zodat de segmented-control altijd betekenisvolle content terugkrijgt.
  const sourceCount = useMemo(() => {
    const labels = new Set<string>()
    for (const h of holdings) labels.add(labelForSource(h))
    return labels.size
  }, [holdings])

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        {/* Kicker links — krant-streep volgt het bestaande patroon van de
            sub-strips ("Verdeling" als section-label, niet als kop). */}
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Verdeling
        </p>
        <ViewToggle value={view} onChange={setView} />
      </header>

      <div>
        {view === 'coin' && (
          <CryptoAllocationChart holdings={holdings} totalValue={totalValue} />
        )}

        {view === 'source' &&
          (sourceCount <= 1 ? (
            <DistributionPlaceholder>
              {sourceCount === 0
                ? 'Nog geen bron geregistreerd.'
                : 'Eén bron — niets te verdelen.'}
            </DistributionPlaceholder>
          ) : (
            <CryptoSourceBreakdown
              holdings={holdings}
              totalValue={totalValue}
              activeLabel={sourceFilter}
              onSelect={onSourceFilterChange}
            />
          ))}

        {view === 'spread' &&
          (spread.length === 0 ? (
            <DistributionPlaceholder>
              Nog geen coins om over bronnen te spreiden.
            </DistributionPlaceholder>
          ) : (
            <CryptoSpreadSection spread={spread} />
          ))}

        {view === 'heatmap' && (
          <CryptoHeatmap
            holdings={holdings}
            perHoldingChange24h={perHoldingChange24h}
          />
        )}
      </div>
    </section>
  )
}

// ── Segmented control ───────────────────────────────────────────────────
//
// Visueel identiek aan `PeriodToggle` in `crypto-kpi-strip.tsx` (regels
// 232-259) — h-8, min-w 80px (iets ruimer dan PeriodToggle's 40px omdat de
// labels langer zijn), font 11px UPPERCASE tracking-[0.06em], active state
// `bg-kern-100 text-kern-800`. Op mobiel scrollt de control horizontaal
// als hij niet past; `scrollbar-hidden`-utility is hier bewust niet
// gebruikt (de native scrollbar is een legitieme affordance dat er meer is).

interface ViewToggleProps {
  value: DistributionView
  onChange: (next: DistributionView) => void
}

function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      className="flex items-center overflow-x-auto border border-[var(--border-ed)] bg-[var(--paper)]"
      role="group"
      aria-label="Verdeling-weergave selecteren"
    >
      {VIEW_OPTIONS.map((opt) => {
        const active = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            className={`inline-flex h-8 min-w-[80px] shrink-0 items-center justify-center px-3 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors ${
              active
                ? 'bg-kern-100 text-kern-800'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Placeholder-cel voor lege views ──────────────────────────────────────
//
// Voorkomt dat de panel-content stilzwijgend leeg is wanneer een specifieke
// view geen data heeft (bv. "Per bron" met één bron). Visueel afgestemd op
// de bestaande dashed-border empty-states elders in deze tab.

function DistributionPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-6 text-center">
      <p className="font-serif italic text-sm text-[var(--ink-2)]">{children}</p>
    </div>
  )
}
