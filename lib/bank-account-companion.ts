import type { SupabaseClient } from '@supabase/supabase-js'
import { cashSubtypeToAccountType } from './account-types'

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
 * Idempotent: dekt zowel create als update, en **deactiveert** de companion bij
 * uitzetten — nooit verwijderen, nooit ontkoppelen (zie de invarianten bij de
 * uitzet-tak hieronder).
 *
 * @param enabled  `true` = rekening volgt budgetteren/transacties (companion
 *                 aan/bijwerken); `false` = uit (companion deactiveren).
 */
export async function syncBankAccountCompanion(
  supabase: SupabaseClient,
  userId: string,
  asset: CompanionAssetInput,
  enabled: boolean,
): Promise<void> {
  // `user_id` is hier een EIGENAARSCHAPSCONTROLE, geen dubbelop. `linked_asset_id`
  // is globaal UNIQUE en de SELECT-policy op `bank_accounts` laat huishoud-gedeelde
  // partnerrijen door: zonder deze filter kan een partnerrij (met `linked_asset_id`
  // naar dít bezit) als "de bestaande companion" worden gelezen, waarna de update
  // door de eigen-rij UPDATE-policy wordt geweigerd én de insert op de UNIQUE
  // afketst — de budgetteringskeuze doet dan stil niets. Zelfde redenering als
  // `loadTargetAccount` in `lib/truelayer/target-account.ts`.
  const { data: existingBA } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('linked_asset_id', asset.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (enabled) {
    const fields = {
      name: asset.name,
      iban: asset.iban || null,
      bank_name: asset.institution || null,
      // Twee woordenlijsten, één brug: `assets.subtype` kent 'savings_account'
      // en 'other_cash', maar de CHECK-constraint op `bank_accounts.account_type`
      // niet. Rauw doorschrijven liet deze write stuklopen op de constraint —
      // stil, want de fout wordt hier niet gelezen, dus de budgetteringskeuze
      // deed dan niets. Zie de noot bij `cashSubtypeToAccountType`.
      account_type: cashSubtypeToAccountType(asset.subtype),
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

  // Uitzetten: companion DEACTIVEREN — niet verwijderen, niet ontkoppelen.
  //
  // Deze helper bezit één as: budgettering. Bezitting is `assets.is_active`,
  // bankkoppeling is `bank_connection_accounts.is_active` + `bank_connections.
  // status`. Daaruit volgen twee harde invarianten die de vorige implementatie
  // allebei brak (besluit B1b):
  //
  //  1. `bank_accounts` is de identiteitsrij en wordt nooit verwijderd.
  //     `bank_connection_accounts.bank_account_id` verwijst ernaar met ON
  //     DELETE NO ACTION, dus de delete faalde zodra er ooit een bankkoppeling
  //     op zat — terwijl `assets.has_budget_tracking` al weggeschreven was:
  //     een half toegepaste mutatie zonder foutmelding.
  //  2. `linked_asset_id` (UNIQUE) is een permanente 1-op-1-binding en wordt
  //     nooit genuld. Meerdere surfaces lezen "losse" rekeningen als
  //     `is_active AND linked_asset_id IS NULL` en tellen dat saldo BOVENOP de
  //     cash-asset (horizon-client, what-if, check-in) — nullen betekende dus
  //     dubbel geteld vermogen. En de bank-callback las een lege
  //     linked_asset_id als "nog geen asset" en maakte er een tweede bij.
  //
  // `is_active = false` is wél de juiste uitdrukking van de budgetteringskeuze:
  // precies de surfaces die boekingen voeden (/core/cash, /core/cash/import)
  // filteren op `bank_accounts.is_active`. De aan-tak hierboven reactiveert de
  // rij weer; transacties blijven onaangeroerd bewaard.
  if (existingBA) {
    await supabase
      .from('bank_accounts')
      .update({ is_active: false })
      .eq('id', existingBA.id)
  }
}
