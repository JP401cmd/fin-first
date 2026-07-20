'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Calculator, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { GoalForm } from '@/components/app/goal-form'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { STANDAARD_DOELEN } from '@/lib/goals/standaard-doelen'

type AssetLite = { id: string; name: string; current_value: number }
type DebtLite = { id: string; name: string; current_balance: number }

/**
 * DoelToevoegenSheet — plan §6.3 Tab 2 detail-pane: doelen toevoegen
 * direct op de Doelen-tab zonder doorklikken naar /will.
 *
 * Form-velden (minimaal):
 *  - Naam (verplicht, max 100 chars)
 *  - Doelbedrag in EUR (verplicht, positief getal)
 *  - Streefdatum (optioneel, ISO yyyy-mm-dd)
 *  - Doel-type (savings / wealth / debt) — default 'savings'
 *
 * Edit-flow blijft op /will (legacy). Deze sheet is alleen voor het
 * snel toevoegen-pad zodat de Doelen-tab een complete CRUD-plek
 * wordt zonder bestaande pagina te dupliceren.
 */

type GoalType = 'savings' | 'wealth' | 'debt'

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings: 'Sparen',
  wealth: 'Vermogen groeien',
  debt: 'Schuld aflossen',
}

/** Default jaarrendement per goal-type. NL-context: sparen ~1.5%
 *  (deposito), beleggen ~6% (wereldwijde ETF lange termijn), schuld
 *  loopt 0% (we tellen alleen inleg). */
const RETURN_BY_TYPE: Record<GoalType, number> = {
  savings: 0.015,
  wealth: 0.06,
  debt: 0,
}

/**
 * Bereken benodigde maandelijkse inleg om een doelbedrag in N maanden
 * te bereiken bij gegeven jaarrendement.
 *
 * Formule (future-value of annuity):
 *   FV = PMT × ((1 + r)^n − 1) / r
 *   PMT = FV × r / ((1 + r)^n − 1)
 *
 * Bij r=0 (debt-goal): PMT = FV / n.
 */
function monthlyContributionForTarget(
  target: number,
  years: number,
  annualReturn: number,
): number {
  if (years <= 0) return target
  const months = years * 12
  if (annualReturn <= 0) return target / months
  const r = annualReturn / 12
  const growthFactor = Math.pow(1 + r, months)
  return (target * r) / (growthFactor - 1)
}

/**
 * DoelToevoegenSheet-props: de canonieke effectieve maand-cijfers uit de bundel/
 * loader (`monthlyIncome`/`monthlyExpenses`). De standaard-doelen-kiezer gebruikt
 * ze om richtbedragen te personaliseren (noodfonds = 6× uitgaven, vrijheidsgetal =
 * 25× jaaruitgaven) — CONSUME, don't recompute: nooit zelf uit transacties afleiden.
 * Beide optioneel: zonder cijfers valt de kiezer terug op lege bedragen + hints.
 */
export type DoelToevoegenSheetProps = {
  monthlyIncome?: number
  monthlyExpenses?: number
}

