/**
 * Bewaakt de kolomprojectie van de SECURITY DEFINER-RPC
 * `public.household_partner_items` (migratie
 * 20260802190000_household_partner_items_expliciete_kolomprojectie.sql).
 *
 * WAAROM een test op migratietekst: die functie draait met verhoogde rechten en
 * levert partner-persoonlijke rijen rechtstreeks aan de browser (via
 * `loadPerspectiveData` / `loadPerspectiveTransactions`). Ze deed dat met
 * `to_jsonb(<rij>)` — een wildcard die stilzwijgend met het schema meegroeit en
 * daardoor het plaintext rekeningnummer, de ciphertext én de blind-index-hash
 * van de partner meestuurde. Een nieuwe kolom mag daar nooit vanzelf in vallen;
 * deze test maakt het toevoegen ervan een bewuste, zichtbare keuze.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { ASSET_CLIENT_COLUMN_LIST } from '@/lib/asset-data'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Wijst naar de LAATSTE definitie van de functie, niet naar de eerste. De
 * migratiemap is append-only, dus een herdefinitie (CREATE OR REPLACE) komt in
 * een nieuw bestand; die is wat er straks draait en dus wat deze test moet
 * bewaken. Verplaats deze constante mee zodra de functie opnieuw wordt
 * gedefinieerd — anders keurt de test een definitie goed die niet meer geldt.
 *
 * Historie: 20260802190000 (eerste expliciete projectie, verving to_jsonb),
 * 20260827123000 (M23 — box3_vrijgesteld + box3_vrijstelling_reden erbij).
 */
const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260827123000_household_partner_items_box3_vrijgesteld.sql',
)

// CRLF-veilig: readFileSync + handmatige regeleinde-strip gaat stil kapot op
// een verse Windows-checkout (zie lib/test-utils/read-source.ts).
const raw = readSourceLF(MIGRATION)

/** SQL zonder `--`-commentaar: het motivatieblok noemt de verboden kolomnamen. */
const sql = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

/**
 * Alleen de functiebody. Het `COMMENT ON FUNCTION`-statement erna noemt de
 * verboden tokens bewust in proza ("nooit to_jsonb(rij)"); dat is documentatie,
 * geen projectie, en mag de wildcard-assertions niet vals-groen/rood maken.
 */
const body = (() => {
  const open = sql.indexOf('AS $function$')
  const close = sql.indexOf('$function$;')
  expect(open).toBeGreaterThan(-1)
  expect(close).toBeGreaterThan(open)
  return sql.slice(open, close)
})()

/** De keys uit een `jsonb_build_object`-projectie op alias `x`: `'key', x.col`. */
function projectedKeys(section: string, alias: string): string[] {
  const re = new RegExp(`'([a-z0-9_]+)',\\s*${alias}\\.`, 'g')
  return [...section.matchAll(re)].map((m) => m[1])
}

function section(from: string, to: string): string {
  const start = body.indexOf(from)
  const end = body.indexOf(to)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return body.slice(start, end)
}

describe('household_partner_items — expliciete kolomprojectie', () => {
  it('gebruikt nergens nog een hele-rij-projectie', () => {
    expect(body).not.toMatch(/to_jsonb\s*\(/)
  })

  it('projecteert geen enkele account_number-kolom van de partner', () => {
    // plaintext IBAN, ciphertext én blind index (stabiele correlatiesleutel).
    expect(body).not.toMatch(/account_number/)
  })

  it('assets-projectie is één-op-één ASSET_CLIENT_COLUMNS', () => {
    const keys = projectedKeys(section("p_category = 'assets'", "p_category = 'debts'"), 'a')
    expect([...keys].sort()).toEqual([...ASSET_CLIENT_COLUMN_LIST].sort())
  })

  it('transactions-projectie is de kolomlijst die perspective-loader ook voor eigen rijen vraagt', () => {
    // Spiegelt de `select(...)` in lib/household/perspective-loader.ts; partner-
    // rijen worden in dezelfde array gemengd, dus alles daarbuiten is ongebruikt.
    const expected = [
      'id', 'date', 'amount', 'description', 'counterparty_name', 'counterparty_iban',
      'budget_id', 'account_id', 'is_income', 'transaction_type', 'ownership',
      'user_id', 'is_split',
    ]
    const keys = projectedKeys(section("p_category = 'transactions'", "p_category = 'income'"), 't')
    expect([...keys].sort()).toEqual([...expected].sort())
  })

  it('transactions-projectie bevat geen correlatie-/vrije-tekst-kolommen', () => {
    const txn = section("p_category = 'transactions'", "p_category = 'income'")
    for (const col of [
      'import_hash', 'running_balance', 'bank_code', 'bank_seq', 'creditor_id',
      'linked_transfer_id', 'reference', 'notes', 'fx_amount', 'fx_rate',
      'category_source',
    ]) {
      expect(txn, `transacties-projectie lekt ${col}`).not.toContain(col)
    }
  })

  it('behoudt de privacy-poort en het rechten-model', () => {
    expect(body).toMatch(/get_partner_privacy_level\(v_household, v_partner, v_priv_cat\)/)
    expect(body).toMatch(/IF v_level = 'hidden' THEN RETURN '\[\]'::jsonb; END IF;/)
    expect(sql).toMatch(/SECURITY DEFINER/)
    expect(sql).toMatch(/SET search_path TO 'public'/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.household_partner_items\(text\) FROM anon;/)
  })

  it('laat elke WHERE-clausule op de partner-scope intact', () => {
    // ownership='personal' + is_active/venster — één tikfout hier is een lek.
    expect(
      [...body.matchAll(/user_id = v_partner AND \w+\.ownership = 'personal'/g)].length,
    ).toBe(8) // 4 categorieën × (full + totals)
  })
})
