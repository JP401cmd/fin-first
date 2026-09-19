/**
 * De ÉNE samenstelling van de `detectEindsituatie`-invoer uit een kernel-run.
 *
 * WAAROM DEZE MODULE BESTAAT: de detector (`eindsituatie-duiding.ts`) is bewust puur
 * en kent geen `SimResult`, geen profielrij en geen plan-resolver. Elke consument moest
 * die zes afleidingen daarom zelf doen — de pensioen-uitsluiting, de `currentAge`-gate,
 * de `displayEndAge ?? plan.endAge`-terugval, `fire_legacy_include_illiquid === true`,
 * `fire_no_deficit_loan !== false`, `stopAnker != null` — en dat stond al twee keer
 * letterlijk in de repo (`lib/totaalplan-data.ts` en `components/app/horizon/horizon-client.tsx`).
 * Nu de gedeelde server-run (`computeHorizonFireSim`) de duiding óók draagt, zou dat een
 * derde kopie worden.
 *
 * STAND (19 sep 2026): twee van de drie consumenten lezen deze helper —
 * `lib/fire-target-shared.ts` en `lib/totaalplan-data.ts`. De inline kopie in
 * `components/app/horizon/horizon-client.tsx` (rond regel 3349) staat er nog; die
 * migratie is bewust NIET in deze kaart gedaan omdat dat bestand in dezelfde run door
 * een parallelle agent werd gewijzigd. De helper is puur en client-safe (alleen
 * `fire-strategy` + de detector), dus dat is later een `useMemo`-vervanging met de
 * extra `usePartnerMainLine`-gate eromheen. Zolang die kopie bestaat: wijzig hier
 * nooit een afleiding zonder haar mee te nemen.
 *
 * CONSUME, DON'T RECOMPUTE: hier wordt niets gerekend. De rijen, het stopmoment en de
 * eindleeftijd komen uit DEZELFDE run; het plan via `resolveFirePlanWithOverride` (die
 * kent de tegenspraak-regel D2, een rauwe `fire_end_strategy`-lezing niet).
 */

import type { SimResult } from '@/lib/fire-simulation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { resolveFirePlanWithOverride } from '@/lib/fire-strategy'
import { detectEindsituatie, type EindsituatieDuiding } from './eindsituatie-duiding'

/** Precies de `SimResult`-velden die de samenstelling leest. */
export type EindsituatieSim = Pick<
  SimResult,
  'stopAnker' | 'fireAgeFractional' | 'displayEndAge' | 'strategy'
>

export interface EindsituatieRunInput {
  /** Volledige jaarrijen van de run (niet de compacte weergave-rijen). */
  rows: readonly UnifiedProjectionRow[]
  sim: EindsituatieSim
  /**
   * De EIGEN profielrij van de run (`ConvergentieRawContext.profile`).
   * NOOIT een partnerblok: de duiding beschrijft het plan van de vrager.
   */
  profile: ConvergentieRawProfileRow
  /** Leeftijd vandaag; `null` ⇒ geen duiding (de detector heeft 'm als anker nodig). */
  currentAge: number | null
  /** Jaaruitgaven die DEZE run voedden (`ConvergentieRawContext.yearlyExpenses`). */
  yearlyExpenses: number
}

/**
 * Duid de eindsituatie van een kernel-run, of `null` wanneer er niets te duiden valt:
 * zonder leeftijd, onder een pensioen-anker (daar is het eindbedrag geen keuze van de
 * gebruiker), of wanneer de detector zelf niets vindt (vast stopmoment, geen rijen,
 * overschot ≤ één jaar uitgaven).
 */
export function detectEindsituatieForRun(input: EindsituatieRunInput): EindsituatieDuiding | null {
  if (input.currentAge == null) return null
  if (input.sim.strategy === 'pensioen') return null

  const plan = resolveFirePlanWithOverride(input.profile)
  return detectEindsituatie({
    rows: input.rows,
    endForm: plan.endForm,
    endAge: input.sim.displayEndAge ?? plan.endAge,
    legacyAmount: plan.legacyAmount,
    legacyIncludeIlliquid: input.profile.fire_legacy_include_illiquid === true,
    vastStopmoment: input.sim.stopAnker != null,
    fireAgeFractional: input.sim.fireAgeFractional ?? null,
    currentAge: input.currentAge,
    // ADR 0149 — standaard AAN: alleen een expliciete `false` zet 'm uit.
    geenTekortLeningAan: input.profile.fire_no_deficit_loan !== false,
    jaarUitgavenNu: input.yearlyExpenses,
  })
}
