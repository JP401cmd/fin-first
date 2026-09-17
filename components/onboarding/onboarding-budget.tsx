'use client'

import { useMemo, useState, type JSX, type ReactNode } from 'react'
import { FilePlus2 } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { StrategyTile } from './strategy-tile'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { BudgetTreeEditor } from '@/components/app/budget-plan/budget-tree-editor'
import { useBudgetDraft } from '@/components/app/budget-plan/use-budget-draft'
import { BUDGET_TEMPLATES, type BudgetTemplateId } from '@/lib/budget-templates/onboarding-presets'
import {
  buildEmptyDraft,
  buildTemplateDraft,
  computeTeVerdelen,
  ensureEigenRekening,
} from '@/lib/budget-templates/template-draft'
import { computeBudgetPlanDiff, firstOfCurrentMonth } from '@/lib/budget-plan-diff'
import { formatCurrency } from '@/lib/format'
import { parseBedragInput } from './onboarding-inkomen'

/**
 * Onboarding-stap — budget inrichten (plan "budget + bank in de onboarding", §2).
 *
 * Draait ná `save-own-data`: het inkomen staat dan al vast en er zijn nog geen
 * budgetten, dus opslaan is een diff tegen een leeg plan (`computeBudgetPlanDiff`
 * met `[]`) naar dezelfde atomaire route als de plan-editor in de app
 * (`POST /api/budgets/plan`). Geen VERVANG-typebevestiging: er valt niets te
 * vervangen.
 *
 * Twee delen:
 *  1a. Startpunt — de drie templates (Nibud voorgeselecteerd) of leeg beginnen.
 *  1b. Categorieën bijwerken — dezelfde boom-editor als de plan-editor
 *      (`BudgetTreeEditor` + `useBudgetDraft`). De draft gaat altijd door
 *      `ensureEigenRekening`: die post is verplicht voor de transfer-herkenning.
 *
 * Overslaan kan, maar met een drempel: geen knop naast de primaire actie, alleen
 * een tekstlink onderaan die eerst een bevestiging opent.
 */
export interface OnboardingBudgetProps {
  /** Netto maandinkomen uit de onboarding; 0 = onbekend (dan € 2.500). */
  netIncome: number
  /** Na een geslaagde POST /api/budgets/plan. */
  onSaved: () => void
  /** Nadat de gebruiker het overslaan heeft bevestigd. */
  onSkipped: () => void
  currentStep?: number
  totalSteps?: number
}

type Startpunt = BudgetTemplateId | 'leeg'

const FALLBACK_INCOME = 2500

