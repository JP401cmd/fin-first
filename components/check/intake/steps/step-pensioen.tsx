'use client'

import { useState, useId } from 'react'
import { parseBedrag } from '@/lib/check/use-check-draft'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import type { RiskProfile } from '@/lib/check/types'
import { primaryBtn, backBtn, fieldLabel, inputBase } from '../intake-styles'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

/** Risicoprofiel → vooringevuld bruto verwacht rendement (%, nominaal). */
const RISK_OPTIONS: { value: RiskProfile; label: string; sub: string; prefillReturn: number }[] = [
  { value: 'defensief', label: 'Defensief', sub: '~5% verwacht rendement, laag risico', prefillReturn: 5 },
  { value: 'neutraal', label: 'Neutraal', sub: '~7% verwacht rendement, mix', prefillReturn: 7 },
  { value: 'offensief', label: 'Offensief', sub: '~8,5% verwacht rendement, hoog risico', prefillReturn: 8.5 },
]

/** Formatteer een %-waarde NL (komma-decimaal, geen trailing nul). */
function fmtPct(n: number): string {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(n)
}

export function StepPensioen({ intake, onChange, onNext, onBack }: Props) {
  const [rawAow, setRawAow] = useState(() =>
    intake.pension?.aowExpectedMonthly ? String(intake.pension.aowExpectedMonthly) : '',
  )
  const [rawReturn, setRawReturn] = useState(() =>
    intake.pension?.expectedReturnPct ? String(intake.pension.expectedReturnPct) : '',
  )
  const [rawRetireExp, setRawRetireExp] = useState(() =>
    intake.pension?.retirementMonthlyExpenses ? String(intake.pension.retirementMonthlyExpenses) : '',
  )
  const [chainOpen, setChainOpen] = useState(false)
  const aowId = useId()
  const retId = useId()
  const retireExpId = useId()
  const chainId = useId()

  const pension = intake.pension ?? {}

  function patchPension(patch: Partial<CheckDraft['intake']['pension']>) {
    onChange({ pension: { ...pension, ...patch } })
  }

  function handleSelectRisk(opt: (typeof RISK_OPTIONS)[number]) {
    const isSelected = pension?.riskProfile === opt.value
    if (isSelected) {
      // Deselecteren — rendement-override laten staan; gebruiker kan zelf wissen.
      patchPension({ riskProfile: null })
      return
    }
    // Selecteren prefiilt het verwachte rendement (handmatige invoer wint nog steeds).
    setRawReturn(fmtPct(opt.prefillReturn))
    patchPension({ riskProfile: opt.value, expectedReturnPct: opt.prefillReturn })
  }

  // ~75% van huidige maanduitgaven als concrete suggestie (afgeleid, niet hardcoded).
  const currentMonthlyExp = intake.expenses?.totaalMaand ?? 0
  const retireSuggestion = currentMonthlyExp > 0 ? Math.round((currentMonthlyExp * 0.75) / 50) * 50 : null
  const eurFmt = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="space-y-7">
      <p className="font-serif text-sm italic text-[var(--ink-3)]">
        Optioneel — maar hoe meer je invult, hoe accurater de toekomst-secties in je rapport.
      </p>

      {/* AOW verwacht */}
      <div>
        <label htmlFor={aowId} className={fieldLabel}>
          Geschatte AOW per maand{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
            &euro;
          </span>
          <input
            id={aowId}
            type="text"
            inputMode="decimal"
            value={rawAow}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.,]/g, '')
              setRawAow(v)
              const n = parseBedrag(v)
              patchPension({ aowExpectedMonthly: n > 0 ? n : null })
            }}
            placeholder="1.400"
            className={`${inputBase('horizon')} py-2.5 pr-3 pl-7 font-mono text-sm tabular-nums`}
          />
        </div>
        <p className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">
          Alleenstaande AOW 2025 ≈ €1.433 / maand. Je kunt dit ook via mijnpensioenoverzicht.nl inzien.
        </p>
      </div>

      {/* Risicoprofiel */}
      <div>
        <p className="mb-2 font-serif text-sm font-medium text-[var(--ink-2)]">
          Beleggingsrisico-profiel{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {RISK_OPTIONS.map((opt) => {
            const selected = pension?.riskProfile === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelectRisk(opt)}
                aria-pressed={selected}
                className={`flex flex-col items-start border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-horizon-500 ${
                  selected
                    ? 'border-horizon-600 bg-horizon-50 text-[var(--ink)]'
                    : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-horizon-400 hover:bg-horizon-50/50'
                }`}
              >
                <span className="font-display text-sm font-semibold leading-tight">
                  {opt.label}
                </span>
                <span className="mt-0.5 font-serif text-xs italic text-[var(--ink-3)]">
                  {opt.sub}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Verwacht rendement override */}
      <div>
        <label htmlFor={retId} className={fieldLabel}>
          Verwacht jaarrendement{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel — overschrijft profiel)</span>
        </label>
        <div className="relative">
          <input
            id={retId}
            type="text"
            inputMode="decimal"
            value={rawReturn}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.,]/g, '')
              setRawReturn(v)
              const n = parseBedrag(v)
              patchPension({ expectedReturnPct: n > 0 ? n : null })
            }}
            placeholder="7,0"
            className={`${inputBase('horizon')} px-3 py-2.5 pr-8 font-mono text-sm tabular-nums`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-4)]">
            %
          </span>
        </div>
        <p className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">
          Dit is je verwachte <span className="font-medium not-italic">bruto (nominaal)</span> rendement
          vóór inflatie en belasting — historisch ≈ 7%/jaar voor wereldaandelen. Wij trekken er zelf
          inflatie (~2%) en Box 3 (~2,1%) af, zodat je netto ongeveer 2,9% reëel overhoudt — dat zie
          je terug bij de kruising.
        </p>
        <button
          type="button"
          onClick={() => setChainOpen((o) => !o)}
          aria-expanded={chainOpen}
          aria-controls={chainId}
          className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-horizon-700 underline-offset-4 hover:underline"
        >
          {chainOpen ? 'Verberg' : 'Toon'} de rekenketen
        </button>
        {chainOpen && (
          <div
            id={chainId}
            className="mt-2 border border-[var(--border-ed)] bg-horizon-50/40 px-4 py-3 font-serif text-xs text-[var(--ink-2)]"
          >
            <ol className="space-y-1">
              <li>
                <span className="font-mono font-medium tabular-nums text-[var(--ink)]">7,0%</span> bruto
                nominaal rendement
              </li>
              <li>
                − <span className="font-mono tabular-nums">~2,0%</span> inflatie ={' '}
                <span className="font-mono font-medium tabular-nums text-[var(--ink)]">~5,0%</span> reëel
              </li>
              <li>
                − <span className="font-mono tabular-nums">~2,1%</span> Box 3-heffing ={' '}
                <span className="font-mono font-medium tabular-nums text-horizon-700">~2,9%</span>{' '}
                netto reëel — wat je bij de kruising ziet
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* Uitgaven na pensioen */}
      <div>
        <label htmlFor={retireExpId} className={fieldLabel}>
          Geschatte uitgaven na pensioen{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel — per maand)</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
            &euro;
          </span>
          <input
            id={retireExpId}
            type="text"
            inputMode="decimal"
            value={rawRetireExp}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.,]/g, '')
              setRawRetireExp(v)
              const n = parseBedrag(v)
              patchPension({ retirementMonthlyExpenses: n > 0 ? n : null })
            }}
            placeholder={retireSuggestion ? String(retireSuggestion) : '2.500'}
            className={`${inputBase('horizon')} py-2.5 pr-3 pl-7 font-mono text-sm tabular-nums`}
          />
        </div>
        <p className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">
          Veel mensen houden na hun pensioen ~70–80% van hun huidige uitgaven.
          {retireSuggestion
            ? <> Op basis van jouw uitgaven is dat zo&apos;n <span className="font-mono not-italic tabular-nums text-[var(--ink-2)]">{eurFmt(retireSuggestion)}</span>/maand.</>
            : <> Laat leeg om je huidige uitgaven aan te houden.</>}
        </p>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button type="button" onClick={onNext} className={primaryBtn('horizon')}>
          Verder
        </button>
        <button type="button" onClick={onBack} className={backBtn}>
          Terug
        </button>
      </div>
    </div>
  )
}
