import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { deriveBankLinkHealth } from '@/lib/bank-connection-status'
import { decryptIbanForLabel } from '@/lib/truelayer/cash-asset-backfill'
import { ibanTail, type LinkedAccountView } from '@/lib/truelayer/linked-account'
import { loadBankSyncBalanceChanges } from '@/lib/truelayer/balance-valuation'

/**
 * GET /api/bank-connect/linked-accounts — de actieve koppelingen, mét de
 * TriFinity-rekening die ze draagt.
 *
 * ## Waarom deze route bestaat
 *
 * De success-pagina las dit tot fase 5 client-direct met de browser-client
 * (grandfather-entry in `scripts/check-client-data-reads.mjs`). Het
 * correctiemoment heeft er een tweede tabel bij nodig — welke `bank_accounts`-rij
 * draagt deze koppeling — en dat is precies het moment om die read niet te
 * verbreden maar te verhuizen (ADR 0058). De allowlist-entry is daarmee
 * vervallen: entries verwijderen mag, toevoegen niet.
 *
 * ## Wat er bewust NIET uit komt
 *
 * De volledige IBAN. De pagina toonde 'm eerder onverkort; hier verlaat alleen de
 * laatste vier tekens de server — gelijk aan `TargetAccountOption.iban_tail` in de
 * wizard. Genoeg om een rekening te herkennen, en één plek minder waar een IBAN
 * in een clientbundel of screenshot belandt.
 *
 * ## Het OORDEEL komt uit de server, niet uit de vier rauwe signalen (fase 7)
 *
 * `health` wordt hier afgeleid met `deriveBankLinkHealth` uit
 * `lib/bank-connection-status.ts` — de ENE afleiding, dezelfde die
 * `lib/bank-link-loader.ts` voor de cash-oppervlakken gebruikt. Zou deze route de
 * vier signalen rauw doorgeven, dan deed élke consumer de afleiding opnieuw en kon
 * de success-pagina iets anders zeggen dan de rekeningkaart ("consume, don't
 * recompute").
 *
 * `last_synced_at` blijft er daarnáást als los veld staan, en dat is geen
 * dubbelop: dat veld is de GATE van het correctiemoment (`relink` weigert ná de
 * eerste sync) en bestaande consumers hangen eraan. Het reist óók mee ín `health`,
 * zodat de versheidstekst uit hetzelfde object komt.
 */

/**
 * Bovengrens op de leesronde. Het aantal actieve koppelingen wordt door de banken
 * bepaald, niet door ons; een pagina die er honderd zou tonen is als UI toch
 * onbruikbaar. De ordening is deterministisch, dus de afkap is stabiel.
 */
const MAX_LINKED_ACCOUNTS = 100

type CarrierRow = {
  name: string | null
  iban: string | null
  iban_encrypted: string | null
  /** De cash-bezitting waarop de banksync het saldo herwaardeert (fase 8). */
  linked_asset_id: string | null
}

/** De verbindingsvelden die {@link deriveBankLinkHealth} als signaal 2 en 3 leest. */
type ConnectionRow = {
  provider_name: string | null
  provider_logo: string | null
  provider_id: string | null
  status: string | null
  token_expires_at: string | null
}

type LinkRow = {
  id: string
  account_name: string | null
  iban: string | null
  iban_encrypted: string | null
  bank_account_id: string | null
  /** Signaal 1 van de gezondheidsafleiding — zie de noot bij de mapping. */
  is_active: boolean | null
  last_synced_at: string | null
  bank_connections: ConnectionRow | ConnectionRow[] | null
  bank_accounts: CarrierRow | CarrierRow[] | null
}

