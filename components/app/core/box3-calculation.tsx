'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import type { Box3Result } from '@/lib/box3-data'
import { BOX3_TOOLTIPS } from '@/lib/box3-data'
import { MaskedAmount } from '@/components/app/masked-amount'

function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-block">
      <Info className="h-3.5 w-3.5 cursor-help text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
      <div className="pointer-events-none absolute right-0 z-10 mt-1 w-52 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-2.5 text-xs leading-relaxed text-[var(--ink-2)] opacity-0 shadow-[var(--s2)] transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {text}
      </div>
    </div>
  )
}

interface StepProps {
  label: string
  value: React.ReactNode
  tooltip?: string
  highlight?: boolean
  indent?: boolean
  negative?: boolean
}

function Step({ label, value, tooltip, highlight, indent, negative }: StepProps) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${indent ? 'pl-4' : ''} ${highlight ? 'font-semibold' : ''}`}>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm ${highlight ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
          {label}
        </span>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      <span className={`text-sm font-medium tabular-nums ${
        negative ? 'text-red-600' :
        highlight ? 'text-kern-700' :
        'text-[var(--ink)]'
      }`}>
        {value}
      </span>
    </div>
  )
}

export function Box3Calculation({ result }: { result: Box3Result }) {
  const [expanded, setExpanded] = useState(false)

  const pct = (v: number) => `${(v * 100).toFixed(2)}%`

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--subtle)]"
      >
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Berekening stap-voor-stap</h3>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">"Kassabon" — hoe je Box 3 belasting tot stand komt</p>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
          : <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
        }
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-ed)] px-5 py-4">
          {/* Section: Bezittingen */}
          <div className="mb-4">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
              Bezittingen op peildatum
            </p>
            <Step label="Spaargeld" value={<MaskedAmount value={result.totaalSpaargeld} tone="kern" />} />
            <Step label="Beleggingen" value={<MaskedAmount value={result.totaalBeleggingen} tone="kern" />} />
            <Step label="Uitgesloten (Box 1 e.d.)" value={<MaskedAmount value={result.totaalUitgesloten} tone="kern" />} tooltip={BOX3_TOOLTIPS.eigenWoning} />
            <div className="my-2 border-t border-dashed border-[var(--border-ed)]" />
            <Step
              label="Totaal Box 3 bezittingen"
              value={<MaskedAmount value={result.totaalSpaargeld + result.totaalBeleggingen} tone="kern" />}
              highlight
            />
          </div>

          {/* Section: Schulden */}
          <div className="mb-4">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
              Schulden
            </p>
            <Step label="Box 3 schulden" value={<MaskedAmount value={result.totaalBox3Schulden} tone="kern" />} />
            <Step label="Schuldendrempel" value={<>-/- <MaskedAmount value={result.schuldendrempel} tone="kern" /></>} tooltip={BOX3_TOOLTIPS.schuldendrempel} />
            <div className="my-2 border-t border-dashed border-[var(--border-ed)]" />
            <Step label="Aftrekbare schulden" value={<MaskedAmount value={result.aftrekbareSchulden} tone="kern" />} highlight />
          </div>

          {/* Section: Forfaitair rendement */}
          <div className="mb-4">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
              Forfaitair rendement
            </p>
            <Step
              label={`Spaargeld (${pct(result.params.forfaitSpaargeld)})`}
              value={<MaskedAmount value={result.forfaitairSpaargeld} tone="kern" />}
              tooltip={BOX3_TOOLTIPS.forfaitairRendement}
            />
            <Step
              label={`Beleggingen (${pct(result.params.forfaitBeleggingen)})`}
              value={<MaskedAmount value={result.forfaitairBeleggingen} tone="kern" />}
            />
            <Step
              label={`Schulden (${pct(result.params.forfaitSchulden)})`}
              value={<>-/- <MaskedAmount value={result.forfaitairSchulden} tone="kern" /></>}
              negative
            />
            <div className="my-2 border-t border-dashed border-[var(--border-ed)]" />
            <Step label="Voordeel uit sparen en beleggen" value={<MaskedAmount value={result.voordeelUitSparen} tone="kern" />} highlight />
          </div>

          {/* Section: Grondslag */}
          <div className="mb-4">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
              Grondslag
            </p>
            <Step
              label="Rendementsgrondslag"
              value={<MaskedAmount value={result.rendementsgrondslag} tone="kern" />}
              tooltip={BOX3_TOOLTIPS.rendementsgrondslag}
            />
            <Step
              label="Heffingsvrij vermogen"
              value={<>-/- <MaskedAmount value={result.heffingsvrijVermogen} tone="kern" /></>}
              tooltip={BOX3_TOOLTIPS.heffingsvrijVermogen}
            />
            <div className="my-2 border-t border-dashed border-[var(--border-ed)]" />
            <Step label="Grondslag sparen en beleggen" value={<MaskedAmount value={result.grondslagSparen} tone="kern" />} highlight />
          </div>

          {/* Section: Belasting */}
          <div className="rounded-lg bg-kern-50 p-3">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-kern-700/60 uppercase">
              Belasting
            </p>
            <Step
              label={`Effectief rendement`}
              value={pct(result.effectiefRendement)}
              tooltip={BOX3_TOOLTIPS.effectiefTarief}
            />
            <Step label="Box 3 inkomen" value={<MaskedAmount value={result.box3Income} tone="kern" />} />
            <Step label={`Tarief (${pct(result.params.tarief)})`} value="" />
            <div className="my-2 border-t border-dashed border-kern-200" />
            <Step
              label="Te betalen Box 3 belasting"
              value={<MaskedAmount value={result.tax} tone="kern" />}
              highlight
            />
          </div>
        </div>
      )}
    </div>
  )
}
