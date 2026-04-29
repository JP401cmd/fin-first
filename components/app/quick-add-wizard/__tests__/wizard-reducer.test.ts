/**
 * Unit tests voor de quick-add `wizardReducer`.
 *
 * Dekt de state-machine-transities uit `wizard-reducer.ts`:
 *  - Start-state en `OPEN` met/zonder `initialIntent`
 *  - Navigatie `choice → type → details` via `SELECT_INTENT` / `SELECT_TYPE_*`
 *  - Merge-gedrag van `UPDATE_ASSET` / `UPDATE_DEBT`
 *  - Het "heeft suggested debt?"-vertakkingspunt bij `PROCEED_FROM_ASSET_DETAILS`
 *  - LinkDebt ja/nee, BACK en RESET
 *
 * Alle checks draaien op pure state-objecten; geen React of async nodig.
 */

import { describe, it, expect } from 'vitest'
import {
  initialWizardState,
  wizardReducer,
  type WizardState,
} from '../wizard-reducer'

describe('wizardReducer', () => {
  it('heeft initialWizardState = { step: "choice" }', () => {
    expect(initialWizardState).toEqual({ step: 'choice' })
  })

  // ── OPEN ─────────────────────────────────────────────────────

  it('OPEN zonder initialIntent blijft op choice', () => {
    const next = wizardReducer({ step: 'success', kind: 'asset' }, { type: 'OPEN' })
    expect(next).toEqual({ step: 'choice' })
  })

  it('OPEN met initialIntent "asset" springt naar type-stap', () => {
    const next = wizardReducer(
      { step: 'choice' },
      { type: 'OPEN', initialIntent: 'asset' },
    )
    expect(next).toEqual({ step: 'type', intent: 'asset' })
  })

  it('OPEN met initialIntent "debt" springt naar type-stap', () => {
    const next = wizardReducer(
      { step: 'choice' },
      { type: 'OPEN', initialIntent: 'debt' },
    )
    expect(next).toEqual({ step: 'type', intent: 'debt' })
  })

  // ── SELECT_INTENT ────────────────────────────────────────────

  it('SELECT_INTENT uit choice gaat naar type', () => {
    const next = wizardReducer(
      { step: 'choice' },
      { type: 'SELECT_INTENT', intent: 'asset' },
    )
    expect(next).toEqual({ step: 'type', intent: 'asset' })
  })

  it('SELECT_INTENT buiten choice is een no-op', () => {
    const state: WizardState = { step: 'type', intent: 'debt' }
    const next = wizardReducer(state, { type: 'SELECT_INTENT', intent: 'asset' })
    expect(next).toBe(state)
  })

  // ── SELECT_TYPE_* ────────────────────────────────────────────

  it('SELECT_TYPE_ASSET uit type-stap gaat naar details met assetDraft', () => {
    const next = wizardReducer(
      { step: 'type', intent: 'asset' },
      { type: 'SELECT_TYPE_ASSET', assetType: 'savings' },
    )
    expect(next).toEqual({
      step: 'details',
      intent: 'asset',
      assetDraft: { asset_type: 'savings' },
    })
  })

  it('SELECT_TYPE_DEBT uit type-stap gaat naar details met debtDraft', () => {
    const next = wizardReducer(
      { step: 'type', intent: 'debt' },
      { type: 'SELECT_TYPE_DEBT', debtType: 'mortgage' },
    )
    expect(next).toEqual({
      step: 'details',
      intent: 'debt',
      debtDraft: { debt_type: 'mortgage' },
    })
  })

  it('SELECT_TYPE_ASSET met verkeerde intent is een no-op', () => {
    const state: WizardState = { step: 'type', intent: 'debt' }
    const next = wizardReducer(state, {
      type: 'SELECT_TYPE_ASSET',
      assetType: 'savings',
    })
    expect(next).toBe(state)
  })

  // ── UPDATE_ASSET / UPDATE_DEBT ───────────────────────────────

  it('UPDATE_ASSET merget de patch in de bestaande assetDraft', () => {
    const state: WizardState = {
      step: 'details',
      intent: 'asset',
      assetDraft: { asset_type: 'savings', name: 'Oud' },
    }
    const next = wizardReducer(state, {
      type: 'UPDATE_ASSET',
      patch: { name: 'Nieuw', current_value: 100 },
    })
    expect(next).toEqual({
      step: 'details',
      intent: 'asset',
      assetDraft: { asset_type: 'savings', name: 'Nieuw', current_value: 100 },
    })
  })

  it('UPDATE_DEBT merget de patch in de bestaande debtDraft', () => {
    const state: WizardState = {
      step: 'details',
      intent: 'debt',
      debtDraft: { debt_type: 'mortgage' },
    }
    const next = wizardReducer(state, {
      type: 'UPDATE_DEBT',
      patch: { name: 'Hypotheek', current_balance: 250000 },
    })
    expect(next).toEqual({
      step: 'details',
      intent: 'debt',
      debtDraft: {
        debt_type: 'mortgage',
        name: 'Hypotheek',
        current_balance: 250000,
      },
    })
  })

  it('UPDATE_ASSET buiten de juiste stap laat state ongewijzigd', () => {
    const state: WizardState = { step: 'type', intent: 'asset' }
    const next = wizardReducer(state, { type: 'UPDATE_ASSET', patch: { name: 'X' } })
    expect(next).toBe(state)
  })

  // ── PROCEED_FROM_ASSET_DETAILS ───────────────────────────────

  it('PROCEED_FROM_ASSET_DETAILS met eigen_huis gaat naar linkDebt (mortgage suggestion)', () => {
    const state: WizardState = {
      step: 'details',
      intent: 'asset',
      assetDraft: { asset_type: 'eigen_huis', name: 'Huis', current_value: 500000 },
    }
    const next = wizardReducer(state, { type: 'PROCEED_FROM_ASSET_DETAILS' })
    expect(next).toEqual({
      step: 'linkDebt',
      assetDraft: { asset_type: 'eigen_huis', name: 'Huis', current_value: 500000 },
    })
  })

  it('PROCEED_FROM_ASSET_DETAILS met crypto skipt linkDebt en gaat naar saving', () => {
    const state: WizardState = {
      step: 'details',
      intent: 'asset',
      assetDraft: { asset_type: 'crypto', name: 'BTC', current_value: 1000 },
    }
    const next = wizardReducer(state, { type: 'PROCEED_FROM_ASSET_DETAILS' })
    expect(next).toEqual({ step: 'saving' })
  })

  it('PROCEED_FROM_ASSET_DETAILS met incomplete draft blijft in details', () => {
    const state: WizardState = {
      step: 'details',
      intent: 'asset',
      assetDraft: { asset_type: 'savings' }, // geen name/current_value
    }
    const next = wizardReducer(state, { type: 'PROCEED_FROM_ASSET_DETAILS' })
    expect(next).toBe(state)
  })

  // ── PROCEED_FROM_DEBT_DETAILS ────────────────────────────────

  it('PROCEED_FROM_DEBT_DETAILS gaat altijd naar saving', () => {
    const state: WizardState = {
      step: 'details',
      intent: 'debt',
      debtDraft: { debt_type: 'mortgage', name: 'Hyp', current_balance: 200000 },
    }
    const next = wizardReducer(state, { type: 'PROCEED_FROM_DEBT_DETAILS' })
    expect(next).toEqual({ step: 'saving' })
  })

  // ── LINK_DEBT_YES / NO ───────────────────────────────────────

  it('LINK_DEBT_YES gaat naar linkDebtForm met suggested debt_type', () => {
    const state: WizardState = {
      step: 'linkDebt',
      // Required<AssetQuickInput> — compleet voor de state-invariant
      assetDraft: {
        asset_type: 'eigen_huis',
        name: 'Huis',
        current_value: 500000,
        field3: 450000,
      },
      savedAssetId: 'asset-123',
    }
    const next = wizardReducer(state, { type: 'LINK_DEBT_YES' })
    expect(next).toEqual({
      step: 'linkDebtForm',
      assetDraft: state.assetDraft,
      savedAssetId: 'asset-123',
      debtDraft: { debt_type: 'mortgage' },
    })
  })

  it('LINK_DEBT_NO uit linkDebt gaat naar saving', () => {
    const state: WizardState = {
      step: 'linkDebt',
      assetDraft: {
        asset_type: 'eigen_huis',
        name: 'Huis',
        current_value: 500000,
        field3: 450000,
      },
      savedAssetId: 'asset-123',
    }
    const next = wizardReducer(state, { type: 'LINK_DEBT_NO' })
    expect(next).toEqual({ step: 'saving' })
  })

  // ── BACK ─────────────────────────────────────────────────────

  it('BACK vanaf details gaat terug naar type met dezelfde intent', () => {
    const state: WizardState = {
      step: 'details',
      intent: 'asset',
      assetDraft: { asset_type: 'savings' },
    }
    const next = wizardReducer(state, { type: 'BACK' })
    expect(next).toEqual({ step: 'type', intent: 'asset' })
  })

  it('BACK vanaf type gaat terug naar choice', () => {
    const next = wizardReducer({ step: 'type', intent: 'debt' }, { type: 'BACK' })
    expect(next).toEqual({ step: 'choice' })
  })

  it('BACK vanaf linkDebt gaat terug naar details (asset-intent behouden)', () => {
    const state: WizardState = {
      step: 'linkDebt',
      assetDraft: {
        asset_type: 'eigen_huis',
        name: 'Huis',
        current_value: 500000,
        field3: 450000,
      },
    }
    const next = wizardReducer(state, { type: 'BACK' })
    expect(next).toEqual({
      step: 'details',
      intent: 'asset',
      assetDraft: state.assetDraft,
    })
  })

  it('BACK vanaf choice blijft in choice', () => {
    const next = wizardReducer({ step: 'choice' }, { type: 'BACK' })
    expect(next).toEqual({ step: 'choice' })
  })

  // ── RESET / ADD_ANOTHER ──────────────────────────────────────

  it('RESET zet terug naar initialWizardState', () => {
    const state: WizardState = {
      step: 'details',
      intent: 'asset',
      assetDraft: { asset_type: 'savings', name: 'X', current_value: 10 },
    }
    expect(wizardReducer(state, { type: 'RESET' })).toEqual(initialWizardState)
  })

  it('ADD_ANOTHER zet terug naar initialWizardState', () => {
    const state: WizardState = { step: 'success', kind: 'asset' }
    expect(wizardReducer(state, { type: 'ADD_ANOTHER' })).toEqual(initialWizardState)
  })

  // ── Guard tegen ongeldige acties ─────────────────────────────

  it('ongeldige action in verkeerde state laat state ongewijzigd', () => {
    const state: WizardState = { step: 'choice' }
    // SELECT_TYPE_ASSET vanuit choice moet worden genegeerd
    const next = wizardReducer(state, {
      type: 'SELECT_TYPE_ASSET',
      assetType: 'savings',
    })
    expect(next).toBe(state)
  })
})
