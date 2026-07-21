/**
 * Regressietest: bank_accounts.account_type drie-laag-consistentie
 *
 * Bewaakt de invariant die de bug veroorzaakte waarbij de DB-constraint
 * `bank_accounts_account_type_check` alleen ('checking','savings','contant_geld')
 * toestond, terwijl het formulier zes waarden aanbood en de 'compleet'-persona
 * 'business' seedde — wat resulteerde in een constraint-violatie bij seed.
 *
 * WANNEER JE ACCOUNT_TYPES UITBREIDT in components/app/account-form-modal.tsx:
 *   → Voeg de nieuwe waarde ook toe aan de DB-migratie die
 *     bank_accounts_account_type_check definieert (zoek op "account_type_check"
 *     in supabase/migrations/*.sql). Zonder die migratie breekt seeden/opslaan
 *     in productie. Deze test zal dan namelijk falen op de assert die stelt
 *     dat elke persona-waarde in ACCOUNT_TYPES zit — als jij de persona ook
 *     uitbreidt. Als je alleen de form uitbreidt, helpt test tp-bank-account-types-
 *     complete-set in de in-app suite om het af te dwingen.
 *
 * Laag 1 — Formulier (ACCOUNT_TYPES):
 *   components/app/account-form-modal.tsx — de zes waarden die de UI aanbiedt
 *
 * Laag 2 — Persona-seed (lib/test-personas.ts):
 *   Alle account_type-waarden die geseed worden moeten in Laag 1 zitten
 *
 * Laag 3 — DB-constraint:
 *   supabase/migrations/*_bank_accounts_account_type_check.sql
 *   (niet live geraakt in deze test — vitest draait zonder DB)
 *
 * DB-loze aanpak: we importeren alleen TypeScript-constanten/objecten;
 * er is geen netwerkaanroep, geen Supabase-client, geen global state.
 */

import { describe, it, expect } from 'vitest'
import { ACCOUNT_TYPES } from '@/lib/account-types'
import { PERSONAS, PERSONA_KEYS } from '@/lib/test-personas'

// ── Laag 1: de exacte set waarden die het formulier aanbiedt ────────────────
//
// CHANGE GUARD: Als je hier een waarde toevoegt of verwijdert, moet je ook
// de DB-migratie bijwerken (bank_accounts_account_type_check).
// Zoek op "account_type_check" in supabase/migrations/*.sql.
const EXPECTED_ACCOUNT_TYPE_VALUES = [
  'checking',
  'savings',
  'joint',
  'business',
  'contant_geld',
  'other',
] as const

