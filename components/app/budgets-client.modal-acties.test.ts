/**
 * B-018 / B-020 / B-022 — bron-toets op de budget-overlays.
 *
 * Waarom een BRON-test en geen render-test: `BudgetsClient` is >5000 regels met
 * zware Supabase-effects en is niet in jsdom te mounten (zie de kop van
 * `budgets-client.test.tsx`, dat om dezelfde reden alleen geëxporteerde,
 * pure deel-componenten rendert). `BudgetDetailModal` en `BudgetEditModal` zijn
 * interne componenten van dat bestand. Deze toets pint daarom de plek van de
 * acties in de bron — precies de drie dingen die gemeld werden:
 *
 *  B-018  de knoppenrij onderin de budget-weergave liep op een 384px-viewport
 *         zijwaarts buiten beeld (5 knoppen in één `flex gap-2`-rij die
 *         bovendien meescrolde).
 *  B-020  de planeditor ging met een losse `useState` open, zónder
 *         history-entry: de Android-terugknop verliet daardoor de hele route
 *         (je landde op /overzicht/cashflow i.p.v. terug op /…/budget).
 *  B-022  archiveren en de vraag-aan-Fin horen elders in de modal; onderin
 *         blijven herschikken, bewerken en één knop die "Terug" heet zolang er
 *         niets gewijzigd is en "Opslaan" wordt zodra dat wel zo is.
 *
 * Precedent voor een bron-toets als vangrail: `horizon-client.euro-view.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(process.cwd(), 'components/app/budgets-client.tsx'), 'utf8')

describe('budget-weergave — acties op hun plek (B-018/B-022)', () => {
  it('zet archiveren en "vraag Fin" als header-acties, niet in de knoppenrij onderin', () => {
    expect(SOURCE).toContain('aria-label={`${budget.name} archiveren`}')
    expect(SOURCE).toContain('aria-label={`Vraag Fin om tips over ${budget.name}`}')
    // De oude, meescrollende actierij is weg — die droeg de knop met dit label.
    expect(SOURCE).not.toContain('inline-flex flex-1 items-center justify-center gap-1.5 bg-kern-600')
  })

  it('zet herschikken, bewerken en terug in de sticky pane-footer', () => {
    expect(SOURCE).toContain("primaryAction={{ label: 'Bewerken', onClick: onEdit }}")
    expect(SOURCE).toContain("secondaryAction={{ label: 'Terug', onClick: onClose }}")
    expect(SOURCE).toContain("aria-label=\"Verplaats omhoog\"")
    expect(SOURCE).toContain("aria-label=\"Verplaats omlaag\"")
  })

  it('vraagt archiveren via de canonieke confirm-overlay, niet via een blok onderin de scroll-content', () => {
    expect(SOURCE).toContain('title="Budget archiveren?"')
    expect(SOURCE).toContain('kind="confirm"')
    // Het oranje inline-blok dat vóór de fix onderaan de content stond.
    expect(SOURCE).not.toContain('border-t border-orange-200 bg-orange-50 px-6 py-4')
  })
})

describe('budget bewerken — één afsluitknop (B-018/B-022)', () => {
  it('laat de knop "Terug" heten tot er iets gewijzigd is en dan "Opslaan"', () => {
    expect(SOURCE).toContain("? { label: 'Opslaan', onClick: handleSave, disabled: !name.trim(), loading: saving }")
    expect(SOURCE).toContain(": { label: 'Terug', onClick: handleClose }}")
  })

  it('houdt die knoppen buiten de scrollende formulier-content', () => {
    expect(SOURCE).not.toContain('<div className="flex justify-end gap-2 border-t border-[var(--border-ed)] px-6 py-4">')
  })
})

describe('planeditor — terugknop blijft op de budgetpagina (B-020)', () => {
  it('leest de open-staat uit de URL en beheert een eigen history-entry', () => {
    expect(SOURCE).toContain('const showPlanEditor = searchParams.get(OVERLAY_QUERY_KEYS.planEditor)')
    expect(SOURCE).toContain('const planEditorHistory = useMemo(() => createPaneUrlHistory(router), [router])')
    // Zonder eigen entry deed de terugknop een gewone route-navigatie.
    expect(SOURCE).not.toContain('const [showPlanEditor, setShowPlanEditor] = useState(false)')
  })

  it('geeft de eigen history-entry vrij als de terugknop de sheet zelf sloot', () => {
    expect(SOURCE).toContain('if (!showPlanEditor && planEditorOpenRef.current) planEditorHistory.reset()')
  })
})
