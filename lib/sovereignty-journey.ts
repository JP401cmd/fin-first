// ── Soevereiniteitsreis — gedeelde metadata (één bron) ───────────────────────
// Namen, motivatie en criteria van de niveau-reis (Jouw Pad). Dit is de
// motivatielaag (ADR 0001): het niveau gate't GEEN functionaliteit — het duidt
// waar je staat op de weg naar vrijheid. Zichtbaarheid = module-activatie.
//
// Voorheen stonden LEVEL_NAMES / criteria gekopieerd in de Jouw Pad-widget
// (en deels de /mijn-pagina). Deze module maakt ze single-source, zodat de
// drempels niet uiteen kunnen lopen met `computeSovereigntyLevel`
// (`lib/feature-phases.ts`).

// ── Niveau-namen (−2 → 6) ─────────────────────────────────────
export const LEVEL_NAMES: Record<number, string> = {
  [-2]: 'Tijdtekort',
  [-1]: 'Tijdverlies',
  0:    'Het Reset-punt',
  1:    'Tijdbuffer',
  2:    'Tijdschild',
  3:    'Tijdinvesteerder',
  4:    'Tijdvermenigvuldiger',
  5:    'Tijdssoeverein',
  6:    'Tijdloos',
}

// ── Wat het volgende niveau betekent (motivatie, GEEN feature-gate) ──────────
// Gekeyd op het HUIDIGE niveau: de tekst beschrijft wat het bereiken van
// niveau+1 op de vrijheidsreis betekent. Bewust geframed als betekenis/mijlpaal
// ("Geld is opgeslagen tijd"), niet als "ontgrendelt functie X" — dat zou een
// feature-gate suggereren die sinds ADR 0001 niet meer bestaat.
export const NEXT_LEVEL_MOTIVATION: Record<number, string> = {
  [-2]: 'Grip terugkrijgen op je uitgaven',
  [-1]: 'Uit de rode cijfers, terug op nul',
  0:    'Je eerste maand vrijheid opgebouwd',
  1:    'Een noodfonds dat je rust geeft',
  2:    'Je vermogen begint vóór je te werken',
  3:    'Vrijheid groeit sneller dan je uitgaven',
  4:    'Onafhankelijkheid komt in zicht',
  5:    'Volledige vrijheid — je tijd is van jou',
  6:    'Volledige vrijheid bereikt!',
}

// ── Criteria naar het volgende niveau ────────────────────────
// `monthsCovered` MOET de soevereiniteits-grondslag zijn (liquide pot ÷
// 3-maands tx-gemiddelde) — dezelfde noemer die `computeSovereigntyLevel`
// gebruikt (`sovereigntyMonthsCovered` uit de loader). Consumeer die, reken
// hem niet zelf op een andere noemer af, anders kan de checklist "behaald"
// tonen terwijl niveau/fase niet opschuiven.
export type SovereigntyCriterionInput = {
  netWorth: number
  monthsCovered: number
  freedomPct: number
  hasConsumerDebt: boolean
}

export type SovereigntyCriterion = {
  label: string
  check: (d: SovereigntyCriterionInput) => boolean
}

export const NEXT_LEVEL_CRITERIA: Record<number, SovereigntyCriterion[]> = {
  [-2]: [{ label: 'Consumptieve schulden afgelost', check: (d) => !d.hasConsumerDebt }],
  [-1]: [{ label: 'Vermogen ≥ €0',          check: (d) => d.netWorth >= 0 }],
  [0]:  [{ label: 'Minimaal 1 maand buffer',          check: (d) => d.monthsCovered >= 1 }],
  [1]:  [{ label: 'Minimaal 3 maanden noodfonds',     check: (d) => d.monthsCovered >= 3 }],
  [2]:  [
    { label: 'Minimaal 6 maanden buffer',            check: (d) => d.monthsCovered >= 6 },
    { label: 'Vrijheidspercentage ≥ 10%',        check: (d) => d.freedomPct >= 10 },
  ],
  [3]: [{ label: 'Vrijheidspercentage ≥ 25%',   check: (d) => d.freedomPct >= 25 }],
  [4]: [{ label: 'Vrijheidspercentage ≥ 75%',   check: (d) => d.freedomPct >= 75 }],
  [5]: [{ label: 'Vrijheidspercentage ≥ 100%',  check: (d) => d.freedomPct >= 100 }],
}
