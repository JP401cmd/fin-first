'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { formatCurrency } from '@/components/app/budget-shared'
import { useToast } from '@/components/app/toast-provider'
import { quickAdd } from '@/app/actions/quick-add'
import {
  ASSET_QUICK_ADD_LABELS,
  ASSET_TYPE_COLORS,
  ASSET_TYPE_ICONS,
  LINKED_DEBT_SUGGESTIONS,
  type AssetType,
} from '@/lib/asset-data'
import {
  DEBT_QUICK_ADD_LABELS,
  DEBT_TYPE_COLORS,
  DEBT_TYPE_ICONS,
  type DebtType,
} from '@/lib/debt-data'
import type {
  AssetQuickInput,
  DebtQuickInput,
  QuickAddInput,
  QuickAddIntent,
} from '@/lib/quick-add/types'
import {
  initialWizardState,
  wizardReducer,
  type AssetDraftState,
  type DebtDraftState,
  type WizardState,
} from './wizard-reducer'
import { TypeIcon } from './icon-map'
import { StepHeader } from './step-header'
import { StepChoice } from './steps/step-choice'
import { StepType } from './steps/step-type'
import { StepDetails } from './steps/step-details'
import { StepLinkDebt } from './steps/step-link-debt'

/**
 * QuickAddWizard — 4-staps flow in een BottomSheet.
 *
 * State-machine zit in `wizardReducer`; deze component is de host die
 * stappen rendert, de server action aanroept en toast/router-side-effects
 * verzorgt. De wizard ondersteunt drie paden:
 *   · asset-only (stap 1 → 2 → 3 → success)
 *   · debt-only (stap 1 → 2 → 3 → success)
 *   · asset + gekoppelde schuld (stap 1 → 2 → 3 → 4 prompt → 4 form → success)
 *
 * Bij `initialIntent` wordt stap 1 overgeslagen — dit pad wordt gebruikt
 * door `QuickAddTrigger` op `/core` en de empty-state op de detail-pagina's.
 *
 * Het asset-with-debt-pad wordt in twee fasen opgeslagen: eerst de asset
 * (zodat `linked_asset_id` beschikbaar is), daarna — bij "Ja, schuld
 * toevoegen" — de debt. Als de gebruiker "Nee" kiest, blijft alleen de
 * asset bestaan. De Server Action lost dit idempotent op.
 */

export interface QuickAddWizardProps {
  open: boolean
  onClose: () => void
  initialIntent?: QuickAddIntent
  onSaved?: (result: { assetId?: string; debtId?: string }) => void
}

/**
 * Parallel-state voor de koppel-schuld-flow. De wizard-reducer modelleert
 * `linkDebt` wel, maar we kunnen die transitie pas betrouwbaar uitvoeren
 * nadat de server de asset heeft opgeslagen (en dus `savedAssetId` heeft
 * teruggegeven). Dit object draagt de context tussen stap 4a (prompt) en
 * stap 4b (debt-form).
 */
type LinkDebtContext =
  | null
  | {
      phase: 'prompt'
      asset: AssetQuickInput
      savedAssetId: string
    }
  | {
      phase: 'form'
      asset: AssetQuickInput
      savedAssetId: string
      debtDraft: DebtDraftState
    }

