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
  groupForRender,
} from '@/lib/budget-templates/template-draft'
import { TemplatePreviewList } from '@/components/app/budget-plan/template-preview-list'
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
  // B-062: het inkomen is eerder in de onboarding al gevraagd. Is het bekend,
  // dan verdeelt het plan precies dát bedrag — geen tweede invoerveld hier, want
  // een afwijkend getal landde als Salaris-post terwijl het profielinkomen
  // ongemoeid bleef (twee inkomensgetallen, stille driftbron). Alleen bij een
  // onbekend inkomen (inkomenstap overgeslagen of uitgesteld) vraagt de stap
  // het alsnog; leeg = het voorbeeldbedrag (ADR 0131: zichtbaar gemarkeerd).
  const incomeKnown = netIncome > 0
  const [incomeText, setIncomeText] = useState('')
  const typedIncome = parseBedragInput(incomeText)
  const income = incomeKnown
    ? Math.round(netIncome)
    : isFinite(typedIncome) && typedIncome > 0
      ? Math.round(typedIncome)
      : FALLBACK_INCOME
  const [phase, setPhase] = useState<'start' | 'edit'>('start')
  const [startpunt, setStartpunt] = useState<Startpunt>('nibud')
  // B-064: welk plan staat open in de i-preview (null = dicht).
  const [previewId, setPreviewId] = useState<BudgetTemplateId | null>(null)
  const previewTemplate = previewId ? BUDGET_TEMPLATES.find((t) => t.id === previewId) ?? null : null
  // Canoniek: dezelfde draft-bouwer als "Verder" (startEditing), met hetzelfde
  // inkomen — de preview toont dus exact wat je in fase 2 krijgt.
  const previewGrouped = useMemo(
    () => (previewId ? groupForRender(buildTemplateDraft(previewId, income)) : null),
    [previewId, income],
  )
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

  // B-063: fase 1 heet "Kies je budgetplan" — eigenaarsbesluit 27 sep 2026,
  // dat bewust de keuze van 19 sep ("Stel je budgetten in", W-011/W-012)
  // vervangt. "Budgetplan" is de term die de app zelf voor het resultaat van
  // deze stap gebruikt (plan-editor, `/api/budgets/plan`); de deck legt in één
  // zin uit wat dat is.
  const title: ReactNode =
    phase === 'start' ? (
      <>
        Kies je{' '}
        <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
          budgetplan
        </em>
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
      // B-063: één uitlegzin wat een budgetplan is, plus waarom Nibud-standaard
      // klaarstaat — beschrijvend, geen advies (Wft).
      ? 'Een budgetplan verdeelt je netto-inkomen per maand over potjes, zoals wonen, boodschappen en sparen — zo zie je waar je vrijheidsdagen naartoe gaan. Kies een startpunt of begin leeg; Nibud-standaard staat klaar als gangbare, herkenbare indeling. Met de i zie je vooraf wat er in een plan zit, en elk bedrag pas je daarna zelf aan.'
      // W-013: fase 2 vertelde niet waar de bedragen vandaan kwamen. Nu wél — met
      // twee woorden die er bewust in staan. "VASTE VERDELING", want de
      // percentages zijn een generieke sleutel van de app, niet iets dat op
      // jouw uitgaven is afgestemd; "op basis van je inkomen" alleen zou
      // maatwerk suggereren. En "EEN STARTPUNT, GEEN MAAT VOOR JOU", zodat de
      // getallen niet als norm gelezen worden (beschrijvend, geen advies).
      // Geen templatenaam en geen verwijzing naar Nibud: dat zou de sleutel
      // laten klinken als de Nibud-referentiecijfers, en dat is een ander
      // systeem (`nibud_reference_data`).
      //
      // ÉÉN deck voor beide startpunten (eigenaarskeuze 19 sep 2026, bewust geen
      // vertakking). Onder "Leeg beginnen" staat er niets ingevuld, dus de
      // inkomenszin staat in een voorwaardelijke vorm — "Koos je een opzet, dan
      // …" — en blijft daarmee op beide paden waar. Het bedrag zelf herhalen we
      // niet: dat staat in beide fasen al in het feitenpaneel hiernaast, inclusief
      // de herkomst ("Jouw invoer bij Inkomen" / "Ingevuld in deze stap").
      : 'Koos je een opzet, dan zijn de bedragen al ingevuld als vaste verdeling van je netto-inkomen — een startpunt, geen maat voor jou. Hernoem, voeg toe of haal weg wat niet bij je past en zet er je eigen bedragen op; Eigen rekening blijft staan, daar landen overboekingen tussen je eigen rekeningen. Bijstellen kan later altijd onder Overzicht → Budget.'

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
            source={
              incomeKnown
                ? 'Jouw invoer bij Inkomen'
                : incomeText.trim() === ''
                  ? 'Voorbeeldbedrag — vul je inkomen in'
                  : 'Ingevuld in deze stap'
            }
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

          {phase === 'start' && incomeKnown && (
            <p className="text-sm leading-relaxed text-[var(--ink-2)]" data-testid="ob-budget-income-readonly">
              Het plan verdeelt je netto maandinkomen van{' '}
              <span className="font-mono tabular-nums text-[var(--ink)]">{formatCurrency(income)}</span>, zoals je
              het invulde bij Inkomen. Klopt dat niet meer? Na de onboarding pas je het aan onder Mijn → Profiel.
            </p>
          )}

          {phase === 'start' && !incomeKnown && (
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
                Je inkomen is nog niet bekend. Het plan verdeelt dit bedrag in vaste percentages; laat je het
                leeg, dan rekent het met een voorbeeldbedrag van {formatCurrency(FALLBACK_INCOME)}.
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
                    hint={`Past bij jou als ${tpl.pastBij}.`}
                    active={startpunt === tpl.id}
                    onClick={() => setStartpunt(tpl.id)}
                    onInfo={() => setPreviewId(tpl.id)}
                    infoLabel={`Wat zit er in ${tpl.name}?`}
                  />
                )
              })}
              <StrategyTile
                icon={<FilePlus2 className="h-4 w-4" strokeWidth={2} />}
                label="Leeg beginnen"
                sublabel="Alleen Eigen rekening staat klaar. Je voegt zelf de categorieën toe die bij je passen."
                hint="Past bij jou als je al weet welke potjes je wilt."
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

      {/* B-064: wat zit er in dit plan — vóór je kiest. De bedragen komen uit
          dezelfde draft-bouwer als "Verder"; "Kies dit plan" zet alleen het
          startpunt (je blijft in fase 1, zodat je nog kunt vergelijken). */}
      <ShellOverlay
        open={previewTemplate !== null}
        onClose={() => setPreviewId(null)}
        kind="sheet"
        title={previewTemplate ? `Wat zit er in ${previewTemplate.name}?` : ''}
        footer={
          <ModalFooter
            align="end"
            primary={{
              label: 'Kies dit plan',
              onClick: () => {
                if (previewId) setStartpunt(previewId)
                setPreviewId(null)
              },
            }}
            secondary={{ label: 'Sluiten', onClick: () => setPreviewId(null) }}
          />
        }
      >
        {previewTemplate && previewGrouped && (
          <div className="space-y-4 p-6">
            <p className="text-sm leading-relaxed text-[var(--ink-2)]">
              {previewTemplate.description} Zo verdeelt dit plan {formatCurrency(income)} netto per maand, als vaste
              verdeling — een startpunt, geen maat voor jou. Een hoofdbudget is de optelling van de potjes eronder.
            </p>
            <TemplatePreviewList grouped={previewGrouped} />
            <p className="text-xs leading-relaxed text-[var(--ink-3)]">
              Daarnaast staat in elk plan Eigen rekening klaar: daar landen overboekingen tussen je eigen rekeningen.
            </p>
          </div>
        )}
      </ShellOverlay>

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
