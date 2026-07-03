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
  /** De volledige adapter-invoer (profiel + potten + events + optionele partner). */
  readonly adapterInput: KernelAdapterInput
  /** Jaaruitgaven (reëel/koopkracht-nu) voor de bridge-`implicitWithdrawalRate`. */
  readonly yearlyExpenses: number
}

/** Uitkomst van één kernel-run: het consumer-resultaat + de adapter-notices. */
export interface RunKernelUnifiedResult {
  readonly result: KernelUnifiedResult
  readonly notices: readonly EventMappingNotice[]
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
  return { result, notices }
}
