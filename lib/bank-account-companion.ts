import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * De cash-asset-velden die nodig zijn om een gekoppelde `bank_accounts`-rij
 * (companion) op te bouwen. Bewust een smalle vorm zodat elk schrijfpad exact
 * dezelfde bron van waarheid gebruikt.
 */
export interface CompanionAssetInput {
  id: string
  name: string
  /**
   * IBAN/rekeningnummer. LET OP: de bron op `assets` is de kolom
   * `account_number` — er bestaat GÉÉN `assets.iban`. Selecteer 'm daarom via
   * PostgREST-alias (`iban:account_number`) of map 'm expliciet. Dit veld mapt
   * naar `bank_accounts.iban` op de companion-rij.
   */
  iban: string | null
  institution: string | null
  subtype: string | null
  ownership: string | null
  household_id: string | null
  current_value: number | string | null
}

/**
 * Synchroniseert de gekoppelde `bank_accounts`-rij (companion) voor één
 * cash-asset op basis van de budgetteren-vlag.
 *
 * Waarom: er zijn twee schrijfpaden voor dezelfde conceptuele toggle
 * ("gebruik deze rekening voor budgetteren & transacties") — het volledige
 * bewerkscherm (assets-client) én de Budgetteren-setupwizard
 * (/api/budgetteren/setup). Alleen het bewerkscherm maakte de companion-rij
 * aan, waardoor een via de wizard aangevinkte rekening onzichtbaar bleef op
 * /core/cash/import (die haalt haar lijst uitsluitend uit `bank_accounts`).
 * Deze helper is de ene gedeelde plek — analoog aan {@link syncBudgetingActive} —
 * zodat de twee vlaggen (assets.has_budget_tracking ↔ bank_accounts-companion)
 * nooit meer uiteenlopen.
 *
 * Idempotent: dekt zowel create als update, en ruimt de companion netjes op bij
 * uitzetten (verwijderen als er nog geen transacties zijn, anders alleen
 * ontkoppelen zodat historische transacties behouden blijven).
 *
 * @param enabled  `true` = rekening volgt budgetteren/transacties (companion
 *                 aan/bijwerken); `false` = uit (companion opruimen).
 */
export async function syncBankAccountCompanion(
  supabase: SupabaseClient,
  userId: string,
  asset: CompanionAssetInput,
  enabled: boolean,
): Promise<void> {
  const { data: existingBA } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('linked_asset_id', asset.id)
    .maybeSingle()

  if (enabled) {
    const fields = {
      name: asset.name,
      iban: asset.iban || null,
      bank_name: asset.institution || null,
      account_type: asset.subtype || 'checking',
      balance: Number(asset.current_value) || 0,
      // Sync eigendom mee: een eigendomswijziging op het cash-bezit moet
      // doorwerken naar de gekoppelde bankrekening (DB-trigger herstempelt
      // household_id).
      ownership: asset.ownership ?? 'personal',
    }

    if (!existingBA) {
      await supabase.from('bank_accounts').insert({
        user_id: userId,
        linked_asset_id: asset.id,
        household_id: asset.ownership === 'shared' ? asset.household_id : null,
        ...fields,
      })
    } else {
      // is_active meenemen zodat een eerder gedeactiveerde companion weer
      // opduikt in de import-lijst bij opnieuw aanzetten.
      await supabase
        .from('bank_accounts')
        .update({ ...fields, is_active: true })
        .eq('id', existingBA.id)
    }
    return
  }

  // Uitzetten: companion opruimen. Behoud historische transacties.
  if (existingBA) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', existingBA.id)

    if (count === 0) {
      await supabase.from('bank_accounts').delete().eq('id', existingBA.id)
    } else {
      await supabase
        .from('bank_accounts')
        .update({ linked_asset_id: null })
        .eq('id', existingBA.id)
    }
  }
}
