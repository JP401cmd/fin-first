/**
 * Regressietest — geen client-side seedpad meer in budgets-client.tsx.
 *
 * `seedBudgets()` deed vanuit `loadBudgets()` een
 * `.from('budgets').upsert(..., { onConflict: 'user_id, slug' })` zodra de
 * gebruiker 0 budgetten had. Die kolomcombinatie bestaat niet als unieke
 * sleutel meer (migratie 20260319000001 verving 'm door een EXPRESSIE-index),
 * en PostgREST's `on_conflict` accepteert alleen kolomlijsten → structurele
 * 42P10/400. Bovendien was `loadBudgets ⇄ seedBudgets` een onbegrensde
 * wederzijdse recursie zolang de pagina open stond.
 *
 * Budgetten worden nu uitsluitend server-side aangemaakt
 * (`app/api/budgetteren/setup/route.ts`,
 * `app/api/onboarding/save-own-data/route.ts`,
 * `components/app/module-activation-modal.tsx`) — allemaal met plain
 * `insert`. Deze test pint de AFWEZIGHEID van het client-side seedpad.
 *
 * `budgets-client.tsx` is >5000 regels met zware Supabase-effects; de
 * bestaande `budgets-client.test.tsx` documenteert al dat volledig
 * mounten in jsdom onevenredig is. Deze test scant daarom de bron —
 * zelfde aanpak als `lib/ai/privacy-gate-scan.test.ts` /
 * `scripts/check-client-data-reads.mjs`.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SOURCE_PATH = path.join(process.cwd(), 'components', 'app', 'budgets-client.tsx')
const source = fs.readFileSync(SOURCE_PATH, 'utf-8')

describe('budgets-client.tsx — geen client-side seedpad (regressie)', () => {
  it('bevat geen seedBudgets-functie of -aanroep meer', () => {
    expect(source).not.toMatch(/seedBudgets/)
  })

  it('bevat geen upsert op tabel `budgets` (de bron van de 42P10/400)', () => {
    // Chained call over meerdere regels, evt. met tussenliggende comments:
    // `.from('budgets')` ... `.upsert(`.
    const chainedUpsert = /\.from\(\s*['"]budgets['"]\s*\)[\s\S]{0,300}?\.upsert\(/
    expect(source).not.toMatch(chainedUpsert)
  })

  it('bevat geen insert op tabel `budgets` vanuit de client (server-side only, ADR 0058)', () => {
    const chainedInsert = /\.from\(\s*['"]budgets['"]\s*\)[\s\S]{0,300}?\.insert\(/
    expect(source).not.toMatch(chainedInsert)
  })

  it('bevat niet meer de kapotte on_conflict-kolomcombinatie', () => {
    expect(source).not.toMatch(/onConflict:\s*['"]user_id,\s*slug['"]/)
  })

  it('loadBudgets valt bij een lege set door naar setBudgets([]) zonder tussenliggende schrijf-call', () => {
    // Extract het lichaam van `loadBudgets` (van declaratie tot de
    // afsluitende dependency-array van de useCallback).
    const match = source.match(
      /const loadBudgets = useCallback\(async \(signal\?: AbortSignal\) => \{([\s\S]*?)\n {2}\}, \[perspective, partnerPrivacy, mySharePct, budgetModel\]\)/,
    )
    expect(match, 'kon loadBudgets-functielichaam niet vinden — is de functie hernoemd?').not.toBeNull()
    const body = match![1]
    expect(body).toMatch(/setBudgets\(tree\)/)
    expect(body).not.toMatch(/\.upsert\(/)
    expect(body).not.toMatch(/\.insert\(/)
    expect(body).not.toMatch(/seedBudgets/)
  })
})

describe('budgets — geen enkele upsert(onConflict) op de expressie-index (regressie)', () => {
  /**
   * Repo-brede pin. De unieke index op `budgets` is een EXPRESSIE-index
   * (`user_id, slug, COALESCE(parent_id, '000…'::uuid)`). PostgREST's
   * `on_conflict` accepteert uitsluitend een KOLOMLIJST, dus élke
   * `.upsert(onConflict)` tegen deze tabel is principieel onbereikbaar en
   * faalt met 42P10 — een "betere onConflict-string" bestaat niet.
   * Het bewezen patroon is delete + plain `insert` (zie
   * `lib/seed-persona.ts:822-827`) of select-then-insert/update (zie
   * `app/api/toekomst-doel/route.ts:211`).
   *
   * Deze mismatch is drie keer zelfstandig herontdekt; hij is in
   * `budgets-client.tsx` én `app/(app)/beheer/testdata/page.tsx` blijven
   * zitten tot augustus 2026. Vandaar de brede scan i.p.v. één bestand.
   */
  const ROOTS = ['app', 'components', 'lib', 'scripts']
  const SELF = path.resolve(__filename)

  function collect(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue
        collect(full, out)
      } else if (/\.(ts|tsx|mjs)$/.test(entry.name) && path.resolve(full) !== SELF) {
        out.push(full)
      }
    }
    return out
  }

  const files = ROOTS.flatMap((r) => {
    const dir = path.join(process.cwd(), r)
    return fs.existsSync(dir) ? collect(dir) : []
  })

  it('scant een niet-triviaal aantal bronbestanden', () => {
    // Vangt een stukgelopen collector af: zonder deze check zouden de
    // asserties hieronder groen blijven op een lege bestandslijst.
    expect(files.length).toBeGreaterThan(100)
  })

  it('nergens een upsert op tabel `budgets`', () => {
    const chainedUpsert = /\.from\(\s*['"]budgets['"]\s*\)[\s\S]{0,300}?\.upsert\(/
    const offenders = files.filter((f) => chainedUpsert.test(fs.readFileSync(f, 'utf-8')))
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([])
  })

  it("nergens de kapotte conflict-kolomcombinatie 'user_id, slug'", () => {
    const broken = /onConflict:\s*['"]user_id,\s*slug['"]/
    const offenders = files.filter((f) => broken.test(fs.readFileSync(f, 'utf-8')))
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([])
  })
})