export function QuickAddWizard({
  open,
  onClose,
  initialIntent,
  onSaved,
}: QuickAddWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState)
  const [isSaving, setIsSaving] = useState(false)
  const [linkDebtCtx, setLinkDebtCtx] = useState<LinkDebtContext>(null)
  const { addToast } = useToast()
  const router = useRouter()

  // Open/reset — sync met de `open`-prop uit de parent. Bij heropening
  // starten we schoon (OPEN action met optionele initialIntent).
  useEffect(() => {
    if (open) {
      dispatch({ type: 'OPEN', initialIntent })
      setLinkDebtCtx(null)
      setIsSaving(false)
    } else {
      dispatch({ type: 'RESET' })
      setLinkDebtCtx(null)
      setIsSaving(false)
    }
  }, [open, initialIntent])

  const totalSteps = initialIntent ? 3 : 4

  // ── Submit: asset-only of debt-only ────────────────────────────

  const submitQuickAdd = useCallback(
    async (input: QuickAddInput) => {
      setIsSaving(true)
      dispatch({ type: 'SAVING' })

      try {
        const result = await quickAdd(input)

        if (result.ok) {
          const name = input.kind === 'debt' ? input.debt.name : input.asset.name

          dispatch({
            type: 'SUCCESS',
            payload: {
              step: 'success',
              kind: input.kind,
              assetName: input.kind !== 'debt' ? input.asset.name : undefined,
              debtName:
                input.kind === 'asset_with_debt' ? input.debt.name : undefined,
              netAmount:
                input.kind === 'asset_with_debt'
                  ? input.asset.current_value - input.debt.current_balance
                  : undefined,
            },
          })

          addToast({ type: 'success', title: `${name} toegevoegd.`, duration: 3000 })
          router.refresh()
          onSaved?.({ assetId: result.assetId, debtId: result.debtId })
        } else if (
          result.code === 'DEBT_FAILED' &&
          result.partial?.assetId &&
          input.kind === 'asset_with_debt'
        ) {
          addToast({
            type: 'warning',
            title: 'Bezitting opgeslagen, schuld mislukt.',
            message: result.message,
            duration: 6000,
          })
          dispatch({
            type: 'SUCCESS',
            payload: {
              step: 'success',
              kind: 'asset',
              assetName: input.asset.name,
            },
          })
          router.refresh()
          onSaved?.({ assetId: result.partial.assetId })
        } else {
          dispatch({ type: 'ERROR', message: result.message })
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Opslaan mislukt — probeer opnieuw.'
        dispatch({ type: 'ERROR', message })
      } finally {
        setIsSaving(false)
      }
    },
    [addToast, onSaved, router],
  )

  // ── Asset-details → linkDebt prompt OR submit ──────────────────

  const proceedFromAssetDetails = useCallback(
    async (draft: AssetDraftState) => {
      if (typeof draft.current_value !== 'number' || !draft.name) return

      const complete: AssetQuickInput = {
        asset_type: draft.asset_type,
        name: draft.name.trim(),
        current_value: draft.current_value,
        field3: draft.field3 ?? null,
      }

      const suggestsDebt = LINKED_DEBT_SUGGESTIONS[draft.asset_type]
      if (!suggestsDebt) {
        await submitQuickAdd({ kind: 'asset', asset: complete })
        return
      }

      // Asset vooraf opslaan zodat we in de debt-stap een `linked_asset_id`
      // hebben. Bij een fail vallen we terug op het error-scherm.
      setIsSaving(true)
      dispatch({ type: 'SAVING' })
      try {
        const result = await quickAdd({ kind: 'asset', asset: complete })
        if (result.ok && result.assetId) {
          addToast({
            type: 'success',
            title: `${complete.name} toegevoegd.`,
            duration: 3000,
          })
          router.refresh()
          onSaved?.({ assetId: result.assetId })
          setLinkDebtCtx({
            phase: 'prompt',
            asset: complete,
            savedAssetId: result.assetId,
          })
        } else {
          const message = result.ok ? 'Opslaan mislukt' : result.message
          dispatch({ type: 'ERROR', message })
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Opslaan mislukt — probeer opnieuw.'
        dispatch({ type: 'ERROR', message })
      } finally {
        setIsSaving(false)
      }
    },
    [addToast, onSaved, router, submitQuickAdd],
  )

  // ── Debt-details (stand-alone of gekoppeld) ────────────────────

  const proceedFromDebtDetails = useCallback(
    (draft: DebtDraftState, linkedAssetId?: string) => {
      if (typeof draft.current_balance !== 'number' || !draft.name) return
      const complete: DebtQuickInput = {
        debt_type: draft.debt_type,
        name: draft.name.trim(),
        current_balance: draft.current_balance,
        field3: draft.field3 ?? null,
        linked_asset_id: linkedAssetId ?? draft.linked_asset_id ?? null,
      }
      void submitQuickAdd({ kind: 'debt', debt: complete })
    },
    [submitQuickAdd],
  )

  // ── LinkDebt: ja/nee ───────────────────────────────────────────

  const handleLinkDebtYes = useCallback(() => {
    if (!linkDebtCtx || linkDebtCtx.phase !== 'prompt') return
    const suggested = LINKED_DEBT_SUGGESTIONS[linkDebtCtx.asset.asset_type]
    if (!suggested) return
    setLinkDebtCtx({
      phase: 'form',
      asset: linkDebtCtx.asset,
      savedAssetId: linkDebtCtx.savedAssetId,
      debtDraft: {
        debt_type: suggested,
        name: deriveCoupledDebtName(linkDebtCtx.asset.asset_type, linkDebtCtx.asset.name),
      },
    })
  }, [linkDebtCtx])

  const handleLinkDebtNo = useCallback(() => {
    if (!linkDebtCtx) return
    dispatch({
      type: 'SUCCESS',
      payload: {
        step: 'success',
        kind: 'asset',
        assetName: linkDebtCtx.asset.name,
      },
    })
    setLinkDebtCtx(null)
  }, [linkDebtCtx])

  const handleLinkDebtFormUpdate = useCallback((patch: Partial<DebtQuickInput>) => {
    setLinkDebtCtx((prev) =>
      prev && prev.phase === 'form'
        ? { ...prev, debtDraft: { ...prev.debtDraft, ...patch } }
        : prev,
    )
  }, [])

  const handleLinkDebtFormSubmit = useCallback(() => {
    if (!linkDebtCtx || linkDebtCtx.phase !== 'form') return
    proceedFromDebtDetails(linkDebtCtx.debtDraft, linkDebtCtx.savedAssetId)
    setLinkDebtCtx(null)
  }, [linkDebtCtx, proceedFromDebtDetails])

  // ── Close / navigation ─────────────────────────────────────────

  const handleClose = useCallback(() => {
    setLinkDebtCtx(null)
    onClose()
  }, [onClose])

  const handleBack = useCallback(() => {
    if (linkDebtCtx?.phase === 'form') {
      // Terug naar de prompt.
      setLinkDebtCtx({
        phase: 'prompt',
        asset: linkDebtCtx.asset,
        savedAssetId: linkDebtCtx.savedAssetId,
      })
      return
    }
    if (linkDebtCtx?.phase === 'prompt') {
      // Asset is al opgeslagen — teruggaan naar details zou verwarrend zijn;
      // we sluiten de koppel-flow en tonen het success-scherm voor de asset.
      dispatch({
        type: 'SUCCESS',
        payload: {
          step: 'success',
          kind: 'asset',
          assetName: linkDebtCtx.asset.name,
        },
      })
      setLinkDebtCtx(null)
      return
    }
    dispatch({ type: 'BACK' })
  }, [linkDebtCtx])

  const handleAddAnother = useCallback(() => {
    setLinkDebtCtx(null)
    dispatch({ type: 'ADD_ANOTHER' })
  }, [])

  // ── Dispatch wrappers ──────────────────────────────────────────

  const selectIntent = useCallback(
    (intent: QuickAddIntent) => dispatch({ type: 'SELECT_INTENT', intent }),
    [],
  )

  const selectType = useCallback(
    (type: AssetType | DebtType) => {
      if (state.step !== 'type') return
      if (state.intent === 'asset') {
        dispatch({ type: 'SELECT_TYPE_ASSET', assetType: type as AssetType })
      } else {
        dispatch({ type: 'SELECT_TYPE_DEBT', debtType: type as DebtType })
      }
    },
    [state],
  )

  const updateAsset = useCallback(
    (patch: Partial<AssetQuickInput>) => dispatch({ type: 'UPDATE_ASSET', patch }),
    [],
  )

  const updateDebt = useCallback(
    (patch: Partial<DebtQuickInput>) => dispatch({ type: 'UPDATE_DEBT', patch }),
    [],
  )

  // ── Render ─────────────────────────────────────────────────────

  const sheetTitle = deriveSheetTitle(state, linkDebtCtx, initialIntent)
  const sheetHeight = deriveSheetHeight(state, linkDebtCtx)

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={sheetTitle}
      size="md"
      initialMobileHeight={sheetHeight}
    >
      <div className="p-5 sm:p-6">
        <WizardContent
          state={state}
          linkDebtCtx={linkDebtCtx}
          totalSteps={totalSteps}
          initialIntent={initialIntent}
          isSaving={isSaving}
          onBack={handleBack}
          onSelectIntent={selectIntent}
          onSelectType={selectType}
          onUpdateAsset={updateAsset}
          onUpdateDebt={updateDebt}
          onProceedAssetDetails={() => {
            if (state.step === 'details' && state.intent === 'asset') {
              void proceedFromAssetDetails(state.assetDraft)
            }
          }}
          onProceedDebtDetails={() => {
            if (state.step === 'details' && state.intent === 'debt') {
              proceedFromDebtDetails(state.debtDraft)
            }
          }}
          onLinkDebtYes={handleLinkDebtYes}
          onLinkDebtNo={handleLinkDebtNo}
          onLinkDebtFormUpdate={handleLinkDebtFormUpdate}
          onLinkDebtFormSubmit={handleLinkDebtFormSubmit}
          onAddAnother={handleAddAnother}
          onClose={handleClose}
        />
      </div>
    </BottomSheet>
  )
}

