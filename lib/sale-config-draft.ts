/**
 * Invoerconcept van de verkoopinstelling (`assets.sale_config`) — de vorm waarin een
 * formulier de keuze vasthoudt (strings uit invoervelden), plus de omzetting van en naar
 * `SaleConfig`.
 *
 * Eén home voor twee hosts (TPR-15): het bezittingenformulier (`AssetForm` in
 * `components/core/assets-client.tsx`) en stap 4 van de plan-review. Beide renderen
 * `SaleConfigFields` en bouwen de config met `draftToSaleConfig`; zo kan de ene host niet
 * stil anders opslaan dan de andere.
 *
 * Pure functies, geen React/Supabase.
 */

import { parseSaleConfig, type SaleConfig, type SaleStand } from '@/lib/sale-config'

export type SaleMomentMode = 'leeftijd' | 'datum'

export interface SaleConfigDraft {
  stand: SaleStand
  /** Leeftijd als ingevoerde tekst ('' = leeg). */
  triggerAge: string
  /** ISO-datum als ingevoerde tekst ('' = leeg). */
  triggerDate: string
  /** Welk veld de gebruiker voor het vaste moment invult. */
  momentMode: SaleMomentMode
  /** Verkoopkosten in procenten als tekst ('6' = 6%; '' = type-default). */
  costsPct: string
  payoffDebtIds: string[]
}

/**
 * Concept uit de opgeslagen JSONB. De parser geeft de resolve-time default
 * `wanneer_nodig` voor een bezitting zonder config, zodat die keuze actief toont.
 */
export function saleConfigToDraft(raw: unknown): SaleConfigDraft {
  const cfg = parseSaleConfig(raw)
  return {
    stand: cfg.stand,
    triggerAge: cfg.stand !== 'niet_verkopen' && cfg.triggerAge != null ? String(cfg.triggerAge) : '',
    triggerDate: cfg.stand === 'vast_moment' && cfg.triggerDate ? cfg.triggerDate : '',
    momentMode: cfg.stand === 'vast_moment' && cfg.triggerDate ? 'datum' : 'leeftijd',
    costsPct:
      cfg.stand !== 'niet_verkopen' && cfg.salesCostsPct != null
        ? String(Math.round(cfg.salesCostsPct * 1000) / 10) // fractie → % (bv. 0.06 → 6)
        : '',
    payoffDebtIds: cfg.stand !== 'niet_verkopen' && cfg.payoffDebtIds ? cfg.payoffDebtIds : [],
  }
}

/** `SaleConfig` uit het concept — wat een host opslaat. */
export function draftToSaleConfig(draft: SaleConfigDraft): SaleConfig {
  const pctNum = draft.costsPct ? Number(draft.costsPct) : NaN
  const salesCostsPct = Number.isFinite(pctNum) && pctNum > 0 ? pctNum / 100 : undefined // % → fractie
  const ageNum = draft.triggerAge ? Number(draft.triggerAge) : NaN
  const triggerAge = Number.isFinite(ageNum) && ageNum > 0 ? ageNum : undefined
  const payoffDebtIds = draft.payoffDebtIds.length > 0 ? draft.payoffDebtIds : undefined
  if (draft.stand === 'niet_verkopen') {
    return { stand: 'niet_verkopen' }
  }
  if (draft.stand === 'vast_moment') {
    return {
      stand: 'vast_moment',
      ...(draft.momentMode === 'datum'
        ? { triggerDate: draft.triggerDate || null }
        : { triggerAge: triggerAge ?? null }),
      ...(salesCostsPct !== undefined ? { salesCostsPct } : {}),
      ...(payoffDebtIds ? { payoffDebtIds } : {}),
    }
  }
  return {
    stand: 'wanneer_nodig',
    ...(triggerAge !== undefined ? { triggerAge } : {}),
    ...(salesCostsPct !== undefined ? { salesCostsPct } : {}),
    ...(payoffDebtIds ? { payoffDebtIds } : {}),
  }
}
