import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { decryptField } from '@/lib/crypto/field-encryption'

/**
 * GET /api/own-accounts/settings — bootstrap voor de eigen-rekening-instellingen.
 *
 * Levert in één hop wat de instellingen-sheet bij openen nodig heeft: de
 * geregistreerde regels (`user_own_ibans`) én de eigen bankrekeningen met hun
 * ontsleutelde IBAN, zodat de gebruiker een rekening kan kiezen om de
 * tegenpartijen van te bekijken.
 *
 * ## Waarom een serverroute en niet gewoon een client-read
 *
 * Twee redenen, en de tweede is de harde. (1) De veldencryptie-sleutels zijn
 * server-only, dus `bank_accounts.iban_encrypted` is per definitie niet vanuit een
 * `'use client'`-bestand te lezen. (2) De datapad-conventie (ADR 0058): lezen voor
 * weergave gaat via loader of API, muteren via een route. De vorige beheer-UI in
 * `account-form-modal.tsx` deed allebei rechtstreeks vanuit de browser — dat is
 * precies wat deze route en `POST /api/own-accounts/rules` vervangen.
 *
 * ## Geen `.eq('user_id', …)` op `bank_accounts` — bewust
 *
 * De SELECT-policy is huishoud-verbreed:
 *   (auth.uid() = user_id) OR (ownership = 'shared' AND household_id = user_household_id())
 * Een eigenaarsfilter zou de gezamenlijke huishoudrekening uit de lijst laten
 * vallen, terwijl een overboeking dáárheen wel degelijk een interne verschuiving
 * is. Zie de uitgeschreven redenering in `app/api/own-accounts/ibans/route.ts`.
 * RLS is hier de grens, niet een extra filter.
 *
 * Op `user_own_ibans` filteren we wél op `user_id`: die regels zijn eigen-rij
 * (RLS `auth.uid() = user_id`) en kennen geen huishoud-verbreding.
 */

export interface OwnAccountRule {
  id: string
  matchType: 'iban' | 'name'
  matchValue: string
  label: string | null
}

export interface OwnAccountSettingsAccount {
  id: string
  name: string
  /** Ontsleutelde IBAN; `null` wanneer de rekening er geen heeft. */
  iban: string | null
  isActive: boolean
}

export interface OwnAccountSettingsResponse {
  rules: OwnAccountRule[]
  accounts: OwnAccountSettingsAccount[]
  /** Aantal rekeningen met een gevulde maar onleesbare `iban_encrypted`. */
  unreadable: number
}

export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims) return unauthorized()

    const [rulesRes, accountsRes] = await Promise.all([
      supabase
        .from('user_own_ibans')
        .select('id, match_type, match_value, iban, label')
        .eq('user_id', claims.sub)
        .order('created_at', { ascending: true }),
      supabase
        .from('bank_accounts')
        .select('id, name, iban_encrypted, is_active')
        .order('sort_order'),
    ])

    // Bewust een 500 en geen lege lijst: een mislukte leesronde die als "geen
    // regels" terugkomt zou de sheet leeg tonen, waarna opslaan de bestaande
    // regels lijkt te bevestigen terwijl de gebruiker ze niet eens zag.
    if (rulesRes.error) return serverError(rulesRes.error, 'own-accounts-settings:GET')
    if (accountsRes.error) return serverError(accountsRes.error, 'own-accounts-settings:GET')

    const rules: OwnAccountRule[] = (
      (rulesRes.data ?? []) as {
        id: string
        match_type: string | null
        match_value: string | null
        iban: string | null
        label: string | null
      }[]
    ).map((r): OwnAccountRule => ({
      id: r.id,
      matchType: (r.match_type ?? 'iban').toLowerCase() === 'name' ? 'name' : 'iban',
      // `match_value` is de bron van waarheid; `iban` is de oudere kolom die
      // alleen bij IBAN-regels gevuld is. Val daarop terug zodat regels van vóór
      // de `match_type`-kolom zichtbaar blijven in plaats van als lege rij.
      matchValue: (r.match_value ?? r.iban ?? '').trim(),
      label: r.label,
    })).filter((r) => r.matchValue.length > 0)

    const accounts: OwnAccountSettingsAccount[] = []
    let unreadable = 0
    for (const row of (accountsRes.data ?? []) as {
      id: string
      name: string | null
      iban_encrypted: string | null
      is_active: boolean | null
    }[]) {
      let iban: string | null = null
      try {
        iban = decryptField(row.iban_encrypted)
      } catch {
        // Onleesbaar telt, maar mag de rekening niet uit de keuzelijst houden:
        // zonder IBAN kun je nog steeds prima de tegenpartijen ervan bekijken.
        unreadable++
      }
      accounts.push({
        id: row.id,
        name: row.name ?? 'Rekening',
        iban: iban && iban.trim() ? iban : null,
        isActive: row.is_active !== false,
      })
    }

    if (unreadable > 0) {
      console.error(
        `[own-accounts:settings] ${unreadable} bankrekening(en) met een onleesbare iban_encrypted — ` +
        `die tonen geen IBAN in de keuzelijst`,
      )
    }

    return NextResponse.json({ rules, accounts, unreadable } satisfies OwnAccountSettingsResponse)
  } catch (err) {
    return serverError(err, 'own-accounts-settings:GET')
  }
}
