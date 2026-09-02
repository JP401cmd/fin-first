'use client'

/**
 * ScenarioKaarten — de zes scenario's naast elkaar (/toekomst, ronde 3, element ⑨;
 * `stop-nu` erbij sinds ADR 0126 PR B4). Puur presentational: consumeert
 * `ScenarioPresetResult[]` in de volgorde van `resolveScenarioPresets` (doorgerekend
 * door `lib/horizon/scenario-presets.ts` — het RUNNEN gebeurt elders in de wiring);
 * een extra kaart in de specs verschijnt hier vanzelf.
 *
 * Per kaart: een status-flag (BASIS / GROEN / AMBER / ROOD — SEMANTISCHE stoplicht-
 * tinten, géén module-accent), het preset-label als serif-titel, en drie meet-rijen
 * (stoppen · maandruimte-of-delta · laagste buffer). Bedragen tabular-nums; de laagste
 * buffer is een BEDRAG en gaat daarom altijd via `MaskedAmount` (masking-plicht).
 *
 * EURO-WEERGAVE: dit component rekent niets om. `laagsteBuffer.bedrag` komt al
 * omgezet binnen uit het render-grensblok van `horizon-client.tsx` (klasse S op
 * `laagsteBuffer.age`). `maandruimteOfDelta` is de INSTELLING van de kaart
 * (−€300/mnd, +€250/mnd) — een bedrag van vandaag en dus per definitie exempt.
 */

