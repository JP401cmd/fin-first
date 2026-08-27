// ── Dekkingstest exports↔catalogus (Arch F5, waarheids-vangnet 3) ───────────
// Scant top-level lib/*.ts op geëxporteerde `compute*`/`simulate*`-functies —
// de naamconventie van deze codebase voor "ruwe data → afgeleid cijfer". Elk
// bronbestand dat zo'n export draagt hoort óf in een Calculation.files[] (de
// Berekeningen-catalogus, lib/architecture/calculations.ts) óf op de expliciete
// ignore-lijst hieronder MET REDEN — zodat een nieuwe rekenmotor die niet
// gecureerd wordt, opvalt in plaats van stilzwijgend te ontbreken.
//
// Scope bewust beperkt tot top-level lib/*.ts (niet lib/**/*.ts): de meeste
// losstaande rekenmotoren staan top-level; kernel-interne tabelfuncties
// (lib/horizon-kernel/tables/*, lib/uat/*, lib/ai/context/*, KPI-subhelpers in
// geneste mappen) zouden de ignore-lijst onbeheersbaar groot maken zonder
// evenredige waarde — dat is zelf weer onderhoudslast (zie de kaart-analyse).

import * as fs from 'fs'
import * as path from 'path'
import { CALCULATIONS } from './calculations'

const EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|let)\s+(compute[A-Za-z0-9_]*|simulate[A-Za-z0-9_]*)/g

/** Top-level lib/*.ts bestanden (geen .test.ts) met minstens één compute- of simulate-export. */
export function scanTopLevelComputeFiles(root: string = process.cwd()): string[] {
  const dir = path.join(root, 'lib')
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const hits: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue
    const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
    EXPORT_RE.lastIndex = 0
    if (EXPORT_RE.test(content)) hits.push(`lib/${entry.name}`)
  }
  return hits.sort()
}

/** Bestanden uit calculations[].files, met ondersteuning voor een enkel `dir/*.ts`-jokerpatroon. */
function cataloguedFiles(): Set<string> {
  const set = new Set<string>()
  for (const c of CALCULATIONS) for (const f of c.files) set.add(f)
  return set
}

export interface CalcCoverageIgnoreEntry {
  file: string
  reason: string
}

/**
 * Bestanden met een compute- of simulate-export die BEWUST buiten de
 * Berekeningen-catalogus vallen — geen "afgeleid financieel cijfer"-motor in
 * de zin van deze catalogus (KPI-presentatie, gating, layout, dunne
 * orkestratie van een reeds-gecatalogiseerde motor, e.d.). Elke regel heeft
 * een reden; `calc-coverage.test.ts` bewaakt dat de lijst klopt.
 */