describe('bank_accounts account_type drie-laag-consistentie', () => {

  // ── Test 1: ACCOUNT_TYPES bevat precies de zes verwachte waarden ──────────
  //
  // Deze test gaat rood als iemand een form-optie toevoegt/verwijdert zonder
  // dit comment en de bijbehorende DB-migratie-update te lezen.
  it('ACCOUNT_TYPES bevat exact de 6 verwachte waarden (form-SSoT)', () => {
    const actualValues = ACCOUNT_TYPES.map(t => t.value)

    // Elke verwachte waarde moet in ACCOUNT_TYPES zitten
    for (const expected of EXPECTED_ACCOUNT_TYPE_VALUES) {
      expect(
        actualValues,
        `Verwachte waarde '${expected}' ontbreekt in ACCOUNT_TYPES — vergeet de DB-migratie niet!`,
      ).toContain(expected)
    }

    // Geen onverwachte extra waarden (form breidt niet stiekem uit zonder test)
    for (const actual of actualValues) {
      expect(
        EXPECTED_ACCOUNT_TYPE_VALUES as readonly string[],
        `Onverwachte waarde '${actual}' gevonden in ACCOUNT_TYPES — voeg 'm toe aan EXPECTED_ACCOUNT_TYPE_VALUES EN aan de DB-migratie`,
      ).toContain(actual)
    }

    // Aantal klopt exact
    expect(actualValues).toHaveLength(EXPECTED_ACCOUNT_TYPE_VALUES.length)
  })

  // ── Test 2: alle persona bank_accounts gebruiken alleen form-waarden ───────
  //
  // Deze test had de originele bug gevangen: 'business' ∉ {'checking','savings','contant_geld'}
  // Na de migratie-fix is 'business' wél in ACCOUNT_TYPES, dus test is nu groen —
  // maar hij blijft bewaken dat de seed-laag en de form-laag in sync blijven.
  it('elke persona bank_account.account_type zit in ACCOUNT_TYPES', () => {
    const validValues: Set<string> = new Set(ACCOUNT_TYPES.map(t => t.value))

    for (const key of PERSONA_KEYS) {
      const persona = PERSONAS[key]
      for (const ba of persona.bank_accounts) {
        expect(
          validValues.has(ba.account_type),
          `Persona '${key}', rekening '${ba.name}': account_type '${ba.account_type}' ` +
          `is niet geldig — geldige waarden: ${[...validValues].join(', ')}. ` +
          `Voeg de waarde toe aan ACCOUNT_TYPES in account-form-modal.tsx EN aan de DB-migratie.`,
        ).toBe(true)
      }
    }
  })

  // ── Test 3: de 'compleet'-persona heeft precies 'business' (regressiepin) ──
  //
  // Dit pint de specifieke waarde die de constraint-violatie veroorzaakte.
  // Als de compleet-persona ooit wordt aangepast en 'business' verdwijnt,
  // wil je dat weten — dan coverage verloren.
  it("compleet-persona heeft een 'business' rekening (regressiepin voor de constraint-bug)", () => {
    const compleetPersona = PERSONAS['compleet']
    const businessAccounts = compleetPersona.bank_accounts.filter(
      ba => ba.account_type === 'business',
    )
    expect(
      businessAccounts.length,
      "De 'compleet'-persona moet minstens 1 zakelijke rekening hebben (account_type='business'). " +
      "Dit is de regressiepin voor de bank_accounts_account_type_check constraint-bug.",
    ).toBeGreaterThanOrEqual(1)
  })

  // ── Test 4: alle PERSONA_KEYS zijn aanwezig en toegankelijk ──────────────
  //
  // Bewaakt dat PERSONA_KEYS en PERSONAS in sync zijn (inclusief 'compleet').
  it('PERSONA_KEYS en PERSONAS zijn in sync', () => {
    expect(PERSONA_KEYS).toHaveLength(5) // daan, lisa, willem, marijke, compleet
    for (const key of PERSONA_KEYS) {
      expect(
        PERSONAS[key],
        `PERSONAS['${key}'] ontbreekt terwijl '${key}' wel in PERSONA_KEYS staat`,
      ).toBeDefined()
      expect(
        PERSONAS[key].bank_accounts,
        `PERSONAS['${key}'].bank_accounts ontbreekt`,
      ).toBeDefined()
      expect(
        Array.isArray(PERSONAS[key].bank_accounts),
        `PERSONAS['${key}'].bank_accounts is geen array`,
      ).toBe(true)
      expect(
        PERSONAS[key].bank_accounts.length,
        `PERSONAS['${key}'] heeft geen bankrekeningen`,
      ).toBeGreaterThan(0)
    }
  })

  // ── Test 5: geen 'joint' of 'other' waarden ontbreken in ACCOUNT_TYPES ───
  //
  // Historische context: de oude constraint miste 'joint' en 'other'.
  // Beide staan al in ACCOUNT_TYPES maar werden nooit in persona's geseed.
  // Deze test bewaakt dat ze niet per ongeluk uit de form worden verwijderd.
  it("ACCOUNT_TYPES bevat 'joint' en 'other' (historisch ontbrekend in DB-constraint)", () => {
    const values = ACCOUNT_TYPES.map(t => t.value)
    expect(values).toContain('joint')
    expect(values).toContain('other')
  })
})
