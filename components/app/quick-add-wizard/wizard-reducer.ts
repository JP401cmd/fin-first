/**
 * Quick-add wizard — state machine (`useReducer`).
 *
 * Discriminated-union `WizardState` garandeert dat invalid combinaties
 * (bv. `linkDebt` zonder opgeslagen asset) onmogelijk zijn op type-niveau.
 * De reducer is pure: geen side effects, geen async, volledig unit-testbaar.
 *
 * Navigatie-schema (zie `ok-we-gaan-een-precious-naur.md`):
 *
 *     choice → type → details
 *                         ├─ asset-pad: heeft LINKED_DEBT_SUGGESTIONS[t]?
 *                         │     ja  → linkDebt → { linkDebtForm | SUBMIT }
 *                         │     nee → SUBMIT
 *                         └─ debt-pad: SUBMIT
 *
 * `OPEN` met initialIntent skipt stap 1 zodat de CTA-strip op `/core` direct
 * naar de type-grid van het juiste intent springt.
 */

import { LINKED_DEBT_SUGGESTIONS, type AssetType } from '@/lib/asset-data'
import type { DebtType } from '@/lib/debt-data'
import type {
  AssetQuickInput,
  DebtQuickInput,
  QuickAddIntent,
} from '@/lib/quick-add/types'

// ── State ──────────────────────────────────────────────────────────

/** Asset-draft tijdens invoer — alleen `asset_type` is gegarandeerd. */
export type AssetDraftState = Partial<AssetQuickInput> & { asset_type: AssetType }

/** Debt-draft tijdens invoer — alleen `debt_type` is gegarandeerd. */
export type DebtDraftState = Partial<DebtQuickInput> & { debt_type: DebtType }

/**
 * Wizard-state als discriminated union. De invariant "je kunt geen
 * linkDebt-stap bereiken zonder volledige asset-input" wordt hier op
 * type-niveau afgedwongen via `Required<AssetQuickInput>`.
 */
export type WizardState =
  | { step: 'choice' }
  | { step: 'type'; intent: QuickAddIntent }
  | { step: 'details'; intent: 'asset'; assetDraft: AssetDraftState }
  | {
      step: 'details'
      intent: 'debt'
      debtDraft: DebtDraftState
      linkedAssetId?: string
    }
  | {
      step: 'linkDebt'
      assetDraft: Required<AssetQuickInput>
      savedAssetId?: string
    }
  | {
      step: 'linkDebtForm'
      assetDraft: Required<AssetQuickInput>
      savedAssetId: string
      debtDraft: DebtDraftState
    }
  | { step: 'saving' }
  | {
      step: 'success'
      kind: 'asset' | 'debt' | 'asset_with_debt'
      assetName?: string
      debtName?: string
      netAmount?: number
    }
  | { step: 'error'; message: string; prev: WizardState }

// ── Actions ────────────────────────────────────────────────────────

export type WizardAction =
  | {
      type: 'OPEN'
      initialIntent?: QuickAddIntent
      /**
       * Optionele type-prefill. Alleen toegepast wanneer hij past bij
       * `initialIntent` (asset-type ↔ asset, debt-type ↔ debt). Skipt
       * stap 2 zodat de wizard direct op het details-formulier opent —
       * gebruikt door categorie-pagina's waar de categorie al vaststaat.
       */
      initialAssetType?: AssetType
      initialDebtType?: DebtType
    }
  | { type: 'SELECT_INTENT'; intent: QuickAddIntent }
  | { type: 'SELECT_TYPE_ASSET'; assetType: AssetType }
  | { type: 'SELECT_TYPE_DEBT'; debtType: DebtType }
  | { type: 'UPDATE_ASSET'; patch: Partial<AssetQuickInput> }
  | { type: 'UPDATE_DEBT'; patch: Partial<DebtQuickInput> }
  | { type: 'PROCEED_FROM_ASSET_DETAILS' }
  | { type: 'PROCEED_FROM_DEBT_DETAILS' }
  | { type: 'LINK_DEBT_YES' }
  | { type: 'LINK_DEBT_NO' }
  | { type: 'SAVING' }
  | { type: 'SUCCESS'; payload: Extract<WizardState, { step: 'success' }> }
  | { type: 'ERROR'; message: string }
  | { type: 'BACK' }
  | { type: 'RESET' }
  | { type: 'ADD_ANOTHER' }

export const initialWizardState: WizardState = { step: 'choice' }

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Smalle type-guard: heeft de draft genoeg data om als volledige
 * `AssetQuickInput` te tellen? Gebruikt bij `PROCEED_FROM_ASSET_DETAILS`
 * om de overgang naar stap 4 te valideren zonder Zod dubbel te draaien
 * (Zod loopt in de server action — deze check is alleen pre-flight).
 */
function isCompleteAssetDraft(
  draft: AssetDraftState,
): draft is Required<AssetQuickInput> {
  return (
    typeof draft.asset_type === 'string' &&
    typeof draft.name === 'string' &&
    draft.name.trim().length > 0 &&
    typeof draft.current_value === 'number' &&
    Number.isFinite(draft.current_value)
  )
}

