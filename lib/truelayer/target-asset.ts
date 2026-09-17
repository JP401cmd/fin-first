import type { SupabaseClient } from '@supabase/supabase-js'
import { cashSubtypeToAccountType } from '@/lib/account-types'
import { resolveAssetAccountNumber } from '@/lib/asset-account-number'
import { syncBankAccountCompanion } from '@/lib/bank-account-companion'
import { BUDGET_TRACKING_ASSET_SELECT } from '@/lib/budget-tracking'
import { ibanTail } from '@/lib/truelayer/linked-account'
import type { TargetAssetOption } from '@/lib/truelayer/target-account'

/**
 * CASH-BEZIT ALS DOEL van een bankkoppeling — serverkant.
 *
 * `lib/truelayer/target-account.ts` beslist over `bank_accounts`-rijen; dit bestand
 * is de brug voor het cash-bezit dat er (nog) geen heeft. Het typische geval is de
 * onboarding: `save-own-data` maakt de betaalrekening aan als cash-bezit, zonder
 * companion-rij. Zonder brug kon de wizard dat bezit niet aanbieden en maakte de
 * callback bij de eerste koppeling een tweede cash-bezit aan — een dubbele
 * betaalrekening die de gebruiker zelf moest opruimen.
 *
 * Bewust GEEN eigen geschiktheidsregel naast `isEligibleTargetAccount`: een bezit
 * wordt hier alleen omgezet naar een companion-rij (via de ene schrijver,
 * `syncBankAccountCompanion`), en daarna beslist `resolveTargetAccount` precies
 * zoals voor elke andere rekening — eigenaarschap, geschiktheid, FR5. Twee plekken
 * die "mag dit een koppeling dragen" definiëren lopen ooit uiteen.
 *
 * Los bestand en niet in `target-account.ts`: dat bestand wordt ook door
 * `'use client'`-componenten gelezen, en de import van `budget-tracking` hieronder
 * hoort niet in een clientbundel.
 */

/**
 * `BUDGET_TRACKING_ASSET_SELECT` plus de twee kolommen die bepalen of een bezit
 * hier überhaupt meedoet. Hergebruik van die select houdt de drop-instructie in
 * `resolveAssetAccountNumber` waar: dit is geen derde select-string die
 * `account_number` leest.
 */
const TARGET_CASH_ASSET_SELECT = `${BUDGET_TRACKING_ASSET_SELECT}, asset_type, is_active`

type TargetCashAssetRow = {
  id: string
  name: string
  has_budget_tracking: boolean | null
  account_number: string | null
  account_number_encrypted: string | null
  institution: string | null
  subtype: string | null
  ownership: string | null
  household_id: string | null
  current_value: number | string | null
  asset_type: string | null
  is_active: boolean | null
}

/**
 * De eigen, actieve cash-bezittingen zónder eigen companion-rij, als doeloptie.
 *
 * **`user_id` op beide lezingen, en dat is geen dubbelop.** De SELECT-policy op
 * `assets` én op `bank_accounts` is huishoud-gedeeld: zonder filter zou de wizard
 * het cash-bezit van de partner aanbieden. Zelfde reden als in `loadTargetAccount`.
 *
 * **De grens is expliciet en gedeeld** met de rekeninglijst (`limit`): de aanroeper
 * geeft `MAX_TARGET_ACCOUNTS` mee. De ordening is deterministisch, dus een afkap is
 * stabiel. De companion-lezing heeft géén eigen cap: ze vraagt uitsluitend naar de
 * hooguit `limit` bezit-id's hierboven (`.in(...)`), dus ze kan geen companion
 * missen — een gemiste companion zou hier een bezit tonen dat al een rekening hééft.
 */
