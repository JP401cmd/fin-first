/**
 * Horizon-kernel — gedeelde "één kernel-run"-helper (FASE 6 stap 5A).
 *
 * De kanonieke keten die ELKE kernel-consument (convergentie-, what-if- en
 * huishouden-router) draait om van een `KernelAdapterInput` naar het consumer-
 * contract `KernelUnifiedResult` te komen:
 *
 *   buildKernelInputFromAppWithNotices → solveFire → buildKernelSlotMeta →
 *   kernelToUnifiedResult
 *
 * Eén plek zodat de vier oppervlakken byte-identiek dezelfde kern-invoer bouwen,
 * dezelfde slot-meta afleiden en dezelfde bridge-mapping draaien (geen drift). De
 * `notices` (partner-pensioen/AOW-defaults, capaciteits-gaten) reizen mee voor de
 * huishouden-router; de scalaire consumenten negeren ze.
 *
 * App-zijde (consumeert de adapter + bridge); bewust NIET via `index.ts`
 * geëxporteerd — de kern-barrel blijft domein-zuiver. Pure functie, geen
 * fs/Supabase/Date.now/Math.random.
 */

import { solveFire } from '@/lib/horizon-kernel/solver'
import {
  buildKernelInputFromAppWithNotices,
  deriveEigenHuisIds,
  type EventMappingNotice,
  type KernelAdapterInput,
} from '@/lib/horizon-kernel/adapter'
import {
  buildKernelSlotMeta,
  kernelToUnifiedResult,
  type KernelUnifiedResult,
} from '@/lib/horizon-kernel/bridge'

/** Parameters voor één kernel-run. */
export interface RunKernelUnifiedParams {
  /**
   * De volledige adapter-invoer (profiel + potten + events + optionele partner).
   * F6 — reproduceerbare runs: zet `adapterInput.asOf` (peildatum) om een run exact
   * herhaalbaar te maken; weglaten = `new Date()` (nu aan de rand). Er is bewust géén
   * aparte `asOf` op dit niveau — de peildatum heeft één bron (`KernelAdapterInput.asOf`).
   */
  readonly adapterInput: KernelAdapterInput
  /** Jaaruitgaven (reëel/koopkracht-nu) voor de bridge-`implicitWithdrawalRate`. */
  readonly yearlyExpenses: number
}

/** Uitkomst van één kernel-run: het consumer-resultaat + de adapter-notices. */
export interface RunKernelUnifiedResult {
  readonly result: KernelUnifiedResult
  readonly notices: readonly EventMappingNotice[]
  /**
   * `KernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar` van DEZE run (20 sep 2026) —
   * de uitgave na pensioen waar het plan daadwerkelijk mee gerekend heeft, in nominale
   * euro's per jaar.
   *
   * WAAROM DOORGEVEN EN NIET LATEN HERLEIDEN: dit getal is de uitkomst van
   * `computeRetirementExpenses` op de kernel-adapter-grondslag (essentiële budgetten /
   * jaarinkomen / eigen bedrag, `buildInkomenUitgaven` in adapter/params.ts) en het voedt
   * via de bridge de hele onttrekkingskant (`CLAUDE.md`: consume, don't recompute). Het
   * `retirement_expense`-doel moet zich aan exact dít getal meten; elke tweede
   * samenstelling in een loader zou een tweede waarheid zijn die stil uiteendrijft.
   *
   * ÉÉN SCALAR EN NIET DE HELE `KernelInput`: deze uitkomst reist structured-clone over de
   * worker-grens, dus alleen wat een consument nodig heeft gaat mee.
   */
  readonly uitgaveNaPensioenPerJaar: number
}

/**
 * Draai één adapter-invoer door de volledige kernel-keten (adapter → solver →
 * bridge) en lever het `KernelUnifiedResult` + de adapter-notices. Gooit door bij
 * een kern-fout (bv. ontbrekende geboortedatum) — de aanroepende router vangt dat
 * en levert een expliciete fout/nette null met reden.
 */
export function runKernelUnified(p: RunKernelUnifiedParams): RunKernelUnifiedResult {
  const { input: kernelInput, notices } = buildKernelInputFromAppWithNotices(p.adapterInput)
  const solve = solveFire(kernelInput)
  const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
    p.adapterInput.assets,
    p.adapterInput.debts,
    deriveEigenHuisIds(p.adapterInput.assets),
  )
  const result = kernelToUnifiedResult(solve, {
    input: kernelInput,
    yearlyExpenses: p.yearlyExpenses,
    assetSlotMeta,
    debtSlotMeta,
  })
  // Rechtstreeks van de kernel-invoer die hierboven is gebouwd — geen tweede afleiding.
  return { result, notices, uitgaveNaPensioenPerJaar: kernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar }
}
