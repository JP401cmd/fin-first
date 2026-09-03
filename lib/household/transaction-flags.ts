// lib/household/transaction-flags.ts
//
// Partner-samenwerking fase 1 — "Te bespreken": gedeelde boekingen die een
// van beide partners heeft gemarkeerd om samen te bespreken (ADR 0128).
//
// SERVER-LOADER (ADR 0058): de pagina laadt dit en geeft het als props door;
// het client-component haalt zelf niets op om te tonen. Muteren loopt via
// /api/transaction-flags, waarna `router.refresh()` deze loader opnieuw draait.
//
// ZICHTBAARHEID: hier wordt niets gefilterd op privacy — dat doet de RLS op
// `transaction_flags` (erft de SELECT-policy van `transactions`, incl.
// partner_visibility). Deze loader vertrouwt daarop en voegt alleen samen.
//
// BUITEN DE AI-CONTEXT (K3): niets uit dit bestand wordt door een
// context-builder geconsumeerd; de notitie kan PII bevatten.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PerspectiveContext } from './perspective-loader'

export type TransactionFlagStatus = 'open' | 'resolved'

/** Rij zoals hij uit `transaction_flags` komt (expliciete kolomlijst). */
export interface TransactionFlagRow {
  id: string
  transaction_id: string
  household_id: string
  flagged_by: string
  status: TransactionFlagStatus
  note: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

/** De boeking waar de vlag op staat — alleen de velden die de lijst toont. */
export interface FlaggedTransaction {
  id: string
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  account_id: string
}

export interface TransactionFlagItem {
  id: string
  transactionId: string
  status: TransactionFlagStatus
  note: string | null
  createdAt: string
  /** Heeft de huidige gebruiker deze vlag zelf gezet? Bepaalt "intrekken". */
  flaggedByMe: boolean
  /** Weergavenaam van de melder: "jij" of de partnernaam. */
  flaggedByLabel: string
  transaction: FlaggedTransaction
}

export interface TransactionFlagsData {
  partnerName: string | null
  /** Open vlaggen, nieuwste eerst. */
  open: TransactionFlagItem[]
  /** Aantal afgeronde vlaggen (alleen de teller — de lijst toont ze niet). */
  resolvedCount: number
}

/** Spiegelt de CHECK `transaction_flags_note_length` (500 tekens). */
export const TRANSACTION_FLAG_NOTE_MAX = 500

export const TRANSACTION_FLAG_COLUMNS =
  'id, transaction_id, household_id, flagged_by, status, note, resolved_by, resolved_at, created_at'

/**
 * Expliciete kolomlijst op `transactions` — geen `select('*')`. Deelverzameling
 * van de 13-velden-lijst die perspective-loader al ophaalt; bewust zonder
 * `notes`, `counterparty_iban` en de import-/fx-metadata: de lijst toont ze niet.
 */
export const FLAGGED_TRANSACTION_COLUMNS =
  'id, date, amount, description, counterparty_name, account_id'

/**
 * Bovengrens op het aantal opgehaalde vlaggen. Vlaggen zijn een gesprekslijst,
 * geen archief; ver onder de PostgREST-cap zodat de lijst nooit stil afkapt.
 */
export const TRANSACTION_FLAGS_LIMIT = 200

export const EMPTY_TRANSACTION_FLAGS: TransactionFlagsData = {
  partnerName: null,
  open: [],
  resolvedCount: 0,
}

/** Label van de melder vanuit de huidige gebruiker gezien. */
export function flaggedByLabel(
  flaggedBy: string,
  ctx: Pick<PerspectiveContext, 'userId' | 'partnerName'>,
): string {
  if (flaggedBy === ctx.userId) return 'jij'
  return ctx.partnerName ?? 'je partner'
}

/**
 * Laadt de "te bespreken"-lijst van het huishouden van de huidige gebruiker.
 * Solo (geen partner) → `null`: het oppervlak rendert dan helemaal niet.
 *
 * Twee queries, beide onder RLS: de vlaggen van het huishouden en daarna de
 * bijbehorende boekingen. Een vlag waarvan de boeking niet terugkomt wordt
 * overgeslagen — de policy sluit dat al uit, maar tussen twee queries kan een
 * rekening van zichtbaarheid wisselen; dan liever één rij minder dan een vlag
 * zonder boeking.
 *
 * DEGRADEERT, GOOIT NIET: een DB-fout (bv. de tabel bestaat nog niet omdat de
 * migratie na de deploy komt) wordt server-side gelogd en levert `null` — de
 * sectie verdwijnt dan, maar de transactiepagina zelf blijft werken. Een
 * bijzaak mag het hoofdoppervlak nooit onderuit halen.
 */
export async function loadTransactionFlags(
  supabase: SupabaseClient,
  ctx: PerspectiveContext,
): Promise<TransactionFlagsData | null> {
  if (!ctx.hasHousehold || !ctx.householdId) return null

  const { data: flagRows, error: flagError } = await supabase
    .from('transaction_flags')
    .select(TRANSACTION_FLAG_COLUMNS)
    .eq('household_id', ctx.householdId)
    .order('created_at', { ascending: false })
    .limit(TRANSACTION_FLAGS_LIMIT)

  if (flagError) {
    console.error('[transaction-flags:load] vlaggen laden mislukt:', flagError.message)
    return null
  }

  const flags = (flagRows ?? []) as TransactionFlagRow[]
  const openFlags = flags.filter((f) => f.status === 'open')
  const resolvedCount = flags.length - openFlags.length

  if (openFlags.length === 0) {
    return { partnerName: ctx.partnerName, open: [], resolvedCount }
  }

  const { data: txRows, error: txError } = await supabase
    .from('transactions')
    .select(FLAGGED_TRANSACTION_COLUMNS)
    .in(
      'id',
      openFlags.map((f) => f.transaction_id),
    )

  if (txError) {
    console.error('[transaction-flags:load] gemarkeerde boekingen laden mislukt:', txError.message)
    return null
  }

  const txById = new Map<string, FlaggedTransaction>()
  for (const row of (txRows ?? []) as Array<Record<string, unknown>>) {
    txById.set(row.id as string, {
      id: row.id as string,
      date: row.date as string,
      amount: Number(row.amount) || 0,
      description: (row.description as string) ?? '',
      counterparty_name: (row.counterparty_name as string | null) ?? null,
      account_id: row.account_id as string,
    })
  }

  return {
    partnerName: ctx.partnerName,
    open: composeFlagItems(openFlags, txById, ctx),
    resolvedCount,
  }
}

/** Pure samenvoeging — apart zodat de vorm zonder Supabase te testen is. */
export function composeFlagItems(
  flags: TransactionFlagRow[],
  txById: Map<string, FlaggedTransaction>,
  ctx: Pick<PerspectiveContext, 'userId' | 'partnerName'>,
): TransactionFlagItem[] {
  const items: TransactionFlagItem[] = []
  for (const flag of flags) {
    const transaction = txById.get(flag.transaction_id)
    if (!transaction) continue
    items.push({
      id: flag.id,
      transactionId: flag.transaction_id,
      status: flag.status,
      note: flag.note,
      createdAt: flag.created_at,
      flaggedByMe: flag.flagged_by === ctx.userId,
      flaggedByLabel: flaggedByLabel(flag.flagged_by, ctx),
      transaction,
    })
  }
  return items
}