import { formatCurrency } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import { InlineInfoDisclosure } from '@/components/editorial'
import type { ScenarioPresetResult, ScenarioPresetStatus } from '@/lib/horizon/scenario-presets'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/** Flag-tint per status — stoplichtfamilie (zelfde als LEVERAGE_STATUS_DOT), geen module-kleur. */
const FLAG: Record<ScenarioPresetStatus, { label: string; className: string }> = {
  basis: { label: 'BASIS', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  groen: { label: 'GROEN', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  amber: { label: 'AMBER', className: 'border-amber-300 bg-amber-100 text-amber-800' },
  rood: { label: 'ROOD', className: 'border-red-200 bg-red-50 text-red-700' },
}

/** Leeftijd met 1 decimaal in NL-notatie (komma), of "—" bij null. */
function formatLeeftijd(age: number | null): string {
  if (age == null) return '—'
  return `${age.toFixed(1).replace('.', ',')} jr`
}

/** Delta met expliciet teken (+€250 / €-300). */
function formatDelta(value: number): string {
  return value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value)
}

function DataRow({
  label,
  divider,
  children,
}: {
  label: string
  divider: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1.5 ${
        divider ? 'border-b border-dashed border-[var(--border-ed)]' : ''
      }`}
    >
      <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
        {label}
      </span>
      <span className="text-[12.5px] tabular-nums text-[var(--ink)]">{children}</span>
    </div>
  )
}

function ScenarioCard({ kaart }: { kaart: ScenarioPresetResult }) {
  const flag = FLAG[kaart.status]
  const isRood = kaart.status === 'rood'
  const deltaLabel = kaart.kind === 'input' ? 'Delta' : 'Maandruimte'

  return (
    <li
      className="flex flex-col border border-[var(--ink)] bg-[var(--paper)] px-3.5 py-3"
      aria-label={`Scenario ${kaart.label} — status ${flag.label.toLowerCase()}`}
    >
      <span
        className={`mb-2 inline-flex w-fit items-center rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.15em] ${flag.className}`}
      >
        {flag.label}
      </span>

      <h3
        className="mb-2 text-[15px] font-bold leading-snug text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {kaart.label}
      </h3>

      <div className="mt-auto">
        <DataRow label="Stoppen" divider>
          {formatLeeftijd(kaart.stopLeeftijd)}
        </DataRow>

        <DataRow label={deltaLabel} divider>
          {kaart.maandruimteOfDelta == null ? '—' : formatDelta(kaart.maandruimteOfDelta)}
        </DataRow>

        <DataRow label="Laagste buffer" divider={false}>
          {kaart.laagsteBuffer == null ? (
            '—'
          ) : (
            <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1">
              <MaskedAmount
                value={kaart.laagsteBuffer.bedrag}
                tone="inherit"
                className={isRood ? 'text-[var(--negative)]' : 'text-[var(--ink)]'}
              />
              <span className="font-mono text-[10px] text-[var(--ink-3)]">
                (op {Math.round(kaart.laagsteBuffer.age)})
              </span>
            </span>
          )}
        </DataRow>
      </div>
    </li>
  )
}

function SkeletonCard() {
  return (
    <li className="flex flex-col border border-[var(--border-ed)] bg-[var(--paper)] px-3.5 py-3">
      <div className="mb-2 h-4 w-14 animate-pulse rounded-full bg-[var(--subtle)] motion-reduce:animate-none" />
      <div className="mb-3 h-4 w-24 animate-pulse bg-[var(--subtle)] motion-reduce:animate-none" />
      <div className="mt-auto space-y-2.5">
        <div className="h-3 w-full animate-pulse bg-[var(--subtle)] motion-reduce:animate-none" />
        <div className="h-3 w-full animate-pulse bg-[var(--subtle)] motion-reduce:animate-none" />
        <div className="h-3 w-full animate-pulse bg-[var(--subtle)] motion-reduce:animate-none" />
      </div>
    </li>
  )
}

/** Aantal kaarten in `resolveScenarioPresets` — alleen voor het skeleton. */
const SCENARIO_KAART_AANTAL = 6

export interface ScenarioKaartenProps {
  /** De doorgerekende preset-kaarten (vaste volgorde van `resolveScenarioPresets`). */
  kaarten: ScenarioPresetResult[]
  /** Skeleton-weergave zolang de runs nog lopen. */
  isLoading?: boolean
}

export function ScenarioKaarten({ kaarten, isLoading }: ScenarioKaartenProps) {
  return (
    <div>
      <InlineInfoDisclosure label="Uitleg scenario's">
        <div
          className="mb-1.5 font-semibold text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Hoe de scenario's zijn doorgerekend
        </div>
        <p className="m-0">
          Elk scenario = één of twee knoppen anders dan je basispad, opnieuw doorgerekend door
          dezelfde rekenkern (één run per kaart). De{' '}
          <b className="text-[var(--ink)]">laagste buffer</b> = de diepste belegbare (liquide)
          stand over de hele horizon — meestal in de brugjaren. De stop-varianten gebruiken een
          geforceerde run: je stopt dan écht op die leeftijd. Bij &ldquo;Een jaar langer&rdquo; en
          &ldquo;Eerder stoppen&rdquo; teer je daarna in (deplete); &ldquo;Nu stoppen&rdquo; houdt je
          eigen eindstrategie en eindleeftijd.
        </p>
        <ul className="mt-2 mb-0 list-none space-y-0.5 pl-0">
          <li>
            <b className="text-[var(--ink)]">Basis</b> — je huidige pad.
          </li>
          <li>
            <b className="text-[var(--ink)]">Nu stoppen</b> — stop vandaag, op je huidige leeftijd;
            je plan blijft staan, dit is het beeld ernaast.
          </li>
          <li>
            <b className="text-[var(--ink)]">Een jaar langer</b> — stop op verwacht + 1.
          </li>
          <li>
            <b className="text-[var(--ink)]">€300 minder/mnd</b> — structureel lagere uitgaven.
          </li>
          <li>
            <b className="text-[var(--ink)]">Kleiner wonen / Extra inleg</b> — huis-verzilvering
            of +€250/mnd.
          </li>
          <li>
            <b className="text-[var(--ink)]">Eerder stoppen</b> — stop op verwacht − 2, de
            waarschuwing.
          </li>
        </ul>
      </InlineInfoDisclosure>

      <ul
        role="list"
        aria-label="Scenario's naast elkaar"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        {isLoading
          ? Array.from({ length: SCENARIO_KAART_AANTAL }, (_, i) => <SkeletonCard key={i} />)
          : kaarten.map(kaart => <ScenarioCard key={kaart.id} kaart={kaart} />)}
      </ul>
    </div>
  )
}
