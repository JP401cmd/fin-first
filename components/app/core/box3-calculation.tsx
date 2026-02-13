'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { Box3Result } from '@/lib/box3-data'
import { BOX3_TOOLTIPS } from '@/lib/box3-data'

function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-block">
      <Info className="h-3.5 w-3.5 cursor-help text-zinc-300 transition-colors group-hover:text-amber-500" />
      <div className="pointer-events-none absolute right-0 z-10 mt-1 w-52 rounded-lg border border-zinc-200 bg-white p-2.5 text-xs leading-relaxed text-zinc-600 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {text}
      </div>
    </div>
  )
}

interface StepProps {
  label: string
  value: string
  tooltip?: string
  highlight?: boolean
  indent?: boolean
  negative?: boolean
}

function Step({ label, value, tooltip, highlight, indent, negative }: StepProps) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${indent ? 'pl-4' : ''} ${highlight ? 'font-semibold' : ''}`}>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm ${highlight ? 'text-zinc-900' : 'text-zinc-600'}`}>
          {label}
        </span>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      <span className={`text-sm font-medium tabular-nums ${
        negative ? 'text-red-600' :
        highlight ? 'text-amber-700' :
        'text-zinc-900'
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
    <div className="rounded-xl border border-zinc-200 bg-white">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-zinc-50"
      >
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Berekening stap-voor-stap</h3>
          <p className="mt-0.5 text-xs text-zinc-400">"Kassabon" — hoe je Box 3 belasting tot stand komt</p>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-zinc-400" />
          : <ChevronDown className="h-4 w-4 text-zinc-400" />
        }
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-5 py-4">
          {/* Section: Bezittingen */}
          <div className="mb-4">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Bezittingen op peildatum
            </p>
            <Step label="Spaargeld" value={formatCurrency(result.totaalSpaargeld)} />
            <Step label="Beleggingen" value={formatCurrency(result.totaalBeleggingen)} />
            <Step label="Uitgesloten (Box 1 e.d.)" value={formatCurrency(result.totaalUitgesloten)} tooltip={BOX3_TOOLTIPS.eigenWoning} />
            <div className="my-2 border-t border-dashed border-zinc-200" />
            <Step
              label="Totaal Box 3 bezittingen"
              value={formatCurrency(result.totaalSpaargeld + result.totaalBeleggingen)}
              highlight
            />
          </div>

          {/* Section: Schulden */}
          <div className="mb-4">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Schulden
            </p>
            <Step label="Box 3 schulden" value={formatCurrency(result.totaalBox3Schulden)} />
            <Step label="Schuldendrempel" value={`-/- ${formatCurrency(result.schuldendrempel)}`} tooltip={BOX3_TOOLTIPS.schuldendrempel} />
            <div className="my-2 border-t border-dashed border-zinc-200" />
            <Step label="Aftrekbare schulden" value={formatCurrency(result.aftrekbareSchulden)} highlight />
          </div>

          {/* Section: Forfaitair rendement */}
          <div className="mb-4">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Forfaitair rendement
            </p>
            <Step
              label={`Spaargeld (${pct(result.params.forfaitSpaargeld)})`}
              value={formatCurrency(result.forfaitairSpaargeld)}
              tooltip={BOX3_TOOLTIPS.forfaitairRendement}
            />
            <Step
              label={`Beleggingen (${pct(result.params.forfaitBeleggingen)})`}
              value={formatCurrency(result.forfaitairBeleggingen)}
            />
            <Step
              label={`Schulden (${pct(result.params.forfaitSchulden)})`}
              value={`-/- ${formatCurrency(result.forfaitairSchulden)}`}
              negative
            />
            <div className="my-2 border-t border-dashed border-zinc-200" />
            <Step label="Voordeel uit sparen en beleggen" value={formatCurrency(result.voordeelUitSparen)} highlight />
          </div>

          {/* Section: Grondslag */}
          <div className="mb-4">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Grondslag
            </p>
            <Step
              label="Rendementsgrondslag"
              value={formatCurrency(result.rendementsgrondslag)}
              tooltip={BOX3_TOOLTIPS.rendementsgrondslag}
            />
            <Step
              label="Heffingsvrij vermogen"
              value={`-/- ${formatCurrency(result.heffingsvrijVermogen)}`}
              tooltip={BOX3_TOOLTIPS.heffingsvrijVermogen}
            />
            <div className="my-2 border-t border-dashed border-zinc-200" />
            <Step label="Grondslag sparen en beleggen" value={formatCurrency(result.grondslagSparen)} highlight />
          </div>

          {/* Section: Belasting */}
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-amber-700/60 uppercase">
              Belasting
            </p>
            <Step
              label={`Effectief rendement`}
              value={pct(result.effectiefRendement)}
              tooltip={BOX3_TOOLTIPS.effectiefTarief}
            />
            <Step label="Box 3 inkomen" value={formatCurrency(result.box3Inkomen)} />
            <Step label={`Tarief (${pct(result.params.tarief)})`} value="" />
            <div className="my-2 border-t border-dashed border-amber-200" />
            <Step
              label="Te betalen Box 3 belasting"
              value={formatCurrency(result.belasting)}
              highlight
            />
          </div>
        </div>
      )}
    </div>
  )
}