// ── Render sub-component ───────────────────────────────────────────

interface WizardContentProps {
  state: WizardState
  linkDebtCtx: LinkDebtContext
  totalSteps: number
  initialIntent?: QuickAddIntent
  isSaving: boolean
  onBack: () => void
  onSelectIntent: (intent: QuickAddIntent) => void
  onSelectType: (type: AssetType | DebtType) => void
  onUpdateAsset: (patch: Partial<AssetQuickInput>) => void
  onUpdateDebt: (patch: Partial<DebtQuickInput>) => void
  onProceedAssetDetails: () => void
  onProceedDebtDetails: () => void
  onLinkDebtYes: () => void
  onLinkDebtNo: () => void
  onLinkDebtFormUpdate: (patch: Partial<DebtQuickInput>) => void
  onLinkDebtFormSubmit: () => void
  onAddAnother: () => void
  onClose: () => void
}

function WizardContent(props: WizardContentProps) {
  const {
    state,
    linkDebtCtx,
    totalSteps,
    initialIntent,
    isSaving,
    onBack,
    onSelectIntent,
    onSelectType,
    onUpdateAsset,
    onUpdateDebt,
    onProceedAssetDetails,
    onProceedDebtDetails,
    onLinkDebtYes,
    onLinkDebtNo,
    onLinkDebtFormUpdate,
    onLinkDebtFormSubmit,
    onAddAnother,
    onClose,
  } = props

  // Stap 4b — koppel-schuld form. Heeft voorrang boven reducer-state.
  if (linkDebtCtx?.phase === 'form') {
    const iconName = DEBT_TYPE_ICONS[linkDebtCtx.debtDraft.debt_type]
    const color = DEBT_TYPE_COLORS[linkDebtCtx.debtDraft.debt_type]
    return (
      <>
        <StepHeader
          step={initialIntent ? 3 : 4}
          total={totalSteps}
          title={DEBT_QUICK_ADD_LABELS[linkDebtCtx.debtDraft.debt_type]}
          kicker={`Voor ${linkDebtCtx.asset.name}`}
          onBack={onBack}
          icon={<TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />}
          iconColor={color}
        />
        <StepDetails
          intent="debt"
          draft={linkDebtCtx.debtDraft}
          onChange={onLinkDebtFormUpdate}
          onSubmit={onLinkDebtFormSubmit}
          isSaving={isSaving}
          submitLabel="Koppelen"
        />
      </>
    )
  }

  // Stap 4a — koppel-schuld prompt.
  if (linkDebtCtx?.phase === 'prompt') {
    return (
      <>
        <StepHeader
          step={initialIntent ? 3 : 4}
          total={totalSteps}
          title="Gekoppelde schuld"
          kicker="Extra"
          onBack={onBack}
        />
        <StepLinkDebt
          assetType={linkDebtCtx.asset.asset_type}
          assetName={linkDebtCtx.asset.name}
          onYes={onLinkDebtYes}
          onNo={onLinkDebtNo}
        />
      </>
    )
  }

  switch (state.step) {
    case 'choice':
      return (
        <>
          <StepHeader
            step={1}
            total={totalSteps}
            title="Wat wil je toevoegen?"
            kicker="Nieuw item"
          />
          <StepChoice onSelect={onSelectIntent} />
        </>
      )

    case 'type': {
      const title = state.intent === 'asset' ? 'Welke bezitting?' : 'Welke schuld?'
      const stepNumber = initialIntent ? 1 : 2
      return (
        <>
          <StepHeader
            step={stepNumber}
            total={totalSteps}
            title={title}
            kicker={state.intent === 'asset' ? 'Bezitting' : 'Schuld'}
            onBack={initialIntent ? undefined : onBack}
          />
          <StepType intent={state.intent} onSelect={onSelectType} />
        </>
      )
    }

    case 'details': {
      const stepNumber = initialIntent ? 2 : 3
      if (state.intent === 'asset') {
        const iconName = ASSET_TYPE_ICONS[state.assetDraft.asset_type]
        const color = ASSET_TYPE_COLORS[state.assetDraft.asset_type]
        const label = ASSET_QUICK_ADD_LABELS[state.assetDraft.asset_type]
        return (
          <>
            <StepHeader
              step={stepNumber}
              total={totalSteps}
              title={label}
              kicker="Gegevens"
              onBack={onBack}
              icon={<TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />}
              iconColor={color}
            />
            <StepDetails
              intent="asset"
              draft={state.assetDraft}
              onChange={onUpdateAsset}
              onSubmit={onProceedAssetDetails}
              isSaving={isSaving}
            />
          </>
        )
      }
      const iconName = DEBT_TYPE_ICONS[state.debtDraft.debt_type]
      const color = DEBT_TYPE_COLORS[state.debtDraft.debt_type]
      const label = DEBT_QUICK_ADD_LABELS[state.debtDraft.debt_type]
      return (
        <>
          <StepHeader
            step={stepNumber}
            total={totalSteps}
            title={label}
            kicker="Gegevens"
            onBack={onBack}
            icon={<TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />}
            iconColor={color}
          />
          <StepDetails
            intent="debt"
            draft={state.debtDraft}
            onChange={onUpdateDebt}
            onSubmit={onProceedDebtDetails}
            isSaving={isSaving}
          />
        </>
      )
    }

    case 'linkDebt':
    case 'linkDebtForm':
      // Worden hierboven al afgevangen via `linkDebtCtx`.
      return null

    case 'saving':
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Loader2
            className="h-6 w-6 animate-spin text-[var(--ink-3)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--ink-3)]">Opslaan…</p>
        </div>
      )

    case 'success':
      return (
        <SuccessView
          kind={state.kind}
          assetName={state.assetName}
          debtName={state.debtName}
          netAmount={state.netAmount}
          onAddAnother={onAddAnother}
          onClose={onClose}
        />
      )

    case 'error':
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
          <AlertCircle
            className="h-8 w-8 text-[var(--color-debt-600)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-serif text-lg italic text-[var(--ink)]">
              Opslaan mislukt
            </p>
            <p className="max-w-[32ch] text-sm text-[var(--ink-3)] leading-relaxed">
              {state.message}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center justify-center bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-80"
            >
              Probeer opnieuw
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center justify-center px-4 py-2 text-sm text-[var(--ink-3)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
            >
              Sluiten
            </button>
          </div>
        </div>
      )

    default:
      return null
  }
}

