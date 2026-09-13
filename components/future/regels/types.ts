/**
 * Gedeelde contracten voor de regel-bewerkschermen (/toekomst → Voorkeuren).
 * Apart bestand om circulaire imports tussen RegelBewerkenPane en de bodies te vermijden.
 */
import type { ReactNode } from 'react'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { FirePlan, FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { PotRulesConfig } from '@/lib/pot-rules'
import type { WealthGroup } from '@/lib/wealth-composition'

/**
 * Save-state die een body publiceert aan de pane-wrapper (zelfde patroon als
 * EventEditActionsState in event-pane-edit.tsx). De wrapper bouwt hieruit de
 * sticky footer-knoppen + optionele live-info.
 */
export interface RegelEditActionsState {
  canSave: boolean
  saving: boolean
  save: () => void
  /** Optionele live-info naast de footer-knoppen (bv. FIRE-delta-tekst). */
  footerInfo?: ReactNode
  /**
   * TPR-15 — wijkt het concept af van wat er opgeslagen staat? De plan-review toont bij
   * `false` "Bevestigen" in plaats van "Opslaan en bevestigen" (besluit eigenaar 13 sep
   * 2026). Optioneel: een body die het niet publiceert, blijft in de wizard "Opslaan en
   * bevestigen" houden; RegelBewerkenPane leest het niet.
   */
  changed?: boolean
}

/**
 * Props die RegelBewerkenPane aan elke body doorgeeft. Live-sim-bodies (regel 1 & 2)
 * gebruiken `simSnapshot` + de huidige strategie-configs; illustratieve bodies
 * (regel 3/4/5) gebruiken `potRules` + `potBalances`.
 */
export interface RegelBodyProps {
  onActionsChange: (s: RegelEditActionsState) => void
  onClose: () => void
  /** Aanroepen na een geslaagde save (wrapper triggert router.refresh). */
  onSaved: () => void

  // ── live-sim (regel 1 & 2) ──
  simSnapshot?: RegelSimSnapshot | null
  fireStrategy?: FireStrategyConfig
  /**
   * ADR 0129 — het volledige plan (anker + eind-vorm) uit de bundel. De
   * eindstrategie-body leest hier het anker; `fireStrategy` is de legacy-echo (F4
   * verwijdert 'm). Optioneel zodat de illustratieve bodies er niet van weten.
   */
  firePlan?: FirePlan | null
  withdrawalStrategy?: WithdrawalStrategyConfig

  // ── illustratief (regel 3/4/5) ──
  potRules?: PotRulesConfig
  potBalances?: Record<WealthGroup, number>
}