export function DoelToevoegenSheet({
  monthlyIncome = 0,
  monthlyExpenses = 0,
}: DoelToevoegenSheetProps = {}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [goalType, setGoalType] = useState<GoalType>('savings')
  // Icoon/kleur van het gekozen standaard-doel — meegeschreven bij insert zodat
  // de goal-kaart de juiste identiteit krijgt (default: neutraal Target/teal).
  const [icon, setIcon] = useState('Target')
  const [color, setColor] = useState('teal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Geavanceerd-modus: opent GoalForm met alle goal_types + asset/debt-
  // koppeling. Assets+debts laden we lazy bij open van die overlay.
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [assets, setAssets] = useState<AssetLite[]>([])
  const [debts, setDebts] = useState<DebtLite[]>([])
  const router = useRouter()

  useEffect(() => {
    if (!advancedOpen) return
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const [aRes, dRes] = await Promise.all([
        supabase.from('assets').select('id, name, current_value').order('name'),
        supabase.from('debts').select('id, name, current_balance').order('name'),
      ])
      if (cancelled) return
      setAssets(((aRes.data ?? []) as AssetLite[]))
      setDebts(((dRes.data ?? []) as DebtLite[]))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [advancedOpen])

  function reset() {
    setName('')
    setTargetValue('')
    setTargetDate('')
    setGoalType('savings')
    setIcon('Target')
    setColor('teal')
    setError(null)
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!name.trim()) {
      setError('Naam is verplicht.')
      return
    }
    const numericTarget = Number(targetValue)
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setError('Doelbedrag moet een positief getal zijn.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd.')
      setSaving(false)
      return
    }
    const { error: insertError } = await supabase.from('goals').insert({
      user_id: user.id,
      name: name.trim(),
      goal_type: goalType,
      target_value: numericTarget,
      current_value: 0,
      target_date: targetDate || null,
      icon,
      color,
      is_completed: false,
    })
    if (insertError) {
      setError(`Opslaan mislukt: ${insertError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    setOpen(false)
    reset()
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 border border-dashed border-[var(--border-md)] bg-[var(--paper)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        Doel toevoegen
      </button>

      {open && (
        <ShellOverlay
          open
          onClose={() => {
            setOpen(false)
            reset()
          }}
          kind="sheet"
          size="md"
          title="Doel toevoegen"
          footer={
            <ModalFooter
              primary={{
                label: 'Doel toevoegen',
                onClick: () => handleSubmit(),
                loading: saving,
              }}
              secondary={{
                label: 'Annuleer',
                onClick: () => {
                  setOpen(false)
                  reset()
                },
              }}
            />
          }
        >
          <form onSubmit={handleSubmit} className="p-5 sm:p-6">
            {error && (
              <div
                role="alert"
                className="mb-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                {error}
              </div>
            )}

            {/* Standaard-doelen-kiezer — één klik vult naam/bedrag/type/icoon in.
                Bedragen komen uit de canonieke bundel-cijfers (consume, don't
                recompute); 0 = geen zinvol bedrag → veld leeg + hint als richting. */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] mb-2">
                Snel starten met
              </div>
              <div className="grid grid-cols-3 gap-2">
                {STANDAARD_DOELEN.map((preset) => {
                  const computed = preset.computeTarget({ monthlyIncome, monthlyExpenses })
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => {
                        setName(preset.label)
                        setTargetValue(computed > 0 ? String(computed) : '')
                        setGoalType(preset.goalType)
                        setIcon(preset.icon)
                        setColor(preset.color)
                      }}
                      className="flex flex-col items-start gap-0.5 border border-[var(--border-ed)] bg-[var(--paper)] p-2.5 text-left hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
                    >
                      <span className="text-base leading-none" aria-hidden="true">
                        {preset.emoji}
                      </span>
                      <span className="text-xs font-semibold text-[var(--ink)] mt-1">
                        {preset.label}
                      </span>
                      {computed > 0 ? (
                        <span className="text-[10px] font-semibold text-[var(--ink-2)] tabular-nums leading-snug">
                          {formatCurrency(computed)}
                        </span>
                      ) : null}
                      <span className="text-[10px] text-[var(--ink-3)] leading-snug">
                        {preset.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Naam
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="bv. Spaargeld voor woning"
                  maxLength={100}
                  className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                  required
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Doelbedrag (€)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={100}
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="50000"
                  className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                  required
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Streefdatum (optioneel)
                </span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Type
                </span>
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value as GoalType)}
                  className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                >
                  {(Object.keys(GOAL_TYPE_LABELS) as GoalType[]).map((t) => (
                    <option key={t} value={t}>
                      {GOAL_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Live ETA-preview — vult zich zodra targetValue is ingevuld.
                Toont per goalType de relevante maandelijkse inleg of
                tijdslijn zodat de gebruiker zijn doel realistisch ijkt
                voor opslaan. */}
            <EtaPreview
              targetValue={targetValue}
              targetDate={targetDate}
              goalType={goalType}
            />

            {/* Geavanceerd: alle goal_types (netto vermogen, spaarquote,
                noodfonds, vrijheidsdagen, passief inkomen, vrij doel),
                asset/debt-koppeling, en optionele velden. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setAdvancedOpen(true)
              }}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-horizon-700 hover:text-horizon-800 hover:underline"
            >
              <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
              Geavanceerd (meer doel-types + koppelingen)
            </button>
          </form>
        </ShellOverlay>
      )}

      {/* GoalForm overlay (geavanceerde modus). Gebruikt initialValues
          om de al-ingevulde naam/bedrag/datum mee te nemen — zo verliest
          de gebruiker geen input bij de switch. */}
      {advancedOpen && (
        <GoalForm
          assets={assets}
          debts={debts}
          initialValues={{
            name: name || undefined,
            target_value: targetValue || undefined,
            target_date: targetDate || undefined,
          }}
          onClose={() => setAdvancedOpen(false)}
          onSaved={() => {
            setAdvancedOpen(false)
            setOpen(false)
            reset()
            router.refresh()
          }}
        />
      )}
    </>
  )
}

/**
 * EtaPreview — toont live berekening op basis van targetValue +
 * targetDate + goalType. Drie scenario's:
 *
 *  1. targetValue + targetDate ingevuld → toont 'X €/maand nodig' bij
 *     het gekozen goalType-rendement.
 *  2. Alleen targetValue → toont 'bij €100/mnd haal je dit in N jaar'
 *     als referentiepunt.
 *  3. Niet genoeg input → blok rendert niet.
 *
 * NL-defaults zijn voorzichtig (1.5% sparen, 6% beleggen). De waarden
 * zijn richtcijfers — gebruiker kan na opslaan in DoelBewerkenSheet
 * z'n voortgang bijwerken.
 */
function EtaPreview({
  targetValue,
  targetDate,
  goalType,
}: {
  targetValue: string
  targetDate: string
  goalType: GoalType
}) {
  const target = Number(targetValue)
  if (!Number.isFinite(target) || target <= 0) return null

  const annualReturn = RETURN_BY_TYPE[goalType]

  // Case 1: doel + datum → maandelijkse inleg
  if (targetDate) {
    const targetMs = new Date(targetDate).getTime()
    if (Number.isNaN(targetMs)) return null
    const years = (targetMs - Date.now()) / (1000 * 60 * 60 * 24 * 365)
    if (years <= 0.1) return null
    const monthly = monthlyContributionForTarget(target, years, annualReturn)
    const yearsLabel =
      years >= 2 ? `${Math.round(years)} jaar` : `${Math.round(years * 12)} maanden`
    return (
      <section
        data-testid="eta-preview"
        className="mt-4 border border-positive/20 bg-positive/5 p-3"
      >
        <header className="flex items-center gap-1.5 mb-1">
          <Calculator className="w-3.5 h-3.5 text-positive" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-positive">
            Wat je nodig hebt
          </span>
        </header>
        <p className="text-xs text-[var(--ink-2)] leading-snug">
          <strong className="font-semibold text-[var(--ink)] tabular-nums">
            {formatCurrency(Math.round(monthly))}
          </strong>{' '}
          per maand inleggen over{' '}
          <strong className="font-semibold text-[var(--ink)]">{yearsLabel}</strong>
          {goalType === 'wealth' && ` bij ${Math.round(annualReturn * 100)}% rendement`}
          {goalType === 'savings' && ` op deposito (~${(annualReturn * 100).toFixed(1)}%)`}
          {goalType === 'debt' && ' extra-aflossing'}.
        </p>
      </section>
    )
  }

  // Case 2: alleen target → toon hoe lang bij standaard €100/mnd
  const REFERENCE_MONTHLY = 100
  // Solve voor years: target = 100 × ((1+r)^n − 1) / r where n = years × 12
  let yearsAt100: number
  if (annualReturn <= 0) {
    yearsAt100 = target / (REFERENCE_MONTHLY * 12)
  } else {
    const r = annualReturn / 12
    const n = Math.log(1 + (target * r) / REFERENCE_MONTHLY) / Math.log(1 + r)
    yearsAt100 = n / 12
  }
  if (!Number.isFinite(yearsAt100) || yearsAt100 > 80) return null
  return (
    <section
      data-testid="eta-preview"
      className="mt-4 border border-horizon-100 bg-horizon-50/40 p-3"
    >
      <header className="flex items-center gap-1.5 mb-1">
        <Calculator className="w-3.5 h-3.5 text-horizon-700" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-horizon-700">
          Indicatie
        </span>
      </header>
      <p className="text-xs text-[var(--ink-2)] leading-snug">
        Bij €100/maand inleg haal je dit doel in{' '}
        <strong className="font-semibold text-[var(--ink)]">
          ~{Math.round(yearsAt100)} jaar
        </strong>
        . Voeg een datum toe voor de exacte maandbedrag-berekening.
      </p>
    </section>
  )
}