export async function loadCompanionlessCashAssets(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
): Promise<TargetAssetOption[]> {
  const { data: assetRows, error: assetsError } = await supabase
    .from('assets')
    .select(TARGET_CASH_ASSET_SELECT)
    .eq('user_id', userId)
    .eq('asset_type', 'cash')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (assetsError) throw assetsError

  const assets = (assetRows ?? []) as unknown as TargetCashAssetRow[]
  if (assets.length === 0) return []

  const { data: companionRows, error: companionError } = await supabase
    .from('bank_accounts')
    .select('linked_asset_id')
    .eq('user_id', userId)
    .in('linked_asset_id', assets.map((a) => a.id))

  if (companionError) throw companionError

  const withCompanion = new Set(
    ((companionRows ?? []) as { linked_asset_id: string | null }[])
      .map((r) => r.linked_asset_id)
      .filter((v): v is string => !!v),
  )

  return assets
    .filter((a) => !withCompanion.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution ?? null,
      // Alleen het staartje verlaat de server — zelfde grens als bij rekeningen.
      iban_tail: ibanTail(resolveAssetAccountNumber(a)),
      account_type: cashSubtypeToAccountType(a.subtype),
      budget_tracking: a.has_budget_tracking !== false,
    }))
}

export type EnsureCompanionResult = { ok: true; bankAccountId: string } | { ok: false }

/**
 * Zet een client-geleverd `target_asset_id` om naar de `bank_accounts`-rij die de
 * koppeling gaat dragen — de companion, aangemaakt als hij er nog niet is.
 *
 * `{ ok: false }` maakt géén onderscheid tussen "bestaat niet", "niet van jou",
 * "geen cash" en "gedeactiveerd": de aanroeper maakt er dezelfde vaste 400 van als
 * voor een onbruikbare rekening. Geen existentie-orakel op andermans id's.
 *
 * **Idempotent.** Heeft het bezit al een eigen companion, dan wordt die hergebruikt
 * en NIET gesynchroniseerd — een sync met `enabled = true` zou een bewust
 * uitgezette budgettering (`is_active = false` op de companion) stil weer aanzetten.
 * Of die rekening een koppeling mag dragen beslist daarna `resolveTargetAccount`.
 * Twee gelijktijdige aanroepen maken hooguit één companion: `linked_asset_id` is
 * UNIQUE, dus de tweede insert ketst af en de herlezing vindt de eerste.
 *
 * **De twee vlaggen blijven gelijk.** Een nieuwe companion volgt
 * `assets.has_budget_tracking`: staat die uit, dan wordt de verse rij direct weer
 * gedeactiveerd — precies de toestand die `syncBankAccountCompanion` voor
 * "budgetteren uit" schrijft, en die het B2-vinkje in de wizard weer kan aanzetten.
 * Zonder die tweede stap zou een koppeling de budgettering stil aanzetten.
 */
export async function ensureCompanionForCashAsset(
  supabase: SupabaseClient,
  userId: string,
  assetId: string,
): Promise<EnsureCompanionResult> {
  const { data: assetRow, error: assetError } = await supabase
    .from('assets')
    .select(TARGET_CASH_ASSET_SELECT)
    .eq('id', assetId)
    .eq('user_id', userId)
    .maybeSingle()

  if (assetError) throw assetError
  const asset = assetRow as unknown as TargetCashAssetRow | null
  if (!asset || asset.asset_type !== 'cash' || asset.is_active === false) return { ok: false }

  const existing = await readOwnCompanionId(supabase, userId, asset.id)
  if (existing) return { ok: true, bankAccountId: existing }

  const companionInput = { ...asset, iban: resolveAssetAccountNumber(asset) }
  await syncBankAccountCompanion(supabase, userId, companionInput, true)
  if (asset.has_budget_tracking === false) {
    await syncBankAccountCompanion(supabase, userId, companionInput, false)
  }

  // Herlezen, want `syncBankAccountCompanion` leest de fout van zijn eigen insert
  // niet. Geen rij = de aanmaak is mislukt; dat is een serverfout, geen 400 — het
  // bezit is wél van deze gebruiker.
  const created = await readOwnCompanionId(supabase, userId, asset.id)
  if (!created) throw new Error('companion-rij ontbreekt na aanmaken')
  return { ok: true, bankAccountId: created }
}

async function readOwnCompanionId(
  supabase: SupabaseClient,
  userId: string,
  assetId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('linked_asset_id', assetId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as { id: string } | null)?.id ?? null
}