/** PostgREST levert een to-one embed soms als array (afhankelijk van de relatie-inferentie). */
function one<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  try {
    // `user_id` expliciet naast de eigen-rij-RLS op `bank_connection_accounts`:
    // zelfde leesbaarheidsregel als in de andere bank-connect-routes, en de
    // embedded `bank_accounts` valt onder een BREDERE policy (huishoud-gedeelde
    // partnerrijen komen daar wél door) — de koppeling zelf is dus de scope.
    const { data, error } = await supabase
      .from('bank_connection_accounts')
      // `bank_accounts.iban_encrypted` staat er bewust bij, niet alleen de
      // plaintext-kolom: Stage B dropt `bank_accounts.iban` (zie de noot in
      // `cash-asset-backfill.ts`), en dan zou deze GET 500'en en de
      // success-pagina haar hele correctiemoment verliezen.
      // `is_active`, `status` en `token_expires_at` staan er sinds fase 7 bij: dat
      // zijn drie van de vier signalen die `deriveBankLinkHealth` nodig heeft (het
      // vierde, `last_synced_at`, stond er al). `provider_id` is de bank waarmee
      // het herstelpad opnieuw autoriseert.
      .select(
        'id, account_name, iban, iban_encrypted, bank_account_id, is_active, last_synced_at, bank_connections(provider_name, provider_logo, provider_id, status, token_expires_at), bank_accounts(name, iban, iban_encrypted, linked_asset_id)',
      )
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(MAX_LINKED_ACCOUNTS)

    if (error) return serverError(error, 'bankconnect-linked-accounts:GET')

    const rows = (data ?? []) as unknown as LinkRow[]

    // Eén leesronde over het grootboek voor álle dragers samen — geen N+1. De
    // banksync-waardering van vandaag is de bron van de saldomelding op de
    // success-pagina; de helper filtert zelf op de banksync-notitie, zodat een
    // handmatige herwaardering van vandaag hier nooit als "overgenomen van de
    // bank" leest.
    const carrierAssetIds = Array.from(
      new Set(
        rows
          .map((row) => one(row.bank_accounts)?.linked_asset_id ?? null)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const balanceChanges = await loadBankSyncBalanceChanges(supabase, {
      userId: user.id,
      assetIds: carrierAssetIds,
    })

    const accounts: LinkedAccountView[] = rows.map((row) => {
      const connection = one(row.bank_connections)
      const carrier = one(row.bank_accounts)
      // `iban_encrypted` eerst: Stage B dropt de plaintext-kolommen, en
      // `decryptIbanForLabel` slikt een niet-gebackfillde legacy-ciphertext in
      // plaats van deze route te laten vallen op één rommelige rij.
      const iban = decryptIbanForLabel(row.iban_encrypted) ?? row.iban
      const carrierIban = decryptIbanForLabel(carrier?.iban_encrypted ?? null) ?? carrier?.iban ?? null

      return {
        id: row.id,
        account_name: row.account_name,
        iban_tail: ibanTail(iban),
        provider_name: connection?.provider_name ?? null,
        provider_logo: connection?.provider_logo ?? null,
        provider_id: connection?.provider_id ?? null,
        // Het SIGNAAL gaat naar de afleiding, niet de uitkomst. De query filtert
        // hierboven op `is_active = true`, dus dit is vandaag altijd `true` — maar
        // `state: 'linked'` hier hardcoderen zou de regel verdubbelen én stil
        // verkeerd worden als die filter ooit verdwijnt (bv. wanneer de pagina óók
        // zacht ontkoppelde rijen wil tonen). Eén eigenaar van de regel:
        // `deriveBankLinkHealth`.
        health: deriveBankLinkHealth({
          linkIsActive: row.is_active !== false,
          connectionStatus: connection?.status ?? null,
          tokenExpiresAt: connection?.token_expires_at ?? null,
          lastSyncedAt: row.last_synced_at,
        }),
        bank_account_id: row.bank_account_id,
        carrier_name: carrier?.name ?? null,
        carrier_iban_tail: ibanTail(carrierIban),
        last_synced_at: row.last_synced_at,
        balance_change: carrier?.linked_asset_id
          ? balanceChanges.get(carrier.linked_asset_id) ?? null
          : null,
      }
    })

    return NextResponse.json({ accounts })
  } catch (err) {
    return serverError(err, 'bankconnect-linked-accounts:GET')
  }
}