export const CALC_COVERAGE_IGNORE: CalcCoverageIgnoreEntry[] = [
  { file: 'lib/asset-data.ts', reason: 'computeExpectedAnnualAppreciation is een kleine helper binnen het assetdatamodel, geen zelfstandige rekenmotor (het model zelf leeft in de netto-vermogen-calc).' },
  { file: 'lib/asset-kpi.ts', reason: 'KPI-aggregatie voor bezittingen-kaarten — presentatielaag op reeds-gecatalogiseerde cijfers (netto vermogen), geen nieuwe rekenkern.' },
  { file: 'lib/auto-categorize.ts', reason: 'Regel-/heuristiek-gebaseerde transactiecategorisatie, geen financiële berekening.' },
  { file: 'lib/blob-layout.ts', reason: 'Puur UI-layout-algoritme voor blob-visualisaties, geen financiële berekening.' },
  { file: 'lib/bucket-projection.ts', reason: 'Legacy v2-bucket-onttrekkingsstrategie; vervangen door de horizon-kernel-onttrekkingsprofielen (zie calc "FIRE — horizon-kernel"). Bestand blijft voor achterwaartse compatibiliteit, niet meer de actieve motor.' },
  { file: 'lib/budget-forecast.ts', reason: 'Onderdeel van de budgetteringsdienst (as-budget) — prognose-weergave op basis van reeds-vastgelegde budgetten, geen nieuw afgeleid financieel cijfer op catalogusniveau.' },
  { file: 'lib/budget-period.ts', reason: 'Periode-/datumgrenzen-helper voor budgetten (rollover-vensters), geen rekenmotor.' },
  { file: 'lib/budget-plan-diff.ts', reason: 'Vergelijkt twee budgetplan-versies (diff-weergave), geen financiële berekening.' },
  { file: 'lib/budget-rollover.ts', reason: 'Rollover-saldo-doorrekening binnen de budgetteringsdienst — functionele CRUD-ondersteuning, geen nieuwe motor.' },
  { file: 'lib/category-kpi.ts', reason: 'KPI-aggregatie per categorie voor overzichtskaarten — presentatielaag, geen nieuwe rekenkern.' },
  { file: 'lib/compute-feature-access.ts', reason: 'Feature-gating-logica (sovereignty/tier), geen financiële berekening.' },
  { file: 'lib/compute-module-access.ts', reason: 'Module-gating-logica, geen financiële berekening.' },
  { file: 'lib/confidence-band.ts', reason: 'Presentatiehulp voor bandbreedte-visualisatie rond bestaande cijfers, geen eigen rekenkern.' },
  { file: 'lib/connections-data.ts', reason: 'computeFreshness is sync-statusmetadata (technische verbindingsstatus), geen financiële berekening.' },
  { file: 'lib/counterparty-analysis.ts', reason: 'Kleine helper binnen de transactie-inzichten (zie calc "Transactie-inzichten"), niet zelfstandig gecatalogiseerd.' },
  { file: 'lib/crypto-holdings-data.ts', reason: 'Portefeuille-presentatiehelpers (concentratie/spread); de Box 3-impact-tak leunt op de al-gecatalogiseerde box3-forfaitair-motor, de rest is weergave.' },
  { file: 'lib/debt-kpi.ts', reason: 'KPI-aggregatie voor schuldenkaarten — presentatielaag op de schuld-aflossingsmotor (zie calc "Schuld-aflossingsmotor").' },
  { file: 'lib/freedom-milestones.ts', reason: 'Presentatie-mijlpalen afgeleid uit reeds-gecatalogiseerde vrijheidscijfers, geen eigen rekenkern.' },
  { file: 'lib/household-data.ts', reason: 'Perspectiefverdeling (persoonlijk/huishouden/partner) — presentatielaag over reeds-gecatalogiseerde totalen, geen nieuwe rekenkern.' },
  { file: 'lib/jaarruimte-facts.ts', reason: 'Orkestreert uitsluitend de al-gecatalogiseerde jaarruimte-motor (lib/jaarruimte.ts, zie calc "box1") tot een feiten-object voor AI-context — eigen docstring: "orkestreert alleen".' },
  { file: 'lib/onboarding-completeness.ts', reason: 'Telt hoeveel van de acht onboarding-onderdelen data bevatten ("6 van 8") — een UI-volledigheidsmeting, geen afgeleid financieel cijfer: er komt geen euro, percentage of vrijheidstijd uit. Vervangt de hardgecodeerde 100% op het eindscherm (bevinding M11).' },
  { file: 'lib/onboarding-presets.ts', reason: 'Eenmalige onboarding-defaultberekening (noodfondsdoel-suggestie), geen doorlopende rekenmotor.' },
  { file: 'lib/retirement-aspirations.ts', reason: 'Aggregeert pensioenwensen tot een totaal — presentatiehelper, geen nieuwe rekenkern.' },
  { file: 'lib/settlement-data.ts', reason: 'Verrekening/afwikkeling-weergave (bv. partnersplit-overzicht), dunne afleiding op reeds-vastgelegde bedragen.' },
  { file: 'lib/strategy-preview.ts', reason: 'Preview-helper voor een strategiewijziging (dunne afleiding op bestaande scenario-uitkomsten), geen eigen rekenkern.' },
]

/**
 * Bestanden met een compute- of simulate-export die noch in een calc.files[]
 * noch op de ignore-lijst staan — een blinde vlek in de catalogus.
 */
export function findUncoveredCalcFiles(root: string = process.cwd()): string[] {
  const scanned = new Set(scanTopLevelComputeFiles(root))
  const catalogued = cataloguedFiles()
  const ignored = new Set(CALC_COVERAGE_IGNORE.map((e) => e.file))
  return [...scanned].filter((f) => !catalogued.has(f) && !ignored.has(f)).sort()
}