// ── Success-scherm ────────────────────────────────────────────────

interface SuccessViewProps {
  kind: 'asset' | 'debt' | 'asset_with_debt'
  assetName?: string
  debtName?: string
  netAmount?: number
  onAddAnother: () => void
  onClose: () => void
}

function SuccessView({
  kind,
  assetName,
  debtName,
  netAmount,
  onAddAnother,
  onClose,
}: SuccessViewProps) {
  const headline =
    kind === 'asset_with_debt'
      ? `${assetName ?? 'Bezitting'} en ${debtName ?? 'schuld'} gekoppeld`
      : kind === 'debt'
        ? `${debtName ?? 'Schuld'} toegevoegd`
        : `${assetName ?? 'Bezitting'} toegevoegd`

  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <div
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center text-[var(--positive)]"
        style={{ backgroundColor: 'color-mix(in oklch, var(--positive) 12%, var(--paper))' }}
      >
        <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
      </div>

      <div className="space-y-1">
        <h4
          tabIndex={-1}
          className="font-serif text-xl italic text-[var(--ink)] leading-tight"
        >
          {headline}
        </h4>
        {kind === 'asset_with_debt' && typeof netAmount === 'number' && (
          <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
            Netto:{' '}
            <span className="text-[var(--ink)]">{formatCurrency(netAmount)}</span>
          </p>
        )}
      </div>

      <div className="flex w-full flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onAddAnother}
          className="inline-flex min-h-[44px] items-center justify-center bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-80"
        >
          Nog een toevoegen
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center justify-center border border-[var(--border-ed)] px-4 py-2.5 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          Terug naar overzicht
        </button>
      </div>
    </div>
  )
}

