import { describe, it, expect } from 'vitest'
import {
  ALL_USER_SCOPED_TABLES,
  SESSION_WIPE_TABLES,
  SERVICE_WIPE_TABLES,
  RETENTION_ALLOWLIST,
  FULL_ERASE_SERVICE_TABLES,
  EXPORT_SERVICE_TABLES,
  EXPORT_SESSION_TABLES,
  EXPORT_OWN_READ_EXTRA_TABLES,
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

  /**
   * B-058: de mijlpalenlog moet bij een RESET mee. Blijft hij staan, dan viert de
   * motor na het heronboarden de eerste triviale drempel (`totalDebts === 0` op
   * een net gewist profiel) als verse mijlpaal — de gemelde "je bent
   * schuldenvrij"-melding vlak na de onboarding.
   *
   * SERVICE en niet SESSION: migratie 20260831160000 geeft bewust géén eigen-rij
   * DELETE-policy, dus via de sessie-client zou de wis een STILLE no-op zijn —
   * precies het foutbeeld dat deze partitie moet voorkomen.
   */
  it('de mijlpalenlog wordt bij reset gewist via de service-role, niet via de sessie (B-058)', () => {
    expect(ALL_USER_SCOPED_TABLES).toContain('achieved_milestones')
    expect(SERVICE_WIPE_TABLES).toContain('achieved_milestones')
    expect(SESSION_WIPE_TABLES).not.toContain('achieved_milestones')
    expect(Object.keys(RETENTION_ALLOWLIST)).not.toContain('achieved_milestones')
  })

  /**
   * ADR 0155: het toestemmingsbewijs is eigen-rij LEESBAAR maar niet WISBAAR
   * (append-only). Het valt dus buiten SESSION_WIPE, maar het inzagerecht (art.
   * 15) eist het wél in de export — via de extra eigen-rij-leeslijst, en nooit
   * via de service-role (beheer heeft er geen leespad op).
   */
  it('het toestemmingsbewijs zit in de zelf-export via de sessie, niet via wis of service-role (ADR 0155)', () => {
    expect(EXPORT_OWN_READ_EXTRA_TABLES).toContain('consent_events')
    expect(Object.keys(RETENTION_ALLOWLIST)).toContain('consent_events')
    expect(SESSION_WIPE_TABLES).not.toContain('consent_events')
    expect(EXPORT_SERVICE_TABLES).not.toContain('consent_events')
    // Elke extra-export-tabel staat in de inventaris én is bewust ingedeeld.
    for (const t of EXPORT_OWN_READ_EXTRA_TABLES) {
      expect(ALL_USER_SCOPED_TABLES).toContain(t)
      expect(Object.keys(RETENTION_ALLOWLIST)).toContain(t)
    }
  })

  it('export-lijsten stammen uit dezelfde bron (geen drift wipe↔export)', () => {
    // Gebruikers-export = de sessie-wisbare tabellen (eigen-rij RLS) …
    expect([...EXPORT_SESSION_TABLES]).toEqual([...SESSION_WIPE_TABLES])
    // … plus de service-wisbare tabellen, via de service-role op de eigen id.
    // Samen = álle persoonlijke tabellen: sinds ADR 0146 is er geen admin-export
    // meer die een gat zou dichten.
    expect([...EXPORT_SERVICE_TABLES]).toEqual([...SERVICE_WIPE_TABLES])
  })

  /**
   * ADR 0137: de gespreksgeschiedenis heeft GEEN service-role-leespad. De
   * eigenaar leest haar via de sessie-client in de export; de service-lijst
   * mag haar nooit bevatten, anders spreekt de code de migratiekop tegen.
   */
  it('de gespreksgeschiedenis zit in de export via de sessie, nooit via de service-role (ADR 0137)', () => {
    for (const table of ['chat_conversations', 'chat_messages']) {
      expect(SESSION_WIPE_TABLES).toContain(table)
      expect(EXPORT_SESSION_TABLES).toContain(table)
      expect(EXPORT_SERVICE_TABLES).not.toContain(table)
    }
  })

  /**
   * Security-review B-058 (19-09-2026), gemeten tegen pg_policies: deze tabellen
   * hebben live GEEN eigen-rij DELETE-policy (alleen SELECT/INSERT/UPDATE of
   * minder). Een `delete().eq('user_id', …)` via de sessie-client levert dan 0
   * rijen zonder fout — een stille no-op, exact het B-058-foutbeeld. Ze horen
   * dus in de SERVICE-partitie, nooit in de sessie-partitie. De lijst is een
   * schema-feit, geen keuze: verplaats een tabel pas terug nadat een migratie
   * de DELETE-policy heeft toegevoegd én pg_policies dat bevestigt.
   */
  it('tabellen zonder eigen-rij DELETE-policy staan in de service-partitie, nooit in de sessie (pg_policies 19-09-2026)', () => {
    const geenEigenRijDelete = [
      'next_step_completions',
      'user_feature_visits',
      'achieved_milestones',
      'feedback',
      'user_reports',
      'questionnaire_invitations',
      'user_group_members',
    ]
    for (const t of geenEigenRijDelete) {
      expect(SERVICE_WIPE_TABLES, `${t} hoort in SERVICE_WIPE_TABLES`).toContain(t)
      expect(SESSION_WIPE_TABLES, `${t} mag niet in SESSION_WIPE_TABLES`).not.toContain(t)
    }
  })

  /**
   * Security-review B-058 (19-09-2026), gemeten tegen information_schema: de
   * inventaris was "laatst 08-08-2026" en miste élke user_id-tabel van daarna
   * die niet met de hand vooruit was toegevoegd. Deze drie hebben live een
   * eigen-rij DELETE-policy en horen dus in de sessie-partitie (en daarmee in
   * de zelf-export). `spend_limit_rules` draagt `counterparty_labels` — dezelfde
   * persoonsnaam-mogelijkheid die `spend_limits` in de export bracht.
   */
  it('de inventaris draagt de user_id-tabellen van ná 08-08-2026 (information_schema 19-09-2026)', () => {
    for (const t of ['goal_links', 'import_idempotency', 'spend_limit_rules']) {
      expect(ALL_USER_SCOPED_TABLES, `${t} ontbreekt in de inventaris`).toContain(t)
      expect(SESSION_WIPE_TABLES, `${t} hoort in SESSION_WIPE_TABLES`).toContain(t)
    }
  })

  /**
   * ADR 0173 (Krant 1B fase 2): het nieuwsprofiel is financiële informatie in
   * banden en de schaduweditie draagt gerenderde bedragen over de eigen
   * situatie — persoonsgegevens, dus in de wis én in de zelfexport. De
   * migratie geeft alle drie een eigen-rij DELETE-policy (sessie-partitie);
   * beheer heeft er geen leespad op (ADR 0146), dus nooit via de service-lijst.
   */
  it('de Krant-tabellen (nieuwsprofiel, krant_edities, krant_editie_items) zitten in wis én zelfexport via de sessie (ADR 0173)', () => {
    for (const t of ['nieuwsprofiel', 'krant_edities', 'krant_editie_items']) {
      expect(ALL_USER_SCOPED_TABLES, `${t} ontbreekt in de inventaris`).toContain(t)
      expect(SESSION_WIPE_TABLES, `${t} hoort in SESSION_WIPE_TABLES`).toContain(t)
      expect(EXPORT_SESSION_TABLES, `${t} hoort in de zelfexport`).toContain(t)
      expect(EXPORT_SERVICE_TABLES, `${t} mag niet via de service-role`).not.toContain(t)
    }
  })
})
