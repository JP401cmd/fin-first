// ── Testfixture: één geldige modeluitvoer van de duiding ─────────────────────
//
// Gedeeld door duiding-schema.test.ts, duiding-controles.test.ts en
// duiding.test.ts. Bewust een eigen bestand (geen export uit een *.test.ts):
// vitest zou de describe-blokken van dat testbestand anders óók in elke
// importerende suite registreren.
//
// De bijbehorende bron: "Belastingdienst: het heffingsvrij vermogen in box 3
// stijgt in 2027 naar € 60.000. Het tarief blijft 36 procent." Elk getal in de
// samenvatting en de params staat daarin; de citaten zijn letterlijke fragmenten.

import type { DuidingModelUitvoer } from './duiding-schema'

export const GELDIGE_UITVOER: DuidingModelUitvoer = {
  soort: 'besloten',
  ingangsdatum: '2027-01-01',
  deadline: null,
  doelgroep: [{ veld: 'spaargeld', op: 'minstens', waarden: ['25k-50k'] }],
  mechanisme: {
    soort: 'box3-parameter',
    params: {
      jaar: 2027,
      heffingsvrij_single: 60000,
      heffingsvrij_partner: null,
      forfait_spaargeld_pct: null,
      forfait_beleggingen_pct: null,
      forfait_schulden_pct: null,
      tarief_pct: null,
    },
    drempel: 'heffingsvrij-vermogen-single',
  },
  samenvatting: 'Het heffingsvrij vermogen in box 3 gaat in 2027 naar € 60.000. Het tarief blijft 36 procent.',
  grond: [
    { param: 'jaar', citaat: 'stijgt in 2027 naar € 60.000' },
    { param: 'heffingsvrij_single', citaat: 'stijgt in 2027 naar € 60.000' },
  ],
}