// ── Derived helpers ───────────────────────────────────────────────

function deriveSheetTitle(
  state: WizardState,
  linkDebtCtx: LinkDebtContext,
  initial: QuickAddIntent | undefined,
): string {
  if (linkDebtCtx) return 'Gekoppelde schuld'
  if (state.step === 'saving') return 'Opslaan'
  if (state.step === 'success') return 'Toegevoegd'
  if (state.step === 'error') return 'Er ging iets mis'

  if (initial === 'asset') return 'Bezitting toevoegen'
  if (initial === 'debt') return 'Schuld toevoegen'

  if (state.step === 'type') {
    return state.intent === 'asset' ? 'Bezitting toevoegen' : 'Schuld toevoegen'
  }
  if (state.step === 'details') {
    return state.intent === 'asset' ? 'Bezitting toevoegen' : 'Schuld toevoegen'
  }
  return 'Snel toevoegen'
}

function deriveSheetHeight(state: WizardState, linkDebtCtx: LinkDebtContext): string {
  if (linkDebtCtx?.phase === 'form') return '70vh'
  if (state.step === 'type' || state.step === 'details') return '70vh'
  return 'auto'
}

function deriveCoupledDebtName(assetType: AssetType, assetName: string): string {
  switch (assetType) {
    case 'eigen_huis':
    case 'real_estate':
      return `Hypotheek — ${assetName}`
    case 'vehicle':
      return `Autolening — ${assetName}`
    case 'deelneming':
      return `RC-schuld — ${assetName}`
    default:
      return `Schuld — ${assetName}`
  }
}
