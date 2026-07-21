import { describe, it, expect } from 'vitest'
import {
  ALL_USER_SCOPED_TABLES,
  SESSION_WIPE_TABLES,
  SERVICE_WIPE_TABLES,
  RETENTION_ALLOWLIST,
  FULL_ERASE_SERVICE_TABLES,
  ADMIN_EXPORT_TABLES,
  EXPORT_SESSION_TABLES,
} from './user-data-tables'

/**
 * [Arch F3] Recht 2 — dekkingsgarantie voor het AVG-datamodel (ADR 0059).
 *
 * Kern van "afmaken": élke public-tabel met een `user_id`-kolom
 * ({@link ALL_USER_SCOPED_TABLES}, de schema-inventaris) valt in PRECIES ÉÉN
 * partitie — wissen via sessie (SESSION_WIPE), wissen via service-role
 * (SERVICE_WIPE) of bewust behouden met retentie (RETENTION_ALLOWLIST). Zo faalt
 * deze test zodra iemand een nieuwe user-scoped tabel toevoegt zonder een
 * expliciete wis-/bewaarbeslissing — precies de drift die dit dossier blootlegde.
 *
 * De inventaris is een schema-fixture (geverifieerd tegen information_schema op
 * 2026-07-21). Regenereer 'm via de SQL in de header van lib/user-data-tables.ts
 * wanneer een migratie een user_id-tabel toevoegt/verwijdert.
 */
describe('user-data-tables — AVG-partitie dekt de volledige schema-inventaris', () => {
  const retentionKeys = Object.keys(RETENTION_ALLOWLIST)

  it('geen duplicaten binnen een partitie', () => {
    for (const [name, list] of [
      ['SESSION_WIPE_TABLES', SESSION_WIPE_TABLES],
      ['SERVICE_WIPE_TABLES', SERVICE_WIPE_TABLES],
      ['RETENTION_ALLOWLIST', retentionKeys],
      ['ALL_USER_SCOPED_TABLES', ALL_USER_SCOPED_TABLES],
    ] as const) {
      expect(new Set(list).size, `${name} bevat duplicaten`).toBe(list.length)
    }
  })

  it('de drie partities zijn onderling disjunct', () => {
    const session = new Set(SESSION_WIPE_TABLES)
    const service = new Set(SERVICE_WIPE_TABLES)
    const retention = new Set(retentionKeys)
    for (const t of session) {
      expect(service.has(t), `${t} in SESSION én SERVICE`).toBe(false)
      expect(retention.has(t), `${t} in SESSION én RETENTION`).toBe(false)
    }
    for (const t of service) {
      expect(retention.has(t), `${t} in SERVICE én RETENTION`).toBe(false)
    }
  })

  it('elke user-scoped tabel valt in precies één partitie (geen gat)', () => {
    const covered = new Set<string>([
      ...SESSION_WIPE_TABLES,
      ...SERVICE_WIPE_TABLES,
      ...retentionKeys,
    ])
    for (const table of ALL_USER_SCOPED_TABLES) {
      expect(covered.has(table), `Ongeadresseerde user-scoped tabel: ${table}`).toBe(true)
    }
  })

  it('geen partitie-tabel valt buiten de schema-inventaris (geen typo/dode entry)', () => {
    const inventory = new Set(ALL_USER_SCOPED_TABLES)
    for (const table of [...SESSION_WIPE_TABLES, ...SERVICE_WIPE_TABLES, ...retentionKeys]) {
      expect(inventory.has(table), `${table} staat niet in ALL_USER_SCOPED_TABLES`).toBe(true)
    }
  })

  it('de partitie-som telt exact op tot de inventaris', () => {
    expect(SESSION_WIPE_TABLES.length + SERVICE_WIPE_TABLES.length + retentionKeys.length).toBe(
      ALL_USER_SCOPED_TABLES.length,
    )
  })

  it('full-erase omvat alle service-wipe-tabellen (orphan-preventie bij delete)', () => {
    for (const t of SERVICE_WIPE_TABLES) {
      expect(FULL_ERASE_SERVICE_TABLES).toContain(t)
    }
  })

  it('export-lijsten stammen uit dezelfde bron (geen drift wipe↔export)', () => {
    // Gebruikers-export = de sessie-wisbare tabellen.
    expect([...EXPORT_SESSION_TABLES]).toEqual([...SESSION_WIPE_TABLES])
    // Admin-export = alle persoonlijke tabellen (sessie + service).
    expect(ADMIN_EXPORT_TABLES).toEqual([...SESSION_WIPE_TABLES, ...SERVICE_WIPE_TABLES])
  })
})
