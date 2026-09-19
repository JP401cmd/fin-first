/**
 * Voortgang van de plan-review — AFGELEID uit de profielstaat, geen afvinklijst
 * (A9). Een stap telt als bevestigd wanneer (a) de markering er is én (b) de
 * onderliggende profielstaat die bevestiging niet heeft ingehaald (A10):
 *
 *  - `inkomsten`: zonder actief AOW-event rekent de kern met €0 AOW — een eerdere
 *    bevestiging geldt dan niet meer (reden `aow_ontbreekt`).
 *  - `woning`:    zonder niet-liquide bezit is de stap n.v.t.; mét eigen huis maar
 *    zónder expliciete woonstrategie staat hij open (reden
 *    `woning_zonder_strategie`) — óók als er een oude markering ligt.
 *  - `plan`, `uitgaven`, `potten`: markering = bevestigd. Bevestigen schrijft hier
 *    de waarde expliciet via de bestaande route, dus de staat is per constructie
 *    expliciet zodra de markering er is.
 *  - `grondslag` (W-009, fase 1): markering = bevestigd. De keuze zelf schrijft de
 *    editor-body via `PUT /api/parameters`; bevestigen legt vast dat de gebruiker de
 *    twee grondslagen heeft gezien. Een inhaalregel ("de grondslag staat op eigen
 *    invoer terwijl er intussen budgetten zijn") hoort bij fase 2 — die heeft een
 *    budget-/transactiefeit nodig dat `PlanReviewFacts` vandaag niet draagt.
 *
 * Pure module (géén 'use client'): de server-page leidt hiermee de kaartstatus af,
 * de pane herhaalt dezelfde afleiding na een bevestiging. Eén functie, twee lezers.
 */

import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import { NIET_LIQUIDE_ASSET_TYPES } from '@/lib/plan-review/niet-liquide'
import {
  PLAN_REVIEW_STAPPEN,
  type PlanReviewFacts,
  type PlanReviewProgress,
  type PlanReviewStap,
  type PlanReviewStapVoortgang,
  type PlanReviewState,
} from './types'

function stapVoortgang(
  stap: PlanReviewStap,
  state: PlanReviewState,
  facts: PlanReviewFacts,
): PlanReviewStapVoortgang {
  const markering = state[stap] != null
  switch (stap) {
    case 'inkomsten':
      if (!facts.hasAowEvent) return { stap, status: 'open', reden: 'aow_ontbreekt' }
      return { stap, status: markering ? 'bevestigd' : 'open', reden: null }
    case 'woning':
      if (!facts.hasNietLiquideBezit) return { stap, status: 'nvt', reden: null }
      if (facts.hasEigenHuis && !facts.housingConfigured) {
        return { stap, status: 'open', reden: 'woning_zonder_strategie' }
      }
      return { stap, status: markering ? 'bevestigd' : 'open', reden: null }
    case 'plan':
    case 'uitgaven':
    case 'potten':
    case 'grondslag':
      return { stap, status: markering ? 'bevestigd' : 'open', reden: null }
  }
}

export function derivePlanReviewProgress(state: PlanReviewState, facts: PlanReviewFacts): PlanReviewProgress {
  const stappen = PLAN_REVIEW_STAPPEN.map((stap) => stapVoortgang(stap, state, facts))
  const meetellend = stappen.filter((s) => s.status !== 'nvt')
  const bevestigd = meetellend.filter((s) => s.status === 'bevestigd').length
  const eersteOpen = stappen.find((s) => s.status === 'open')?.stap ?? null
  return {
    stappen,
    bevestigd,
    totaal: meetellend.length,
    eersteOpen,
    voltooid: eersteOpen === null,
  }
}

/**
 * Bouwt de feiten uit de Horizon-bundel. Bewust op de al-geladen rijen (geen
 * extra query): `events` en `assets` reizen al mee, `housing_strategy_config` komt
 * uit de rauwe profielrij die de kernel-adapter ook leest.
 */
export function buildPlanReviewFacts(input: {
  events: readonly Pick<LifeEvent, 'event_type' | 'is_active'>[]
  assets: readonly (Pick<Asset, 'asset_type' | 'is_active'> & { user_id?: string | null })[]
  /** `rawProfile.housing_strategy_config` — rauw; `null`/`undefined` = niet gezet. */
  housingStrategyRaw: unknown
  /**
   * De ingelogde gebruiker. De SELECT-policy op `assets` is huishoud-gedeeld: zonder
   * deze filter zou het huis van de partner de woningstap van déze gebruiker openen,
   * terwijl de woonstrategie per profiel is (CLAUDE.md, datapad-conventie).
   */
  ownerId?: string
}): PlanReviewFacts {
  const actieveAssets = input.assets.filter(
    (a) => a.is_active !== false && (input.ownerId == null || a.user_id == null || a.user_id === input.ownerId),
  )
  return {
    hasAowEvent: input.events.some((e) => e.event_type === 'aow' && e.is_active !== false),
    hasEigenHuis: actieveAssets.some((a) => a.asset_type === 'eigen_huis'),
    hasNietLiquideBezit: actieveAssets.some((a) => NIET_LIQUIDE_ASSET_TYPES.has(a.asset_type)),
    housingConfigured: input.housingStrategyRaw != null && typeof input.housingStrategyRaw === 'object',
  }
}