export function OnboardingBudget({
  netIncome,
  onSaved,
  onSkipped,
  currentStep = 9,
  totalSteps = 9,
}: OnboardingBudgetProps): JSX.Element {
  // Aanpasbaar, net als het inkomensveld in de template-kiezer van de app: de
  // template verdeelt dit bedrag in percentages. Het profielinkomen blijft
  // ongemoeid — het bedrag landt als Salaris-post in het budget zelf.
  const [incomeText, setIncomeText] = useState(netIncome > 0 ? String(Math.round(netIncome)) : '')
  const typedIncome = parseBedragInput(incomeText)
  const income = isFinite(typedIncome) && typedIncome > 0 ? Math.round(typedIncome) : FALLBACK_INCOME
  const incomeChanged = netIncome > 0 && income !== Math.round(netIncome)
  const [phase, setPhase] = useState<'start' | 'edit'>('start')
  const [startpunt, setStartpunt] = useState<Startpunt>('nibud')
  const draftState = useBudgetDraft()
  const { draft } = draftState

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipOpen, setSkipOpen] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)

  // Dezelfde "te verdelen"-som als de plan-editor; zonder inkomenspost (leeg
  // beginnen) valt hij terug op het netto-inkomen uit de onboarding.
  const { teVerdelen } = useMemo(() => computeTeVerdelen(draft, income), [draft, income])
  const hasUnnamed = draft.some((r) => r.name.trim() === '')

  function startEditing() {
    const next = startpunt === 'leeg' ? buildEmptyDraft() : buildTemplateDraft(startpunt, income)
    draftState.reset(ensureEigenRekening(next))
    setError(null)
    setPhase('edit')
  }

  function backToStart() {
    setRestartOpen(false)
    draftState.reset([])
    setError(null)
    setPhase('start')
  }

  async function handleSave() {
    if (saving || hasUnnamed) return
    setSaving(true)
    setError(null)
    try {
      const diff = computeBudgetPlanDiff([], ensureEigenRekening(draft), [], firstOfCurrentMonth())
      const res = await fetch('/api/budgets/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diff),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setError(typeof data.error === 'string' ? data.error : 'Opslaan lukte niet. Probeer het opnieuw.')
        setSaving(false)
        return
      }
      // `saving` blijft bewust aan: het plan staat, en een tweede klik zou een
      // volledige insert opnieuw sturen terwijl de pagina naar de bankstap gaat.
      onSaved()
    } catch {
      setError('Opslaan lukte niet. Controleer je verbinding en probeer het opnieuw.')
      setSaving(false)
    }
  }

  const primaryCls =
    'w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40'

  const title: ReactNode =
    phase === 'start' ? (
      <>
        Kies hoe je je{' '}
        <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
          geld
        </em>{' '}
        verdeelt
      </>
    ) : (
      <>
        Maak het budget{' '}
        <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
          van jou
        </em>
      </>
    )

  const deck =
    phase === 'start'
      ? 'Een budget laat zien waar je vrijheidsdagen naartoe gaan. Kies een opzet als startpunt of begin leeg. De bedragen zijn daarna per categorie aan te passen.'
      : 'Hernoem, voeg toe of haal weg wat niet bij je past. Eigen rekening blijft staan: daar landen overboekingen tussen je eigen rekeningen.'

  return (
    <>
      <OnboardingShell
        kicker="Budget"
        title={title}
        deck={deck}
        factsPanel={
          <FactsPanel
            stat={formatCurrency(income)}
            sub="netto per maand om te verdelen"
            source={incomeText.trim() === '' ? 'Voorbeeldbedrag — vul je inkomen in' : incomeChanged ? 'Aangepast in deze stap' : 'Jouw invoer bij Inkomen'}
          />
        }
        currentStep={currentStep}
        totalSteps={totalSteps}
        footer={
          phase === 'start' ? (
            <button type="button" onClick={startEditing} className={primaryCls}>
              Verder
            </button>
          ) : (
            <div className="flex w-full flex-col gap-2">
              {hasUnnamed && (
                <p className="text-xs text-[var(--ink-3)]">Geef elke categorie een naam om op te slaan.</p>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || hasUnnamed}
                className={primaryCls}
              >
                {saving ? 'Opslaan…' : 'Budget opslaan'}
              </button>
            </div>
          )
        }
      >
        <div className="space-y-6">
          {error && (
            <div className="border border-negative/30 bg-negative-bg px-4 py-3" role="alert">
              <p className="text-sm font-medium text-negative">{error}</p>
            </div>
          )}

          {phase === 'start' && (
            <div>
              <label htmlFor="ob-budget-income" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Netto maandinkomen
              </label>
              <div className="relative sm:max-w-[14rem]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
                  &euro;
                </span>
                <input
                  id="ob-budget-income"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={String(FALLBACK_INCOME)}
                  value={incomeText}
                  onChange={(e) => setIncomeText(e.target.value.replace(/[^0-9.,]/g, ''))}
                  aria-describedby="ob-budget-income-hint"
                  className="w-full border border-[var(--border-md)] bg-[var(--subtle)] py-2.5 pl-7 pr-3 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500 sm:text-sm"
                />
              </div>
              <p id="ob-budget-income-hint" className="mt-1 text-xs text-[var(--ink-3)]">
                De opzet verdeelt dit bedrag in vaste percentages. Wijkt je inkomen af van wat je eerder invulde,
                pas het hier aan — dan kloppen de bedragen per categorie meteen.
              </p>
            </div>
          )}

          {phase === 'start' ? (
            <div role="group" aria-label="Kies een startpunt" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {BUDGET_TEMPLATES.map((tpl) => {
                const Icon = tpl.icon
                return (
                  <StrategyTile
                    key={tpl.id}
                    icon={<Icon className="h-4 w-4" strokeWidth={2} />}
                    label={tpl.name}
                    sublabel={`${tpl.subtitle}. ${tpl.description}`}
                    active={startpunt === tpl.id}
                    onClick={() => setStartpunt(tpl.id)}
                  />
                )
              })}
              <StrategyTile
                icon={<FilePlus2 className="h-4 w-4" strokeWidth={2} />}
                label="Leeg beginnen"
                sublabel="Alleen Eigen rekening staat klaar. Je voegt zelf de categorieën toe die bij je passen."
                active={startpunt === 'leeg'}
                onClick={() => setStartpunt('leeg')}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--border-ed)] pb-3">
                <p className="text-sm text-[var(--ink-2)]" aria-live="polite">
                  Nog te verdelen:{' '}
                  <span
                    className={`font-mono font-semibold tabular-nums ${teVerdelen >= 0 ? 'text-positive' : 'text-negative'}`}
                    data-testid="nog-te-verdelen"
                  >
                    {formatCurrency(teVerdelen)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setRestartOpen(true)}
                  className="min-h-11 text-xs text-[var(--ink-3)] underline underline-offset-4 transition-colors hover:text-[var(--ink)]"
                >
                  Ander startpunt
                </button>
              </div>

              <BudgetTreeEditor state={draftState} headingLevel="h2" deleteConfirm="overlay" />
            </>
          )}

          {/* Overslaan met drempel: bewust geen knop naast de primaire actie. */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setSkipOpen(true)}
              className="min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Ik doe dit later
            </button>
          </div>
        </div>
      </OnboardingShell>

      <ShellOverlay
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        kind="confirm"
        title="Budget later instellen?"
        footer={
          <ModalFooter
            align="end"
            primary={{ label: 'Toch een budget kiezen', onClick: () => setSkipOpen(false) }}
            secondary={{
              label: 'Later doen',
              onClick: () => {
                setSkipOpen(false)
                onSkipped()
              },
            }}
          />
        }
      >
        <div className="space-y-3 p-6 text-sm leading-relaxed text-[var(--ink-2)]">
          <p>Zonder budget ziet Fin niet waar je vrijheidsdagen naartoe gaan.</p>
          <p>Je kunt het later instellen onder Overzicht → Budget.</p>
        </div>
      </ShellOverlay>

      <ShellOverlay
        open={restartOpen}
        onClose={() => setRestartOpen(false)}
        kind="confirm"
        destructive
        title="Ander startpunt kiezen?"
        footer={
          <ModalFooter
            align="end"
            primary={{ label: 'Ander startpunt kiezen', onClick: backToStart }}
            secondary={{ label: 'Blijven bewerken', onClick: () => setRestartOpen(false) }}
          />
        }
      >
        <p className="p-6 text-sm leading-relaxed text-[var(--ink-2)]">
          Je aanpassingen aan dit budget vervallen. Je kiest daarna opnieuw een startpunt.
        </p>
      </ShellOverlay>
    </>
  )
}