// ── Reducer ────────────────────────────────────────────────────────

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'OPEN': {
      // Met initialIntent skippen we de choice-stap; zonder intent starten
      // we altijd vanaf een verse choice-state zodat resterende inline-state
      // van een vorige sessie wordt weggegooid.
      if (action.initialIntent) {
        // Type-prefill skipt óók stap 2 — alleen wanneer het type past bij
        // het intent. Mismatch (bv. assetType bij debt-intent) negeren we
        // i.p.v. te crashen, zodat foute call-sites soft-failen op de
        // type-grid en de gebruiker alsnog kan kiezen.
        if (action.initialIntent === 'asset' && action.initialAssetType) {
          return {
            step: 'details',
            intent: 'asset',
            assetDraft: { asset_type: action.initialAssetType },
          }
        }
        if (action.initialIntent === 'debt' && action.initialDebtType) {
          return {
            step: 'details',
            intent: 'debt',
            debtDraft: { debt_type: action.initialDebtType },
          }
        }
        return { step: 'type', intent: action.initialIntent }
      }
      return initialWizardState
    }

    case 'SELECT_INTENT': {
      if (state.step !== 'choice') return state
      return { step: 'type', intent: action.intent }
    }

    case 'SELECT_TYPE_ASSET': {
      if (state.step !== 'type' || state.intent !== 'asset') return state
      return {
        step: 'details',
        intent: 'asset',
        assetDraft: { asset_type: action.assetType },
      }
    }

    case 'SELECT_TYPE_DEBT': {
      if (state.step !== 'type' || state.intent !== 'debt') return state
      return {
        step: 'details',
        intent: 'debt',
        debtDraft: { debt_type: action.debtType },
      }
    }

    case 'UPDATE_ASSET': {
      if (state.step === 'details' && state.intent === 'asset') {
        return {
          ...state,
          assetDraft: { ...state.assetDraft, ...action.patch },
        }
      }
      return state
    }

    case 'UPDATE_DEBT': {
      if (state.step === 'details' && state.intent === 'debt') {
        return {
          ...state,
          debtDraft: { ...state.debtDraft, ...action.patch },
        }
      }
      if (state.step === 'linkDebtForm') {
        return {
          ...state,
          debtDraft: { ...state.debtDraft, ...action.patch },
        }
      }
      return state
    }

    case 'PROCEED_FROM_ASSET_DETAILS': {
      if (state.step !== 'details' || state.intent !== 'asset') return state
      if (!isCompleteAssetDraft(state.assetDraft)) return state

      // Alleen bepaalde asset-types hebben een logische gekoppelde schuld;
      // de rest skipt stap 4 en gaat direct naar saving (caller triggert SUBMIT).
      const suggestsDebt = LINKED_DEBT_SUGGESTIONS[state.assetDraft.asset_type]
      if (suggestsDebt) {
        return { step: 'linkDebt', assetDraft: state.assetDraft }
      }
      return { step: 'saving' }
    }

    case 'PROCEED_FROM_DEBT_DETAILS': {
      if (state.step !== 'details' || state.intent !== 'debt') return state
      return { step: 'saving' }
    }

    case 'LINK_DEBT_YES': {
      if (state.step !== 'linkDebt') return state
      // `savedAssetId` komt uit de container die de asset al heeft opgeslagen
      // vóór hij in de linkDebt-state kwam. Als dat ontbreekt, blijft de
      // wizard in `linkDebt` staan en kan de caller een error tonen.
      if (!state.savedAssetId) return state

      const suggestedDebtType =
        LINKED_DEBT_SUGGESTIONS[state.assetDraft.asset_type]
      if (!suggestedDebtType) return state

      return {
        step: 'linkDebtForm',
        assetDraft: state.assetDraft,
        savedAssetId: state.savedAssetId,
        debtDraft: { debt_type: suggestedDebtType },
      }
    }

    case 'LINK_DEBT_NO': {
      if (state.step !== 'linkDebt') return state
      return { step: 'saving' }
    }

    case 'SAVING': {
      return { step: 'saving' }
    }

    case 'SUCCESS': {
      return action.payload
    }

    case 'ERROR': {
      return { step: 'error', message: action.message, prev: state }
    }

    case 'BACK': {
      // Stap-bewuste navigatie. We verliezen bewust de ingevulde details
      // NIET bij back vanuit details naar type, want dat voelt slordig —
      // bij type-wissel in stap 2 wordt de draft alsnog overschreven.
      switch (state.step) {
        case 'type':
          return initialWizardState
        case 'details':
          return { step: 'type', intent: state.intent }
        case 'linkDebt':
          return {
            step: 'details',
            intent: 'asset',
            assetDraft: state.assetDraft,
          }
        case 'linkDebtForm':
          return {
            step: 'linkDebt',
            assetDraft: state.assetDraft,
            savedAssetId: state.savedAssetId,
          }
        case 'error':
          return state.prev
        case 'success':
        case 'saving':
        case 'choice':
        default:
          return state
      }
    }

    case 'RESET':
    case 'ADD_ANOTHER':
      return initialWizardState

    default:
      return state
  }
}
